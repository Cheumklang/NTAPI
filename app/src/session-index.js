'use strict';

/**
 * The rows the sidebar needs, read from the chat files without re-reading them.
 *
 * `SessionManager.listAll()` walks every chat file from top to bottom to build
 * one row each: the name, the first thing the user said, the message count and
 * when it last moved. That is the right cost once. It is the wrong cost on every
 * open: a store with a few dozen conversations is megabytes of JSONL, and the app
 * asks for this list when the window boots, on every tab switch, and after every
 * turn.
 *
 * A chat file is append-only — entries are newline-delimited JSON and the leaf
 * pointer moves by appending — so what changed since the last read is only the
 * tail of the conversation being written. This module keeps one record per file
 * keyed by size and mtime, and after the first read parses just the bytes that
 * were added. A file that shrank or was rewritten (an export, a trim, a restored
 * backup) is read from the top again, and a file that cannot be parsed is skipped
 * exactly as the SDK skips it.
 *
 * The fields match `SessionManager`'s own read: `allMessagesText` is left out
 * because nothing in this app uses it — `session:search` reads the files itself
 * when a search is actually run.
 *
 * Pure apart from the filesystem, so it can be checked without a window:
 * see scripts/selftest-session-index.js.
 */

const fs = require('node:fs');
const path = require('node:path');

/** One record per chat file: read position, the header, and the running totals. */
const defaultCache = new Map();
const CACHE_MAX = 500;

function statOf(file) {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

/** Text content of a message entry, the same way the SDK reads it. */
function extractText(message) {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join(' ');
}

function activityOf(entry) {
  const message = entry?.message;
  if (!message || typeof message.role !== 'string' || !('content' in message)) return undefined;
  if (message.role !== 'user' && message.role !== 'assistant') return undefined;
  if (typeof message.timestamp === 'number') return message.timestamp;
  const at = new Date(entry.timestamp).getTime();
  return Number.isNaN(at) ? undefined : at;
}

/**
 * Fold newline-delimited entries into a record.
 *
 * `record.header === null` means the file has not shown its session header yet:
 * the first entry must be one, otherwise this is not a chat file at all and the
 * row is dropped (`record.invalid`), which is what the SDK does.
 */
function applyLines(record, text) {
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // A malformed line is skipped, not fatal.
    }
    if (!record.header) {
      if (entry?.type !== 'session') {
        record.invalid = true;
        return;
      }
      record.header = entry;
      continue;
    }
    if (entry?.type === 'session_info') {
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      record.name = name || undefined;
      continue;
    }
    if (entry?.type !== 'message') continue;
    record.messageCount += 1;
    const at = activityOf(entry);
    if (typeof at === 'number' && at > (record.lastActivity || 0)) record.lastActivity = at;
    if (!record.firstMessage) {
      const message = entry.message;
      if (message && message.role === 'user') {
        const textOf = extractText(message);
        if (textOf) record.firstMessage = textOf;
      }
    }
  }
}

/** Bytes [from, to) of a file. */
function readRange(file, from, to) {
  const length = to - from;
  if (length <= 0) return Buffer.alloc(0);
  const buffer = Buffer.allocUnsafe(length);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, buffer, 0, length, from);
  } finally {
    fs.closeSync(fd);
  }
  return buffer;
}

/**
 * Read a file's entries into `record`, starting at `record.offset`.
 *
 * Only whole lines are consumed: a write can land mid-line, and half a JSON
 * object would be a parse error that also throws away the line before it. The
 * offset moves to the last newline, so the unfinished line is read next time.
 */
function readInto(record, file, size) {
  const from = record.offset || 0;
  const buffer = readRange(file, from, size);
  const text = buffer.toString('utf8');
  const lastBreak = text.lastIndexOf('\n');
  if (lastBreak === -1) {
    // Not a single complete line yet: nothing to count, unless this is a
    // complete file with no trailing newline (some tools write it that way).
    if (from === 0) {
      applyLines(record, text);
      record.offset = size;
    }
    return;
  }
  applyLines(record, text.slice(0, lastBreak));
  record.offset = from + Buffer.byteLength(text.slice(0, lastBreak + 1), 'utf8');
}

function freshRecord(file) {
  return {
    path: file,
    size: 0,
    mtimeMs: 0,
    offset: 0,
    header: null,
    name: undefined,
    messageCount: 0,
    firstMessage: '',
    lastActivity: 0,
    invalid: false,
  };
}

/** The row for one chat file, re-reading no more than it has to. */
function infoFor(file, cache) {
  const stats = statOf(file);
  if (!stats || !stats.isFile()) return null;
  let record = cache.get(file);
  if (!record) {
    record = freshRecord(file);
    cache.set(file, record);
  }
  const grown = stats.size > record.offset;
  if (record.size !== stats.size || record.mtimeMs !== stats.mtimeMs) {
    if (stats.size < record.offset || (!record.header && stats.size === 0)) {
      // Rewritten smaller (or emptied): start over rather than splice.
      record = freshRecord(file);
      cache.set(file, record);
      record.size = stats.size;
      record.mtimeMs = stats.mtimeMs;
      readInto(record, file, stats.size);
    } else if (grown) {
      record.size = stats.size;
      record.mtimeMs = stats.mtimeMs;
      readInto(record, file, stats.size);
    } else {
      record.size = stats.size;
      record.mtimeMs = stats.mtimeMs;
    }
  }
  if (record.invalid) return null;
  if (!record.header) return null;

  const headerTime = typeof record.header.timestamp === 'string' ? new Date(record.header.timestamp).getTime() : NaN;
  const modified =
    record.lastActivity > 0
      ? new Date(record.lastActivity)
      : !Number.isNaN(headerTime)
      ? new Date(headerTime)
      : stats.mtime;
  return {
    path: file,
    id: record.header.id,
    cwd: typeof record.header.cwd === 'string' ? record.header.cwd : '',
    name: record.name,
    created: new Date(record.header.timestamp),
    modified,
    messageCount: record.messageCount,
    firstMessage: record.firstMessage || '(no messages)',
  };
}

/**
 * Every chat row in one history folder, newest file first.
 *
 * The order is by nothing in particular: callers re-sort by creation time, and
 * `listSessions` in the main process has done that since before this module.
 */
function readSessionInfos(dir, cache = defaultCache) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => name.endsWith('.jsonl'));
  } catch {
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const name of names) {
    const file = path.join(dir, name);
    seen.add(file);
    const info = infoFor(file, cache);
    if (info) out.push(info);
  }
  // Rows for files that are gone would keep the map growing with history the
  // user deleted. Only this folder's entries are considered: the same cache also
  // serves the "chats in another workspace" list, and pruning that here would
  // make every folder pay a full read again.
  for (const [file, record] of cache) {
    if (path.dirname(file) === dir && !seen.has(file)) cache.delete(file);
    else if (record.invalid) cache.delete(file);
  }
  if (cache.size > CACHE_MAX) {
    for (const file of cache.keys()) {
      if (cache.size <= CACHE_MAX) break;
      cache.delete(file);
    }
  }
  return out;
}

module.exports = { readSessionInfos, defaultCache, CACHE_MAX };

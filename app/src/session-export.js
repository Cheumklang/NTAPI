'use strict';

/**
 * Reading a saved chat file, for search and for export.
 *
 * A session file is JSONL written by the agent SDK: one object per line holding
 * a message, a tool call, or bookkeeping like a model change. Only the words
 * matter here, so each line is walked for the fields that carry text and the
 * rest is dropped — a snippet or an export must not show `{"type":"session_info"}`.
 */

/** Fields that hold words rather than identifiers. */
const TEXT_KEYS = new Set(['text', 'content', 'thinking', 'command', 'output']);

function collectText(value, out, depth = 0) {
  if (depth > 8 || value == null) return;
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, out, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, val] of Object.entries(value)) {
    if (typeof val === 'string') {
      if (TEXT_KEYS.has(key)) out.push(val);
    } else {
      collectText(val, out, depth + 1);
    }
  }
}

function roleOf(entry) {
  const role = entry?.message?.role || entry?.role;
  if (role === 'user' || role === 'assistant') return role;
  if (role === 'tool' || role === 'toolResult' || role === 'tool_result') return 'tool';
  if (entry?.type === 'tool_result') return 'tool';
  return null;
}

/** `[{ role: 'user'|'assistant'|'tool', text }]`, in file order. */
function parseSession(raw) {
  const messages = [];
  for (const line of String(raw || '').split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const role = roleOf(entry);
    if (!role || !entry) continue;
    const parts = [];
    collectText(entry.message || entry, parts);
    const text = parts.join('\n').trim();
    if (text) messages.push({ role, text });
  }
  return messages;
}

/** A markdown file a person can keep, mail or grep. */
function toMarkdown({ title, messages, created } = {}) {
  const head = `# ${String(title || 'Chat').trim() || 'Chat'}\n`;
  const when = created ? `\n_${created}_\n` : '';
  const body = (messages || [])
    .map((m) => {
      const who = m.role === 'user' ? 'You' : m.role === 'tool' ? 'Tool' : 'Assistant';
      return `\n## ${who}\n\n${m.text}\n`;
    })
    .join('');
  return `${head}${when}${body}`;
}

/** The line around a match, for the sidebar row that found it. */
function snippet(text, at, length, radius = 48) {
  const body = String(text || '');
  const start = Math.max(0, at - radius);
  const end = Math.min(body.length, at + length + radius);
  const cut = body.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${cut}${end < body.length ? '…' : ''}`;
}

module.exports = { parseSession, toMarkdown, snippet, TEXT_KEYS };

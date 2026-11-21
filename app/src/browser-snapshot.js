/**
 * Turn the raw DOM facts the browser extension collects into the thing the
 * agent actually reads: a short, indexed list of what can be acted on.
 *
 * The extension only reports facts (tag, type, attributes, text). Every
 * judgement — what role an element plays, what it is called, which ref it
 * gets, how much of it fits in the budget — is made here, in plain functions
 * with no DOM, so the whole thing is testable in Node.
 *
 * The refs this module hands the model are namespaced (`F2:e7`) because a
 * cross-origin frame numbers its own elements from `e1`. The extension only
 * ever sees the frame-local half.
 */
'use strict';

const DEFAULT_MAX_NODES = 300;
const DEFAULT_MAX_NAME_CHARS = 120;
const DEFAULT_MAX_CHARS = 12000;
const DEFAULT_MAX_TABLE_NODES = 1500;
const DEFAULT_FIND_MAX = 20;

const NO_ELEMENTS_TEXT = 'No interactive elements found on this page.';

/** Roles a `role` attribute may force, even on an element that is not obviously interactive. */
const KNOWN_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'combobox',
  'checkbox',
  'radio',
  'tab',
  'menuitem',
  'option',
  'heading',
  'label',
  'summary',
  'contenteditable',
  'other',
]);

const ROLE_BY_TAG = {
  a: 'link',
  button: 'button',
  select: 'combobox',
  textarea: 'textbox',
  summary: 'summary',
  option: 'option',
  label: 'label',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
};

const ROLE_BY_INPUT_TYPE = {
  checkbox: 'checkbox',
  radio: 'radio',
  submit: 'button',
  button: 'button',
  reset: 'button',
  image: 'button',
  hidden: 'other',
};

function tagOf(node) {
  return String(node.tag || '').trim().toLowerCase();
}

/** The role the agent sees: an explicit `role`, else what the tag+type implies. */
function roleOf(node) {
  if (!node || typeof node !== 'object') return 'other';
  if (node.contentEditable) return 'contenteditable';

  const roleAttr = String(node.roleAttr || '').trim().toLowerCase();
  if (roleAttr && KNOWN_ROLES.has(roleAttr)) return roleAttr;

  const tag = tagOf(node);
  if (tag === 'input') {
    const type = String(node.type || '').trim().toLowerCase();
    return ROLE_BY_INPUT_TYPE[type] || 'textbox';
  }
  return ROLE_BY_TAG[tag] || 'other';
}

/** Cut at `max` without splitting a surrogate pair (emoji survive intact). */
function cutChars(value, max) {
  const text = typeof value === 'string' ? value : '';
  if (!Number.isFinite(max) || max < 0 || text.length <= max) return text;
  const head = text.slice(0, max);
  const last = head.charCodeAt(head.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) return head.slice(0, -1);
  return head;
}

function collapse(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

/** What the element is called, best source first, already trimmed and cut. */
function nameOf(node, maxChars = DEFAULT_MAX_NAME_CHARS) {
  if (!node || typeof node !== 'object') return '';
  const candidates = [node.ariaLabel, node.labelText, node.placeholder, node.value, node.text];
  for (const candidate of candidates) {
    const text = collapse(candidate);
    if (text) return cutChars(text, maxChars);
  }
  return '';
}

/** `('F2', 'e7') -> 'F2:e7'`; the main frame keeps the bare ref. */
function namespaceRef(frameId, ref) {
  const frame = typeof frameId === 'string' ? frameId : '';
  const id = typeof ref === 'string' ? ref : '';
  if (!frame) return id;
  return `${frame}:${id}`;
}

/** Inverse of `namespaceRef`; anything without a colon is main-frame. */
function parseRef(ref) {
  const text = typeof ref === 'string' ? ref : '';
  const at = text.indexOf(':');
  if (at < 0) return { frameId: '', ref: text };
  return { frameId: text.slice(0, at), ref: text.slice(at + 1) };
}

function frameLabel(frameId) {
  return frameId || 'main';
}

function indentFor(node) {
  const depth = node && Number.isFinite(node.depth) ? Math.max(0, Math.trunc(node.depth)) : 0;
  return '  '.repeat(Math.min(depth, 6));
}

/**
 * Render a snapshot: namespaced refs, a ref table over every collected node,
 * and the budgeted text the model reads.
 *
 * Returns `{ text, table, shown, total, truncated }`. `table` is a `Map` keyed
 * by namespaced ref, so `browser_find` can reach elements that did not fit in
 * `text`.
 */
function formatSnapshot(raw, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const maxNodes = Number.isFinite(opts.maxNodes) ? opts.maxNodes : DEFAULT_MAX_NODES;
  const maxNameChars = Number.isFinite(opts.maxNameChars) ? opts.maxNameChars : DEFAULT_MAX_NAME_CHARS;
  const maxChars = Number.isFinite(opts.maxChars) ? opts.maxChars : DEFAULT_MAX_CHARS;
  const maxTableNodes = Number.isFinite(opts.maxTableNodes) ? opts.maxTableNodes : DEFAULT_MAX_TABLE_NODES;

  const source = raw && typeof raw === 'object' ? raw : {};
  const frames = Array.isArray(source.frames) ? source.frames : [];
  const nodes = Array.isArray(source.nodes) ? source.nodes : [];

  const table = new Map();
  for (const node of nodes.slice(0, Math.max(0, maxTableNodes))) {
    if (!node || typeof node !== 'object') continue;
    const ref = namespaceRef(node.frameId || '', node.ref || '');
    if (!ref) continue;
    table.set(ref, {
      ref,
      frameId: node.frameId || '',
      role: roleOf(node),
      name: nameOf(node, maxNameChars),
      value: typeof node.value === 'string' ? node.value : '',
    });
  }

  // A hidden file input is the one element an upload needs and the one the tree
  // cannot show, so its existence is stated instead of left to be discovered.
  const fileInputs = source.fileInputs && typeof source.fileInputs === 'object' ? source.fileInputs : null;
  const notes = [];
  if (fileInputs && fileInputs.total > 0) {
    const hidden = Number(fileInputs.hidden) > 0 ? `, ${fileInputs.hidden} hidden` : '';
    notes.push(
      `file inputs: ${fileInputs.total}${hidden}. browser_upload fills them by itself — pass files; add text/selector only when the page has no input until its upload button is pressed.`,
    );
  }

  if (!nodes.length) {
    return {
      text: [NO_ELEMENTS_TEXT, ...notes].join('\n'),
      table,
      shown: 0,
      total: 0,
      truncated: false,
    };
  }

  const shown = Math.max(0, Math.min(nodes.length, maxNodes));
  const byFrame = new Map();
  for (const node of nodes.slice(0, shown)) {
    if (!node || typeof node !== 'object') continue;
    const frameId = node.frameId || '';
    if (!byFrame.has(frameId)) byFrame.set(frameId, []);
    byFrame.get(frameId).push(node);
  }

  const urlOf = (frameId) => {
    const found = frames.find((frame) => frame && (frame.frameId || '') === frameId);
    return found && found.url ? String(found.url) : '';
  };

  const lines = [];
  for (const [frameId, list] of byFrame) {
    const url = urlOf(frameId);
    lines.push(`frame ${frameLabel(frameId)}${url ? `   ${url}` : ''}`);
    for (const node of list) {
      const ref = namespaceRef(node.frameId || '', node.ref || '');
      if (!ref) continue;
      lines.push(`${indentFor(node)}${ref} [${roleOf(node)}] "${nameOf(node, maxNameChars)}"`);
    }
  }

  const notice = `… truncated: showing ${shown} of ${nodes.length} elements. Use browser_find to reach the rest.`;
  const bodyBudget = Math.max(0, maxChars - notice.length);

  let body = '';
  let used = 0;
  for (const line of lines) {
    const next = used === 0 ? line : `${body}\n${line}`;
    if (next.length > bodyBudget) break;
    body = next;
    used += 1;
  }

  const truncated = nodes.length > shown || used < lines.length;
  if (truncated) body = body ? `${body}\n${notice}` : notice;

  return {
    text: [cutChars(body, maxChars), ...notes].filter(Boolean).join('\n'),
    table,
    shown,
    total: nodes.length,
    truncated,
  };
}

/**
 * Search a ref table for `browser_find`.
 *
 * `text` matches the accessible name (or the value) case-insensitively;
 * `ref` looks one element up exactly. `count` is every match found, while
 * `matches` is capped at `max`.
 */
function findInTable(table, query = {}) {
  const empty = { matches: [], count: 0 };
  if (!table || typeof table.size !== 'number' || table.size === 0) return empty;

  const q = query && typeof query === 'object' ? query : {};
  const needle = typeof q.text === 'string' ? q.text.trim().toLowerCase() : '';
  const wantRef = typeof q.ref === 'string' ? q.ref.trim() : '';
  if (!needle && !wantRef) return empty;

  const max = Number.isFinite(q.max) && q.max > 0 ? Math.trunc(q.max) : DEFAULT_FIND_MAX;
  const matches = [];
  let count = 0;

  for (const entry of table.values()) {
    if (!entry) continue;
    const hit = wantRef
      ? entry.ref === wantRef
      : `${entry.name || ''}\u0000${entry.value || ''}`.toLowerCase().includes(needle);
    if (!hit) continue;
    count += 1;
    if (matches.length < max) matches.push({ ref: entry.ref, role: entry.role, name: entry.name });
  }

  return { matches, count };
}

module.exports = {
  roleOf,
  nameOf,
  namespaceRef,
  parseRef,
  formatSnapshot,
  findInTable,
  NO_ELEMENTS_TEXT,
  DEFAULT_MAX_NODES,
  DEFAULT_MAX_NAME_CHARS,
  DEFAULT_MAX_CHARS,
  DEFAULT_MAX_TABLE_NODES,
};

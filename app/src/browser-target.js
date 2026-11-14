/**
 * Turning a `ref` the model read in a snapshot back into something the browser
 * can act on, and remembering which refs are still live.
 *
 * A ref is a promise: "element e9 is where I said it was". The page can be
 * anything, so a ref that is no longer in the latest snapshot — or that was
 * never a ref at all — must fail loudly rather than resolve to whatever now
 * sits in that position. That is this module's whole job.
 */
'use strict';

/** Refs the snapshot module generates: `e12`, `F2:e7`. Nothing else. */
const REF_PATTERN = /^[A-Za-z0-9_:-]{1,64}$/;

/** One table per tab, from that tab's most recent snapshot. */
function createRefTables() {
  const tables = new Map();
  return {
    remember(tabId, table) {
      if (Number.isInteger(tabId) && table) tables.set(tabId, table);
    },
    tableFor(tabId) {
      return tables.get(tabId) || null;
    },
    clear(tabId) {
      if (tabId === undefined) tables.clear();
      else tables.delete(tabId);
    },
  };
}

/** The attribute the collector stamped, as CSS the page can be queried with. */
function refSelector(ref) {
  const clean = String(ref === undefined || ref === null ? '' : ref).replace(/[^A-Za-z0-9_:-]/g, '');
  return `[data-ntapi-ref="${clean}"]`;
}

/**
 * Resolve a tool call's `ref` against the table from the last snapshot.
 *
 * Returns `{ ok: true, args }` with the ref replaced by a selector (and the
 * frame it lives in), or `{ ok: false, code, message }`. On failure `args` is
 * absent, so there is nothing a caller could accidentally dispatch.
 */
function resolveRefArgs(args, table) {
  const input = args && typeof args === 'object' ? { ...args } : {};
  const ref = typeof input.ref === 'string' ? input.ref.trim() : '';
  if (!ref) return { ok: true, args: input };

  if (!REF_PATTERN.test(ref)) {
    return {
      ok: false,
      code: 'STALE_REF',
      message: `"${ref.slice(0, 40)}" is not a reference from a snapshot. Take a fresh snapshot before acting.`,
    };
  }

  const entry = table && typeof table.get === 'function' ? table.get(ref) : null;
  if (!entry) {
    return {
      ok: false,
      code: 'STALE_REF',
      message: `Ref ${ref} is not in the latest snapshot for this tab. Take a fresh snapshot before acting.`,
    };
  }

  delete input.ref;
  input.selector = refSelector(ref);
  if (entry.frameId) input.frameId = entry.frameId;
  return { ok: true, args: input, ref, role: entry.role, name: entry.name };
}

module.exports = { REF_PATTERN, createRefTables, refSelector, resolveRefArgs };

'use strict';

/**
 * Plan tags for every catalog the picker shows.
 *
 * The picker used to drop anything that was not DeepSeek, and then anything
 * that was not free. That kept the dropdown short, but it also kept the paid
 * models out of reach. It now lists every model each provider serves and marks
 * each one `free` or `paid`, so the choice belongs to the person using the app.
 *
 * Where the flag comes from, in order of trust:
 *   1. an explicit `plan` on the entry — Zro and NVIDIA publish no price in
 *      their model list, so their catalogs state it here;
 *   2. FreePi's own `free: true|false` (paid routes carry a `usage_x` cost
 *      multiplier such as "18" or "295");
 *   3. a `:free` id suffix — how Token Harbor marks its free routes;
 *   4. Coarena's `pricing` block, where zero on both sides means free.
 * A model with no signal at all counts as free, which is the honest reading for
 * a catalog that only lists free routes.
 *
 * `planNote` is the short "what this costs" hint on a paid row. It is either a
 * literal taken from the catalog (`18x`, `$0.30/$1.10`) or one of the codes the
 * renderer localises: `credit`, `daily`, `trial`.
 */

const DEEPSEEK_PATTERN = /deepseek/i;

/** @param {{id?: string, name?: string}} model */
function isDeepSeekModel(model) {
  const id = String(model?.id || '');
  const name = String(model?.name || '');
  return DEEPSEEK_PATTERN.test(id) || DEEPSEEK_PATTERN.test(name);
}

/**
 * @param {{plan?: string, free?: boolean, id?: string, pricing?: object}} model
 * @returns {'free'|'paid'}
 */
function planOf(model) {
  if (!model) return 'free';
  if (model.plan === 'paid' || model.plan === 'free') return model.plan;
  if (model.free === false) return 'paid';
  if (model.free === true) return 'free';
  if (typeof model.id === 'string' && model.id.endsWith(':free')) return 'free';
  const pricing = model.pricing;
  if (pricing) {
    if (Number(pricing.prompt) > 0 || Number(pricing.completion) > 0) return 'paid';
  }
  return 'free';
}

/** True while an entry is on the unlimited / zero-cost lane. */
function isFreeModel(model) {
  return planOf(model) === 'free';
}

/** `$0.30/$1.10` — input/output dollars per 1M tokens. */
function priceNote(pricing) {
  const fmt = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? `$${n.toFixed(2)}` : '';
  };
  const input = fmt(pricing?.prompt);
  const output = fmt(pricing?.completion);
  if (!input && !output) return '';
  return `${input}/${output}`;
}

/** Short cost hint for a paid row; '' when the entry is free or unpriced. */
function planNote(model) {
  if (planOf(model) !== 'paid') return '';
  if (typeof model.planNote === 'string' && model.planNote) return model.planNote;
  const x = model.usage_x;
  if (x !== undefined && x !== null && String(x).trim() !== '') return `${String(x).trim()}x`;
  return priceNote(model.pricing);
}

/**
 * Every entry, tagged with `plan` and `planNote`. Nothing is dropped: this
 * labels a catalog, it does not filter one.
 *
 * @param {Array<object>} models
 * @returns {Array<object>} entries carrying `plan` and `planNote`; never null.
 */
function tagPlans(models) {
  return (Array.isArray(models) ? models : [])
    .filter((model) => model && model.id)
    .map((model) => ({ ...model, plan: planOf(model), planNote: planNote(model) }));
}

module.exports = {
  isDeepSeekModel,
  isFreeModel,
  planOf,
  planNote,
  tagPlans,
  DEEPSEEK_PATTERN,
};

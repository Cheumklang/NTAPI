'use strict';

/**
 * Two user preferences, applied to every catalog: DeepSeek, and free only.
 *
 * FreePi's catalog carries coder and assistant models from other families, and
 * Coarena carries a dozen Claude / Gemini / GLM / Kimi ids. The person using
 * this app only ever picks DeepSeek, so the rest is noise in the dropdown. The
 * filter runs on the catalog *before* a provider is registered, which keeps the
 * picker, the provider config and `planProviders` looking at the same list.
 *
 * It is a display choice, not a capability limit: nothing prevents a future
 * preference toggle from calling these with a different predicate.
 *
 * A model counts as DeepSeek when its id or its display name says so, because
 * the two catalogs are not spelled the same way — FreePi ids look like
 * `deepseek/deepseek-v4-flash`, Coarena's like `deepseek-v4-1-flash-1017`.
 */

const DEEPSEEK_PATTERN = /deepseek/i;

/** @param {{id?: string, name?: string}} model */
function isDeepSeekModel(model) {
  const id = String(model?.id || '');
  const name = String(model?.name || '');
  return DEEPSEEK_PATTERN.test(id) || DEEPSEEK_PATTERN.test(name);
}

/**
 * @param {Array<{id?: string, name?: string}>} models
 * @returns {Array} the DeepSeek entries, order preserved; never null.
 */
function onlyDeepSeek(models) {
  return (Array.isArray(models) ? models : []).filter(isDeepSeekModel);
}

/**
 * FreePi marks each route: `free: true` for the unlimited ones and
 * `free: false` with a `usage_x` cost multiplier (`~18x usage`, `~295x usage`)
 * for the metered ones. The person using this app only wants the free lane, so
 * a route that spends credits is dropped even when it is a DeepSeek id.
 *
 * A missing field counts as free. The offline fallback entry is built by this
 * app rather than served by FreePi and carries no cost fields, and Coarena
 * normalises its catalog down to id / name / limits, so neither can prove a
 * route is paid. Only an explicit `free: false` is treated as paid.
 */
function isFreeModel(model) {
  return model?.free !== false;
}

/**
 * DeepSeek *and* free.
 *
 * @param {Array<object>} models
 * @returns {Array} the entries worth showing; never null.
 */
function onlyDeepSeekFree(models) {
  return (Array.isArray(models) ? models : []).filter((m) => isDeepSeekModel(m) && isFreeModel(m));
}

module.exports = { isDeepSeekModel, isFreeModel, onlyDeepSeek, onlyDeepSeekFree, DEEPSEEK_PATTERN };

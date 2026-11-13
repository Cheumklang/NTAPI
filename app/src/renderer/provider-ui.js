/**
 * Provider presentation helpers for FreePi Desktop.
 *
 * Dependency-free and CSP-safe: loaded as a plain classic script before app.js,
 * it exposes pure functions only and never touches the DOM. It is also loadable
 * from Node so the renderer rules can be tested without Electron (see
 * scripts/selftest-provider-ui.js).
 *
 * Two providers can be registered in one session: FreePi (`free-pi`,
 * `free-pi-defense`) and Coarena (`coarena`). Ads and the FreePi usage meter
 * belong to FreePi; Coarena shows its own limits meter instead.
 */
(function (root) {
  'use strict';

  const FREE_PI_PROVIDERS = new Set(['free-pi', 'free-pi-defense']);
  const COARENA_PROVIDER = 'coarena';
  const SEPARATOR = ' \u00b7 ';

  /** Human-facing provider name; unknown providers pass through unchanged. */
  function providerLabel(provider) {
    if (FREE_PI_PROVIDERS.has(provider)) return 'FreePi';
    if (provider === COARENA_PROVIDER) return 'Coarena';
    return String(provider || '');
  }

  /** True for the FreePi provider ids (the ones that carry ads and usage). */
  function isFreePiProvider(provider) {
    return FREE_PI_PROVIDERS.has(provider);
  }

  /** One line for a model dropdown option: `Coarena · Claude Fable 5`. */
  function modelOptionLabel(model) {
    const provider = providerLabel(model?.provider);
    const name = model?.name || model?.id || '';
    if (!provider) return String(name);
    return name ? `${provider}${SEPARATOR}${name}` : provider;
  }

  /** Which provider-specific chrome is visible for the active model. */
  function providerChrome(model) {
    const provider = model?.provider;
    if (isFreePiProvider(provider)) return { showAds: true, showCoarenaMeter: false };
    if (provider === COARENA_PROVIDER) return { showAds: false, showCoarenaMeter: true };
    return { showAds: false, showCoarenaMeter: false };
  }

  /** Compact limits line: `30/min · 2 at once · 4 today`. */
  function coarenaMeterText(info) {
    if (!info) return '';
    const limits = info.limits || {};
    const usage = info.usageToday || {};
    const parts = [];
    if (Number.isFinite(limits.requestsPerMinute)) parts.push(`${limits.requestsPerMinute}/min`);
    if (Number.isFinite(limits.concurrency)) parts.push(`${limits.concurrency} at once`);
    if (Number.isFinite(usage.requests)) parts.push(`${usage.requests} today`);
    return parts.join(SEPARATOR);
  }

  /**
   * Turn a leading `@skill` into the `/skill:name` command pi expands.
   *
   * pi only expands the command at the start of a prompt, so a mention later in
   * the sentence stays literal. The name must be a whole word and match an
   * installed skill: `@src/app.js` is a file, `@cavemanx` is not `caveman`.
   */
  function resolveSkillMention(text, skills) {
    const value = String(text || '');
    const match = /^@([A-Za-z0-9._-]+)(?=$|\s)/.exec(value);
    if (!match) return value;
    const wanted = match[1].toLowerCase();
    const skill = (Array.isArray(skills) ? skills : []).find(
      (entry) => String(entry?.name || '').toLowerCase() === wanted
    );
    if (!skill) return value;
    return `/skill:${skill.name}${value.slice(match[0].length)}`;
  }

  root.FPProvider = {
    providerLabel,
    isFreePiProvider,
    modelOptionLabel,
    providerChrome,
    coarenaMeterText,
    resolveSkillMention,
  };
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * Provider presentation helpers for FreePi Desktop.
 *
 * Dependency-free and CSP-safe: loaded as a plain classic script before app.js,
 * it exposes pure functions only and never touches the DOM. It is also loadable
 * from Node so the renderer rules can be tested without Electron (see
 * scripts/selftest-provider-ui.js).
 *
 * Four providers can be registered in one session: FreePi (`free-pi`,
 * `free-pi-defense`), Coarena (`coarena`), Zro (`zro`) and NVIDIA (`nvidia`).
 * Ads and the FreePi usage meter belong to FreePi; the keyed providers show
 * their own meter instead.
 */
(function (root) {
  'use strict';

  const FREE_PI_PROVIDERS = new Set(['free-pi', 'free-pi-defense']);
  const COARENA_PROVIDER = 'coarena';
  const ZRO_PROVIDER = 'zro';
  const NVIDIA_PROVIDER = 'nvidia';
  const TOKENHARBOR_PROVIDER = 'tokenharbor';
  const SEPARATOR = ' \u00b7 ';

  /** Bundled marks, resolved relative to the renderer page. */
  const PROVIDER_LOGOS = {
    'free-pi': 'assets/providers/freepi.svg',
    'free-pi-defense': 'assets/providers/freepi.svg',
    coarena: 'assets/providers/coarena.svg',
    zro: 'assets/providers/zro.svg',
    nvidia: 'assets/providers/nvidia.svg',
    tokenharbor: 'assets/providers/tokenharbor.svg',
  };

  /** Human-facing provider name; unknown providers pass through unchanged. */
  function providerLabel(provider) {
    // The FreePi backend is the app's own free lane, so it is shown under the
    // product name. The provider id stays `free-pi`: it is what the backend and
    // the saved settings use.
    if (FREE_PI_PROVIDERS.has(provider)) return 'NTAPI';
    if (provider === COARENA_PROVIDER) return 'Coarena';
    if (provider === ZRO_PROVIDER) return 'Zro';
    if (provider === NVIDIA_PROVIDER) return 'NVIDIA';
    if (provider === TOKENHARBOR_PROVIDER) return 'Token Harbor';
    return String(provider || '');
  }

  /** True for the FreePi provider ids (the ones that carry ads and usage). */
  function isFreePiProvider(provider) {
    return FREE_PI_PROVIDERS.has(provider);
  }

  /** Bundled logo for a provider, relative to index.html; '' when unknown. */
  function providerLogoPath(provider) {
    return PROVIDER_LOGOS[provider] || '';
  }

  /** One letter for an unknown provider, so a group never renders logo-less. */
  function providerInitial(provider) {
    const label = providerLabel(provider);
    return label ? label.slice(0, 1).toUpperCase() : '?';
  }

  /**
   * Group a flat catalog by the name the user sees: one FreePi section for both
   * `free-pi` ids, then Coarena, then Zro. Order follows the catalog, so the
   * default provider stays on top.
   */
  function groupModelsByProvider(models) {
    const groups = [];
    const byLabel = new Map();
    for (const model of Array.isArray(models) ? models : []) {
      if (!model || !model.id) continue;
      const label = providerLabel(model.provider) || 'Models';
      let group = byLabel.get(label);
      if (!group) {
        group = { label, provider: model.provider, logo: providerLogoPath(model.provider), models: [] };
        byLabel.set(label, group);
        groups.push(group);
      }
      if (!group.logo) group.logo = providerLogoPath(model.provider);
      group.models.push(model);
    }
    return groups;
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
    if (isFreePiProvider(provider)) return { showAds: true, meter: null };
    if (provider === COARENA_PROVIDER) return { showAds: false, meter: 'coarena' };
    if (provider === ZRO_PROVIDER) return { showAds: false, meter: 'zro' };
    if (provider === NVIDIA_PROVIDER) return { showAds: false, meter: 'nvidia' };
    if (provider === TOKENHARBOR_PROVIDER) return { showAds: false, meter: 'tokenharbor' };
    return { showAds: false, meter: null };
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

  const IMAGE_PATH_RE = /(?:[A-Za-z]:[\\/]|\/)?[^\s"'<>|]+?\.(?:png|jpe?g|webp|gif)\b/gi;

  /**
   * Image paths mentioned in a message, in order, at most three.
   *
   * Deliberately conservative: only tokens that end in a known image extension,
   * no URLs or data URIs, no trailing punctuation. The caller still validates
   * each path against the workspace before reading it.
   */
  function extractImagePaths(text) {
    const out = [];
    const seen = new Set();
    for (const match of String(text || '').matchAll(IMAGE_PATH_RE)) {
      const candidate = match[0].replace(/^[('"`]+/, '').replace(/[).,;:'"`!?]+$/, '');
      if (!candidate) continue;
      if (/^https?:/i.test(candidate) || candidate.includes('://') || /^data:/i.test(candidate)) continue;
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      out.push(candidate);
      if (out.length === 3) break;
    }
    return out;
  }

  root.FPProvider = {
    providerLabel,
    isFreePiProvider,
    providerLogoPath,
    providerInitial,
    groupModelsByProvider,
    modelOptionLabel,
    providerChrome,
    coarenaMeterText,
    resolveSkillMention,
    extractImagePaths,
  };
})(typeof window !== 'undefined' ? window : globalThis);

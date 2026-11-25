'use strict';

/**
 * Which saved provider keys this session cannot read.
 *
 * A key file is encrypted with the operating system's keystore (safeStorage:
 * the GNOME keyring on Linux, DPAPI on Windows). When that keystore changes —
 * a recreated login keyring, a copied data folder, a keyring password reset —
 * the file still says "configured", but decrypting it fails. The providers that
 * depended on it then drop out of the model picker with no explanation at all,
 * which reads to the person using the app as "all my providers disappeared".
 *
 * This module is the answer to that silence: it takes the status of every key
 * store and names the ones that are present but unreadable, so the window can
 * say so and point at Settings instead of quietly losing them.
 *
 * Pure functions, no Electron and no disk: the store object is passed in.
 */

/** Provider ids in the order the Settings panel lists them. */
const PROVIDER_LABELS = {
  coarena: 'Coarena',
  zro: 'Zro',
  nvidia: 'NVIDIA',
  tokenharbor: 'Token Harbor',
  llm7: 'LLM7.io',
  deepseek: 'DeepSeek',
  anthropic: 'Claude',
  google: 'Gemini',
  kilo: 'Kilo',
};

/**
 * Names of the providers whose saved key exists but cannot be decrypted.
 *
 * A provider with no key file at all is NOT reported: that is a normal first
 * run, not a loss. Neither is a key that decrypts — only the in-between state,
 * where the app owes the person an explanation.
 *
 * @param {Array<{ provider: string, status: object|null }>} entries
 * @returns {Array<{ provider: string, label: string, error: string }>}
 */
function unreadableProviders(entries) {
  if (!Array.isArray(entries)) return [];
  const out = [];
  for (const entry of entries) {
    const provider = entry && typeof entry.provider === 'string' ? entry.provider : '';
    const status = entry && entry.status;
    if (!provider || !status) continue;
    if (status.configured !== true || status.readable === true) continue;
    out.push({
      provider,
      label: PROVIDER_LABELS[provider] || provider,
      // 'undecryptable' (the OS keystore changed) or 'corrupt' (the file was
      // damaged). The window only needs the difference for its own wording.
      error: typeof status.error === 'string' ? status.error : 'undecryptable',
    });
  }
  return out;
}

/** Comma-separated labels, the shape the notice string interpolates. */
function unreadableLabelList(entries) {
  return unreadableProviders(entries)
    .map((item) => item.label)
    .join(', ');
}

module.exports = { PROVIDER_LABELS, unreadableProviders, unreadableLabelList };

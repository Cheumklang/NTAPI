'use strict';

/**
 * Which providers a session can register.
 *
 * The bridge used to assume FreePi was always there: no credentials meant no
 * session at all. With Coarena added, a session has to work with either
 * provider, or with both, and the rest of the bridge decides from this one
 * plain object what to register, which tools to offer and whether ads exist.
 *
 * Pure on purpose: no SDK, no network, no fs. The tests pin down the states the
 * UI can be in (any combination of FreePi, Coarena, Zro and NVIDIA).
 */

const FREE_PI_PROVIDER = 'free-pi';
const COARENA_PROVIDER = 'coarena';
const ZRO_PROVIDER = 'zro';
const NVIDIA_PROVIDER = 'nvidia';
const TOKENHARBOR_PROVIDER = 'tokenharbor';
const ROUTEWAY_PROVIDER = 'routeway';
const PREFERRED_FREE_PI_MODEL = 'deepseek-v4.1-flash';

/**
 * Tools that live on the FreePi backend. They stay registered only while
 * FreePi is available; a Coarena-only session must not offer them.
 */
const FREE_PI_TOOL_NAMES = ['web_search', 'docs_lookup', 'generate_image', 'free_pi_usage', 'look_at_image'];

/**
 * @param {object} input
 * @param {boolean} input.hasFreePiAuth
 * @param {string|null} input.coarenaKey
 * @param {Array<{id: string, name?: string}>} input.freePiModels
 * @param {Array<{id: string, name?: string}>} input.coarenaModels
 * @returns {{
 *   freePi: boolean,
 *   coarena: boolean,
 *   ads: boolean,
 *   freePiTools: boolean,
 *   defaultProvider: 'free-pi'|'coarena'|'zro'|'nvidia'|'tokenharbor'|'routeway'|null,
 *   defaultModel: string|null,
 *   available: boolean,
 * }}
 */
function planProviders({
  hasFreePiAuth,
  coarenaKey,
  zroKey,
  nvidiaKey,
  tokenharborKey,
  routewayKey,
  freePiModels,
  coarenaModels,
  zroModels,
  nvidiaModels,
  tokenharborModels,
  routewayModels,
}) {
  const freePiList = Array.isArray(freePiModels) ? freePiModels : [];
  const coarenaList = Array.isArray(coarenaModels) ? coarenaModels : [];
  const zroList = Array.isArray(zroModels) ? zroModels : [];
  const nvidiaList = Array.isArray(nvidiaModels) ? nvidiaModels : [];
  const tokenharborList = Array.isArray(tokenharborModels) ? tokenharborModels : [];
  const routewayList = Array.isArray(routewayModels) ? routewayModels : [];

  // A key with no catalog is not a usable provider: the model dropdown would be
  // empty and a session could not pick a model at all.
  const freePi = Boolean(hasFreePiAuth) && freePiList.length > 0;
  const coarena = Boolean(coarenaKey) && coarenaList.length > 0;
  const zro = Boolean(zroKey) && zroList.length > 0;
  const nvidia = Boolean(nvidiaKey) && nvidiaList.length > 0;
  const tokenharbor = Boolean(tokenharborKey) && tokenharborList.length > 0;
  const routeway = Boolean(routewayKey) && routewayList.length > 0;

  let defaultProvider = null;
  let defaultModel = null;

  if (freePi) {
    defaultProvider = FREE_PI_PROVIDER;
    const preferred = freePiList.find((m) => m.id === PREFERRED_FREE_PI_MODEL);
    // The catalog can drop the model this app was tuned against; then the first
    // entry is the honest default rather than a dead id.
    defaultModel = preferred ? preferred.id : freePiList[0].id;
  } else if (coarena) {
    defaultProvider = COARENA_PROVIDER;
    defaultModel = coarenaList[0].id;
  } else if (zro) {
    defaultProvider = ZRO_PROVIDER;
    defaultModel = zroList[0].id;
  } else if (nvidia) {
    defaultProvider = NVIDIA_PROVIDER;
    defaultModel = nvidiaList[0].id;
  } else if (tokenharbor) {
    defaultProvider = TOKENHARBOR_PROVIDER;
    defaultModel = tokenharborList[0].id;
  } else if (routeway) {
    defaultProvider = ROUTEWAY_PROVIDER;
    // A gateway's catalog opens with whichever model it happens to list first,
    // which can be a paid one. Opening a new session on a free route is the
    // honest default; the paid rows are one click away in the picker.
    const free = routewayList.find((m) => m.plan === 'free');
    defaultModel = (free || routewayList[0]).id;
  }

  return {
    freePi,
    coarena,
    zro,
    nvidia,
    tokenharbor,
    routeway,
    ads: freePi,
    freePiTools: freePi,
    defaultProvider,
    defaultModel,
    available: freePi || coarena || zro || nvidia || tokenharbor || routeway,
  };
}

module.exports = {
  planProviders,
  FREE_PI_PROVIDER,
  COARENA_PROVIDER,
  ZRO_PROVIDER,
  NVIDIA_PROVIDER,
  TOKENHARBOR_PROVIDER,
  ROUTEWAY_PROVIDER,
  PREFERRED_FREE_PI_MODEL,
  FREE_PI_TOOL_NAMES,
};

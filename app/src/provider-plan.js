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
 * UI can be in (any combination of FreePi, Coarena, Zro, NVIDIA, Token Harbor,
 * LLM7.io, DeepSeek, Claude, Gemini, z.ai, OpenRouter, Kilo and Cloudflare).
 */

const { preferredLlm7Model } = require('./llm7');
const { preferredCloudflareModel } = require('./cloudflare');

const FREE_PI_PROVIDER = 'free-pi';
const COARENA_PROVIDER = 'coarena';
const ZRO_PROVIDER = 'zro';
const NVIDIA_PROVIDER = 'nvidia';
const TOKENHARBOR_PROVIDER = 'tokenharbor';
const LLM7_PROVIDER = 'llm7';
const DEEPSEEK_PROVIDER = 'deepseek';
const ANTHROPIC_PROVIDER = 'anthropic';
const GOOGLE_PROVIDER = 'google';
const ZAI_PROVIDER = 'zai';
const OPENROUTER_PROVIDER = 'openrouter';
const KILO_PROVIDER = 'kilo';
const CLOUDFLARE_PROVIDER = 'cloudflare';
const MISTRAL_PROVIDER = 'mistral';
const GROK_PROVIDER = 'grok';
const POLLINATIONS_PROVIDER = 'pollinations';
const PREFERRED_FREE_PI_MODEL = 'deepseek-v4.1-flash';

/**
 * Tools that live on the FreePi backend. They stay registered only while
 * FreePi is available; a Coarena-only session must not offer them.
 */
const FREE_PI_TOOL_NAMES = ['web_search', 'docs_lookup', 'generate_image', 'free_pi_usage', 'look_at_image', 'ntfy_send'];

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
 *   defaultProvider: 'free-pi'|'coarena'|'zro'|'nvidia'|'tokenharbor'|'llm7'|'deepseek'|'anthropic'|'google'|'zai'|'openrouter'|'kilo'|'cloudflare'|null,
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
  llm7Key,
  deepseekKey,
  anthropicKey,
  googleKey,
  zaiKey,
  openrouterKey,
  kiloKey,
  cloudflareKey,
  mistralKey,
  grokKey,
  pollinationsKey,
  freePiModels,
  coarenaModels,
  zroModels,
  nvidiaModels,
  tokenharborModels,
  llm7Models,
  deepseekModels,
  anthropicModels,
  googleModels,
  zaiModels,
  openrouterModels,
  kiloModels,
  cloudflareModels,
  mistralModels,
  grokModels,
  pollinationsModels,
}) {
  const freePiList = Array.isArray(freePiModels) ? freePiModels : [];
  const coarenaList = Array.isArray(coarenaModels) ? coarenaModels : [];
  const zroList = Array.isArray(zroModels) ? zroModels : [];
  const nvidiaList = Array.isArray(nvidiaModels) ? nvidiaModels : [];
  const tokenharborList = Array.isArray(tokenharborModels) ? tokenharborModels : [];
  const llm7List = Array.isArray(llm7Models) ? llm7Models : [];
  const deepseekList = Array.isArray(deepseekModels) ? deepseekModels : [];
  const anthropicList = Array.isArray(anthropicModels) ? anthropicModels : [];
  const googleList = Array.isArray(googleModels) ? googleModels : [];
  const zaiList = Array.isArray(zaiModels) ? zaiModels : [];
  const openrouterList = Array.isArray(openrouterModels) ? openrouterModels : [];
  const kiloList = Array.isArray(kiloModels) ? kiloModels : [];
  const cloudflareList = Array.isArray(cloudflareModels) ? cloudflareModels : [];
  const mistralList = Array.isArray(mistralModels) ? mistralModels : [];
  const grokList = Array.isArray(grokModels) ? grokModels : [];
  const pollinationsList = Array.isArray(pollinationsModels) ? pollinationsModels : [];

  // A key with no catalog is not a usable provider: the model dropdown would be
  // empty and a session could not pick a model at all.
  const freePi = Boolean(hasFreePiAuth) && freePiList.length > 0;
  const coarena = Boolean(coarenaKey) && coarenaList.length > 0;
  const zro = Boolean(zroKey) && zroList.length > 0;
  const nvidia = Boolean(nvidiaKey) && nvidiaList.length > 0;
  const tokenharbor = Boolean(tokenharborKey) && tokenharborList.length > 0;
  const llm7 = Boolean(llm7Key) && llm7List.length > 0;
  const deepseek = Boolean(deepseekKey) && deepseekList.length > 0;
  const anthropic = Boolean(anthropicKey) && anthropicList.length > 0;
  const google = Boolean(googleKey) && googleList.length > 0;
  const zai = Boolean(zaiKey) && zaiList.length > 0;
  const openrouter = Boolean(openrouterKey) && openrouterList.length > 0;
  const kilo = Boolean(kiloKey) && kiloList.length > 0;
  const cloudflare = Boolean(cloudflareKey) && cloudflareList.length > 0;
  const mistral = Boolean(mistralKey) && mistralList.length > 0;
  const grok = Boolean(grokKey) && grokList.length > 0;
  const pollinations = Boolean(pollinationsKey) && pollinationsList.length > 0;

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
  } else if (llm7) {
    defaultProvider = LLM7_PROVIDER;
    // A gateway's catalog opens with whichever model it happens to list first,
    // which can be a paid one, a busy one, or a reasoning model that spends the
    // whole free output cap thinking and answers with nothing. Open a new
    // session on a free model known to answer; everything else stays one click
    // away in the picker.
    defaultModel = (preferredLlm7Model(llm7List) || llm7List[0]).id;
  } else if (deepseek) {
    // Last on purpose: every provider above is free or has a free lane, and this
    // one bills a prepaid balance from the first token. A new chat should not
    // start spending because a key happens to be saved.
    defaultProvider = DEEPSEEK_PROVIDER;
    defaultModel = deepseekList[0].id;
  } else if (anthropic) {
    // Same rule as DeepSeek: a prepaid balance, billed from the first token.
    defaultProvider = ANTHROPIC_PROVIDER;
    defaultModel = anthropicList[0].id;
  } else if (google) {
    defaultProvider = GOOGLE_PROVIDER;
    // Flash and Flash Lite run on the account's free daily allowance, Pro bills
    // from the first token. A new chat opens on a row with a free allowance when
    // the catalog has one, so a saved key never starts spending by itself. The
    // flag has to be explicit — an untagged entry proves nothing.
    const freeRow = googleList.find((m) => m.freeTier === true);
    defaultModel = (freeRow || googleList[0]).id;
  } else if (zai) {
    // Paid from the first token like the rows above, so it stays behind them.
    defaultProvider = ZAI_PROVIDER;
    defaultModel = zaiList[0].id;
  } else if (openrouter) {
    defaultProvider = OPENROUTER_PROVIDER;
    defaultModel = openrouterList[0].id;
  } else if (kilo) {
    // Same rule as OpenRouter: a paid gateway, billed from the first token, so a
    // new chat opens on a free route when the catalog has one and never starts
    // spending because a key happens to be saved.
    defaultProvider = KILO_PROVIDER;
    const freeRow = kiloList.find((m) => m.plan === 'free');
    defaultModel = (freeRow || kiloList[0]).id;
  } else if (cloudflare) {
    defaultProvider = CLOUDFLARE_PROVIDER;
    // Workers Free cannot run the frontier rows the catalog lists first: they
    // answer 403 on every turn. A new chat has to open on a free row that
    // actually answers, whatever order the account's catalog arrived in.
    defaultModel = (preferredCloudflareModel(cloudflareList) || cloudflareList[0]).id;
  } else if (mistral) {
    defaultProvider = MISTRAL_PROVIDER;
    defaultModel = mistralList[0].id;
  } else if (grok) {
    defaultProvider = GROK_PROVIDER;
    defaultModel = grokList[0].id;
  } else if (pollinations) {
    defaultProvider = POLLINATIONS_PROVIDER;
    defaultModel = pollinationsList[0].id;
  }

  return {
    freePi,
    coarena,
    zro,
    nvidia,
    tokenharbor,
    llm7,
    deepseek,
    anthropic,
    google,
    zai,
    openrouter,
    kilo,
    cloudflare,
    mistral,
    grok,
    pollinations,
    ads: freePi,
    freePiTools: freePi,
    defaultProvider,
    defaultModel,
    available:
      freePi ||
      coarena ||
      zro ||
      nvidia ||
      tokenharbor ||
      llm7 ||
      deepseek ||
      anthropic ||
      google ||
      zai ||
      openrouter ||
      kilo ||
      cloudflare ||
      mistral ||
      grok ||
      pollinations,
  };
}

module.exports = {
  planProviders,
  FREE_PI_PROVIDER,
  COARENA_PROVIDER,
  ZRO_PROVIDER,
  NVIDIA_PROVIDER,
  TOKENHARBOR_PROVIDER,
  LLM7_PROVIDER,
  DEEPSEEK_PROVIDER,
  ANTHROPIC_PROVIDER,
  GOOGLE_PROVIDER,
  ZAI_PROVIDER,
  OPENROUTER_PROVIDER,
  KILO_PROVIDER,
  CLOUDFLARE_PROVIDER,
  MISTRAL_PROVIDER,
  GROK_PROVIDER,
  POLLINATIONS_PROVIDER,
  PREFERRED_FREE_PI_MODEL,
  FREE_PI_TOOL_NAMES,
};

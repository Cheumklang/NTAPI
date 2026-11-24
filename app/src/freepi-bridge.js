/**
 * free-pi bridge.
 *
 * The published `free-pi-cli` has no `--mode rpc`: its entry point always boots
 * the TUI. So instead of spawning it, we do what its own `launchPi()` does:
 * create a pi agent session, register the `free-pi` provider against the free-pi
 * backend, and drive it with the pi SDK.
 *
 * All values that mirror free-pi-cli (base URL, provider config, catalog shape)
 * are copied from free-pi-cli 0.6.19 so this app talks to the same backend with
 * the same credentials at ~/.free-pi/agent/credentials.json.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const { planProviders, FREE_PI_TOOL_NAMES, ZRO_PROVIDER, NVIDIA_PROVIDER, TOKENHARBOR_PROVIDER, LLM7_PROVIDER, DEEPSEEK_PROVIDER, ANTHROPIC_PROVIDER, GOOGLE_PROVIDER, ZAI_PROVIDER, OPENROUTER_PROVIDER, CLOUDFLARE_PROVIDER } = require('./provider-plan');
const { detectClientVersion, upgradedClientVersion, FALLBACK_CLIENT_VERSION } = require('./client-version');
const { COARENA_PROVIDER, coarenaProviderConfig, coarenaModelEntries, fetchCoarenaModels, retagModels, setCoarenaFreeTier } = require('./coarena');
const {
  EXTENSION_ID,
  DEFAULT_PORT,
  CHROME_EXTENSIONS_URL,
  BROWSER_TOOLS,
  browserGuardedTools,
  createBrowserBridge,
} = require('./browser-bridge');
const { formatSnapshot, findInTable } = require('./browser-snapshot');
const { createRefTables, resolveRefArgs, resolveFieldRefs } = require('./browser-target');
const { ZRO_MODELS, zroProviderConfig, zroModelEntries } = require('./zro');
const { resolveNvidiaModels, nvidiaProviderConfig, nvidiaModelEntries } = require('./nvidia');
const {
  resolveTokenHarborModels,
  tokenharborProviderConfig,
  tokenharborModelEntries,
} = require('./tokenharbor');
const {
  fetchLlm7Models,
  llm7ProviderConfig,
  llm7ModelEntries,
} = require('./llm7');
const {
  resolveDeepSeekModels,
  deepseekProviderConfig,
  deepseekModelEntries,
} = require('./deepseek');
const {
  resolveAnthropicModels,
  anthropicProviderConfig,
  anthropicModelEntries,
} = require('./anthropic');
const {
  resolveGoogleModels,
  googleProviderConfig,
  googleModelEntries,
} = require('./google-ai');
const { resolveZaiModels, zaiProviderConfig, zaiModelEntries } = require('./zai');
const {
  resolveOpenRouterModels,
  openrouterProviderConfig,
  openrouterModelEntries,
} = require('./openrouter');
const {
  resolveCloudflareModels,
  cloudflareProviderConfig,
  cloudflareModelEntries,
} = require('./cloudflare');
const { providerIdleTimeoutMs } = require('./provider-timeout');
const { tagPlans } = require('./model-filter');
const { pruneImages } = require('./image-history');
const { reviewAllowance } = require('./image-review');

const DEFAULT_BASE_URL = 'https://api.freepi.ai';
const PROVIDER_NAME = 'free-pi';
const DEFENSE_PROVIDER_NAME = 'free-pi-defense';
const CONTEXT_WINDOW = 200000;
const MAX_OUTPUT_TOKENS = 8192;
const MODEL_ID = 'deepseek/deepseek-v4-flash';
const SAFE_TOOLS = ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'];
const FREE_PI_DIR_NAME = '.free-pi';

/**
 * The version header the backend compares against `min` in /client-version.
 *
 * Resolved per call, not once at load: a CLI the user updates mid-session must
 * be visible without restarting the app, and the answer is never below the
 * protocol floor (see src/client-version.js).
 */
function currentClientVersion() {
  return detectClientVersion();
}

function getAgentDir() {
  return path.join(os.homedir(), FREE_PI_DIR_NAME, 'agent');
}
function getCredentialsPath(agentDir = getAgentDir()) {
  return path.join(agentDir, 'credentials.json');
}
function resolveBaseUrl(env = process.env) {
  return env.FREEPI_BASE_URL || DEFAULT_BASE_URL;
}

async function loadJwt(credentialsPath) {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(credentialsPath, 'utf8'));
    return typeof parsed.token === 'string' && parsed.token.length > 0 ? parsed.token : null;
  } catch {
    return null;
  }
}

async function saveJwt(credentialsPath, token) {
  await fs.promises.mkdir(path.dirname(credentialsPath), { recursive: true });
  await fs.promises.writeFile(credentialsPath, JSON.stringify({ token }), { mode: 0o600 });
}

function completionsBaseUrl(baseUrl) {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

function deviceReport() {
  // Keep this intentionally minimal; the CLI sends a fuller report.
  return {};
}

/** Start a guest session (same endpoint the CLI uses when no token is stored). */
async function startGuestSession(baseUrl) {
  const res = await fetch(new URL('/auth/guest', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      // The backend validates this as a string; a number is rejected with
      // "invalid body". "4" is the current terms version used by the CLI.
      consent_version: '4',
      client: { os: process.platform, cli_version: currentClientVersion() },
      ...deviceReport(),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let code = null;
    let message = '';
    try {
      const parsed = JSON.parse(text);
      code = parsed.code || null;
      message = parsed.message || '';
    } catch {}
    if (code === 'guest_unavailable' || code === 'guest_login_required') {
      throw new Error(
        'Guest access is turned off for this network. Sign in with GitHub (Settings → Sign in…) to keep using free-pi.'
      );
    }
    throw new Error(`guest start failed: HTTP ${res.status} ${message || text.slice(0, 200)}`);
  }
  const parsed = await res.json();
  if (!parsed || typeof parsed.token !== 'string') throw new Error('guest start returned no token');
  return parsed;
}

async function fetchMe(baseUrl, jwt) {
  // The same ceiling the catalog uses: a stalled request must not hold up
  // opening a chat, and the guest fallback below already covers no answer.
  const res = await fetch(new URL('/me', baseUrl), {
    signal: AbortSignal.timeout(4000),
    headers: { authorization: `Bearer ${jwt}`, 'x-freepi-features': 'choice-prompts' },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json().catch(() => null);
}

/** Same shape as the CLI's version check; only the model catalog is used here. */
async function fetchCatalog(baseUrl, jwt) {
  try {
    const res = await fetch(new URL('/client-version', baseUrl), {
      signal: AbortSignal.timeout(4000),
      headers: jwt ? { authorization: `Bearer ${jwt}` } : undefined,
    });
    if (!res.ok) return { model: undefined, models: undefined };
    const parsed = await res.json();
    return { model: parsed.model, models: parsed.models };
  } catch {
    return { model: undefined, models: undefined };
  }
}

function splitCatalogModels(models) {
  // The catalog's `name` is the marketing string the terminal shows, emoji and
  // "Free Unlimited: limited time" suffix included; `display_name` is the plain
  // one. The picker has no room for the pitch, so the plain name wins whenever
  // the catalog offers it.
  const list = (models || []).map((model) => ({
    ...model,
    name: (typeof model?.display_name === 'string' && model.display_name) || model?.name || model?.id,
  }));
  return {
    main: list.filter((m) => m.section !== 'defense'),
    defense: list.filter((m) => m.section === 'defense'),
  };
}
function catalogModelsFor(models, fallbackId) {
  const main = splitCatalogModels(models || []).main;
  if (main.length > 0) return main;
  const id = fallbackId || MODEL_ID;
  return [{ id, name: id }];
}
function defenseModelsFor(models) {
  return splitCatalogModels(models || []).defense;
}

/**
 * One dropdown entry — the shape the renderer receives. `plan` and `planNote`
 * travel with it so the picker can separate the free routes from the ones that
 * spend money, using the provider's own catalog rather than a second lookup.
 */
function modelEntry(provider, model) {
  return {
    provider,
    id: model.id,
    name: model.name,
    plan: model.plan === 'paid' ? 'paid' : 'free',
    planNote: model.planNote || '',
    // The price per million tokens, when the provider publishes one. The window
    // shows it in the language's currency, so it has to reach the renderer.
    cost: model.cost || null,
  };
}

function buildProviderConfig(baseUrl, jwt, sessionId, models, name = PROVIDER_NAME) {
  return {
    name,
    baseUrl: completionsBaseUrl(baseUrl),
    apiKey: jwt,
    api: 'openai-completions',
    headers: { 'x-session-id': sessionId, 'x-client-version': currentClientVersion() },
    models: models.map((m) => ({
      id: m.id,
      name: m.name,
      reasoning: true,
      compat: { supportsDeveloperRole: false },
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: CONTEXT_WINDOW,
      maxTokens: MAX_OUTPUT_TOKENS,
    })),
  };
}

/**
 * Resolve credentials, refreshing a guest token when the stored one is rejected.
 */
/**
 * What the account looks like, remembered for a few minutes.
 *
 * `fetchMe` is a network round trip, and it ran on every chat opened — one of
 * the reasons "new chat" felt slow. A plan or guest state does not change
 * second to second, and only a real answer is remembered: `null` (401 or
 * offline) must be asked again next time.
 */
const AUTH_TTL_MS = 5 * 60 * 1000;
const authCache = new Map();

async function cachedFetchMe(baseUrl, jwt) {
  const hit = authCache.get(jwt);
  if (hit && Date.now() - hit.at < AUTH_TTL_MS) return hit.me;
  const me = await fetchMe(baseUrl, jwt);
  if (me) authCache.set(jwt, { at: Date.now(), me });
  return me;
}

/** The FreePi model catalog, remembered per token for the same reason. */
const catalogByJwt = new Map();

async function cachedFetchCatalog(baseUrl, jwt) {
  const hit = catalogByJwt.get(jwt);
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.value;
  const value = await fetchCatalog(baseUrl, jwt);
  if (value && value.models) catalogByJwt.set(jwt, { at: Date.now(), value });
  return value;
}

async function resolveAuth(baseUrl, credentialsPath) {
  let jwt = await loadJwt(credentialsPath);
  if (!jwt) {
    const guest = await startGuestSession(baseUrl);
    await saveJwt(credentialsPath, guest.token);
    jwt = guest.token;
    return { jwt, guest: true, fresh: true };
  }
  const me = await cachedFetchMe(baseUrl, jwt);
  if (me === null) {
    // 401 or network issue: try a guest session before giving up.
    try {
      const guest = await startGuestSession(baseUrl);
      await saveJwt(credentialsPath, guest.token);
      return { jwt: guest.token, guest: true, fresh: true };
    } catch {
      return { jwt, guest: false, fresh: false };
    }
  }
  return { jwt, guest: Boolean(me.guest), me, fresh: false };
}

/* ------------------------------- ads -------------------------------
 * free-pi is free because ads pay for it, and the backend enforces that:
 * a client that never asks for an ad and never reports the impression gets
 * `403 ads_required` on every completion, with no assistant text at all.
 * That is what the CLI's `pi-ads` extension prevents, so this mirrors it:
 *
 *   1. start a turn (a fresh uuid),
 *   2. GET /ads/next?slot=banner tagged with that turn id,
 *   3. show the ad to the user and report the impression,
 *   4. send the same turn id on the completion request.
 *
 * The ad is fetched before each user message (and once at session start), so
 * the turn the model answers always has an ad attached to it.
 */

const TURN_HEADER = 'x-turn-id';
const ADS_TIMEOUT_MS = 5000;
const LAUNCH_AD_MAX_AGE_MS = 60 * 60000;
/**
 * Providers cap images per request (Coarena: 8). Keep the newest four so a long
 * render-QC run cannot push the session over the limit and brick every turn.
 */
const MAX_REQUEST_IMAGES = 4;
/**
 * Token Harbor rejects a request body over 4 MB. Old screenshots stay in the
 * conversation, so cap the total base64 size of the images we resend, not just
 * how many there are.
 */
const MAX_REQUEST_IMAGE_BYTES = 1_200_000;
/**
 * How many images one user turn may look at. A judge of a finished video looks
 * twice; an agent driving a desktop looks after every press ("did that land?"),
 * so the budget is a guard against a loop, not against looking.
 */
const MAX_IMAGE_REVIEWS_PER_TURN = 8;

/**
 * Shrink a picture before it enters the conversation.
 *
 * pi sends the whole conversation on every call, so a full 1920x1080 PNG adds
 * ~1.5 MB of base64 to every later turn until it is pruned. Downscale to at most
 * 1280px and re-encode as JPEG instead. Falls back to the original bytes when
 * Electron's image decoder is not available (headless selftests).
 */
function shrinkImageForModel(buf, mediaType) {
  const original = { data: buf.toString('base64'), mimeType: mediaType };
  try {
    const { nativeImage } = require('electron');
    const img = nativeImage.createFromBuffer(buf);
    if (!img || img.isEmpty()) return original;
    const { width, height } = img.getSize();
    const maxDim = 1280;
    const resized =
      Math.max(width, height) > maxDim
        ? img.resize(width >= height ? { width: maxDim } : { height: maxDim })
        : img;
    const jpeg = resized.toJPEG(72);
    if (jpeg && jpeg.length && jpeg.length < buf.length) {
      return { data: jpeg.toString('base64'), mimeType: 'image/jpeg' };
    }
  } catch {}
  return original;
}

function clientLocaleHeaders() {
  try {
    const o = Intl.DateTimeFormat().resolvedOptions();
    return {
      ...(o.timeZone ? { 'x-client-timezone': o.timeZone } : {}),
      ...(o.locale ? { 'x-client-locale': o.locale } : {}),
    };
  } catch {
    return {};
  }
}

/** Only follow impression pixels that really belong to the ad network. */
function isGravityImpUrl(raw) {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && /(^|\.)trygravity\.(ai|com)$/.test(u.hostname);
  } catch {
    return false;
  }
}

function createAdsClient(options) {
  const {
    baseUrl,
    getToken,
    sessionId,
    clientVersion = currentClientVersion(),
    onAd = () => {},
    log = () => {},
  } = options;

  let turnId = null;
  let lastImpressionToken = null;
  let launchTurnUnused = false;
  let launchAdOk = false;
  let launchPromise = null;
  let launchAt = 0;
  let launchToken = null;

  const startTurn = () => {
    turnId = crypto.randomUUID();
    return turnId;
  };
  const currentTurnId = () => turnId;

  async function adsFetch(pathname, init = {}) {
    const token = await Promise.resolve(getToken());
    const headers = {
      ...(init.headers || {}),
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    };
    if (sessionId) headers['x-session-id'] = sessionId;
    if (pathname.startsWith('/ads/next')) {
      if (turnId) headers[TURN_HEADER] = turnId;
      if (clientVersion) headers['x-client-version'] = clientVersion;
      headers['x-client-os'] = process.platform;
      headers['x-client-arch'] = os.arch();
      Object.assign(headers, clientLocaleHeaders());
    }
    return fetch(`${baseUrl}${pathname}`, {
      ...init,
      signal: AbortSignal.timeout(ADS_TIMEOUT_MS),
      headers,
    });
  }

  async function fetchAdNext(slot, trigger) {
    try {
      const res = await adsFetch(
        `/ads/next?slot=${slot}`,
        trigger ? { headers: { 'x-ad-trigger': trigger } } : undefined
      );
      if (res.status === 204 || !res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function fireGravityImpression(ad) {
    if (ad?.source !== 'gravity' || !isGravityImpUrl(ad.imp_url)) return false;
    try {
      Promise.resolve(fetch(ad.imp_url, { method: 'GET', signal: AbortSignal.timeout(3000) })).catch(
        () => {}
      );
    } catch {}
    return true;
  }

  async function postImpression(ad, impFired) {
    try {
      await adsFetch('/ads/impression', {
        method: 'POST',
        body: JSON.stringify({
          ad_id: ad.ad_id,
          click_token: ad.click_token,
          ...(impFired ? { imp_fired: true } : {}),
        }),
      });
    } catch {}
  }

  async function showAd(trigger) {
    const turnAtStart = turnId;
    const ad = await fetchAdNext('banner', trigger);
    if (!ad) {
      log('free-pi: no ad available right now');
      return false;
    }
    // A new turn started while this ad was loading, so it belongs to the
    // previous turn. Showing it (and reporting an impression for it) would
    // attach the wrong ad to the new turn.
    if (turnAtStart !== turnId) return false;
    try {
      onAd(ad);
    } catch {}
    if (lastImpressionToken !== ad.click_token) {
      lastImpressionToken = ad.click_token;
      const impFired = fireGravityImpression(ad);
      await postImpression(ad, impFired);
    }
    return true;
  }

  /**
   * Ad for the launch turn. Called once when the session opens so the banner is
   * visible before the first message, and reused by that first message.
   */
  function prefetchLaunchAd() {
    if (!launchPromise) {
      startTurn();
      launchTurnUnused = true;
      launchAdOk = false;
      launchAt = Date.now();
      launchPromise = Promise.resolve(getToken())
        .catch(() => null)
        .then((token) => {
          launchToken = token;
          return showAd('launch');
        })
        .then((ok) => {
          launchAdOk = Boolean(ok);
          return launchAdOk;
        });
    }
    return launchPromise;
  }

  const extension = {
    name: 'freepi-desktop-ads',
    factory(pi) {
      // Every free-pi completion carries the turn id the ad was fetched for.
      // A Coarena request has no ad behind it, so the header would be noise
      // (and a lie) there.
      pi.on('before_provider_headers', (event, ctx) => {
        if (!turnId) return;
        // Coarena has no ad behind it, so the header would be a lie there. An
        // unknown provider keeps the FreePi behaviour rather than silently
        // dropping the header a free-pi completion needs.
        if (ctx?.getModel?.()?.provider === COARENA_PROVIDER) return;
        event.headers[TURN_HEADER] = turnId;
      });

      pi.on('session_start', async () => {
        await prefetchLaunchAd();
      });

      pi.on('before_agent_start', async (event, ctx) => {
        if (event.messageType !== 'user') return;
        // Switching to a Coarena model must not fetch or require an ad.
        if (ctx?.getModel?.()?.provider === COARENA_PROVIDER) return;
        // The launch ad already covers the first message of a fresh session —
        // but only if it actually arrived and is still fresh.
        if (launchTurnUnused) {
          launchTurnUnused = false;
          if (launchPromise) await launchPromise.catch(() => false);
          const token = await Promise.resolve(getToken()).catch(() => null);
          if (launchAdOk && token === launchToken && Date.now() - launchAt < LAUNCH_AD_MAX_AGE_MS) return;
        }
        startTurn();
        await showAd('user_message');
      });
    },
  };

  /**
   * Ad for the current turn, fetched again while the window sits idle. This is
   * for display only: the next user message still gets its own ad for its own
   * turn, exactly like the terminal client.
   */
  async function rotateAd() {
    if (!turnId) startTurn();
    return showAd();
  }

  return { extension, startTurn, currentTurnId, prefetchLaunchAd, rotateAd };
}

/**
 * Create a pi agent session wired to the free-pi provider.
 *
 * The returned handle exposes:
 *   session      the pi AgentSession
 *   modelList    [{ provider, id, name }] usable with setModel()
 *   setModel()   switch model by id
 *   dispose()
 */
/**
 * One provider catalog per key, remembered for ten minutes.
 *
 * A catalog is a network call, and opening a chat used to make all of them
 * again — one after the other. The answer is just a list of model ids, so ten
 * minutes of staleness costs nothing, while a failed refresh keeps the last
 * good list instead of emptying the picker.
 */
const CATALOG_TTL_MS = 10 * 60 * 1000;
const catalogCache = new Map();

function cachedCatalog(name, key, run, empty = []) {
  const clean = String(key || '').trim();
  if (!clean) return Promise.resolve(empty);
  const id = `${name}:${clean}`;
  const hit = catalogCache.get(id);
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return Promise.resolve(hit.value);
  return run().then(
    (value) => {
      catalogCache.set(id, { at: Date.now(), value });
      return value;
    },
    () => (hit ? hit.value : empty)
  );
}

/**
 * One accepted shape for compaction settings, whatever arrived from prefs.json:
 * booleans stay booleans and token counts must be non-negative safe integers. A
 * garbage value is dropped rather than passed on, so the SDK keeps its default
 * instead of compacting every turn because a `NaN` compared true.
 */
function sanitizeCompaction(input) {
  if (!input || typeof input !== 'object') return null;
  const out = {};
  if (typeof input.enabled === 'boolean') out.enabled = input.enabled;
  for (const key of ['reserveTokens', 'keepRecentTokens']) {
    const value = input[key];
    if (Number.isSafeInteger(value) && value >= 0 && value <= 4_000_000) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

/** The heading the rule is recognised by, so it is never added twice. */
const REALITY_SECTION = '## What this session actually is';

/**
 * The standing rule about where the agent is actually running.
 *
 * Kept as a function so a test can read it without opening a session, and kept
 * short on purpose: a long preamble dilutes the tool list above it.
 */
function realityPolicyRule() {
  return (
    `\n\n${REALITY_SECTION}\n\n` +
    `You are not a chat window with no machine behind it. You run inside NTAPI, on the user's own ` +
    `computer, with the tools listed above: bash executes commands here and its output comes back ` +
    `to you, read/write/edit touch real files, and the working directory above is a real folder. ` +
    `So "install this", "try it", "run it", "make me a file" are instructions to do the work ` +
    `yourself with those tools — not to hand the user a script, and not a reason to answer that ` +
    `you are only a text model.\n\n` +
    `If you cannot finish, say what actually blocked you and what you tried: the command, its ` +
    `error output, a missing key, no network, too little GPU memory, a step only the user can ` +
    `approve. Never claim a limit you did not test — not "I have no environment", not "I cannot ` +
    `run commands", not "I cannot create files", and never a guess about the user's hardware: ` +
    `check first, since a machine may have a working GPU whether or not it looks like it.\n\n` +
    `Heavy work is still yours to do: hundreds of megabytes of downloads, a build of several ` +
    `minutes, an install that needs its own Python. State the size and the expected time in one ` +
    `line, then go ahead. Ask first only when the cost, the licence or the damage is the user's ` +
    `call — deleting, paying, or overwriting something they made.`
  );
}

/**
 * The extension that adds `realityPolicyRule()` once per session.
 *
 * Module scope, not session scope: it holds no session state, and a test can
 * exercise it without opening one.
 */
const realityPolicyExtension = {
  name: 'freepi-reality-policy',
  factory(pi) {
    pi.on('before_agent_start', (event) => {
      if (!event || typeof event.systemPrompt !== 'string') return;
      if (event.systemPrompt.includes(REALITY_SECTION)) return;
      return { systemPrompt: event.systemPrompt + realityPolicyRule() };
    });
  },
};

async function createFreePiSession(options) {
  const {
    cwd = process.cwd(),
    sessionManager,
    sdk,
    log = () => {},
    /**
     * Permission gate. Called before a mutating tool runs; must resolve true to
     * allow. Omitted means every call is allowed (the CLI behaves this way).
     */
    requestApproval = null,
    /** Tools that always need approval. Read-only ones never do. */
    guardedTools = DEFAULT_GUARDED_TOOLS,
    /**
     * Hand a browser tab over to the agent on its own request. Resolves to the
     * claim `{ ok, claim }` or `{ ok: false, error }`; omitted means the agent
     * has no way to ask, so `browser_claim` reports that honestly.
     */
    claimTab = null,
    /**
     * Desktop control (Linux AT-SPI). Main owns the switch and the audit log; the
     * tools below only forward, so a call after the user turned it off answers
     * SYSTEM_CONTROL_OFF instead of acting.
     */
    systemBridge = null,
    /**
     * Directory the pi SDK treats as its agent root for resource discovery, i.e.
     * skills are read from `<skillsAgentDir>/skills`. Defaults to the CLI dir.
     */
    skillsAgentDir = null,
    /**
     * When true, connect MCP servers from `<mcpConfigDir>/mcp.json`. Off by
     * default: an MCP server runs with the user's privileges and its tool
     * descriptions are untrusted input, so nothing connects until the user turns
     * it on in Settings.
     */
    mcpEnabled = false,
    /** Folder that holds the app's `mcp.json`. Defaults to the agent dir. */
    mcpConfigDir = null,
    /**
     * Extra directories to discover SKILL.md files from, on top of
     * `<skillsAgentDir>/skills`. Lets the app share the skills the CLI and the
     * user's ~/.agents folder already have instead of starting empty.
     */
    extraSkillPaths = [],
    /** Folder (relative to cwd, or absolute) where generate_image saves files. */    imagesDir = 'images',
    /** Folder for downloaded files. Empty means no policy is injected. */
    downloadsDir = 'downloads',
    /** Receives the agent's todo list whenever it updates it. */
    onTodo = () => {},
    /**
     * Asks the user a question and resolves with { answer } or null when they
     * dismiss it. Omitted means the `ask_user` tool is not registered.
     */
    askUser = null,
    /**
     * The app's browser bridge (see src/browser-bridge.js). When present the
     * agent gets the browser_* tools; when null they are not registered at all,
     * so a disabled feature cannot be called by accident.
     */
    browserBridge = null,
    /**
     * The app's local vision model: `{ mode(), start(), describe(), status() }`.
     * Present means a picture can be described in this machine instead of being
     * sent to a provider; null means that route does not exist here.
     */
    localVision = null,
    /**
     * The app's ntfy rooms: `{ publish({title, message, priority}) }`. Present
     * means the agent can put a message on the user's own phone; null means the
     * panel is the only way to send one.
     */
    ntfy = null,
    /** Reasoning level for models that support it: off | minimal | low | medium | high. */
    thinkingLevel = 'off',
    /**
     * Auto-compaction tuning from the app's settings: `{ enabled, reserveTokens,
     * keepRecentTokens }`. A missing key keeps the SDK default (16k tokens held
     * back for the reply, 20k of recent turns kept verbatim), which is also what
     * an invalid value falls back to.
     */
    compaction = null,
    /**
     * Called with the ad the backend served for the upcoming turn, so the app
     * can show it. Ads are what pay for free completions: without a visible ad
     * and a reported impression the backend refuses to answer.
     */
    onAd = () => {},
    /**
     * Coarena API key, or null. When set, Coarena is registered as a second
     * provider in the same session, so the model dropdown can switch without
     * reopening the tab.
     */
    coarenaKey = null,
    /**
     * Display names Coarena's own 402 said are on the free tier, remembered
     * across restarts. Without them every route looks free, because its catalog
     * prices everything at zero.
     */
    coarenaFreeTier = null,
    /** Zro API key, or null. Zro exposes one DeepSeek model. */
    zroKey = null,
    /** NVIDIA NIM key, or null. Only DeepSeek Flash is exposed, text only. */
    nvidiaKey = null,
    /** Token Harbor key, or null. Only its free DeepSeek route is exposed. */
    tokenharborKey = null,
    /** LLM7 API token, or null. Free turbo models plus the paid pro lane. */
    llm7Key = null,
    deepseekKey = null,
    /** Claude API key, or null. Native Messages API, paid per token. */
    anthropicKey = null,
    /** Gemini API key, or null. Native Generative Language API, paid. */
    googleKey = null,
    /** z.ai (GLM) key, or null. OpenAI-compatible, paid. */
    zaiKey = null,
    /** OpenRouter key, or null. One key, many vendors, paid. */
    openrouterKey = null,
    /** Cloudflare Workers AI token, or null. Paired with its account id. */
    cloudflareKey = null,
    /** The Cloudflare account the token is scoped to (Workers AI needs both). */
    cloudflareAccountId = null,
    /**
     * Injectable so tests can simulate "no FreePi login" without touching the
     * real credentials file. Production uses the normal resolver.
     */
    resolveFreePiAuth = resolveAuth,
  } = options;

  let activeCoarenaKey = coarenaKey ? String(coarenaKey).trim() : null;
  let activeZroKey = zroKey ? String(zroKey).trim() : null;
  let activeNvidiaKey = nvidiaKey ? String(nvidiaKey).trim() : null;
  let activeTokenHarborKey = tokenharborKey ? String(tokenharborKey).trim() : null;
  let activeLlm7Key = llm7Key ? String(llm7Key).trim() : null;
  let activeDeepseekKey = deepseekKey ? String(deepseekKey).trim() : null;
  let activeAnthropicKey = anthropicKey ? String(anthropicKey).trim() : null;
  let activeGoogleKey = googleKey ? String(googleKey).trim() : null;
  let activeZaiKey = zaiKey ? String(zaiKey).trim() : null;
  let activeOpenRouterKey = openrouterKey ? String(openrouterKey).trim() : null;
  let activeCloudflareKey = cloudflareKey ? String(cloudflareKey).trim() : null;
  let activeCloudflareAccount = cloudflareAccountId ? String(cloudflareAccountId).trim() : null;

  const downloadsDirAbs = path.isAbsolute(downloadsDir)
    ? downloadsDir
    : path.join(cwd, downloadsDir);

  const baseUrl = resolveBaseUrl();
  const agentDir = getAgentDir();
  // Credentials live with the CLI's agent dir so an existing login keeps working;
  // only the *skills* directory is repointed at the app data root. The SDK
  // resolves skills as `<agentDir>/skills`, so the caller passes a dedicated
  // skillsAgentDir and we hand it to services separately below.
  const credentialsPath = getCredentialsPath(agentDir);

  // FreePi is optional now: a failed login must not stop a Coarena session
  // from opening. The reason is logged so "why am I on Coarena?" is answerable.
  // Coarena's catalog is a network call of its own and depends on nothing
  // above, so it starts here and is collected further down — one round trip
  // saved from the wait before a new chat appears.
  const coarenaCatalogPromise = coarenaKey
    ? fetchCoarenaModels()
    : Promise.resolve({ models: [], source: 'none' });
  let auth = null;
  try {
    auth = await resolveFreePiAuth(baseUrl, credentialsPath);
  } catch (err) {
    log(`free-pi auth unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (auth && !auth.jwt) auth = null;

  const catalog = auth ? await cachedFetchCatalog(baseUrl, auth.jwt) : { model: undefined, models: undefined };
  // Every model the account can reach is listed, free and paid alike, each one
  // tagged with its plan. A paid route spends FreePi credits at the multiplier
  // its `usage_x` names, so the row says the cost and the choice is the user's.
  const models = auth ? tagPlans(catalogModelsFor(catalog.models, catalog.model)) : [];
  const defense = auth ? tagPlans(defenseModelsFor(catalog.models)) : [];

  // The catalog is fetched once per process (10-minute memory cache) and never
  // rejects: with no network it returns the verified fallback list.
  const coarenaCatalog = await coarenaCatalogPromise;
  // Coarena prices every route at zero, including the Claude ones a free key is
  // refused. A list learned from that refusal is the only honest free/paid
  // signal, so it is applied before the catalog is labelled.
  if (Array.isArray(coarenaFreeTier) && coarenaFreeTier.length) setCoarenaFreeTier(coarenaFreeTier);
  let coarenaModels = tagPlans(retagModels(coarenaCatalog.models));

  // Zro's picker is deliberately static: the free daily model plus the models
  // that draw on a usage pack.
  const zroModels = activeZroKey ? ZRO_MODELS : [];

  /*
   * One "new chat" used to fetch every provider's catalog again, one after the
   * other, before the window could show the tab: FreePi, Coarena, NVIDIA,
   * Token Harbor, LLM7, DeepSeek — six round trips, seconds of waiting, for a
   * list of model ids that changes about as often as a provider ships one.
   *
   * They are independent, so they go out together, and the answer for each key
   * is kept for ten minutes. A key the user just saved is a different entry, so
   * saving one still reads its catalog immediately.
   */
  const [
    nvidiaModels,
    tokenharborModels,
    llm7Catalog,
    deepseekModels,
    anthropicModels,
    googleModels,
    zaiModels,
    openrouterModels,
    cloudflareModels,
  ] = await Promise.all([
      cachedCatalog('nvidia', activeNvidiaKey, () => resolveNvidiaModels(activeNvidiaKey)),
      cachedCatalog('tokenharbor', activeTokenHarborKey, () =>
        resolveTokenHarborModels(activeTokenHarborKey)
      ),
      activeLlm7Key
        ? cachedCatalog('llm7', activeLlm7Key, () => fetchLlm7Models(), { models: [], source: 'none' })
        : Promise.resolve({ models: [], source: 'none' }),
      cachedCatalog('deepseek', activeDeepseekKey, () => resolveDeepSeekModels(activeDeepseekKey)),
      cachedCatalog('anthropic', activeAnthropicKey, () => resolveAnthropicModels(activeAnthropicKey)),
      cachedCatalog('google', activeGoogleKey, () => resolveGoogleModels(activeGoogleKey)),
      cachedCatalog('zai', activeZaiKey, () => resolveZaiModels(activeZaiKey)),
      cachedCatalog('openrouter', activeOpenRouterKey, () =>
        resolveOpenRouterModels(activeOpenRouterKey)
      ),
      // Workers AI needs both halves of the credential, so the cache key does too:
      // the same token pointed at another account is a different catalog.
      cachedCatalog(
        'cloudflare',
        activeCloudflareKey ? `${activeCloudflareKey}@${activeCloudflareAccount || ''}` : null,
        () => resolveCloudflareModels(activeCloudflareKey, activeCloudflareAccount)
      ),
    ]);
  const llm7Models = activeLlm7Key ? tagPlans(llm7Catalog.models) : [];

  const sessionId = sessionManager.getSessionId();
  const plan = planProviders({
    hasFreePiAuth: Boolean(auth),
    coarenaKey: activeCoarenaKey,
    zroKey: activeZroKey,
    nvidiaKey: activeNvidiaKey,
    tokenharborKey: activeTokenHarborKey,
    llm7Key: activeLlm7Key,
    deepseekKey: activeDeepseekKey,
    anthropicKey: activeAnthropicKey,
    googleKey: activeGoogleKey,
    zaiKey: activeZaiKey,
    openrouterKey: activeOpenRouterKey,
    cloudflareKey: activeCloudflareKey && activeCloudflareAccount ? activeCloudflareKey : null,
    freePiModels: models,
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
    cloudflareModels,
  });
  if (!plan.available) {
    throw new Error(
      'No AI provider available — sign in to FreePi or add a provider key in Settings (Coarena, Zro, NVIDIA, Token Harbor, LLM7, DeepSeek, Claude, Gemini, z.ai, OpenRouter, Cloudflare).'
    );
  }
  log(
    `providers: free-pi=${plan.freePi ? models.length : 0}, ` +
      `coarena=${plan.coarena ? coarenaModels.length : 0} (catalog ${coarenaCatalog.source}), ` +
      `zro=${plan.zro ? zroModels.length : 0}, ` +
      `nvidia=${plan.nvidia ? nvidiaModels.length : 0}, ` +
      `tokenharbor=${plan.tokenharbor ? tokenharborModels.length : 0}, ` +
      `llm7=${plan.llm7 ? llm7Models.length : 0} (catalog ${llm7Catalog.source}), ` +
      `deepseek=${plan.deepseek ? deepseekModels.length : 0}, ` +
      `anthropic=${plan.anthropic ? anthropicModels.length : 0}, ` +
      `google=${plan.google ? googleModels.length : 0}, ` +
      `zai=${plan.zai ? zaiModels.length : 0}, ` +
      `openrouter=${plan.openrouter ? openrouterModels.length : 0}, ` +
      `cloudflare=${plan.cloudflare ? cloudflareModels.length : 0}`
  );

  // Ads: one per user turn, tagged with the turn id the completion carries.
  // A Coarena-only session gets a stub so the rest of the handle stays uniform.
  const ads = plan.ads
    ? createAdsClient({
        baseUrl,
        getToken: () => auth.jwt,
        sessionId,
        clientVersion: currentClientVersion(),
        onAd,
        log,
      })
    : {
        extension: null,
        prefetchLaunchAd: async () => false,
        rotateAd: async () => false,
        startTurn: () => null,
        currentTurnId: () => null,
      };

  // Kept so the key can be swapped live: registerProvider/unregisterProvider
  // take effect immediately after the initial load phase.
  let piApi = null;

  const providerExtension = {
    name: 'freepi-desktop-provider',
    factory(pi) {
      piApi = pi;
      if (plan.freePi) {
        pi.registerProvider(
          PROVIDER_NAME,
          buildProviderConfig(baseUrl, auth.jwt, sessionId, models, PROVIDER_NAME)
        );
        if (defense.length > 0) {
          pi.registerProvider(
            DEFENSE_PROVIDER_NAME,
            buildProviderConfig(baseUrl, auth.jwt, sessionId, defense, DEFENSE_PROVIDER_NAME)
          );
        }
      }
      if (plan.coarena) {
        pi.registerProvider(
          COARENA_PROVIDER,
          coarenaProviderConfig({ apiKey: activeCoarenaKey, models: coarenaModels })
        );
      }
      if (plan.zro) {
        pi.registerProvider(ZRO_PROVIDER, zroProviderConfig({ apiKey: activeZroKey }));
      }
      if (plan.nvidia) {
        pi.registerProvider(
          NVIDIA_PROVIDER,
          nvidiaProviderConfig({ apiKey: activeNvidiaKey, models: nvidiaModels })
        );
      }
      if (plan.tokenharbor) {
        pi.registerProvider(
          TOKENHARBOR_PROVIDER,
          tokenharborProviderConfig({ apiKey: activeTokenHarborKey, models: tokenharborModels })
        );
      }
      if (plan.llm7) {
        pi.registerProvider(
          LLM7_PROVIDER,
          llm7ProviderConfig({ apiKey: activeLlm7Key, models: llm7Models })
        );
      }
      if (plan.deepseek) {
        pi.registerProvider(
          DEEPSEEK_PROVIDER,
          deepseekProviderConfig({ apiKey: activeDeepseekKey, models: deepseekModels })
        );
      }
      if (plan.anthropic) {
        pi.registerProvider(
          ANTHROPIC_PROVIDER,
          anthropicProviderConfig({ apiKey: activeAnthropicKey, models: anthropicModels })
        );
      }
      if (plan.google) {
        pi.registerProvider(
          GOOGLE_PROVIDER,
          googleProviderConfig({ apiKey: activeGoogleKey, models: googleModels })
        );
      }
      if (plan.zai) {
        pi.registerProvider(
          ZAI_PROVIDER,
          zaiProviderConfig({ apiKey: activeZaiKey, models: zaiModels })
        );
      }
      if (plan.openrouter) {
        pi.registerProvider(
          OPENROUTER_PROVIDER,
          openrouterProviderConfig({ apiKey: activeOpenRouterKey, models: openrouterModels })
        );
      }
      if (plan.cloudflare) {
        pi.registerProvider(
          CLOUDFLARE_PROVIDER,
          cloudflareProviderConfig({
            apiKey: activeCloudflareKey,
            accountId: activeCloudflareAccount,
            models: cloudflareModels,
          })
        );
      }
      // Images accumulate in history every time a model reads one. Trim before
      // each provider call, under every provider's per-request cap.
      pi.on('context', (event) => ({
        messages: pruneImages(event.messages, MAX_REQUEST_IMAGES, MAX_REQUEST_IMAGE_BYTES),
      }));
      // No session-wide Authorization override: each provider config carries
      // its own apiKey and pi-ai sets the Bearer header per request.

      if (typeof requestApproval === 'function') {
        pi.on('tool_call', async (event) => {
          if (!isGuardedTool(event.toolName, guardedTools)) return undefined;
          console.log(`[approval] guarded tool call: ${event.toolName}`);
          const isMcp = String(event.toolName).startsWith('mcp__');
          let allowed = false;
          try {
            allowed = await requestApproval({
              toolName: event.toolName,
              // MCP tools arrive as `mcp__server__tool`; show a readable label.
              label: isMcp ? mcpToolLabel(event.toolName) : event.toolName,
              kind: isMcp ? 'mcp' : 'tool',
              // pi's `tool_call` event carries the arguments as `input`.
              args: event.input ?? event.toolCall?.arguments ?? event.args ?? {},
            });
			} catch (err) {
				console.log(`[approval] ${event.toolName} request failed:`, err && err.stack ? err.stack : err);
				return {
					block: true,
					reason:
						`${event.toolName} could not ask for approval because the app hit an internal error ` +
						`(${err && err.message ? err.message : String(err)}). This is a bug, NOT a refusal — ` +
						`tell the user the approval system is broken and stop trying this tool.`,
				};
			}
          if (!allowed) {
            return {
              block: true,
              reason:
                `${event.toolName} was not approved. The user saw no dialog, or refused it. ` +
                `Do not claim they refused — tell them the request did not go through and let them retry.`,
            };
          }
          return undefined;
        });
      }
    },
  };

  /**
   * POST to a free-pi backend tool endpoint, retrying transient upstream errors.
   * The backend returns 502/503 intermittently for web search, docs and vision.
   */
  async function backendTool(pathname, body, { timeoutMs = 30000, attempts = 3 } = {}) {
    let lastStatus = 0;
    let lastText = '';
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const res = await fetch(`${baseUrl}${pathname}`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${auth.jwt}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        lastStatus = res.status;
        if (res.ok) return { ok: true, data: await res.json() };
        lastText = await res.text().catch(() => '');
        if (res.status !== 502 && res.status !== 503 && res.status !== 504) break;
      } catch (err) {
        lastText = err instanceof Error ? err.message : String(err);
      }
      if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    let message = `Request failed (HTTP ${lastStatus || 'unknown'})`;
    try {
      const parsed = JSON.parse(lastText);
      message = parsed.error?.message || parsed.message || message;
    } catch {}
    return { ok: false, text: message };
  }

  /**
   * The rest of the tools free-pi-cli normally registers: web search, docs lookup,
   * image generation and the built-in guide. All of them are thin wrappers around
   * backend endpoints on the same account and allowance.
   */
  /**
   * Adds one standing rule to the system prompt: anything the user asked us to
   * download goes into the configured downloads folder, not wherever a command
   * happens to run. Only injected when a downloads folder is configured.
   */
  /** The tab the last snapshot came from, for calls that name no tab. */
  let lastSnapshotTab = null;

  /** The ref table a call should be resolved against. */
  function tableForCall(args) {
    const tabId = Number.isInteger(args && args.tab) ? args.tab : lastSnapshotTab;
    return { tabId, table: browserRefTables.tableFor(tabId) };
  }

  function browserErrorResult(code, message) {
    return {
      content: [{ type: 'text', text: `Browser error (${code}): ${message}` }],
      details: { ok: false, code },
    };
  }

  /**
   * Take a snapshot and remember its refs. Every snapshot replaces the table:
   * a ref from an older page must never resolve to a newer element.
   */
  async function rememberSnapshot(callArgs, timeoutMs, options) {
    const result = await browserBridge.call('snapshot', callArgs, { timeoutMs });
    const formatted = formatSnapshot(result, options || {});
    browserRefTables.remember(result.tabId, formatted.table);
    if (Number.isInteger(result.tabId)) lastSnapshotTab = result.tabId;
    return { result, formatted };
  }

  /**
   * After anything that changes the page, hand the model the page it produced,
   * so it does not have to spend a round trip asking. A failure here must never
   * turn a successful action into an error.
   */
  async function snapshotAfterAction(tabId) {
    try {
      const { formatted } = await rememberSnapshot(Number.isInteger(tabId) ? { tab: tabId } : {}, 15000);
      return `\n\n${formatted.text}`;
    } catch (err) {
      return `\n\n(took the action, but could not re-read the page: ${(err && err.code) || 'ERROR'})`;
    }
  }

  /** A dialog freezes the tab; say so on whatever result the model is reading. */
  function dialogNotice(result) {
    const dialog = result && result.dialog;
    if (!dialog) return '';
    return `\n\nA page dialog is blocking the tab: ${dialog.type} — "${dialog.message}". Answer it with browser_dialog.`;
  }

  async function runLocalBrowserTool(spec, params) {
    if (spec.name === 'browser_claim') {
      if (typeof claimTab !== 'function') {
        return browserErrorResult(
          'NO_CLAIM',
          'No browser tab has been handed to the agent yet. Ask the user to hand one over from the Browser control chip.'
        );
      }
      const claimed = await claimTab();
      if (!claimed || !claimed.ok) {
        // The reason matters: "the extension is not connected" and "no tab is
        // open" need different actions from the user, and neither is a refusal.
        return browserErrorResult(
          (claimed && claimed.code) || 'NO_CLAIM',
          (claimed && claimed.error) || 'The request did not go through.',
        );
      }
      const claim = claimed.claim || {};
      return {
        content: [
          {
            type: 'text',
            text: `The user handed over "${claim.title || claim.url || 'a tab'}" (${claim.domain || 'unknown site'}), tab ${claim.tabId}. Work only in that tab.`,
          },
        ],
        details: { ok: true, claim },
      };
    }
    const query = params && typeof params === 'object' ? params : {};
    const { tabId, table } = tableForCall(query);
    if (!table) {
      return browserErrorResult('NO_SNAPSHOT', 'There is no snapshot to search yet. Call browser_snapshot first.');
    }
    const found = findInTable(table, { text: query.text, ref: query.ref, max: query.max });
    if (!found.count) {
      return {
        content: [{ type: 'text', text: `Nothing in the current snapshot matched (tab ${tabId}).` }],
        details: { ok: true, count: 0 },
      };
    }
    const lines = found.matches.map((m) => `${m.ref} [${m.role}] "${m.name}"`).join('\n');
    return {
      content: [{ type: 'text', text: `${found.count} match(es):\n${lines}` }],
      details: { ok: true, count: found.count },
    };
  }

  /**
   * Browser control. Registers one tool per entry in BROWSER_TOOLS and forwards
   * the call to the bridge, which talks to the companion Chrome extension. Write
   * commands are in the guarded list, so pi's tool_call hook asks first.
   */
  const browserExtension = {
    name: 'freepi-desktop-browser',
    factory(pi) {
      if (!browserBridge) return;

      // The workflow that makes refs worth having. Without it the model reads a
      // snapshot once and then guesses selectors for the rest of the task.
      pi.on('before_agent_start', (event) => {
        if (!event || typeof event.systemPrompt !== 'string') return;
        if (event.systemPrompt.includes('## Browser workflow')) return;
        // Read the claim now, not at registration: the user can hand a tab over,
        // or release it, between turns. Without this line the model cannot tell a
        // ready tab from no tab, so it re-asks for one the user already gave.
        const tab = typeof browserBridge.claimedTab === 'function' ? browserBridge.claimedTab() : null;
        const tabLine = tab
          ? `- A tab is ALREADY handed over and ready: tab ${tab.tabId} — ${tab.url || 'unknown URL'}` +
            `${tab.title ? ` ("${tab.title}")` : ''}. ` +
            `Do NOT call browser_claim for it — start with browser_snapshot. Only ask again if the tab was released or the extension reports it gone.\n`
          : `- No tab is handed over yet. If the task needs one of the user's own pages, call browser_claim once; if it is refused, tell the user, in their language, to open the browser card in the app's left sidebar and press the button that hands over their current tab. A site the user has no tab for needs no hand-over at all — call browser_open with the URL instead.\n`;
        return {
          systemPrompt:
            event.systemPrompt +
            `\n\n## Browser workflow\n\n` +
            `- You drive the user's own Google Chrome through a companion extension they installed. This app has no browser window of its own, so never talk about an "NTAPI browser" — it is always the user's Chrome.\n` +
            `- The user saying "the page I have open", "this news item", "ผมเปิดให้แล้ว" and the like refers to their Chrome tab. Never ask them to paste a URL or copy the text when a tab can be read.\n` +
            tabLine +
            `- A site no tab covers is still reachable: call browser_open with the URL (the app asks the user to approve it). The tab that opens is yours — work in it by the tab id it returned, and do not ask for a hand-over for it.\n` +
            `- Take a browser_snapshot before acting on a page, and act by the \`ref\` it returns — do not guess a CSS selector when you have a ref.\n` +
            `- Every action returns a fresh snapshot: read it rather than assuming what changed.\n` +
            `- If a ref is rejected as stale, take a snapshot again — the page moved under you.\n` +
            `- When a page will not cooperate, call ask_user saying what you expected and what you see, then snapshot again before continuing.\n` +
            `- Work only in tabs the user handed over, or tabs you opened yourself. Every other tab is off limits, and naming one is refused.\n` +
            `- With more than one tab in hand, name the tab you mean with \`tab\` (browser_tabs lists the ids). A call that names none is refused instead of guessed.\n` +
            `- Doing the work without a dialog per step never covers browser_eval, and never an action that pays, purchases or deletes — those still ask.`,
        };
      });

      for (const spec of [...browserToolSpecs(), ...browserLocalToolSpecs()]) {
        pi.registerTool({
          name: spec.name,
          label: spec.name.replace('browser_', 'Browser ').replace(/_/g, ' '),
          description: spec.description,
          promptSnippet: spec.promptSnippet,
          parameters: spec.parameters,
          async execute(_id, params, _signal, _onUpdate, ctx) {
            if (spec.local) return runLocalBrowserTool(spec, params);

            const resolved = resolveRefArgs(params, tableForCall(params || {}).table);
            if (!resolved.ok) return browserErrorResult(resolved.code, resolved.message);
            const args = resolved.args;
            if (spec.cmd === 'fill') {
              const fielded = resolveFieldRefs(args.fields, tableForCall(params || {}).table);
              if (!fielded.ok) return browserErrorResult(fielded.code, fielded.message);
              args.fields = fielded.fields;
            }
            // Attaching a video means Chrome copies the file before the page
            // reacts, which is slower than any click; give it a minute.
            const slow = ['screenshot', 'snapshot', 'upload'].includes(spec.cmd);
            const timeoutMs = slow ? 60000 : 15000;

            let result;
            try {
              result = await browserBridge.call(spec.cmd, args, { timeoutMs });
            } catch (err) {
              const code = (err && err.code) || 'ERROR';
              return browserErrorResult(code, (err && err.message) || String(err));
            }

            const canSeeImages = modelSeesImages(sessionModel(ctx, visionSession));

            if (spec.cmd === 'snapshot') {
              const formatted = formatSnapshot(result, { maxNodes: params && params.maxNodes });
              browserRefTables.remember(result.tabId, formatted.table);
              if (Number.isInteger(result.tabId)) lastSnapshotTab = result.tabId;
              return {
                content: [{ type: 'text', text: formatted.text + dialogNotice(result) }],
                details: { ok: true, tabId: result.tabId, shown: formatted.shown, total: formatted.total, truncated: formatted.truncated },
              };
            }

            if (spec.cmd === 'screenshot') {
              const asImage = browserResultContent(spec, result, imagesDir, canSeeImages);
              if (asImage) return { content: asImage, details: { ok: true, url: result.url } };
              const buffer = Buffer.from(result.data || '', 'base64');
              const dirAbs = path.isAbsolute(imagesDir) ? imagesDir : path.join(cwd, imagesDir);
              const rel = path.join(imagesDir, `screenshot-${Math.random().toString(16).slice(2, 8)}.png`);
              try {
                await fs.promises.mkdir(dirAbs, { recursive: true });
                await fs.promises.writeFile(path.isAbsolute(rel) ? rel : path.join(cwd, rel), buffer);
              } catch (err) {
                return {
                  content: [{ type: 'text', text: `Could not save the screenshot: ${err.message}` }],
                  details: { ok: false },
                };
              }
              return {
                content: [{ type: 'text', text: `Saved screenshot to ${rel} (${result.url || ''}). This model cannot see images, so reference the path.` }],
                details: { ok: true, path: rel },
              };
            }

            let text = browserResultContent(spec, result, imagesDir, canSeeImages);
            text += dialogNotice(result);
            // The model should not have to ask what changed. `close` is the one
            // command whose tab is gone, so there is nothing left to look at.
            const nothingLeft = spec.cmd === 'close' && result && !result.tabId;
            if (spec.write && spec.cmd !== 'close' && !nothingLeft) text += await snapshotAfterAction(result.tabId);
            return { content: [{ type: 'text', text }], details: { ok: true } };
          },
        });
      }
    },
  };

  /**
   * Desktop control. Three tools, one at a time: look at the windows, look
   * inside one, press one thing. The switch in the sidebar is the permission
   * and main re-checks it on every call.
   */
  const systemExtension = {
    name: 'freepi-desktop-system',
    factory(pi) {
      if (!systemBridge) return;

      pi.on('before_agent_start', (event) => {
        if (!event || typeof event.systemPrompt !== 'string') return;
        if (event.systemPrompt.includes('## Desktop control')) return;
        return {
          systemPrompt:
            event.systemPrompt +
            `\n\n## Desktop control\n\n` +
            `- This is the user's own computer (${DESKTOP_LABEL}), not a browser tab. system_windows lists the open windows; system_snapshot reads one window into \`ref\`s; system_act presses one element by its ref.\n` +
            `- Snapshot before acting, and act only on refs you just received. After every action, snapshot again — the window has moved.\n` +            `- Typing into a field is system_act with action \`settext\`; when that answers NO_VALUE_PATTERN, use system_type to type for real. Read the snapshot again to confirm the text landed.\n` +
            `- A control that publishes no action can still be clicked by position with system_click_at, taking the coordinates from a node's bounds in the snapshot. Never aim at a point you have not seen, and never outside the window — it is refused.\n` +
            `- system_keys presses a shortcut (ctrl+s, alt+f4), and system_launch starts a program, document or url. Every one of these brings the window to the front first and refuses if it did not get there, so nothing is typed into the wrong window.\n` +
            `- A type result says which of three things happened: verified (it was read back and is on screen), SENT, NOT CHECKED (this window never lets a program read its text, so it may or may not have arrived - look before typing again), or NOT VERIFIED / TYPE_NOT_DELIVERED / INPUT_REJECTED (nothing was typed). "I sent the keystrokes" is not the same sentence as "the text is on screen".\n` +
            `- Window numbers come from the accessibility tree and they shift when a window opens or closes. system_windows also prints a window handle: pass it as \`window\` and the call finds that window itself. When two windows of the same application are open, the handle is the only safe way to say which one.\n` +
            `- If a type result says the text is on screen, it is there. Do not type it again, and do not open a second window to check.\n` +
            `- If a call answers SYSTEM_CONTROL_OFF, stop and ask the user to turn the desktop switch on in the sidebar. Never retry it as if it were a glitch.\n` +
            `- Anything that spends money, deletes, signs in or changes account settings is the user's call: describe what you are about to press and let them decide.\n` +
            `- The user can take the screen back at any moment with Ctrl+Alt+Esc; if a tool starts failing mid-task, that is what happened.`,
        };
      });

      for (const spec of systemToolSpecs()) {
        pi.registerTool({
          name: spec.name,
          label: spec.name.replace('system_', 'Desktop ').replace(/_/g, ' '),
          description: spec.description,
          parameters: spec.parameters,
          async execute(_id, params, _signal, _onUpdate, ctx) {
            try {
              // Who is pressing: a desktop audit without a session and a
              // model cannot tell two agents apart.
              const sessionRef = visionSession &&
                (visionSession.id || visionSession.sessionId || visionSession.sessionKey);
              const agent = {
                session: (ctx && (ctx.sessionId || ctx.session)) || sessionRef || null,
                model: sessionModel(ctx, visionSession),
              };
              const result = await systemBridge.call(spec.cmd, { ...(params || {}), agent });
              if (spec.cmd === 'screenshot') {
                const canSeeImages = modelSeesImages(sessionModel(ctx, visionSession));
                return await systemScreenshotContent(result, { imagesDir, cwd, canSeeImages });
              }
              const typed = spec.cmd === 'type' || spec.cmd === 'keys';
              // A window that will not let a program read its text back cannot
              // confirm anything: that is "not checked", not "did not work".
              const unchecked = spec.cmd === 'type' && result && result.verified === false && result.checked === false;
              const unverified = spec.cmd === 'type' && result && result.verified === false && !unchecked;
              const text =
                spec.cmd === 'snapshot'
                  ? formatSystemSnapshot(result)
                  : spec.cmd === 'windows'
                    ? formatSystemWindows(result)
                    : typed && unchecked
                      ? `SENT, NOT CHECKED: ${result.did || 'the text'} into ${result.appName || 'the window'}, and whether it arrived cannot be read back from this window. Look at the window before typing anything else, and never send the same text twice.`
                      : typed && unverified
                        ? `NOT VERIFIED: ${result.did || 'the text'} was sent, but the control did not change, so nothing is on screen. Tell the user it did not work; do not say it was typed.`
                        : typed && result && result.verified === true
                          ? `Typed and checked: the window now holds ${result.afterLen} characters (was ${result.beforeLen}). The text is on screen — do not type it a second time.`
                          : `Done: ${result.did || spec.cmd}. Snapshot again before the next action.`;
              return { content: [{ type: 'text', text }], details: { ok: true } };
            } catch (err) {
              return {
                content: [{ type: 'text', text: `${(err && err.code) || 'ERROR'}: ${(err && err.message) || String(err)}` }],
                details: { ok: false },
              };
            }
          },
        });
      }
    },
  };

  const downloadsPolicyExtension = {
    name: 'freepi-downloads-policy',
    factory(pi) {
      if (!downloadsDir) return;
      pi.on('before_agent_start', (event) => {
        const rule =
          `\n\n## Downloads\n\n` +
          `When you download anything for the user (curl, wget, Invoke-WebRequest, ` +
          `a script that writes fetched data, or saving a file the user asked you to fetch), ` +
          `write it inside ${downloadsDirAbs}. ` +
          `Create that folder if it does not exist. Never drop downloads in the workspace root, ` +
          `in temp, or in the current shell directory. If the user names a different target ` +
          `explicitly, follow the user.`;
        if (event.systemPrompt.includes('## Downloads')) return;
        return { systemPrompt: event.systemPrompt + rule };
      });
    },
  };

  const extraToolsExtension = {
    name: 'freepi-desktop-tools',
    factory(pi) {
      pi.registerTool({
        name: 'web_search',
        label: 'Web Search',
        description:
          'Search the web and return a numbered list of results with title, URL, publish date and page text. Use for current information. Each call uses part of the daily allowance.',
        promptSnippet: 'Search the web for current information',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Specific query as typed into a search engine' },
            num_results: { type: 'integer', minimum: 1, maximum: 10, description: '1-10, default 5' },
          },
          required: ['query'],
        },
        async execute(_id, params) {
          const r = await backendTool('/tools/web-search', params);
          if (!r.ok) return { content: [{ type: 'text', text: r.text }], details: { ok: false } };
          const results = r.data.results ?? [];
          if (!results.length) {
            return {
              content: [{ type: 'text', text: `No results for "${params.query}".` }],
              details: { ok: true },
            };
          }
          const text =
            `Web results for "${params.query}":\n\n` +
            results
              .map(
                (x, i) =>
                  `${i + 1}. ${x.title}\n${x.url}${x.published_date ? `\nPublished: ${x.published_date}` : ''}\n${x.text}`
              )
              .join('\n\n');
          return { content: [{ type: 'text', text }], details: { ok: true } };
        },
      });

      pi.registerTool({
        name: 'docs_lookup',
        label: 'Docs Lookup',
        description:
          'Look up current documentation for a third-party library or API. Returns the matching library title and id plus documentation text. Each call uses part of the daily allowance.',
        promptSnippet: 'Look up library documentation',
        parameters: {
          type: 'object',
          properties: {
            library: { type: 'string', description: 'Package name, e.g. "electron"' },
            query: { type: 'string', description: 'One specific question' },
            library_id: { type: 'string', description: 'Id from a previous lookup, to skip the search' },
          },
          required: ['library', 'query'],
        },
        async execute(_id, params) {
          const body = { library: params.library, query: params.query };
          if (params.library_id) body.library_id = params.library_id;
          const r = await backendTool('/tools/docs', body);
          if (!r.ok) return { content: [{ type: 'text', text: r.text }], details: { ok: false } };
          const d = r.data;
          const head = [d.title, d.library_id ? `library_id: ${d.library_id}` : null].filter(Boolean).join('\n');
          const bodyText = d.text || d.documentation || JSON.stringify(d);
          return { content: [{ type: 'text', text: `${head}\n\n${bodyText}` }], details: { ok: true } };
        },
      });

      pi.registerTool({
        name: 'generate_image',
        label: 'Generate Image',
        description:
          'Generate one image from a text prompt and save it under images/ in the project. Returns the file path. Each call uses part of the daily allowance.',
        promptSnippet: 'Generate an image file from a prompt',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Subject, style, any exact text to render, and composition',
            },
            aspect_ratio: {
              type: 'string',
              enum: ['1:1', '16:9', '9:16', '4:3', '3:2'],
              description: 'Default 1:1',
            },
            name: { type: 'string', description: 'Short file name hint' },
          },
          required: ['prompt'],
        },
        async execute(_id, params) {
          const body = { prompt: params.prompt };
          if (params.aspect_ratio) body.aspect_ratio = params.aspect_ratio;
          const r = await backendTool('/tools/image', body, { timeoutMs: 120000 });
          if (!r.ok) return { content: [{ type: 'text', text: r.text }], details: { ok: false } };

          const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[r.data.media_type];
          if (!ext) {
            return {
              content: [{ type: 'text', text: `Unsupported image type: ${r.data.media_type}` }],
              details: { ok: false },
            };
          }
          const buf = Buffer.from(r.data.image_b64 ?? '', 'base64');
          if (!buf.length) {
            return { content: [{ type: 'text', text: 'The server returned an empty image.' }], details: { ok: false } };
          }
          const slug = String(params.name || params.prompt)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'image';
          const dirAbs = path.isAbsolute(imagesDir) ? imagesDir : path.join(cwd, imagesDir);
          // Where the saved file lands, expressed for display in the prompt.
          const rel = path.join(imagesDir, `${slug}-${Math.random().toString(16).slice(2, 8)}.${ext}`);
          try {
            await fs.promises.mkdir(dirAbs, { recursive: true });
            await fs.promises.writeFile(path.isAbsolute(rel) ? rel : path.join(cwd, rel), buf, { flag: 'wx' });
          } catch (err) {
            return {
              content: [
                { type: 'text', text: `Could not save the image: ${err instanceof Error ? err.message : String(err)}` },
              ],
              details: { ok: false },
            };
          }
          return {
            content: [
              {
                type: 'text',
                text: `Saved image to ${rel} (${ext}, ${buf.length} bytes). You cannot see the image; reference this path in your answer.`,
              },
            ],
            details: { ok: true, path: rel },
          };
        },
      });

      pi.registerTool({
        name: 'free_pi_usage',
        label: 'My Usage',
        description:
          'Report how much of the free daily allowance is used, purchased credit, and account tier. Read-only, no arguments.',
        promptSnippet: 'Check remaining free-pi allowance',
        parameters: { type: 'object', properties: {} },
        async execute() {
          try {
            const res = await fetch(`${baseUrl}/me/stats`, {
              headers: { authorization: `Bearer ${auth.jwt}` },
              signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) {
              return { content: [{ type: 'text', text: `Could not fetch usage (HTTP ${res.status}).` }] };
            }
            const s = await res.json();
            const lines = [
              typeof s.remaining_credits_today === 'number' && typeof s.allowance_credits === 'number'
                ? `Credits left today: ${s.remaining_credits_today} / ${s.allowance_credits}`
                : null,
              typeof s.bonus_wallet_credits === 'number' && s.bonus_wallet_credits > 0
                ? `Bonus credit: ${s.bonus_wallet_credits}`
                : null,
              s.lane ? `Lane: ${s.lane}` : null,
              s.refill_at ? `Resets: ${s.refill_at}` : null,
            ].filter(Boolean);
            return { content: [{ type: 'text', text: lines.join('\n') || JSON.stringify(s) }] };
          } catch (err) {
            return {
              content: [{ type: 'text', text: `Could not fetch usage: ${err instanceof Error ? err.message : String(err)}` }],
            };
          }
        },
      });
    },
  };

  /**
   * `ntfy_send`: put a line on the user's phone.
   *
   * The room, the server and the credential all live in the app's panel, so the
   * tool asks for none of them — it sends to whatever room is active there. That
   * also means the tool is only registered when a publish path was handed in.
   */
  const ntfyExtension = {
    name: 'freepi-desktop-ntfy',
    factory(pi) {
      if (!ntfy || typeof ntfy.publish !== 'function') return;
      pi.registerTool({
        name: 'ntfy_send',
        label: 'Notify phone',
        description:
          "Send a push notification to the user's own phone through the ntfy room set up in this app (the bell in the left sidebar). " +
          'Use it when a long job finishes or when you need an answer while they are away. Needs a room to exist; say so in one line if it does not.',
        promptSnippet: 'Send a push notification to the user\u2019s phone',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'The text to send (one or two lines)' },
            title: { type: 'string', description: 'Short heading, e.g. "Build finished"' },
            priority: {
              type: 'integer',
              minimum: 1,
              maximum: 5,
              description: '1 min, 3 normal, 4 important, 5 urgent',
            },
          },
          required: ['message'],
        },
        async execute(_id, params) {
          const res = await ntfy.publish({
            message: String(params?.message || ''),
            title: params?.title ? String(params.title) : '',
            priority: Number(params?.priority) || 3,
          });
          if (!res || res.ok === false) {
            return {
              content: [{ type: 'text', text: `Could not send: ${res?.error || 'no room is set up in the ntfy panel'}` }],
            };
          }
          return { content: [{ type: 'text', text: 'Sent to the phone.' }] };
        },
      });
    },
  };

  /**
   * `look_at_image`: show an image to the active model when it can see images;
   * otherwise fall back to the free-pi vision endpoint. Mirrors the tool
   * free-pi-cli registers, with one addition: a vision-capable model receives
   * the picture itself instead of a second model's description.
   */
  // Set once the session exists; tool execute() reads the live model from here.
  let visionSession = null;
  /** Per-user-turn image look budget, so a QC loop cannot run away. */
  let reviewState = null;
  const visionExtension = {
    name: 'freepi-desktop-vision',
    factory(pi) {
      // Render work is finished by the user watching the video, not by the model
      // opening every frame. State the rule once per system prompt.
      pi.on('before_agent_start', (event) => {
        if (!event || typeof event.systemPrompt !== 'string') return;
        if (event.systemPrompt.includes('## Image review')) return;
        const rule =
          `\n\n## Image review\n` +
          `Look at a picture when the answer is in the picture: a key frame, an attached image, or the screen after you pressed something. ` +
          `For a render or a video, do not walk the frames - finish the render and let the user watch it, and read ffprobe, file size or the command output for the technical checks. ` +
          `At most ${MAX_IMAGE_REVIEWS_PER_TURN} looks per turn.`;
        return { systemPrompt: event.systemPrompt + rule };
      });

      pi.registerTool({
        name: 'look_at_image',
        label: 'Look At Image',
        description:
          `Look at a PNG, JPEG or WebP image inside the project folder. When the current model can see images the image is attached directly; otherwise it is sent to a separate vision model. ` +
          `At most ${MAX_IMAGE_REVIEWS_PER_TURN} per turn. Look at what you need (a key frame, the screen after a press), not every frame of a render: the user watches the finished video.`,
        promptSnippet: 'Look at a key frame or attached image',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Image path, relative to the project or absolute' },
            question: { type: 'string', description: 'One specific question about the image' },
          },
          required: ['path', 'question'],
        },
        // pi calls execute(toolCallId, params, signal, onUpdate, ctx).
        async execute(_id, params, _signal, _onUpdate, ctx) {
          const target = path.resolve(cwd, params?.path || '');
          if (!target.startsWith(path.resolve(cwd))) {
            return { content: [{ type: 'text', text: 'Image must be inside the project folder.' }] };
          }

          // Count looks per user turn: a new message starts a fresh budget.
          const turn = (visionSession?.messages || []).filter((m) => m.role === 'user').length;
          const allowance = reviewAllowance(turn, reviewState, MAX_IMAGE_REVIEWS_PER_TURN);
          if (!allowance.allowed) {
            return {
              content: [
                {
                  type: 'text',
                  text:
                    `Image review budget for this turn is used (${MAX_IMAGE_REVIEWS_PER_TURN}). ` +
                    'Finish the render; the user watches the finished video. Use ffprobe, file size or command output for technical checks.',
                },
              ],
            };
          }
          reviewState = allowance.state;

          let buf;
          try {
            buf = await fs.promises.readFile(target);
          } catch {
            return { content: [{ type: 'text', text: `Could not read image: ${params?.path}` }] };
          }
          const ext = path.extname(target).toLowerCase();
          const mediaType =
            ext === '.jpg' || ext === '.jpeg'
              ? 'image/jpeg'
              : ext === '.webp'
              ? 'image/webp'
              : 'image/png';

          // A model that accepts images gets the picture itself: no second
          // provider, no free-pi allowance, and no 429 when FreePi is capped.
          const model = sessionModel(ctx, visionSession);
          const visionMode = localVision && localVision.mode ? localVision.mode() : 'model';

          if (visionMode === 'off') {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Looking at images is turned off in Settings (see the picture control beside the thinking control). Turn it on to review this file.',
                },
              ],
            };
          }

          if (visionMode === 'local' && localVision) {
            try {
              const shrunkLocal = shrinkImageForModel(buf, mediaType);
              const localStatus = localVision.status ? localVision.status() : null;
              if (!localStatus || !localStatus.running) await localVision.start();
              const answer = await localVision.describe({
                base64: shrunkLocal.data,
                mime: shrunkLocal.mimeType,
                question: String(params?.question || 'Describe this image for someone who cannot see it.'),
              });
              return {
                content: [
                  {
                    type: 'text',
                    text: `${answer.text}\n\n(looked at by the local model; the picture never left this machine)`,
                  },
                ],
              };
            } catch (err) {
              // A switched-off model is a decision, not a fault: say that, and
              // do not send the reader to a page they just came from.
              const why = err instanceof Error ? err.message : String(err);
              const text =
                err && err.code === 'DISABLED'
                  ? `This picture was not looked at: ${why}.`
                  : `The local vision model could not look at this image: ${why}. Settings → Providers → llama.cpp shows what it needs.`;
              return { content: [{ type: 'text', text }] };
            }
          }

          if (modelSeesImages(model)) {
            const shrunk = shrinkImageForModel(buf, mediaType);
            return {
              content: [
                { type: 'image', data: shrunk.data, mimeType: shrunk.mimeType },
                { type: 'text', text: `Image attached. Answer this yourself: ${params?.question || 'Describe it.'}` },
              ],
            };
          }
          if (!auth) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'This model cannot see images. Switch to a Coarena model that supports vision, or connect the NTAPI free lane.',
                },
              ],
            };
          }
          try {
            const shrunkVision = shrinkImageForModel(buf, mediaType);
            // The backend's vision upstream returns 502 intermittently; retry briefly.
            let res;
            let lastStatus = 0;
            for (let attempt = 0; attempt < 3; attempt += 1) {
              res = await fetch(`${baseUrl}/tools/vision`, {
                method: 'POST',
                headers: {
                  authorization: `Bearer ${auth.jwt}`,
                  'content-type': 'application/json',
                },
                body: JSON.stringify({
                  image_b64: shrunkVision.data,
                  media_type: shrunkVision.mimeType,
                  question: String(params?.question || 'Describe this image.'),
                }),
                signal: AbortSignal.timeout(60000),
              });
              lastStatus = res.status;
              if (res.ok) break;
              // Only retry transient upstream failures.
              if (res.status !== 502 && res.status !== 503 && res.status !== 504) break;
              await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
            }
            if (!res || !res.ok) {
              return {
                content: [
                  { type: 'text', text: `The vision request failed (HTTP ${lastStatus || 'unknown'}).` },
                ],
              };
            }
            const data = await res.json();
            const answer = data.text ?? data.answer ?? JSON.stringify(data);
            return { content: [{ type: 'text', text: String(answer) }] };
          } catch (err) {
            return {
              content: [
                { type: 'text', text: `The vision request failed: ${err instanceof Error ? err.message : String(err)}` },
              ],
            };
          }
        },
      });
    },
  };

  /* ------------------------------ todo tool ------------------------------ */

  // The pi TUI ships a todo tool; an SDK session does not, and the app wants a
  // visible checklist for multi-step work. Kept in memory for the tab's lifetime.
  const todoState = { items: [] };

  const todoExtension = {
    name: 'freepi-desktop-todo',
    factory(pi) {
      pi.registerTool({
        name: 'todo',
        label: 'Todo',
        description:
          'Track multi-step work with a visible checklist. Call it with the FULL list each time something changes; the user sees it live above the composer. Use it for any task with three or more steps.',
        promptSnippet: 'Keep a todo checklist for multi-step work',
        parameters: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              description: 'The complete todo list after this update',
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string', description: 'One short step' },
                  status: {
                    type: 'string',
                    enum: ['pending', 'in_progress', 'done'],
                    description: 'Defaults to pending',
                  },
                },
                required: ['text'],
              },
            },
          },
          required: ['items'],
        },
        async execute(_id, params) {
          const items = (Array.isArray(params?.items) ? params.items : [])
            .map((raw) => ({
              text: String(raw?.text || '').trim(),
              status: ['pending', 'in_progress', 'done'].includes(raw?.status) ? raw.status : 'pending',
            }))
            .filter((it) => it.text);
          todoState.items = items;
          onTodo(items);
          const lines = items.map((it) => `${it.status === 'done' ? '[x]' : it.status === 'in_progress' ? '[>]' : '[ ]'} ${it.text}`);
          const open = items.filter((it) => it.status !== 'done').length;
          return {
            content: [
              {
                type: 'text',
                text: items.length
                  ? `${open} open of ${items.length}:\n${lines.join('\n')}`
                  : 'Todo list cleared.',
              },
            ],
            details: { items },
          };
        },
      });
    },
  };

  /* ---------------------------- ask_user tool ---------------------------- */

  const askUserExtension = askUser
    ? {
        name: 'freepi-desktop-ask-user',
        factory(pi) {
          pi.registerTool({
            name: 'ask_user',
            label: 'Ask User',
            description:
              'Ask the user a question and wait for their answer. Use it when a decision is genuinely theirs (which file, which approach, credentials) instead of guessing.',
            promptSnippet: 'Ask the user a question when a decision is theirs',
            parameters: {
              type: 'object',
              properties: {
                question: { type: 'string', description: 'One clear question' },
                options: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Optional suggested answers shown as buttons',
                },
              },
              required: ['question'],
            },
            async execute(_id, params) {
              const answer = await askUser({
                question: String(params?.question || '').trim(),
                options: Array.isArray(params?.options) ? params.options.map(String).slice(0, 6) : [],
              });
              if (answer === null || answer === undefined) {
                return { content: [{ type: 'text', text: 'The user dismissed the question without answering.' }] };
              }
              return { content: [{ type: 'text', text: String(answer) }] };
            },
          });
        },
      }
    : null;

  // The plan already picked the default (free-pi's tuned model when present,
  // else the first Coarena model). A session must never start on a dead id.
  const browserToolAllowList = browserBridge ? allBrowserToolNames() : [];
  const systemToolAllowList = systemBridge ? Object.keys(SYSTEM_TOOLS) : [];
  const defaultTools = [
    ...(plan.freePiTools ? [...SAFE_TOOLS, ...FREE_PI_TOOL_NAMES] : [...SAFE_TOOLS]),
    ...browserToolAllowList,
    ...systemToolAllowList,
  ];

  // Only what the user actually chose reaches the SDK; everything else keeps pi's
  // own defaults instead of being pinned by a stale prefs file.
  const compactionSettings = sanitizeCompaction(compaction);
  const settingsManager = sdk.SettingsManager.inMemory(
    {
      defaultProvider: plan.defaultProvider,
      defaultModel: plan.defaultModel,
      defaultTools,
      packages: [],
      quietStartup: true,
      defaultThinkingLevel: thinkingLevel,
      hideThinkingBlock: true,
      enableInstallTelemetry: false,
      // A user who turned auto-compaction off must not have their conversation
      // summarized behind their back. The token numbers move the point where a
      // long session is rewritten, which is why Settings exposes them.
      ...(compactionSettings ? { compaction: compactionSettings } : {}),
      // Fail a stalled turn in this window instead of after pi's five-minute
      // default: silence is otherwise indistinguishable from a frozen app.
      httpIdleTimeoutMs: providerIdleTimeoutMs(),
    },
    { projectTrusted: true }
  );

  const sdkTrace = (label, ms) => {
    if (process.env.NTAPI_BOOT_TRACE) console.log(`[boot-sdk] ${label} ${ms}ms`);
  };
  const servicesStarted = Date.now();
  const services = await sdk.createAgentSessionServices({
    cwd,
    // Passing the app's own root here is what makes skills resolve from
    // `<DATA_ROOT>/skills` instead of `~/.free-pi/agent/skills`. Credentials and
    // session files are handled explicitly elsewhere, so this only affects
    // resources (skills / prompts / themes / extensions).
    agentDir: skillsAgentDir || agentDir,
    settingsManager,
    resourceLoaderOptions: {
      additionalSkillPaths: Array.isArray(extraSkillPaths) ? extraSkillPaths : [],
      extensionFactories: [
        // Ads and the FreePi-backed tools only exist when FreePi is registered.
        ...(plan.ads ? [ads.extension] : []),
        providerExtension,
        ...(plan.freePiTools ? [visionExtension, ntfyExtension, extraToolsExtension] : []),
        downloadsPolicyExtension,
        realityPolicyExtension,
        ...(browserBridge ? [browserExtension] : []),
        ...(systemBridge ? [systemExtension] : []),
        todoExtension,
        ...(askUserExtension ? [askUserExtension] : []),
        // The CLI loads these as built-in extensions; an SDK session must add
        // them explicitly. MCP is opt-in and reads the app's own `mcp.json`
        // (not the SDK's hidden agent dir), so the config is easy to find.
        ...(mcpEnabled && sdk.createMcpExtension
          ? [sdk.createMcpExtension({ loadConfig: loadAppMcpConfig(mcpConfigDir || agentDir) })]
          : []),
        ...(sdk.createCodemodeExtension ? [sdk.createCodemodeExtension({ mode: 'on' })] : []),
        ...(sdk.createToolSearchExtension ? [sdk.createToolSearchExtension()] : []),
      ],
    },
  });

  sdkTrace('createAgentSessionServices', Date.now() - servicesStarted);
  const sessionStarted = Date.now();
  const { session } = await sdk.createAgentSessionFromServices({
    services,
    sessionManager,
    tools: defaultTools,
  });
  visionSession = session;

  // A session that never binds its extensions never emits `session_start`, so an
  // extension that keys its state off that event stays switched off — a memory
  // extension then records nothing and looks installed but idle. The TUI and the
  // CLI call this right after building the session; a windowed host has to do it
  // itself. `mode: 'print'` is the honest label: there is no terminal to draw in,
  // and extensions that need one already check `hasUI`.
  sdkTrace('createAgentSessionFromServices', Date.now() - sessionStarted);
  const bindStarted = Date.now();
  try {
    await session.bindExtensions({ mode: 'print' });
  } catch (err) {
    log(`extensions: session_start failed — ${err instanceof Error ? err.message : String(err)}`);
  }

  sdkTrace('bindExtensions', Date.now() - bindStarted);
  // Show a banner ad as soon as the session opens, so the window is never left
  // without one while it waits for the first message.
  if (plan.ads) ads.prefetchLaunchAd().catch(() => {});

  const freePiEntries = plan.freePi
    ? [
        ...models.map((m) => modelEntry(PROVIDER_NAME, m)),
        ...defense.map((m) => modelEntry(DEFENSE_PROVIDER_NAME, m)),
      ]
    : [];
  let coarenaEntries = plan.coarena ? coarenaModelEntries(coarenaModels) : [];
  let zroEntries = plan.zro ? zroModelEntries() : [];
  let nvidiaEntries = plan.nvidia ? nvidiaModelEntries(nvidiaModels) : [];
  let tokenharborEntries = plan.tokenharbor ? tokenharborModelEntries(tokenharborModels) : [];
  let llm7Entries = plan.llm7 ? llm7ModelEntries(llm7Models) : [];
  let deepseekEntries = plan.deepseek ? deepseekModelEntries(deepseekModels) : [];
  let anthropicEntries = plan.anthropic ? anthropicModelEntries(anthropicModels) : [];
  let googleEntries = plan.google ? googleModelEntries(googleModels) : [];
  let zaiEntries = plan.zai ? zaiModelEntries(zaiModels) : [];
  let openrouterEntries = plan.openrouter ? openrouterModelEntries(openrouterModels) : [];
  let cloudflareEntries = plan.cloudflare ? cloudflareModelEntries(cloudflareModels) : [];
  let modelList = [];

  /**
   * The dropdown, assembled in one place. A provider that can be swapped while
   * the tab is open edits its own entries and calls this, so adding a provider
   * cannot leave one of the branches behind.
   */
  function rebuildModelList() {
    modelList = [
      ...freePiEntries,
      ...coarenaEntries,
      ...zroEntries,
      ...nvidiaEntries,
      ...tokenharborEntries,
      ...llm7Entries,
      ...deepseekEntries,
      ...anthropicEntries,
      ...googleEntries,
      ...zaiEntries,
      ...openrouterEntries,
      ...cloudflareEntries,
    ];
    return modelList;
  }
  rebuildModelList();

  /**
   * A resumed session can remember a model this account no longer has (Coarena
   * key removed, catalog change). The UI shows one notice instead of a dead
   * dropdown entry. Recomputed on read so a later switch clears it.
   */
  function currentModelFallback() {
    const messages = Array.isArray(session.messages) ? session.messages : [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (!m || m.role !== 'assistant' || !m.provider || !m.model) continue;
      const known = modelList.some((entry) => entry.provider === m.provider && entry.id === m.model);
      if (known) return null;
      const current = session.model;
      return {
        from: { provider: m.provider, id: m.model },
        to: current ? { provider: current.provider, id: current.id, name: current.name } : null,
      };
    }
    return null;
  }

  /**
   * Swap the Coarena key while the tab is open. pi applies provider
   * registration/unregistration immediately, so no restart or new tab is
   * needed; the caller re-sends the model list to the renderer.
   */
  async function applyCoarenaKey(nextKey) {
    if (piApi) {
      try {
        piApi.unregisterProvider(COARENA_PROVIDER);
      } catch {}
    }

    activeCoarenaKey = nextKey ? String(nextKey).trim() : null;
    if (!activeCoarenaKey) {
      coarenaEntries = [];
      return { ok: true, models: rebuildModelList() };
    }

    // force: the key may have changed, and the catalog is cheap to refetch.
    const result = await fetchCoarenaModels({ force: true });
    // Every route the new key can reach, labelled free or paid — including what
    // an earlier 402 taught this session about the free tier.
    coarenaModels = tagPlans(retagModels(result.models));
    if (piApi) {
      piApi.registerProvider(
        COARENA_PROVIDER,
        coarenaProviderConfig({ apiKey: activeCoarenaKey, models: coarenaModels })
      );
    }
    coarenaEntries = coarenaModelEntries(coarenaModels);
    return { ok: true, models: rebuildModelList() };
  }

  /**
   * Swap the Zro key while the tab is open. The catalog is static, so this only
   * registers or unregisters the provider.
   */
  async function applyZroKey(nextKey) {
    if (piApi) {
      try {
        piApi.unregisterProvider(ZRO_PROVIDER);
      } catch {}
    }

    activeZroKey = nextKey ? String(nextKey).trim() : null;
    if (!activeZroKey) {
      zroEntries = [];
      return { ok: true, models: rebuildModelList() };
    }

    if (piApi) {
      piApi.registerProvider(ZRO_PROVIDER, zroProviderConfig({ apiKey: activeZroKey }));
    }
    zroEntries = zroModelEntries();
    return { ok: true, models: rebuildModelList() };
  }

  /**
   * Swap the NVIDIA key while the tab is open. The catalog is not static: it is
   * re-resolved so a retired free endpoint leaves the dropdown.
   */
  async function applyNvidiaKey(nextKey) {
    if (piApi) {
      try {
        piApi.unregisterProvider(NVIDIA_PROVIDER);
      } catch {}
    }

    activeNvidiaKey = nextKey ? String(nextKey).trim() : null;
    if (!activeNvidiaKey) {
      nvidiaEntries = [];
      return { ok: true, models: rebuildModelList() };
    }

    const models = await resolveNvidiaModels(activeNvidiaKey);
    if (piApi && models.length) {
      piApi.registerProvider(NVIDIA_PROVIDER, nvidiaProviderConfig({ apiKey: activeNvidiaKey, models }));
    }
    nvidiaEntries = nvidiaModelEntries(models);
    return { ok: true, models: rebuildModelList() };
  }

  /**
   * Swap the Token Harbor key while the tab is open. The free route can rotate,
   * so the catalog is re-resolved just like NVIDIA's.
   */
  async function applyTokenHarborKey(nextKey) {
    if (piApi) {
      try {
        piApi.unregisterProvider(TOKENHARBOR_PROVIDER);
      } catch {}
    }

    activeTokenHarborKey = nextKey ? String(nextKey).trim() : null;
    if (!activeTokenHarborKey) {
      tokenharborEntries = [];
      return { ok: true, models: rebuildModelList() };
    }

    const models = await resolveTokenHarborModels(activeTokenHarborKey);
    if (piApi && models.length) {
      piApi.registerProvider(
        TOKENHARBOR_PROVIDER,
        tokenharborProviderConfig({ apiKey: activeTokenHarborKey, models })
      );
    }
    tokenharborEntries = tokenharborModelEntries(models);
    return { ok: true, models: rebuildModelList() };
  }

  /**
   * Swap the LLM7 token while the tab is open. Its catalog is public and can
   * change at any time, so it is refetched rather than remembered in the tab.
   */
  async function applyLlm7Key(nextKey) {
    if (piApi) {
      try {
        piApi.unregisterProvider(LLM7_PROVIDER);
      } catch {}
    }

    activeLlm7Key = nextKey ? String(nextKey).trim() : null;
    if (!activeLlm7Key) {
      llm7Entries = [];
      return { ok: true, models: rebuildModelList() };
    }

    const catalog = await fetchLlm7Models({ force: true });
    const models = tagPlans(catalog.models);
    // The catalog is public, so a failed fetch means an empty list rather than a
    // dead key: register only when there is something to register.
    if (piApi && models.length) {
      piApi.registerProvider(
        LLM7_PROVIDER,
        llm7ProviderConfig({ apiKey: activeLlm7Key, models })
      );
    }
    llm7Entries = llm7ModelEntries(models);
    return { ok: true, models: rebuildModelList() };
  }

  /**
   * Swap the DeepSeek key while the tab is open. Two ids and a balance: a key
   * that reaches neither is unregistered rather than left to fail every turn.
   */
  async function applyDeepSeekKey(nextKey) {
    if (piApi) {
      try {
        piApi.unregisterProvider(DEEPSEEK_PROVIDER);
      } catch {}
    }

    activeDeepseekKey = nextKey ? String(nextKey).trim() : null;
    if (!activeDeepseekKey) {
      deepseekEntries = [];
      return { ok: true, models: rebuildModelList() };
    }

    const models = await resolveDeepSeekModels(activeDeepseekKey);
    if (piApi && models.length) {
      piApi.registerProvider(
        DEEPSEEK_PROVIDER,
        deepseekProviderConfig({ apiKey: activeDeepseekKey, models })
      );
    }
    deepseekEntries = deepseekModelEntries(models);
    return { ok: true, models: rebuildModelList() };
  }

  /**
   * Swap the Claude key while the tab is open. The live `/v1/models` list decides
   * which families are offered, so a retired one leaves the dropdown instead of
   * failing every turn.
   */
  async function applyAnthropicKey(nextKey) {
    if (piApi) {
      try {
        piApi.unregisterProvider(ANTHROPIC_PROVIDER);
      } catch {}
    }

    activeAnthropicKey = nextKey ? String(nextKey).trim() : null;
    if (!activeAnthropicKey) {
      anthropicEntries = [];
      return { ok: true, models: rebuildModelList() };
    }

    const models = await resolveAnthropicModels(activeAnthropicKey);
    if (piApi && models.length) {
      piApi.registerProvider(
        ANTHROPIC_PROVIDER,
        anthropicProviderConfig({ apiKey: activeAnthropicKey, models })
      );
    }
    anthropicEntries = anthropicModelEntries(models);
    return { ok: true, models: rebuildModelList() };
  }

  /**
   * Swap the Gemini key while the tab is open. The catalog is the API's own
   * model list, filtered to the ids this key can actually generate with.
   */
  async function applyGoogleKey(nextKey) {
    if (piApi) {
      try {
        piApi.unregisterProvider(GOOGLE_PROVIDER);
      } catch {}
    }

    activeGoogleKey = nextKey ? String(nextKey).trim() : null;
    if (!activeGoogleKey) {
      googleEntries = [];
      return { ok: true, models: rebuildModelList() };
    }

    const models = await resolveGoogleModels(activeGoogleKey);
    if (piApi && models.length) {
      piApi.registerProvider(
        GOOGLE_PROVIDER,
        googleProviderConfig({ apiKey: activeGoogleKey, models })
      );
    }
    googleEntries = googleModelEntries(models);
    return { ok: true, models: rebuildModelList() };
  }

  /** Swap the z.ai key while the tab is open. */
  async function applyZaiKey(nextKey) {
    if (piApi) {
      try {
        piApi.unregisterProvider(ZAI_PROVIDER);
      } catch {}
    }

    activeZaiKey = nextKey ? String(nextKey).trim() : null;
    if (!activeZaiKey) {
      zaiEntries = [];
      return { ok: true, models: rebuildModelList() };
    }

    const models = await resolveZaiModels(activeZaiKey);
    if (piApi && models.length) {
      piApi.registerProvider(ZAI_PROVIDER, zaiProviderConfig({ apiKey: activeZaiKey, models }));
    }
    zaiEntries = zaiModelEntries(models);
    return { ok: true, models: rebuildModelList() };
  }

  /** Swap the OpenRouter key while the tab is open. */
  async function applyOpenRouterKey(nextKey) {
    if (piApi) {
      try {
        piApi.unregisterProvider(OPENROUTER_PROVIDER);
      } catch {}
    }

    activeOpenRouterKey = nextKey ? String(nextKey).trim() : null;
    if (!activeOpenRouterKey) {
      openrouterEntries = [];
      return { ok: true, models: rebuildModelList() };
    }

    const models = await resolveOpenRouterModels(activeOpenRouterKey);
    if (piApi && models.length) {
      piApi.registerProvider(
        OPENROUTER_PROVIDER,
        openrouterProviderConfig({ apiKey: activeOpenRouterKey, models })
      );
    }
    openrouterEntries = openrouterModelEntries(models);
    return { ok: true, models: rebuildModelList() };
  }

  /**
   * Swap the Cloudflare credential while the tab is open. Both halves change
   * together: a token without its account id points at an endpoint that does not
   * exist, so an empty id unregisters the provider.
   */
  async function applyCloudflareKey(nextKey, nextAccountId) {
    if (piApi) {
      try {
        piApi.unregisterProvider(CLOUDFLARE_PROVIDER);
      } catch {}
    }

    activeCloudflareKey = nextKey ? String(nextKey).trim() : null;
    if (nextAccountId !== undefined) {
      activeCloudflareAccount = nextAccountId ? String(nextAccountId).trim() : null;
    }
    if (!activeCloudflareKey || !activeCloudflareAccount) {
      cloudflareEntries = [];
      return { ok: true, models: rebuildModelList() };
    }

    const models = await resolveCloudflareModels(activeCloudflareKey, activeCloudflareAccount);
    if (piApi && models.length) {
      piApi.registerProvider(
        CLOUDFLARE_PROVIDER,
        cloudflareProviderConfig({
          apiKey: activeCloudflareKey,
          accountId: activeCloudflareAccount,
          models,
        })
      );
    }
    cloudflareEntries = cloudflareModelEntries(models);
    return { ok: true, models: rebuildModelList() };
  }

  /**
   * Re-register the free-pi provider after the backend says our version header
   * is too old. The header is resolved per call now (see currentClientVersion),
   * so this exists for the case where a *newer* CLI appeared on disk while the
   * app was open, and for re-reading what the backend just published.
   *
   * Returns the version now in use, or null when nothing changed.
   */
  async function refreshClientVersion() {
    if (!plan.freePi || !piApi) return null;
    const before = currentClientVersion();
    const next = await upgradedClientVersion({ baseUrl, sent: before });
    if (!next) return before;
    process.env.FREEPI_CLIENT_VERSION = next;
    try {
      piApi.unregisterProvider(PROVIDER_NAME);
    } catch {}
    piApi.registerProvider(
      PROVIDER_NAME,
      buildProviderConfig(baseUrl, auth.jwt, sessionId, models, PROVIDER_NAME)
    );
    if (defense.length > 0) {
      try {
        piApi.unregisterProvider(DEFENSE_PROVIDER_NAME);
      } catch {}
      piApi.registerProvider(
        DEFENSE_PROVIDER_NAME,
        buildProviderConfig(baseUrl, auth.jwt, sessionId, defense, DEFENSE_PROVIDER_NAME)
      );
    }
    log(`client version ${before} -> ${next} after upgrade_required`);
    return next;
  }

  /**
   * Re-read every configured provider's catalog, ignoring the ten-minute cache.
   *
   * The cache holds one answer per key for ten minutes, so a refresh that only
   * re-ran the resolvers would hand back the same stale lists. Clearing it first
   * is what makes this an update rather than a repaint.
   *
   * One provider failing must not lose the others: each step is caught on its
   * own and reported, and a provider that could not be read keeps the rows it
   * already had.
   */
  async function refreshCatalogs() {
    catalogCache.clear();
    const steps = [
      ['coarena', activeCoarenaKey, () => applyCoarenaKey(activeCoarenaKey)],
      ['nvidia', activeNvidiaKey, () => applyNvidiaKey(activeNvidiaKey)],
      ['tokenharbor', activeTokenHarborKey, () => applyTokenHarborKey(activeTokenHarborKey)],
      ['llm7', activeLlm7Key, () => applyLlm7Key(activeLlm7Key)],
      ['deepseek', activeDeepseekKey, () => applyDeepSeekKey(activeDeepseekKey)],
      ['anthropic', activeAnthropicKey, () => applyAnthropicKey(activeAnthropicKey)],
      ['google', activeGoogleKey, () => applyGoogleKey(activeGoogleKey)],
      ['zai', activeZaiKey, () => applyZaiKey(activeZaiKey)],
      ['openrouter', activeOpenRouterKey, () => applyOpenRouterKey(activeOpenRouterKey)],
      ['cloudflare', activeCloudflareKey, () => applyCloudflareKey(activeCloudflareKey)],
    ];

    const errors = [];
    for (const [name, key, run] of steps) {
      if (!key) continue;
      try {
        await run();
      } catch (err) {
        errors.push({ provider: name, error: err instanceof Error ? err.message : String(err) });
      }
    }

    rebuildModelList();
    const counts = {};
    for (const entry of modelList) {
      counts[entry.provider] = (counts[entry.provider] || 0) + 1;
    }
    return { ok: errors.length === 0, counts, errors, models: modelList };
  }

  return {
    session,
    services,
    refreshClientVersion,
    refreshCatalogs,
    // Getter: a live key swap rebuilds this list inside the same handle.
    get modelList() {
      return modelList;
    },
    auth,
    baseUrl,
    /** Catalog source for this session: live | cache | fallback | none. */
    coarenaSource: coarenaCatalog.source,
    get modelFallback() {
      return currentModelFallback();
    },
    applyCoarenaKey,
    /**
     * Learn the free-tier list from a 402 refusal and re-label the picker. The
     * registered provider is untouched: same ids, different tag.
     */
    applyCoarenaFreeTier(names) {
      const res = setCoarenaFreeTier(names);
      if (!plan.coarena) return { changed: res.changed, models: null };
      coarenaModels = tagPlans(retagModels(coarenaModels));
      coarenaEntries = coarenaModelEntries(coarenaModels);
      return { changed: res.changed, models: rebuildModelList() };
    },
    applyZroKey,
    applyNvidiaKey,
    applyTokenHarborKey,
    applyLlm7Key,
    applyDeepSeekKey,
    applyAnthropicKey,
    applyGoogleKey,
    /** Fetch and show a fresh banner ad without starting a new turn. */
    rotateAd: () => ads.rotateAd(),

    /** Active tool names, so the UI can show what the agent can reach. */
    toolNames: () => {
      try {
        return session.getActiveToolNames();
      } catch {
        return [];
      }
    },

    /** Token/context accounting for the meter under the composer. */
    stats: () => {
      try {
        const stats = session.getSessionStats();
        return {
          tokens: stats.tokens,
          context: session.getContextUsage?.() || stats.contextUsage || null,
          userMessages: stats.userMessages,
          toolCalls: stats.toolCalls,
        };
      } catch {
        return null;
      }
    },

    /**
     * Step back one user message. Mirrors `/undo` in the CLI: the branch stays in
     * the session file, so redo can walk back onto it.
     */
    async undo() {
      if (session.isStreaming || session.isCompacting) return { ok: false, reason: 'busy' };
      const users = session.getUserMessagesForForking();
      if (!users.length) return { ok: false, reason: 'empty' };
      const last = users[users.length - 1];
      const entry = session.sessionManager.getEntry(last.entryId);
      if (!entry) return { ok: false, reason: 'missing' };
      if (!entry.parentId) {
        // First user message: go back to before it existed.
        session.sessionManager.resetLeaf();
        session.refreshContext();
      } else {
        await session.navigateTree(entry.parentId, { summarize: false });
      }
      return { ok: true, text: last.text, entryId: last.entryId };
    },

    /** Walk forward onto a branch that undo left behind. */
    async redo(entryId) {
      if (session.isStreaming || session.isCompacting) return { ok: false, reason: 'busy' };
      if (!entryId || !session.sessionManager.getEntry(entryId)) return { ok: false, reason: 'missing' };
      await session.navigateTree(entryId, { summarize: false });
      return { ok: true };
    },

    /** `/compact`: summarize the conversation to free context (costs one turn). */
    async compact(customInstructions) {
      if (session.isStreaming || session.isCompacting) return { ok: false, reason: 'busy' };
      const result = await session.compact(customInstructions || undefined);
      return { ok: true, result };
    },

    /** `/export`: write the conversation to an HTML file and return its path. */
    async exportHtml() {
      const file = await session.exportToHtml();
      return { ok: Boolean(file), path: file || null };
    },

    /** `!command`: run a shell command in the workspace; output joins the session. */
    async bash(command, onChunk, options) {
      return session.executeBash(command, onChunk, options || {});
    },

    thinking: () => ({
      supported: Boolean(session.supportsThinking?.()),
      level: session.thinkingLevel,
      levels: (() => {
        try {
          return session.getAvailableThinkingLevels();
        } catch {
          return [];
        }
      })(),
    }),

    setThinking(level) {
      session.setThinkingLevel(level);
      return session.thinkingLevel;
    },

    /**
     * Switch auto-compaction on or off in a session that is already open. The
     * token numbers are read when a compaction happens, but the SDK only exposes
     * a setter for the switch, so those travel with the next tab.
     */
    setCompaction(enabled) {
      settingsManager.setCompactionEnabled(Boolean(enabled));
      return Boolean(enabled);
    },

    /** What this session would do right now, plus the window it is measured against. */
    compactionSettings() {
      let settings;
      try {
        settings = settingsManager.getCompactionSettings(session.model);
      } catch {
        settings = { enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 };
      }
      return { ...settings, contextWindow: Number(session.model?.contextWindow) || 0 };
    },

    todoItems: () => todoState.items,

    async setModel(provider, modelId) {
      // getAvailable() is async in pi 1.2 — it resolves to readonly Model<Api>[].
      const available = await services.modelRuntime.getAvailable();
      const model = available.find((m) => m.provider === provider && m.id === modelId);
      if (!model) {
        const known = available.map((m) => `${m.provider}/${m.id}`).slice(0, 12).join(', ');
        throw new Error(`model not found: ${provider}/${modelId}. Available: ${known}`);
      }
      await session.setModel(model);
      return { provider: model.provider, id: model.id, name: model.name };
    },
    dispose() {
      try {
        session.dispose();
      } catch {}
    },
  };
}

/* ---------------------- browser tools the app answers itself ----------------------
 * These have no browser-bridge command, so they must never be added to
 * BROWSER_TOOLS: that catalogue is what the registration loop forwards to
 * Chrome, and a spec without a real command would fail there.
 */

/** One ref table per tab, from that tab's most recent snapshot. */
const browserRefTables = createRefTables();

const BROWSER_LOCAL_TOOLS = {
  browser_find: { write: false },
  browser_claim: { write: true },
};

const BROWSER_LOCAL_TOOL_DOCS = {
  browser_find: {
    description:
      'Search the last snapshot for an element, by the text it shows or by an exact ref. Read-only and cheap: use it when the snapshot was truncated, or when you know what a control says but not where it is.',
    snippet: 'Search the last page snapshot',
    props: {
      tab: { type: 'integer' },
      text: { type: 'string', description: 'Text the element shows' },
      ref: { type: 'string', description: 'An exact ref from the last snapshot' },
      max: { type: 'integer', description: 'Largest number of matches (default 20)' },
    },
  },
  browser_claim: {
    description:
      "Ask the user to let you work in one of the Google Chrome tabs they already have open. The app asks them for approval and shows which tab. Every other browser tool then targets that tab until it is released. Fails if the companion extension is not connected.",
    snippet: 'Ask to work in one of the open Chrome tabs',
    props: {},
  },
};

function browserLocalToolNames() {
  return Object.keys(BROWSER_LOCAL_TOOLS);
}

/**
 * Every browser tool name, bridge-backed and app-side.
 *
 * The session's `tools` option is an allow-list, not an addition: a registered
 * tool that is not named here is never declared to the model. The browser tools
 * were registered but omitted from that list for a while, which is why the agent
 * could not see a browser at all and answered "you didn't include a link".
 */
function allBrowserToolNames() {
  return [...Object.keys(BROWSER_TOOLS), ...browserLocalToolNames()];
}

function browserLocalGuardedTools() {
  return browserLocalToolNames().filter((name) => BROWSER_LOCAL_TOOLS[name].write);
}

/** The app-side specs, shaped like `browserToolSpecs()` but carrying no `cmd`. */
function browserLocalToolSpecs() {
  return browserLocalToolNames().map((name) => {
    const doc = BROWSER_LOCAL_TOOL_DOCS[name] || {};
    return {
      name,
      local: true,
      write: BROWSER_LOCAL_TOOLS[name].write,
      description: doc.description || name,
      promptSnippet: doc.snippet || name,
      parameters: { type: 'object', properties: doc.props || {} },
    };
  });
}

/** A tab's refs stop being valid the moment the page changes again. */
function clearSnapshotTable(tabId) {
  browserRefTables.clear(tabId);
}

/* --------------------------- desktop control tools ---------------------------
 *
 * The agent looks at the user's own desktop and presses one element at a time. The tools are dumb on purpose: whether this is allowed at all is decided
 * in the main process (`systemBridge`), so the same switch covers the model, the
 * audit log and the stop hotkey.
 */
/** Windows and Linux are the two the app ships on; the prompt says which one. */
const DESKTOP_LABEL = process.platform === 'win32' ? 'Windows desktop' : 'Linux desktop';

const SYSTEM_TOOLS = {
  system_windows: {
    cmd: 'windows',
    write: false,
    description:
      `List the windows open on the user's own computer (${DESKTOP_LABEL}). Call this first: system_snapshot needs the app number it returns.`,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  system_snapshot: {
    cmd: 'snapshot',
    write: false,
    description:
      'Read one open window into refs: role, name, whether it can be clicked or typed into. The ref is what system_act accepts.',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'number', description: 'Application number from system_windows (default 0).' },
        window: {
          type: 'string',
          description:
            'The handle from system_windows. Prefer it over app when you will come back to this window: app numbers shift whenever a window opens or closes, and the wrong number types into the wrong application.',
        },
        maxNodes: { type: 'number', description: 'How many elements to return (default 250).' },
      },
      additionalProperties: false,
    },
  },
  system_screenshot: {
    cmd: 'screenshot',
    write: false,
    description:
      'A picture of one window from system_windows, so layout and "did that really appear" can be seen instead of guessed. On Windows any window can be photographed, even one that is covered. Leave app and window out to photograph the window in front. On Linux only the NTAPI window unless the session is X11; Wayland refuses and says so.',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'number', description: 'The app number from system_windows, if you are checking that it is this one.' },
        window: {
          type: 'string',
          description:
            'The handle from system_windows. Prefer it over app when you will come back to this window: app numbers shift whenever a window opens or closes, and the wrong number types into the wrong application.',
        },
      },
      additionalProperties: false,
    },
  },
  system_focus: {
    cmd: 'focus',
    write: false,
    description:
      'Bring one window from system_windows to the front. system_keys, system_type and system_click_at do this for you; call it on its own only to look at a window before snapshotting it.',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'number', description: 'The app number from system_windows.' },
        window: {
          type: 'string',
          description:
            'The handle from system_windows. Prefer it over app when you will come back to this window: app numbers shift whenever a window opens or closes.',
        },
      },
      additionalProperties: false,
    },
  },
  system_launch: {
    cmd: 'launch',
    write: true,
    description:
      'Start a program, open a document, or open a url on the user\'s own computer, then return the window that appeared. Give an absolute path (C:\\Windows\\notepad.exe, a .docx file) or a url.',
    parameters: {
      type: 'object',
      properties: { target: { type: 'string', description: 'An executable, a file path, or a url.' } },
      required: ['target'],
      additionalProperties: false,
    },
  },
  system_keys: {
    cmd: 'keys',
    write: true,
    description:
      'Press a shortcut in one window, after bringing it to the front: ctrl+s, alt+f4, ctrl+shift+t, enter, tab, f5. This is how to drive an app that publishes no buttons. Leave app and window out to use the window in front — the reply names the window it pressed in, and never this application. Ask only for shortcuts you mean; this is the user\'s own keyboard.',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'number', description: 'The app number from system_windows.' },
        window: {
          type: 'string',
          description:
            'The handle from system_windows. Prefer it over app when you will come back to this window: app numbers shift whenever a window opens or closes, and the wrong number types into the wrong application.',
        },
        keys: { type: 'string', description: 'A combination such as ctrl+s, or a single key such as enter.' },
      },
      required: ['keys'],
      additionalProperties: false,
    },
  },
  system_type: {
    cmd: 'type',
    write: true,
    description:
      'Type text into whatever has focus in one window, character by character. Use it when system_act with settext answers NO_VALUE_PATTERN, or when a field only reacts to real keystrokes. Leave app and window out to type into the window in front (never this application): the result names the window and says whether the text really arrived.',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'number', description: 'The app number from system_windows.' },
        window: {
          type: 'string',
          description:
            'The handle from system_windows. Prefer it over app when you will come back to this window: app numbers shift whenever a window opens or closes, and the wrong number types into the wrong application.',
        },
        text: { type: 'string', description: 'The text to type.' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  system_click_at: {
    cmd: 'clickat',
    write: true,
    description:
      'Click a screen position inside one window — for a control that exposes no accessibility action (a canvas, a map, a drawing tool). Take the coordinates from a snapshot node\'s bounds so the click lands on something you have seen. Refuses any point outside the window.',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'number', description: 'The app number from system_windows.' },
        window: {
          type: 'string',
          description:
            'The handle from system_windows. Prefer it over app when you will come back to this window: app numbers shift whenever a window opens or closes, and the wrong number types into the wrong application.',
        },
        x: { type: 'number', description: 'Screen x, as snapshot bounds report it.' },
        y: { type: 'number', description: 'Screen y, as snapshot bounds report it.' },
        button: { type: 'string', enum: ['left', 'right'] },
      },
      required: ['x', 'y'],
      additionalProperties: false,
    },
  },
  system_scroll: {
    cmd: 'scroll',
    write: true,
    description:
      'Wheel over the middle of a window: positive scrolls down, negative scrolls up. Snapshot again afterwards, since what is on screen has changed.',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'number', description: 'The app number from system_windows.' },
        window: {
          type: 'string',
          description:
            'The handle from system_windows. Prefer it over app when you will come back to this window: app numbers shift whenever a window opens or closes, and the wrong number types into the wrong application.',
        },
        notches: { type: 'number', description: 'How many wheel notches (default 3).' },
      },
      additionalProperties: false,
    },
  },
  system_act: {
    cmd: 'act',
    write: true,
    description:
      'Act on one element from the last snapshot: click invokes it, settext replaces a field. Snapshot again afterwards.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'The ref of the element, exactly as the snapshot printed it.' },
        action: { type: 'string', enum: ['click', 'settext'] },
        text: { type: 'string', description: 'The text for settext.' },
      },
      required: ['ref'],
      additionalProperties: false,
    },
  },
};

function systemToolSpecs() {
  return Object.keys(SYSTEM_TOOLS).map((name) => ({ name, ...SYSTEM_TOOLS[name] }));
}

function systemGuardedTools() {
  return Object.keys(SYSTEM_TOOLS).filter((name) => SYSTEM_TOOLS[name].write);
}

/**
 * The picture itself when the model has eyes, the file when it does not.
 *
 * A data URI in a text block would be hundreds of kilobytes of base64 in the
 * transcript and unreadable to a text-only model, so the two cases take different
 * routes — the same rule the browser screenshot already follows.
 */
async function systemScreenshotContent(result, { imagesDir, cwd, canSeeImages }) {
  const meta = `Screenshot of ${result.title || 'the window'} (${result.width}×${result.height}).`;
  // The picture goes to disk either way: a model that can see it wants the
  // image, and one that cannot needs a path to hand to look_at_image.
  let rel = '';
  try {
    const dirAbs = path.isAbsolute(imagesDir) ? imagesDir : path.join(cwd, imagesDir);
    await fs.promises.mkdir(dirAbs, { recursive: true });
    rel = path.join(imagesDir, `desktop-${Math.random().toString(16).slice(2, 8)}.png`);
    // What the app was started in is not always the folder the agent reads,
    // and a relative path is then a path to nothing: say where the file is.
    if (rel && !path.isAbsolute(rel)) rel = path.join(cwd, rel);
    await fs.promises.writeFile(path.isAbsolute(rel) ? rel : path.join(cwd, rel), Buffer.from(result.data || '', 'base64'));
  } catch (err) {
    if (!canSeeImages || !result.data) {
      return {
        content: [{ type: 'text', text: `Could not save the screenshot: ${err.message}` }],
        details: { ok: false },
      };
    }
  }
  if (canSeeImages && result.data) {
    return {
      content: [
        { type: 'image', data: result.data, mimeType: result.mimeType || 'image/png' },
        { type: 'text', text: rel ? `${meta} Saved to ${rel}.` : meta },
      ],
      details: { ok: true, path: rel, width: result.width, height: result.height },
    };
  }
  return {
    content: [{ type: 'text', text: `${meta} Saved to ${rel} — this model cannot see images, so reference the path.` }],
    details: { ok: true, path: rel, width: result.width, height: result.height },
  };
}

/** One line per element, ref first so it is what the eye lands on. */
/**
 * The model this turn is talking to.
 *
 * The tool context does not always carry it: the accessibility tools receive a
 * ctx whose `getModel()` answers nothing, and comparing that silence against
 * "can see images" told a vision model "this model cannot see images" for every
 * screenshot it asked for. The session's own model is the same model, so it
 * answers when the context does not.
 */
function sessionModel(ctx, session) {
  try {
    const live = ctx && typeof ctx.getModel === 'function' ? ctx.getModel() : null;
    if (live) return live;
  } catch {
    /* a ctx that cannot answer is the reason the fallback exists */
  }
  return (session && session.model) || null;
}

/** Whether that model takes image parts. */
function modelSeesImages(model) {
  return Boolean(model && Array.isArray(model.input) && model.input.includes('image'));
}

function formatSystemSnapshot(result) {
  const nodes = (result && result.nodes) || [];
  const lines = nodes.map((node) => {
    const parts = [node.ref, node.role];
    if (node.name) parts.push(JSON.stringify(node.name));
    const marks = [];
    if (node.actions && node.actions.length) marks.push(`click:${node.actions.join('|')}`);
    if (node.editable) marks.push('editable');
    return parts.join(' ') + (marks.length ? `  {${marks.join(', ')}}` : '');
  });
  const bHandle = result && result.handle && String(result.handle) !== '0' ? ` (window ${result.handle})` : '';
  return [`${(result && result.appName) || 'app'}${bHandle} — ${nodes.length} element(s)`, ...lines].join('\n');
}

function formatSystemWindows(result) {
  const windows = (result && result.windows) || [];
  if (!windows.length) return 'No windows are open.';
  return windows
    .map((win) => {
      const handle = win.handle !== undefined && win.handle !== null && String(win.handle) !== '0' ? ` (window ${win.handle})` : '';
      // Where the window is: system_click_at takes screen coordinates, so the
      // numbers to aim at travel with the row instead of being guessed.
      const b = win.bounds;
      const at = b && Number.isFinite(Number(b.w)) && Number(b.w) > 0
        ? ` [${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)}]`
        : '';
      const mini = win.minimised ? ' [minimised - focus it first]' : '';
      return `${win.app} · ${win.appName || 'app'} — ${win.title || '(untitled)'}${handle}${at}${mini}`;
    })
    .join('\n');
}

/**
 * Built-in tools that always ask first: shell/file writes plus the browser
 * commands that change a page. Read-only browser commands never prompt.
 */
const DEFAULT_GUARDED_TOOLS = [
  'bash',
  'edit',
  'write',
  ...browserGuardedTools(),
  ...browserLocalGuardedTools(),
  ...systemGuardedTools(),
];

/* --------------------------- browser control tools ---------------------------
 * The agent drives the user's own Chrome through a companion extension. Read
 * commands (tabs/read/screenshot/wait/scroll) run freely; everything that
 * changes the page goes through the approval dialog, which is why those names
 * are in DEFAULT_GUARDED_TOOLS.
 */

/** One-line docs per browser tool, kept next to the command they map to. */
const BROWSER_TOOL_DOCS = {
  browser_tabs: {
    description:
      "List the tabs in the user's own Google Chrome that they can hand over, or focus one. This app does not have its own browser window — it drives Chrome through a companion extension the user installed. An empty list usually means the extension is not connected or the user has not paired it yet. Read-only.",
    snippet: 'List or focus the tabs the user handed over',
    props: { tab: { type: 'integer', description: 'Tab id to focus' }, focus: { type: 'boolean' } },
  },
  browser_find_tab: {
    description:
      'Find the open tab whose URL or title contains `match`, and get its id. Use this instead of scanning browser_tabs when a task names a site ("the TikTok upload page", "facebook"). Returns the ids of the tabs already handed over too, so you know which of them you may act on straight away.',
    snippet: 'Find the tab whose url or title matches',
    props: {
      match: { type: 'string', description: 'Text to look for in the url or title, e.g. "tiktok"' },
      limit: { type: 'integer', description: 'Largest number of rows to answer with (default all)' },
    },
  },
  browser_read: {
    description:
      'Read the visible text of the current page (or of one element). Read-only. Use this before clicking so you know what is on screen.',
    snippet: 'Read the text of the current page',
    props: {
      tab: { type: 'integer' },
      selector: { type: 'string', description: 'CSS selector to read only part of the page' },
      maxChars: { type: 'integer', description: 'Truncate the text (default 8000)' },
    },
  },
  browser_snapshot: {
    description:
      'Take a structural snapshot of the page: every element you can act on, each with a ref. Read-only, and the thing to do before acting — click, type and fill by `ref` instead of guessing a CSS selector. Returns at most a few hundred elements; use browser_find when it is cut short.',
    snippet: 'Read the page structure and its element refs',
    props: {
      tab: { type: 'integer' },
      maxNodes: { type: 'integer', description: 'Largest number of elements to show (default 300)' },
    },
  },
  browser_find: {
    description:
      'Search the last snapshot for an element, by the text it shows or by an exact ref. Read-only and cheap: use it when the snapshot was truncated, or when you know what a control says but not where it is.',
    snippet: 'Search the last page snapshot',
    props: {
      tab: { type: 'integer' },
      text: { type: 'string', description: 'Text the element shows' },
      ref: { type: 'string', description: 'An exact ref from the last snapshot' },
      max: { type: 'integer', description: 'Largest number of matches (default 20)' },
    },
  },
  browser_screenshot: {
    description:
      'Take a PNG screenshot of the current tab. Works on background tabs. Use when layout matters or the text alone is not enough.',
    snippet: 'Screenshot the current page',
    props: { tab: { type: 'integer' }, fullPage: { type: 'boolean', description: 'Capture the whole page' } },
  },
  browser_wait: {
    description: 'Wait until a selector or a piece of text appears on the page. Read-only.',
    snippet: 'Wait for the page to show something',
    props: {
      tab: { type: 'integer' },
      ref: { type: 'string', description: 'A ref from the last snapshot' },
      selector: { type: 'string' },
      text: { type: 'string' },
      timeoutMs: { type: 'integer', description: 'Default 10000' },
    },
  },
  browser_scroll: {
    description: 'Scroll the page by a number of pixels.',
    snippet: 'Scroll the current page',
    props: {
      tab: { type: 'integer' },
      ref: { type: 'string', description: 'Scroll this element into view first' },
      dy: { type: 'integer', description: 'Pixels to scroll, default 600' },
    },
  },
  browser_open: {
    description:
      "Open a URL in a tab of the user's own Google Chrome, which they are already signed in to. When a tab has been handed over it is navigated in place; otherwise a scratch tab is opened in the user's window, inside the collapsed NTAPI tab group, usable straight away without a hand-over. It never opens a second window.",
    snippet: 'Open a URL in the user\'s Chrome',
    required: ['url'],
    props: {
      url: { type: 'string' },
      foreground: { type: 'boolean', description: 'Bring the tab to the front' },
    },
  },
  browser_upload: {
    description:
      'Attach local files to a file input — the step that uploads a video or an image. ' +
      'Pass absolute paths in `files`; that alone is enough on Facebook and most sites, because a hidden `input type=file` is found and filled without a ref — shadow DOM and iframes included. ' +
      'On pages that only create the input when their upload button is pressed (TikTok), also pass `text` (the button label) or `selector`: the bridge presses it with a real user gesture and answers the file picker itself. ' +
      'Never ask the user to click the upload button for you — this cannot fail for lack of a gesture. ' +
      'A page can never fill its own file input, but this does not need the page to cooperate. ' +
      'The page then continues on its own; keep going with snapshot/click/wait for the rest of the form. Asks the user for approval, since it reads a file from disk.',
    snippet: 'Choose files for a file input',
    required: ['files'],
    props: {
      tab: { type: 'integer' },
      ref: { type: 'string', description: 'The file input, from the snapshot' },
      selector: { type: 'string', description: 'CSS selector, or the upload button to press when there is no input yet' },
      text: { type: 'string', description: 'Visible text of the upload button, for pages that build the input on click' },
      files: {
        type: 'array',
        description: 'Absolute paths of the files to attach (at most 5)',
        items: { type: 'string' },
      },
    },
  },
  browser_goto: {
    description: 'Navigate the current tab to a URL.',
    snippet: 'Navigate the current tab',
    required: ['url'],
    props: { tab: { type: 'integer' }, url: { type: 'string' } },
  },
  browser_click: {
    description:
      'Click an element on the page. Give a `ref` from browser_snapshot, a CSS selector, visible text, or x/y coordinates. Asks the user for approval.',
    snippet: 'Click something on the page',
    props: {
      tab: { type: 'integer' },
      ref: { type: 'string', description: 'A ref from the last snapshot (preferred)' },
      selector: { type: 'string' },
      text: { type: 'string', description: 'Visible text of the element to click' },
      x: { type: 'number' },
      y: { type: 'number' },
    },
  },
  browser_type: {
    description: 'Type text into an input, as if the user typed it. Asks for approval.',
    snippet: 'Type into a field',
    required: ['text'],
    props: {
      tab: { type: 'integer' },
      ref: { type: 'string', description: 'A ref from the last snapshot (preferred)' },
      selector: { type: 'string' },
      text: { type: 'string' },
      clear: { type: 'boolean', description: 'Clear the field first' },
      submit: { type: 'boolean', description: 'Press Enter afterwards' },
    },
  },
  browser_fill: {
    description: 'Fill several form fields at once. Asks for approval.',
    snippet: 'Fill several form fields',
    required: ['fields'],
    props: {
      tab: { type: 'integer' },
      fields: {
        type: 'array',
        description: 'Fields to fill',
        items: {
          type: 'object',
          properties: {
            ref: { type: 'string', description: 'A ref from the last snapshot (preferred)' },
            selector: { type: 'string' },
            value: { type: 'string' },
          },
        },
      },
    },
  },
  browser_key: {
    description: 'Press a key in the page: Enter, Tab, Escape, Backspace, ArrowUp, ArrowDown. Asks for approval.',
    snippet: 'Press a key',
    props: {
      tab: { type: 'integer' },
      ref: { type: 'string', description: 'Focus this element first (a ref from the last snapshot)' },
      key: { type: 'string' },
    },
  },
  browser_eval: {
    description:
      'Run JavaScript in the page and return its value. Powerful: it can do anything the page can, so it always asks for approval.',
    snippet: 'Run JavaScript in the page',
    required: ['expression'],
    props: { tab: { type: 'integer' }, expression: { type: 'string' } },
  },
  browser_close: {
    description:
      "Close a tab the agent opened, or several at once when tidying up after a job. Only tabs the agent opened itself can be closed — a tab the user handed over is refused, because closing it is the user's decision. Asks for approval.",
    snippet: 'Close an agent tab',
    props: {
      tab: { type: 'integer' },
      tabs: {
        type: 'array',
        items: { type: 'integer' },
        description: 'Agent-opened tab ids to close together (at most 8)',
      },
    },
  },
};

/** The tool list as data, so it can be tested without a session. */
function browserToolSpecs() {
  return Object.keys(BROWSER_TOOLS).map((name) => {
    const doc = BROWSER_TOOL_DOCS[name] || {};
    const entry = BROWSER_TOOLS[name];
    return {
      name,
      cmd: entry.cmd,
      write: entry.write,
      description: doc.description || name,
      promptSnippet: doc.snippet || name,
      parameters: {
        type: 'object',
        properties: doc.props || {},
        ...(doc.required ? { required: doc.required } : {}),
      },
    };
  });
}

/** How a browser tool result becomes content for the model. */
function browserResultContent(spec, result, imagesDir, canSeeImages) {
  if (spec.cmd === 'screenshot' && result.data) {
    if (canSeeImages) {
      return [
        { type: 'image', data: result.data, mimeType: result.mimeType || 'image/png' },
        { type: 'text', text: `Screenshot attached. ${result.url || ''}` },
      ];
    }
    return null; // the caller saves the PNG and returns a path instead
  }
  if (spec.cmd === 'tabs') {
    const list = (result.tabs || []).map((t) => `- [${t.id}] ${t.title} - ${t.url}`).join('\n');
    return list || 'No tabs are open in the NTAPI browser window.';
  }
  if (spec.cmd === 'read') {
    return `${result.title || ''}\n${result.url || ''}

${result.text || ''}`.trim();
  }
  if (Object.prototype.hasOwnProperty.call(result, 'value')) {
    return `${result.title || ''}\n${result.url || ''}

${JSON.stringify(result.value)}`.trim();
  }
  if (spec.cmd === 'dialog') {
    return result.handled ? `Answered the ${result.type} dialog.` : 'No dialog was open on that tab.';
  }
  const head = [result.title, result.url].filter(Boolean).join(' - ');
  const detail = result.clicked
    ? `Clicked ${result.clicked}`
    : result.filled
      ? `Filled ${result.filled} field(s)`
      : result.waited
        ? `Found after ${result.waited}ms`
        : 'Done';
  return `${head}
${detail}`.trim();
}

/**
 * Tools that always take an approval prompt: shell/file writes, plus every MCP
 * tool (`mcp__<server>__<tool>`). An MCP server runs with its own privileges and
 * its tool descriptions can carry instructions, so a call it triggers must be as
 * visible as `bash` — never auto-run.
 */
function isGuardedTool(toolName, guarded = DEFAULT_GUARDED_TOOLS) {
  const name = String(toolName || '');
  return guarded.includes(name) || name.startsWith('mcp__');
}

/** `mcp__server__tool` -> `MCP · server / tool` for the approval dialog. */
function mcpToolLabel(toolName) {
  const name = String(toolName || '');
  const parts = name.split('__');
  if (parts[0] !== 'mcp' || parts.length < 3) return name;
  return `MCP \u00b7 ${parts[1]} / ${parts.slice(2).join('__')}`;
}

/**
 * Build the `loadConfig` callback `createMcpExtension` expects, reading the
 * app's own `<dir>/mcp.json` in the standard `mcpServers` shape. A missing file
 * just means no servers; a malformed file becomes a reported error, not a crash.
 */
function loadAppMcpConfig(dir) {
  return () => {
    const file = path.join(dir, 'mcp.json');
    const servers = [];
    const errors = [];
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if (err && err.code !== 'ENOENT') errors.push(`${file}: ${err.message}`);
      return { servers, errors };
    }
    const map = raw && typeof raw === 'object' ? raw.mcpServers : null;
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      for (const [name, config] of Object.entries(map)) {
        if (!config || typeof config !== 'object' || Array.isArray(config)) continue;
        servers.push({ name, config, source: file, scope: 'global' });
      }
    }
    return { servers, errors };
  };
}

module.exports = {
  createFreePiSession,
  realityPolicyExtension,
  realityPolicyRule,
  REALITY_SECTION,
  adsClientFactory: createAdsClient,
  resolveAuth,
  getAgentDir,
  getCredentialsPath,
  resolveBaseUrl,
  saveJwt,
  CLIENT_VERSION: FALLBACK_CLIENT_VERSION,
  currentClientVersion,
  SAFE_TOOLS,
  PROVIDER_NAME,
  isGuardedTool,
  browserToolSpecs,
  allBrowserToolNames,
  SYSTEM_TOOLS,
  systemToolSpecs,
  systemGuardedTools,
  systemScreenshotContent,
  browserLocalToolSpecs,
  clearSnapshotTable,
  browserResultContent,
  DEFAULT_GUARDED_TOOLS,
  mcpToolLabel,
  loadAppMcpConfig,
};

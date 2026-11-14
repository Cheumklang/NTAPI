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

const { planProviders, FREE_PI_TOOL_NAMES, ZRO_PROVIDER, NVIDIA_PROVIDER, TOKENHARBOR_PROVIDER, LLM7_PROVIDER } = require('./provider-plan');
const { COARENA_PROVIDER, coarenaProviderConfig, coarenaModelEntries, fetchCoarenaModels } = require('./coarena');
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
const FALLBACK_CLIENT_VERSION = '0.6.20';

/**
 * The version header the backend compares against `min` in /client-version.
 * Read it from the installed free-pi-cli so a newer CLI never makes this app
 * look out of date, and fall back to the version the app was written against.
 */
function detectClientVersion() {
  if (process.env.FREEPI_CLIENT_VERSION) return process.env.FREEPI_CLIENT_VERSION;
  const found = [];
  const npxRoot = path.join(os.homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
  try {
    for (const dir of fs.readdirSync(npxRoot)) {
      const pkg = path.join(npxRoot, dir, 'node_modules', 'free-pi-cli', 'package.json');
      try {
        const v = JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
        if (typeof v === 'string' && /^\d+\.\d+\.\d+/.test(v)) found.push(v);
      } catch {}
    }
  } catch {}
  try {
    const v = JSON.parse(
      fs.readFileSync(path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', 'free-pi-cli', 'package.json'), 'utf8')
    ).version;
    if (typeof v === 'string' && /^\d+\.\d+\.\d+/.test(v)) found.push(v);
  } catch {}
  if (!found.length) return FALLBACK_CLIENT_VERSION;
  const rank = (v) => v.split('.').map((n) => Number(n) || 0);
  found.sort((a, b) => {
    const [x, y] = [rank(a), rank(b)];
    for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  });
  return found[found.length - 1];
}
const CLIENT_VERSION = detectClientVersion();

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
      client: { os: process.platform, cli_version: CLIENT_VERSION },
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
  const res = await fetch(new URL('/me', baseUrl), {
    headers: { authorization: `Bearer ${jwt}`, 'x-freepi-features': 'choice-prompts' },
  });
  if (!res.ok) return null;
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
  };
}

function buildProviderConfig(baseUrl, jwt, sessionId, models, name = PROVIDER_NAME) {
  return {
    name,
    baseUrl: completionsBaseUrl(baseUrl),
    apiKey: jwt,
    api: 'openai-completions',
    headers: { 'x-session-id': sessionId, 'x-client-version': CLIENT_VERSION },
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
async function resolveAuth(baseUrl, credentialsPath) {
  let jwt = await loadJwt(credentialsPath);
  if (!jwt) {
    const guest = await startGuestSession(baseUrl);
    await saveJwt(credentialsPath, guest.token);
    jwt = guest.token;
    return { jwt, guest: true, fresh: true };
  }
  const me = await fetchMe(baseUrl, jwt);
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
/** How many images one user turn may look at before it must finish the render. */
const MAX_IMAGE_REVIEWS_PER_TURN = 4;

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
    clientVersion = CLIENT_VERSION,
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
    guardedTools = ['bash', 'edit', 'write'],
    /**
     * Directory the pi SDK treats as its agent root for resource discovery, i.e.
     * skills are read from `<skillsAgentDir>/skills`. Defaults to the CLI dir.
     */
    skillsAgentDir = null,
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
    /** Reasoning level for models that support it: off | minimal | low | medium | high. */
    thinkingLevel = 'off',
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
    /** Zro API key, or null. Zro exposes one DeepSeek model. */
    zroKey = null,
    /** NVIDIA NIM key, or null. Only DeepSeek Flash is exposed, text only. */
    nvidiaKey = null,
    /** Token Harbor key, or null. Only its free DeepSeek route is exposed. */
    tokenharborKey = null,
    /** LLM7 API token, or null. Free turbo models plus the paid pro lane. */
    llm7Key = null,
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
  let auth = null;
  try {
    auth = await resolveFreePiAuth(baseUrl, credentialsPath);
  } catch (err) {
    log(`free-pi auth unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (auth && !auth.jwt) auth = null;

  const catalog = auth ? await fetchCatalog(baseUrl, auth.jwt) : { model: undefined, models: undefined };
  // Every model the account can reach is listed, free and paid alike, each one
  // tagged with its plan. A paid route spends FreePi credits at the multiplier
  // its `usage_x` names, so the row says the cost and the choice is the user's.
  const models = auth ? tagPlans(catalogModelsFor(catalog.models, catalog.model)) : [];
  const defense = auth ? tagPlans(defenseModelsFor(catalog.models)) : [];

  // The catalog is fetched once per process (10-minute memory cache) and never
  // rejects: with no network it returns the verified fallback list.
  const coarenaCatalog = coarenaKey ? await fetchCoarenaModels() : { models: [], source: 'none' };
  // Coarena prices each route in its own catalog, so the plan tag comes from
  // there rather than from a list kept in this file.
  let coarenaModels = tagPlans(coarenaCatalog.models);

  // Zro's picker is deliberately static: the free daily model plus the models
  // that draw on a usage pack.
  const zroModels = activeZroKey ? ZRO_MODELS : [];

  // NVIDIA's free endpoints get retired; keep only the ids the live catalog
  // still lists. Offline keeps the preferred candidate.
  const nvidiaModels = activeNvidiaKey ? await resolveNvidiaModels(activeNvidiaKey) : [];

  // Token Harbor marks free routes with a `:free` suffix; the rest are wallet.
  const tokenharborModels = activeTokenHarborKey
    ? await resolveTokenHarborModels(activeTokenHarborKey)
    : [];

  // LLM7's catalog is public and carries its own tier and prices, so it is
  // fetched whenever a token is saved and never trimmed here: the picker labels
  // the free turbo lane against the paid pro one.
  const llm7Catalog = activeLlm7Key
    ? await fetchLlm7Models()
    : { models: [], source: 'none' };
  const llm7Models = activeLlm7Key ? tagPlans(llm7Catalog.models) : [];

  const sessionId = sessionManager.getSessionId();
  const plan = planProviders({
    hasFreePiAuth: Boolean(auth),
    coarenaKey: activeCoarenaKey,
    zroKey: activeZroKey,
    nvidiaKey: activeNvidiaKey,
    tokenharborKey: activeTokenHarborKey,
    llm7Key: activeLlm7Key,
    freePiModels: models,
    coarenaModels,
    zroModels,
    nvidiaModels,
    tokenharborModels,
    llm7Models,
  });
  if (!plan.available) {
    throw new Error(
      'No AI provider available — sign in to FreePi or add a Coarena, Zro, NVIDIA, Token Harbor or LLM7 key in Settings.'
    );
  }
  log(
    `providers: free-pi=${plan.freePi ? models.length : 0}, ` +
      `coarena=${plan.coarena ? coarenaModels.length : 0} (catalog ${coarenaCatalog.source}), ` +
      `zro=${plan.zro ? zroModels.length : 0}, ` +
      `nvidia=${plan.nvidia ? nvidiaModels.length : 0}, ` +
      `tokenharbor=${plan.tokenharbor ? tokenharborModels.length : 0}, ` +
      `llm7=${plan.llm7 ? llm7Models.length : 0} (catalog ${llm7Catalog.source})`
  );

  // Ads: one per user turn, tagged with the turn id the completion carries.
  // A Coarena-only session gets a stub so the rest of the handle stays uniform.
  const ads = plan.ads
    ? createAdsClient({
        baseUrl,
        getToken: () => auth.jwt,
        sessionId,
        clientVersion: CLIENT_VERSION,
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
      // Images accumulate in history every time a model reads one. Trim before
      // each provider call, under every provider's per-request cap.
      pi.on('context', (event) => ({
        messages: pruneImages(event.messages, MAX_REQUEST_IMAGES, MAX_REQUEST_IMAGE_BYTES),
      }));
      // No session-wide Authorization override: each provider config carries
      // its own apiKey and pi-ai sets the Bearer header per request.

      if (typeof requestApproval === 'function') {
        pi.on('tool_call', async (event) => {
          if (!guardedTools.includes(event.toolName)) return undefined;
          let allowed = false;
          try {
            allowed = await requestApproval({
              toolName: event.toolName,
              // pi's `tool_call` event carries the arguments as `input`.
              args: event.input ?? event.toolCall?.arguments ?? event.args ?? {},
            });
          } catch {
            allowed = false;
          }
          if (!allowed) {
            return { block: true, reason: `${event.toolName} was declined by the user` };
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
        if (event.systemPrompt.includes('## Image review')) return;
        const rule =
          `\n\n## Image review\n` +
          `Do not inspect rendered frames one by one. Finish the render and let the user watch the video. ` +
          `Use look_at_image only for a key frame or an attached image, at most ${MAX_IMAGE_REVIEWS_PER_TURN} times per turn; ` +
          `use ffprobe, file size or the command output for technical checks.`;
        return { systemPrompt: event.systemPrompt + rule };
      });

      pi.registerTool({
        name: 'look_at_image',
        label: 'Look At Image',
        description:
          `Look at a PNG, JPEG or WebP image inside the project folder. When the current model can see images the image is attached directly; otherwise it is sent to a separate vision model. ` +
          `Use it sparingly: at most ${MAX_IMAGE_REVIEWS_PER_TURN} images per turn, and never to review every rendered frame — the user watches the finished video.`,
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
          const model = ctx?.getModel?.() || visionSession?.model;
          if (model?.input?.includes('image')) {
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
  const defaultTools = plan.freePiTools ? [...SAFE_TOOLS, ...FREE_PI_TOOL_NAMES] : [...SAFE_TOOLS];

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
      // Fail a stalled turn in this window instead of after pi's five-minute
      // default: silence is otherwise indistinguishable from a frozen app.
      httpIdleTimeoutMs: providerIdleTimeoutMs(),
    },
    { projectTrusted: true }
  );

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
        ...(plan.freePiTools ? [visionExtension, extraToolsExtension] : []),
        downloadsPolicyExtension,
        todoExtension,
        ...(askUserExtension ? [askUserExtension] : []),
        // The CLI loads these as built-in extensions; an SDK session must add
        // them explicitly. MCP reads mcp.json from the agent directory, so any
        // server added with `free-pi-cli mcp add` shows up here too.
        ...(sdk.createMcpExtension ? [sdk.createMcpExtension()] : []),
        ...(sdk.createCodemodeExtension ? [sdk.createCodemodeExtension({ mode: 'on' })] : []),
        ...(sdk.createToolSearchExtension ? [sdk.createToolSearchExtension()] : []),
      ],
    },
  });

  const { session } = await sdk.createAgentSessionFromServices({
    services,
    sessionManager,
    tools: defaultTools,
  });
  visionSession = session;

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
    // Every route the new key can reach, labelled free or paid.
    coarenaModels = tagPlans(result.models);
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

  return {
    session,
    services,
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
    applyZroKey,
    applyNvidiaKey,
    applyTokenHarborKey,
    applyLlm7Key,
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

module.exports = {
  createFreePiSession,
  adsClientFactory: createAdsClient,
  resolveAuth,
  getAgentDir,
  getCredentialsPath,
  resolveBaseUrl,
  saveJwt,
  CLIENT_VERSION,
  SAFE_TOOLS,
  PROVIDER_NAME,
};

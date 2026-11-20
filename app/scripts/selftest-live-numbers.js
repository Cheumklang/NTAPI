/**
 * Numbers that move.
 *
 * The credits and the context percentage used to be written straight into the
 * element once per turn, so a reader saw a jump and no size: 12% could be a
 * rounding change or a third of the window. They are counted now, with a decimal
 * while they run, a short flash when they land, and a meter that polls while a
 * turn is in flight instead of waiting for it to end. A switch in Settings turns
 * the counting off for anyone who finds it distracting.
 *
 * Run from app/:   node scripts/selftest-live-numbers.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');

function body(src, name) {
  const at = src.indexOf(`function ${name}(`);
  if (at === -1) return '';
  const start = at >= 6 && src.slice(at - 6, at) === 'async ' ? at - 6 : at;
  let parens = 0;
  let afterParams = -1;
  for (let i = src.indexOf('(', start); i < src.length; i += 1) {
    if (src[i] === '(') parens += 1;
    else if (src[i] === ')') {
      parens -= 1;
      if (parens === 0) {
        afterParams = i;
        break;
      }
    }
  }
  if (afterParams === -1) return '';
  const brace = src.indexOf('{', afterParams);
  let depth = 0;
  for (let i = brace; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}

/* --------------------------------------------------------- what was written */

const paintSrc = body(app, 'paintNumber');
const flashSrc = body(app, 'flashNumber');
const fxSrc = body(app, 'numberFxEnabled');
const pctSrc = body(app, 'pctText');

check('the tween exists', paintSrc !== '');
check('the count takes about a second', /const NUMBER_TWEEN_MS = 1200;/.test(app));
check('it starts from what the eye last saw', /dataset\.value/.test(paintSrc));
check('a second update continues the first', /const pending = numberTweens\.get\(node\);\n\s*if \(pending\) cancelAnimationFrame\(pending\);/.test(paintSrc));
check('reduced motion is respected', /prefers-reduced-motion/.test(paintSrc));
check('the same value is not animated', /if \(still \|\| from === target \|\| !numberFxEnabled\(\)\)/.test(paintSrc));
check('the count can be switched off', /const NUMBER_FX_KEY = 'ntapi\.numberFx';/.test(app) && fxSrc !== '');
check('a running number carries a decimal', pctSrc !== '' && /value\.toFixed\(1\)/.test(pctSrc) && /String\(Math\.round\(value\)\)/.test(pctSrc));
check('arriving is marked', flashSrc !== '' && /num-pop/.test(flashSrc));

/** A fake frame clock: each test drives the animation by hand. */
function makeScope({ reduced = false, enabled = true } = {}) {
  const cancelled = [];
  const frames = [];
  const store = { value: enabled ? null : '0' };
  let now = 0;
  let nextId = 1;
  const scope = {
    numberTweens: new WeakMap(),
    localStorage: {
      getItem: () => store.value,
      setItem: (_k, v) => {
        store.value = v;
      },
    },
    window: { matchMedia: () => ({ matches: reduced }) },
    performance: { now: () => now },
    requestAnimationFrame: (fn) => {
      const id = nextId;
      nextId += 1;
      frames.push({ id, fn });
      return id;
    },
    cancelAnimationFrame: (id) => cancelled.push(id),
    NUMBER_FLASH_MS: 460,
    NUMBER_TWEEN_MS: 1200,
    NUMBER_FX_KEY: 'ntapi.numberFx',
    store,
  };
  const bundle = `${fxSrc}\n${pctSrc}\n${flashSrc}\n${paintSrc}\nreturn { paintNumber, flashNumber, pctText };`;
  const made = new Function('scope', `with (scope) { ${bundle} }`)(scope);
  return {
    paint: (node, target, format) => made.paintNumber(node, target, format),
    cancelled,
    scope,
    store,
    /** Run every queued frame at a given time, in order. */
    tick(time) {
      now = time;
      const queued = frames.splice(0, frames.length);
      for (const frame of queued) frame.fn(time);
    },
    pending: () => frames.length,
  };
}

function makeNode() {
  const classes = new Set();
  return {
    textContent: '',
    dataset: {},
    offsetWidth: 0,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    classes,
  };
}

/* ------------------------------------------------------------- the behaviour */

(() => {
  const el = makeNode();
  const fmt = (v, live) => `${live ? Number(v).toFixed(1) : Math.round(v)}%`;

  // A first ever reading has nothing to count from: it is simply written.
  const fresh = makeScope();
  fresh.paint(el, 40, fmt);
  check('a first reading is painted at once', el.textContent === '40%' && fresh.pending() === 0, el.textContent);

  // A later reading counts from the number already on screen.
  el.dataset.value = '0';
  el.textContent = '0%';
  const first = makeScope();
  first.paint(el, 40, fmt);
  first.tick(0);
  check('the first frame starts at the old value', el.textContent === '0.0%', el.textContent);
  first.tick(600);
  const middle = Number(String(el.textContent).replace('%', ''));
  check('the middle of the count is between the two numbers', middle > 0 && middle < 40, el.textContent);
  check('and it still shows the decimal on the way', /\.\d%/.test(el.textContent), el.textContent);
  first.tick(1200);
  check('the count lands exactly on the target', el.textContent === '40%', el.textContent);
  check('arriving flashes the number', el.classes.has('num-pop'));

  const two = makeScope();
  two.paint(el, 90, fmt);
  two.tick(0);
  check('the next update starts from 40, not from nowhere', el.textContent === '40.0%', el.textContent);
  two.tick(1200);
  check('and climbs to 90', el.textContent === '90%', el.textContent);
  check('a fresh tween leaves nothing queued', two.pending() === 0);

  const interrupted = makeScope();
  interrupted.paint(el, 12, fmt);
  interrupted.paint(el, 60, fmt);
  check('a new value cancels the frame in flight', interrupted.cancelled.length === 1);
  interrupted.tick(1200);
  check('the newest value wins', el.textContent === '60%', el.textContent);

  const off = makeScope({ enabled: false });
  el.dataset.value = '10';
  el.textContent = '10%';
  off.paint(el, 55, fmt);
  check('the switch off paints without counting', el.textContent === '55%' && off.pending() === 0, el.textContent);

  const still = makeScope({ reduced: true });
  el.dataset.value = '55';
  still.paint(el, 7, fmt);
  check('reduced motion paints at once', el.textContent === '7%', el.textContent);
  check('and schedules no frames', still.pending() === 0);

  const junk = makeScope();
  const before = el.textContent;
  junk.paint(el, NaN, fmt);
  check('a missing number is left alone', junk.pending() === 0 && el.textContent === before);

  /* ------------------------------------------------------------- the sources */

  const usage = body(app, 'applyUsageLabels');
  check('credits count down, not jump', /paintNumber\(el\('usageCost'\), remaining/.test(usage));
  check('the credits keep their denominator', /Math\.round\(v\)\.toLocaleString\(\)\} \/ \$\{allowance\.toLocaleString\(\)\}/.test(usage));
  check('the usage percentage is counted too', /paintNumber\(el\('usagePct'\), usedPct, pctText\)/.test(usage));
  check('a placeholder forgets the old number', /el\('usageCost'\)\.removeAttribute\('data-value'\)/.test(app));

  const ctx = body(app, 'paintContext');
  check('the context pill is counted', /paintNumber\(pctEl, pct, pctText\)/.test(ctx));
  check('and so is the copy inside the popover', /if \(barPct\) paintNumber\(barPct, pct, pctText\)/.test(ctx));
  check('“—” forgets the old number as well', /pctEl\.removeAttribute\('data-value'\)/.test(ctx));

  /* ------------------------------------------------------- the live refresh */

  // A payload without figures used to blank the meter, so the percentage emptied
  // for a frame right before it started counting.
  check('a payload with no figures keeps the last reading', /if \(!clear && pctEl\.dataset\.value !== undefined\) return;/.test(app));
  check('only a chat change clears it', /paintContext\(state\.stats \|\| null, \{ clear: tabChanged \}\)/.test(app));
  check('the first paint still starts empty', /paintContext\(null, \{ clear: true \}\)/.test(app));
  check('an empty token payload does not wipe the table', /dataset\.tab === String\(view && view\.tabId\)/.test(app));

  check(
    'the meter has a live tick',
    /setInterval\(\(\) => \{[\s\S]{0,200}refreshContextMeter\(\);\n\}, 800\);/.test(app)
  );
  check('the tick only runs during a turn', /if \(!view \|\| !view\.busy\) return;/.test(app));
  check(
    'the meter still refreshes on events as well as on the clock',
    (app.match(/refreshContextMeter\(\);/g) || []).length >= 4
  );
  const tokens = body(app, 'paintTokenUsage');
  check('the session totals count too', (tokens.match(/count\('tok/g) || []).length === 6);
  check('and the cost line is left as text', /set\('tokCost', costText\(usage\)\)/.test(tokens));
  check('a cleared total forgets its old number', /el\(id\)\?\.removeAttribute\('data-value'\)/.test(tokens));
  check('a column of figures does not strobe', /paintNumber\(node, Number\(value\) \|\| 0, num, \{ flash: false \}\)/.test(tokens));
  check('and the flash can be switched off per call', /options\.flash !== false/.test(paintSrc));
  check(
    'the panel cannot grow a digit and slide',
    /\.tok-value \{[^}]*min-width: 13ch;/.test(css) && /\.tok-delta \{[^}]*min-width: 10ch;/.test(css)
  );
  check('the token columns keep their width', /\.tok-value,\n\.tok-delta \{\n  font-variant-numeric: tabular-nums;/.test(css));

  check('the bars animate as well', /transition: width \.45s ease/.test(css) && /transition: width \.3s ease/.test(css));
  check('the digits keep their width so the pill does not twitch', /font-variant-numeric: tabular-nums/.test(css));
  check('the flash is drawn', /@keyframes num-pop/.test(css));
  check('the flash changes colour without swelling', !/text-shadow/.test(body(css, 'num-pop') || css.slice(css.indexOf('@keyframes num-pop'), css.indexOf('@keyframes num-pop') + 220)));
  check(
    'a counting percentage cannot change width',
    /#usagePct,\n#contextPct,\n#contextBarPct \{[^}]*min-width: 7ch;[^}]*text-align: right;/.test(css)
  );
  check(
    'reduced motion turns the flash off too',
    /@media \(prefers-reduced-motion: reduce\) \{\n {2}\.num-pop \{\n {4}animation: none;/.test(css)
  );

  /* ------------------------------------------------------------------ switch */

  check('the switch is in Settings', /id="setNumberFx"/.test(html) && /data-i18n="statusFxLabel"/.test(html));
  check('the switch is wired', /el\('setNumberFx'\)/.test(app) && /localStorage\.setItem\(NUMBER_FX_KEY/.test(app));
  check('the switch repaints what is already on screen', /if \(lastUsage\) applyUsageLabels\(lastUsage\);/.test(app));
  check('the label is translated both ways', (app.match(/statusFxLabel: '/g) || []).length === 2);
  check('and so is the explanation', (app.match(/statusFxHint:/g) || []).length === 2);
  check('the explanation says it costs nothing', /costs no tokens/i.test(app));

  if (failed) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
  }
  console.log('\nPASS: the status numbers count in, land with a flash, and can be switched off');
})();

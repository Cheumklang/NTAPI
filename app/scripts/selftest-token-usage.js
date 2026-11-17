#!/usr/bin/env node
/*
 * The token figures in the status panel have to be right, because they are the
 * only place a person can see what a conversation is costing them.
 *
 * Two things are tested here, both offline:
 *   1. usage-totals.js — the arithmetic behind the five rows.
 *   2. fx-rate.js — the USD→THB lookup that turns a price into baht, including
 *      every way it can fail (the panel must still paint).
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { usageTotals, recentTurns } = require(path.join(__dirname, '..', 'src', 'usage-totals.js'));
const fx = require(path.join(__dirname, '..', 'src', 'fx-rate.js'));

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (err) {
    fail += 1;
    console.log(`FAIL ${name}: ${err.message}`);
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (err) {
    fail += 1;
    console.log(`FAIL ${name}: ${err.message}`);
  }
}

const user = { role: 'user' };
const reply = (usage) => ({ role: 'assistant', usage });
function usage(input, output, cacheRead = 0, extra = {}) {
  return {
    input,
    output,
    cacheRead,
    cacheWrite: 0,
    reasoning: 0,
    cost: { total: 0, totalFromProvider: false },
    ...extra,
  };
}
const answer = (input, output, cacheRead = 0, extra = {}) => usageTotals([user, reply(usage(input, output, cacheRead, extra))]);

check('the five rows add up the way the panel promises', () => {
  // sent = input + cache; sent+replied = input + output; total = input + cache + output
  const t = answer(100, 50, 900);
  assert.strictEqual(t.calls, 1);
  assert.strictEqual(t.input, 100);
  assert.strictEqual(t.cache, 900);
  assert.strictEqual(t.sentAll, 1000);
  assert.strictEqual(t.received, 50);
  assert.strictEqual(t.sentPlusReplied, 150);
  assert.strictEqual(t.total, 1050);
});

check('cached tokens are never quietly folded into the prompt', () => {
  // The whole point of the separate row: 900 tokens were read from cache, not sent fresh.
  const t = answer(100, 50, 900);
  assert.strictEqual(t.input, 100, 'input must stay the new tokens');
  assert.notStrictEqual(t.sentAll, t.input);
});

check('cacheRead and cacheWrite are both counted as cache', () => {
  const t = answer(10, 5, 200, { cacheWrite: 50 });
  assert.strictEqual(t.cache, 250);
  assert.strictEqual(t.total, 265);
});

check('one turn with three tool calls is one turn and three calls', () => {
  const t = usageTotals([user, reply(usage(10, 1)), reply(usage(20, 2)), reply(usage(30, 3))]);
  assert.strictEqual(t.calls, 3);
  assert.strictEqual(t.turns.length, 1);
  assert.strictEqual(t.turns[0].calls, 3);
  assert.strictEqual(t.turns[0].input, 60);
  assert.strictEqual(t.total, 66);
});

check('the session total sums every turn', () => {
  const t = usageTotals([user, reply(usage(10, 1)), user, reply(usage(20, 2))]);
  assert.strictEqual(t.turns.length, 2);
  assert.strictEqual(t.input, 30);
  assert.strictEqual(t.total, 33);
});

check('the panel compares the turn on screen with the one before it', () => {
  const t = usageTotals([
    user, reply(usage(50, 10)),
    user, reply(usage(100, 20)),
    user, reply(usage(300, 40)),
  ]);
  assert.deepStrictEqual(t.recent.map((turn) => turn.total), [120, 340]);
  // The earlier of the two is measured against the turn before IT, not against
  // zero: its own growth is what the newest turn is being compared with.
  assert.strictEqual(t.recent[0].delta.total, 60);
  assert.strictEqual(t.recent[1].delta.total, 220);
  assert.strictEqual(t.recent[1].delta.sentAll, 200);
  assert.strictEqual(t.recent[1].delta.received, 20);
});

check('a turn that shrank reports a negative change', () => {
  const t = usageTotals([user, reply(usage(500, 100)), user, reply(usage(100, 10))]);
  assert.ok(t.recent[1].delta.total < 0, 'a smaller turn must not read as growth');
  assert.strictEqual(t.recent[1].delta.total, -490);
});

check('a single turn has nothing to compare, so it carries no delta', () => {
  const t = usageTotals([user, reply(usage(5, 5))]);
  assert.strictEqual(t.recent.length, 1);
  assert.strictEqual(t.recent[0].delta, null);
  assert.deepStrictEqual(recentTurns(null), []);
  assert.deepStrictEqual(recentTurns(usageTotals([])), []);
});

check('only the last two turns are offered, however long the chat is', () => {
  const messages = [];
  for (let i = 1; i <= 9; i += 1) messages.push(user, reply(usage(i, 0)));
  assert.deepStrictEqual(recentTurns(usageTotals(messages)).map((turn) => turn.total), [8, 9]);
});

check('reasoning tokens are not added to the reply twice', () => {
  // Providers report reasoning as a subset of output; adding it would overstate every reply.
  const t = answer(0, 40, 0, { reasoning: 40 });
  assert.strictEqual(t.received, 40);
  assert.strictEqual(t.total, 40);
});

check('a provider that reports nothing simply contributes nothing', () => {
  const t = usageTotals([user, { role: 'assistant' }, { role: 'assistant', usage: null }]);
  assert.strictEqual(t.calls, 0);
  assert.strictEqual(t.total, 0);
  assert.strictEqual(t.turns.length, 0);
});

check('junk in a usage block cannot produce NaN on screen', () => {
  const t = usageTotals([user, reply({ input: 'x', output: null, cacheRead: -5, cost: { total: 'free' } })]);
  assert.strictEqual(t.input, 0);
  assert.strictEqual(t.output, 0);
  assert.strictEqual(t.cache, 0);
  assert.strictEqual(t.total, 0);
  assert.strictEqual(t.costUsd, 0);
});

check('cost adds up across the requests of one turn', () => {
  const t = usageTotals([
    user,
    reply(usage(1, 1, 0, { cost: { total: 0.01, totalFromProvider: true } })),
    reply(usage(1, 1, 0, { cost: { total: 0.02, totalFromProvider: true } })),
  ]);
  assert.ok(Math.abs(t.costUsd - 0.03) < 1e-9, `costUsd was ${t.costUsd}`);
});

check('a zero price is only called free when the provider said so', () => {
  // FreePi is free by design; any other provider that reports 0 without a price
  // table must read "unknown", never "free".
  assert.strictEqual(answer(5, 5).costReported, false);
  assert.strictEqual(answer(5, 5).free, false);
  assert.strictEqual(usageTotals([user, reply(usage(5, 5))], { free: true }).free, true);
  const priced = answer(5, 5, 0, { cost: { total: 0, totalFromProvider: true } });
  assert.strictEqual(priced.costReported, true);
});

/* ------------------------------ fx-rate ------------------------------ */

const okFetch = (value) => async () => ({ ok: true, json: async () => value });
const badFetch = (status) => async () => ({ ok: false, status });
const throwFetch = () => async () => {
  throw new Error('offline');
};

async function fxChecks() {
  await checkAsync('a good rate is returned and remembered', async () => {
    fx.resetCache();
    let calls = 0;
    const res = await fx.fetchUsdThb({
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, json: async () => ({ rates: { THB: 36.5 } }) };
      },
    });
    assert.strictEqual(res.rate, 36.5);
    assert.strictEqual(res.cached, false);
    const again = await fx.fetchUsdThb({ fetchImpl: throwFetch() });
    assert.strictEqual(again.rate, 36.5, 'the remembered rate is reused');
    assert.strictEqual(again.cached, true);
    assert.strictEqual(calls, 1, 'only one network call');
  });

  await checkAsync('a failed lookup keeps the last good rate instead of blanking the price', async () => {
    fx.resetCache();
    await fx.fetchUsdThb({ fetchImpl: okFetch({ rates: { THB: 35 } }) });
    const res = await fx.fetchUsdThb({ fetchImpl: badFetch(500), force: true });
    assert.strictEqual(res.rate, 35);
    assert.strictEqual(res.stale, true);
    assert.match(res.error, /500/);
  });

  await checkAsync('no rate in the payload is an error, not a zero', async () => {
    fx.resetCache();
    const res = await fx.fetchUsdThb({ fetchImpl: okFetch({ rates: {} }) });
    assert.strictEqual(res.rate, null);
    assert.strictEqual(res.error, 'no-rate');
  });

  await checkAsync('a network throw never rejects into the paint', async () => {
    fx.resetCache();
    const res = await fx.fetchUsdThb({ fetchImpl: throwFetch() });
    assert.strictEqual(res.rate, null);
    assert.strictEqual(res.error, 'offline');
  });

  await checkAsync('force bypasses the six-hour cache', async () => {
    fx.resetCache();
    let calls = 0;
    const impl = async () => {
      calls += 1;
      return { ok: true, json: async () => ({ rates: { THB: 30 + calls } }) };
    };
    await fx.fetchUsdThb({ fetchImpl: impl });
    const forced = await fx.fetchUsdThb({ fetchImpl: impl, force: true });
    assert.strictEqual(calls, 2);
    assert.strictEqual(forced.rate, 32);
  });
}

/* ------------------------------ wiring ------------------------------ */

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function wiringChecks() {
  check('the panel gets its figures from the main process, not from a guess', () => {
    const main = read('src/main.js');
    const preload = read('src/preload.js');
    const renderer = read('src/renderer/app.js');
    const html = read('src/renderer/index.html');
    assert.match(main, /usage: safeCall\(\(\) => usageTotals\(tab\.handle\.session\.messages/);
    assert.match(main, /ipcMain\.handle\('fx:usdThb'/);
    assert.match(preload, /getUsdThb: \(\) => ipcRenderer\.invoke\('fx:usdThb'\)/);
    for (const id of ['tokTotal', 'tokSent', 'tokSentNew', 'tokSentCache', 'tokReceived', 'tokSentPlus', 'tokCost', 'tokPrevList']) {
      assert.ok(html.includes(`id="${id}"`), `${id} is missing from the panel`);
    }
    assert.match(renderer, /function paintTokenUsage/);
    // The rate is asked for only when a price is actually on screen.
    assert.match(renderer, /if \(usd > 0\) \{[\s\S]{0,220}ensureUsdThb\(\)/);
    // Baht for Thai, dollars for English.
    assert.match(renderer, /lang === 'th'[\s\S]{0,120}฿/);
    // Cache has its own heading, so no figure is left unexplained.
    assert.ok(html.includes('tokGroupSent'), 'cache and tokens share one list');
    assert.ok(html.includes('tokGroupSession'), 'no heading over the session figures');
    assert.ok(/data-i18n="tokSentCache"/.test(html));
    // The comparison names the two turns instead of numbering them.
    assert.match(renderer, /tokTurnNow/);
    assert.match(renderer, /tokTurnPrev/);
    assert.match(renderer, /class = 'tok-delta|tok-delta mono/);
    for (const key of ['tokGroupSession', 'tokGroupSent', 'tokTurnPrev', 'tokTurnNow', 'tokDeltaCol', 'tokTotalCol']) {
      assert.strictEqual(renderer.split(`${key}:`).length - 1, 2, `${key} is not translated twice`);
    }
  });
}

(async () => {
  await fxChecks();
  wiringChecks();

  if (fail) {
    console.log(`\n${fail} check(s) failed`);
    process.exit(1);
  }
  console.log(`\n${pass} checks passed`);
})();
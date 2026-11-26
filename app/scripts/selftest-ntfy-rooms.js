/**
 * Two chats must never share an ntfy room.
 *
 * The panel switches notifications on for the chat on screen; every chat keeps
 * its own topic, so a command typed for one chat can never arrive in another.
 * This walks the flows a reader actually hits: a brand-new chat, switching back
 * and forth, turning one chat off while another stays on, a tab that gains its
 * session file, and a restart (2026-11-26).
 *
 * Run: node scripts/selftest-ntfy-rooms.js
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createNtfyService } = require('../src/ntfy-service');

let failures = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
}

const fakeSafeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: (value) => Buffer.from(value),
  decryptString: (buffer) => buffer.toString('utf8'),
};

/** A client that records which room each publish went to and keeps the streams. */
function makeClient() {
  const streams = new Map(); // topic -> onMessage
  const published = [];
  const client = {
    ...require('../src/ntfy'),
    fetchServerConfig: async () => ({ ok: true, login: false, signup: false }),
    fetchAccount: async () => ({ ok: false, status: 401 }),
    subscribe: async (server, { topic, onMessage, onOpen }) => {
      streams.set(topic, onMessage);
      if (onOpen) onOpen({ topic });
    },
    publish: async (server, payload) => {
      published.push(payload.topic);
      return { ok: true, status: 200, id: `id-${published.length}`, sentTo: payload.topic };
    },
  };
  return { client, streams, published };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-ntfy-rooms-'));
  const { client, streams, published } = makeClient();

  const heard = [];
  const service = createNtfyService({ dir, safeStorage: fakeSafeStorage, client, log: () => {} });
  service.setEmitter((type, payload) => {
    if (type === 'message') heard.push({ sessionKey: payload.sessionKey, text: payload.message?.message });
  });
  service.load();

  /* ---- a brand-new chat ---- */
  const A = 'file:/sessions/a.jsonl';
  const B = 'file:/sessions/b.jsonl';

  service.setActiveSession(A);
  check('a new chat starts switched off', service.state().enabled === false);
  check('and has no room of its own', service.state().topic === null);
  const refusedFresh = await service.publish({ message: 'hello?' });
  check('a chat nobody switched on refuses to publish', refusedFresh.ok === false, refusedFresh.error);

  /* ---- switching one on ---- */
  const onA = service.setEnabled(true);
  const topicA = onA.state.topic;
  check('switching a chat on gives it a room', /^ntapi-/.test(topicA || ''), topicA);
  const sentA = await service.publish({ message: 'from chat A' });
  check('a message goes to that room only', published.at(-1) === topicA, published);

  /* ---- a second chat opened afterwards ---- */
  const onB0 = service.setActiveSession(B);
  check('a chat opened later starts off too', onB0.enabled === false && onB0.topic === null, onB0);
  check('the first chat is untouched by opening a second', onB0.rooms[A].enabled === true && onB0.rooms[A].topic === topicA, onB0.rooms);

  const onB = service.setEnabled(true);
  const topicB = onB.state.topic;
  check('the second chat gets a room of its own', /^ntapi-/.test(topicB || '') && topicB !== topicA, {
    topicA,
    topicB,
  });
  await service.publish({ message: 'from chat B' });
  check('a message from the second chat goes to its own room', published.at(-1) === topicB, published.at(-1));
  check('no two chats share a room', new Set(Object.values(onB.state.rooms).map((r) => r.topic)).size === 2, onB.state.rooms);

  /* ---- messages do not cross ---- */
  heard.length = 0;
  streams.get(topicA)?.({ id: 'm1', time: Date.now() + 1000, message: 'typed for A' });
  streams.get(topicB)?.({ id: 'm2', time: Date.now() + 1000, message: 'typed for B' });
  await new Promise((r) => setTimeout(r, 20));
  check(
    'a message for A is announced for A only',
    heard.filter((h) => h.sessionKey === A).length === 1 && heard.filter((h) => h.sessionKey === B).length === 1,
    heard
  );
  check('and the text that arrived is the text sent', heard.map((h) => h.text).sort().join('|') === 'typed for A|typed for B', heard);

  /* ---- back and forth ---- */
  let stable = true;
  for (let i = 0; i < 5; i += 1) {
    const backA = service.setActiveSession(A);
    if (backA.enabled !== true || backA.topic !== topicA) stable = false;
    const backB = service.setActiveSession(B);
    if (backB.enabled !== true || backB.topic !== topicB) stable = false;
  }
  check('switching back and forth five times changes nothing', stable);
  check('and makes no extra rooms', Object.keys(service.state().rooms).length === 2, Object.keys(service.state().rooms));

  /* ---- one chat off, the other keeps working ---- */
  service.setActiveSession(A);
  const offA = service.setEnabled(false);
  check('turning a chat off is reported', offA.state.enabled === false);
  check('and it stops being connected', offA.state.status.connected === false, offA.state.status);
  const refusedOff = await service.publish({ message: 'still there?' });
  check('a chat switched off keeps its room, so publishing still works', refusedOff.ok === true, refusedOff);
  const bStill = service.setActiveSession(B);
  check('the other chat is still on', bStill.enabled === true && bStill.topic === topicB, bStill);

  /* ---- a tab that gains its session file ---- */
  const C = 'tab:9';
  const Cf = 'file:/sessions/c.jsonl';
  service.setActiveSession(C);
  service.setEnabled(true);
  const topicC = service.state().topic;
  service.rekey(C, Cf);
  const movedC = service.setActiveSession(Cf);
  check('a chat that gains its file keeps its room', movedC.enabled === true && movedC.topic === topicC, movedC);
  check('and the others are untouched', movedC.rooms[A].topic === topicA && movedC.rooms[B].topic === topicB, movedC.rooms);

  /* ---- a restart ---- */
  const reloaded = createNtfyService({ dir, safeStorage: fakeSafeStorage, client, log: () => {} });
  reloaded.load();
  const afterA = reloaded.setActiveSession(A);
  check('after a restart A is still off', afterA.enabled === false && afterA.topic === topicA, afterA);
  const afterB = reloaded.setActiveSession(B);
  check('after a restart B is still on with the same room', afterB.enabled === true && afterB.topic === topicB, afterB);
  const afterC = reloaded.setActiveSession(Cf);
  check('after a restart the moved chat keeps its room', afterC.enabled === true && afterC.topic === topicC, afterC);
  check(
    'after a restart no two chats share a room',
    new Set([afterA.rooms[A].topic, afterA.rooms[B].topic, afterA.rooms[Cf].topic]).size === 3,
    afterA.rooms
  );

  service.stop();
  reloaded.stop();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(failures ? `\n${failures} ntfy room check(s) failed` : '\nAll ntfy room checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});

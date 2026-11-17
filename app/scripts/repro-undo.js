#!/usr/bin/env node
/*
 * Repro for the undo bug: "undo brings the message back into the input box,
 * but the bubble stays in the chat".
 *
 * Runs the REAL SDK fully offline (faux provider), drives two turns, then calls
 * the exact undo sequence the app's bridge uses and prints `session.messages`
 * before and after. If the projection still contains the undone message after
 * the leaf moved, the state the UI draws from is stale — that is the bug.
 *
 * Dev aid, not a test. Run from app/:  node scripts/repro-undo.js
 */
process.env.PI_OFFLINE = '1';
const path = require('node:path');
const sdk = require(path.join(__dirname, '..', 'node_modules', '@earendil-works', 'pi-coding-agent'));
const piAi = require(path.join(__dirname, '..', 'node_modules', '@earendil-works', 'pi-ai'));

const show = (label, messages) => {
  console.log(`\n--- ${label} ---`);
  for (const m of messages || []) {
    const text = Array.isArray(m.content)
      ? m.content.filter((c) => c.type === 'text').map((c) => c.text).join('')
      : String(m.content || '');
    console.log(`${m.role} :: ${text.slice(0, 42).replace(/\n/g, ' ')}  [ts=${m.timestamp}]`);
  }
};

(async () => {
  const faux = piAi.fauxProvider();
  const modelRuntime = await sdk.ModelRuntime.create({ modelsPath: null, refreshOnCreate: false });
  modelRuntime.registerNativeProvider(faux.provider);
  const model = modelRuntime.getModel('faux', 'faux-1');
  if (!model) {
    console.log('faux model did not register; models =', modelRuntime.getModels('faux').map((m) => m.id));
    process.exit(2);
  }

  faux.setResponses([
    piAi.fauxAssistantMessage('answer one'),
    piAi.fauxAssistantMessage('answer two'),
  ]);

  const { session } = await sdk.createAgentSession({ model, thinkingLevel: 'off', modelRuntime });
  try {
    await session.prompt('first question');
    await session.prompt('second question');
    show('before undo', session.messages);

    // Exactly what src/freepi-bridge.js undo() does.
    const users = session.getUserMessagesForForking();
    console.log(`\nuser entries: ${users.length} → last entryId=${users[users.length - 1]?.entryId}`);
    const last = users[users.length - 1];
    const entry = session.sessionManager.getEntry(last.entryId);
    if (!entry.parentId) {
      session.sessionManager.resetLeaf();
      session.refreshContext();
    } else {
      await session.navigateTree(entry.parentId, { summarize: false });
    }

    show('after undo', session.messages);
    const stillHas = (session.messages || []).some(
      (m) => m.role === 'user' && JSON.stringify(m.content).includes('second question'),
    );
    console.log(stillHas ? '\n>>> BUG CONFIRMED: undone message is still in session.messages' : '\n>>> state is correct: undone message is gone from session.messages');
  } finally {
    if (session && typeof session.dispose === 'function') session.dispose();
  }
})().catch((err) => {
  console.error('repro crashed:', err);
  process.exit(1);
});
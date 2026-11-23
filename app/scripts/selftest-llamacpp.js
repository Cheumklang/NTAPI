'use strict';

/**
 * The local vision model, without a GPU.
 *
 * The download, the server and the GPU are exercised by hand (a real run reads a
 * screenshot and answers in ~8 s); what is checked here is the part that must not
 * regress quietly: what the module reports before and after it has files, that a
 * picture is refused when no server is up, and that setup can be cancelled.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');
const { createLlamaCpp, RELEASE, MODEL_FILE, MMPROJ_FILE } = require('../src/llamacpp');

let failures = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}`, detail === undefined ? '' : detail);
  }
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-llamacpp-'));
  const llama = createLlamaCpp({ dir });

  const empty = llama.status();
  check('a fresh folder is not installed', empty.installed === false, empty);
  check('a fresh folder is not running', empty.running === false, empty);
  check('the phase starts idle', empty.phase === 'idle', empty);
  check('the model name is the pinned 8B vision model', empty.model === MODEL_FILE, empty.model);
  check('the release is pinned', RELEASE === 'b12648', RELEASE);
  check('the projector file is the F16 one', MMPROJ_FILE === 'mmproj-F16.gguf', MMPROJ_FILE);
  check('the switch is on unless someone turned it off', empty.enabled === true, empty.enabled);
  check(
    'a switch given as off is remembered, not started',
    createLlamaCpp({ dir, enabled: false }).status().enabled === false
  );

  // Looking at a picture with no server: refused, with a code the caller can act
  // on instead of a hang.
  let refused = null;
  try {
    await llama.describeImage({ base64: 'AAAA', mime: 'image/png', question: 'what is this?' });
  } catch (err) {
    refused = err;
  }
  check('a picture is refused when nothing is running', refused && refused.code === 'NOT_RUNNING', refused && refused.message);

  // Starting without files must fail loudly rather than spawn nothing.
  let startFailed = false;
  try {
    await llama.start();
  } catch {
    startFailed = true;
  }
  const afterStart = llama.status();
  check('starting without an install fails', startFailed);
  check('a failed start is reported as an error', afterStart.phase === 'error' && Boolean(afterStart.error), afterStart);

  /**
   * The switch off means nothing runs on this machine — and every caller goes
   * through start(), so this single refusal covers the picture tool, the
   * summarizer and the settings card alike. It is also not an error: the log
   * must not read as if the model broke.
   */
  const offSwitch = createLlamaCpp({ dir });
  offSwitch.setEnabled(false);
  check('turning the switch off is reported in the status', offSwitch.status().enabled === false);
  let whileOff = null;
  try {
    await offSwitch.start();
  } catch (err) {
    whileOff = err;
  }
  check('starting is refused while the switch is off', whileOff && whileOff.code === 'DISABLED', whileOff && whileOff.message);
  check('and that refusal is not an error state', offSwitch.status().phase !== 'error', offSwitch.status());
  offSwitch.setEnabled(true);
  check('flipping it back on restores the permission', offSwitch.status().enabled === true);

  // Files in place is what "installed" means — the binary and both model files.
  fs.mkdirSync(path.join(dir, `llama-${RELEASE}`), { recursive: true });
  fs.writeFileSync(path.join(dir, `llama-${RELEASE}`, 'llama-server'), '#!/bin/sh\n', { mode: 0o755 });
  fs.mkdirSync(path.join(dir, 'models'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'models', MODEL_FILE), 'x');
  const half = createLlamaCpp({ dir }).status();
  check('half the files is not installed', half.installed === false, half.installed);
  fs.writeFileSync(path.join(dir, 'models', MMPROJ_FILE), 'x');
  const full = createLlamaCpp({ dir }).status();
  check('binary plus both model files is installed', full.installed === true, full);
  check('installed is not the same as running', full.running === false, full);

  // Cancelling setup leaves the module usable and idle, not stuck downloading.
  const cancelled = llama.cancelSetup();
  check('cancelling setup returns to idle', cancelled.phase === 'idle' && cancelled.progress === null, cancelled);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(failures ? `\n${failures} local-vision check(s) failed` : '\nAll local-vision checks passed.');
  process.exit(failures ? 1 : 0);
})();

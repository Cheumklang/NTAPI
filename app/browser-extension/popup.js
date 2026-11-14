/**
 * Popup: pair this extension with the NTAPI app.
 *
 * The code is the 6-digit token the app shows in its browser dialog. It is
 * stored in chrome.storage.local and sent with the WebSocket handshake; a wrong
 * code makes the app close the socket, which the worker turns into a red badge.
 */
'use strict';

const codeEl = document.getElementById('code');
const saveEl = document.getElementById('save');
const statusEl = document.getElementById('status');

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = kind || '';
}

async function refresh() {
  const { token } = await chrome.storage.local.get('token');
  if (token) codeEl.value = token;

  const reply = await chrome.runtime.sendMessage({ type: 'status' }).catch(() => null);
  if (reply && reply.connected) setStatus('Connected to NTAPI.', 'ok');
  else if (!token) setStatus('Not paired yet.', 'bad');
  else setStatus('Waiting for NTAPI. Is browser control on?', 'bad');
}

codeEl.addEventListener('input', () => {
  codeEl.value = codeEl.value.replace(/\D/g, '').slice(0, 6);
});

saveEl.addEventListener('click', async () => {
  const code = codeEl.value.trim();
  if (code.length !== 6) {
    setStatus('The code is six digits.', 'bad');
    return;
  }
  saveEl.disabled = true;
  await chrome.storage.local.set({ token: code });
  await chrome.runtime.sendMessage({ type: 'reconnect' }).catch(() => {});
  setStatus('Connecting…');
  setTimeout(() => {
    saveEl.disabled = false;
    refresh();
  }, 900);
});

// Hand the active tab of this window to the agent. The worker resolves the tab
// and tells the app, which asks the user to confirm it in its own dialog.
claimEl.addEventListener('click', async () => {
  claimEl.disabled = true;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    setStatus('No tab to hand over.', 'bad');
    claimEl.disabled = false;
    return;
  }
  await chrome.runtime.sendMessage({ type: 'claim-here', tabId: tab.id }).catch(() => {});
  setStatus('Handing this tab over — confirm it in NTAPI.');
  setTimeout(() => {
    claimEl.disabled = false;
    refresh();
  }, 900);
});

refresh();

'use strict';

/**
 * Boot the real window with the real preload and check that it actually works.
 *
 * `npm test` never parses the renderer (it has no DOM), so this is the only place
 * a typo in `app.js` or a bad selector shows up before an operator sees a blank
 * screen. IPC is stubbed here rather than through main.js: the point is the
 * window, not the network.
 *
 *   electron scripts/check-render.js
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');

/* --------------------------------- stubs ---------------------------------- */

const fakeFeed = {
  version: 1,
  updated: '2026-11-16T00:00:00.000Z',
  rotateSeconds: 15,
  slots: [
    {
      id: 'existing-one',
      enabled: true,
      url: 'https://example.com/',
      media: { type: 'image', file: 'media/existing-one.webp', alt: 'Existing' },
      text: { th: { label: 'ผู้สนับสนุน', title: 'สปอนเซอร์เดิม' }, en: { label: 'Sponsor', title: 'Existing' } },
    },
  ],
};

let published = null;
// Flipped by the publish stub: the window reloads the feed right after a
// successful publish, and that reload is where a hand-set frame ratio used to
// vanish. The reload serves the *published* feed, ratio included.
let publishedOnce = false;

ipcMain.handle('cfg:get', () => ({
  owner: 'Cheumklang',
  repo: 'NTAPI-sponsor',
  branch: 'main',
  hasToken: true,
  tokenHint: 'ghp_abc\u2026wxyz',
  lastPublish: '',
}));
ipcMain.handle('cfg:save', (_e, raw) => ({ owner: raw.owner, repo: raw.repo, branch: raw.branch, hasToken: true, tokenHint: 'x', lastPublish: '' }));
ipcMain.handle('repo:check', () => ({ ok: true, canPush: true, fullName: 'Cheumklang/NTAPI-sponsor', private: false }));
ipcMain.handle('feed:load', () => {
  if (!publishedOnce) return { ok: true, feed: fakeFeed, sha: 'sha1' };
  return {
    ok: true,
    sha: 'sha2',
    feed: {
      ...fakeFeed,
      slots: [
        {
          ...fakeFeed.slots[0],
          // 4:5 is neither the old default nor the ratio switched in the window,
          // so reading it back can only come from the feed.
          media: { ...fakeFeed.slots[0].media, ratio: '4:5' },
        },
      ],
    },
  };
});
ipcMain.handle('media:pick', () => ({ ok: false, canceled: true }));
ipcMain.handle('media:fetch', () => ({ ok: false, error: 'not used' }));
ipcMain.handle('publish', (_e, payload) => {
  published = payload;
  publishedOnce = true;
  return { ok: true, done: ['media/a.webp', 'sponsor.json'], updated: 'now', slots: payload.slots.length };
});
let openedUrl = '';
ipcMain.handle('shell:open', (_e, url) => {
  openedUrl = String(url || '');
  return { ok: true };
});

/* -------------------------------- harness -------------------------------- */

const failures = [];
let checks = 0;
function expect(name, condition, detail = '') {
  checks += 1;
  if (!condition) failures.push(`${name}${detail ? ` (${detail})` : ''}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, timeoutMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await wait(60);
  }
  return null;
}

async function main() {
  const win = new BrowserWindow({
    width: 1040,
    height: 820,
    show: false,
    webPreferences: {
      preload: path.join(root, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    // 3 = error. Warnings are noise from Chromium's own deprecations.
    if (level >= 3) errors.push(message);
  });
  win.webContents.on('render-process-gone', (_e, details) => errors.push(`render-process-gone: ${details.reason}`));

  await win.loadFile(path.join(root, 'src', 'renderer', 'index.html'));
  await wait(400);

  const js = (code) => win.webContents.executeJavaScript(code, true);

  expect('no console errors on boot', errors.length === 0, errors.join(' | '));

  const bridge = await js('({ hasAds: Boolean(window.ads), hasRules: Boolean(window.adsRules), frame: window.adsRules && window.adsRules.frame, ratios: window.adsRules && window.adsRules.ratios })');
  expect('preload exposes window.ads', bridge.hasAds);
  expect('preload exposes window.adsRules', bridge.hasRules);
  expect('bridge frame is 2:1 at 536x268', bridge.frame && bridge.frame.w === 536 && bridge.frame.h === 268);
  expect('bridge offers nine-sixteen as a frame', Array.isArray(bridge.ratios) && bridge.ratios.includes('9:16'), JSON.stringify(bridge.ratios));

  // A published slot must appear as a card, because "load from the repo" is how
  // an operator starts from what is already live.
  const boot = await waitFor(async () => {
    const out = await js(`({
      cards: document.querySelectorAll('.card').length,
      repo: document.getElementById('repoSummary').textContent,
      empty: document.getElementById('emptyBoard').hidden
    })`);
    return out.cards === 1 ? out : null;
  });
  expect('boot draws the feed as one card', Boolean(boot), 'no card after boot');
  if (boot) {
    expect('repo summary shows owner/repo', boot.repo.includes('Cheumklang/NTAPI-sponsor'), boot.repo);
    expect('the empty state is hidden once a card exists', boot.empty === true);
  }

  // The tools column lives on the right; the board keeps the wide left side.
  const columns = await js(`(() => {
    const tools = document.querySelector('.tools').getBoundingClientRect();
    const board = document.querySelector('.board').getBoundingClientRect();
    return {
      toolsLeft: Math.round(tools.left),
      toolsRight: Math.round(tools.right),
      toolsWidth: Math.round(tools.width),
      boardLeft: Math.round(board.left),
      boardWidth: Math.round(board.width),
      viewport: window.innerWidth
    };
  })()`);
  expect('the tools column is to the right of the board', columns.toolsLeft > columns.boardLeft, JSON.stringify(columns));
  expect('the tools column is inside the window', columns.toolsRight <= columns.viewport + 1, JSON.stringify(columns));
  expect('the board keeps the wider side', columns.boardWidth > columns.toolsWidth, JSON.stringify(columns));

  // The token button leaves the app, so it has to look like a button and its URL
  // has to go through the bridge — never a bare <a> the window could navigate to.
  const tokenBtn = await js(`(() => {
    const btn = document.getElementById('tokenLink');
    const tools = document.querySelector('.tools').getBoundingClientRect();
    const box = btn.getBoundingClientRect();
    btn.click();
    return {
      width: Math.round(box.width),
      height: Math.round(box.height),
      toolsWidth: Math.round(tools.width),
      hasArrow: Boolean(btn.querySelector('.link-btn-arrow')),
      tag: btn.tagName
    };
  })()`);
  await wait(180);
  expect('the token control is a full-width button, not a text link',
    tokenBtn.tag === 'BUTTON' && tokenBtn.hasArrow && tokenBtn.width > tokenBtn.toolsWidth * 0.6 && tokenBtn.height >= 26,
    JSON.stringify(tokenBtn));
  expect('the token button opens the GitHub token page through the bridge',
    openedUrl.startsWith('https://github.com/settings/personal-access-tokens'), openedUrl || '(nothing opened)');

  // The editor is a drawer, so nothing is measured until a card is opened.
  const closed = await js(`document.getElementById('drawer').hidden`);
  expect('the editor starts closed', closed === true);

  await js(`document.querySelector('.card').click()`);
  await wait(150);
  const opened = await js(`({
    hidden: document.getElementById('drawer').hidden,
    title: document.getElementById('frameTitle').textContent,
    hasImg: Boolean(document.querySelector('#frameMedia img')),
    open: document.querySelectorAll('.card.is-open').length
  })`);
  expect('clicking a card opens the editor', opened.hidden === false);
  expect('the opened card is marked', opened.open === 1, `marked=${opened.open}`);
  expect('preview shows the published title', opened.title === 'สปอนเซอร์เดิม', opened.title);
  expect('preview renders the published image', opened.hasImg);

  // The preview is pinned to the real NTAPI sidebar width, so what the operator
  // sees here is the size it will actually be.
  const geometry = await js(`(() => {
    const media = document.getElementById('frameMedia').getBoundingClientRect();
    return { w: Math.round(media.width), h: Math.round(media.height) };
  })()`);
  expect('preview media box is the real sidebar width', geometry.w === 268, `w=${geometry.w}`);
  expect('preview media box is 2:1', Math.abs(geometry.w / geometry.h - 2) < 0.02, `w=${geometry.w} h=${geometry.h}`);

  // A 268px preview hugging the left edge of a 430px panel reads as a mistake:
  // the creative is the subject of the editor, so it sits in the middle. Measured
  // against `clientWidth`, because the panel scrolls and its scrollbar is not
  // space the preview is allowed to use.
  const centred = await js(`(() => {
    const frame = document.getElementById('frameMedia').getBoundingClientRect();
    const body = document.getElementById('editorBody');
    const box = body.getBoundingClientRect();
    return {
      left: Math.round(frame.left - box.left),
      right: Math.round(box.left + body.clientWidth - frame.right)
    };
  })()`);
  expect('the preview is centred in the editor, not left-aligned', Math.abs(centred.left - centred.right) <= 1, JSON.stringify(centred));

  // ---- add a card: the board goes to two, the new one opens for editing.
  await js(`document.getElementById('btnAddSlot').click()`);
  await wait(150);
  const added = await js(`({ cards: document.querySelectorAll('.card').length, open: document.querySelectorAll('.card.is-open').length })`);
  expect('add appends a card', added.cards === 2, `cards=${added.cards}`);
  expect('the new card opens for editing', added.open === 1, `open=${added.open}`);

  // Typing must not rebuild the board: the same input node stays focused.
  const typing = await js(`(() => {
    const input = document.querySelector('[data-field="title-th"]');
    input.focus();
    input.value = 'ทดสอบชื่อใหม่';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return { focused: document.activeElement === input, title: document.getElementById('frameTitle').textContent };
  })()`);
  expect('typing a title repaints the preview', typing.title === 'ทดสอบชื่อใหม่', typing.title);
  expect('typing keeps the caret in the same input', typing.focused === true);

  const cardName = await js(`document.querySelectorAll('.card-name')[1].textContent`);
  expect('typing updates the card title too', cardName === 'ทดสอบชื่อใหม่', cardName);

  // A long title must be cut by the bridge's own clamp, in Thai.
  const clamped = await js(`(() => {
    const input = document.querySelector('[data-field="title-th"]');
    input.value = 'ก'.repeat(300);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return document.getElementById('frameTitle').textContent;
  })()`);
  expect('long title is clamped to 80 code points', [...clamped].length === 80, `len=${[...clamped].length}`);
  expect('clamped title ends with an ellipsis', clamped.endsWith('\u2026'));

  // ---- drop an image on the window: the whole crop path runs for real.
  const dropped = await js(`(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 900;            // tall on purpose: must be centre-cropped
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff0055';
    ctx.fillRect(0, 0, 600, 900);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], 'poster.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    return true;
  })()`);
  expect('drop event dispatched', dropped === true);

  const afterDrop = await waitFor(async () => {
    const out = await js(`(() => {
      const img = document.querySelector('#frameMedia img');
      const note = document.getElementById('mediaNote');
      return { hasImg: Boolean(img), src: img ? img.src.slice(0, 22) : '', note: note ? note.textContent : '' };
    })()`);
    return out.hasImg ? out : null;
  });
  expect('dropped image paints in the preview', Boolean(afterDrop), 'no img after drop');
  if (afterDrop) {
    expect('crop is re-encoded as WebP', afterDrop.src.startsWith('data:image/webp'), afterDrop.src);
    expect('note reports the canonical size', afterDrop.note.includes('1072×536'), afterDrop.note);
  }

  // ---- switching the frame re-crops, and the choice has to reach the feed.
  // A 1:1 creative published without its ratio came back as a 2:1 band: the
  // control said square, the feed said nothing, and every reader defaulted to
  // 2:1. The payload check below is the one that would have caught it.
  const squareClicked = await js(`(() => {
    const btn = document.querySelector('.ratio-btn[data-ratio="1:1"]');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  expect('a 1:1 frame button exists', squareClicked === true);
  const square = await waitFor(async () => {
    const out = await js(`(() => {
      const note = document.getElementById('mediaNote');
      const on = document.querySelector('.ratio-btn.is-on');
      return { note: note ? note.textContent : '', ratio: on ? on.dataset.ratio : '' };
    })()`);
    return out.note.includes('1072×1072') ? out : null;
  }, 6000);
  expect('switching to 1:1 re-crops the creative square', Boolean(square), 'no 1072×1072 crop');
  if (square) expect('the 1:1 button is the active one', square.ratio === '1:1', square.ratio);

  // Every title must sit on the same line across cards whose creatives have
  // different shapes: an operator scans the board by title, so a 1:1 card and a
  // 2:1 card have to agree on where the title lives — at the bottom of the card.
  const titles = await js(`(() => {
    const cards = [...document.querySelectorAll('.card')];
    return cards.map((card) => {
      const name = card.querySelector('.card-name').getBoundingClientRect();
      const thumb = card.querySelector('.card-thumb').getBoundingClientRect();
      const box = card.getBoundingClientRect();
      return {
        ratio: card.querySelector('.card-meta .badge') ? card.querySelector('.card-meta .badge').textContent : '',
        nameBottom: Math.round(name.bottom),
        gapUnderThumb: Math.round(name.top - thumb.bottom),
        fromCardBottom: Math.round(box.bottom - name.bottom)
      };
    });
  })()`);
  expect('there are two cards with different shapes to compare', titles.length === 2, JSON.stringify(titles));
  if (titles.length === 2) {
    expect('every card title sits on the same line', Math.abs(titles[0].nameBottom - titles[1].nameBottom) <= 1, JSON.stringify(titles));
    expect('a short creative pushes its title down instead of leaving dead space',
      titles.some((t) => t.gapUnderThumb > 40), JSON.stringify(titles));
    expect('every title sits near the bottom of its card',
      titles.every((t) => t.fromCardBottom <= 45), JSON.stringify(titles));
  }

  // ---- publish must send the cropped bytes, not the original file.
  // The slot needs a click-through first: a sponsor with no link is refused.
  await js(`(() => {
    const input = document.querySelector('[data-field="url"]');
    input.value = 'https://example.com/offer';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await wait(120);
  await js(`document.getElementById('btnPublish').click()`);
  const sent = await waitFor(async () => (published ? published : null), 8000);
  expect('publish reached main', Boolean(sent), sent ? '' : 'validation refused the payload');
  if (sent) {
    const slot = sent.slots.find((s) => s.id && s.id !== 'existing-one');
    expect('publish includes the existing slot untouched', Boolean(sent.slots.find((s) => s.id === 'existing-one' && s.media.file)));
    expect('publish sends cropped image bytes', Boolean(slot && slot.media.base64 && slot.media.base64.length > 100));
    expect('publish never sends the browser File object', Boolean(slot && slot.media.file === undefined));
    expect('publish carries the rotate interval', sent.rotateSeconds === 15, String(sent.rotateSeconds));
    expect('publish carries the chosen frame ratio', slot && slot.media.ratio === '1:1',
      slot ? String(slot.media.ratio) : 'no slot');
  }

  // ---- the frame survives the reload that follows a publish.
  // The file in the repo is already cropped to its frame, so the feed is the only
  // place that shape is written down. Losing it on reload snapped the control
  // back to 2:1 and made the next publish describe a square creative as wide.
  const reloaded = await waitFor(async () => {
    const count = await js(`document.querySelectorAll('.card').length`);
    return count === 1 ? true : null;
  }, 6000);
  expect('the board reloads to the published feed', reloaded === true);
  await js(`document.querySelector('.card').click()`);
  await wait(150);
  const back = await js(`(() => {
    const on = document.querySelector('.ratio-btn.is-on');
    const media = document.getElementById('frameMedia').getBoundingClientRect();
    return { ratio: on ? on.dataset.ratio : '', w: Math.round(media.width), h: Math.round(media.height) };
  })()`);
  expect('feed ratio is read back after publish', back.ratio === '4:5', back.ratio);
  const shape = back.h ? back.w / back.h : 0;
  expect('published ratio drives the preview box', Math.abs(shape - 4 / 5) < 0.03, `${back.w}x${back.h}`);

  // ---- the custom frame is a dialog, and the editor no longer carries its
  // inputs: a permanent row of bare number boxes made the panel look unfinished.
  const parked = await js(`document.querySelector('#fields [data-field="ratio-w"]') !== null`);
  expect('the custom size row is not parked in the editor', parked === false);

  const dialogOpened = await js(`(() => {
    const btn = document.querySelector('.ratio-btn[data-ratio="custom"]');
    if (!btn) return false;
    btn.click();
    return Boolean(document.querySelector('[data-role="size-dialog"]'));
  })()`);
  expect('clicking กำหนดเอง opens a size dialog', dialogOpened === true);

  // Out of band is refused in place, with the reason on screen.
  const refused = await js(`(() => {
    const w = document.querySelector('[data-field="ratio-w"]');
    const h = document.querySelector('[data-field="ratio-h"]');
    w.value = '1';
    h.value = '20';
    w.dispatchEvent(new Event('input', { bubbles: true }));
    const err = document.querySelector('.dialog-error');
    const apply = document.querySelector('.dialog-foot .btn.primary');
    return {
      error: err ? err.textContent : '',
      disabled: apply ? apply.disabled : null,
      stillOpen: Boolean(document.querySelector('[data-role="size-dialog"]'))
    };
  })()`);
  expect('a frame outside the band is refused in the dialog', refused.error.length > 0 && refused.disabled === true, JSON.stringify(refused));
  expect('the dialog stays open while the size is wrong', refused.stillOpen === true);

  const applied = await js(`(() => {
    const w = document.querySelector('[data-field="ratio-w"]');
    const h = document.querySelector('[data-field="ratio-h"]');
    w.value = '3';
    h.value = '2';
    w.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.dialog-foot .btn.primary').click();
    const on = document.querySelector('.ratio-btn.is-on');
    return {
      dialogGone: document.querySelector('[data-role="size-dialog"]') === null,
      active: on ? on.dataset.ratio : '',
      size: document.getElementById('frameSize').textContent
    };
  })()`);
  expect('applying the size closes the dialog', applied.dialogGone === true);
  expect('the custom shape becomes the active frame', applied.active === 'custom', applied.active);
  expect('the preview box is built from the typed size', applied.size.includes('3:2'), applied.size);

  // ---- sound ---------------------------------------------------------------
  // A <video> keeps playing after it leaves the DOM, so every repaint used to
  // strand the previous clip mid-audio: pressing mute muted a fresh element while
  // the abandoned one kept singing. Two invariants fix that — mute in place, and
  // pause whatever a repaint throws away.
  const sound = await js(`(() => {
    const host = document.getElementById('frameMedia');
    const probe = document.createElement('video');
    probe.dataset.probe = 'mute';
    probe.muted = true;              // same starting state as the real preview
    probe.pause = () => {};
    host.appendChild(probe);

    const before = probe.muted;
    document.getElementById('muteSwitch').click();   // silent -> audible
    const afterOn = probe.muted;
    const keptWhileToggling = Boolean(host.querySelector('video[data-probe="mute"]'));
    document.getElementById('muteSwitch').click();   // audible -> silent
    const afterOff = probe.muted;
    const chip = document.getElementById('soundText').textContent;
    probe.remove();
    return { before, afterOn, afterOff, keptWhileToggling, chip };
  })()`);
  expect('the preview starts silent', sound.before === true, JSON.stringify(sound));
  expect('turning the sound on unmutes the element that is on screen', sound.afterOn === false, JSON.stringify(sound));
  expect('turning the sound off silences it again', sound.afterOff === true, JSON.stringify(sound));
  expect('toggling the sound never rebuilds (and restarts) the clip', sound.keptWhileToggling === true, JSON.stringify(sound));
  expect('the chip offers the next action, not the current state', sound.chip === 'เปิดเสียง', sound.chip);

  const released = await js(`(() => {
    const host = document.getElementById('frameMedia');
    const probe = document.createElement('video');
    probe.dataset.probe = 'orphan';
    let paused = false;
    probe.pause = () => { paused = true; };
    host.appendChild(probe);
    document.querySelector('.ratio-btn[data-ratio="2:1"]').click();
    return { paused, gone: !host.querySelector('video[data-probe="orphan"]') };
  })()`);
  expect('a video a repaint throws away is paused first', released.paused === true, JSON.stringify(released));
  expect('the replaced video is gone from the preview', released.gone === true, JSON.stringify(released));

  // Closing the drawer hides it, which does NOT stop a media element — the clip
  // kept playing with no chip left on screen to mute it.
  const closedStops = await js(`(() => {
    const host = document.getElementById('frameMedia');
    const probe = document.createElement('video');
    probe.dataset.probe = 'close';
    let paused = false;
    probe.pause = () => { paused = true; };
    host.appendChild(probe);
    document.getElementById('drawerClose').click();
    return {
      paused,
      gone: !host.querySelector('video[data-probe="close"]'),
      drawerHidden: document.getElementById('drawer').hidden
    };
  })()`);
  expect('closing the editor stops the preview clip', closedStops.paused === true, JSON.stringify(closedStops));
  expect('closing the editor leaves no media behind', closedStops.gone === true, JSON.stringify(closedStops));
  expect('closing the editor actually hides the drawer', closedStops.drawerHidden === true, JSON.stringify(closedStops));

  expect('no console errors after interactions', errors.length === 0, errors.join(' | '));

  // Leave a screenshot for a human to glance at.
  const shot = await win.webContents.capturePage();
  const outFile = path.join(root, 'shots', 'ads-window.png');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, shot.toPNG());
  console.log(`screenshot: ${path.relative(root, outFile)}`);

  win.destroy();

  if (failures.length) {
    console.error(`\n${failures.length}/${checks} checks FAILED`);
    for (const line of failures) console.error(` - ${line}`);
    process.exitCode = 1;
  } else {
    console.log(`\nPASS: ${checks}/${checks} window checks`);
  }
  app.quit();
}

app.whenReady().then(() =>
  main().catch((err) => {
    console.error('harness error:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
    app.quit();
  }),
);

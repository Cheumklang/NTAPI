'use strict';

/**
 * Prove the sponsor strip costs the sidebar nothing.
 *
 * The static test only reads source order and CSS text. The real risk is
 * geometric: the sidebar is a fixed-width column with `overflow: hidden`, so a
 * strip that is too tall steals room from the session list and nothing else
 * complains. So this one measures the column twice — once without a sponsor and
 * once with — and compares, at the default window size and at the 900x560
 * minimum.
 *
 * Comparing against a baseline rather than against absolute numbers matters: an
 * empty session list is 0px tall whether or not anything was added, so a fixed
 * "the list is at least N px" check would fail for reasons that have nothing to
 * do with the strip.
 *
 * Run from app/:  node_modules/electron/dist/electron.exe scripts/check-sponsor-layout.js
 */

const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

// The shape the main process hands to paintSponsor(), built by hand here because
// this harness runs the renderer without the app's own IPC handlers. The creative
// deliberately has no bytes: this check is about geometry, and the media band has
// its height from the ratio whether or not the download has landed.
const WITH_SPONSOR = `sponsor = {
  enabled: true,
  rotateSeconds: 15,
  slots: [
    {
      id: 'term24hr',
      url: 'https://www.term24hr.in.th/',
      media: { type: 'image', ratio: '2:1', alt: 'Term24hr' },
      text: {
        th: { label: 'ผู้สนับสนุน', title: 'เติมเกมราคาถูก รับของใน 1–5 นาที' },
        en: { label: 'Sponsor', title: 'Game top-ups, delivered in 1–5 minutes' },
      },
    },
  ],
};`;

/**
 * Two slots in different shapes. The strip must keep one fixed height across
 * both, or the sidebar would jump every time the rotation moves between them —
 * which is the whole reason the box reserves the tallest frame up front.
 */
const MIXED_SPONSOR = `sponsor = {
  enabled: true,
  rotateSeconds: 15,
  slots: [
    {
      id: 'wide',
      url: 'https://example.com/wide',
      media: { type: 'image', ratio: '2:1', alt: 'Wide' },
      text: { th: { label: 'ผู้สนับสนุน', title: 'แบนเนอร์แนวนอน' }, en: { label: 'Sponsor', title: 'Wide banner' } },
    },
    {
      id: 'tall',
      url: 'https://example.com/tall',
      media: { type: 'image', ratio: '4:5', alt: 'Tall' },
      text: { th: { label: 'ผู้สนับสนุน', title: 'แบนเนอร์แนวตั้ง' }, en: { label: 'Sponsor', title: 'Tall banner' } },
    },
  ],
};`;

/**
 * The tallest shape the publisher offers, drawn on its own so the reserved ratio
 * is the slot's own. This is the case that exposed the pixel cap: the band was
 * 268x288 whatever the feed asked for, so a 9:16 clip never looked 9:16.
 */
const TALL_SPONSOR = `sponsor = {
  enabled: true,
  rotateSeconds: 15,
  slots: [
    {
      id: 'tall-clip',
      url: 'https://example.com/tall',
      media: { type: 'video', ratio: '9:16', alt: 'Tall clip' },
      text: { th: { label: 'ผู้สนับสนุน', title: 'คลิปแนวตั้ง' }, en: { label: 'Sponsor', title: 'Tall clip' } },
    },
  ],
};`;

const MEASURE_MIXED = `(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  lang = 'th';
  sponsor = ${MIXED_SPONSOR};

  // Real bytes, made here: the harness has no IPC, so the renderer would never
  // get a creative from main and the geometry of a fitted image would go
  // unmeasured. These are the exact sizes the publisher uploads.
  const make = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#1b2740'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2f5ff'; g.font = '700 80px sans-serif';
    g.fillText(w + 'x' + h, 40, 120);
    return c.toDataURL('image/webp', 0.8);
  };
  sponsorMediaCache.set('wide', { type: 'image', url: make(1072, 536) });
  sponsorMediaCache.set('tall', { type: 'image', url: make(858, 1072) });
  const host = document.getElementById('sponsorMedia');
  const side = document.getElementById('sidebar');
  const heights = [];
  const ratios = [];
  const fits = [];
  const widths = [];
  const hostWidths = [];
  for (let i = 0; i < 2; i += 1) {
    sponsorSlotIndex = i;
    paintSponsor();
    await frame();
    const hostBox = host.getBoundingClientRect();
    heights.push(Math.round(hostBox.height));
    const node = host.firstElementChild;
    const box = node ? node.getBoundingClientRect() : { width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 };
    ratios.push(box.height ? Math.round((box.width / box.height) * 100) / 100 : 0);
    widths.push(Math.round(box.width));
    hostWidths.push(Math.round(hostBox.width));
    // Nothing may leave the band: an escapee paints over the session list above
    // and over the sponsor's own two lines of copy below.
    fits.push(
      Boolean(node) &&
        box.top >= hostBox.top - 1 &&
        box.bottom <= hostBox.bottom + 1 &&
        box.left >= hostBox.left - 1 &&
        box.right <= hostBox.right + 1,
    );
  }
  return {
    heights,
    ratios,
    fits,
    widths,
    hostWidths,
    sideWidth: Math.round(side.getBoundingClientRect().width),
    reserved: getComputedStyle(host).aspectRatio,
  };
})()`;

const MEASURE = (sponsorCode, longTitle) => `(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const h = (node) => Math.round(node.getBoundingClientRect().height);

  lang = 'th';
  ${sponsorCode}
  if (sponsor && ${longTitle}) {
    sponsor.slots[0].text.th.title = 'เติมเกมราคาถูก รับของในหนึ่งถึงห้านาที ทุกวันตลอดยี่สิบสี่ชั่วโมง ราคาถูกที่สุดในประเทศไทย '.repeat(3);
  }
  paintSponsor();
  await frame();

  const side = document.getElementById('sidebar');
  const slot = document.getElementById('sponsorSlot');
  const card = document.getElementById('sponsorCard');
  const text = document.getElementById('sponsorText');
  // The block the strip sits under is simply whatever came before it — the
  // sidebar has no "status panel" any more (it moved to the topbar pill), so the
  // anchor is the previous sibling rather than a class name.
  const above = slot.previousElementSibling;

  const slotRect = slot.getBoundingClientRect();
  const sideRect = side.getBoundingClientRect();
  const textRect = text.getBoundingClientRect();
  const mediaEl = document.getElementById('sponsorMedia');
  const mediaRect = mediaEl.getBoundingClientRect();

  return {
    hidden: slot.hidden,
    lastChild: side.lastElementChild === slot,
    slotBelowPrevious: !above || above.getBoundingClientRect().bottom <= slotRect.top + 1,
    // How far the strip's bottom sits from the bottom of the scrollable
    // content — computed against scrollHeight so it stays correct when the
    // column is taller than the window and has to scroll.
    gapToFloor: Math.round(side.scrollHeight - (slotRect.bottom - sideRect.top)),
    cardHeight: h(card),
    textHeight: Math.round(textRect.height),
    textClipped: text.scrollWidth > text.clientWidth,
    sideClient: side.clientHeight,
    sideScroll: side.scrollHeight,
    sideTop: Math.round(sideRect.top),
    overflowY: getComputedStyle(side).overflowY,
    contentHeight: Math.round(
      [...side.children].reduce((sum, n) => sum + n.getBoundingClientRect().height, 0) +
      28 +
      14 * (side.children.length - 1),
    ),
    sideWidth: Math.round(sideRect.width),
    // The block above the strip (the session list) is the anchor for "nothing
    // above the sponsor was pushed out of the column".
    aboveBottom: above ? Math.round(above.getBoundingClientRect().bottom) : Math.round(sideRect.top),
    // The session list is flex: 1 on purpose — it is the block that gives up
    // room when the column changes, so it may shrink but nothing may be pushed
    // out of the sidebar.
    listHeight: Math.round(document.getElementById('sessionList').getBoundingClientRect().height),
    label: card.getAttribute('aria-label') || '',
    title: card.title,
    mediaWidth: Math.round(mediaRect.width),
    mediaHeight: Math.round(mediaRect.height),
    mediaHidden: mediaEl.hidden,
    // The creative must sit dead centre of the column. The card carries padding
    // and a border while also pulling itself out with a negative margin, so an
    // off-by-a-few-pixels mistake there slides the band sideways and the only
    // way to see it is to measure both insets against the column's content box.
    mediaInsetLeft: Math.round(mediaRect.left - (sideRect.left + parseFloat(getComputedStyle(side).paddingLeft))),
    mediaInsetRight: Math.round((sideRect.right - parseFloat(getComputedStyle(side).paddingRight)) - mediaRect.right),
  };
})()`;

async function measure(win, sponsorCode, longTitle) {
  return win.webContents.executeJavaScript(MEASURE(sponsorCode, longTitle));
}

async function atSize(win, label, width, height) {
  win.setContentSize(width, height);
  await new Promise((r) => setTimeout(r, 260));

  const off = await measure(win, 'sponsor = null;', false);
  const on = await measure(win, WITH_SPONSOR, false);
  const longCopy = await measure(win, WITH_SPONSOR, true);
  const back = await measure(win, 'sponsor = null;', false);
  const tall = await measure(win, TALL_SPONSOR, false);

  console.log(`\n--- ${label} (${width}x${height}) ---`);
  console.log('without', JSON.stringify(off));
  console.log('with   ', JSON.stringify(on));

  check(`${label}: the strip is shown when there is a sponsor`, on.hidden === false);
  check(`${label}: the strip is hidden when there is none`, off.hidden === true);
  check(`${label}: removing it again hides it`, back.hidden === true);
  check(`${label}: it is the last block in the sidebar`, on.lastChild === true);
  check(`${label}: it sits below the block above it`, on.slotBelowPrevious === true);
  check(`${label}: it is the floor of the column`, on.gapToFloor >= 0 && on.gapToFloor <= 20, {
    gapToFloor: on.gapToFloor,
  });
  check(`${label}: the strip is the height of its band plus its two lines`,
    on.cardHeight > 120 && on.cardHeight <= 210, { cardHeight: on.cardHeight });
  // The creative is cropped to 2:1, so its band is exactly half its width — that
  // is what makes every sponsor look the same size no matter what they sent.
  check(`${label}: the creative band is 2:1`,
    on.mediaWidth > 0 && Math.abs(on.mediaWidth / on.mediaHeight - 2) < 0.06, {
      w: on.mediaWidth,
      h: on.mediaHeight,
    });
  // The tallest published shape has to survive the same measurement: the band is
  // reserved for it, so a pixel cap on height squashes the one shape that needs
  // the most room while pretending to honour the feed.
  check(`${label}: a 9:16 clip is drawn taller than it is wide`,
    tall.mediaHeight > tall.mediaWidth, { w: tall.mediaWidth, h: tall.mediaHeight });
  check(`${label}: a 9:16 clip keeps its own height ratio`,
    tall.mediaWidth > 0 && Math.abs(tall.mediaHeight / tall.mediaWidth - 16 / 9) < 0.06, {
      w: tall.mediaWidth,
      h: tall.mediaHeight,
    });
  check(`${label}: a 9:16 clip is not clamped to the old 288px cap`,
    tall.mediaHeight > 400, tall.mediaHeight);
  // Inset by the column's own padding, the same as every other block: the band
  // is not full-bleed on purpose, it sits inside the card's padding.
  check(`${label}: the creative band spans the card`, on.mediaWidth >= on.sideWidth - 60, {
    media: on.mediaWidth,
    column: on.sideWidth,
  });
  // Centred, not merely wide. A left inset that differs from the right one is
  // what makes a banner look shoved against the edge of the column.
  check(`${label}: the creative band is centred in the column`,
    Math.abs(on.mediaInsetLeft - on.mediaInsetRight) <= 1 && on.mediaInsetLeft <= 1, {
      left: on.mediaInsetLeft,
      right: on.mediaInsetRight,
    });
  check(`${label}: the copy stays on one line`, on.textHeight <= 20, { textHeight: on.textHeight });
  // Adding the strip must nestle it into the column (content grows), never
  // throw anything out of reach — that is covered by the scroll checks below.
  check(`${label}: the column grows to fit the strip`, on.sideScroll >= off.sideScroll, {
    before: off.sideScroll,
    after: on.sideScroll,
  });
  check(`${label}: it does not widen or narrow the column`, on.sideWidth === off.sideWidth, {
    before: off.sideWidth,
    after: on.sideWidth,
  });
  // Not "nothing moves": the strip is anchored to the floor of a column that is
  // already full at the minimum size, so the list above it has to give up the
  // strip's height. What must hold is that the height is then *reachable* —
  // the column scrolls instead of clipping the panel off the bottom.
  check(`${label}: the column scrolls rather than clipping`, on.overflowY === 'auto', {
    overflowY: on.overflowY,
  });
  check(`${label}: every block stays reachable`, on.sideScroll <= on.contentHeight + 1, {
    scroll: on.sideScroll,
    content: on.contentHeight,
  });
  check(`${label}: the block above the strip is never pushed out of the column`,
    on.aboveBottom <= on.sideTop + on.sideScroll, {
      aboveBottom: on.aboveBottom,
      columnBottom: on.sideTop + on.sideScroll,
    });
  // The session list is the block that is meant to absorb a change in height, so
  // the strip may only take its room from there — never from the fixed controls.
  check(`${label}: the strip takes its room from the session list only`,
    off.listHeight - on.listHeight <= on.cardHeight + 12, {
      before: off.listHeight,
      after: on.listHeight,
      strip: on.cardHeight,
    });
  check(`${label}: a long copy is ellipsised, never wrapped`, {
    lines: longCopy.textHeight <= 20,
    clipped: longCopy.textClipped,
  }.lines === true && longCopy.textClipped === true);
  check(`${label}: a long copy does not grow the strip`, longCopy.cardHeight === on.cardHeight, {
    normal: on.cardHeight,
    long: longCopy.cardHeight,
  });
  check(`${label}: the card names the sponsor for screen readers`, /ผู้สนับสนุน/.test(on.label), on.label);
  check(`${label}: the card says where it goes on hover`, on.title === 'https://www.term24hr.in.th/', on.title);
}

/**
 * The sound switch, driven through the real renderer.
 *
 * Sound must be off by default (an unmuted clip cannot autoplay at all, and a
 * banner that talks to a room loses users), and it has to be possible to turn on
 * with a click — the gesture Chromium requires before audio may play. An image
 * slot has no sound, so the switch must not appear for it.
 */
const SOUND = `(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  lang = 'th';
  sponsor = {
    enabled: true,
    rotateSeconds: 15,
    slots: [{
      id: 'clip',
      url: 'https://example.com/clip',
      media: { type: 'video', ratio: '2:1', alt: 'Clip' },
      text: { th: { label: 'ผู้สนับสนุน', title: 'คลิปวิดีโอ' }, en: { label: 'Sponsor', title: 'Clip' } },
    }],
  };
  sponsorSlotIndex = 0;
  sponsorSoundOn = false;
  const host = document.getElementById('sponsorMedia');
  const btn = document.getElementById('sponsorSound');
  paintSponsor();
  // No IPC in this harness, so the clip is placed by hand: what is under test is
  // the switch, not the download.
  const video = document.createElement('video');
  video.src = 'ntapi-sponsor://media/clip.mp4';
  video.muted = true;
  host.replaceChildren(video);
  updateSponsorSoundButton(sponsor.slots[0]);
  await frame();
  const before = {
    hidden: btn.hidden,
    muted: video.muted,
    pressed: btn.getAttribute('aria-pressed'),
    label: btn.getAttribute('aria-label'),
  };
  btn.click();
  await frame();
  const after = {
    hidden: btn.hidden,
    muted: video.muted,
    pressed: btn.getAttribute('aria-pressed'),
    label: btn.getAttribute('aria-label'),
  };
  btn.click();
  await frame();
  const back = { muted: video.muted, pressed: btn.getAttribute('aria-pressed') };
  sponsor.slots[0].media.type = 'image';
  updateSponsorSoundButton(sponsor.slots[0]);
  await frame();
  return { before, after, back, onImage: { hidden: btn.hidden } };
})()`;

app.whenReady().then(async () => {
  main();
}).catch((err) => {
  console.error('check aborted:', err && err.stack ? err.stack : err);
  app.exit(1);
});

// A test harness must never be able to hang the terminal. Any step that throws
// used to leave the window open with no `app.exit`, which read as a frozen
// program for several minutes. So the body runs inside `main()`, the catch above
// always exits, and a watchdog force-exits if anything stalls past 3 minutes no
// matter what.
setTimeout(() => {
  console.error('check timed out');
  app.exit(2);
}, 3 * 60 * 1000);

async function main() {
  const win = new BrowserWindow({
    show: false,
    width: 1240,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on('console-message', (e) => console.log('[renderer]', e.level, e.message));
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 500));

  const domReady = await win.webContents.executeJavaScript(
    "typeof paintSponsor === 'function' && document.getElementById('sponsorSlot') !== null",
  );
  check('the strip exists in the loaded page', domReady === true);

  await atSize(win, 'default', 1240, 840);
  await atSize(win, 'minimum', 900, 560);

  // A feed that mixes a wide and a tall creative: the strip follows the shape of
  // whichever one is on screen, so the divider above it and the label below it
  // stay attached to the creative. Reserving the tallest box instead left a hole
  // under the small banner and left the divider up where the tall one had put it.
  const mixed = await win.webContents.executeJavaScript(MEASURE_MIXED);
  console.log('\nmixed ratios', JSON.stringify(mixed));
  check('the band takes the shape of the slot on screen', mixed.heights[0] !== mixed.heights[1], {
    heights: mixed.heights,
  });
  check('the band is the 4:5 slot once the tall one rotates in', Number(String(mixed.reserved).split('/')[0]) < 1, mixed.reserved);
  // Each creative is framed at its own shape inside the reserved band, which is
  // what the publisher's own preview does. Cropping every sponsor into one band
  // cut the left and right edges off a 1:1 image — and that is where a sponsor
  // puts its wording, so the words disappeared.
  check('each creative keeps its own shape, so nothing is cropped',
    Math.abs(mixed.ratios[0] - 2) < 0.06 && Math.abs(mixed.ratios[1] - 0.8) < 0.06, {
      ratios: mixed.ratios,
    });
  check('a 1:1 creative in a 4:5 band is not cut on its sides',
    mixed.widths[1] === mixed.hostWidths[1] && Math.abs(mixed.ratios[1] - 0.8) < 0.06, {
      creative: mixed.widths[1],
      band: mixed.hostWidths[1],
      ratio: mixed.ratios[1],
    });
  check('no creative leaves the reserved band', mixed.fits[0] === true && mixed.fits[1] === true, {
    fits: mixed.fits,
  });

  // A clip must arrive silent, and the switch is the only way to change that.
  const sound = await win.webContents.executeJavaScript(SOUND);
  console.log('\nsound switch', JSON.stringify(sound));
  check('a clip is muted until asked otherwise', sound.before.muted === true && sound.before.pressed === 'false', sound.before);
  check('the sound switch is offered for a clip', sound.before.hidden === false, sound.before);
  check('clicking it unmutes the clip', sound.after.muted === false, sound.after);
  check('the switch reports its state to screen readers', sound.after.pressed === 'true', sound.after);
  check('the label changes with the state, in Thai', sound.after.label !== sound.before.label && /เสียง/.test(sound.after.label), sound.after.label);
  check('clicking again mutes it', sound.back.muted === true && sound.back.pressed === 'false', sound.back);
  check('an image slot has no sound switch', sound.onImage.hidden === true, sound.onImage);

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll sponsor layout checks passed');
  app.exit(failures ? 1 : 0);
}

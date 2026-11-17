'use strict';

/**
 * The status pill, measured in a real window.
 *
 * The static test proves the markup moved. The risk that only geometry can see is
 * the row it moved into: `#topbar` is a single flex line holding the session name,
 * the thinking switch, the model picker and now this. A pill that wrapped the row
 * or ate the name would look broken at every size below 1100px and no string
 * match would notice.
 *
 * So this measures the topbar at the default window and at the 900x560 minimum:
 * the row keeps one line, the name keeps usable width, and the popover opens
 * inside the window rather than off the right edge.
 *
 * Run from app/:  node_modules/electron/dist/electron.exe scripts/check-status-pill.js
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

const MEASURE = `(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const box = (node) => {
    const r = node.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
             right: Math.round(r.right), bottom: Math.round(r.bottom) };
  };

  const topbar = document.getElementById('topbar');
  const title = document.getElementById('titleWrap');
  const titleInput = document.getElementById('sessionTitle');
  const pill = document.getElementById('statusPill');
  const pop = document.getElementById('statusPopover');
  const strip = document.getElementById('statusStrip');
  const controls = document.querySelector('.controls');

  // A realistic worst case: a long session name and long values in the pill.
  document.getElementById('sessionTitle').value =
    'วิเคราะห์บั๊กการอัปโหลดสปอนเซอร์และแก้ไขหน้าตั้งค่าให้พอดีหน้าจอ';
  document.getElementById('usageCost').textContent = '14,155 / 15,000';
  document.getElementById('usagePct').textContent = '6%';
  document.getElementById('contextPct').textContent = '14%';
  lang = 'th';
  await frame();

  // The baseline every comparison needs: the same row without the pill. A fixed
  // height would break the day someone changes the topbar's padding; comparing
  // against the row *sans* pill proves the pill added no height at all.
  const stripStyle = strip.style.display;
  strip.style.display = 'none';
  await frame();
  const baseline = { topbarHeight: Math.round(topbar.getBoundingClientRect().height) };
  strip.style.display = stripStyle;
  await frame();

  const before = {
    topbar: box(topbar),
    title: box(title),
    pill: box(pill),
    controls: box(controls),
    stripOverflow: Math.round(strip.scrollWidth - strip.clientWidth),
    topbarOverflow: Math.round(topbar.scrollWidth - topbar.clientWidth),
    nameOverflow: Math.round(titleInput.scrollWidth - titleInput.clientWidth),
    pillOverflow: Math.round(pill.scrollWidth - pill.clientWidth),
  };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const hover = (type) => strip.dispatchEvent(new PointerEvent(type, { bubbles: false }));

  // The pointer is the primary way in now: no arrow to click.
  const caret = document.querySelector('.status-caret');
  hover('pointerenter');
  await wait(200);
  const hovered = { hidden: pop.hidden, expanded: pill.getAttribute('aria-expanded') };

  // Leaving closes it again — after the longer delay, so the panel is reachable.
  hover('pointerleave');
  await wait(120);
  const stillOpen = pop.hidden === false;
  await wait(260);
  const leftClosed = pop.hidden === true;

  // A click pins it: otherwise the refresh button inside would be unreachable.
  pill.click();
  await wait(40);
  hover('pointerleave');
  await wait(400);
  const pinnedStays = pop.hidden === false;
  pill.click();
  await wait(40);
  const unpinnedClosed = pop.hidden === true;

  pill.click();
  await frame();
  const open = { hidden: pop.hidden, box: box(pop), pill: box(pill), expanded: pill.getAttribute('aria-expanded') };

  // The panel must be the same width as the tab at all times, including when the
  // tab itself changes size underneath it. Long numbers are the everyday case.
  document.getElementById('usageCost').textContent = '999,999 / 1,000,000';
  document.getElementById('usagePct').textContent = '100%';
  await frame();
  const grown = { pill: box(pill), box: box(pop) };

  // Escape must close it and hand focus back to the pill.
  pop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await frame();
  const escaped = { hidden: pop.hidden, focused: document.activeElement === pill };

  // Clicking anywhere else closes it.
  pill.click();
  await frame();
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await frame();
  const outside = { hidden: pop.hidden };

  // Provider mode swaps the group instead of the whole pill disappearing. The
  // values are the reported worst case: a provider plus a long model name in a
  // tab that is narrower than the two together.
  document.getElementById('statusFree').hidden = true;
  document.getElementById('statusProvider').hidden = false;
  document.getElementById('statusProviderName').textContent = 'Zro';
  document.getElementById('statusProviderMeter').textContent = 'DeepSeek V4.1 Flash';
  pill.click();
  await frame();
  const meter = document.getElementById('statusProviderMeter');
  const modelRow = document.getElementById('providerMeterText').parentElement;
  const provider = {
    freeHidden: document.getElementById('statusFree').hidden,
    box: box(pill),
    panel: box(pop),
    meterShown: getComputedStyle(document.getElementById('statusProvider')).display !== 'none',
    // Inside the tab the name may end in an ellipsis, but its box must end
    // inside the pill instead of painting over the tab's border.
    meterInside: Math.round(meter.getBoundingClientRect().right) <= Math.round(pill.getBoundingClientRect().right),
    // The popover's “model” row keeps the label and the value on one line.
    rowH: Math.round(modelRow.getBoundingClientRect().height),
    labelH: Math.round(modelRow.firstElementChild.getBoundingClientRect().height),
  };
  pill.click();
  await frame();
  document.getElementById('statusFree').hidden = false;
  document.getElementById('statusProvider').hidden = true;
  await frame();
  const back = box(pill);

  return {
    baseline,
    before,
    caret: caret === null ? 'none' : 'present',
    hovered,
    stillOpen,
    leftClosed,
    pinnedStays,
    unpinnedClosed,
    open,
    grown,
    escaped,
    outside,
    provider,
    back,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
})()`;

async function atSize(win, label, width, height) {
  win.setContentSize(width, height);
  await new Promise((r) => setTimeout(r, 260));
  const m = await win.webContents.executeJavaScript(MEASURE);
  console.log(`\n--- ${label} (${width}x${height}) ---`);
  console.log(JSON.stringify(m));

  const b = m.before;
  // One line, always. A wrapped topbar is the failure this whole check exists for.
  check(`${label}: the topbar stays a single row`, m.before.topbar.h === m.baseline.topbarHeight, {
    withPill: m.before.topbar.h,
    without: m.baseline.topbarHeight,
  });
  check(`${label}: the topbar never overflows`, b.topbarOverflow <= 1, { overflow: b.topbarOverflow });
  check(`${label}: the session name keeps usable width`, b.title.w >= 140, { nameWidth: b.title.w });
  check(`${label}: the pill fits inside the topbar`, b.pill.bottom <= b.topbar.bottom + 1 && b.pill.right <= b.topbar.right, {
    pill: b.pill,
    topbar: b.topbar,
  });
  // The name comes first, the pill after it, the model controls last: the order
  // the user asked for is "name — status — model", left to right.
  check(`${label}: the order is name, status, model`, b.title.x < b.pill.x && b.pill.right <= b.controls.x + 1, {
    name: b.title.x,
    pill: b.pill.x,
    controls: b.controls.x,
  });
  check(`${label}: the pill is 30px tall like the other controls`, b.pill.h >= 28 && b.pill.h <= 34, { h: b.pill.h });
  check(`${label}: the pill clips rather than pushing the row`, b.pillOverflow <= 1, { overflow: b.pillOverflow });

  check(`${label}: the pill has no dropdown arrow`, m.caret === 'none');
  check(`${label}: hovering opens the popover`, m.hovered.hidden === false && m.hovered.expanded === 'true');
  check(`${label}: it stays open while the pointer is still inside`, m.stillOpen === true);
  check(`${label}: moving away closes it`, m.leftClosed === true);
  check(`${label}: a click pins it open`, m.pinnedStays === true);
  check(`${label}: clicking again closes it`, m.unpinnedClosed === true);
  check(`${label}: clicking the pill opens the popover`, m.open.hidden === false);
  check(`${label}: the pill reports it is expanded`, m.open.expanded === 'true');
  check(`${label}: the popover opens inside the window`, m.open.box.x >= 0 && m.open.box.right <= m.viewport.w, {
    popover: m.open.box,
    viewport: m.viewport.w,
  });
  // The panel is the width of its tab, unless the tab is too narrow to hold a
  // label and its value on one line — then it keeps that reading width and grows
  // to the right only (its left edge is checked separately below).
  check(`${label}: the popover is as wide as its tab, or wide enough to read a row`,
    m.open.box.w >= m.open.pill.w - 1 && m.open.box.w >= 232, { panel: m.open.box.w, tab: m.open.pill.w });
  check(`${label}: the popover is centred under the tab`,
    Math.abs((m.open.box.x + m.open.box.w / 2) - (m.open.pill.x + m.open.pill.w / 2)) <= 2,
    { panel: m.open.box.x + m.open.box.w / 2, tab: m.open.pill.x + m.open.pill.w / 2 });
  check(`${label}: a wider tab widens the panel with it`,
    m.grown.box.w >= m.grown.pill.w - 1 && m.grown.box.w >= m.open.box.w - 1,
    { panel: m.grown.box.w, tab: m.grown.pill.w, before: m.open.box.w });
  check(`${label}: Escape closes it`, m.escaped.hidden === true);
  check(`${label}: Escape puts focus back on the pill`, m.escaped.focused === true);
  check(`${label}: a click outside closes it`, m.outside.hidden === true);
  check(`${label}: provider mode shows the provider line`, m.provider.meterShown === true && m.provider.freeHidden === true);
  check(`${label}: a long model name stays inside the tab`, m.provider.meterInside === true, m.provider);
  check(`${label}: the model name and its label share one line`,
    m.provider.rowH <= m.provider.labelH + 3, m.provider);
  check(`${label}: the wider panel still opens inside the window`,
    m.provider.panel.x >= 0 && m.provider.panel.right <= m.viewport.w, m.provider.panel);
  check(`${label}: swapping modes keeps the pill the same height`, m.provider.box.h === m.back.h, {
    free: m.back.h,
    provider: m.provider.box.h,
  });
}

app.whenReady()
  .then(main)
  .catch((err) => {
    console.error('check aborted:', err && err.stack ? err.stack : err);
    app.exit(1);
  });

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

  const ready = await win.webContents.executeJavaScript(
    "document.getElementById('statusPill') !== null && document.getElementById('statusPopover') !== null",
  );
  check('the pill exists in the loaded page', ready === true);

  await atSize(win, 'default', 1240, 840);
  await atSize(win, 'minimum', 900, 560);

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll status pill checks passed');
  app.exit(failures ? 1 : 0);
}

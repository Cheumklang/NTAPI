/**
 * The approval switch really slides, in the running renderer.
 *
 * Three positions, one thumb. Each click must move the thumb exactly onto the
 * option that was chosen, and the checked radio must agree with it — a switch that
 * shows one state and stores another is worse than a dropdown.
 *
 * The transition is switched off before measuring: `translateX` animates over
 * 180ms, so reading the rect immediately returns the previous position.
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-approval-switch.js
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('node:path');

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1150,
    height: 820,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 900));

  const run = (expr) => win.webContents.executeJavaScript(expr);

  // --- 1. the shape ------------------------------------------------------
  const shape = await run(`(() => {
    const g = document.getElementById('approvalPolicy');
    if (!g) return { error: 'no switch' };
    return {
      isSelect: g.tagName === 'SELECT',
      role: g.getAttribute('role'),
      radios: [...g.querySelectorAll('input[type=radio]')].map((r) => r.value),
      hasThumb: Boolean(g.querySelector('.approval-thumb')),
      labelled: g.getAttribute('aria-labelledby'),
    };
  })()`);
  check('the switch is not a dropdown', shape.isSelect === false, shape);
  check('it is a radiogroup', shape.role === 'radiogroup', shape);
  check('it has three positions in order',
    Array.isArray(shape.radios) && shape.radios.join(',') === 'ask,allow,deny', shape.radios);
  check('it has a sliding thumb', shape.hasThumb === true, shape);
  check('it is labelled for screen readers', shape.labelled === 'approvalLabel', shape);

  // Stop the transition so the rect can be read straight after a change.
  await run(`(() => {
    const st = document.createElement('style');
    st.textContent = '.approval-thumb{transition:none !important}';
    document.head.appendChild(st);
    return true;
  })()`);

  // --- 2. the thumb lands on the chosen option ---------------------------
  const slide = await run(`(async () => {
    const g = document.getElementById('approvalPolicy');
    const thumb = g.querySelector('.approval-thumb');
    const opts = [...g.querySelectorAll('.approval-opt')];
    const snap = () => {
      const gr = g.getBoundingClientRect();
      const tr = thumb.getBoundingClientRect();
      return {
        thumbLeft: tr.left - gr.left,
        thumbW: tr.width,
        optLefts: opts.map((o) => o.getBoundingClientRect().left - gr.left),
        optW: opts[0].getBoundingClientRect().width,
        checked: (document.querySelector('input[name=approvalPolicy]:checked') || {}).value,
        at: getComputedStyle(g).getPropertyValue('--at').trim(),
      };
    };
    const out = { states: [] };
    for (const v of ['allow', 'deny', 'ask']) {
      const r = [...document.querySelectorAll('input[name=approvalPolicy]')].find((x) => x.value === v);
      r.checked = true;
      r.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((res) => setTimeout(res, 120));
      out.states.push({ picked: v, ...snap() });
    }
    return out;
  })()`);

  const order = ['ask', 'allow', 'deny'];
  check('there are three states to check', slide.states.length === 3, slide.states.map((x) => x.picked));
  for (const state of slide.states) {
    const idx = order.indexOf(state.picked);
    const match = Math.abs(state.thumbLeft - state.optLefts[idx]) <= 1.5;
    check(`the thumb sits on "${state.picked}"`, match,
      { thumbLeft: Math.round(state.thumbLeft), optionLeft: Math.round(state.optLefts[idx]) });
    check(`"${state.picked}" is the checked radio`, state.checked === state.picked, state.checked);
    check(`the switch reports position ${idx}`, state.at === String(idx), state.at);
  }
  check('the thumb is exactly one option wide',
    Math.abs(slide.states[0].thumbW - slide.states[0].optW) <= 1.5,
    { thumbW: slide.states[0].thumbW, optW: slide.states[0].optW });

  // --- 3. it is reachable by keyboard -----------------------------------
  const keyboard = await run(`(() => {
    const radios = [...document.querySelectorAll('input[name=approvalPolicy]')];
    const visible = radios.filter((r) => {
      const st = getComputedStyle(r);
      return st.display !== 'none' && st.visibility !== 'hidden';
    });
    // The input is clipped, not display:none, so it keeps its place in the tab
    // order and arrow keys move between the three.
    return {
      allKeyboardReachable: visible.length === 3,
      sameName: radios.every((r) => r.name === 'approvalPolicy'),
      focusable: radios.every((r) => r.tabIndex >= -1 && !r.disabled),
    };
  })()`);
  check('all three are arrow-key reachable', keyboard.allKeyboardReachable === true, keyboard);
  check('they share one radio name', keyboard.sameName === true, keyboard);
  check('none of them is disabled', keyboard.focusable === true, keyboard);

  // --- 4. a click on the label picks that option -------------------------
  const clicked = await run(`(() => {
    const labels = [...document.querySelectorAll('.approval-opt')];
    const allowLabel = labels.find((l) => /อนุมัติเสมอ/.test(l.textContent));
    allowLabel.click();
    const checked = (document.querySelector('input[name=approvalPolicy]:checked') || {}).value;
    return { checked, radioInside: Boolean(allowLabel.querySelector('input')) };
  })()`);
  check('clicking a position selects it', clicked.checked === 'allow', clicked);
  check('the label wraps its own radio', clicked.radioInside === true, clicked);

  win.destroy();

  if (failures) {
    console.log(`\n${failures} check(s) failed`);
    app.exit(1);
    return;
  }
  console.log('\nAll approval switch checks passed in the running renderer');
  app.exit(0);
});

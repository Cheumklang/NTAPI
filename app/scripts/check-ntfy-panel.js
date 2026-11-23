'use strict';

/**
 * The ntfy panel, in the real window.
 *
 * What is checked: the chip sits on the browser-control row and opens a panel of
 * four groups in the order they are used; the สรุป/ทั้งหมด slide really decides
 * what a message looks like and disables the character box when it has no
 * meaning; sending asks for the right thing; a message that arrives raises the
 * chip's count without opening anything; and Escape puts the panel away.
 *
 * Run: electron scripts/check-ntfy-panel.js --no-sandbox
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const failures = [];
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failures.push(name);
    console.log(`FAIL ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
}

const LONG = 'A'.repeat(150) + ' ' + 'B'.repeat(150);

function state(over = {}) {
  return {
    server: 'https://ntfy.sh',
    username: null,
    signedIn: false,
    topics: [{ name: 'ntapi-abcdefghij', label: 'ntapi-abcdefghij' }],
    activeTopic: 'ntapi-abcdefghij',
    enabled: true,
    summary: { enabled: true, limit: 200, source: 'local' },
    messages: [{ id: 'm1', time: Date.now(), topic: 'ntapi-abcdefghij', title: 'Build finished', message: LONG }],
    config: { login: true, signup: true, checked: true },
    account: { username: null, anonymous: true, limits: { messages: 250 }, stats: { messages_remaining: 248 } },
    status: { connected: true, topic: 'ntapi-abcdefghij', error: null },
    ...over,
  };
}

const calls = [];

app.whenReady().then(async () => {
  // The stub answers like the service: what it was asked for is what comes
  // back, so a repaint after an action shows that action's result.
  const record = (name) => async (_e, payload = {}) => {
    calls.push({ name, payload });
    if (name === 'setSummary') {
      return {
        ok: true,
        state: state({
          summary: {
            enabled: payload.enabled === undefined ? true : payload.enabled !== false,
            limit: Number(payload.limit) || 200,
            source: payload.source === 'provider' ? 'provider' : 'local',
          },
        }),
      };
    }
    if (name === 'setEnabled') return { ok: true, state: state({ enabled: payload.enabled !== false }) };
    if (name === 'publish') return { ok: true, id: 'r' + calls.length, state: state() };
    return { ok: true, state: state(), topic: { name: 'ntapi-newroom99', label: 'x' } };
  };

  ipcMain.handle('app:boot', async () => ({
    prefs: {},
    // One tab on boot, so a command has a chat to land in.
    openTabs: [{ tabId: 't1', cwd: '/tmp', sessionFile: 's1' }],
    lastCwd: '/tmp',
    version: '0.0.0',
  }));
  /** One live chat: the command loop needs a tab to land in. */
  const tabState = () => ({
    tabId: 't1',
    cwd: '/tmp',
    sessionId: 's1',
    name: 'Session',
    model: { provider: 'free-pi', id: 'm', name: 'Model' },
    models: [{ provider: 'free-pi', id: 'm', name: 'Model' }],
    busy: false,
    messages: [
      { kind: 'user', text: 'what is this?' },
      { kind: 'assistant', text: LONG },
    ],
    usage: null,
  });
  ipcMain.handle('tab:open', async () => ({ ok: true, state: tabState() }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => [{ id: 't1', label: 'Session', active: true }]);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('tab:state', async () => tabState());
  ipcMain.handle('prompt:send', async (_e, payload = {}) => {
    calls.push({ name: 'sendPrompt', payload });
    return { ok: true };
  });
  ipcMain.handle('providers:key-health', async () => []);
  ipcMain.handle('settings:get', async () => ({ dataRoot: '/tmp' }));
  ipcMain.handle('app:copyText', async () => true);
  ipcMain.handle('ntfy:state', async () => state());
  ipcMain.handle('ntfy:init', async () => ({ ok: true, state: state() }));
  ipcMain.handle('ntfy:setSummary', record('setSummary'));
  ipcMain.handle('ntfy:setEnabled', record('setEnabled'));
  // The summarizer: answers with a real summary so the test can tell it apart
  // from a cut.
  ipcMain.handle('ntfy:summarize', async (_e, payload = {}) => {
    calls.push({ name: 'summarize', payload });
    return { ok: true, via: payload.source === 'provider' ? 'provider' : 'local', summary: 'สรุปสั้นจากโมเดล' };
  });
  ipcMain.handle('ntfy:setActiveTopic', record('setActiveTopic'));
  ipcMain.handle('ntfy:addTopic', record('addTopic'));
  ipcMain.handle('ntfy:removeTopic', record('removeTopic'));
  ipcMain.handle('ntfy:clearMessages', record('clearMessages'));
  ipcMain.handle('ntfy:publish', record('publish'));
  ipcMain.handle('ntfy:login', record('login'));
  ipcMain.handle('ntfy:signup', record('signup'));
  ipcMain.handle('ntfy:logout', record('logout'));
  ipcMain.handle('ntfy:setServer', record('setServer'));

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    x: 40,
    y: 40,
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'preload.js'), contextIsolation: true },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 900));

  const chip = await win.webContents.executeJavaScript(`(() => {
    el('termsOverlay').hidden = true;
    const c = el('ntfyChip');
    const browser = el('browserBtn');
    const rc = c.getBoundingClientRect();
    const rb = browser.getBoundingClientRect();
    return {
      exists: Boolean(c),
      sameRow: Math.abs(rc.top - rb.top) < 4,
      rightOfBrowser: rc.left > rb.left,
      panelHidden: el('ntfyPanel').hidden,
      expanded: c.getAttribute('aria-expanded'),
      title: c.title,
    };
  })()`);
  check('the ntfy chip is on the sidebar', chip.exists, chip);
  check('it sits on the same row as the browser control', chip.sameRow, chip);
  check('it is to the right of the browser control', chip.rightOfBrowser, chip);
  check('the panel starts closed', chip.panelHidden === true && chip.expanded === 'false', chip);

  const opened = await win.webContents.executeJavaScript(`(() => {
    el('ntfyChip').click();
    const panel = el('ntfyPanel');
    const r = panel.getBoundingClientRect();
    const groups = [...panel.querySelectorAll('.ntfy-group-title')].map((n) => n.textContent.trim());
    return {
      hidden: panel.hidden,
      expanded: el('ntfyChip').getAttribute('aria-expanded'),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      groups,
      withinWindow: r.x >= 0 && r.y >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
      state: el('ntfyState').textContent.trim(),
      dot: el('ntfyChip').dataset.state,
      account: el('ntfyAccountLine').textContent.trim(),
      scroll: { client: panel.clientHeight, content: panel.scrollHeight },
    };
  })()`);
  check('clicking the chip opens the panel', opened.hidden === false && opened.expanded === 'true', opened);
  check('the panel is placed fully inside the window', opened.withinWindow === true, opened);
  check('it has the four groups, in order', opened.groups.length === 4, opened.groups);
  check('the chip says the stream is up', opened.dot === 'live' && opened.state.length > 0, opened);
  console.log(`info: panel ${opened.w}x${opened.h} · content ${opened.scroll.content}px in ${opened.scroll.client}px`);
  check('the account line carries the quota', /248/.test(opened.account), opened.account);

  // Geometry, not an impression: every control inside the panel is measured, and
  // any two that overlap (without one being inside the other) are reported. A
  // sense of "looks cramped" is what this replaces.
  /**
   * Every control inside the panel, measured. Any two that overlap without one
   * being inside the other are reported with the pixels they share — this is what
   * replaces "looks cramped", and it is the reason the incoming group no longer
   * shrinks to nothing and paints over the group below it.
   */
  async function measurePanel() {
    return win.webContents.executeJavaScript(`(() => {
      const panel = el('ntfyPanel');
      const all = [...panel.querySelectorAll('button, input, select, textarea, .ntfy-room, .ntfy-msg, .ntfy-slide')]
        .filter((n) => n.offsetParent !== null && !n.hidden);
      // What the reader actually sees of a node: its box cut down by every
      // ancestor that clips. A row scrolled half out of the message list is not
      // overlapping the field below it — it is clipped, which is a different
      // thing, and only the clipped box may be compared.
      const rect = (n) => {
        const r = n.getBoundingClientRect();
        let box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
        for (let p = n.parentElement; p && p !== panel; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.overflowY === 'visible' && cs.overflowX === 'visible') continue;
          const pr = p.getBoundingClientRect();
          box = { l: Math.max(box.l, pr.left), t: Math.max(box.t, pr.top), r: Math.min(box.r, pr.right), b: Math.min(box.b, pr.bottom) };
        }
        return { ...box, w: box.r - box.l, h: box.b - box.t };
      };
      const nodes = all.filter((n) => { const r = rect(n); return r.w > 1 && r.h > 1; });
      const overlaps = [];
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          if (nodes[i].contains(nodes[j]) || nodes[j].contains(nodes[i])) continue;
          const a = rect(nodes[i]);
          const b = rect(nodes[j]);
          const x = Math.min(a.r, b.r) - Math.max(a.l, b.l);
          const y = Math.min(a.b, b.b) - Math.max(a.t, b.t);
          if (x > 1 && y > 1) {
            overlaps.push({ a: nodes[i].id || nodes[i].className, b: nodes[j].id || nodes[j].className, x: Math.round(x), y: Math.round(y) });
          }
        }
      }
      const box = panel.getBoundingClientRect();
      const outside = nodes
        .map((n) => ({ id: n.id || n.className, r: rect(n) }))
        .filter((e) => e.r.l < box.left - 1 || e.r.r > box.right + 1)
        .map((e) => e.id);
      const squeezed = nodes
        .filter((n) => n.matches('button') && n.scrollWidth > n.clientWidth + 1)
        .map((n) => ({ id: n.id || n.textContent.trim().slice(0, 20), scroll: n.scrollWidth, client: n.clientWidth }));
      const thin = nodes
        .filter((n) => n.matches('button') && n.getBoundingClientRect().width < 56)
        .map((n) => ({ id: n.id || n.textContent.trim().slice(0, 20), w: Math.round(n.getBoundingClientRect().width) }));
      const tiny = nodes.filter((n) => !n.matches('input[type=checkbox]') && (n.matches('button') || n.matches('input, select')) && n.getBoundingClientRect().height < 20)
        .map((n) => n.id || n.className);
      // A group that paints outside its own box is the failure that started this.
      const spilling = [...panel.querySelectorAll('.ntfy-group')]
        .filter((g) => g.scrollHeight > g.clientHeight + 1)
        .map((g) => ({ group: g.className, content: g.scrollHeight, box: g.clientHeight }));
      const switchLabel = panel.querySelector('.ntfy-switch');
      const switchBox = switchLabel ? switchLabel.getBoundingClientRect() : null;
      return {
        overlaps, outside, squeezed, thin, tiny, spilling,
        switchHeight: switchBox ? Math.round(switchBox.height) : 0,
        count: nodes.length,
        panelWidth: Math.round(box.width),
      };
    })()`);
  }

  const layout = await measurePanel();
  console.log(`info: ${layout.count} controls measured in a ${layout.panelWidth}px panel`);
  check('no two controls overlap', layout.overlaps.length === 0, layout.overlaps);
  check('no control spills outside the panel', layout.outside.length === 0, layout.outside);
  check('no button has its text squeezed', layout.squeezed.length === 0, layout.squeezed);
  check('no button is a sliver', layout.thin.length === 0, layout.thin);
  check('no group paints over the one below it', layout.spilling.length === 0, layout.spilling);
  check('no control is too short to hit', layout.tiny.length === 0, layout.tiny);
  check('the command switch is a full row to press', layout.switchHeight >= 24, layout.switchHeight);

  const summary = await win.webContents.executeJavaScript(`(() => {
    const body = document.querySelector('#ntfyMessages .ntfy-msg-body').textContent;
    const pressed = [...el('ntfySlide').querySelectorAll('.ntfy-slide-opt')].map((b) => b.dataset.mode + ':' + b.getAttribute('aria-pressed'));
    return {
      body,
      endsWithEllipsis: body.endsWith('…'),
      length: body.length,
      pressed,
      limitDisabled: el('ntfyLimit').disabled,
      limitValue: el('ntfyLimit').value,
    };
  })()`);
  check('the slide starts on สรุป', summary.pressed.join(',') === 'summary:true,full:false', summary.pressed);
  check('a summary is cut to the chosen length', summary.endsWithEllipsis && summary.length <= 201, summary);
  check('the character box is usable in สรุป', summary.limitDisabled === false && summary.limitValue === '200', summary);

  const full = await win.webContents.executeJavaScript(`(async () => {
    el('ntfySlide').querySelector('.ntfy-slide-opt[data-mode="full"]').click();
    await new Promise((r) => setTimeout(r, 200));
    return {
      pressed: [...el('ntfySlide').querySelectorAll('.ntfy-slide-opt')].map((b) => b.dataset.mode + ':' + b.getAttribute('aria-pressed')),
      limitDisabled: el('ntfyLimit').disabled,
      body: document.querySelector('#ntfyMessages .ntfy-msg-body').textContent,
      note: el('ntfyLimitNote').textContent.trim(),
    };
  })()`);
  check('choosing ทั้งหมด moves the slide', full.pressed.join(',') === 'summary:false,full:true', full.pressed);
  check('the full message is shown whole', full.body.length === LONG.length && !full.body.endsWith('…'), full.body.length);
  check('the character box is disabled when it means nothing', full.limitDisabled === true, full);
  check('and the panel says why it is disabled', full.note.length > 0, full.note);
  check('choosing it asked the main process', calls.some((c) => c.name === 'setSummary' && c.payload.enabled === false), calls.slice(-3));

  const backend = await win.webContents.executeJavaScript(`(async () => {
    el('ntfySlide').querySelector('.ntfy-slide-opt[data-mode="summary"]').click();
    await new Promise((r) => setTimeout(r, 150));
    el('ntfyLimit').value = '60';
    el('ntfyLimit').dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 200));
    const cut = document.querySelector('#ntfyMessages .ntfy-msg-body').textContent;
    return { cut, limitDisabled: el('ntfyLimit').disabled };
  })()`);
  check('a shorter limit shortens the summary', backend.cut.length <= 61 && backend.cut.endsWith('…'), backend.cut.length);
  check(
    'the chosen length is saved',
    calls.some((c) => c.name === 'setSummary' && String(c.payload.limit) === '60' && c.payload.enabled === true),
    calls.slice(-3)
  );

  const room = await win.webContents.executeJavaScript(`(async () => {
    el('ntfyAddRoom').click();
    await new Promise((r) => setTimeout(r, 250));
    el('ntfyRooms').querySelector('.ntfy-room').click();
    await new Promise((r) => setTimeout(r, 150));
    return { rows: el('ntfyRooms').querySelectorAll('.ntfy-room').length };
  })()`);
  check('rooms are listed', room.rows >= 1, room);
  check('adding a room asks for one', calls.some((c) => c.name === 'addTopic'), calls.filter((c) => c.name === 'addTopic'));
  check('clicking a room makes it active', calls.some((c) => c.name === 'setActiveTopic'), calls.slice(-2));

  // Boot restore is not what this check is about; open the tab directly so the
  // command loop has a chat to land in.
  const tabOpened = await win.webContents.executeJavaScript(`(async () => {
    const res = await api.openTab({ cwd: '/tmp', restore: true });
    applyTabState(res.state);
    return { hasState: Boolean(res && res.state), views: views.size, active: activeTabId };
  })()`);
  console.log('info: tab opened', JSON.stringify(tabOpened));

  const viewInfo = await win.webContents.executeJavaScript(`(() => ({
    activeTabId: typeof activeTabId === 'undefined' ? '?' : activeTabId,
    views: typeof views === 'undefined' ? -1 : views.size,
    hasActiveView: Boolean(typeof activeView === 'function' && activeView()),
    inputExists: Boolean(el('input')),
    commandsOn: typeof ntfyCommandsOn === 'function' ? ntfyCommandsOn() : '?',
  }))()`);
  console.log('info: view state', JSON.stringify(viewInfo));

  const switches = await win.webContents.executeJavaScript(`(() => {
    const master = el('ntfyEnabled');
    const source = [...el('ntfySource').querySelectorAll('.ntfy-slide-opt')].map((b) => b.dataset.source + ':' + b.getAttribute('aria-pressed'));
    return { master: master ? master.checked : null, source };
  })()`);
  check('the master switch is on when the service is', switches.master === true, switches.master);
  check('the summary source starts on this machine', switches.source.join(',') === 'local:true,provider:false', switches.source);

  await win.webContents.executeJavaScript(`(async () => {
    el('ntfySource').querySelector('.ntfy-slide-opt[data-source="provider"]').click();
    await new Promise((r) => setTimeout(r, 200));
    el('ntfyEnabled').checked = false;
    el('ntfyEnabled').dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 200));
    el('ntfyEnabled').checked = true;
    el('ntfyEnabled').dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 200));
    return true;
  })()`);
  check(
    'choosing the provider for summaries is saved',
    calls.some((c) => c.name === 'setSummary' && c.payload.source === 'provider'),
    calls.filter((c) => c.name === 'setSummary').slice(-2)
  );
  check(
    'the master switch is saved both ways',
    calls.some((c) => c.name === 'setEnabled' && c.payload.enabled === false) &&
      calls.some((c) => c.name === 'setEnabled' && c.payload.enabled === true),
    calls.filter((c) => c.name === 'setEnabled')
  );

  // Hover opens the panel, the same gesture as the controls beside it.
  const hover = await win.webContents.executeJavaScript(`(async () => {
    if (!el('ntfyPanel').hidden) el('ntfyChip').click();
    const closed = el('ntfyPanel').hidden;
    el('ntfyWrap').dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 150));
    const opened = !el('ntfyPanel').hidden;
    el('ntfyWrap').dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 350));
    return { closed, opened, closedAgain: el('ntfyPanel').hidden };
  })()`);
  check('pointing at the chip opens the panel', hover.closed === true && hover.opened === true, hover);
  check('leaving it closes it again', hover.closedAgain === true, hover);

  const commandUi = await win.webContents.executeJavaScript(`(() => {
    const box = el('ntfyCommands');
    const label = box ? box.closest('.ntfy-switch') : null;
    return {
      exists: Boolean(box),
      checked: box ? box.checked : null,
      hasLabel: label ? label.textContent.trim().length > 10 : false,
      title: el('ntfyCommands') ? (document.querySelector('.ntfy-group-title:last-of-type') || {}).textContent || '' : '',
      sendGone: !el('ntfySend') && !el('ntfyBody') && !el('ntfyTitle'),
      groups: [...document.querySelectorAll('#ntfyPanel .ntfy-group-title')].map((n) => n.textContent.trim()),
    };
  })()`);
  check('the send-message group is gone', commandUi.sendGone === true, commandUi);
  check('the last group is the command switch', commandUi.exists === true && commandUi.hasLabel === true, commandUi);
  check('it is on by default', commandUi.checked === true, commandUi.checked);

  // A message from the room becomes a prompt, and the answer goes back to it.
  win.webContents.send('ntfy:event', {
    type: 'message',
    payload: {
      message: { id: 'cmd1', time: Date.now(), title: '', message: 'list the files here', tags: [] },
      state: state(),
    },
  });
  await new Promise((r) => setTimeout(r, 500));
  const prompted = calls.filter((c) => c.name === 'sendPrompt').pop();
  check('a room message becomes a prompt in the chat', prompted?.payload?.text === 'list the files here', prompted);

  win.webContents.send('agent:settled', { tabId: 't1', aborted: false, failed: false });
  await new Promise((r) => setTimeout(r, 700));
  const reply = calls.filter((c) => c.name === 'publish').pop();
  check('the answer is sent back to the room', Boolean(reply?.payload?.message), reply);
  check('a summarizer was asked for the answer', calls.some((c) => c.name === 'summarize'), calls.filter((c) => c.name === 'summarize'));
  check(
    'the reply is the summary, not a cut of the answer',
    reply?.payload?.message === 'สรุปสั้นจากโมเดล',
    reply?.payload?.message
  );
  check(
    'it is tagged so it does not come back as a command',
    Array.isArray(reply?.payload?.tags) && reply.payload.tags.includes('ntapi-reply'),
    reply && reply.payload.tags
  );

  const beforeOwn = calls.filter((c) => c.name === 'sendPrompt').length;
  win.webContents.send('ntfy:event', {
    type: 'message',
    payload: {
      message: { id: 'r9', time: Date.now(), title: 'NTAPI', message: 'the answer', tags: ['ntapi-reply'] },
      state: state(),
    },
  });
  await new Promise((r) => setTimeout(r, 400));
  check(
    'our own answer is not run as a command',
    calls.filter((c) => c.name === 'sendPrompt').length === beforeOwn,
    calls.filter((c) => c.name === 'sendPrompt').slice(-2)
  );

  // Switching commands off must stop the loop dead.
  await win.webContents.executeJavaScript(`(() => {
    el('ntfyCommands').checked = false;
    el('ntfyCommands').dispatchEvent(new Event('change'));
    return true;
  })()`);
  const beforeOff = calls.filter((c) => c.name === 'sendPrompt').length;
  win.webContents.send('ntfy:event', {
    type: 'message',
    payload: { message: { id: 'cmd2', time: Date.now(), message: 'do something else', tags: [] }, state: state() },
  });
  await new Promise((r) => setTimeout(r, 400));
  check(
    'with the switch off nothing is run',
    calls.filter((c) => c.name === 'sendPrompt').length === beforeOff,
    calls.filter((c) => c.name === 'sendPrompt').length
  );
  await win.webContents.executeJavaScript(`(() => {
    el('ntfyCommands').checked = true;
    el('ntfyCommands').dispatchEvent(new Event('change'));
    return true;
  })()`);

  // A message arriving while the panel is shut must show up on the chip, not
  // only in the list nobody is looking at.
  const arrived = await win.webContents.executeJavaScript(`(async () => {
    el('ntfyChip').click();
    await new Promise((r) => setTimeout(r, 100));
    return { ok: true };
  })()`);
  win.webContents.send('ntfy:event', {
    type: 'message',
    payload: { message: { id: 'm2', time: Date.now(), title: 'Ping', message: 'hello from the phone' }, state: state() },
  });
  await new Promise((r) => setTimeout(r, 250));
  const counted = await win.webContents.executeJavaScript(`(() => ({
    badge: Boolean(el('ntfyCount')),
  }))()`);
  check('the chip carries no notification count', counted.badge === false, counted);

  /*
   * Proof that the check above can fail: the original bug was a group allowed to
   * shrink to nothing while still painting its content over the group below. Put
   * that back for one measurement and the overlap must appear — a detector that
   * passes everything is worse than none.
   */
  await win.webContents.executeJavaScript(`(() => {
    if (el('ntfyPanel').hidden) el('ntfyChip').click();
    const group = document.querySelector('.ntfy-group.ntfy-incoming');
    group.dataset.proof = 'on';
    group.style.flex = '1 1 auto';
    group.style.minHeight = '0px';
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 150));
  const broken = await measurePanel();
  await win.webContents.executeJavaScript(`(() => {
    const group = document.querySelector('.ntfy-group.ntfy-incoming');
    group.style.flex = '';
    group.style.minHeight = '';
    delete group.dataset.proof;
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 150));
  check('the overlap check catches the bug it was written for', broken.overlaps.length > 0, broken.overlaps.slice(0, 3));

  // The same measurements at a narrow window: this panel is what a crowded
  // layout ruins first, and a 460px window is where squeezing shows up.
  win.setSize(460, 700);
  await new Promise((r) => setTimeout(r, 400));
  await win.webContents.executeJavaScript(`(() => {
    if (el('ntfyPanel').hidden) el('ntfyChip').click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 200));
  const narrow = await measurePanel();
  console.log(`info: ${narrow.count} controls measured in a ${narrow.panelWidth}px panel at a 460px window`);
  check('a narrow window still has no overlap', narrow.overlaps.length === 0, narrow.overlaps);
  check('a narrow window keeps every control inside', narrow.outside.length === 0, narrow.outside);
  check('a narrow window does not squeeze button text', narrow.squeezed.length === 0, narrow.squeezed);
  check('a narrow window does not spill a group', narrow.spilling.length === 0, narrow.spilling);
  win.setSize(1280, 900);
  await new Promise((r) => setTimeout(r, 400));

  const shot = await win.webContents.executeJavaScript(`(() => {
    el('ntfyPanel').hidden ? el('ntfyChip').click() : null;
    return el('ntfyPanel').hidden;
  })()`);
  const shots = path.join(__dirname, '..', '..', 'shots');
  fs.mkdirSync(shots, { recursive: true });
  for (const theme of ['dark', 'light']) {
    await win.webContents.executeJavaScript(`document.documentElement.dataset.theme = '${theme}'; true`);
    await new Promise((r) => setTimeout(r, 200));
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(shots, `ntfy-panel-${theme}.png`), image.toPNG());
  }
  // The panel scrolls; the command switch lives at the bottom of it, so it gets
  // its own picture instead of being below the fold in the other two.
  await win.webContents.executeJavaScript(`(() => {
    if (el('ntfyPanel').hidden) el('ntfyChip').click();
    el('ntfyPanel').scrollTop = el('ntfyPanel').scrollHeight;
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 200));
  const bottom = await win.webContents.capturePage();
  fs.writeFileSync(path.join(shots, 'ntfy-panel-commands.png'), bottom.toPNG());

  check('screenshots were written for a human to look at', fs.existsSync(path.join(shots, 'ntfy-panel-dark.png')), shot);

  const closed = await win.webContents.executeJavaScript(`(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    return { hidden: el('ntfyPanel').hidden, expanded: el('ntfyChip').getAttribute('aria-expanded') };
  })()`);
  check('Escape closes the panel', closed.hidden === true && closed.expanded === 'false', closed);

  console.log(failures.length ? `\n${failures.length} ntfy panel check(s) failed` : '\nAll ntfy panel checks passed.');
  app.exit(failures.length ? 1 : 0);
}).catch((err) => {
  // A thrown check is a failure, not a silent exit: print where it happened.
  console.error('ntfy panel check crashed:', err && err.stack ? err.stack : err);
  app.exit(1);
});

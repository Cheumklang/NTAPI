'use strict';

/**
 * The window half of NTAPI ADS.
 *
 * Two rules shape this file:
 *
 * 1. Nothing is validated here that could be validated in `media.js`/`feed.js` —
 *    the caps, the crop maths and the ratio bounds come across the bridge. This
 *    file only decides *when* to ask.
 * 2. The board is only rebuilt when the list changes. Typing in the editor
 *    writes straight into the slot object and repaints the preview and that one
 *    card's title, because rebuilding the board on each keystroke would steal
 *    the caret mid-word — the bug this rewrite exists to remove.
 *
 * The board is the list of creatives (four to a row); the drawer on the right is
 * one creative's detail. They are separate views of the same `state.slots`.
 */

const api = window.ads;
const R = window.adsRules;
const LIMITS = R.limits;

const $ = (id) => document.getElementById(id);

const state = {
  cfg: null,
  rotateSeconds: LIMITS.defaultRotate,
  mutePreview: true,
  slots: [],
  openId: '',
  busy: false,
};

/* -------------------------------- small utils ------------------------------ */

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== null && value !== undefined && value !== false) {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function bytesLabel(n) {
  const value = Number(n) || 0;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

/** One status line in the tools column; `detail` is appended, never replaced. */
function setStatus(kind, text, detail = '') {
  const bar = $('status');
  bar.classList.remove('busy', 'ok', 'bad');
  if (kind) bar.classList.add(kind);
  bar.textContent = detail ? `${text} · ${detail}` : text;
}

const REASONS = {
  'unsupported-type': 'ชนิดไฟล์ไม่รองรับ (รับ webp/png/jpg/gif หรือ mp4/webm)',
  'image-too-big': `รูปใหญ่เกิน ${bytesLabel(LIMITS.maxImageBytes)}`,
  'image-unreadable': 'เปิดรูปไม่ได้',
  'video-too-big': `วิดีโอใหญ่เกิน ${bytesLabel(LIMITS.maxVideoBytes)}`,
  'video-too-long': `วิดีโอยาวเกิน ${LIMITS.maxVideoSeconds} วินาที`,
  'video-unreadable': 'เปิดวิดีโอไม่ได้',
  'poster-too-big': 'ภาพปกวิดีโอใหญ่เกินกำหนด',
};

function reasonText(reason) {
  return REASONS[reason] || reason || 'ไม่ทราบสาเหตุ';
}

/* --------------------------------- model ---------------------------------- */

/**
 * The month is in the default id because NTAPI counts clicks per id: reusing an
 * id for a different sponsor would carry the old count over to them.
 */
function uniqueId() {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const base = `sponsor-${stamp}`;
  if (!state.slots.some((s) => s.id === base)) return base;
  let n = state.slots.length + 1;
  while (state.slots.some((s) => s.id === `${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function newSlot() {
  return {
    id: uniqueId(),
    enabled: true,
    url: '',
    alt: '',
    text: { th: { label: 'ผู้สนับสนุน', title: '' }, en: { label: 'Sponsor', title: '' } },
    media: {
      type: 'image',
      file: '',
      ratio: R.defaultRatio,
      base64: '',
      sourcePath: '',
      sourceBase64: '',
      sourceName: '',
      posterBase64: '',
      poster: '',
      previewUrl: '',
      bytes: 0,
      width: 0,
      height: 0,
      seconds: 0,
      note: '',
      noteKind: '',
    },
  };
}

function slotFromFeed(raw) {
  const slot = newSlot();
  slot.id = raw.id;
  slot.url = raw.url;
  slot.alt = (raw.media && raw.media.alt) || '';
  slot.text = {
    th: { ...slot.text.th, ...(raw.text && raw.text.th) },
    en: { ...slot.text.en, ...(raw.text && raw.text.en) },
  };
  slot.media.type = raw.media.type;
  slot.media.file = raw.media.file;
  slot.media.poster = raw.media.poster || '';
  // The frame is part of the published creative, not a view preference: the file
  // in the repo is already cropped to it. Missing or unknown (older feeds) falls
  // back to 2:1, same rule the reader uses.
  slot.media.ratio = R.ratioOf(raw.media && raw.media.ratio);
  // `file` is repo-relative, so the preview renders from the CDN — the same bytes
  // an installed NTAPI would fetch.
  slot.media.previewUrl = `${R.readBase[0]}${raw.media.file}`;
  slot.media.note = 'เผยแพร่อยู่ใน repo แล้ว';
  slot.media.noteKind = 'ok';
  return slot;
}

function openSlot() {
  return state.slots.find((s) => s.id === state.openId) || null;
}

function usableSlots() {
  return state.slots.filter((s) => s.enabled);
}

/* ------------------------------- media reading ---------------------------- */

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('เปิดรูปไม่ได้'));
    img.src = url;
  });
}

function once(target, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      target.removeEventListener(event, onEvent);
      reject(new Error('อ่านไฟล์ไม่ทันเวลา'));
    }, timeoutMs);
    function onEvent() {
      clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      resolve();
    }
    target.addEventListener(event, onEvent);
  });
}

function blobFromBase64(base64, mime) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Centre-cover into the canonical frame. The background fill matters: a
 * transparent PNG over the sidebar would otherwise show the app's own colours
 * through the banner and look like a rendering bug.
 */
function encodeFrame(draw, srcW, srcH, qualitySteps, ratio) {
  const size = R.mediaSize(ratio);
  const W = size.w;
  const H = size.h;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#0f1116';
  ctx.fillRect(0, 0, W, H);
  const rect = R.coverRect(srcW, srcH, W, H);
  if (!rect) throw new Error('ขนาดภาพไม่ถูกต้อง');
  draw(ctx, rect, W, H);

  let last = null;
  for (const quality of qualitySteps) {
    const dataUrl = canvas.toDataURL('image/webp', quality);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    last = { dataUrl, base64, bytes: R.base64Bytes(base64) };
    if (last.bytes <= LIMITS.maxImageBytes) return last;
  }
  return last;
}

async function ingestImage(slot, name, base64) {
  const mime = R.mimeFor(R.extOf(name));
  if (!mime) throw new Error('ชนิดไฟล์ไม่รองรับ');
  const url = `data:${mime};base64,${base64}`;
  const img = await loadImage(url);
  const verdict = R.checkFile({
    name,
    bytes: R.base64Bytes(base64),
    width: img.naturalWidth,
    height: img.naturalHeight,
  });
  if (!verdict.ok) throw new Error(reasonText(verdict.reason));

  const ratio = R.ratioOf(slot.media && slot.media.ratio);
  const size = R.mediaSize(ratio);
  const encoded = encodeFrame(
    (ctx, rect, W, H) => ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h),
    img.naturalWidth,
    img.naturalHeight,
    [0.92, 0.85, 0.75, 0.62],
    ratio,
  );

  slot.media = {
    ...slot.media,
    type: 'image',
    file: '',
    // The untouched bytes stay in memory so switching the frame ratio re-crops
    // the original instead of cropping a crop (which loses the edges twice).
    base64: encoded.base64,
    sourcePath: '',
    sourceBase64: base64,
    sourceName: name,
    posterBase64: '',
    poster: '',
    previewUrl: encoded.dataUrl,
    bytes: encoded.bytes,
    width: size.w,
    height: size.h,
    seconds: 0,
    note: `${name} → ครอป ${size.w}×${size.h} WebP (${ratio}) · ${bytesLabel(encoded.bytes)}`,
    noteKind: 'ok',
  };
}

async function ingestVideo(slot, name, base64, filePath) {
  const mime = R.mimeFor(R.extOf(name));
  if (!mime) throw new Error('ชนิดไฟล์ไม่รองรับ');
  const blobUrl = URL.createObjectURL(blobFromBase64(base64, mime));
  const video = el('video', { preload: 'metadata', muted: true, playsinline: true, src: blobUrl });
  try {
    await once(video, 'loadedmetadata');
    const verdict = R.checkFile({
      name,
      bytes: R.base64Bytes(base64),
      seconds: video.duration,
    });
    if (!verdict.ok) throw new Error(reasonText(verdict.reason));

    const poster = await capturePoster(video, slot.media && slot.media.ratio);
    slot.media = {
      ...slot.media,
      type: 'video',
      file: '',
      base64: '',
      sourcePath: filePath || '',
      sourceBase64: base64,
      sourceName: name,
      posterBase64: poster.base64,
      poster: '',
      previewUrl: blobUrl,
      bytes: R.base64Bytes(base64),
      width: video.videoWidth,
      height: video.videoHeight,
      seconds: video.duration,
      note: `${name} · ${video.videoWidth}×${video.videoHeight} · ${video.duration.toFixed(1)} วิ · ${bytesLabel(
        R.base64Bytes(base64),
      )} (ไม่แปลงไฟล์ — NTAPI ครอปด้วย object-fit)`,
      noteKind: 'ok',
    };
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

/** The still shown while the clip loads, and instead of it under reduced motion. */
async function capturePoster(video, ratio) {
  const at = Math.min(0.4, Math.max(0, (Number(video.duration) || 1) / 2));
  video.currentTime = at;
  await once(video, 'seeked');
  const encoded = encodeFrame(
    (ctx, rect, W, H) => ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h),
    video.videoWidth,
    video.videoHeight,
    [0.9, 0.8, 0.7, 0.6],
    ratio,
  );
  if (encoded.bytes > LIMITS.maxPosterBytes) throw new Error(reasonText('poster-too-big'));
  return encoded;
}

async function ingest(slot, info) {
  const ext = R.extOf(info.name);
  const kind = R.kindOfExt(ext);
  if (kind === 'image') await ingestImage(slot, info.name, info.base64);
  else if (kind === 'video') await ingestVideo(slot, info.name, info.base64, info.path);
  else throw new Error(reasonText('unsupported-type'));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
    reader.readAsDataURL(file);
  });
}

/** After any ingest the media is new: repaint exactly the parts that show it. */
function afterIngest(slot, statusText, statusKind, detail) {
  paintCard(slot);
  paintPreview();
  setStatus(statusKind, statusText, detail);
}

async function takeFile(slot, file) {
  setStatus('busy', 'กำลังอ่านไฟล์...', file.name);
  try {
    const base64 = await fileToBase64(file);
    // A dropped file has no path we may trust, so the bytes travel with the slot
    // instead of being re-read by main later.
    await ingest(slot, { name: file.name, base64 });
    afterIngest(slot, 'พร้อมเผยแพร่', 'ok', slot.media.note);
  } catch (err) {
    slot.media.note = err instanceof Error ? err.message : String(err);
    slot.media.noteKind = 'bad';
    afterIngest(slot, 'ไฟล์นี้ใช้ไม่ได้', 'bad', slot.media.note);
  }
}

async function takeUrl(slot, url) {
  setStatus('busy', 'กำลังดาวน์โหลด...', url);
  try {
    const res = await api.fetchMedia(url);
    if (!res || !res.ok) throw new Error((res && res.error) || 'ดาวน์โหลดไม่สำเร็จ');
    await ingest(slot, { name: res.name, base64: res.base64 });
    afterIngest(slot, 'พร้อมเผยแพร่', 'ok', slot.media.note);
  } catch (err) {
    slot.media.note = err instanceof Error ? err.message : String(err);
    slot.media.noteKind = 'bad';
    afterIngest(slot, 'ลิงก์นี้ใช้ไม่ได้', 'bad', slot.media.note);
  }
}

async function pickFile(slot) {
  setStatus('busy', 'กำลังเปิดไฟล์...');
  const res = await api.pickMedia();
  if (!res || !res.ok) {
    if (!(res && res.canceled)) setStatus('bad', 'เลือกไฟล์ไม่สำเร็จ', res && res.error);
    else setStatus('', 'พร้อม');
    return;
  }
  setStatus('busy', 'กำลังประมวลผล...', res.name);
  try {
    await ingest(slot, { name: res.name, base64: res.base64, path: res.path });
    afterIngest(slot, 'พร้อมเผยแพร่', 'ok', slot.media.note);
  } catch (err) {
    slot.media.note = err instanceof Error ? err.message : String(err);
    slot.media.noteKind = 'bad';
    afterIngest(slot, 'ไฟล์นี้ใช้ไม่ได้', 'bad', slot.media.note);
  }
}

/**
 * Switching the frame re-crops from the bytes the operator gave us, never from
 * the previous crop: cropping a crop would shave the edges off every switch.
 */
async function applyRatio(slot, ratio) {
  slot.media.ratio = R.ratioOf(ratio);
  paintRatioRow(slot);
  paintPreview();
  paintCard(slot);
  if (!slot.media.previewUrl) return;
  if (!slot.media.sourceBase64) {
    slot.media.note = 'ต้องเลือกไฟล์ใหม่เพื่อครอปอัตราส่วนนี้';
    slot.media.noteKind = 'bad';
    paintPreview();
    return;
  }
  setStatus('busy', 'กำลังครอปใหม่...', slot.media.ratio);
  try {
    if (slot.media.type === 'video') {
      await ingestVideo(slot, slot.media.sourceName, slot.media.sourceBase64, slot.media.sourcePath);
    } else {
      await ingestImage(slot, slot.media.sourceName, slot.media.sourceBase64);
    }
    afterIngest(slot, 'ครอปใหม่แล้ว', 'ok', slot.media.note);
  } catch (err) {
    slot.media.note = err instanceof Error ? err.message : String(err);
    slot.media.noteKind = 'bad';
    afterIngest(slot, 'ครอปใหม่ไม่สำเร็จ', 'bad', slot.media.note);
  }
}

/* --------------------------------- painting ------------------------------- */

function mediaNode(slot) {
  const media = slot.media || {};
  if (!media.previewUrl) return null;
  if (media.type === 'video') {
    return el('video', {
      src: media.previewUrl,
      ...(media.poster ? { poster: media.poster } : {}),
      muted: true,
      loop: true,
      autoplay: true,
      playsinline: true,
      title: media.alt || slot.alt || '',
    });
  }
  return el('img', { src: media.previewUrl, alt: media.alt || slot.alt || '' });
}

/** The card's picture: the same bytes the editor previews, object-fit: cover. */
function paintCardThumb(card, slot) {
  const thumb = card.querySelector('.card-thumb');
  if (!thumb) return;
  releaseVideos(thumb);
  thumb.replaceChildren();
  const node = mediaNode(slot);
  if (node) thumb.appendChild(node);
  else thumb.appendChild(el('span', { class: 'thumb-empty', text: 'ยังไม่มีรูป/วิดีโอ' }));
  // A thumbnail is decoration: it never carries sound, whatever the attribute
  // parser decided.
  if (node && node.tagName === 'VIDEO') node.muted = true;
  thumb.appendChild(
    el('span', { class: 'card-index', text: String(state.slots.indexOf(slot) + 1) }),
  );
  thumb.appendChild(
    el('span', { class: 'card-kind', text: slot.media.type === 'video' ? 'วิดีโอ' : 'รูป' }),
  );
  const size = R.frameSize(slot.media.ratio);
  thumb.style.aspectRatio = `${size.w} / ${size.h}`;
}

/** Cheap repaint: only the parts of one card that change while typing. */
function paintCard(slot) {
  const card = $('slots').querySelector(`.card[data-id="${CSS.escape(slot.id)}"]`);
  if (!card) return;
  card.classList.toggle('is-open', slot.id === state.openId);
  card.classList.toggle('is-off', !slot.enabled);
  card.querySelector('.card-name').textContent = slot.text.th.title || '(ยังไม่มีชื่อสปอนเซอร์)';
  const meta = card.querySelector('.card-meta');
  meta.replaceChildren();
  meta.appendChild(el('span', { class: 'badge muted', text: R.ratioOf(slot.media.ratio) }));
  if (!slot.media.previewUrl) meta.appendChild(el('span', { class: 'badge warn', text: 'ยังไม่มีไฟล์' }));
  if (!slot.url) meta.appendChild(el('span', { class: 'badge warn', text: 'ยังไม่มีลิงก์' }));
  paintCardThumb(card, slot);
}

function cardNode(slot) {
  const card = el('button', { type: 'button', class: 'card', 'data-id': slot.id }, [
    el('div', { class: 'card-thumb' }),
    el('div', { class: 'card-body' }, [
      el('span', { class: 'card-name' }),
      el('div', { class: 'card-meta' }),
    ]),
  ]);
  card.addEventListener('click', () => openEditor(slot.id));
  return card;
}

function renderBoard() {
  const host = $('slots');
  host.replaceChildren();
  for (const slot of state.slots) host.appendChild(cardNode(slot));
  for (const slot of state.slots) paintCard(slot);
  const empty = !state.slots.length;
  $('emptyBoard').hidden = !empty;
  host.hidden = empty;
  const usable = usableSlots().length;
  $('boardSub').textContent = state.slots.length
    ? `ใช้ได้ ${usable} / ${state.slots.length} ใบ · หมุนเวียนทุก ${state.rotateSeconds} วินาที`
    : 'ยังไม่มีโฆษณา — กด “เพิ่มโฆษณา” เพื่อเริ่ม';
}

/**
 * A <video> removed from the document keeps playing. Every repaint used to
 * abandon the previous clip mid-audio, so pressing mute appeared to do nothing:
 * the sound came from an element that was no longer on screen. Stop it first.
 */
function releaseVideos(root) {
  if (!root) return;
  for (const video of root.querySelectorAll('video')) {
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {}
  }
}

function paintPreview() {
  const host = $('frameMedia');
  const slot = openSlot();
  releaseVideos(host);
  host.replaceChildren();
  if (!slot) return;

  const ratio = R.ratioOf(slot.media.ratio);
  const frame = R.frameSize(ratio);
  const full = R.mediaSize(ratio);
  host.style.aspectRatio = `${frame.w} / ${frame.h}`;
  $('frameSize').textContent = `${ratio} · ${frame.w} × ${frame.h} px (ไฟล์จริง ${full.w} × ${full.h})`;

  const node = mediaNode(slot);
  if (node) {
    if (node.tagName === 'VIDEO') {
      // Start silent and unmute only once it is really playing: setting
      // `muted = false` before playback begins makes Chromium refuse the autoplay.
      node.muted = true;
      host.appendChild(node);
      if (!state.mutePreview) {
        node.addEventListener(
          'playing',
          () => {
            node.muted = state.mutePreview;
          },
          { once: true },
        );
      }
    } else {
      host.appendChild(node);
    }
  } else {
    host.appendChild(el('div', { class: 'preview-empty', text: 'ยังไม่มีรูป/วิดีโอ' }));
  }

  $('previewSound').hidden = !(slot.media.type === 'video' && Boolean(slot.media.previewUrl));
  paintPreviewText();
  paintSoundControls();

  const note = $('mediaNote');
  if (note) note.textContent = slot.media.note || 'ลากไฟล์มาวางบนตัวอย่าง หรือกด “เลือกไฟล์”';
  if (note) note.className = `field-hint${slot.media.noteKind === 'bad' ? ' bad' : ''}`;
}

/** The words only: typing a title must not restart the clip. */
function paintPreviewText() {
  const slot = openSlot();
  if (!slot) return;
  $('frameLabel').textContent = slot.text.th.label || 'ผู้สนับสนุน';
  $('frameTitle').textContent = slot.text.th.title || '(ยังไม่มีชื่อสปอนเซอร์)';
}

/**
 * The chip shows the action, not the state: while the clip is silent it offers
 * "เปิดเสียง". The old label said "ปิดเสียง" while already silent, so pressing it
 * turned the sound ON — the opposite of what the words promised.
 */
function paintSoundControls() {
  $('muteSwitch').setAttribute('aria-checked', state.mutePreview ? 'true' : 'false');
  $('soundText').textContent = state.mutePreview ? 'เปิดเสียง' : 'ปิดเสียง';
  $('previewSound').setAttribute('aria-pressed', state.mutePreview ? 'false' : 'true');
}

/** Mute what is already on screen — rebuild-free, so no audio is orphaned. */
function applyMuteNow() {
  for (const video of $('frameMedia').querySelectorAll('video')) video.muted = state.mutePreview;
  // "Silent" has to mean silent: nothing else in the window may keep singing,
  // including a thumbnail the operator never asked to hear.
  if (state.mutePreview) {
    for (const video of document.querySelectorAll('video')) video.muted = true;
  }
  paintSoundControls();
}

/* ---------------------------------- editor -------------------------------- */

function section(title, children, hint = '') {
  return el('div', { class: 'field' }, [
    el('div', { class: 'field-label', text: title }),
    ...(hint ? [el('p', { class: 'field-hint', text: hint })] : []),
    ...children,
  ]);
}

function textInput(value, onInput, opts = {}) {
  const input = el('input', {
    type: 'text',
    value: value || '',
    spellcheck: 'false',
    placeholder: opts.placeholder || '',
    ...(opts.field ? { 'data-field': opts.field } : {}),
  });
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

function ratioRow(slot) {
  const row = el('div', { class: 'ratio-grid', 'data-role': 'ratio-row' });
  const active = R.ratioOf(slot.media.ratio);
  const isPreset = R.ratios.includes(active);

  for (const name of R.ratios) {
    const [w, h] = R.parseRatio(name);
    const shape = el('span', { class: 'ratio-shape' });
    // Drawn to the real proportions, capped so a 9:16 does not blow the row up.
    const longest = 26;
    shape.style.width = `${Math.round((w >= h ? longest : (longest * w) / h))}px`;
    shape.style.height = `${Math.round((h >= w ? longest : (longest * h) / w))}px`;
    const btn = el('button', {
      type: 'button',
      class: `ratio-btn${name === active ? ' is-on' : ''}`,
      'data-ratio': name,
      title: `${name} — ${R.mediaSize(name).w}×${R.mediaSize(name).h}`,
    }, [shape, el('span', { text: name })]);
    btn.addEventListener('click', () => applyRatio(slot, name));
    row.appendChild(btn);
  }

  const customBtn = el('button', {
    type: 'button',
    class: `ratio-btn${isPreset ? '' : ' is-on'}`,
    'data-ratio': 'custom',
    title: 'กำหนดสัดส่วนเอง',
  }, [el('span', { class: 'ratio-shape' }), el('span', { text: 'กำหนดเอง' })]);
  customBtn.querySelector('.ratio-shape').style.width = '20px';
  customBtn.querySelector('.ratio-shape').style.height = '24px';
  customBtn.addEventListener('click', () => openSizeDialog(slot, customBtn));
  row.appendChild(customBtn);

  return el('div', { class: 'field' }, [row]);
}

/* ---------------------------- custom frame dialog -------------------------- */

/**
 * The custom frame is a dialog, not two boxes parked in the editor: the shape is
 * typed once, and an always-visible row of bare number inputs made the panel look
 * unfinished. The steppers are ours so they match the theme instead of
 * Chromium's grey native arrows.
 */
let closeSizeDialog = null;

function stepperRow(label, field, value, max, onEdit) {
  const input = el('input', {
    type: 'number',
    min: '1',
    max: String(max),
    value: String(value),
    'data-field': field,
  });
  const clamp = (n) => Math.min(max, Math.max(1, Math.round(Number(n) || 1)));
  const minus = el('button', { type: 'button', class: 'step-btn', 'aria-label': `ลด${label}`, text: '−' });
  const plus = el('button', { type: 'button', class: 'step-btn', 'aria-label': `เพิ่ม${label}`, text: '+' });
  minus.addEventListener('click', () => {
    input.value = String(clamp(Number(input.value) - 1));
    onEdit();
  });
  plus.addEventListener('click', () => {
    input.value = String(clamp(Number(input.value) + 1));
    onEdit();
  });
  input.addEventListener('input', onEdit);
  return {
    input,
    node: el('div', { class: 'field' }, [
      el('div', { class: 'field-label', text: label }),
      el('div', { class: 'stepper' }, [minus, input, plus]),
    ]),
  };
}

function openSizeDialog(slot, opener) {
  if (closeSizeDialog) closeSizeDialog();

  const active = R.ratioOf(slot.media.ratio);
  const start = R.ratios.includes(active) ? [3, 2] : R.parseRatio(active);
  const bounds = R.ratioBounds;

  const preview = el('p', { class: 'field-hint' });
  const error = el('p', { class: 'dialog-error' });
  const applyBtn = el('button', { type: 'button', class: 'btn primary', text: 'ใช้ขนาดนี้' });
  const width = stepperRow('กว้าง', 'ratio-w', start[0], bounds.sidesMax, () => validate());
  const height = stepperRow('สูง', 'ratio-h', start[1], bounds.sidesMax, () => validate());

  function validate() {
    const next = R.ratioFromSides(width.input.value, height.input.value);
    if (!next) {
      const w = Number(width.input.value) || 0;
      const h = Number(height.input.value) || 0;
      error.textContent = `สัดส่วน ${w}:${h} ใช้ไม่ได้ — ด้านละ 1–${bounds.sidesMax} และสูงไม่เกิน ${bounds.tallMax} เท่าของความกว้าง`;
      preview.textContent = '';
      applyBtn.disabled = true;
      return;
    }
    const frame = R.frameSize(next);
    const full = R.mediaSize(next);
    error.textContent = '';
    preview.textContent = `${next} · ${frame.w} × ${frame.h} px (ไฟล์จริง ${full.w} × ${full.h})`;
    applyBtn.disabled = false;
  }

  const dialog = el('div', { class: 'dialog', 'data-role': 'size-dialog' }, [
    el('div', { class: 'dialog-scrim' }),
    el('div', {
      class: 'dialog-panel',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'sizeDialogTitle',
    }, [
      el('div', { class: 'dialog-head' }, [
        el('h2', { id: 'sizeDialogTitle', text: 'ขนาดกำหนดเอง' }),
        el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'ปิด', onclick: close }, [
          el('span', { text: '✕' }),
        ]),
      ]),
      el('div', { class: 'dialog-body' }, [
        el('div', { class: 'field-row' }, [width.node, height.node]),
        preview,
        error,
      ]),
      el('div', { class: 'dialog-foot' }, [
        el('button', { type: 'button', class: 'btn', text: 'ยกเลิก', onclick: close }),
        applyBtn,
      ]),
    ]),
  ]);

  function close() {
    dialog.remove();
    closeSizeDialog = null;
    if (opener) opener.focus();
  }

  applyBtn.addEventListener('click', () => {
    const next = R.ratioFromSides(width.input.value, height.input.value);
    if (!next) return;
    close();
    applyRatio(slot, next);
  });
  dialog.querySelector('.dialog-scrim').addEventListener('click', close);

  document.body.appendChild(dialog);
  closeSizeDialog = close;
  validate();
  width.input.focus();
  width.input.select();
}

/** Re-marks the ratio buttons without rebuilding the input the operator types in. */
function paintRatioRow(slot) {
  const row = $('fields').querySelector('[data-role="ratio-row"]');
  if (!row) return;
  const active = R.ratioOf(slot.media.ratio);
  const isPreset = R.ratios.includes(active);
  for (const btn of row.querySelectorAll('.ratio-btn')) {
    const key = btn.dataset.ratio;
    btn.classList.toggle('is-on', key === active || (key === 'custom' && !isPreset));
  }
}

function buildFields(slot) {
  const fields = $('fields');
  fields.replaceChildren();
  const cardName = () => paintCard(slot);

  // --- 1 · the creative itself. The preview above is the drop target; this row
  // is the second way in (a link from the sponsor) plus the running result.
  const linkInput = textInput('', () => {}, { field: 'link', placeholder: 'https://.../poster.webp' });
  const linkBtn = el('button', { type: 'button', class: 'btn', text: 'ดึงจากลิงก์' });
  linkBtn.addEventListener('click', () => {
    const value = linkInput.value.trim();
    if (!value) return setStatus('bad', 'ยังไม่ได้วางลิงก์');
    if (!R.mediaUrlAllowed(value)) return setStatus('bad', 'ลิงก์ต้องเป็น https และเป็นไฟล์รูป/วิดีโอ');
    takeUrl(slot, value);
  });
  fields.appendChild(
    section('1 · ไฟล์โฆษณา', [
      el('div', { class: 'input-row' }, [linkInput, linkBtn]),
      el('p', { class: 'field-hint', id: 'mediaNote', text: slot.media.note || 'ลากไฟล์มาวางบนตัวอย่าง หรือกด “เลือกไฟล์”' }),
    ]),
  );

  // --- 2 · where a click goes. Cannot be published without it.
  const urlInput = textInput(slot.url, (v) => {
    slot.url = v.trim();
    paintCard(slot);
  }, { field: 'url', placeholder: 'https://...' });
  fields.appendChild(section('2 · ลิงก์ปลายทาง', [urlInput], 'ต้องเป็น https เท่านั้น'));

  // --- 3 · the frame. Height in the sidebar follows from this.
  fields.appendChild(section('อัตราส่วนกรอบ', [ratioRow(slot)], 'NTAPI สูงตามกรอบที่สูงที่สุดในชุดนี้'));

  // --- 4 · wording, one line per language.
  const labelTh = textInput(slot.text.th.label, (v) => {
    slot.text.th.label = R.clampText(v, LIMITS.maxLabel);
    paintPreviewText();
  }, { field: 'label-th' });
  const titleTh = textInput(slot.text.th.title, (v) => {
    slot.text.th.title = R.clampText(v, LIMITS.maxTitle);
    paintPreviewText();
    cardName();
  }, { field: 'title-th' });
  const labelEn = textInput(slot.text.en.label, (v) => {
    slot.text.en.label = R.clampText(v, LIMITS.maxLabel);
  }, { field: 'label-en' });
  const titleEn = textInput(slot.text.en.title, (v) => {
    slot.text.en.title = R.clampText(v, LIMITS.maxTitle);
  }, { field: 'title-en' });
  fields.appendChild(
    section('ข้อความ', [
      el('div', { class: 'field-row' }, [
        el('div', { class: 'field' }, [el('div', { class: 'field-label', text: 'ป้าย TH' }), labelTh]),
        el('div', { class: 'field' }, [el('div', { class: 'field-label', text: 'ป้าย EN' }), labelEn]),
      ]),
      el('div', { class: 'field' }, [el('div', { class: 'field-label', text: 'ชื่อ TH' }), titleTh]),
      el('div', { class: 'field' }, [el('div', { class: 'field-label', text: 'ชื่อ EN' }), titleEn]),
    ]),
    `ชื่อ TH ไม่เกิน ${LIMITS.maxTitle} ตัวอักษร · เว้นว่างชื่อ EN ได้`,
  );

  // --- 5 · the plumbing: the id names the uploaded file and counts the clicks.
  const idInput = textInput(slot.id, (v) => {
    slot.id = R.slug(v) || slot.id;
    paintCard(slot);
  }, { field: 'id' });
  const altInput = textInput(slot.alt, (v) => {
    slot.alt = R.clampText(v, LIMITS.maxAlt);
  }, { field: 'alt', placeholder: 'อธิบายภาพสั้น ๆ' });
  const enabled = el('button', {
    type: 'button',
    class: 'switch',
    role: 'switch',
    'aria-checked': slot.enabled ? 'true' : 'false',
  }, [el('span', { class: 'switch-knob' })]);
  enabled.addEventListener('click', () => {
    slot.enabled = !slot.enabled;
    enabled.setAttribute('aria-checked', slot.enabled ? 'true' : 'false');
    paintCard(slot);
    renderBoardSub();
  });
  fields.appendChild(
    section('ขั้นสูง', [
      el('div', { class: 'field' }, [el('div', { class: 'field-label', text: 'id (ใช้ตั้งชื่อไฟล์)' }), idInput]),
      el('div', { class: 'field' }, [el('div', { class: 'field-label', text: 'คำอธิบายภาพ (alt)' }), altInput]),
      el('div', { class: 'switch-row' }, [
        el('div', { class: 'switch-copy' }, [
          el('span', { class: 'switch-title', text: 'ใช้โฆษณานี้' }),
          el('span', { class: 'switch-hint', text: 'ปิดไว้เพื่อเก็บการ์ดไว้แต่ไม่เผยแพร่' }),
        ]),
        enabled,
      ]),
    ]),
  );
}

/** The board summary counts `enabled`, so the toggle has to refresh it. */
function renderBoardSub() {
  const usable = usableSlots().length;
  $('boardSub').textContent = state.slots.length
    ? `ใช้ได้ ${usable} / ${state.slots.length} ใบ · หมุนเวียนทุก ${state.rotateSeconds} วินาที`
    : 'ยังไม่มีโฆษณา — กด “เพิ่มโฆษณา” เพื่อเริ่ม';
}

function openEditor(id) {
  const slot = state.slots.find((s) => s.id === id);
  if (!slot) return;
  state.openId = id;
  $('drawer').hidden = false;
  $('editorTitle').textContent = slot.text.th.title || 'โฆษณาใหม่';
  buildFields(slot);
  paintPreview();
  for (const card of document.querySelectorAll('.card')) {
    card.classList.toggle('is-open', card.dataset.id === id);
  }
}

function closeEditor() {
  state.openId = '';
  // Hiding the drawer is not stopping it: a media element keeps playing while its
  // ancestor is `display:none`, and the sound chip leaves with the panel — so
  // closing a card left audio nobody could turn off. Take the clip down with it.
  releaseVideos($('frameMedia'));
  $('frameMedia').replaceChildren();
  $('drawer').hidden = true;
  for (const card of document.querySelectorAll('.card')) card.classList.remove('is-open');
}

/* --------------------------------- actions -------------------------------- */

async function loadConfig() {
  state.cfg = await api.cfgGet();
  $('cfgOwner').value = state.cfg.owner;
  $('cfgRepo').value = state.cfg.repo;
  $('cfgBranch').value = state.cfg.branch;
  $('cfgToken').value = '';
  $('tokenHint').textContent = state.cfg.hasToken
    ? `บันทึก token ไว้แล้ว (${state.cfg.tokenHint}) — เว้นว่างถ้าไม่เปลี่ยน`
    : 'ยังไม่มี token';
  $('repoSummary').textContent = `${state.cfg.owner}/${state.cfg.repo} · ${state.cfg.branch}`;
}

async function saveConfig() {
  const masked = await api.cfgSave({
    owner: $('cfgOwner').value,
    repo: $('cfgRepo').value,
    branch: $('cfgBranch').value,
    token: $('cfgToken').value,
  });
  state.cfg = masked;
  $('cfgToken').value = '';
  $('tokenHint').textContent = masked.hasToken
    ? `บันทึก token ไว้แล้ว (${masked.tokenHint}) — เว้นว่างถ้าไม่เปลี่ยน`
    : 'ยังไม่มี token';
  $('repoSummary').textContent = `${masked.owner}/${masked.repo} · ${masked.branch}`;
  setStatus('ok', 'บันทึกการตั้งค่าแล้ว');
}

async function checkRepo() {
  const out = $('repoCheck');
  out.textContent = 'กำลังตรวจ...';
  out.className = 'check-result';
  const res = await api.repoCheck();
  if (!res.ok) {
    out.textContent = res.error;
    out.className = 'check-result bad';
    return;
  }
  if (!res.canPush) {
    out.textContent = `เข้าถึง ${res.fullName} ได้ แต่มอบสิทธิ์เขียนไม่ได้ (token ต้องมี Contents: Read and write)`;
    out.className = 'check-result bad';
    return;
  }
  out.textContent = res.private
    ? `⚠ ${res.fullName} เป็น private — NTAPI จะดึงไม่ได้ ต้องเปลี่ยนเป็น public`
    : `✓ ${res.fullName} พร้อมเขียน`;
  out.className = res.private ? 'check-result bad' : 'check-result ok';
}

async function loadFeed() {
  setStatus('busy', 'กำลังโหลดจาก repo...');
  const res = await api.feedLoad();
  if (!res.ok) {
    setStatus('bad', 'โหลดไม่ได้', res.error);
    return;
  }
  if (!res.feed) {
    setStatus('', 'repo ยังว่าง', res.note || '');
    return;
  }
  state.rotateSeconds = res.feed.rotateSeconds;
  $('rotateSeconds').value = state.rotateSeconds;
  state.slots = res.feed.slots.map(slotFromFeed);
  if (!state.slots.some((s) => s.id === state.openId)) closeEditor();
  renderBoard();
  if (openSlot()) {
    $('editorTitle').textContent = openSlot().text.th.title || 'โฆษณา';
    buildFields(openSlot());
    paintPreview();
  }
  $('repoSummary').textContent = `${state.cfg.owner}/${state.cfg.repo} · ${state.cfg.branch} · ${state.slots.length} ใบ`;
  setStatus('ok', `โหลดแล้ว ${state.slots.length} ใบ`, res.feed.updated ? `แก้ล่าสุด ${res.feed.updated}` : '');
}

function publishPayload() {
  const usable = usableSlots();
  if (!usable.length) throw new Error('ยังไม่มีโฆษณาที่เปิดใช้');
  for (const slot of usable) {
    if (!slot.id) throw new Error('ทุกใบต้องมี id');
    if (!/^https:\/\/[^\s]+\.[^\s]+/i.test(slot.url)) throw new Error(`ลิงก์ของ "${slot.id}" ต้องเป็น https`);
    if (!slot.text.th.title) throw new Error(`"${slot.id}" ยังไม่มีชื่อ TH`);
    const m = slot.media;
    if (!m.file && !m.base64 && !m.sourcePath && !m.sourceBase64) {
      throw new Error(`"${slot.id}" ยังไม่มีรูป/วิดีโอ`);
    }
  }
  return {
    rotateSeconds: state.rotateSeconds,
    slots: usable.map((slot) => ({
      id: slot.id,
      enabled: true,
      url: slot.url,
      media: {
        type: slot.media.type,
        // The frame the operator picked. Without it the feed says nothing about
        // the shape and every reader falls back to 2:1.
        ratio: slot.media.ratio,
        alt: slot.alt || slot.text.th.title,
        ...(slot.media.base64 ? { base64: slot.media.base64 } : {}),
        ...(slot.media.sourcePath ? { sourcePath: slot.media.sourcePath } : {}),
        ...(slot.media.sourceBase64 ? { sourceBase64: slot.media.sourceBase64, sourceName: slot.media.sourceName } : {}),
        ...(slot.media.posterBase64 ? { posterBase64: slot.media.posterBase64 } : {}),
        ...(slot.media.file ? { file: slot.media.file } : {}),
      },
      text: slot.text,
    })),
  };
}

async function publish() {
  if (state.busy) return;
  let payload;
  try {
    payload = publishPayload();
  } catch (err) {
    setStatus('bad', 'ยังเผยแพร่ไม่ได้', err.message);
    return;
  }

  state.busy = true;
  $('btnPublish').disabled = true;
  setStatus('busy', 'กำลังอัปโหลด...', 'อย่าปิดหน้าต่างนี้');
  try {
    const res = await api.publish(payload);
    if (!res.ok) {
      setStatus('bad', 'อัปโหลดไม่สำเร็จ', `${res.error}${res.done && res.done.length ? ` (สำเร็จ ${res.done.length} ไฟล์)` : ''}`);
      return;
    }
    setStatus('ok', `เผยแพร่แล้ว ${res.slots} ใบ`, `NTAPI จะเห็นภายในไม่กี่นาที · ${res.done.join(', ')}`);
    // The published media is now the source of truth; reload so the previews
    // point at the CDN copy instead of the bytes in this window's memory.
    await loadFeed();
  } catch (err) {
    setStatus('bad', 'อัปโหลดไม่สำเร็จ', err instanceof Error ? err.message : String(err));
  } finally {
    state.busy = false;
    $('btnPublish').disabled = false;
  }
}

/* ---------------------------------- wiring -------------------------------- */

$('winMin').addEventListener('click', () => api.winMinimize());
$('winMax').addEventListener('click', () => api.winToggleMaximize());
$('winClose').addEventListener('click', () => api.winClose());

$('tokenReveal').addEventListener('click', () => {
  const input = $('cfgToken');
  input.type = input.type === 'password' ? 'text' : 'password';
});

$('tokenLink').addEventListener('click', () => {
  api.openExternal('https://github.com/settings/personal-access-tokens/new');
});

$('btnSaveCfg').addEventListener('click', saveConfig);
$('btnCheckRepo').addEventListener('click', checkRepo);
$('btnLoad').addEventListener('click', loadFeed);
$('btnPublish').addEventListener('click', publish);

$('muteSwitch').addEventListener('click', () => {
  state.mutePreview = !state.mutePreview;
  applyMuteNow();
});

$('rotateSeconds').addEventListener('change', applyRotate);
$('rotateMinus').addEventListener('click', () => {
  $('rotateSeconds').value = Number($('rotateSeconds').value) - 1;
  applyRotate();
});
$('rotatePlus').addEventListener('click', () => {
  $('rotateSeconds').value = Number($('rotateSeconds').value) + 1;
  applyRotate();
});
function applyRotate() {
  state.rotateSeconds = R.clampRotate($('rotateSeconds').value);
  $('rotateSeconds').value = state.rotateSeconds;
  renderBoardSub();
}

function addSlot() {
  if (state.slots.length >= LIMITS.maxSlots) {
    setStatus('bad', `เพิ่มได้สูงสุด ${LIMITS.maxSlots} ใบ`);
    return;
  }
  const slot = newSlot();
  state.slots.push(slot);
  renderBoard();
  openEditor(slot.id);
  setStatus('', 'เพิ่มโฆษณาใหม่แล้ว', 'ใส่ไฟล์กับลิงก์ก่อนกดเผยแพร่');
}

$('btnAddSlot').addEventListener('click', addSlot);
$('btnAddFirst').addEventListener('click', addSlot);
$('drawerClose').addEventListener('click', closeEditor);
$('drawerScrim').addEventListener('click', closeEditor);
$('btnDone').addEventListener('click', closeEditor);
$('btnDelete').addEventListener('click', () => {
  const slot = openSlot();
  if (!slot) return;
  state.slots = state.slots.filter((s) => s !== slot);
  closeEditor();
  renderBoard();
  setStatus('', 'ลบโฆษณาแล้ว');
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  // The size dialog sits above the drawer, so it closes first.
  if (closeSizeDialog) {
    closeSizeDialog();
    return;
  }
  if (!$('drawer').hidden) closeEditor();
});

/* The preview frame is the drop target, and clicking it opens the file picker. */
$('frameMedia').addEventListener('click', () => {
  const slot = openSlot();
  if (slot) pickFile(slot);
});
$('frameMedia').addEventListener('dragover', (e) => {
  e.preventDefault();
  $('frameMedia').classList.add('is-over');
});
$('frameMedia').addEventListener('dragleave', () => $('frameMedia').classList.remove('is-over'));
$('frameMedia').addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  $('frameMedia').classList.remove('is-over');
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  const slot = openSlot();
  if (file && slot) takeFile(slot, file);
});

$('previewSound').addEventListener('click', () => {
  state.mutePreview = !state.mutePreview;
  applyMuteNow();
});

/**
 * Dropping anywhere on the window is the fastest path for an operator holding a
 * poster, so the window itself accepts a drop while a card is open.
 */
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!file) return;
  e.preventDefault();
  const slot = openSlot();
  if (!slot) {
    setStatus('bad', 'เปิดการ์ดก่อนแล้วลากไฟล์มาวาง');
    return;
  }
  takeFile(slot, file);
});

async function boot() {
  await loadConfig();
  renderBoard();
  if (state.cfg.hasToken) await loadFeed();
  else setStatus('', 'ยังไม่ได้ตั้งค่า token', 'วาง token แล้วกด “บันทึก” เพื่อเริ่ม');
}

boot();

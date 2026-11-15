'use strict';

/**
 * The window half of NTAPI ADS.
 *
 * Two rules shape this file:
 *
 * 1. Nothing is validated here that could be validated in `media.js` — the caps
 *    and the crop maths come across the bridge. This file only decides *when*
 *    to ask.
 * 2. A slot is never re-rendered while the operator is typing in it. Every text
 *    field writes straight into the slot object and repaints only the preview,
 *    because rebuilding the list on each keystroke steals the caret mid-word.
 */

const api = window.ads;
const R = window.adsRules;
const LIMITS = R.limits;

const $ = (id) => document.getElementById(id);

const state = {
  cfg: null,
  rotateSeconds: LIMITS.defaultRotate,
  slots: [],
  selectedId: '',
  busy: false,
};

/* -------------------------------- small utils ------------------------------ */

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
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

function setStatus(kind, text, detail = '') {
  const bar = document.querySelector('.statusbar');
  bar.classList.remove('busy', 'ok', 'bad');
  if (kind) bar.classList.add(kind);
  $('status').textContent = text;
  $('statusDetail').textContent = detail;
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

/** The month is in the default id because NTAPI counts clicks per id. */
function defaultId(offset = 0) {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const base = `sponsor-${stamp}`;
  if (!state.slots.some((s) => s.id === base)) return base;
  return `${base}-${state.slots.length + offset + 1}`;
}

function newSlot() {
  return {
    id: defaultId(),
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
  // `file` is a repo-relative path, so the preview renders from the CDN — the
  // same bytes an installed NTAPI would fetch.
  slot.media.previewUrl = `${R.readBase[0]}${raw.media.file}`;
  slot.media.note = 'เผยแพร่อยู่ใน repo แล้ว';
  slot.media.noteKind = 'ok';
  return slot;
}

function selectedSlot() {
  return state.slots.find((s) => s.id === state.selectedId) || null;
}

function previewableSlots() {
  return state.slots.filter((s) => s.enabled && (s.media.previewUrl || s.media.base64 || s.media.sourceBase64 || s.media.file));
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
    // WebP at 0.62 on a 1024x512 banner is still sharp; below ~1.2MB is the
    // point where a sponsor banner stops being fair to the user's bandwidth.
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
  if (encoded.bytes > LIMITS.maxPosterBytes) {
    throw new Error(reasonText('poster-too-big'));
  }
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

async function takeFile(slot, file) {
  setStatus('busy', 'กำลังอ่านไฟล์…', file.name);
  try {
    const base64 = await fileToBase64(file);
    // A dropped file has no path we may trust, so the bytes travel with the slot
    // instead of being re-read by main later.
    await ingest(slot, { name: file.name, base64 });
    render();
    setStatus('ok', 'พร้อมเผยแพร่', slot.media.note);
  } catch (err) {
    slot.media.note = err instanceof Error ? err.message : String(err);
    slot.media.noteKind = 'bad';
    render();
    setStatus('bad', 'ไฟล์นี้ใช้ไม่ได้', slot.media.note);
  }
}

async function takeUrl(slot, url) {
  setStatus('busy', 'กำลังดาวน์โหลด…', url);
  try {
    const res = await api.fetchMedia(url);
    if (!res || !res.ok) throw new Error((res && res.error) || 'ดาวน์โหลดไม่สำเร็จ');
    await ingest(slot, { name: res.name, base64: res.base64 });
    render();
    setStatus('ok', 'พร้อมเผยแพร่', slot.media.note);
  } catch (err) {
    slot.media.note = err instanceof Error ? err.message : String(err);
    slot.media.noteKind = 'bad';
    render();
    setStatus('bad', 'ลิงก์นี้ใช้ไม่ได้', slot.media.note);
  }
}

/* --------------------------------- painting ------------------------------- */

function mediaNode(slot, opts = {}) {
  const media = slot.media || {};
  if (!media.previewUrl) {
    return el('div', { class: 'drop-empty', text: 'ลากรูป/วิดีโอมาวาง\nหรือคลิกเพื่อเลือกไฟล์' });
  }
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

function field(labelText, input) {
  return el('div', { class: 'field' }, [el('label', { text: labelText }), input]);
}

function textInput(value, onInput, placeholder = '') {
  const input = el('input', { type: 'text', value: value || '', spellcheck: 'false', placeholder });
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

/**
 * The frame shapes, with the exact pixels that will be uploaded. Showing the
 * size next to the name is the whole point: an operator picks 4:5 knowing it
 * will be a tall band in the sidebar, not a wide one.
 */
function ratioSelect(value, onChange) {
  const current = R.ratioOf(value);
  const select = el('select', {});
  for (const name of R.ratios) {
    const size = R.mediaSize(name);
    const option = el('option', { value: name, text: `${name} — ${size.w}×${size.h}` });
    if (name === current) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

/**
 * Switching the frame re-crops from the bytes the operator gave us, never from
 * the previous crop: cropping a crop would shave the edges off every switch.
 */
async function applyRatio(slot, ratio) {
  slot.media.ratio = R.ratioOf(ratio);
  render();
  if (!slot.media.previewUrl) return;
  if (!slot.media.sourceBase64) {
    slot.media.note = 'ต้องเลือกไฟล์ใหม่เพื่อครอปอัตราส่วนนี้';
    slot.media.noteKind = 'bad';
    render();
    return;
  }
  setStatus('busy', 'กำลังครอปใหม่…', slot.media.ratio);
  try {
    if (slot.media.type === 'video') {
      await ingestVideo(slot, slot.media.sourceName, slot.media.sourceBase64, slot.media.sourcePath);
    } else {
      await ingestImage(slot, slot.media.sourceName, slot.media.sourceBase64);
    }
    render();
    setStatus('ok', 'ครอปใหม่แล้ว', slot.media.note);
  } catch (err) {
    slot.media.note = err instanceof Error ? err.message : String(err);
    slot.media.noteKind = 'bad';
    render();
    setStatus('bad', 'ครอปใหม่ไม่สำเร็จ', slot.media.note);
  }
}

function renderSlot(slot, index) {
  const card = el('div', { class: 'slot', 'data-id': slot.id });

  // ---- head
  const titleLabel = el('span', { class: 'slot-title', text: slot.text.th.title || '(ยังไม่มีชื่อสปอนเซอร์)' });
  const enabled = el('input', { type: 'checkbox', ...(slot.enabled ? { checked: true } : {}) });
  enabled.addEventListener('change', () => {
    slot.enabled = enabled.checked;
    render();
  });
  const remove = el('button', { type: 'button', class: 'btn btn-small btn-danger', text: 'ลบ' });
  remove.addEventListener('click', () => {
    state.slots = state.slots.filter((s) => s !== slot);
    if (state.selectedId === slot.id && state.slots.length) state.selectedId = state.slots[0].id;
    render();
  });
  card.appendChild(
    el('div', { class: 'slot-head' }, [
      el('span', { class: 'slot-num', text: `#${index + 1}` }),
      titleLabel,
      el('span', { class: 'spacer' }),
      el('label', { class: 'switch' }, [enabled, el('span', { text: 'ใช้สล็อตนี้' })]),
      remove,
    ]),
  );

  // ---- media
  const drop = el('div', { class: 'drop', tabindex: '0', role: 'button' }, [mediaNode(slot)]);
  // The drop target mirrors the chosen frame, so the crop is never a surprise.
  const frameSize = R.frameSize(slot.media.ratio);
  drop.style.aspectRatio = `${frameSize.w} / ${frameSize.h}`;
  drop.style.width = '214px';
  if (slot.media.previewUrl) {
    drop.appendChild(el('span', { class: 'badge', text: slot.media.type === 'video' ? 'วิดีโอ' : 'รูป' }));
  }
  const pick = async () => {
    setStatus('busy', 'กำลังเปิดไฟล์…');
    const res = await api.pickMedia();
    if (!res || !res.ok) {
      setStatus(res && res.canceled ? '' : 'bad', res && res.canceled ? 'พร้อม' : 'เลือกไฟล์ไม่สำเร็จ', res && res.error);
      return;
    }
    setStatus('busy', 'กำลังประมวลผล…', res.name);
    try {
      await ingest(slot, { name: res.name, base64: res.base64, path: res.path });
      render();
      setStatus('ok', 'พร้อมเผยแพร่', slot.media.note);
    } catch (err) {
      slot.media.note = err instanceof Error ? err.message : String(err);
      slot.media.noteKind = 'bad';
      render();
      setStatus('bad', 'ไฟล์นี้ใช้ไม่ได้', slot.media.note);
    }
  };
  drop.addEventListener('click', pick);
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick();
    }
  });
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) takeFile(slot, file);
  });

  const linkRow = el('div', { class: 'media-actions' });
  const linkInput = textInput('', () => {}, 'https://…/poster.webp (ถ้าสปอนเซอร์ส่งมาเป็นลิงก์)');
  linkInput.className = 'link-input';
  linkInput.style.flex = '1 1 220px';
  linkInput.style.minWidth = '0';
  const linkBtn = el('button', { type: 'button', class: 'btn btn-small', text: 'ดึงจากลิงก์' });
  linkBtn.addEventListener('click', () => {
    const value = linkInput.value.trim();
    if (!value) return setStatus('bad', 'ยังไม่ได้วางลิงก์');
    if (!R.mediaUrlAllowed(value)) return setStatus('bad', 'ลิงก์ต้องเป็น https และเป็นไฟล์รูป/วิดีโอ');
    takeUrl(slot, value);
  });
  linkRow.append(linkInput, linkBtn);

  const note = el('div', {
    class: `media-note ${slot.media.noteKind === 'bad' ? 'bad' : slot.media.noteKind === 'ok' ? 'ok' : ''}`,
    text: slot.media.note || '',
  });

  const fields = el('div', { class: 'slot-fields' }, [
    el('div', { class: 'field-row' }, [
      field('อัตราส่วนกรอบ (กล่องใน NTAPI จะสูง-เตี้ยตามนี้)', ratioSelect(slot.media.ratio, (v) => applyRatio(slot, v))),
      field(
        'id (ใช้ตั้งชื่อไฟล์และนับคลิก)',
        textInput(slot.id, (v) => {
          slot.id = R.slug(v);
          render();
        }),
      ),
    ]),
    el('div', { class: 'field-row' }, [
      field(
        'ลิงก์ปลายทาง (เปิดในเบราว์เซอร์จริง)',
        textInput(slot.url, (v) => {
          slot.url = v.trim();
        }, 'https://…'),
      ),
    ]),
    el('div', { class: 'field-row' }, [
      field(
        'ข้อความ TH (ผู้สนับสนุนเห็น)',
        textInput(slot.text.th.title, (v) => {
          slot.text.th.title = R.clampText(v, LIMITS.maxTitle);
          titleLabel.textContent = slot.text.th.title || '(ยังไม่มีชื่อสปอนเซอร์)';
          paintPreview();
        }),
      ),
      field(
        'ข้อความ EN',
        textInput(slot.text.en.title, (v) => {
          slot.text.en.title = R.clampText(v, LIMITS.maxTitle);
          paintPreview();
        }),
      ),
    ]),
    linkRow,
    note,
  ]);

  card.appendChild(el('div', { class: 'slot-media' }, [drop, fields]));
  card.addEventListener('click', () => {
    if (state.selectedId !== slot.id) {
      state.selectedId = slot.id;
      paintPreview();
    }
  });
  return card;
}

function paintPreview() {
  const slot = selectedSlot() || previewableSlots()[0] || null;
  const label = slot ? slot.text.th.label || 'ผู้สนับสนุน' : 'ผู้สนับสนุน';
  const title = slot ? slot.text.th.title || '(ยังไม่มีชื่อสปอนเซอร์)' : 'ชื่อสปอนเซอร์';
  $('frameLabel').textContent = label;
  $('frameTitle').textContent = title;

  const host = $('frameMedia');
  host.replaceChildren();
  const frameSize = R.frameSize(slot && slot.media ? slot.media.ratio : R.defaultRatio);
  host.style.aspectRatio = `${frameSize.w} / ${frameSize.h}`;
  const sizeNote = $('frameSize');
  if (sizeNote) {
    const ratio = slot && slot.media ? R.ratioOf(slot.media.ratio) : R.defaultRatio;
    const full = R.mediaSize(ratio);
    sizeNote.textContent = `${ratio} · ${frameSize.w} × ${frameSize.h} px (ไฟล์จริง ${full.w} × ${full.h})`;
  }
  if (slot && slot.media.previewUrl) host.appendChild(mediaNode(slot));
  else host.appendChild(el('div', { class: 'none', text: 'ยังไม่มีรูป/วิดีโอ' }));

  const notes = $('previewNotes');
  notes.replaceChildren();
  const usable = previewableSlots().length;
  notes.appendChild(
    el('div', {
      text: `ใช้ได้ ${usable} / ${state.slots.length} สล็อต · หมุนเวียนทุก ${state.rotateSeconds} วินาที`,
    }),
  );
  if (slot && slot.media.seconds) {
    notes.appendChild(el('div', { text: `วิดีโอ ${slot.media.seconds.toFixed(1)} วิ (เล่นวน, หยุดเมื่อหน้าต่างไม่ focus)` }));
  }
  if (slot && slot.media.note) {
    notes.appendChild(
      el('div', {
        class: slot.media.noteKind === 'bad' ? 'note-bad' : 'note-ok',
        text: slot.media.note,
      }),
    );
  }
}

function render() {
  const host = $('slots');
  host.replaceChildren();
  if (!state.slots.length) {
    host.appendChild(
      el('div', { class: 'empty-slots', text: 'ยังไม่มีสล็อต — กด "+ เพิ่มสล็อต" เพื่อเริ่ม' }),
    );
  } else {
    state.slots.forEach((slot, index) => host.appendChild(renderSlot(slot, index)));
  }
  if (!state.slots.some((s) => s.id === state.selectedId)) {
    state.selectedId = state.slots.length ? state.slots[0].id : '';
  }
  paintPreview();
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
  $('repoName').textContent = `${state.cfg.owner}/${state.cfg.repo}`;
  $('repoBranch').textContent = state.cfg.branch;
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
  $('repoName').textContent = `${masked.owner}/${masked.repo}`;
  $('repoBranch').textContent = masked.branch;
  setStatus('ok', 'บันทึกการตั้งค่าแล้ว');
}

async function checkRepo() {
  $('repoCheck').textContent = 'กำลังตรวจ…';
  $('repoCheck').className = 'check-result';
  const res = await api.repoCheck();
  if (!res.ok) {
    $('repoCheck').textContent = res.error;
    $('repoCheck').className = 'check-result bad';
    return;
  }
  if (!res.canPush) {
    $('repoCheck').textContent = `เข้าถึง ${res.fullName} ได้ แต่มอบสิทธิ์เขียนไม่ได้ (token ต้องมี Contents: Read and write)`;
    $('repoCheck').className = 'check-result bad';
    return;
  }
  $('repoCheck').textContent = res.private
    ? `⚠ ${res.fullName} เป็น private — NTAPI จะดึงไม่ได้ ต้องเปลี่ยนเป็น public`
    : `✓ ${res.fullName} พร้อมเขียน`;
  $('repoCheck').className = res.private ? 'check-result bad' : 'check-result ok';
}

async function loadFeed() {
  setStatus('busy', 'กำลังโหลดจาก repo…');
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
  state.selectedId = state.slots.length ? state.slots[0].id : '';
  render();
  setStatus('ok', `โหลดแล้ว ${state.slots.length} สล็อต`, res.feed.updated ? `แก้ล่าสุด ${res.feed.updated}` : '');
}

function publishPayload() {
  const usable = state.slots.filter((s) => s.enabled);
  if (!usable.length) throw new Error('ยังไม่มีสล็อตที่เปิดใช้');
  for (const slot of usable) {
    if (!slot.id) throw new Error('ทุกสล็อตต้องมี id');
    if (!/^https:\/\/[^\s]+\.[^\s]+/i.test(slot.url)) throw new Error(`ลิงก์ของ "${slot.id}" ต้องเป็น https`);
    if (!slot.text.th.title) throw new Error(`สล็อต "${slot.id}" ยังไม่มีข้อความ`);
    const m = slot.media;
    if (!m.file && !m.base64 && !m.sourcePath && !m.sourceBase64) {
      throw new Error(`สล็อต "${slot.id}" ยังไม่มีรูป/วิดีโอ`);
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
        // the shape and every reader falls back to 2:1, so a 1:1 creative was
        // published inside a 2:1 band no matter what the dropdown showed.
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
  setStatus('busy', 'กำลังอัปโหลด…', 'อย่าปิดหน้าต่างนี้');
  try {
    const res = await api.publish(payload);
    if (!res.ok) {
      setStatus('bad', 'อัปโหลดไม่สำเร็จ', `${res.error}${res.done && res.done.length ? ` (สำเร็จ ${res.done.length} ไฟล์)` : ''}`);
      return;
    }
    setStatus('ok', `เผยแพร่แล้ว ${res.slots} สล็อต`, `NTAPI จะเห็นภายในไม่กี่นาที (CDN cache) · ${res.done.join(', ')}`);
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

$('btnSettings').addEventListener('click', () => {
  const panel = $('settings');
  panel.hidden = !panel.hidden;
});

$('btnSaveCfg').addEventListener('click', saveConfig);
$('btnCheckRepo').addEventListener('click', checkRepo);
$('btnLoad').addEventListener('click', loadFeed);
$('btnPublish').addEventListener('click', publish);

$('btnAddSlot').addEventListener('click', () => {
  if (state.slots.length >= LIMITS.maxSlots) {
    setStatus('bad', `เพิ่มได้สูงสุด ${LIMITS.maxSlots} สล็อต`);
    return;
  }
  const slot = newSlot();
  state.slots.push(slot);
  state.selectedId = slot.id;
  render();
  setStatus('', 'เพิ่มสล็อตใหม่');
});

$('rotateSeconds').addEventListener('change', () => {
  state.rotateSeconds = R.clampRotate($('rotateSeconds').value);
  $('rotateSeconds').value = state.rotateSeconds;
  paintPreview();
});

/**
 * Dropping on the window anywhere is the fastest path for an operator holding a
 * poster, so the window itself accepts a drop when there is a selected slot.
 */
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!file) return;
  e.preventDefault();
  const slot = selectedSlot();
  if (!slot) {
    setStatus('bad', 'เพิ่มสล็อตก่อนแล้วลากไฟล์มาวาง');
    return;
  }
  takeFile(slot, file);
});

async function boot() {
  await loadConfig();
  render();
  if (state.cfg.hasToken) await loadFeed();
  else setStatus('', 'ยังไม่ได้ตั้งค่า token', 'กด "ตั้งค่า" เพื่อเริ่ม');
}

boot();
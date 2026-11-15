'use strict';

/**
 * The whole surface this window may use. Everything a slot needs crosses here,
 * so "what can the renderer do" is one readable list rather than a search
 * through main.js.
 *
 * The rules are bridged too, not re-implemented in the renderer. The size caps,
 * the cover-crop maths and the file naming all live in `feed.js`/`media.js` and
 * are tested there; copying them into the window would give the app a second
 * opinion about what a valid sponsor is, and the two would drift.
 */

const { contextBridge, ipcRenderer } = require('electron');
const feed = require('./feed');
const media = require('./media');

contextBridge.exposeInMainWorld('ads', {
  cfgGet: () => ipcRenderer.invoke('cfg:get'),
  cfgSave: (config) => ipcRenderer.invoke('cfg:save', config),
  repoCheck: () => ipcRenderer.invoke('repo:check'),
  feedLoad: () => ipcRenderer.invoke('feed:load'),
  pickMedia: () => ipcRenderer.invoke('media:pick'),
  fetchMedia: (url) => ipcRenderer.invoke('media:fetch', String(url || '')),
  publish: (payload) => ipcRenderer.invoke('publish', payload),
  openExternal: (url) => ipcRenderer.invoke('shell:open', String(url || '')),
});

contextBridge.exposeInMainWorld('adsRules', {
  frame: { w: feed.FRAME_W, h: feed.FRAME_H, mediaW: feed.MEDIA_W, mediaH: feed.MEDIA_H },
  ratios: feed.RATIO_ORDER,
  defaultRatio: feed.DEFAULT_RATIO,
  ratioOf: (value) => feed.ratioOf(value),
  frameSize: (ratio) => feed.frameSize(ratio),
  mediaSize: (ratio) => feed.mediaSize(ratio),
  limits: {
    maxImageBytes: feed.MAX_IMAGE_BYTES,
    maxVideoBytes: feed.MAX_VIDEO_BYTES,
    maxVideoSeconds: feed.MAX_VIDEO_SECONDS,
    maxSlots: feed.MAX_SLOTS,
    minRotate: feed.MIN_ROTATE,
    maxRotate: feed.MAX_ROTATE,
    defaultRotate: feed.DEFAULT_ROTATE,
    maxTitle: feed.MAX_TITLE,
    maxLabel: feed.MAX_LABEL,
    maxAlt: feed.MAX_ALT,
    maxPosterBytes: feed.MAX_POSTER_BYTES,
  },
  readBase: feed.READ_BASE,
  imageExt: feed.IMAGE_EXT,
  videoExt: feed.VIDEO_EXT,
  checkFile: (input) => media.checkFile(input),
  coverRect: (sw, sh, dw, dh) => media.coverRect(sw, sh, dw, dh),
  extOf: (value) => media.extOf(value),
  kindOfExt: (value) => media.kindOfExt(value),
  mediaUrlAllowed: (value) => media.mediaUrlAllowed(value),
  base64Bytes: (value) => media.base64Bytes(value),
  mimeFor: (value) => feed.mimeFor(value),
  slug: (value) => feed.slug(value),
  clampText: (value, max) => feed.cleanText(value, max),
  clampRotate: (value) => feed.clampRotate(value),
});
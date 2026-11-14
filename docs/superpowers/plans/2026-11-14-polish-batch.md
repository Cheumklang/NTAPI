# NTAPI Polish Batch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** ปิดช่องว่าง HIGH/MEDIUM/LOW จากรีวิว 2026-11-14 แบบแบ่งรอบ เพื่อไม่ให้ชน context limit และให้ session ถัดไปทำงานต่อได้ทันที

**Architecture:** Electron 38 main/preload/renderer ไม่มี bundler. งาน batch A เป็นงาน "ความทนทาน + a11y + microcopy" ทั้งหมด ไม่แตะพฤติกรรมการส่ง prompt หรือ provider. ตรรกะที่ทดสอบได้แยกเป็นโมดูล Node ล้วน (`src/*.js`) แล้วมี `scripts/selftest-*.js` รันแบบ offline.

**Tech Stack:** Electron 38, Node 20+ built-ins, ไม่เพิ่ม dependency ใหม่.

**Spec:** ไม่มี spec แยก — แหล่งอ้างอิงคือรีวิวในบทสนทนา 2026-11-14 + `docs/review-2026-11-13.md`

## Global Constraints

- ทำงานจาก `app/` เมื่อรันเทส; path อื่นระบุชัดเจน.
- ห้ามเพิ่ม npm dependency ใหม่.
- ห้ามแตะ `C:\Program Files\NTAPI\`.
- ห้าม commit / push / tag / เปลี่ยนเลขเวอร์ชันเอง.
- UI string ต้องมีทั้ง `en` และ `th` ใน `src/renderer/app.js`.
- ทุกงานที่แตะไฟล์รันได้ต้องผ่าน `node --check` และ selftest offline.
- หลังจบแต่ละรอบ: รายงานจำนวนไฟล์ที่ยัง uncommitted + ถามเรื่องอัปเวอร์ชัน.

## Findings map (15 ข้อ)

| # | ระดับ | เรื่อง | Batch |
|---|---|---|---|
| 1 | HIGH | pi SDK ไม่ถูก bundle → เครื่องใหม่เจอ "SDK not found" | B |
| 2 | HIGH | ไม่มี CI รันเทส | A1 |
| 3 | HIGH | ไม่มี error boundary / crash log | A2 |
| 4 | HIGH | installer ไม่ได้เซ็นชื่อ | ops (ต้องซื้อ cert) |
| 5 | MEDIUM | สเกลฟอนต์กระจัดกระจาย 15 ระดับ, 12.5px ×46 | C |
| 6 | MEDIUM | accent ใช้เป็นตัวอักษร คอนทราสต์ 3.75–4.35:1 | C |
| 7 | MEDIUM | `.usage-row` ไม่ wrap → ข้อความไทยล้น | A3 |
| 8 | MEDIUM | focus ring อ่อน/หาย 3 จุด | A4 |
| 9 | MEDIUM | settings overlay ไม่ trap focus / พื้นหลังไม่ inert | A5 |
| 10 | MEDIUM | ตัวเลขเปลี่ยนบ่อยไม่ใช้ `tabular-nums` | A6 |
| 11 | LOW | `accountCredits: 'Credits วันนี้'` ผสมภาษา | A7 |
| 12 | LOW | ตัวเลือกระดับความคิดมีคำอังกฤษปน | C (ถ้าตัดสินใจ) |
| 13 | LOW | first-run ยังเป็นกำแพง | C |
| 14 | LOW | ไม่มีปุ่ม "คัดลอกข้อมูลระบบ" | A2 |
| 15 | LOW | แอปโหลดสกิลโดยไม่มี provenance/scan | future |

---

# Batch A — ความทนทาน + a11y + microcopy (รอบนี้)

**Status:** เสร็จ 2026-11-14 (A1–A7)

### Task A1: CI รันเทสออฟไลน์

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `app/scripts/run-unit-tests.js`
- Modify: `app/package.json` (เพิ่ม script `test` เท่านั้น — ห้ามแตะ version)

**Interfaces:**
- Produces: `node scripts/run-unit-tests.js` → exit 0 เมื่อผ่านทั้งหมด, exit 1 พร้อมสรุปชื่อไฟล์ที่พัง
- รายการเทสออฟไลน์ (ไม่ใช้ network / key / electron window):
  `empty-answer`, `image-history`, `image-review`, `llm7`, `markdown`, `mcp-config`, `mcp-guard`, `model-filter`, `prompt-mode`, `provider-errors`, `provider-key`, `provider-plan`, `provider-timeout`, `session-paths`, `single-instance`, `sse-guard`, `system-info` (เพิ่มใน A2)

- [x] **Step 1:** เขียน `run-unit-tests.js` ให้ spawn `process.execPath` ทีละไฟล์, เก็บ stdout/stderr, พิมพ์ FAIL พร้อม tail 20 บรรทัด
- [x] **Step 2:** รัน `node scripts/run-unit-tests.js` → ต้อง PASS ทั้งหมดก่อนเพิ่ม CI
- [x] **Step 3:** เขียน `ci.yml`
  - `on: [push, pull_request]` (ยกเว้น tag — งาน release มี workflow แยก)
  - `runs-on: windows-latest`, setup-node 20, `npm ci` ใน `app`
  - `node --check` ไล่ `src/**/*.js` + `scripts/**/*.js`
  - `node scripts/run-unit-tests.js`
- [x] **Step 4:** ตรวจ YAML ด้วย `node -e` parse (ไม่มี dependency → ใช้ `js-yaml` จาก node_modules ของ electron-builder ถ้าไม่สะดวกให้ตรวจด้วยตา + `Get-Content`)

### Task A2: Error boundary + คัดลอกข้อมูลระบบ

**Files:**
- Create: `app/src/system-info.js`
- Create: `app/scripts/selftest-system-info.js`
- Modify: `app/src/main.js` (IPC + crash logging)
- Modify: `app/src/preload.js` (expose `systemInfo`)
- Modify: `app/src/renderer/index.html` (ปุ่มใน About)
- Modify: `app/src/renderer/app.js` (error handler + ปุ่ม + i18n)
- Modify: `app/src/renderer/styles.css` (ปุ่ม + crash banner)

**Interfaces:**
- `app/src/system-info.js`:
  - `formatSystemInfo(info: object) -> string` — plain text หลายบรรทัด
  - `describePlatform({ platform, release, arch }) -> string`
  - `safeErrorMessage(err) -> string`
- Main returns from `app:systemInfo`:
  `{ text, version, electron, chrome, node, platform, release, arch, locale, dataDir, packaged, provider }`
- Renderer: `window.freepi.systemInfo()` → object ข้างบน

- [x] **Step 1:** เขียน selftest ที่ fail ก่อน (TDD)
  - จัดรูปแบบมีบรรทัด `NTAPI v`, `Electron`, `Windows`, `Data folder:` ครบ
  - ไม่ crash เมื่อ field หาย (`formatSystemInfo({})` คืน string)
  - `safeErrorMessage(new Error('x'))` = `'x'`; รับ string/null ได้
- [x] **Step 2:** implement `system-info.js` จนเทสผ่าน
- [x] **Step 3:** main.js
  - `ipcMain.handle('app:systemInfo', ...)` ประกอบข้อมูลจริง + `formatSystemInfo`
  - `logCrash(kind, detail)` เขียน `<userData>/crash.log` แบบ append (กันข้อความยาวเกิน 8KB ต่อครั้ง), เรียกใน `process.on('uncaughtException')` และ `process.on('unhandledRejection')` — **ไม่ quit** เพื่อให้ผู้ใช้กดคัดลอกข้อมูลได้
  - `app.on('render-process-gone', ...)` → log เท่านั้น
- [x] **Step 4:** preload expose `systemInfo`
- [x] **Step 5:** renderer
  - `window.addEventListener('error')` + `'unhandledrejection'` → `showCrashNotice(err)`: แถบล่างจอ `role="alert"` มีข้อความ + ปุ่ม "คัดลอกข้อมูลระบบ" + ปุ่มปิด; หลีกเลี่ยงการซ้ำ (แสดงอันเดียว)
  - About: เพิ่มปุ่ม `#copySystemInfoBtn` ใต้ `#aboutVersion` → `navigator.clipboard.writeText(res.text)` + เปลี่ยนข้อความเป็น "คัดลอกแล้ว" 2 วินาที
  - i18n ใหม่: `copySystemInfo`, `systemInfoCopied`, `systemInfoFailed`, `crashNotice`
- [x] **Step 6:** `node --check` + รัน selftest

### Task A3: `.usage-row` wrap

- [x] เพิ่ม `flex-wrap: wrap; row-gap: 2px;` และให้ค่าด้านขวา `margin-left: auto` / `text-align: right`; `min-width: 0` ที่ label
- [x] ตรวจด้วยตาในหน้าตั้งค่า (ต้องขออนุญาตเปิดแอป)

### Task A4: Focus ring ให้ชัด

- [x] `.model-option:focus-visible` → `box-shadow: inset 0 0 0 2px var(--accent)` (ไม่ใช้ outline เพราะอยู่ในการ์ดมี overflow)
- [x] `.model-star:focus-visible` → `outline: 2px solid var(--accent); outline-offset: 1px`
- [x] `.s-rename:focus` → คงขอบ accent + เพิ่ม `box-shadow: 0 0 0 2px rgba(124,92,255,.45)`
- [x] ตรวจว่าไม่มี `outline: none` ที่ไม่มี visible focus แทน (สแกนซ้ำ)

### Task A5: Settings overlay — inert + focus trap

- [x] `openSettings()`: เก็บ `document.activeElement`, ตั้ง `inert` ให้ `#titlebar`, `#sidebar`, `#main`; `closeSettings()` คืนค่า + คืน focus
- [x] trap `Tab` / `Shift+Tab` ภายใน `#settingsOverlay` (รายการ focusable ที่ visible และไม่ disabled)
- [x] ตรวจว่า `Escape` ยังปิดได้ (มีอยู่แล้วที่ L4693)

### Task A6: `tabular-nums`

- [x] `.usage-row`, `.usage-row .mono`, `.context-meter` (หรือคลาสจริง), `#updatePct` → `font-variant-numeric: tabular-nums;`

### Task A7: Microcopy

- [x] `th.accountCredits: 'Credits วันนี้'` → `'โควตาวันนี้'`
- [x] สแกนคำผสมอื่นใน `STRINGS.th` (เช่น `Bonus credits`) แล้วปรับเฉพาะที่กำกวม

---

# Batch B — Bundle pi SDK (รอบถัดไป)

**Status:** เสร็จ 2026-11-14 (bundled-first, asarUnpack, selftest; installer +~16 MB)

**Files:** `app/package.json`, `app/src/main.js` (`resolveSdk`), `.github/workflows/release.yml`, `app/scripts/selftest-resolve-sdk.js`

- [x] เพิ่ม `@earendil-works/pi-coding-agent` เป็น dependency แล้วให้ `resolveSdk()` ลอง `require.resolve` จาก `app/node_modules` ก่อน env/npx cache
- [x] selftest: `resolveSdk` หา bundled path เจอเมื่อมี, ตกไป npx cache เมื่อไม่มี, error message บอกวิธิแก้
- [x] ตรวจขนาด installer ที่เพิ่มขึ้น + `asarUnpack` ถ้า SDK ต้องใช้ไฟล์จริง
- [x] **ต้องขออนุญาตผู้ใช้ก่อน** เพราะเพิ่ม dependency และกระทบ release size

# Batch C — Typography + first-run (ต้องตรวจด้วยตา)

**Status:** เสร็จบางส่วน 2026-11-14 — C2 (accent) เสร็จก่อนแล้วใน HEAD; C1 ยกพื้นฟอนต์ต่ำสุดเป็น 12px (35 จุด)
แต่ยังไม่ย่อสเกลเหลือ 4 ระดับ เพราะต้องตรวจด้วยตา; C3/C4 เสร็จ

- [x] ลดสเกลจาก 15 → 4 ระดับ (12 / 13.5 / 15 / 16) โดยเริ่มจาก 12.5px ×46
- [x] accent สำหรับตัวอักษร → `#9a80ff` (ผ่าน 4.5:1) หรือจำกัด accent เป็นพื้นหลัง/เส้นขอบ
- [x] first-run empty state: 3 ปุ่มเริ่มต้น + บรรทัดบอกว่าไฟล์จะไปอยู่ไหน
- [x] ตัวเลือกระดับความคิด: แสดง `ปิด/ต่ำ/กลาง/สูง` แทน `off/low/medium/high` เมื่อภาษาไทย
- [x] ต้องเปิดแอปเทียบภาพก่อน/หลัง (ขออนุญาตผู้ใช้)

# Ops — Code signing (HIGH 4)

**Status:** ข้าม (ผู้ใช้ตัดสินใจ 2026-11-14) — ต้องซื้อ cert + ยืนยันตัวตนเอง

- [ ] ผู้ใช้ต้องซื้อ certificate (EV/OV) แล้วใส่ `build.win.certificateFile` + รหัสผ่านใน CI secret
- [ ] ไม่สามารถทำแทนได้จาก session นี้

# Provider Capability Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้โมเดลที่กำลังคุยอยู่เรียก "ความสามารถ" ของผู้ให้บริการเจ้าอื่น (สร้างภาพ, แก้ภาพ, ทำเสียง, ถอดเสียง, วิเคราะห์วิดีโอ/เสียง) ด้วยคีย์ที่ผู้ใช้บันทึกไว้ ภายใต้การอนุญาตของผู้ใช้

**Architecture:** ตาราง `PROVIDER_APIS` ในโมดูลใหม่เป็นที่เดียวที่รู้ว่าเจ้าไหนทำอะไรได้; tool กลาง `provider_call` ใน extension ฝั่ง main อ่านตารางนี้ สร้างคำขอเอง (โมเดลไม่ส่ง path) ขออนุญาตผ่าน `askUser` ก่อนยิง แล้วบันทึกไฟล์ผลลัพธ์ลง `<cwd>/generated/` และคืน path ให้โมเดล

**Tech Stack:** Node 20 (fetch, FormData/Blob), Electron IPC, pi SDK extension

**Spec:** `docs/superpowers/specs/2026-11-26-provider-capability-access-design.md`

## Global Constraints

- ห้ามมี raw path จากโมเดล: URL มาจากตารางเท่านั้น
- ค่าเริ่มต้นสิทธิ์ = `off` ทุกเจ้า; ไม่มีคีย์หรือสิทธิ์ปิด → provider นั้นไม่ปรากฏใน tool เลย
- คีย์ไม่ถูกส่งเข้าโมเดล ไม่ถูก echo ในผลลัพธ์ ไม่ลง log
- ไฟล์ผลลัพธ์อยู่ใต้ `<cwd>/generated/` เท่านั้น (กัน path traversal)
- ทุกข้อความ UI ต้องมี i18n en+th และผ่าน `npm run check:sara`
- เทสต์ทุกตัวต้องรันแบบ offline และลงทะเบียนใน `app/scripts/run-unit-tests.js`

## Review Focus

- ผู้ใช้ตั้งสิทธิ์ `off` แต่โมเดลยังเรียก → ต้องถูกปฏิเสธพร้อมเหตุผล ไม่ใช่ยิงเน็ต
- ผู้ใช้กด "ยกเลิก" ในหน้ายืนยัน → ต้องไม่มีคำขอออกไปเลย และต้องไม่ค้างรอ
- เจ้าที่คืนข้อมูลผิดรูป (ไม่มี url/base64) → ต้องคืนข้อความ ошибка ไม่ throw จนเทิร์นตาย
- ไฟล์มีเดียใหญ่เกิน inline (Gemini 20 MB) → ต้องบอกเหตุผลแทนการพัง
- ชื่อไฟล์จาก prompt มี `/`, `..`, ตัวอักษรไทย → ต้องยังอยู่ใต้ `<cwd>/generated/`

---

### Task 1: `app/src/provider-apis.js` — ตาราง + ตัวเรียก

**Files:**
- Create: `app/src/provider-apis.js`
- Test: `app/scripts/selftest-provider-apis.js`

**Interfaces:**
- Produces:
  - `PROVIDER_APIS` — `{ [providerId]: { label, baseUrl, keyName, capabilities: { [capabilityId]: Cap } } }`, `Cap = { method, path, summary, cost, params, body(params, ctx), parse(data, ctx) }`
  - `listAccess({ access, keys }) -> [{ provider, label, capabilities: [{ id, summary, cost }] }]`
  - `callProvider({ provider, capability, params, apiKey, cwd, saveDir, fetchImpl, readFile }) -> { ok, text, files, error }`
  - `describeForTool(entries) -> string` — บรรทัดสรุปสำหรับ tool description

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน** — `selftest-provider-apis.js` ตรวจ: ทุก capability มี `method/path/summary/cost/params/body/parse`; `listAccess` ตัดเจ้าที่ `access[p] !== 'on'` หรือไม่มีคีย์; `callProvider` ไม่เรียก `fetchImpl` เมื่อไม่มีคีย์; path ที่สร้างขึ้นเริ่มด้วย `/` เสมอ; `describeForTool` มีชื่อเจ้าที่เปิด และไม่มีชื่อเจ้าที่ปิด; `saveFile` กัน `../` แล้วยังอยู่ใต้ `saveDir`
- [ ] **Step 2: รันให้ไม่ผ่าน** — `node scripts/selftest-provider-apis.js` → MODULE_NOT_FOUND
- [ ] **Step 3: เขียนโมดูล** — แถวเริ่มต้น: `grok` (`image.generate`, `image.edit`, `audio.speech`), `google` (`audio.speech`, `media.analyze`); `body` สร้าง JSON หรือ FormData; `parse` คืน `{ text, files }` โดยไฟล์เป็น `{ kind:'url'|'base64'|'bytes', ... }`; `callProvider` ดาวน์โหลด/ดีโค้ด/เขียนไฟล์เอง แล้วคืน `{ ok:true, text, files:[abs paths] }`
- [ ] **Step 4: รันให้ผ่าน** — `node scripts/selftest-provider-apis.js`
- [ ] **Step 5: ลงทะเบียนใน `run-unit-tests.js` และรัน `npm test`**

### Task 2: tool `provider_call` ใน bridge

**Files:**
- Modify: `app/src/freepi-bridge.js` (extension ใหม่ + รับ option `providerApiAccess`)
- Test: `app/scripts/selftest-provider-apis.js` (เพิ่มเช็คซอร์ส)

**Interfaces:**
- Consumes: `listAccess`, `callProvider`, `describeForTool` จาก Task 1
- Produces: extension `providerApiExtension` ที่ลงทะเบียนเฉพาะเมื่อ `access` มีเจ้าที่เปิดและมีคีย์; `askUser` ถูกเรียกก่อนยิงทุกครั้ง; ผลลัพธ์เป็นข้อความ + path ของไฟล์

- [ ] **Step 1: เขียนเทสต์ซอร์ส** — extension ถูกใส่ใน `extensionFactories` เมื่อมีสิทธิ์, `provider` enum มาจาก `listAccess`, มี `await askUser(` ก่อน `callProvider(`, ไม่มี `params.path` ที่ถูกใช้สร้าง URL
- [ ] **Step 2: เขียน extension** ตาม Interfaces ข้างบน
- [ ] **Step 3: `node --check` + `npm test` ผ่าน**

### Task 3: สิทธิ์ + IPC + หน้า Settings

**Files:**
- Modify: `app/src/main.js` (prefs `providerApiAccess`, IPC `providerApi:status|set`, ส่งเข้า `createFreePiSession`, ยุบ `summarizeTarget` มาใช้ `PROVIDER_APIS`), `app/src/preload.js`, `app/src/renderer/app.js` (แถวในหน้าการ์ดผู้ให้บริการ + i18n), `app/src/renderer/index.html`

**Interfaces:**
- Produces: `providerApi.status() -> { [provider]: 'on'|'off' }`, `providerApi.set({provider, on})`; `window.api.providerApiStatus()`, `window.api.providerApiSet({provider, on})`

- [ ] **Step 1: เพิ่มเทสต์ UI/i18n** ใน `selftest-provider-apis.js` (คีย์ i18n ครบ en+th, แถวสวิตช์มี `data-provider`)
- [ ] **Step 2: ต่อ IPC + preload**
- [ ] **Step 3: เพิ่มแถวสวิตช์ในหน้าการ์ด + i18n en/th**
- [ ] **Step 4: `npm test` + `npm run check:sara`**

### Task 4: ทดสอบจริงด้วยคีย์ที่มี

- [ ] **Step 1: รันแอปแยก Prosody ใน `/tmp` ด้วยคีย์จริงของ Grok/Google**
- [ ] **Step 2: เปิดสิทธิ์ Grok แล้วสั่งให้โมเดลสร้างภาพ; ตรวจว่า `generated/` มีไฟล์และภาพเปิดได้**
- [ ] **Step 3: ปิดสิทธิ์แล้วสั่งอีกครั้ง; ตรวจว่า tool ไม่ปรากฏ/ถูกปฏิเสธ**
- [ ] **Step 4: บันทึกผลลง `.AGENT/LOG.md` + provenance**

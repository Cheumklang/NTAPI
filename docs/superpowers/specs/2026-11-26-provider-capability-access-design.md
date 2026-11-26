# ให้โมเดลใช้ API ของผู้ให้บริการเจ้าอื่น (provider capabilities)

วันที่: 2026-11-26
สถานะ: รออนุมัติจากผู้ใช้

## ทำไม

วันนี้ NTAPI ใช้คีย์ที่ผู้ใช้บันทึกไว้ได้ทางเดียว: เอาไว้คุยแชทกับโมเดลเจ้านั้น ๆ
ถ้าผู้ใช้อยากให้ Grok สร้างภาพ หรือให้ Gemini ทำเสียง/อ่านวิดีโอ ต้องออกไปทำที่เว็บของเจ้านั้นเอง

ผู้ใช้ต้องการ: โมเดลที่กำลังคุยอยู่ "รู้" ว่ามีความสามารถของเจ้าอื่นที่ใช้ได้ และเรียกใช้ได้เลย
โดยไม่ต้องออกจากแอป — แต่ต้องอยู่ภายใต้การอนุญาตของผู้ใช้ เพราะแต่ละครั้งมีค่าใช้จ่าย

## ขอบเขต

**อยู่ในขอบเขต**
- tool กลางตัวเดียวที่ให้โมเดลเรียก "ความสามารถ" ของผู้ให้บริการที่ผู้ใช้บันทึกคีย์ไว้แล้ว
- ตารางความสามารถ (capability registry) ที่เพิ่มผู้ให้บริการ/ความสามารถใหม่ได้ด้วยการเพิ่มแถวเดียว
- การขออนุญาตผู้ใช้ + แสดงค่าใช้จ่ายโดยประมาณ ก่อนทุกครั้ง (ยกเว้นผู้ใช้ตั้งเป็น "ไม่ต้องถาม")
- ไฟล์ที่ได้ (ภาพ/เสียง/วิดีโอ) ถูกบันทึกในเครื่อง แล้วส่งกลับเป็น path ให้โมเดลใช้ tool เดิมต่อได้

**ไม่อยู่ในขอบเขต (v1)**
- ไม่มี path อิสระให้โมเดลยิง (ไม่มี `provider_request` แบบ raw)
- ไม่ใช้ tool นี้เพื่อ "คุยแชท" กับเจ้าอื่น (การคุยคือการเลือกโมเดล ซึ่งมีอยู่แล้ว)
- ไม่รองรับ streaming/Realtime (speech-to-speech, websocket) — ทำทีหลังถ้าจำเป็น
- ไม่รองรับ Veo/Imagen แบบ poll ยาว ๆ ใน v1 ถ้าค่าใช้จ่ายสูงเกินเกณฑ์ที่ตกลง (ดู "ค้าง")

## โครงสร้าง

### 1. `app/src/provider-apis.js` (ใหม่)

ตารางเดียวคือหัวใจ:

```js
PROVIDER_APIS = {
  grok: {
    baseUrl: GROK_BASE_URL,
    label: 'Grok',
    capabilities: {
      'image.generate': { path: '/images/generations', body: (p) => ({...}), parse: (r) => [...] },
      'image.edit':     { ... },
      'audio.speech':   { path: '/tts', ... },
      'audio.transcribe': { path: '/stt', ... },
    },
  },
  google: { ... 'image.generate', 'audio.speech', 'video.generate', 'media.analyze' },
  mistral: { ... },
}
```

- แต่ละ capability: `path`, `method`, `body(params)`, `parse(response)`, `params` (JSON schema ย่อ), `cost` (ข้อความ เช่น "~$0.07/ภาพ")
- `listCapabilities(availableProviders)` → รายการที่มีคีย์+เปิดสิทธิ์ ใช้ทั้งใน tool description และหน้า Settings
- `callProvider({ provider, capability, params, apiKey, fetchImpl, saveFile })` → `{ text, files: [path] }`
  - ไฟล์ไบนารี (ภาพ/เสียง/วิดีโอ) เขียนลง `<cwd>/generated/` ด้วยชื่อ `<เวลา>-<slug>.<ext>`
- เพิ่มผู้ให้บริการใหม่ = เพิ่มแถวใน `PROVIDER_APIS` + คีย์ใน `main.js` (แบบเดียวกับ Grok ที่ทำไปแล้ว)

ผลพลอยได้: `summarizeTarget()` ใน `main.js` มี `baseUrls`/`stores` ของตัวเองอยู่แล้ว (ขาด grok/mistral)
จะเปลี่ยนมาใช้ registry นี้แทน เพื่อไม่ให้มีสองที่ที่ต้องแก้พร้อมกัน

### 2. tool `provider_call`

Extension ใหม่ใน `app/src/freepi-bridge.js` (ชื่อ `providerApiExtension`) ลงทะเบียนเฉพาะเมื่อมีผู้ให้บริการที่เปิดสิทธิ์แล้วอย่างน้อยหนึ่งเจ้า

พารามิเตอร์:
- `provider` — enum จากรายการที่ใช้ได้ (มีคีย์ + เปิดสิทธิ์)
- `capability` — enum ของเจ้านั้น
- `params` — object ตาม schema ของ capability (`prompt`, `text`, `voice`, `language`, `image`, `duration`, …)

Description ของ tool ถูกสร้างจากตาราง: บอกว่า "ตอนนี้ใช้ได้: Grok — สร้างภาพ, แก้ภาพ, ทำเสียง, ถอดเสียง · Gemini — สร้างภาพ, ทำเสียง, สร้างวิดีโอ"
นี่คือส่วนที่ทำให้โมเดล "รู้ว่ามีอยู่" โดยไม่ต้องไปค้นเว็บ

ก่อนยิงทุกครั้ง: เรียก `askUser` (มีอยู่แล้วใน `main.js` → `askUserDialog`) ถามว่า
"ให้ Grok สร้างภาพด้วยคีย์ของคุณไหม (≈$0.02)" → `อนุญาตครั้งนี้` / `อนุญาตทั้งแชทนี้` / `ยกเลิก`

### 3. สิทธิ์ (Settings)

`prefs.json` เก็บ `providerApiAccess: { grok: 'ask' | 'chat' | 'always' | 'off', google: … }` ค่าเริ่มต้น `off`
หน้า Settings → Providers แต่ละการ์ดมีแถวใหม่: "ให้โมเดลอื่นใช้ API เจ้านี้" + ตัวเลือกระดับการถาม
`off` = tool ไม่รับ provider นั้นเลย (ทั้งจาก description และการเรียก)

### 4. เทสต์

`app/scripts/selftest-provider-apis.js` (ไม่ยิงเน็ต):
- ทุก capability มี `path`, `body`, `params`, `cost` ครบ
- provider ที่ `off` ไม่โผล่ใน `listCapabilities` และเรียกไม่ได้
- ไม่มีคีย์ → เรียกไม่ได้ และข้อความบอกเหตุผล
- URL ที่ประกอบได้มาจาก `baseUrl` ของ registry เท่านั้น (ไม่มี path จากโมเดล)
- คีย์ไม่ถูกส่งกลับในผลลัพธ์/ไม่ลง log
- parse ของแต่ละเจ้าคืน `{ text, files }` ตามรูปแบบเดียวกัน (ใช้ fixture)
- ไฟล์ถูกบันทึกใต้ `<cwd>/generated/` และ path ที่คืนอยู่ใต้ cwd
- tool description มีชื่อผู้ให้บริการที่เปิดสิทธิ์ และไม่มีชื่อที่ปิด

เพิ่มใน `run-unit-tests.js` ตามปกติ

## ผลกระทบ

- `main.js`: registry คีย์ → ส่ง `providerApiAccess` + `askUser` เข้า `createFreePiSession` (มี `askUser` อยู่แล้ว), IPC สำหรับหน้า Settings
- `renderer`: แถวใหม่ในหน้าการ์ดผู้ให้บริการ + i18n en/th (ต้องผ่าน `check:sara`)
- ไม่กระทบการแชทเดิม: ถ้าไม่มีใครเปิดสิทธิ์ tool นี้ไม่ถูกสร้างเลย

## ค้าง / ต้องตัดสินใจตอนทำ

- **Veo/Imagen**: เป็นงาน poll (long-running) และคิดเงินก้อนใหญ่ — v1 อาจใส่เฉพาะ Gemini TTS/วิเคราะห์สื่อ และเลื่อน Veo ไป v2
- **ตำแหน่งไฟล์ผลลัพธ์**: `<cwd>/generated/` (ข้อเสนอนี้) หรือที่อื่นตามที่ผู้ใช้ต้องการ
- **ภาษา/เสียงของ TTS**: ปล่อยเป็นพารามิเตอร์ให้โมเดลเลือกจากรายการที่เจ้าของ API รองรับ

## ทางเลือกที่พิจารณาแล้วไม่เลือก

- raw passthrough (`provider_request`) — คุมไม่ได้ว่าโมเดลจะยิงอะไร ค่าใช้จ่ายเสี่ยงเกินไป
- แยก tool ต่อความสามารถ (`speak_text`, `make_image`, …) — tool บานทุกครั้งที่เพิ่มความสามารถ และไม่ได้ให้ประโยชน์กว่าตารางเดียว

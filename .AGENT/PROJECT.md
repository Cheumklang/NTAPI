# PROJECT — NTAPI คืออะไร

## ภาพรวม
**NTAPI** (`ntapi-desktop`) คือแอปเดสก์ท็อปบน **Electron** ที่เอา agent แบบ CLI
(`free-pi-cli`) มาห่อเป็นหน้าต่างแชท ใช้โดยไม่ต้องเปิด terminal

> ⚠️ **ทดสอบจากซอร์สเท่านั้น** (`cd app && npm start`)
> ห้ามแตะ `C:\Program Files\NTAPI\` (โปรแกรมที่ติดตั้งจริง) เด็ดขาด — ผู้ใช้ทดสอบเอง/อัปเดตเอง

- ไม่ใช่ fork หรือ repackage ของใคร: เป็น Electron shell ที่ขับ **pi agent session**
  ตัวเดียวกับที่ `npx free-pi-cli` ใช้
- repo: `https://github.com/Cheumklang/NTAPI.git` (private)
- repo สำหรับแจกจ่าย (installer/อัปเดต): `Cheumklang/NTAPI-releases` (public)
- เวอร์ชันปัจจุบัน: **0.2.1** (`app/package.json`)
  (เลขเวอร์ชันเปลี่ยนเมื่อผู้ใช้สั่งเท่านั้น — ห้ามขยับเอง)
- ผู้พัฒนา: Chanathip Cheumklang

## สแตก
- Electron ^38, electron-builder ^26, electron-updater ^6 (อัปเดตในแอป)
- ไม่มี framework ในเรนเดอร์เรอร์ — HTML/CSS/JS ล้วน (`app/src/renderer/`)
- ธีม/ภาษา: i18n EN/TH, ฟอนต์ Noto Sans Thai
- เซิร์ฟเวอร์ presence (นับคนออนไลน์) แยกส่วนอยู่ที่ `presence/` — Node ล้วน ไม่มี dependency

## โครงสร้างโฟลเดอร์
```
NTAPI/
├─ NTAPI.bat            ← ดับเบิลคลิกเพื่อเปิดแอป (ไม่ต้องมี terminal)
├─ app/
│  ├─ package.json      ← version, build config, สคริปต์
│  ├─ src/
│  │  ├─ main.js             Electron main: window, IPC, session host
│  │  ├─ preload.js          bridge แคบ ๆ ที่ให้ renderer ใช้
│  │  ├─ freepi-bridge.js    สร้าง pi session ผูกกับ provider
│  │  ├─ provider-*.js       logic ผู้ให้บริการ (key, plan, error, timeout)
│  │  ├─ sse-error-guard.js  กัน turn ค้างเมื่อ gateway ส่ง error ในสตรีม SSE
│  │  ├─ llm7.js / tokenharbor.js / nvidia.js / zro.js / coarena.js  provider
│  │  ├─ markdown.js, diff.js, image-*.js, session-paths.js  ...
│  │  └─ renderer/           index.html · styles.css · app.js · markdown.js · provider-ui.js
│  ├─ scripts/          ← self-test และ probe (ดู Tests ด้านล่าง)
│  └─ Freepiai/         ← runtime data (gitignored ห้าม commit)
├─ docs/
│  ├─ review-2026-11-13.md        review เทียบ opencode (P0/P1/P2)
│  └─ superpowers/specs|plans     สเปกและแผนรายฟีเจอร์
├─ presence/            เซิร์ฟเวอร์นับผู้ใช้ออนไลน์
├─ dist/                ผลลัพธ์ installer (gitignored)
└─ shots/               ภาพหน้าจอตอนพัฒนา
```

## คำสั่งที่ใช้บ่อย
```bash
# เปิดแอป (หรือดับเบิลคลิก NTAPI.bat)
cd app && npm start

# บิลด์ installer (ออกที่ ../dist)
cd app && npm run dist

# เผยแพร่ผ่าน electron-builder (ปกติใช้ GitHub Actions แทน)
cd app && npm run release
```
การปล่อยเวอร์ชันจริง: push tag เช่น `v0.2.2` → GitHub Actions (`.github/workflows/release.yml`)
บิลด์ installer แล้วอัปโหลดขึ้น repo `NTAPI-releases` อัตโนมัติ

## Tests
สคริปต์ทดสอบอยู่ใน `app/scripts/` รันด้วย `node` (บางตัวเป็น pure logic, บางตัวยิงของจริง)
- **pure/ออฟไลน์** (ไม่กินเครดิต): `selftest-provider-plan.js`, `selftest-provider-key.js`,
  `selftest-provider-errors.js`, `selftest-provider-timeout.js`, `selftest-session-paths.js`,
  `selftest-markdown.js`, `selftest-model-filter.js`, `selftest-prompt-mode.js`,
  `selftest-sse-guard.js`, `selftest-image-history.js`, `selftest-image-review.js`,
  `selftest-coarena.js`, `selftest-nvidia.js`, `selftest-zro.js`, `selftest-tokenharbor.js`,
  `selftest-llm7.js`, `selftest-ui-render.js`, `selftest-ui.js`
- **ยิง backend จริง (กินเครดิต/ต้องมี key):** ตัวที่ลงท้าย `-live.js`
- **ต้องมี DevTools เปิด (`--remote-debugging-port=9222`):** ตัวที่ลงท้าย `-ui.js` เช่น `selftest-ui-send.js`

## ผู้ให้บริการ (providers)
`freepi-bridge.js` + `provider-plan.js` รองรับ:
`free-pi` (เลนฟรี), `coarena`, `zro`, `nvidia`, `tokenharbor`, `llm7`
(เรียงตาม priority; key ที่ไม่มีจะทำให้ provider นั้นซ่อน)

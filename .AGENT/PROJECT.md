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
- เวอร์ชันปัจจุบัน: **0.2.6** (`app/package.json`)
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
├─ NTAPI ADS/           ← โปรแกรมที่สอง: เครื่องมือเผยแพร่สปอนเซอร์
│  ├─ src/           main · preload · feed · media · github · config · renderer/
│  └─ scripts/       run-unit-tests.js · selftest-*.js · check-render.js
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

# เผยแพร่สปอนเซอร์ (โปรแกรมที่สอง)
cd "NTAPI ADS" && npm start
cd "NTAPI ADS" && npm test && npm run check:render
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

---

# ภาคผนวก — ย้ายมาจาก README.md เดิม
> (root `README.md` ถูกลบตามคำสั่งผู้ใช้ เนื้อหาที่ใช้ได้ย้ายมาที่นี่ แก้จุดที่ล้าสมัยแล้ว)

## ความต้องการของระบบ
- Windows, Node.js 18+ (มีอยู่แล้วถ้า `npx free-pi-cli` ใช้ได้)
- บัญชี free-pi ที่เคยใช้อย่างน้อย 1 ครั้ง (ให้ `~/.free-pi/agent/credentials.json` มีอยู่)
  ถ้าไม่มี แอปจะเริ่ม guest session ให้เอง

## หลักการทำงาน
`free-pi-cli` ไม่มีโหมด machine-readable ทางเข้าเปิด TUI เสมอ แอปจึงทำแบบเดียวกับ `launchPi()`:
1. อ่าน token จาก `~/.free-pi/agent/credentials.json` (guest ถ้าไม่มี/ถูกปฏิเสธ)
2. ดึง catalog โมเดลสดจาก `GET /client-version`
3. ลงทะเบียน provider `free-pi` ชี้ไป `https://api.freepi.ai/v1` ด้วย token นั้น
4. สร้าง pi agent session พร้อม tools มาตรฐาน (`read`, `bash`, `edit`, `write`, `grep`,
   `find`, `ls`) แล้วสตรีม event เข้าหน้าต่าง
> ⚠️ **ล้าสมัยแล้ว:** แอปเก็บ session ของตัวเองแยกจาก CLI — อยู่ที่
> `C:\NTAPI\sessions\<encoded-cwd>\*.jsonl` (ไม่ใช้ `~/.free-pi/agent/sessions` ร่วมกับ CLI อีก)

## ฟีเจอร์ที่มีวันนี้
- tool set เต็มของ free-pi + `look_at_image`, `web_search`, `docs_lookup`, `generate_image`, `free_pi_usage`
- หลาย session ในแท็บ (คนละโมเดล/ประวัติ/เทิร์น) ทำงานเบื้องหลังได้; `Ctrl+T` เปิด, `Ctrl+W` ปิด,
  `Ctrl+Tab` สลับ; กู้แท็บเดิมเมื่อเปิดแอปใหม่
- แนบรูป: ปุ่ม Image / วางด้วย `Ctrl+V` / ลากไฟล์เข้าวินโดว์
- ถามอนุมัติก่อน `bash`/`edit`/`write` (Enter อนุญาต, Esc ปฏิเสธ)
- การ์ด tool กางดู arguments/output ได้; หยุดเทิร์นที่รันอยู่ได้
- แสดงเหตุจริงเมื่อถูกปฏิเสธ (ads, เครดิต, session limit, โมเดลเต็ม) ไม่ปล่อยเงียบ
- แถบโฆษณาที่ free-pi ให้มาในเทิร์นนั้น
- ตัวเลือก workspace จำข้ามการเปิดใหม่, เปิด session ล่าสุดให้เอง
- ลิสต์ session ต่อโฟลเดอร์: คลิกสลับ, เปลี่ยนชื่อในที่, right-click → ลบถาวร (มี confirm)
  (เรียงตามเวลาสร้าง ใหม่→เก่า ไม่สลับที่ — commit `50338cc`)
- model picker แยกกลุ่มตาม provider มีค้นหาได้
- กรองเหลือ DeepSeek ฟรี (`app/src/model-filter.js`)
- เครดิตคงเหลือสดจาก `GET /me/stats`

## Backend endpoints ของ tools
| Tool | Endpoint | สถานะ |
|---|---|---|
| `look_at_image` | `POST /tools/vision` | ใช้ได้ (retry 502 เป็นครั้งคราว) |
| `generate_image` | `POST /tools/image` | ใช้ได้ |
| `free_pi_usage` | `GET /me/stats` | ใช้ได้ |
| `web_search` | `POST /tools/web-search` | ต่อไว้ (ตอนเขียน backend 502) |
| `docs_lookup` | `POST /tools/docs` | ต่อไว้ (ตอนเขียน backend 502) |

POST tools retry 502/503/504 3 ครั้งก่อนรายงานว่า fail (agent รู้ว่าล้มเหลว ไม่เดาคำตอบ)

## ads — ทำไมเทิร์นถึงเงียบ
free-pi ฟรีเพราะมีโฆษณา ถ้าไม่ขอ ad/ไม่รายงาน impression จะโดน
`403 {"code":"ads_required"...}` แอปทำแบบ extension `pi-ads` ใน `src/freepi-bridge.js` (`createAdsClient`):
1. ข้อความผู้ใช้เริ่มเทิร์น (uuid ใหม่)
2. `GET /ads/next?slot=banner` พร้อม `x-turn-id`
3. เรนเดอร์ในแถบโฆษณา + `POST /ads/impression` (+ pixel Gravity ถ้ามาจาก ad network)
4. คำขอ completion ส่ง `x-turn-id` เดียวกัน

ดึง 1 ad ตอนเริ่ม session และ 1 ad ต่อข้อความ; คลิกเปิดในเบราว์เซอร์ ไม่เปิดในหน้าต่างแอป

## ถ้าเทิร์นไม่ตอบอะไร
อ่าน banner แดงใต้พื้นที่ผู้ช่วย มันบอกเหตุ
- `ads_required` — ad ไม่ถึง backend (รัน `npx free-pi-cli@latest` หนึ่งครั้ง แล้วลองใหม่)
- `concurrent_session` — บัญชีมี 4 session รันอยู่แล้ว (ปิดหน้าต่างอื่น หรือ `/close-other-session`)
แอปกู้คืนไม่เกิน 4 แท็บ (1 ต่อ 1 session file) จึงไม่ชนเพดานนี้เอง

## รูปภาพทำงานยังไง
โมเดล free-pi เป็น text-only (`input:["text"]`) ส่งรูปเป็น content ไม่ได้ แนบรูปจึง:
1. เซฟไป `<workspace>/.ntapi-attachments/`
2. ใส่ path ใน prompt
3. สั่ง agent เรียก `look_at_image`

`look_at_image` โพสต์ไป `/tools/vision` (กิน allowance, upstream 502 เป็นครั้งคราว)
ส่งรูปจึงกิน 2 คำขอ (vision + model turn)

## ยังไม่มี (Not yet)
- MCP — **มีแล้ว** (Phase 1+2): config ที่ `C:\NTAPI\mcp.json`, เปิด/ปิดใน Settings > MCP
  (opt-in ปิดดีฟอลต์), tools ผ่าน approval ทุกครั้ง, รองรับ stdio + HTTP (ผ่าน SDK)
- `codemode`, `tool_search`, `subagent`, `send_message`, `submit_plan`, `fusion_plan`,
  `free_pi_docs`, `free_pi_buy_credits`
  (**หมายเหตุ:** `todo` และ `ask_user` ถูกลงทะเบียนแล้วใน `freepi-bridge.js`)
- usage panel อ่าน `remaining_credits_today`/`allowance_credits`; ถ้า payload เปลี่ยนจะโชว์ `n/a`
- แถบโฆษณาแสดง 1 banner/เทิร์น; inline ads, `/support`, credit meter ของ CLI ยังไม่ทำ
- `/close-other-session` ยังไม่มีปุ่ม

## ที่เก็บข้อมูล (Where data lives)
- settings, แชท, skills, รูปที่สร้าง อยู่ที่ `C:\NTAPI`
- ติดตั้งเดิมที่มี `C:\Freepiai` จะใช้โฟลเดอร์เดิมต่อ (ไม่หาย)
- ตั้ง `NTAPI_DATA_DIR` เพื่อชี้ที่อื่นได้ (ยังรับ `FREEPI_DATA_DIR`)

## หา pi SDK
`main.js` (`resolveSdk` + `src/sdk-path.js`) หา `@earendil-works/pi-coding-agent` เรียงลำดับ:
1. **bundle มากับแอป** (`app/node_modules/@earendil-works/pi-coding-agent`) — เครื่องใหม่เปิดได้เลย
2. `NTAPI_SDK_PATH` / `FREEPI_SDK_PATH`
3. npx cache (`AppData/Local/npm-cache/_npx/*/node_modules/@earendil-works/pi-coding-agent`)

SDK เป็น ESM-only และ `exports` ไม่มี `require` → ต้อง `require` ที่ **โฟลเดอร์** (ใช้ `main`) ไม่ใช่ชื่อ package

## Security notes
- token อ่านจากไฟล์เดียวกับ CLI และไม่หลุดเข้า renderer
- renderer: `nodeIntegration:false`, `contextIsolation:true` เรียกได้แค่ IPC ใน `preload.js`
- agent มีสิทธิ์ไฟล์/เชลล์จริงในโฟลเดอร์ที่เลือก; ป้องกันด้วย approval prompt สำหรับ `bash`/`edit`/`write`
  (read-only tools รันไม่ถาม; อยากให้ถามทุกตัว เพิ่มใน `guardedTools` ที่ `freepi-bridge.js`)
- path ของ attachment ถูกตรวจให้อยู่ใน workspace ก่อน `look_at_image` อ่าน
- ลบ session จะถูกปฏิเสธถ้า path ไม่อยู่ใน session store และไม่ลงท้าย `.jsonl`

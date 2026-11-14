# HANDOFF — ส่งต่องานไป session ถัดไป

**อัปเดตล่าสุด:** 2026-11-14 · ปล่อย **v0.2.4** แล้ว (`origin/master` HEAD `9b14db4`, release ที่ `NTAPI-releases`)

> นี่คือไฟล์ **"อ่านอันเดียวจบ"** ของ session ใหม่ — อ่านบนลงล่าง
> ถ้าคุณเป็น AI แล้วเพิ่งเปิดโปรเจกต์: อ่านหัวข้อ 0–3 ให้ครบก่อนแตะโค้ด
> ไฟล์อ้างอิงลึก ๆ (PROJECT/LOG/docs) ค่อยเปิดเมื่อจำเป็น ไม่ต้องอ่านทุก session

---

## 0) กติกาเหล็ก (ต้องทำก่อนแตะโค้ด)
- **ห้าม `git commit` / `push` / tag / เปิด PR เอง — ต้องขออนุญาตผู้ใช้ก่อนเสมอ**
  (ผู้ใช้ใช้ **GitHub Desktop** จัดการ repo)
- commit message = **ภาษาไทย กระชับ บรรทัดเดียว** (ดูสไตล์: `git log --oneline`)
- ห้ามแตะ/commit: `app/Freepiai/`, `dist/`, credentials, ไฟล์ runtime (อยู่ใน `.gitignore`)
- แอปอาจรันอยู่ (electron) — จะรีสตาร์ต/ทดสอบ UI ให้ถามก่อน
- **ห้ามแตะ `C:\Program Files\NTAPI\` เด็ดขาด** — นี่คือโปรแกรมที่ติดตั้งจริง
  ผู้ใช้ใช้มันทดสอบเหมือนผู้ใช้ทั่วไป และ **อัปเดตเอง** ห้ามเปิด/ปิด/แก้/ลบ/อัปเดต/รันอะไรทั้งนั้น
  (อ่าน/ลิสต์ก็ไม่ต้อง) → ทดสอบจากซอร์สเท่านั้น: `cd app && npm start`
- **ห้ามขยับเลขเวอร์ชันเอง** (`app/package.json`) — เปลี่ยนก็ต่อเมื่อผู้ใช้สั่งเท่านั้น
  เพราะอาจแก้หลายอย่างรวมกันก่อนปล่อยอัปเดตครั้งเดียว ห้าม tag/สร้าง release เอง
- **หลังแก้ปัญหาเสร็จทุกครั้ง:** ต้องสรุปให้ผู้ใช้ทราบว่ามีงานที่แก้แล้วค้างอยู่ (uncommitted)
  **กี่เรื่อง** และ **ถามว่าจะอัปเวอร์ชันเลยไหม** (ห้าม bump เอง)

## 1) กำลังทำ / ค้างอยู่ตอนนี้ (สำคัญสุด — อ่านก่อน)
> ⚠️ ตรวจ `git status` เทียบกับที่นี่เสมอ — อาจมี session อื่นทํางานคู่ขนานอยู่
> สถานะ: งาน 1a–1h อยู่ใน v0.2.4 (รวมงาน session อื่น: single-instance)

### 1a) เคส LLM7 — แก้เสร็จ ยืนยันกับโมเดลจริงแล้ว และ commit แล้ว (`e6b959d`)
- **อาการ:** reasoning model กินโควตา output จนหมด แล้วได้ `finish_reason: "length"` + content ว่าง
  → หน้าต่างเงียบ อ่านเหมือนแชทค้าง
- **รากปัญหา (ยืนยันด้วยเทสต์สด + โทเคนจริง 2 ชั้น):**
  1. `reasoning_effort: "minimal"` (มาจาก thinkingLevel ของแอป) ทำให้ LLM7 ตัดจบกลางความคิด
     → `length` + content ว่าง (ทดสอบซ้ำได้: ส่ง param นี้แล้วว่างทันที, ตัดออกแล้วตอบปกติ)
  2. **สาเหตุจริงของดีฟอลต์:** โมเดลฟรีตัวแรกของ catalog คือ `DeepSeek-V4-Flash-0731`
     ซึ่งบนเลนฟรีถูกบีบ output เหลือ ~128 tokens (วัดจาก usage: `completion_tokens: 128`
     ทุกครั้ง ไม่ว่า `max_tokens` จะเป็น 512 หรือ 32768) — reasoning กินหมดก่อนตอบ
     ส่วนโมเดลฟรีที่ไม่คิดก่อนตอบ (gpt-oss:20b, codestral-latest) ตอบครบ 245–448 tokens
- **ที่แก้ (ยังไม่ commit):**
  - `app/src/llm7.js` — compat: `maxTokensField: 'max_tokens'`, `supportsReasoningEffort: false`
    + `PREFERRED_FREE_MODELS` / `preferredLlm7Model()` เลือกดีฟอลต์จากรายชื่อที่พิสูจน์แล้ว
  - `app/src/provider-plan.js` — ดีฟอลต์ llm7 ใช้ `preferredLlm7Model()` แทน "ตัวแรกที่ฟรี"
  - `app/src/main.js` — notice เมื่อ `stopReason === 'length'` และไม่มีคำตอบ (กันหน้าต่างเงียบ)
  - เทสต์: `selftest-llm7.js` (+compat/default), `selftest-provider-plan.js` (+ดีฟอลต์แบบเรียงสลับ)
- **ยืนยัน:** รัน bridge จริงด้วยโทเคนที่บันทึกไว้ — ดีฟอลต์ใหม่ `gpt-oss:20b` ตอบ
  "สวัสดีครับ! มีอะไรให้ช่วยเหลือได้บ้างครับ?" ใน 1 วินาที (stop=stop)
- **รอบ 2 (หลังผู้ใช้ลองจริง):** แท็บเดิมยังจำ DeepSeek ไว้ → เพิ่มการแก้ให้เองใน `main.js`
  (`planEmptyAnswerRetry()` / `runEmptyAnswerRetry()`): เทิร์นจบ `length` + ไม่มีคำตอบ
  → ลองซ้ำโมเดลเดิม 1 ครั้ง (รอ 2.5 วิ) → ถ้ายังว่างจึงสลับไป `gpt-oss:20b` แล้วส่งซ้ำ
  (สูงสุด 2 ครั้ง/ข้อความผู้ใช้, ยกเลิกทันทีถ้าผู้ใช้ส่งข้อความใหม่, ใช้ `promptSeq` กันส่งซ้ำ)
  ต้องมีธง `reasoning` ใน `llm7ModelEntries()` (เพิ่มแล้ว)
- **รอบ 3 (ผู้ใช้ท้วงว่า "พิมพ์ยาวๆ แล้วตอบ" — ท้วงถูก):** วัดซ้ำแล้วพบว่า **ไม่เกี่ยวกับความยาวข้อความ**
  อาการมาจาก **โหมดลดทอนชั่วคราวของ LLM7**: `usage.prompt_tokens = 32` + `completion = 128` เป๊ะ
  แล้วกลับมาปกติเองภายใน ~4 วินาที (ข้อความยาวก็ล้มได้, ข้อความสั้นก็ผ่าน) → จึงเปลี่ยนลำดับกู้เป็น
  "ลองซ้ำก่อน แล้วค่อยสลับโมเดล" และแยกตรรกะเป็น `src/empty-answer.js` + `selftest-empty-answer.js`
  (สรุป: ไม่ใช่บั๊กในโค้ดแอป แต่แอปเดิมเลือกโมเดลเสี่ยง + เงียบเกินไป)
- **ต้องทําต่อ:** เสร็จแล้ว — ปล่อย v0.2.2 ขึ้น `NTAPI-releases` ถูกต้อง; เหลือผู้ใช้อัปเดตโปรแกรมที่ติดตั้ง + ทดสอบเอง

### 1b) ไฟล์ค้างอื่น ๆ
- [x] **root `README.md`** — ลบแล้วตามคําสั่งผู้ใช้ (2026-11-14) เนื้อหาย้ายเข้า `.AGENT/PROJECT.md` (ภาคผนวก)
- [x] **probe scripts + artifact** — ลบออกหมดแล้ว (ใช้ชั่วคราว ไม่ควรอยู่ในรีโป)
- [x] **งานระบบ `.AGENT`** — commit `82844d7` + push แล้ว

### 1c) ลิสต์แชทที่บันทึกไว้ — แก้ให้เรียงนิ่ง (commit `50338cc` + push แล้ว)
- **ปัญหา:** ซ้ายมือสลับที่ไปมา ผู้ใช้กดผิด เพราะเรียงตาม `modified` (เวลาที่แชทถูกเขียนล่าสุด)
  → ทุกครั้งที่ส่งข้อความในแชทไหน แชทนั้นเด้งขึ้นบน
- **แก้:** เรียงตาม **`created` (เวลาสร้าง) ใหม่→เก่า** + tie-break ด้วย `id` (นิ่งสนิท
  ให้แชทใหม่สุดอยู่บนเสมอ) และแสดงวันที่สร้างบนแถว
- ไฟล์: `app/src/main.js` (`listSessions`), `app/src/renderer/app.js` (`renderSessions`)
- ยืนยัน: `node --check` ผ่านทั้งสองไฟล์, `selftest-session-paths.js` PASS

### 1d) ข้อความที่ส่งกลางเทิร์น (steer) โผล่ผิดลําดับ — แก้แล้ว (commit `1f05f90`)
- **ปัญหา:** ส่งข้อความขณะ AI กำลังทำงาน → ข้อความไปอยู่ล่างสุด และคำตอบที่เหลือสตรีมกลับเข้า
  บล็อกเดิมด้านบน → คำตอบไปโผล่เหนือข้อความผู้ใช้ อ่านสลับลําดับ สับสน
- **แก้:** เพิ่ม event `turn_start` (main → renderer) แล้ว “ปิดบล็อก” ตอนขึ้นเทิร์นใหม่
  เพื่อให้คำตอบที่ตอบข้อความนั้นไปอยู่ **ใต้** ข้อความผู้ใช้
  - `app/src/main.js`: case `turn_start` → ส่ง `agent:turnStart`
  - `app/src/preload.js`: เพิ่ม `onTurnStart`
  - `app/src/renderer/app.js`: `view.steerPending` + `api.onTurnStart` + reset ใน settled/error
- ยืนยัน: `node --check` ผ่าน 3 ไฟล์, selftest (sse-guard/provider-plan/empty-answer) PASS,
  ตรวจลําดับ event ใน SDK แล้วว่า `turn_start` ยิงก่อนข้อความ steer + คำตอบใหม่
- **สถานะ:** commit `1f05f90` → อยู่ใน v0.2.3 แล้ว; เหลือผู้ใช้ทดสอบ UI จริง

### 1e) คําว่า "กำลังทำงาน..." ให้ขยับ (commit `1f05f90`)
- **เหตุ:** ข้อความนิ่ง อ่านเหมือนโปรแกรมค้าง
- **แก้:** ต่อท้ายด้วยจุด 3 จุด เด้ง/จางสลับจังหวะ (`.hint-dots`, `@keyframes hint-dot`)
  - `app/src/renderer/app.js` (`setBusy`), `app/src/renderer/styles.css`
  - รองรับ `prefers-reduced-motion` (หยุดขยับให้คนที่ปิดอนิเมชัน)
- ยืนยัน: `node --check` ผ่าน; ยังไม่ทดสอบ UI

### 1f) ปรับ model picker + สถานะ Coarena (commit `f6483b9`)
- **ลบปุ่ม** "คำสั่ง (Ctrl+P)" ออกจาก sidebar (คีย์ลัด Ctrl+P ยังใช้ได้)
- **เรียง A-Z:** ค่ายเรียง A-Z (Coarena→FreePi→LLM7→NVIDIA→Token Harbor→Zro)
  และโมเดลในแต่ละค่ายเรียง A-Z (ทำใน `provider-ui.js` `groupModelsByProvider`)
- **ดาวโปรด:** ปุ่มดาวทุกแถวโมเดล → ดาวแล้วได้โฟลเดอร์ "รายการโปรด" อยู่บนสุด
  (เก็บใน `localStorage` คีย์ `ntapi.favoriteModels`; ตัวที่ติดดาวยังอยู่ใต้ค่ายเดิมด้วย)
- **tooltip ฟองอากาศ:** ชี้เมาส์ที่โมเดล → แสดงโลโก้ค่าย + ชื่อค่าย เป็น pill ไม่มีมุม
- **สถานะ Coarena:** เพิ่มแถบ % งบรายวัน (`usd_per_day`/`cost_usd`) + เวลารีเซ็ต
  (เดิมมีแค่บรรทัด limits)
- ไฟล์: `app/src/renderer/provider-ui.js`, `renderer/app.js`, `renderer/index.html`,
  `renderer/styles.css`, `scripts/selftest-provider-ui.js`, `scripts/selftest-model-picker.js`
- **ยืนยัน:** `selftest-provider-ui` PASS, `selftest-model-picker` PASS (A-Z / ดาว / tooltip จริง),
  `node --check` ผ่าน, ชุด provider-plan/errors/key/model-filter/prompt-mode/markdown/session-paths PASS

### 1g) ไอคอนแอปเป็นสี่เหลี่ยม — ท ามุมโค้ง (commit `19497a8`)
- **ปัญหา:** ไอคอนบนเดสก์ท็อป/ทาสก์บาร์ (`build/icon.png`) เป็นสี่เหลี่ยม แต่ในโปรแกรมมี CSS `border-radius`
- **แก้:** เบิร์นมุมโค้ง (rx = 8/28 ของด้าน ให้ตรง `.brand-icon`) + พื้นหลังโปร่งใส ผ่าน
  `tools/round-icon.js` (idempotent) → `build/icon.png` (512, rx146), `assets/icon.png` (256, rx73)
- ผลกับ shortcut/taskbar/installer จะเห็นหลังบิลด์ release ถัดไป

### 1h) single-instance lock — session อื่นท า (commit `efc866b`)
- `app/src/single-instance.js` (`focusExistingWindow`) + `main.js` (`requestSingleInstanceLock`)
- เทส `selftest-single-instance.js` PASS — เปิดซ้ำจะโฟกัสหน้าต่างเดิม ไม่เปิดโปรเซสใหม่
- เป็น P0 ในรีวิว

### 1i) MCP — Phase 1+2 เสร็จ (uncommitted)
- **พบ:** โปรแกรม **โหลด MCP อยู่แล้ว** (`sdk.createMcpExtension()`)
- **Phase 1 (ความปลอดภัย):** `isGuardedTool()` + `mcpToolLabel()` ใน `freepi-bridge.js`
  → MCP tools ต้องอนุมัติทุกครั้ง + dialog โชว์ชื่อ server (`main.js` → `renderer/app.js`)
- **Phase 2 (ใช้ได้จริง):**
  - config ย้ายมาที่ **`C:\NTAPI\mcp.json`** ผ่าน `loadAppMcpConfig()` — หาเจอ ไม่หลบใน dot-folder
  - **opt-in / ปิดดีฟอลต์** (`mcpEnabled` ใน prefs; เปิดที่ Settings)
  - Settings แท็บ **MCP**: ติ๊กเปิด + แก้ `mcp.json` (textarea) + บันทึก (`mcp:get`/`mcp:set`)
  - เตือนเรื่อง LLM7 free (function calling เป็นสิทธิ์ Pro)
- ไฟล์: `freepi-bridge.js`, `main.js`, `preload.js`, `renderer/{app.js,index.html,styles.css}`,
  `scripts/selftest-mcp-{guard,config}.js`
- **ยืนยัน:** `selftest-mcp-guard` + `selftest-mcp-config` PASS, ชุดอื่น PASS,
  smoke test เปิด Electron จริง (model picker) PASS
- **Phase 3 (ยังไม่ทำ):** per-model gating — SDK ตั้ง exposure เป็น `codemode` อยู่แล้ว จึงยังไม่จำเป็น

## 2) ขั้นถัดไปที่ตกลงไว้ (ทำต่อได้เลยเมื่อผู้ใช้สั่ง)
จากลำดับใน `docs/review-2026-11-13.md` ที่ยังเหลือ:
- **P1:** MCP อ่าน `mcp.json` ได้แล้ว (`freepi-bridge.js` ~บรรทัด 1308 ผ่าน `sdk.createMcpExtension()`)
  แต่ยังไม่มี UI จัดการ — ผู้ใช้ยังต้องแก้ไฟล์เองหรือใช้ `free-pi-cli mcp add`
- **P2:** ตรวจซ้ำข้อหน้าจอ (ฟอนต์เล็ก/แถว usage ล้น/คำว่า "เครดิต") เพราะบางส่วนอาจจบแล้ว

**ปิดเคสแล้ว — อย่าเปิดซ้ำ:**
- P0 single-instance lock → เสร็จใน v0.2.4 (`efc866b`, §1h)
- P1 "กล่อง thinking ถูกซ่อน" → **ไม่ใช่บั๊ก** (ตรวจแล้ว 2026-11-14): `hideThinkingBlock` เป็นค่าของ
  TUI pi เอง ไม่มีผลกับ NTAPI และแอปมีปุ่ม "การคิด: <level>" (`#thinkingSelect`) พร้อมกล่อง
  "ดูความคิด" อยู่แล้ว — กล่องว่างแปลว่าโมเดล/เทิร์นนั้นไม่ส่ง reasoning มา ไม่ใช่แอปพลาด

## 3) รู้ไว้ก่อนลงมือ (บริบทกันหลง)
- โปรเจกต์ = Electron shell ห่อ pi agent ของ free-pi (ไม่ใช่ fork) — v **0.2.5**
- **มี session อื่นทำงานกับ repo นี้ได้พร้อมกัน** → เช็ก `git status`/`git diff` ก่อนลงมือทุกครั้ง
  อย่า revert งานคนอื่น และระวังเขียนทับไฟล์ที่กำลังแก้
- โครงสร้าง/คำสั่งรันบิลด์เทส/รายชื่อ provider → ดู `PROJECT.md` (ไฟล์เดียว มีครบ)
- สถานะ "ทำเสร็จแล้ว" ที่ยาว → ดู `LOG.md` กับ `git log`; อย่าเชื่อ HANDOFF เก่าโดยไม่เช็ก `git status`
- เซิร์ฟเวอร์ presence แยกที่ `presence/` (Node ล้วน ไม่มี dependency)

## 4) คำสั่งเร็ว ๆ
```bash
cd app && npm start                 # เปิดแอป
cd app && npm run dist              # บิลด์ installer -> ../dist
node scripts/selftest-<ชื่อ>.js     # เทส (ดูรายการใน PROJECT.md)
```

## ไฟล์อ้างอิง (เปิดเมื่อจำเป็น)
- `PROJECT.md` — สถาปัตยกรรม โครงสร้าง คำสั่ง เทส
- `LOG.md` — ประวัติงาน (ล่าสุดท้ายไฟล์)
- `docs/review-2026-11-13.md` — รีวิวเทียบ opencode (P0/P1/P2)
- `docs/superpowers/specs|plans` — สเปก/แผนรายฟีเจอร์

<!-- ===== ด้านล่างนี้คือส่วนที่ session ต้องอัปเดตก่อนปิด ===== -->

---

## ภาคผนวก: โปรโตคอลปิด session (ทำทุกครั้งก่อนจบ/ก่อน compact)
1. **`HANDOFF.md`** — อัปเดตหัวข้อ 1 (กำลังทำ/ค้าง), หัวข้อ 2 (ขั้นถัดไป), และวันที่ด้านบน
   ให้ตรงความจริง **ณ วินาทีที่ปิด session**
2. **`LOG.md`** — ต่อท้าย 1 หัวข้อ: วันที่ + ทำอะไร + ไฟล์ที่แตะ + ผลเทส + สถานะ commit
3. ถ้ามีการ commit — จด hash ลง LOG.md
4. **อย่า**อ่าน/เขียนทับ `LOG.md` ของเก่า (append-only)

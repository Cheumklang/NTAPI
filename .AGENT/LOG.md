# LOG — บันทึกงาน (append-only, ล่าสุดอยู่ท้าย)

> กติกา: **ต่อท้ายเท่านั้น ห้ามลบของเก่า** หนึ่งงาน = หนึ่งหัวข้อ
> รูปแบบ: `## YYYY-MM-DD — หัวข้องาน` แล้วตามด้วยสิ่งที่ทำ / ไฟล์ที่แตะ / ผลเทส / สถานะ commit

## 2026-11-14 — ตั้งระบบหน่วยความจำโปรเจกต์ (.AGENT)
- สร้าง `.AGENT/` (README, PROJECT, HANDOFF, LOG) + `AGENTS.md` ที่ root ให้ AI อ่านก่อน
- ออกแบบเป็น handoff ข้าม session: HANDOFF.md = ไฟล์เดียวจบ, มีโปรโตคอลอัปเดตก่อนปิด session
- ระบุกติกา: GitHub Desktop ใช้จัดการ repo, AI ต้องขออนุญาตก่อน commit/push, commit message ภาษาไทย
- ทำ `HANDOFF.md` ให้เป็นแหล่งความจริงเดียวสำหรับส่งต่อ (แทน STATE.md ที่ตัดออก)
- ยังไม่ commit (รอผู้ใช้อนุญาต)

## ก่อนหน้า (สรุปจาก git log — ยังไม่ย้ายเข้า LOG.md แบบละเอียด)
- `6fac887` กันเทิร์นค้างเมื่อเกตเวย์ส่ง error มาในสตรีม SSE
- `bfc4edc` ใช้ LLM7.io แทน Routeway เป็นผู้ให้บริการที่ 6
- `41e792b` เพิ่ม Routeway gateway เป็นผู้ให้บริการที่ 6
- `3145c9d` พื้นที่อ่านขยายตามหน้าต่างแล้ว
- `33c198a` / `2730ecf` เลนฟรีใช้ชื่อ FreePi
- `00e0dc6` หน้า About: เอากรอบออก และซ่อมแถบความคืบหน้าอัปเดต
- `bce8f85` แสดงโมเดลเสียเงินของทุกเจ้า แยกชัดว่าอันไหนฟรี
- `700b390` เวอร์ชัน 0.2.0
- `055324c` เสียงและ toast แจ้งเตือนเมื่อแชททำงานเสร็จ
- `ec621ff` หน้าอัปเดตในแอป: แสดง % + ติดตั้ง/รีสตาร์ตเอง
- `2d80019`/`4a642eb` โลโก้ชุดใหม่
- `dd00f44` ระบบอัปเดตอัตโนมัติผ่าน GitHub Releases
- `5922617` แก้บั๊กรูปภาพทำแชทค้างและคำขอเกิน 4 MB
- `ffa02eb` เริ่มโปรเจ็ค

<!-- ต่อท้ายด้านล่างนี้ -->

## 2026-11-14 — ผลปล่อย v0.2.4: สําเร็จ
- commit: `f6483b9` (model picker + Coarena), `efc866b` (single-instance),
  `19497a8` (ไอคอนมุมโค้ง), `9b14db4` (เวอร์ชัน 0.2.4)
- release `v0.2.4` ออนไลน์; assets: NTAPI-Setup-0.2.4.exe (102,341,110 B), latest.yml, blockmap
- `/releases/latest` ชี้ v0.2.4 แล้ว
- เหลือ: ผู้ใช้อัปเดตโปรแกรมที่ติดตั้งเอง + ทดสอบ (A-Z/ดาว/tooltip/ไอคอนโค้ง/single-instance)

## 2026-11-14 — ปรับ model picker + สถานะ Coarena (ยังไม่ commit)
- ลบปุ่มคําสั่ง (Ctrl+P) จาก sidebar
- model picker เรียง A-Z (ค่าย + โมเดล)
- เพิ่มดาวโปรด (โฟลเดอร์รายการโปรดบนสุด, localStorage) + tooltip โลโก้ค่ายเป็นฟองอากาศ
- Coarena: เพิ่มแถบ % งบรายวัน + เวลารีเซ็ต
- เทส: selftest-provider-ui PASS, selftest-model-picker PASS (ดาว/tooltip/A-Z), ชุดอื่น PASS

## 2026-11-14 — ท าไอคอนมุมโค้ง + รับงาน single-instance
- `tools/round-icon.js`: เบิร์นมุมโค้งลง `build/icon.png` / `assets/icon.png` (โปร่งใส)
- รับงาน single-instance ของ session อื่น (เทส PASS) รวมเข้า release
- เริ่มปล่อย v0.2.4

## 2026-11-14 — ผลปล่อย v0.2.3: สําเร็จ
- commit: `1f05f90` (แก้ steer + จุดขยับ), `8071707` (เวอร์ชัน 0.2.3)
- release `v0.2.3` ออนไลน์ (ไม่ draft); assets: NTAPI-Setup-0.2.3.exe (102,276,580 B), latest.yml, .blockmap
- `/releases/latest` ชี้ v0.2.3 แล้ว
- เหลือ: ผู้ใช้อัปเดตโปรแกรมที่ติดตั้งเอง + ทดสอบ (steer ordering, จุดขยับ)

## 2026-11-14 — กฎใหม่: รายงานจำนวนงานค้าง + ถามก่อนอัปเวอร์ชั่น
- หลังแก้ปัญหาเสร็จทุกครั้ง: สรุปว่ามีงานค้าง uncommitted กี่เรื่อง + ถามว่าจะอัปเวอร์ชันเลยไหม
- บันทึกใน AGENTS.md, .AGENT/HANDOFF.md ข้อ 0, .AGENT/README.md

## 2026-11-14 — เริ่มปล่อยเวอร์ชัน 0.2.3 (ผู้ใช้อนุมัติ)
- bump 0.2.2 → 0.2.3, commit + push tag v0.2.3 → GitHub Actions ปล่อยขึ้น NTAPI-releases
- งานในชุดนี้: แก้ steer เรียงลําดับ + จุดขยับคําว่า "กำลังทำงาน..."

## 2026-11-14 — จุดขยับที่คําว่า "กำลังทำงาน..."
- ต่อท้ายข้อความ busy ด้วยจุด 3 จุดเด้งสลับจังหวะ ให้ดูไม่ค้าง (`hint-dots`)
- ไฟล์: `app/src/renderer/app.js` (`setBusy`), `app/src/renderer/styles.css`
- รองรับ reduced-motion; node --check ผ่าน

## 2026-11-14 — แก้ข้อความส่งกลางเทิร์นโผล่ผิดลําดับ (steer)
- ปัญหา: ส่งข้อความระหว่าง AI ทำงาน → อยู่ล่างสุด และคำตอบสตรีมกลับไปเหนือข้อความ
- แก้: เพิ่ม event `turn_start` → renderer ปิดบล็อกเดิมตอนขึ้นเทิร์นใหม่ ให้คำตอบอยู่ใต้ข้อความ
- ไฟล์: `app/src/main.js`, `app/src/preload.js`, `app/src/renderer/app.js`
- เทส: node --check 3 ไฟล์ + selftest 3 ตัว PASS; ยังไม่ commit / ยังไม่ bump / ยังไม่ทดสอบ UI

## 2026-11-14 — ผลปล่อย v0.2.2: สําเร็จ
- GitHub Actions บิลด์เสร็จ ~4 นาที; release `v0.2.2` ออนไลน์ (ไม่ draft)
- assets: `NTAPI-Setup-0.2.2.exe` (102,275,727 B), `latest.yml` (version 0.2.2), `.blockmap`
- `/releases/latest` ชี้ที่ v0.2.2 แล้ว → electron-updater เห็นรุ่นใหม่
- เหลือ: ผู้ใช้อัปเดตโปรแกรมที่ติดตั้งเอง + ทดสอบเป็นผู้ใช้ทั่วไป

## 2026-11-14 — ปล่อยเวอร์ชัน 0.2.2 (ผู้ใช้อนุญาต)
- bump `app/package.json` 0.2.1 → 0.2.2, commit + push tag `v0.2.2`
- GitHub Actions บิลด์ installer → ปล่อยขึ้น `Cheumklang/NTAPI-releases`
- ผู้ใช้จะอัปเดตโปรแกรมที่ติดตั้งเอง (AI ห้ามแตะ Program Files)

## 2026-11-14 — ลบ root README.md เหลือความจำที่ .AGENT
- ผู้ใช้เลือกเก็บ README ไว้ที่ `.AGENT/` ที่เดียว
- ย้ายเนื้อหา README เดิม (214 บรรทัด) เข้า `.AGENT/PROJECT.md` ภาคผนวก พร้อมแก้จุดล้าสมัย
  (แชทไม่แชร์กับ CLI แล้ว, `todo`/`ask_user` ลงทะเบียนแล้ว, ลิสต์แชทเรียงตาม created)
- `git rm README.md`
- ต่อไป: bump version + release (ผู้ใช้ทําเอง)

## 2026-11-14 — commit + push 3 ตัว (ผู้ใช้อนุญาต)
- `82844d7` เพิ่ม .AGENT ส่งต่องานข้าม session และ AGENTS.md ให้ AI อ่านก่อน
- `50338cc` ลิสต์แชทที่บันทึกไว้เรียงตามเวลาสร้าง ไม่สลับที่กลางคัน
- `e6b959d` กู้ LLM7 ตอบว่าง: ลองซ้ำแล้วสลับเป็นโมเดลที่ไม่คิดก่อนตอบ
- push ขึ้น `origin/master` สำเร็จ (`6fac887..e6b959d`)
- เทสก่อน commit: `node --check` ทุกไฟล์ที่แตะ, `selftest-empty-answer`, `selftest-provider-plan`,
  `selftest-session-paths` — PASS ทั้งหมด
- ต่อไป: ผู้ใช้ bump version + ปล่อยอัปเดต + ทดสอบเองเป็นผู้ใช้ทั่วไป (AI ห้ามแตะ Program Files)

## 2026-11-14 — แก้ลิสต์แชทไม่ให้สลับที่
- อาการ: ลิสต์แชทที่บันทึกไว้สลับไปมา กดผิด
- สาเหตุ: เรียงตาม `modified` → แชทที่เพิ่งส่งข้อความเด้งขึ้นบน
- แก้: เรียงตาม `created` ใหม่→เก่า + tie-break `id`; แสดงวันที่สร้าง
- ไฟล์: `app/src/main.js` (`listSessions`), `app/src/renderer/app.js` (`renderSessions`)
- เทส: `node --check` สองไฟล์ผ่าน, `selftest-session-paths.js` PASS; ยังไม่ commit

## 2026-11-14 — กฎ: ห้ามขยับเลขเวอร์ชันเอง
- เลขเวอร์ชัน (`app/package.json`) เปลี่ยนเมื่อผู้ใช้สั่งเท่านั้น
  เพราะอาจแก้หลายอย่างรวมกันก่อนปล่อยอัปเดตครั้งเดียว — ห้าม tag/release เอง
- บันทึกใน HANDOFF ข้อ 0, AGENTS.md, README.md, PROJECT.md

## 2026-11-14 — เพิ่มกฎห้ามแตะโปรแกรมที่ติดตั้งจริง
- กฎใหม่: ห้ามแตะ `C:\Program Files\NTAPI\` เด็ดขาด (อ่าน/ลิสต์ก็ไม่ต้อง)
  ผู้ใช้ใช้ทดสอบเหมือนผู้ใช้ทั่วไป และอัปเดตเอง → ทดสอบจากซอร์ส `cd app && npm start` เท่านั้น
- บันทึกใน HANDOFF ข้อ 0, AGENTS.md, PROJECT.md

## 2026-11-14 — พบงาน LLM7 ทำคู่ขนาน (ตอนตั้งระบบ .AGENT)
- ระหว่างเซ็ตอัป พบ working tree เปลี่ยนเอง → มี session อื่นกำลังแก้เคส LLM7
- `app/src/llm7.js`: compat `maxTokensField: 'max_tokens'`, `supportsReasoningEffort: false`
- `app/src/main.js`: notice เมื่อ `stopReason === 'length'` และไม่มีคำตอบ
- probe เพิ่มเป็น 5 ไฟล์ + artifact `app/probe-request.json`, `app/probe-stream.txt`
- รากปัญหา: LLM7 cap `max_completion_tokens` ~128 → reasoning กินหมด เหลือ content ว่าง
- บันทึกไว้ใน HANDOFF ข้อ 1a และ 3 (เตือนเรื่อง session คู่ขนาน)

## 2026-11-14 — แก้เคส LLM7: reasoning กิน cap จนตอบว่าง (จบแล้ว รอ commit)
- อาการผู้ใช้: ส่ง "สวัสดี" ไปที่ llm7.io แล้วขึ้นว่าคิด แต่ไม่มีคำตอบกลับมา
- วินิจฉัยด้วยเทสต์สด + โทเคนที่บันทึกในเครื่อง (decrypt ผ่าน safeStorage ของแอป):
  - `DeepSeek-V4-Flash-0731` (ดีฟอลต์เดิม = ตัวฟรีตัวแรกของ catalog) บนเลนฟรีถูกบีบ
    output เหลือ 128 tokens; `usage.completion_tokens = 128` ทุกครั้งไม่ว่า max_tokens จะ 512/32768
    → reasoning กินครบแล้วจบด้วย finish_reason `length` → content ว่าง
  - `reasoning_effort: "minimal"` (จาก thinkingLevel ในแอป) เป็นตัวกระตุ้นอีกชั้น: ส่งแล้วว่างทันที
  - โมเดลฟรีที่ไม่คิดก่อนตอบ (gpt-oss:20b 245 tokens, codestral-latest 448, minimax-m2.7 476) ตอบครบ
- แตะไฟล์: `app/src/llm7.js` (compat + PREFERRED_FREE_MODELS/preferredLlm7Model),
  `app/src/provider-plan.js` (ดีฟอลต์ llm7), `app/src/main.js` (notice เมื่อ length + ไม่มีคำตอบ),
  `app/scripts/selftest-llm7.js`, `app/scripts/selftest-provider-plan.js`
- เทสต์: ออฟไลน์ผ่านหมด (19 ตัว; `selftest-mention-ui` ต้องเปิดแอป+DevTools ตามเดิม)
  และรัน bridge จริงด้วยโทเคนจริง: ดีฟอลต์ใหม่ `gpt-oss:20b` ตอบใน ~1 วินาที (stop=stop)
- เก็บกวาด: ลบ probe scripts/artifact ชั่วคราวทั้งหมด, กู้ `README.md` ที่ถูกลบจนว่างกลับจาก git
- สถานะ commit: **ยังไม่ commit** (รอกฎ .AGENT: ต้องขออนุญาตผู้ใช้ก่อน)

## 2026-11-14 — LLM7 รอบ 2: สลับโมเดล + ส่งซ้ำให้เองเมื่อคำตอบว่าง
- ผู้ใช้ลองจริงแล้วยังเจอ notice เดิม เพราะแท็บเดิมจำ `DeepSeek-V4-Flash-0731` ไว้ (ไม่ได้ใช้ดีฟอลต์ใหม่)
- เพิ่ม `planEmptyAnswerRetry()` / `runEmptyAnswerRetry()` ใน `app/src/main.js`:
  เทิร์นจบ `length` + ไม่มี text + โมเดล llm7 ฟรีแบบ reasoning → สลับเป็น `gpt-oss:20b`
  แล้ว `session.prompt()` ข้อความเดิมซ้ำให้ 1 ครั้ง พร้อม notice อธิบาย (จำกัด 1 ครั้ง/เทิร์นผู้ใช้)
- `app/src/llm7.js`: `llm7ModelEntries()` ส่งธง `reasoning` ออกมาด้วย (ใช้ตัดสินใจข้างบน)
- เก็บ prompt ล่าสุดของแท็บ (`tab.lastPromptText`) ตอน `prompt:send`, ล้างตอนผู้ใช้ส่งใหม่
- ตรวจ: `node --check` ผ่าน, เทสต์ llm7/plan/provider-ui/model-filter ผ่าน,
  ดูแคตตาล็อกสดแล้ว retry target = `gpt-oss:20b` (reasoning=false) ตามที่ออกแบบ
- สถานะ commit: **ยังไม่ commit** (รออนุญาต)

## 2026-11-14 — LLM7 รอบ 3: แก้ข้อสรุปให้ตรงจริง (โหมดลดทอนชั่วคราว ไม่ใช่ความยาวข้อความ)
- ผู้ใช้ท้วง: "พิมพ์ยาว ๆ แล้วเขาตอบ" → วัดซ้ำด้วยโทเคนจริง พบว่าข้อความยาวก็ล้มได้
  (`prompt=334c` → `length`, content ว่าง) และ 4 วินาทีถัดมาข้อความสั้นกลับผ่าน
- ลายเซ็นของโหมดลดทอน: `usage.prompt_tokens = 32` และ `completion_tokens = 128` เป๊ะ
  (ตอนปกติ prompt_tokens รายงานจริง เช่น 617/100/15) — เป็นฝั่ง LLM7 ไม่ใช่โค้ดแอป
- ปรับลำดับกู้: ซ้ำโมเดลเดิม 1 ครั้ง (รอ 2.5 วิ) → ถ้ายังว่างสลับเป็น `gpt-oss:20b` → ยังไม่ไหวแจ้งผู้ใช้
- แยกตรรกะเป็น `app/src/empty-answer.js` (`nextRecoveryMove`) + เทสต์ `selftest-empty-answer.js` (10 เคส)
- `app/src/main.js`: ใช้ `nextRecoveryMove`, เพิ่ม `promptSeq` กันส่งซ้ำ/ยกเลิกเมื่อผู้ใช้ส่งใหม่
- ตรวจ: `node --check` ผ่าน, `selftest-empty-answer` / `selftest-llm7` / `selftest-provider-plan` ผ่าน
- สถานะ commit: **ยังไม่ commit** (รออนุญาต)

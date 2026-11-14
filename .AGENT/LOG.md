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

## 2026-11-14 — แก้ CI แดง: ต้องใช้ Node 22
- ต้นเหตุ: `selftest-resolve-sdk` require bundled SDK ไม่ได้ใต้ Node 20
  (`fs.globSync` ไม่มี — SDK ต้อง Node 22+)
- Electron 38 = Node 22.22 → โหลด bundled SDK ได้ (ตรวจด้วย Electron จริงแล้ว)
- แก้: ci.yml + release.yml ใช้ `node-version: 22`
- เทสใต้ Node 22: 18 scripts PASS (ไม่ bump เพราะแอปไม่เปลี่ยน)

## 2026-11-14 — ผลปล่อย v0.2.6: สําเร็จ
- commit: `f382f33` (Batch A/B/C), `ff39b94` (เวอร์ชัน 0.2.6)
- release `v0.2.6` ออนไลน์; assets: NTAPI-Setup-0.2.6.exe (117.7 MB), latest.yml, blockmap
- `/releases/latest` ชี้ v0.2.6; installer โตจาก 0.2.5 (102→117.7 MB) เพราะ bundle pi SDK
- Ops (code signing) — ผู้ใช้ข้าม
- เหลือ: ผู้ใช้อัปเดตโปรแกรมทดสอบเอง

## 2026-11-14 — Batch C: typography + first-run
- C2 (accent) มีอยู่แล้วใน HEAD; C1 ยกพื้นฟอนต์ต่ำสุด 12px (35 จุด); C3 empty state 3 ปุ่ม; C4 ป้ายคิดภาษาไทย
- ไฟล์: renderer/{app.js,index.html,styles.css}; เทส 18 PASS + smoke PASS; ยังไม่ commit

## 2026-11-14 — Batch B: bundle pi SDK
- เพิ่ม SDK เป็น dependency + `resolveSdk` หา bundled ก่อน (require โฟลเดอร์ เพราะ ESM-only)
- แยก `src/sdk-path.js` + `selftest-resolve-sdk.js`; asarUnpack SDK + quickjs-wasi
- เทส 18 scripts PASS; dist บิลด์ผ่าน; installer 118.7 MB (+16); ยังไม่ commit

## 2026-11-14 — เก็บไฟล์หลุด + ทํา Polish Batch A
- ผู้ใช้เลือกเก็บงาน MCP ของผม — ลบ spec MCP ที่ซ้ำ (`2026-11-14-mcp-ui-design.md`)
- รับช่วงไฟล์จาก session "polish": system-info.js / selftest-system-info.js / run-unit-tests.js / แผน
- ทํา Batch A จบ: CI, error boundary + copy system info, focus ring, settings inert+trap, microcopy
- เทส: `npm test` 17 scripts PASS, smoke test PASS; ยังไม่ commit

## 2026-11-14 — ผลปล่อย v0.2.5: สําเร็จ
- commit: `0577f5e` (MCP Phase 1+2), `737b8a6` (เวอร์ชัน 0.2.5)
- release `v0.2.5` ออนไลน์; assets: NTAPI-Setup-0.2.5.exe, latest.yml, blockmap
- `/releases/latest` ชี้ v0.2.5 แล้ว
- ⚠️ พบ spec MCP ของ session อื่น (untracked): `docs/superpowers/specs/2026-11-14-mcp-ui-design.md`
  แนวทางต่าง (config `~/.free-pi/agent`, UI แบบ list) — ต้องให้ผู้ใช้ตัดสินใจก่อนทําซ้ำ

## 2026-11-14 — MCP Phase 2: ใช้ได้จริง (Settings + config ที่ C:\NTAPI)
- Phase 2: config ย้ายมาที่ `C:\NTAPI\mcp.json`, opt-in ปิดดีฟอลต์, Settings แท็บ MCP แก้/บันทึกได้
- ไฟล์: freepi-bridge.js, main.js, preload.js, renderer/*, selftest-mcp-config.js
- เทส: mcp-guard + mcp-config PASS, ชุดอื่น PASS, smoke test Electron PASS
- เริ่มปล่อย v0.2.5

## 2026-11-14 — MCP Phase 1: ผ่านด่านอนุมัติ
- พบว่าโปรแกรมโหลด MCP อยู่แล้ว (`createMcpExtension`); config ที่ `~/.pi/agent/mcp.json`
- เพิ่ม `isGuardedTool`/`mcpToolLabel` → MCP tools ต้องขออนุมัติ พร้อมโชว์ชื่อ server
- ไฟล์: `app/src/freepi-bridge.js`, `app/src/main.js`, `app/src/renderer/app.js`, `app/scripts/selftest-mcp-guard.js`
- เทส selftest-mcp-guard PASS; ยังไม่ commit

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

## 2026-11-14 — P0: single-instance lock (เปิด NTAPI ได้ทีละหน้าต่าง)
- **ปัญหา:** เปิดแอปซ้ำ (ไอคอน taskbar / ดับเบิลคลิก exe / installer "Run now") เปิดโปรเซสใหม่ทั้งตัว
  → หน้าต่างซ้อน, state คนละชุด, เขียนทับ session/config และ presence port ชนกัน
- **แก้:** `app/src/single-instance.js` (`focusExistingWindow` — restore ถ้าย่อ, show ถ้าซ่อน, focus)
  + `app/src/main.js`: `app.requestSingleInstanceLock()`, `app.on('second-instance')` และการ์ด
  `if (!hasSingleInstanceLock) return;` ใน `whenReady` (ตัวที่สองไม่สร้างหน้าต่าง/ไม่เปิด presence)
- เทสต์: `app/scripts/selftest-single-instance.js` (6 เคส, เขียนเทสก่อนแล้วเห็น RED ก่อน)
  → ผ่าน; `node --check` ผ่าน; ชุดออฟไลน์ 20/22 ผ่าน
  (`selftest-ui-render` ต้องรันใต้ electron, `selftest-ui` ต้องมีแอปรัน + DevTools — สภาพแวดล้อม ไม่ใช่โค้ด)
- สถานะ commit: **`efc866b`** → รวมใน v0.2.4 (release ออกที่ `NTAPI-releases` แล้ว)
- ยังไม่ได้ทดสอบเปิดซ้ำจริงบนหน้าจอ (ผู้ใช้ขอข้าม)

## 2026-11-14 — ตรวจ P1 "กล่อง thinking ถูกซ่อน" → ปิดเคส ไม่ใช่บั๊ก
- ไล่ซอร์ส SDK `@earendil-works/pi-coding-agent`: `hideThinkingBlock` ถูกใช้แค่ใน
  `AssistantMessageComponent` ของ TUI (ค่าว่าง = `false`) → ไม่มีผลกับ NTAPI ที่วาด UI เอง
- NTAPI มีครบอยู่แล้ว: `#thinkingSelect` ("การคิด: <level>", `app.js` `paintThinking`) ส่งผ่าน
  `session:thinking` → `setThinkingLevel()` และกล่อง "ดูความคิด" รับ `thinking_delta` จาก `main.js`
- สรุป: กล่องว่าง = โมเดล/เทิร์นนั้นไม่ได้ส่ง reasoning มา (ระดับ off หรือโมเดลไม่รองรับ) ไม่ใช่แอปพลาด
- ตัดสินใจ: ไม่แก้โค้ด; ปิด P0 ชื่อเจ้าของหน้า About ตามคำสั่งผู้ใช้ (ไม่เก็บเป็นงานค้าง)

## 2026-11-14 · v0.3.0
- browser control (MV3 + ws bridge 51789), 13 tools, approval gate
- auto-switch ไป DeepSeek ฟรีตัวถัดไปเมื่อ limit แล้ว `agent.continue()` ต่อจากเดิม
- error catalog 2 ภาษา (80 keys) — main ส่ง key, renderer แปล
- fix: กล่อง error ไม่กาง/ไม่เลื่อนจอเอง (Q1)
- ปล่อย v0.3.0 แล้ว: tag v0.3.0, release ที่ NTAPI-releases (published 2026-11-14T04:21:18Z), assets NTAPI-Setup-0.3.0.exe 112MB + latest.yml
- v0.3.1: update splash (แยกโปรเซส) + overlay เต็มจอ + toast หลังอัปเดต; เจอบั๊ก disableHardwareAcceleration เรียกหลัง ready ทำให้ splash ตายเงียบ แก้แล้ว

## 2026-11-14 · v0.3.3

- ปล่อย v0.3.3: bump `app/package.json`, commit `chore(release): v0.3.3`, tag `v0.3.3` push แล้ว (CI build + ปล่อย NTAPI-Setup-0.3.3.exe เอง)
- สรุปงานในชุดนี้: Q5 หน่วยเวลา 2 ภาษา, Q6 fallback ไล่โมเดลจริง, UI (banner/dialog/sidebar/tool card), หน้าติดตั้ง NSIS มีแบรนด์, และบั๊กสคริปต์ 404 ของ renderer
- **Q5 (2026-11-14)**: `src/duration.js` + `selftest-duration.js` — หน่วยเวลาไทย (วินาที/นาที/ชม.) อังกฤษ (sec/min/h); tool card ใช้ `formatSpan()` แทน `${ms} ms`; countdown ใช้โหมด decimals:0 (ไม่ขึ้น "0 นาที" อีก); npm test 27/27
- **rule**: AGENTS.md เพิ่มข้อ "ไม่ต้อง build/ปล่อย installer ให้ล่าสุดเอง — ผู้ใช้สั่งเท่านั้น"

- UI (2026-11-14): error banner ได้ gutter 22px เหมือนบล็อกอื่น (`calc(var(--read-width) - 44px)` + padding 11px 14px) — เดิม `padding: 8px 12px` ทับ inset ของ `.transcript > *` จึงชิดขอบ
- UI: dialog ควบคุมเบราว์เซอร์ — แถว helper (`wrap` + `flex: 1 1 auto`), footer แยกซ้าย/ขวา (`space-between`), `.browser-dialog` scroll ได้ (`max-height: calc(100vh - 48px)`) ไม่โดนตัดปุ่มล่าง; เทสต์เพิ่มใน selftest-error-ux (npm test 28/28)
- Q6 (แก้ model fallback ให้ไล่จริง): `failedModelFromMessage()` + `switchToNextFreeModel(tab, failed)` เลิกใส่ `tried` ให้โมเดลที่เพิ่งสลับไป (ทำให้ข้ามตัวทุกครั้ง); `auto_retry_start` แค่ยกเลิก backoff หยุดรอ 14 วิ (ไม่สลับตรงนั้น เพราะ retry ใช้โมเดลที่ capture ไว้ + abortRetry ต้องรอ microtask) — runModelFallback ที่ settle เป็นคนสลับและ `continue()`; ยังคงลองเรื่อยๆ จนหมด pool แล้วค่อยแจ้ง (ตามที่ผู้ใช้ขอ)
- **บั๊กใหญ่ (2026-11-14)**: `index.html` อ้าง `error-messages.js` / `duration.js` แต่ไฟล์อยู่ที่ `src/` ไม่ใช่ `src/renderer/` → 404 เงียบๆ ทั้งคู่ (FPDuration/FPMessages ไม่ถูกตั้งค่า)
  - อาการที่ผู้ใช้เห็น: เวลายังเป็น ms ทั้งที่เลือกไทย; และข้อความ error/notice ของ Q3 ไม่เคยถูกแปล (ตกไปใช้ key ดิบ)
  - แก้: `<script src="../error-messages.js">` + `../duration.js`
  - แก้ต่อ: ทั้งสองไฟล์ประกาศ `const api` ระดับบนสุด → "Identifier 'api' has already been declared" สคริปต์ที่สองไม่รัน; ครอบ IIFE แบบเดียวกับ markdown.js/provider-ui.js
  - เทสต์กันซ้ำ: `selftest-duration.js` ตรวจว่า script/link ทุกตัวใน index.html มีไฟล์จริง + ต้องเป็น IIFE; เพิ่ม `scripts/check-duration-wiring.js` (Electron) พิสูจน์ผลจริง
  - หน่วยมิลลิวินาที: th = "มิลลิวินาที", en = "ms"
## 2026-11-14 · FreePi ตอบ 426 upgrade_required — แก้ที่ต้นเหตุ + bump 0.3.4

**อาการผู้ใช้:** ใช้งาน FreePi ไม่ได้ ขึ้น "ไคลเอนต์เวอร์ชันเก่าเกินไป — รัน `npx free-pi-cli@latest`"
(HTTP 426 · upgrade_required) ทั้งที่ CLI บนเครื่องเป็น 0.6.21 ซึ่งเป็นเวอร์ชันล่าสุดแล้ว

**รากปัญหา (3 ชั้น ซ้อนกัน):**
1. `FALLBACK_CLIENT_VERSION = '0.6.20'` ต่ำกว่า `min` ที่ backend ประกาศ (ตอนนั้น 0.6.21)
2. `const CLIENT_VERSION = detectClientVersion()` แช่แข็งค่าตอน module load
   → อัปเดต CLI ระหว่างเปิดแอปไม่มีผลจนกว่าจะรีสตาร์ต
3. `AppData\Roaming\npm` มี free-pi-cli 0.6.19 ค้างอยู่ และ detection เดิมเลือกค่าที่ "สูงสุด"
   แต่ไม่มีการกันค่าที่ต่ำกว่า min ของ backend เลย

**แก้ (ผู้ใช้เลือกแนว A เต็มรูปแบบ):**
- ไฟล์ใหม่ `src/client-version.js` — detection เรียกใหม่ทุกครั้ง (ไม่แช่แข็ง), มี
  `CLIENT_VERSION_FLOOR = '0.6.21'` กันส่งเลขที่ backend ปฏิเสธแน่นอน,
  `resolveClientVersionFloor()` ถาม `/client-version` ตอนเปิดแอป (ขยับขึ้นอย่างเดียว
  ออฟไลน์ไม่พัง), `upgradedClientVersion()` สำหรับกู้หลังโดน 426, `isUpgradeRequired()`
- `src/freepi-bridge.js` — ลบ detector เดิม, `currentClientVersion()` แทนทุกจุดที่ใช้ header,
  เพิ่ม `handle.refreshClientVersion()` (re-register provider ด้วย header ใหม่)
- `src/main.js` — เรียก `resolveClientVersionFloor()` ตอน `whenReady()` (fire-and-forget
  ไม่หน่วงหน้าต่าง), กู้ 426 อัตโนมัติครั้งเดียวต่อแท็บใน `reportTabError`
- `scripts/run-unit-tests.js` + `scripts/selftest-client-version.js` (ใหม่, 29 checks)

**เทสต์:** `cd app && npm test` → PASS 33/33 (เพิ่ม 1 สคริปต์)
**ยืนยันกับของจริง:** `/client-version` ตอบ `{min: 0.6.21, latest: 0.6.21}`; bridge ส่ง 0.6.21
ผ่านแล้ว; จำลอง backend ในอนาคต (min 0.8.0) บนเครื่องไม่มี CLI → ส่ง 0.8.3 ได้เองโดยไม่อัปแอป

**bump + ปล่อย:** `app/package.json` 0.3.3 → **0.3.4** — commit `56efa0f` บน `master` (cherry-pick จากสาขา
browser-agent เพื่อไม่ให้ฟีเจอร์ที่ยังไม่ทดสอบ Chrome หลุดออกไป), tag `v0.3.4`, GitHub Actions ปล่อยขึ้น
`NTAPI-releases` แล้ว (assets: NTAPI-Setup-0.3.4.exe 113 MB + latest.yml + .blockmap)

**ยังค้าง:** `browser-extension/popup.js` + `selftest-browser-popup.js` (งาน session ก่อน),
ทดสอบ browser agent mode กับ Chrome จริง

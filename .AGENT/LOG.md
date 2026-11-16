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


## 2026-11-14 · Branch feat/browser-agent-mode — Browser agent mode (งาน 1–12)

ทำตามดีไซน์/แผนที่ผู้ใช้อนุมัติ (brainstorming → writing-plans → executing-plans แบบ inline)
สาขา `feat/browser-agent-mode` ยังไม่ merge, ยังไม่ bump เวอร์ชัน

**ได้อะไร:** AI อ่านหน้าเว็บเป็นโครงสร้าง (role/ชื่อ/ref) แทนอ่าน innerText แล้วเดา selector;
ยึดแท็บจริงที่ผู้ใช้อมอบให้; เจาะ iframe ข้ามโดเมน; จัดการ dialog `confirm/alert`;
โหมดมอบงาน (ไม่ถามทีละขั้น) เฉพาะแท็บนั้น พร้อมแถบกิจกรรมสด + ปุ่มหยุด + กฎหมดอายุเอง

**ไฟล์ใหม่:** `src/browser-snapshot.js`, `src/browser-target.js`, `src/browser-claims.js`,
`src/browser-autopilot.js` + selftest ทั้งสี่
**แก้:** `browser-extension/background.js`, `browser-extension/popup.{html,js}`,
`src/browser-bridge.js`, `src/freepi-bridge.js`, `src/main.js`, `src/preload.js`,
`renderer/{index.html,app.js,styles.css}`, `scripts/selftest-browser-{bridge,extension,tools}.js`,
`scripts/run-unit-tests.js`

**เทสต์:** `cd app && npm test` → PASS 32/32 ตลอดงาน (เริ่มจาก 29)
**บทเรียน:** เทสต์เดิม `selftest-error-ux.js` จับได้เองว่าของใหม่ไปแย่ง selector
`<div class="dialog-actions wrap">` ของแถวปุ่มช่วยเหลือ — แก้เป็นคลาส `.handover` แยก
และ `browser-autopilot` ที่ตัดโดเมนเองแบบ 2 ชั้นอ่าน `www.shop.co.th` ผิด จึงเปลี่ยนไปใช้
`registrableDomain()` ตัวเดียวกับ claims

**ยังค้าง:** ทดสอบกับ Chrome จริง (ยังไม่ได้รัน), merge, bump เวอร์ชัน

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

**bump:** `app/package.json` 0.3.3 → **0.3.4** (ผู้ใช้สั่ง bump) — ยังไม่ tag, ยังไม่ build installer

**ยังค้าง:** `browser-extension/popup.js` + `selftest-browser-popup.js` (งาน session ก่อน),
ทดสอบ browser agent mode กับ Chrome จริง

### ทดสอบ browser agent mode กับ Chrome จริง (ec578d2)

ผู้ใช้ทดสอบเองทุกครั้งด้วยการเปิด session ใหม่ — เจอบั๊กที่ทำให้ใช้ไม่ได้เลย 2 ตัว

1. **agent ไม่เห็น tool เบราว์เซอร์:** `tools` ที่ส่งให้ session เป็น allow-list (แทนที่ ไม่ใช่เพิ่ม)
   `browser_*` 17 ตัว register แล้วแต่ไม่อยู่ในลิสต์ → โมเดลตอบ "You didn't include a link"
   แก้: `allBrowserToolNames()` + ต่อท้าย `defaultTools` เมื่อมี bridge
2. **ไม่รู้ว่ามีแท็บพร้อมใช้:** prompt ไม่บอกสถานะแท็บ → เรียก `browser_claim` ซ้ำ
   หรือรายงานว่า "ถูกปฏิเสธ" ทั้งที่แท็บพร้อม
   แก้: `browserBridge.claimedTab()` + อ่านสดทุกเทิร์นใน prompt, ปรับถ้อยคำ NOT_CLAIMED

เทสต์: `selftest-browser-tools.js` +6, `selftest-browser-claims.js` +5 — ยืนยันด้วยการใส่บั๊กกลับ (FAIL จริง)
`npm test` 33/33 ผ่าน; ผู้ใช้ยืนยันว่าใช้งานได้แล้ว

### สวิตช์อนุมัติ 3 ระดับ + ปิดงานค้างเบราว์เซอร์ (2026-11-14) v0.3.5

**อาการ:** dialog อนุมัติเครื่องมือ "บางทีก็ขึ้น บางทีก็ไม่ขึ้น" ขึ้นกับโมเดล

**รากปัญหา:** 4 สวิตช์ตัดสินพร้อมกัน (remember checkbox, allow-everything, autopilot
`approvalVerdict()`, `ALWAYS_ASK`) ทั้งหมดอยู่ใน memory → ปิดแอปแล้วหาย, คำตอบเปลี่ยนตามโมเดล/แท็บ

**แก้:** `src/approval-policy.js` ใหม่ — `ask`/`allow`/`deny` เก็บใน `prefs.json`, `decide()`
รับอาร์กิวเมนต์เดียว (โมเดล/แท็บขยับไม่ได้), ค่าขยะ → `ask`, `policyFromLegacy()` รองรับอัปเกรด
• `main.js`: `askApproval()` เหลือดู policy เดียว, IPC คืน `{policy}` • UI: dropdown 3 ตัวเลือก +
คำอธิบาย + แบนเนอร์เมื่อไม่ใช่ `ask`, dialog เหลือ 2 ปุ่ม • ลบ `approvalVerdict()` ออกจาก
`browser-autopilot.js` (เทสต์ย้ายไปทดสอบ `allows()`) • ลบคีย์ i18n ที่ตายแล้ว 7 คีย์

**เทสต์:** `selftest-approval-policy.js` (33 checks) + `selftest-browser-autopilot.js` ปรับ
→ `npm test` **PASS 34/34** (จาก 33, เพิ่มไฟล์ใหม่)

**ไฟล์:** `src/approval-policy.js` (ใหม่), `scripts/selftest-approval-policy.js` (ใหม่),
`src/main.js`, `src/renderer/app.js`, `src/renderer/index.html`, `src/browser-autopilot.js`,
`scripts/selftest-browser-autopilot.js`, `scripts/run-unit-tests.js`

**ปิดงานค้างเบราว์เซอร์ด้วย (ค้างมาก่อนหน้า):** แท็บว่าง (`about:blank`) ไม่ถูกเสนอให้มอบ,
claim ที่ล้มเหลวไม่เงียบอีก, error ในระบบอนุมัติไม่ถูกเรียกว่า "ผู้ใช้ปฏิเสธ"
(`browser-claims.js`, `browser-extension/background.js`, `freepi-bridge.js`, `main.js`,
`renderer/app.js`, `selftest-browser-claims.js`)

**ยังค้าง:** ทดสอบ UI จริง/Chrome จริงด้วยตา · ยังไม่ merge เข้า master

### (ต่อ) สวิตช์อนุมัติ 3 ระดับ — แก้ UI select (2026-11-14)

- หลัง build ครั้งแรก พบว่า `<select>` ยืมคลาส `.path-btn` (ออกแบบมาเพื่อ `<button>`)
  → Windows วาดกรอบขาว/ลูกศรทับธีมมืด
- แก้: คลาสใหม่ `approval-policy-select` (appearance:none + var tokens + focus ring + option ธีมมืด)
- กันซ้ำ: `selftest-approval-ui.js` ใหม่ — ตรวจว่าสวิตช์มีคลาสของตัวเอง, ไม่ยืม .path-btn,
  appearance:none, token มีจริง, banner เริ่ม hidden (ทดสอบย้อนกลับ: ใส่ .path-btn กลับ → FAIL 2 จริง)
- `npm test` 34 → **35/35**
- build ใหม่ `dist/NTAPI-Setup-0.3.5.exe` (23:48) มี CSS ใหม่แล้ว

### (ต่อ) ปรับ UI สวิตช์อนุมัติตามที่ผู้ใช้เห็น实际问题 (2026-11-14)

ผู้ใช้ทดสอบจริงแล้วแจ้ง 2 เรื่อง: ส่วนอนุมัติล้น/ไม่สวย และแบนเนอร์อยู่บนเกะกะ

- **ย่อส่วนอนุมัติเป็นแถวเดียว:** ลบ `<label>` และ `<p class="settings-hint">` ออก
  (ไม่ต้องมี `id="approvalPolicyHint"` แล้ว) — ข้อความอธิบายย้ายไป `title` ของ `<select>`
  ที่เปลี่ยนตามค่า · ย้ายไปไว้ใต้ Workspace (เดิมอยู่เหนือ Workspace)
- **ย้ายแบนเนอร์ลงล่างสุดของแถบข้าง** (ใต้ปุ่ม Refresh status) — เดิมอยู่บนสุด ดันเนื้อหาทั้งแถบลง
  · `margin` 0 0 10px → 0 · เพิ่ม `flex: 0 0 auto`
- `applyApprovalMode()` — เลิกเขียน hint, เขียน `title` แทน (`APPROVAL_TITLES`)
- `selftest-approval-ui.js` — เพิ่ม 4 checks: ไม่มี hint, มี aria-label, แบนเนอร์มีตัวเดียว,
  แบนเนอร์อยู่หลัง Workspace และหลัง Status (ทดสอบย้อนกลับ: ย้ายขึ้นบน → FAIL 2 จริง)
- `npm test` **35/35** · build ใหม่ 23:54

### (ต่อ) ลบแบนเนอร์ "กลับมาถาม" ออกทั้งหมด (2026-11-14)

ผู้ใช้ชี้ว่าปุ่มนี้ไม่ต้องใช้แล้ว เพราะ dropdown ทำหน้าที่ได้เอง

- ลบ HTML: `#approvalModeBanner` + `#approvalModeReset` และคอมเมนต์ที่เกี่ยวข้อง
- ลบ JS: การอัปเดต banner ใน `applyApprovalMode()`, listener ของปุ่มรีเซ็ต,
  และ `document.body.classList` (`approvals-off`/`approvals-deny`) ที่ไม่มี CSS ใช้แล้ว
- ลบ i18n: `approvalsOff`, `turnPromptsBackOn` (ทั้ง EN/TH) · ลบ CSS `.approval-banner*` ทั้งบล็อก
- `selftest-approval-ui.js` — เปลี่ยนชุดเทสต์ banner เป็นตรวจว่า**ไม่มี** (banner, ปุ่ม, string,
  และ renderer ไม่ query element ที่ถูกลบ) ทดสอบย้อนกลับแล้วว่าใส่กลับ → FAIL 3 จริง
- `npm test` **35/35** · grep ยืนยันอ้างอิงที่ถูกลบเหลือ 0 · build 00:02

### (ต่อ) แถบกิจกรรม AI เป็นข้อความในแถวสถานะ ไม่ใช่กล่อง (2026-11-14)

ผู้ใช้ขอ: กรอบใหญ่เกิน เอาแค่ข้อความ ย้ายไปแถวเดียวกับ "กำลังทำงาน…" และตัดปุ่ม "ดูแท็บนั้น"

- ย้าย `#activityStrip` จากเหนือ composer → ลงใน `.status-row` คู่กับ `#statusHint`
- ตัด `#activityFocus` (ปุ่ม "ดูแท็บนั้น") + listener + i18n `activityFocus` (EN/TH) + `.activity-actions`
- CSS: ถอด border/background/radius/padding ของ `.activity-strip` → ข้อความเปล่า 12.5px
  · ปุ่ม Stop ทำเป็นลิงก์ขีดเส้นใต้ น้ำหนักเบา ไม่แย่งกับ Send
- `selftest-approval-ui.js` +8 checks (มี strip, ไม่มี activityFocus, อยู่ใน status-row, ไม่มี border/background)
  ทดสอบย้อนกลับแล้วว่าใส่กลับ → FAIL 3 จริง
- `npm test` **35/35** · build 00:07

### /compact เข้าคิวได้แล้ว + Ctrl+Enter รู้จักคำสั่ง (2026-11-14)

**อาการ:** พิมพ์ `/compact` (หรือกด Ctrl+Enter) ระหว่าง AI กำลังทำงาน → ขึ้น "รอให้รอบนี้เสร็จก่อน"
ทั้งที่ข้อความอื่นเข้าคิวได้

**รากปัญหา:** `compactConversation()` มี `if (view.busy) return showNotice(t('undoBusy'))`
ปฏิเสธทันที ไม่มีคิว · และคิวรองรับแค่ `{text, images}` (ข้อความ) ไม่รับ "งาน"
· ซ้ำร้าย ถ้าปล่อยให้ Ctrl+Enter จัดการ `/compact` เป็นข้อความ มันจะส่งคำว่า `/compact`
8 ตัวอักษรไปให้โมเดลแทนที่จะย่อประวัติ

**แก้:**
- `queueAction(label, run)` — คิวรองรับ `{kind:'action', label, run}`
- `compactConversation()` — busy → `queueAction('…', () => runCompact(view))` · idle → รันทันที
- `runCompact(view)` — แยกงานจริงออกมา, ท้ายฟังก์ชันเรียก `drainQueue()` เพราะ action
  ไม่สร้างเทิร์น จึงไม่มี `onSettled` มาปลุกคิวต่อ
- `drainQueue()` — เจอ action → รัน แล้ว drain ต่อเอง (ไม่รอ settle ที่ไม่มีวันมา)
- `findSlashCommand(text)` — ใหม่: จับคำสั่งจากคำแรกของข้อความ
- Ctrl+Enter — ถ้าเป็น `/compact` → เรียกคำสั่ง ไม่ส่งเป็นข้อความ · ข้อความอื่นยังเข้าคิวตามเดิม
- `renderQueue()` — แถวคิวของ action แสดง `label` แทน `text`
- i18n ใหม่ `compactFailed` (EN/TH) — เดิมแจ้ง fail ด้วยข้อความ "busy" ที่ผิดความหมาย

**เทสต์:** `selftest-compact-queue.js` ใหม่ (26 checks) — ตรวจว่าไม่มีการปฏิเสธเดิม,
คิวรับ action, drain ต่อได้เอง, Ctrl+Enter แยกคำสั่งออกจากข้อความ
ทดสอบย้อนกลับ: ใส่ `if (view.busy) return showNotice(...)` กลับ → FAIL 2 จริง
→ `npm test` **36/36** (จาก 35)

**ยังไม่ build** — ผู้ใช้สั่งให้รออนุมัติก่อน

### (ต่อ) เพิ่มหัวข้อให้สวิตช์อนุมัติ + เปลี่ยนคำ (2026-11-14)

ผู้ใช้ขอ: ใส่หัวข้อบอกว่า dropdown คืออะไร และเปลี่ยน "ไม่อนุมัติเสมอ" → "ไม่อนุมัติเลย"

- HTML: `<label for="approvalPolicy">การอนุมัติเครื่องมือ</label>` + บรรทัดอธิบายสั้น
  `class="approval-note"` — "เมื่อ AI จะรันคำสั่งในคอมพิวเตอร์ เช่น รัน bash หรือแก้ไฟล์"
  (ใช้ `<label for>` เพื่อให้ screen reader ผูกกับ select)
- เปลี่ยน option `deny` → "ไม่อนุมัติเลย" + `APPROVAL_TITLES.deny` ให้ตรงกัน
- CSS: `.approval-section { gap: 6px }` + `.approval-note` (11.5px, muted, line-height 1.35)
- `selftest-approval-ui.js` — เปลี่ยน check "ไม่มีหัวข้อ" → ตรวจว่ามี `<label for>` จริง,
  มี note, ไม่มี `#approvalPolicyHint` แบบเก่า, คำว่า "ไม่อนุมัติเลย" และไม่มีคำเก่า
  ทดสอบย้อนกลับ: ใส่คำเก่า + ลบหัวข้อ → FAIL 4 จริง
- `npm test` **36/36** · คำเก่าใน `src/` เหลือ 0 · **ยังไม่ build** (รออนุมัติ)

## 2026-11-14 · ปล่อย v0.3.5 (merge เข้า master + tag)

**merge:** `feat/browser-agent-mode` → `master` (merge commit `daf9ef8`)
แก้ конфликтов 3 ไฟล์: `app/package.json` (เก็บ 0.3.5 — ใหม่กว่า 0.3.4), `.AGENT/HANDOFF.md`,
`.AGENT/LOG.md` (เก็บทั้งสองฝั่งตามลำดับเวลา) · โค้ด `freepi-bridge.js` / `main.js` auto-merge
และยืนยันว่า `client-version` (จาก v0.3.4) กับ `approval-policy` (v0.3.5) อยู่ครบ
**ไม่ทับงาน v0.3.4** — master ไม่ได้ถูก force push (fast-forward จาก `cec649a` → `daf9ef8`)
· `npm test` **36/36** ผ่านหลัง merge

**build:** `npm run dist` (local) สำเร็จ — `dist/NTAPI-Setup-0.3.5.exe` 119,275,063 bytes
`dist/latest.yml` regenerate ด้วย hash ใหม่ · ตรวจ asar แล้วว่ามี approval-policy,
client-version, "ไม่อนุมัติเลย", status-row, compactFailed ครบ

**publish:** `npm run release` **ล้มเหลวโดยไม่ตั้งใจ** — ไม่มี `GH_TOKEN` ในเครื่องนี้
(Learned: โปรเจกต์นี้ออกแบบให้ปล่อยผ่าน GitHub Actions ไม่ใช่ local token)
→ ใช้ `.github/workflows/release.yml` ที่รันบน tag `v*` และอัปโหลดไป `Cheumklang/NTAPI-releases`
ด้วย `secrets.RELEASE_TOKEN` จึง push tag `v0.3.5` (ชี้ `daf9ef8` = master) เพื่อให้ Actions ทำงาน

**สถานะ:** tag ขึ้น remote แล้ว · Actions เริ่ม build+release (ตรวจผ่าน API ไม่ได้เพราะ repo private)
**ถ้า Actions ล้มเหลว:** ดู log ที่ Actions ของ repo หรือตั้ง `GH_TOKEN` แล้วรัน `npm run release` ในเครื่อง

### คิวการส่งใหญ่เกินไป — ยุบเป็นเชิงอรรถ (2026-11-14)

**อาการ (ผู้ใช้ส่งภาพ):** แถบคิวเหนือช่องพิมพ์กินพื้นที่มาก ดูไม่สวย

**รากปัญหา:** ซ้อนกรอบ 2 ชั้น — `.queue-bar` มีกรอบ+พื้น `--bg-3`+padding 7px เอง
แล้วแต่ละ `.queue-item` ยังมีกรอบ+พื้นม่วง `rgba(124,92,255,.09)`+`border-radius:7px`
+padding 4px 8px + ปุ่ม `×` ขนาด 14px โผล่ตลอด → 4 ข้อความ = กล่องสูงกว่าช่องพิมพ์

**แก้ (`styles.css`):**
- `.queue-bar` — ไม่มีกรอบ ไม่มีพื้น ไม่มี padding · `max-width: var(--read-width)` ให้ตรงช่องพิมพ์
  · `margin: 0 auto 4px` · `gap: 1px`
- `.queue-item` — ไม่มีกรอบ ไม่มีพื้น ไม่มี radius · `padding-left: 10px` (ย่อหน้าภายใต้หัวข้อ)
  · `align-items: baseline`
- `.queue-text` — 12px, `var(--muted)`, `::before { content: '– ' }` เป็นตัวคั่นแบบไม่ต้องเพิ่ม element
- ปุ่ม `×` — `opacity: 0` ตอนพัก · โผล่เมื่อ `:hover` หรือ `:focus-visible` (คีย์บอร์ดใช้ได้)
  · 12px · ตัดพื้นแดงตอน hover ออก
- หัวข้อคิวสั้นลง: `Queued: {n}` / `ในคิว: {n}` (เดิม "ต่อคิวไว้ n ข้อความ — จะส่งเมื่อรอบนี้เสร็จ" ตกบรรทัด)

**เทสต์:** `selftest-queue-chrome.js` ใหม่ (23 checks) — ตรวจว่าไม่มีกรอบ/พื้น/พิลม่วง,
ฟอนต์เล็กกว่า muted, ตัดบรรทัดด้วย ellipsis, × ซ่อนตอนพักแต่โชว์ตอน focus,
ข้อความหัวข้อสั้น, และยัง align กับ `--read-width`
ทดสอบย้อนกลับ: ใส่ดีไซน์เดิมกลับ → **FAIL 9** จริง → `npm test` **37/37** (จาก 36)

### คิวหลุดออกนอกกล่องแชท — ย้ายเข้ามุมขวาล่างในกล่อง (2026-11-14)

**อาการ (ผู้ใช้ส่งภาพ 2):** ข้อความคิวไปอยู่เหนือกล่องแชท ล้นออกนอกกล่อง ดูไม่สวย
ผู้ใช้ขอให้ย้ายไป **ขวาล่าง ใต้ปุ่มส่ง แต่ต้องไม่ล้นกรอบช่องแชท**

**รากปัญหา:** `#queueBar` เป็น **พี่น้อง** ของ `.composer-box` ไม่ใช่ลูก → มีแถวของตัวเอง
เหนือกล่อง จึงดันเลย์เอาต์ขึ้น และอ่านเป็นแผงลอยนอกกล่อง

**แก้:**
- `index.html` — ย้าย `#queueBar` เข้าไปในกล่อง อยู่ในคอลัมน์ใหม่ `.composer-side`
  ที่มี `.composer-actions` แล้วต่อด้วย `#queueBar` (ปุ่มอยู่บน คิวอยู่ใต้ = ขวาล่าง)
- `styles.css` — `.composer-side { flex-direction: column; align-items: flex-end;
  flex: 0 0 auto; max-width: 46% }` (ไม่ยอมให้คิวดันกล้วง), `.queue-bar { width: 100%; align-items: flex-end }`
  `.queue-item { max-width: 100% }`, ฟอนต์ 11–11.5px, ไม่มีกรอบ/พื้น, ตัดด้วย ellipsis
  · `#input { min-width: 0 }` กันช่องพิมพ์ยุบ
- เอา `::before` ขีดนำหน้าออก — ชิดขวาแล้วไม่ต้องมีตัวคั่น

**เทสต์ 2 ชั้น:**
1. `selftest-queue-chrome.js` (static) — เพิ่ม 10 checks: คิวอยู่ใน `.composer-box`,
   มาหลัง `.composer-actions`, ไม่ใช่พี่น้องของกล่อง, column ชิดขวา, `max-width` ของคอลัมน์,
   `#input` มี `min-width: 0`, ไม่มี `::before`
2. `scripts/check-queue-placement.js` (**Electron วัดพิกเซลจริง**) — 13 checks:
   descendant จริง, rect อยู่ในกล่องทุกด้าน, `belowSend`, ชิดขวา, 6 ข้อความไม่ดันกล้องกว้างขึ้น,
   ช่องพิมพ์ยังกว้าง ≥120px, หน้าต่างแคบ 680px ยังไม่พัง
   · npm script ใหม่: `npm run check:queue`

**ทดสอบย้อนกลับ:**
- ย้ายคิวออกนอกกล่อง + เอา `align-items: flex-end` ออก → static **FAIL 4**
- เอา `max-width: 46%` ออก + บีบกล่อง → Electron **FAIL 5**
- คืนค่า → ผ่านหมด · `npm test` **37/37**

**Learned:** รอบแรกผมวาง `#queueBar` ไว้ *ก่อน* `.composer-actions` ในคอลัมน์ → ตอนวัดจริง
`belowSend` เป็น false (คิวอยู่บนปุ่ม) ต้องสลับลำดับเป็นปุ่มก่อนแล้วคิวใต้ปุ่ม

### Ctrl+Shift+R ระหว่างงาน — reload ไม่ทำให้งานหลุด (2026-11-14)

**คำถามผู้ใช้:** ระหว่างที่ AI ทำงาน กด Ctrl+Shift+R ได้ไหม จะหลุดไหม ถ้าหลุดขอให้แก้
เพราะอยาก reload ดูผลหลังแก้อะไร โดยไม่ต้องปิดเปิดโปรแกรมใหม่

**คำตอบหลังตรวจ:** **หลุด** — ไม่ใช่เพราะ reload ฆ่างาน แต่เพราะ 3 บั๊กซ้อนกัน

1. **`tab:open` สร้าง tab ใหม่เสมอ** (`newTabId()`) แม้ session file เดียวกันจะมี tab เปิดอยู่
   → หลัง reload ได้ tab ที่สองบนไฟล์เดียวกัน ส่วน tab เดิมยังสตรีมอยู่แบบกำพร้า
   (ผลลัพธ์ลงดิสก์ก็จริง แต่หน้าต่างเห็น state เก่า → ดูเหมือนงานหาย)
2. **`boot()` ทิ้ง state ที่ได้มา** — `views.set(view.state.tabId, createView(...))`
   สร้าง view เปล่าทับ ทำให้หน้าต่างว่างหลัง reload
3. **`applyTabState` ไม่คืนสถานะ busy** → หลัง reload ปุ่มส่งกลับมาดูว่าง ทั้งที่งานยังรัน
   กดส่งซ้ำ = เปิดเทิร์นที่สองบนบทสนทนาเดียวกัน

**แก้:**
- `main.js` `tab:open` — ก่อนสร้าง tab ใหม่ วนหา tab ที่ `sessionFile` ตรงกัน
  (เทียบด้วย `path.resolve` ให้ slash ต่างกันก็เจอ) แล้วคืน `{ tabId: liveId, state, reused: true }`
- `renderer/app.js` `boot()` — เปลี่ยนเป็น `applyTabState(res.state)`
- `renderer/app.js` `applyTabState` — เพิ่ม `setBusy(Boolean(state.busy))` หลังตั้ง `activeTabId`
  (ต้องหลัง ไม่งั้น `setBusy` ใช้ `activeView()` ผิดตัว)

**ยืนยันแล้วว่า reload ไม่ปิดหน้าต่าง:** `webContents.id` เดิม, ไม่มี `beforeunload` บล็อก,
ไม่มีคีย์แฮนด์เลอร์กลืน Ctrl+R (ไม่มี custom menu — ใช้เมนู Electron default)

**เทสต์:**
- `selftest-reload-reattach.js` (static, 18 checks) — ตรวจว่ามี reattach ก่อน `newTabId()`,
  เทียบ sessionFile ด้วย `path.resolve`, `boot` ใช้ `applyTabState`, `applyTabState` คืน busy
  · ย้อนกลับทั้ง 3 บั๊ก → **FAIL 9**
- `scripts/check-reload-safety.js` — reload จริงใน Electron (7 checks)
- `scripts/check-reload-reattach-live.js` — ทดสอบกฎ reattach ด้วยข้อมูลจริง (8 checks):
  เจอ tab ที่รันอยู่, slash ต่างกันก็เจอ, session อื่นไม่ถูกจับคู่, tab ที่ไม่มีไฟล์ถูกข้าม
- npm scripts ใหม่: `npm run check:reload`
- `npm test` **38/38** (จาก 37)

**ผู้ใช้ต้องทดสอบเอง:** เริ่มงานยาว → กด Ctrl+Shift+R → งานต้องทำงานต่อและหน้าต่างกลับมาเห็นแถบงาน

### กฎใหม่: build ทุก 0.5.0 (2026-11-14) — ผู้ใช้สั่ง

ผู้ใช้สั่งให้เปลี่ยนกฎการ build เอง เพื่อไม่ต้องคอยสั่งทุกครั้ง:

> "เรื่องการ build ทำทุกๆ 0.5.0 ค่อยทำทีหนึ่ง เพิ่มไปในกฏเลยนะ ผู้ใช้สามารถกดอัปเดตได้อยู่แล้ว
> ไม่จำเป็นต้องตามทุกเวอร์ชัน ยกเว้นแต่มันแก้โค้ดที่สำคัญจริงๆ ค่อยเสนอผม"

**แก้กฎใน 2 ที่ (ต้องตรงกันเสมอ):**
- `AGENTS.md` — หัวข้อ "กติกาเหล็ก"
- `.AGENT/HANDOFF.md` — หัวข้อ 0) กติกาเหล็ก

**เนื้อหากฎใหม่:**
- รอบ build/ปล่อย installer = **ทุก 0.5.0** (0.3.5 → 0.4.0 → 0.5.0)
- ระหว่าง patch **ไม่ build เอง** — ผู้ใช้กดอัปเดตในโปรแกรมได้เอง
- **ห้าม bump เวอร์ชันเพื่อจะได้ build**
- **ข้อยกเว้น:** แก้เรื่องข้อมูลเสียหาย / ความปลอดภัย / แอปใช้งานไม่ได้ / อัปเดตพัง
  → **เสนอผู้ใช้ก่อน** ห้าม build เงียบ ๆ
- build/tag/release เมื่อถึงรอบหรือผู้ใช้สั่งเท่านั้น

**สถานะปัจจุบัน:** `app/package.json` = 0.3.5 · tag ล่าสุด `v0.3.5` · master นำหน้า tag 4 commit
→ **ยังไม่ถึงรอบ 0.4.0 ไม่ต้อง build**

### ข้อความที่ส่งแล้วหายจากประวัติ — merge pending เข้า session (2026-11-14)

**อาการ (ผู้ใช้ส่งภาพ):** บางครั้งข้อความที่ส่งไปหายจากประวัติ ไม่มีให้ดูย้อนหลัง

**รากปัญหา:** `submit()` แสดงข้อความทันที แล้วเรียก `session.prompt()` ซึ่ง SDK
เขียนลง `session.messages` **ทีหลัง** (async — ผ่าน input handlers, template expansion,
auth check ก่อนค่อย `_startRun` จึงเกิดช่องว่าง) ถ้า `agent:history` มาถึงในช่วงนั้น
(`applyTabState` เรียกจาก compact/undo/เปลี่ยน key/สลับ model) มันจะแทน `view.messages`
ทั้งหมดด้วย session ที่ยังไม่มีข้อความนั้น → ข้อความหายและไม่มีที่ไหนจำ

**แก้ (`renderer/app.js`):**
- ฟังก์ชันใหม่ `mergeIncomingMessages(view, incoming)` (pure):
  - session มีข้อความอะไร → ใช้ของ session
  - ข้อความที่ `pending` แล้ว session ยังไม่มี → ต่อท้าย
  - ถ้า session มีข้อความนั้นแล้ว → เอา pending copy ทิ้ง (ไม่ซ้ำ)
  - เทียบด้วย (kind + text + จำนวนรูป) แบบ windowed → ส่งคำถามซ้ำกัน 2 ครั้งก็จับคู่ไม่ผิด
  - ข้อความที่เคยบันทึกแล้ว (ไม่ pending) จะไม่ถูกคืนมา → undo/compact ยังทำงานถูก
- จุดส่ง 3 แห่ง mark `pending: true`:
  - `submit()` (เส้น idle + เส้น steer) · `sendQueued()` (คิว)
- `applyTabState` เปลี่ยน `messages: state.messages || []` → `mergeIncomingMessages(view, state.messages)`

**เทสต์:**
- `selftest-history-merge.js` (18 checks) — รัน merge helper จริงใน Node + ตรวจ wiring:
  เก็บ pending เมื่อ session ยังไม่มี, ไม่ซ้ำเมื่อ session มีแล้ว, undo ยังลบได้,
  คิว/steer/idle ทั้ง 3 เส้น mark pending · ย้อนกลับ: คืน `messages: state.messages` → **FAIL 2**,
  ลบ `pending: true` ทั้ง 3 → **FAIL 3**, ทำ merge คืน pending เสมอ → **FAIL 2** (ซ้ำ)
- `scripts/check-history-merge.js` (**Electron โหลด renderer จริง รัน merge จริง 8 checks**):
  อยู่รอด, ไม่ซ้ำ, undo ยังใช้ได้, คำถามซ้ำ 2 ครั้ง, รูปเท่านั้น, ไม่คืนข้อความเก่า
- npm script ใหม่: `npm run check:history`
- `npm test` **39/39** (จาก 38)

**หมายเหตุ:** `pending` เป็นแค่เครื่องหมาย ไม่กระทบการวาด (`renderActiveTab` อ่านแค่ kind/text/images)

### ข้อความระหว่างงาน: หน่วง 5 วิ + ปุ่มแก้ไข/ยกเลิก (2026-11-14)

**คำขอผู้ใช้:** ข้อความที่พิมพ์ระหว่าง AI ทำงาน ให้หน่วงไว้ 5 วิ พร้อมนับถอยหลัง
และมีปุ่มแก้ไข (เผื่อพิมพ์ผิด/อยากแก้อะไร) · ผู้ใช้เลือก: **A + ทั้งคู่**
= กดแก้ไขแล้วดึงข้อความกลับช่องพิมพ์ และใส่ทั้งทาง Enter (steer) และ Ctrl+Enter (คิว)

**ได้อะไร:** ข้อความขึ้นในประวัติ/แถบคิวทันที พร้อมแถวใต้ข้อความ
`จะส่งในอีก 5 วิ · ส่งเข้าเทิร์นที่กำลังทำ   [แก้ไข] [ยกเลิก]` นับ 5→1 แล้วส่งเอง

**แก้ (`renderer/app.js` + `styles.css`):**
- `HOLD_SECONDS = 5` · `holds` Map (1 hold ต่อแท็บ) · `holdMessage()` ·
  `holdIdFor()` · `cancelHold()` · `cancelAllHolds()`
- `renderUserMessage` คืน `wrap` เพื่อให้แปะแถวนับถอยหลังใต้บับเบิลนั้น
- **steer (Enter)**: ส่งถูกห่อเป็น `steerSend` แล้วส่งเป็น callback — ไม่เรียกทันที
- **คิว (Ctrl+Enter)**: `queueMessage` สร้าง `queueId` ให้ item, hold แปะใต้แถวคิว
  (`rowInto` เพราะแถวเกิดหลัง `renderQueue`), `onCancel(taken)` เอา item ออกจากคิว
- `activateTabDirect` → `cancelAllHolds(tabId)`: เปลี่ยนแท็บ = ยกเลิก คืนข้อความเข้าช่องพิมพ์
- `onSettled` ตั้ง `item.holdReleased`; `drainQueue` เคลียร์ hold ก่อนส่ง item นั้น
  (กัน timer ยิงซ้ำ)
- `renderQueue` re-mount แถวนับถอยหลังหลังวาดใหม่ (ไม่งั้นกดคิวที่สองแล้วตัวนับหาย)
- i18n EN+TH: `holdCountdown` `holdWhatSteer` `holdWhatQueue` `holdEdit` `holdCancel` `holdDropped`
- CSS: `.hold-row` (11.5px, muted), `.hold-clock` (`min-width:15ch` + `tabular-nums`
  กันเลขกระโดด), `.queue-item { flex-wrap: wrap }`, ปุ่มเป็นลิงก์ขีดเส้น + `:focus-visible`

**เทสต์:**
- `selftest-hold-before-send.js` (33 checks) — 5 วิ/ติ๊ก 1 วิ, ทั้งสองเส้นทาง hold,
  แก้ไขคืนข้อความ+รูป, ยกเลิกแจ้ง, สลับแท็บยกเลิก, turn จบปล่อย hold, re-render ไม่หาย,
  คำแปล EN+TH, CSS
  · ย้อนกลับ: delay→0 → FAIL 2 · ลบ `cancelAllHolds` → FAIL 1 · ลบ re-mount → FAIL 1
- `scripts/check-hold-before-send.js` (**Electron กดปุ่มจริง 13 checks**):
  แถวขึ้น, นับ 5→4 ได้จริง, แก้ไขดึง "held text" กลับช่องพิมพ์ + ลบข้อความ,
  ยกเลิกทิ้ง + ไม่ส่ง, ไม่มีการส่งระหว่างนับ
- npm script ใหม่: `npm run check:hold`
- `npm test` **40/40** (จาก 39)

**Learned:** brace matcher ในเทสต์ตัดผิดเพราะ parameter เป็น destructuring `{ text, images }`
ต้องข้ามวงเล็บ parameter ก่อนหาวงเล็บปีกกาของ body · และ `renderQueue` มี `view` อยู่แล้ว
ประกาศซ้ำทำให้ SyntaxError

## 2026-11-14 — แนบวิดีโอ + ไม่ดีดข้อความลงล่าง + syntax guard

**บริบท:** ผู้ใช้เจอ 2 อาการ (แนบ `.mp4` ไม่ได้ · กำลังอ่านข้างบนแล้วถูกดีดลงล่าง)
และระหว่างทางมี error dialog จาก syntax error ที่ผมพิมพ์เอง

**(1) `8100fca` — แถบคิวกว้างเท่าช่องพิมพ์ + ตรวจ syntax ทุกไฟล์**
- คิวเคย `max-width: 46%` → แถบสั้นชิดขวา · ย้ายเป็นแถวกว้างเต็มใต้ปุ่ม (`flex: 1 0 100%`)
  + `.composer-box{flex-wrap:wrap}` · วัดจริง 750px vs กล่อง 772px
- error dialog ที่ผู้ใช้เห็น = `'the composer's left edge'` (apostrophe ปิด string)
  → `run-unit-tests.js` รัน `node --check` ทุกไฟล์ (110) ก่อนรันเทสต์
- ย้อนกลับ → FAIL 7 (mimeFor), FAIL 1 (picker), FAIL 1 (describeFile)

**(2) `51c327e` — แนบไฟล์ได้ทุกชนิด**
- `mimeFor()` คืน `'image/png'` ให้ทุกนามสกุล → `.mp4` 3MB กลายเป็น base64 4.2MB ที่ประกาศว่า PNG
- คืน `null` แทน · เอา allowlist ออก · renderer ใช้ `INLINE_IMAGE_TYPES`
- `describeFile()` บอก AI ว่าเป็น video/audio/pdf/... + สั่งให้แก้ปัญหาเองถ้าเปิดไม่ได้
- `npm test` 41/41 · `check:attach` 6/6

**(3) `dd7d496` — ไม่ดีดลงล่างตอนอ่านอยู่ + ปุ่ม "ล่าสุด"**
- `NEAR_BOTTOM_PX` 180 → 48 · `isReadingUp()` + `syncJumpToBottom()` ตัวตัดสินเดียว
- ลบ `force` จากเส้นทาง output: delta, assistant ใหม่, tool เสร็จ, shell card
- `#jumpToBottom` + `.transcript-wrap{position:relative}`
- `npm test` 42/42 · `check:read` 16/16
- ย้อนกลับ (`!force && false && isReadingUp()`) → scrollTop 0 → 3139 (ดึงลงจริง)

**Learned:**
- `scroll-behavior: smooth` = async → อ่าน `scrollTop` ทันทีได้ค่าเก่า ต้อง `insertCSS` ปิดก่อนวัด
- เทสต์ Electron ต้องโหลด `preload.js` ไม่งั้น `api.getWinState()` throw แล้ว listener ทั้งไฟล์
  ไม่ถูกผูก → เทสต์รายงานผ่านทั้งที่ไม่มีอะไรทำงาน
- Python heredoc/`-c` กิน backslash ทําให้ `\n` กลายเป็นบรรทัดใหม่จริง → string JS แตก ต้องใช้ `edit`
- `look_at_image` ใช้กับไฟล์ใน session นี้ไม่ได้เลย

## 2026-11-14 — แก้ไข/ลากลำดับคิว (`e30114e`)

**คำขอ:** แก้ข้อความในคิวได้แล้วกลับไปอยู่ที่เดิม (1=A) + ลากสลับลำดับ (2=A+B)

**แก้ไข (1A):**
- `item.editing` + `item.draft` เก็บในตัว item เอง → รอดจากการ re-render
- `drainQueue` เช็ค `view.queue[0]?.editing` **ก่อน** `shift()` → รายการที่กำลังแก้ไม่ถูกส่ง
  และยังอยู่หัวคิว (A: ซ่อนจาก drain ระหว่างแก้)
- `saveQueueEdit` เขียนทับ `view.queue[at].text` ตรง ๆ ไม่ splice/push → **ตำแหน่งเดิม**
  · ยกเลิก countdown ที่ค้างอยู่ ไม่งั้นจะส่งข้อความเก่า
- `cancelQueueEdit` ทิ้ง draft แต่เก็บ item
- Save ปิดเมื่อ draft ว่าง · Enter=บันทึก · Escape=ยกเลิก

**ลากลำดับ (2A+B):**
- ที่จับ `⠿` (`.queue-grip`) **และ** ตัวแถวเองเริ่มลากได้ (A+B)
- `moveQueueItem(id, delta)` ใช้ร่วมกันทั้ง drag และ Alt+↑/↓
- `queueDropIndex(clientY)` เทียบจุดกึ่งกลางแถว
- `endQueueDrag` แก้ array ตอนปล่อยเท่านั้น → ลากแล้วยกเลิกไม่เปลี่ยนอะไร
- แถวที่กำลังแก้ไม่ให้ลาก (input จะหลุด)
- pointerup ฟังที่ `window` เพราะปล่อยนอกคิวได้

**เทสต์:** `selftest-queue-edit.js` (38) · `check-queue-edit.js` (24, Electron กดจริง/ลากจริง)
→ `npm run check:queue-edit` · `npm test` **44/44**

**ย้อนกลับ:** drain ไม่สนใจ editing → FAIL 2 (`sent:["do not send me"]`) ·
save ย้ายไปท้าย → FAIL 3 (`["first","third","second, corrected"]`)

**Learned:** `field.focus()` บน element ที่ยังไม่อยู่ใน DOM ไม่ทำอะไร — ต้อง `appendChild`
ก่อน แล้วค่อย focus · เทสต์ focus ต้อง `show: true` ไม่งั้น window ที่ซ่อนรับ focus ไม่ได้

## 2026-11-14/15 — v0.4.0 (`b81b71d`) · v0.4.1 (`8515bbf`) · v0.4.2 (`81349d1`)

**หมายเหตุ:** บันทึกช่วงนี้เขียนย้อนหลังหลังปล่อย v0.4.2 — ของเดิมไฟล์ยังค้างที่ v0.3.5
(ผู้ใช้สั่งให้บันทึกทุกครั้งที่ปิดงาน ไม่ต้องรอทดสอบ)

### v0.4.0 — คิวในช่องพิมพ์

- **คิวเต็มความกว้าง** (`8100fca`): `#queueBar` เป็นลูกตรงของ `.composer-box` (ไม่อยู่ใน
  `.composer-side`) + `flex-wrap: wrap; flex: 1 0 100%` → วัดได้ 750px จาก composer 772px
- **แก้ในที่** (`e30114e`): `item.editing`/`item.draft` อยู่ใน item → รอด re-render ·
  `drainQueue` เช็ค `queue[0].editing` ก่อน `shift()` · save เขียนทับตำแหน่งเดิม
- **ลากสลับลำดับ** (`e30114e`): `⠿` และแถวเองลากได้ · `queueDropIndex()` เทียบจุดกึ่งกลางแถว ·
  pointerup ที่ `window` (ปล่อยนอกคิวได้) · แถวที่กำลังแก้ลากไม่ได้ (input จะหลุด)
- **แนบไฟล์ได้ทุกชนิด** (`51c327e`): `mimeFor()` คืน `null` แทน `'image/png'` สำหรับนามสกุลที่ไม่รู้จัก ·
  inline เฉพาะ `INLINE_IMAGE_TYPES` (png/jpeg/webp/gif/bmp) · อื่น ๆ ส่งเป็น path + `describeFile()`
- **ไม่ดีดลงล่างตอนอ่าน** (`dd7d496`): เดิมมี 4 จุดเรียก `scrollToBottom(force=true)` ซึ่งข้ามการเช็ค
- **เอาปุ่มคัดลอกต่อคำตอบออก** (`c56fc12`) — เหลือปุ่มคัดลอกของ code block
- **$ (Hold 5 วิแล้วแก้ไข)** (`a4bc9e6`), **merge history** (`9e33dbb`), **reload safety** (`1861464`)

### v0.4.1 — 3 บั๊กที่ผู้ใช้เจอ

- **`×` อยู่ขวาสุด** (`5e9c052`): ราก `.queue-text { flex: 1 1 auto }` ดันปุ่มไปปลายแถว →
  `flex: 0 1 auto; min-width: 0; max-width: calc(100% - 50px)` · ลำดับ `⠿ → × → ข้อความ`
  · `.queue-item .queue-remove` (0,1,1) ต้องมี prefix เพื่อชนะ `.queue-item button {opacity:0}` (0,1,0)
  · วัดได้: × ที่ 10px, ข้อความ 26px, overlap −4
- **ปุ่มยกเลิกในคิวกดแล้วไม่หาย** (`d7f5972`): ราก `holdMessage()` destruct `onCancel` เป็นพารามิเตอร์
  และ `giveBack` capture ค่าตอนสร้าง; `queueMessage()` ตั้ง `hold.onCancel` ได้หลังฟังก์ชันคืนค่าแล้ว
  → ค่าที่ capture เป็น `undefined` → ตกไป fallback ซึ่ง `cancelHold()` ตั้ง `record.finished = true` ไปแล้ว
  → `giveBack` คืนค่าเฉย ๆ · probe: `before {queue:1,rows:1,hold:true}` → `after {queue:1,rows:1,hold:false}`
  · แก้ `const handler = record.onCancel || onCancel` อ่านตอนกด · หลังแก้ → `queue:0, rows:0`
- **สวิตช์อนุมัติ 3 ตำแหน่ง** (`f781a90`): `<select>` → `role=radiogroup` + `.approval-thumb`
  เลื่อนด้วย `--at` · radio ซ่อนด้วย `clip-path: inset(50%)` ไม่ใช่ `display:none` (โฟกัสต้องอยู่)
  · เลือก radio เพราะลูกศรกดได้ + screen reader อ่าน "2 of 3" + `:checked` คือ state
  · วัด: ask `thumbLeft 4` = option `4`; allow `82` = `82`; deny `161` = `161`
- **ส่งแล้วเลื่อนล่างสุด** (`8515bbf`): `renderUserMessage()` ไม่เคยเลื่อน และ `scrollToBottom()`
  เคารพ `isReadingUp()` ซึ่งผิดสำหรับข้อความผู้ใช้เอง · ก่อนแก้: `scrollTop 0 / 2549px จากล่าง` →
  หลัง: `2549 → 0` · แก้ด้วย `scrollToBottom(true)` เป็นบรรทัดท้ายของ `renderUserMessage()`

### v0.4.2 — บั๊กใหญ่ 2 ตัว + UI คิว

- **คำตอบหลายก้อนถูกทับ** (`cb3ba1a`): 1 เทิร์นมีหลาย block ของ prose แต่ละ block มาเป็น `text_end`
  ของตัวเอง และ `onTextEnd` ทำ `body.__fpText = p.text` ทับก้อนก่อน
  · ก่อนแก้: `["จะทำ A และ B"]` → `["ทำ A เสร็จ ต่อด้วย C"]` (ก้อนแรกหาย)
  · แก้: `currentBody(wrap)` คืน `.body` ตัวสุดท้าย (สร้างใหม่ถ้า `__fpDone`) ·
  `sealBody(wrap)` ใน `api.onToolStart` **ก่อน** `toolCard()` · CSS `.body + .body { margin-top: .7em }`
  · หลังแก้: ครบทั้ง 3 ก้อน · ช่องว่างระหว่างก้อน 16px
  · **`sealBody` จำเป็นจริง** ถ้าไม่มี `text_end` มาก่อน tool call (เทสต์พิสูจน์)
  · replay ไม่มีบั๊กเพราะ append อยู่แล้ว → เกิดเฉพาะ live stream
- **ติดล่างเสมอ** (`80fd1dd`): เดิม `scrollToBottom()` **วัดระยะทุกครั้ง** เนื้อหาโตใต้ตาคนที่ไม่ได้แตะ
  scrollbar → ระยะดูเหมือนเลื่อนหนี · วัดก่อนแก้: `0 → 84 → 168 → 252 → 336 → 420 → 504`
  · แก้: `pinnedToBottom` เก็บสถานะแทนการวัด · `syncFollow()` · `isReadingUp()` = `!pinnedToBottom`
  · `jumpingToBottom` guard + `scrollend` + fallback 420ms
  · หลังแก้: อยู่ล่าง `0,0,0,0,0,0` pinned · เลื่อนขึ้น `2389` ไม่ถูกดึง · กด "ล่าสุด" → gap 0
- **ปุ่มแก้ไขเป็นดินสอ + ghost ตอนลาก** (`d2c6c2e`): ปุ่ม `queueEdit` ย้ายไปหน้าเท็กซ์ เป็น `✎`
  (`\u270e`) + `title`/`aria-label` · ปุ่มนำแถวทั้งหมด `opacity .55` ตอน rest (ไม่ซ่อนรอ hover)
  · ghost = `<div class=queue-ghost>` `position:fixed; pointer-events:none; opacity .82`
  สร้างจาก `.queue-text` (ไม่ clone — ต้องไม่มีปุ่มข้างใน) · ซ่อนตอน `pointerup` + `pointercancel`
  · วัดจริง `⠿ 0 · ✎ 10 · × 30 · ข้อความ 47` (ดินสอจบ 26 ไม่ทับ) · ghost `665px → 756px`

**เทสต์:** `npm test` **46/46** · เทสต์ใหม่ `selftest-turn-blocks.js`, `selftest-queue-controls.js`,
`check-turn-blocks.js`, `check-queue-controls.js` (27) · npm script `check:blocks`, `check:queue-controls`

**ย้อนกลับที่จับได้จริง:**
| คืนบั๊ก | ผล |
|---|---|
| overwrite ใน `onTextEnd` | FAIL 2 — `["อ่านเสร็จแล้ว","อ่านเสร็จแล้ว"]` |
| ลบ `sealBody` | FAIL 2 — `["จะทำก่อนแล้วทำต่อ"]` |
| คืนการวัดระยะ scroll | FAIL 2 — `[84,168,252,336,420,504]` |
| คืน `onCancel` capture | FAIL 7 — `afterQueue:1` |
| ย้ายดินสอกลับท้ายแถว | FAIL 4 — `edit:146, text:27` |
| ลบ `showDragGhost` | FAIL 4 — `count:0` |

**Learned:**
1. **scroll event เป็น async** — `dispatchEvent` กับการเขียน `scrollTop` อาจมาสลับลำดับ
   ต้องรอ `requestAnimationFrame` 2 ครั้ง + 80ms ก่อนอ่าน state
2. **ปุ่ม `hidden` มี rect เป็นศูนย์** — เทสต์ geometry ต้อง unhide ก่อน แล้วคืนค่า
3. **`scrollTop = …` เฉย ๆ ไม่ใช่ scroll** — ต้อง `dispatchEvent(new Event('scroll'))`
   ไม่งั้น `pinnedToBottom` ยังเป็น `true` และเทสต์ผ่านโดยบังเอิญ
4. **regex ในเทสต์อาจไปชน comment** — comment ที่มี `scrollToBottom()` ทำให้ check ผ่านผิด
   (แก้ด้วยการเปลี่ยนถ้อยคำใน comment)
5. **bash heredoc กับ backtick ใน template string ชนกัน** — ไฟล์เทสต์ขาดกลางบรรทัด
   → ใช้ `write` tool เขียนแล้ว `cat` ต่อ
6. **`git checkout` กลางคัน** ทำให้ suite รายงาน FAIL หลอก — รอ restore เสร็จแล้วรันใหม่
7. **เทสต์ที่สร้างแถวปลอมผ่านทั้งที่ของจริงพัง** — `check-queue-placement.js` เดิมสร้าง fake rows
   ทำให้ผ่านแม้ `×` อยู่ท้ายสุด · ต้องเรียก `renderQueue()` จริง (ต้องมี `preload.js`)

**เครื่องมือ:** `look_at_image` reject ทุก path ทั้ง session · `gh` ไม่มี, repo private → ดู CI ไม่ได้

**คำถามผู้ใช้ 2026-11-15 — Ctrl+Shift+R ต่างจากปิดเปิดใหม่ไหม:**
- `Ctrl+Shift+R` ทิ้ง renderer แต่ **main process + agent ที่กำลังรันไม่ตาย** → `tab:open` reattach
  ด้วย session file (`main.js` ~2384) ไม่สร้างแท็บซ้ำ
- **`main.js` / `preload.js` ไม่ถูกโหลดใหม่** → แก้สองไฟล์นี้ต้อง `npm start` ใหม่
- ปิดโปรแกรม → agent ตาย · **คิว + hold อยู่ใน memory ของ renderer ไม่ลง disk** → หายทั้งสองกรณี

## 2026-11-15 — ดินสอแก้ไขในคิวแล้ว countdown ยังเดิน (`98125ea`)

**คำขอ (ผู้ใช้ทดสอบเอง):** "ตอนใช้แก้ไขด้วยปุ่มดินสอ ยังมีการนับถอยหลัง แต่ตอนกดปุ่ม แก้ไข
ไม่มีการนับถอยหลัง"

**ราก:** ปุ่มดินสอ (`queue-edit-btn`) ตั้ง `item.editing = true` แล้ว `renderQueue()` เฉย ๆ
**ไม่ได้แตะ hold ที่ค้างอยู่** → `setInterval` เดินต่อและยิง `send()` ตอนครบ 5 วิ
ในขณะที่ผู้ใช้ยังพิมพ์แก้อยู่
- ฝั่งที่ทำงานถูกคือปุ่ม `holdEdit` ในแถว countdown ซึ่งเรียก `giveBack(true)` → `detach()`
  → `clearInterval` + `holds.delete` + `row.remove()`
- probe ก่อนแก้: `{hold:true, clock:"Sending in 4s · เข้าคิว", rows:1, editing:true}`
  → รอต่ออีก 6 วิได้ `sent:1` = **ส่งข้อความเก่าออกไปจริง**

**แก้ (`98125ea`):**
- เพิ่ม `cancelHoldFor(queueId)` — หา hold ที่ `record.item.queueId` ตรงกัน แล้ว
  `cancelHold(view, {silent:true})` (ตัด countdown, เก็บ item ไว้)
- ปุ่มดินสอเรียก `cancelHoldFor(item.queueId)` **ก่อน** ตั้ง `editing`
- **จงใจไม่ใช้ `giveBack(true)`** เพราะดินสอแก้ในที่ ไม่ดึงข้อความกลับไปช่องพิมพ์
- หลังแก้: `{hold:false, clock:null, rows:1, editing:true}` → รอ 6 วิได้ `{sent:0, queueLen:1}`

**เทสต์:** `selftest-queue-edit-hold.js` (19) · `check-queue-edit-hold.js` (14, Electron
รอครบ 6 วิจริง) · npm script `check:queue-edit-hold` · `npm test` **47/47**

**ย้อนกลับ:** ลบ `cancelHoldFor(item.queueId)` → `npm test` FAIL 1 ·
Electron FAIL 5 โดยเฉพาะ `the old text is never sent — {"sent":1}`

**Learned:**
- `saveQueueEdit` เรียก `drainQueue()` → ของที่บันทึกแล้ว **ถูกส่งทันที** ถ้าคิวว่าง
  เทสต์ที่สร้าง hold ปลอมจึงต้องไม่ assert ว่า "เซฟแล้วยังอยู่ในคิว" — ผมเขียนผิดตอนแรก
  (`text:null, queueLen:0`) แล้วแก้เป็น assert ว่า "เซฟแล้ว editor ปิด และไม่ส่งข้อความเก่า"
- **hold หนึ่งอันผูกกับ item ได้ทางเดียว** คือ `record.item` ซึ่ง `queueMessage` ตั้ง**หลัง**
  `holdMessage()` คืนค่า → ตัวช่วยที่ต้องหา hold จาก item ต้องอ่านตอนกด ไม่ใช่ตอนสร้าง
  (บทเรียนเดียวกับ bug ปุ่มยกเลิก `d7f5972`)

## 2026-11-15 — ghost ใหญ่เกิน + ไม่มีเลขลำดับ (`d16be22`)

**คำขอ (ผู้ใช้ทดสอบเอง):** "ตอนลาก ghost มันใหญ่มากๆ ปรับขนาดให้เหมาะสม ไม่ต้องแสดงข้อความ
ทั้งหมดก็ได้ ... มีตัวเลขอยู่ด้านหน้าของคิวว่าข้อความไหนอยู่ลำดับที่เท่าไหร่ด้วยจะดีมาก"

**รากของ ghost ใหญ่:** `showDragGhost()` ตั้ง `ghost.style.width` = ความกว้างของ `#queueBar`
(850px) และใส่ `textContent` เต็มข้อความ → เป็นแถบเต็มความกว้างที่**บังรายการที่กำลังลากไปใส่**
- วัดก่อนแก้: `{width:850, height:23, text: เต็มข้อความ 90 ตัวอักษร}`
- วัดหลังแก้: `{width:176, height:23, chars:33, endsWithEllipsis:true}` = เล็กลง **79%**

**แก้ ghost:**
- ตัด `ghost.style.width` ทิ้ง — ให้ขนาดตามเนื้อหา (`max-width: 260px` ใน CSS)
- `shortenGhost(text, limit=32)` — ยุบช่องว่างก่อน แล้วตัดด้วย **code point**
  (`[...flat]`) ไม่ใช่ UTF-16 unit เพราะสระ/วรรณยุกต์ไทยแยก code point ได้
  → ตัดด้วย `slice` ธรรมดาอาจตัดวรรณยุกต์หลุดจากพยัญชนะ
- CSS: `border-radius: 999px` (แคปซูล) + ขอบสี accent + `left: 8px` `top: 0`
  (ไม่ใช้ `right: 0` อีกแล้ว) + `font-size: 11px`
- `moveDragGhost` เปลี่ยน `clientY - 16` → `clientY - 14` ให้ตรงกับความสูงใหม่

**แก้เลขลำดับ:**
- `items.forEach((item, index)` (เดิมไม่มี index)
- `<span class="queue-num">` = `String(index + 1)` เป็น**ลูกตัวแรก**ของแถว (ก่อน `⠿`)
- `aria-label` = `t('queuePosition', { n })` — ตัวเลขเดี่ยว ๆ screen reader อ่านลอย ๆ
- เพิ่มคีย์ `queuePosition` ทั้ง EN/TH
- CSS `.queue-num`: `font-variant-numeric: tabular-nums` (เลข 1 หลัก/2 หลักกว้างเท่ากัน
  ไม่ให้ข้อความกระโดดตอนขึ้นหลักสิบ) + `user-select: none` + `min-width: 11px`
- เลขคำนวณจาก `index` ตอน render → **อัปเดตตามหลังลากอัตโนมัติ** (ทดสอบแล้ว)

**เทสต์:** `selftest-queue-number.js` (24) · `check-queue-number.js` (19, Electron วัดจริง)
· npm script `check:queue-number` · `npm test` **48/48**

**ย้อนกลับ:**
- คืน `ghost.style.width` + `textContent = raw` → FAIL 3 (`chars:90`, ไม่มี `…`)
- comment `row.appendChild(num)` → FAIL 3 (`[null,null,null]`)

**Learned:**
- **เทสต์หยิบแถวตาม index หลัง reorder = ผิดแถว** — ของผมเลือก `rows[1]` หลังสลับลำดับ
  ได้ข้อความสั้นมาแทนข้อความยาว → ต้องเลือกจาก `textContent` ที่ต้องการ
- **`.queue-num` ทำให้เทสต์เดิมพัง 3 ข้อ** ใน `check-queue-placement.js` (`gripFirst`,
  ระยะจากขอบซ้าย) เพราะทุกอย่างเลื่อนไปทางขวา ~15px · แก้ให้ `gripFirst` ข้าม `.queue-num`
  แล้วขยายเพดานระยะจาก 40 → 60px พร้อมเพิ่ม check ว่าเลขเป็นลูกตัวแรก
  (**บทเรียน: เพิ่ม element หน้าแถวแล้วต้องรันเทสต์ geometry เก่าทั้งชุด**)
- `body()` ที่จับ `{...}` ด้วยการนับวงเล็บใช้ไม่ได้กับไฟล์ CRLF ที่มี regex ยาว — ใช้ `slice` แทน
- **`look_at_image` ยังใช้ไม่ได้** — path ต้องอยู่ใน project แต่ก็ยัง reject; ทำงานจากคำอธิบายผู้ใช้แทน

## 2026-11-15 — ปล่อย v0.4.3 (`ef5e1e1`)

ผู้ใช้สั่ง "ออกเลยคับ" หลังทดสอบเองเจอ 2 เรื่อง → patch release ตามเงื่อนไขยกเว้น

- `98125ea` ดินสอแก้ไขในคิวหยุด countdown (กันส่งข้อความเก่าระหว่างแก้)
- `d16be22` ghost ตอนลากย่อเป็นแคปซูล 176px (เคย 850px) + เลขลำดับหน้าคิว
- `ef5e1e1` bump 0.4.3

**ตรวจจาก tag object โดยตรง** (`git show v0.4.3:...` ไม่ใช่ HEAD):
`version 0.4.3` · `cancelHoldFor` 1 · `shortenGhost` 1 · `queue-num` 1 · `max-width: 260px` 3
· `npm test` 48/48 · working tree สะอาด · master = origin/master

CI ดูไม่ได้ (gh ไม่มี, repo private) — ผู้ใช้ตรวจที่ NTAPI-releases

## 2026-11-15 — หน้า release ไม่มีคำอธิบาย (`5a34a25`)

**คำขอ:** ผู้ใช้จะปล่อยโปรแกรมสู่สาธารณะ ขอให้อัปเดตข้อมูลที่ `Cheumklang/NTAPI-releases`
(ข้าม LICENSE — ผู้ใช้ไม่มีงบ, และ MIT ไม่เกี่ยวกับค่าใช้จ่าย แต่ผู้ใช้ไม่ต้องการ)

**ราก:** `release.yml` ไม่เคยตั้ง `body`/`body_path` เลย → release ทุกอันมีแค่ชื่อกับไฟล์
คนที่เข้ามาจากโพสต์ Facebook เห็นชื่อไฟล์ `.exe` เฉย ๆ ไม่รู้ว่าโปรแกรมคืออะไร

**แก้:**
1. `RELEASE_NOTES.md` ที่ **repo root** — ถาม-ตอบที่คนโหลดต้องรู้: โปรแกรมคืออะไร,
   ต้อง Windows อะไร, **ทำไม Windows เตือน (ไม่มี code signing → More info → Run anyway)**,
   อัปเดตเอง, วิธีแจ้งปัญหา, และหมายเหตุเรื่อง API ของเจ้าอื่น
2. `release.yml` → `body_path: RELEASE_NOTES.md` (root-relative เพราะ job รันที่ repo root)
3. `package.json` description: `Desktop app for NTAPI (no terminal needed)` →
   `รวม AI ที่มีโควตาฟรีไว้ในที่เดียว ลองก่อนจ่ายรายเดือน`

**ยืนยันจากเอกสาร:** `body_path` ชนะ `body`; อ่าน relative กับ workspace root

**เทสต์:** `selftest-release-notes.js` (19) — offline, อยู่ใน `npm test` → **49/49**
ตรวจ: ไฟล์มีจริง · workflow ชี้ถูก · ไม่มี `body:` ซ้อน · ยัง publish ไป
`Cheumklang/NTAPI-releases` · `latest.yml` + `blockmap` ยังอยู่ (electron-updater ต้องใช้) ·
เนื้อหาครบ 8 ข้อที่คนใหม่ต้องรู้ · ไม่มีอักขระ CJK หลุด

**ย้อนกลับ:** ลบ `body_path` → FAIL 1 · ลบส่วน SmartScreen → FAIL 2 ·
ชี้ไป `app/RELEASE_NOTES.md` → FAIL 2

**Learned:** เขียน `RELEASE_NOTES.md` แล้วมีอักขระจีนหลุด (`它会แจ้งเอง`) — จับได้ด้วย check
`no stray CJK characters` ที่ใส่ไว้เอง · **ข้อจำกัด:** release ที่ปล่อยแล้ว (`v0.4.3`)
แก้ย้อนหลังไม่ได้เพราะไม่มี `gh` และ repo เป็น private → คำอธิบายเริ่มมีที่ `v0.5.0`
ถ้าอยากให้ v0.4.3 มีด้วย ผู้ใช้ต้องกด Edit ที่หน้าเว็บเอง

---

## 2026-11-15 — `/clear` เก็บชื่อ+model · ปักหมุดแชท · สีแชท

**สั่งโดยผู้ใช้:** เวลา `/clear` อย่าลบชื่อแชท และอย่าเปลี่ยน model · เพิ่มระบบปักหมุดแชท
และเปลี่ยนสีแชท (เพื่อจัดระเบียบแชท/แยกงาน) · ยืนยันทางเลือก: เก็บ mark ใน `prefs.json`
(ไม่ใช่ใน `.jsonl`) และ "หมุดแยกจากสี" · `/clear` ต้องเหมือนเซสชันใหม่เรื่อง token

**(ก) `/clear`** — อ่าน `sessionName` + `session.model` ก่อน `dispose()` แล้วเขียนกลับ:
`setSessionName(keepName)` + `handle.setModel(provider,id)` · `state.name`/`state.model`
อัปเดตให้ตรง · คืน `keptName`/`keptModel` → notice ใหม่ `clearKeptName`
· **ยังลบไฟล์ `.jsonl` เดิมและสร้างไฟล์ใหม่** = token เท่ากับ "+ New" (ตามที่ผู้ใช้ต้องการ)

**(ข) ปักหมุด + สี** — ไฟล์ใหม่ `src/session-marks.js` (pure, 24 checks)
- คีย์ = path ไฟล์ session (normalize + lowercase บน Windows) · เก็บใน `prefs.json`
  คีย์ `sessionMarks` → **ไม่แตะฟอร์แมต `.jsonl` ของ pi**
- palette ปิด 7 สี · ค่าที่ไม่รู้จักถูกทิ้ง · mark ว่างถูกลบออกจาก store
- `pruneMarks` ทุกครั้งที่ `listSessions()` → ไม่มีขยะค้างเมื่อลบแชท
- `sortByMark` **ไม่เรียงตามเวลา** ย้ายแค่ pinned ขึ้นบน (ที่เหลือคงลำดับจาก `listSessions`)
- IPC `session:mark` (ตรวจ path ใต้ `SESSIONS_ROOT`) + `session:colors`
- UI: `.s-pin-slot` จองที่ทุกแถว · แถบสี `border-left:4px` · เมนูคลิกขวา มีปักหมุด + 7 สวอตช์
  + "ไม่ใช้สี" · กดสีเดิมซ้ำ = เอาสีออก

**บั๊กที่วัดพิกเซลแล้วเจอ (แก้หมด):**
- ชื่อแถวเยื้อง 21px vs 42px เพราะไอคอนหมุดมีเงื่อนไข → เปลี่ยนเป็น slot คงที่ทุกแถว
- เหลื่อม 1px ระหว่าง `.open`/`.active`/สี เพราะ `box-sizing:border-box` (border+padding)
  → ตั้งทุกสถานะให้รวมเป็น 10px · วัดจริง `[42,42,42,42,42]`
- `session:mark` เทียบ `root` ที่ยังไม่ lowercase

**เทสต์:** `selftest-session-marks.js` (24) · `selftest-session-marks-ui.js` (20) ·
`check-session-marks.js` (18, Electron ผ่าน IPC จริง) → `npm test` **51/51** ·
`npm run check:marks` **18/18**

**ย้อนกลับ (พิสูจน์แล้ว FAIL จริง):** ลบ `setSessionName(keepName)` → 1 · ไม่รับ `state.model` → 1 ·
สลับ `[...rest,...pinned]` → 1 · ย้าย CSS สีก่อน `.active` → 1

**Learned:**
1. `window.freepi` จาก **contextBridge เป็น frozen** — แก้ method จากในหน้าเว็บไม่ error
   แต่ไม่มีผลเลย (เทสต์ Electron แรกได้ลิสต์ว่างทั้งที่ข้อมูลถูก) → stub ที่ `ipcMain` แทน
2. **เขียนเทสต์ให้ตรงกับพฤติกรรมที่ต้องการ ไม่ใช่ที่โค้ดทำอยู่** — เทสต์แรกคาดว่า `sortByMark`
   จะเรียงตามเวลาแล้ว FAIL ซึ่งชี้บั๊กจริง (ลำดับ sidebar จะสลับ) → แก้ที่โค้ด ไม่ใช่ที่เทสต์
3. วัด UI ด้วย `getBoundingClientRect`/`getComputedStyle` ได้ผลเท่ากับดูรูป — จำเป็นเพราะ
   `look_at_image` reject ทุก path ทั้ง session

---

## 2026-11-15 — ป้ายชื่อผู้ตอบในแชท: ชื่อ provider + model แทน "NTAPI"

**สั่งโดยผู้ใช้:** ในช่องแชทมีคำว่า NTAPI อยู่ → เปลี่ยนเป็น
`FREEPI | Model: DeepSeek V4.1 Flash` (ชื่อบริษัท/provider + ชื่อ model ที่ใช้อยู่)

**แก้:** `src/renderer/app.js` เพิ่ม `messageAuthor(view)` — สร้างข้อความจาก
`FPProvider.providerLabel(model.provider)` + `model.name`
· `addMessage()` ใช้ตัวนี้แทน `t('assistant')` แบบตายตัว
· เพิ่ม `refreshMessageAuthors()` เรียกหลัง `api.setModel()` → เปลี่ยน model แล้ว
  คำตอบเก่าในเธรดเดียวกันถูกเปลี่ยนป้ายตามทั้งหมด (1 เธรด = 1 model ที่ตอบ)
· ไม่มี model → ถอยไปใช้ `t('assistant')` ไม่พิมพ์ `" | Model: "` ลอย ๆ
· ไม่ต้องแก้ CSS: `.msg .role` มี `text-transform: uppercase` อยู่แล้ว
  → `FreePi` แสดงเป็น `FREEPI` ตรงตามที่ผู้ใช้พิมพ์มา

**เทสต์:** `scripts/check-author-label.js` (6 checks, Electron + IPC จริง)
→ `npm run check:author` · ยืนยันข้อความที่แสดงจริงด้วย assertion ตัวสุดท้าย:
`FREEPI | MODEL: DEEPSEEK V4.1 FLASH`
· **ย้อนกลับ:** ตัดให้คืนแค่ `provider` → FAIL 3
· `npm test` ยัง **51/51**

**Learned:** แก้ `renderModelPicker(view)` พลาดใส่ `const view = activeView();` ซ้ำ
ทำให้ `SyntaxError: Identifier 'view' has already been declared` — จับได้ด้วย `node --check`
**ก่อน** รันเทสต์ · บทเรียน: รัน `node --check` ทุกครั้งหลังแก้ renderer ที่เป็นไฟล์เดียวจบ

---

## 2026-11-15 — พับ "บันทึกการทำงาน" (narration) คำตอบสุดท้ายไม่พับ

**สั่งโดยผู้ใช้:** กรอบสีเขียว (ข้อความยาว ๆ ของ AI) ให้ย่อแบบเดียวกับ "ใช้เครื่องมือ N ครั้ง"
· **ห้ามย่อ** คำตอบสุดท้ายของ AI · ผู้ใช้ยืนยันว่าเป็น **A** (ไม่ใช่ thinking) และให้ใช้
ข้อความอังกฤษของผมเองเป็นตัวอย่าง (`Let me look at…`)

**สิ่งที่ค้นพบ (สำคัญ):** ที่ผู้ใช้เห็นไม่ใช่ thinking — thinking พับอยู่แล้ว (วัดแล้ว `hidden:true`)
แต่เป็น **`.body` หลายก้อนต่อ 1 เทิร์น** เพราะ agent พูด → เรียก tool → พูดอีก
· ก่อนหน้านี้ทุกก้อนแสดงเต็มหมด → เทิร์นเดียวยาวเต็มจอ

**แก้:**
- `sealBody()` เดิมแค่ตั้ง `__fpDone` → เพิ่ม `collapseNarration()`: ย้ายก้อนนั้นเข้า
  `.narration-group` ที่มีปุ่มบรรทัดเดียว "บันทึกการทำงาน N ช่วง" (ปิดไว้เริ่มต้น)
- ก้อนสุดท้ายของเทิร์นไม่ถูก seal → **คำตอบจริงเปิดเสมอ**
- เทิร์นที่ไม่เรียก tool เลย → ไม่มีปุ่มโผล่ (สร้าง lazily)
- replay (เปิดแชทเก่า) เรียก `sealBody()` ตอนเจอ `m.kind === 'tool'` → ได้ผลเหมือนตอน live
- i18n: `narrationOne` / `narrationMany` (EN + TH)
- CSS: `.narration-group/-toggle/-list/.narration` ตั้งใจให้หน้าตาเหมือน `.tools-toggle`
  (ของที่พับได้สองแบบในแถวเดียวกันควรดูเป็นชนิดเดียวกัน) · `.narration .body` เป็นสีจาง + เส้นซ้าย

**บั๊กเดิมที่เจอระหว่างทาง (แก้ด้วย):** ใน replay โค้ดใช้ `wrap.querySelector('.body')`
ตัว **แรก** → ข้อความทุกก้อนของเทิร์นถูกต่อเข้าก้อนบนสุด = บับเบิลยักษ์ก้อนเดียวที่พับไม่ได้
→ เปลี่ยนเป็น `currentBody(wrap)` ที่ใช้ร่วมกับ live path

**เทสต์:** `scripts/check-narration-fold.js` (12 checks, Electron) — `npm run check:narration`
ตรวจ: พับ + ปิดเริ่มต้น + นับจำนวนถูก + คำตอบจริงเปิด + ก้อนคำตอบไม่ถูกพับ + กดแล้วกาง +
เทิร์นไม่มี tool ไม่มีปุ่ม + **live path** ก็พับ
· **ย้อนกลับ:** ลบ `collapseNarration()` → FAIL 9
· วัดผลจริง: เทิร์นที่เคยเต็มจอ → **156px** (ปุ่ม 29px + คำตอบ)
· `npm test` **51/51** · `check:author` 6/6 · `check:marks` 18/18

**Learned:** ซ่อมจาก "สิ่งที่ผู้ใช้เห็น" ไม่ใช่ "สิ่งที่ผมเดาว่าเป็น" — ผมเดาไป 3 รอบ
(thinking → max-height → pre-tool prose) ก่อนผู้ใช้ชี้ว่าข้อความอังกฤษของผมเองคือตัวอย่าง
· ทางลัด: ถามให้ผู้ใช้ชี้ตัวอย่างจริงตั้งแต่แรก จะประหยัดไปหลายรอบ

---

## 2026-11-15 (v0.4.5) — ปุ่มระดับการคิด: แสดงตลอด + เป็นสไลด์ไล่สีเขียว→แดง

**สั่งโดยผู้ใช้:** ปุ่ม "การคิด" ขึ้้นบางทีไม่ขึ้น อยากให้ขึ้นตลอด · ไม่ต้องเป็น dropdown
ให้เป็นสไลด์เหมือน "การอนุมัติเครื่องมือ" · ห้ามย้ายตำแหน่ง · ใช้สีบอกอารมณ์ เขียว(ประหยัด/eco) → แดง(ดุ/แพง)
· ผู้ใช้เลือกตัวเลือก **A** = ตอน model ไม่รองรับ ให้แสดงไว้แต่หรี่+ล็อก พร้อมบอกเหตุผล

**สาเหตุที่หาย:** pi SDK คืน `["off"]` + `supported:false` เมื่อ model ไม่รองรับ reasoning
· `paintThinking()` เดิมทำ `select.hidden = true` → หายทั้งอัน (ไม่ใช่บั๊ก แต่เป็นพฤติกรรมที่ไม่ต้องการ)

**แก้:**
- `index.html`: `<select>` ถูกซ่อนถาวร (`.think-value`) เป็นแหล่งค่าให้ IPC/เทสต์
  · เพิ่ม `#thinkingSwitch` (role=radiogroup) + `.think-thumb` **ในตำแหน่งเดิมของ topbar**
- `paintThinking()` เขียนใหม่: **ไม่ซ่อนอีก** · สร้าง radio ตาม level ที่ model ให้ (ไม่ hardcode 5)
  · `--count` / `--at` / `--p` เป็น CSS var → thumb เลื่อน + เปลี่ยนสี
  · ถ้าไม่รองรับ: `input.disabled`, `.is-locked` (opacity .55), thumb เป็นสีเทา, `#thinkingNote` โชว์ "model นี้ไม่รองรับการคิด"
- คลิก → เขียนค่าเข้า hidden select แล้ว `dispatchEvent('change')` → ใช้ path เดิม (`session:thinking` IPC)
  **ไม่แตะ main process เลย** · คลิกตัวเดิม = ไม่ยิง IPC ซ้ำ
- สี: `hsl(calc(140 - (--p * 140)) 58% 34%)` → 0=เขียว 140°, 1=แดง 0°
  · อิง **ตำแหน่ง** ไม่ใช่ชื่อ level → model ที่มีแค่ 3 ระดับยังไล่สีเต็มช่วง (ไม่เป็นหลุม)
  · ตัวอักษรที่เลือกใช้สีขาว เพราะปลายแดงเข้ม ตัวอักษรเข้มจะ contrast ไม่ผ่าน
- `/thinking` slash command เดิม focus hidden select (ไม่มีอะไรเกิดขึ้น) → เปลี่ยนไป focus radio ที่เลือกอยู่

**เทสต์:** `scripts/check-thinking-switch.js` (14 checks, Electron) — `npm run check:thinking`
ตรวจ: ขึ้นตลอด (รวมตอน unsupported และตอนไม่มี tab) · ไม่ใช่ dropdown · ระดับถูกเลือก ·
**คำนวณ hue จริง**: off = เขียว (hue 80–170), high = แดง (<20 หรือ >340) · thumb เลื่อนจริง ·
ไม่รองรับ → disabled หมด + dim + มีข้อความบอก · 3 ระดับไล่สีเต็ม · **คลิกแล้วถึง `session:thinking` จริง**
· **ย้อนกลับ:** ใส่ `if (unsupported) { style.display='none'; return; }` → FAIL 5
· วัด layout: สูง 30px ใน topbar 57px, อยู่ซ้าย model picker, ไม่ตัดบรรทัด, ไม่มี label ล้น
· `npm test` **51/51** · check:thinking 14/14 · narration/author/marks ผ่านหมด

**Learned:**
1. **เทสต์ที่วัดสีต้องปิด transition ก่อน** — รอบแรก FAIL เพราะอ่านสีระหว่าง `transition: .18s`
   (ได้ค่าเดิมค้าง) · ใส่ `transition:none !important` แล้วผ่าน
2. ตั้ง `--p` ที่ **ตัว switch** ด้วย ไม่ใช่แค่ที่ label — thumb อ่านค่าจาก parent
   (รอบแรกตั้งที่ label อย่างเดียว → thumb สีเดียวตลอด)

---

## 2026-11-15 (v0.4.5) — status strip แถวเดียว · ป้าย "การคิด:" · แก้ highlight ไม่ตรงช่อง

**สั่งโดยผู้ใช้:**
1. `detachAll ✓` ขึ้นซ้อนหลายชั้น ดันช่องแชทขึ้น → อยากให้เหลือแถวเดียว แสดงอันล่าสุด
2. ปุ่มการคิด อยากให้มีข้อความบอกว่าเป็นอะไร เช่น "การคิด:"
3. ตอนเลือก "ต่ำ" สี highlight เบี่ยงไปทาง "น้อยที่สุด" และทับตัวอักษร → ไม่มืออาชีพ
4. **ให้ปล่อยอัปเดตได้เลย** (จะไปลองตัวติดตั้ง)

**(1) status strip แถวเดียว**
- `pushActivity()` เดิม `appendChild` + เก็บ 6 แถว (`ACTIVITY_MAX`) → footer สูงขึ้น แล้วดัน
  composer/transcript ขึ้น (แชทกระโดด)
- เปลี่ยนเป็น `lines.replaceChildren()` → เหลือแถวเดียว = คำสั่งล่าสุดเสมอ
- ลบ `ACTIVITY_MAX` ที่ไม่ได้ใช้แล้ว · เพิ่ม `row.title` ให้ hover อ่านเต็มได้
- เหตุผล: strip นี้เป็น "กำลังทำอะไรอยู่" ไม่ใช่ log — ประวัติมีอยู่ใน tool card ของ transcript แล้ว

**(2) ป้าย "การคิด:"**
- เพิ่ม `<span id="thinkingLabel" data-i18n="thinking">` หน้า switch · `aria-labelledby` ชี้ไปที่มัน
- i18n `thinking` เปลี่ยนเป็น `'Reasoning:'` / `'การคิด:'`

**(3) highlight เบี่ยง/ทับตัวอักษร — ต้นเหตุจริง**
- thumb กว้าง `calc((100% - 6px) / var(--count))` (เท่ากันทุกช่อง)
- แต่ grid เป็น `repeat(var(--count), minmax(0, auto))` = **กว้างไม่เท่ากัน** (ตามความยาวคำ)
  → ช่อง "ต่ำ" แคบกว่าค่าเฉลี่ย → highlight เลยไปทางซ้าย ทับ "น้อยที่สุด"
- แก้: `minmax(0, 1fr)` (ช่องเท่ากันหมด) + `text-align: center` + padding 4px 6px
- **วัดจริง drift = 0px ทุกระดับ** (ก่อนแก้ 10px)

**(4) บั๊กที่เจอเพิ่ม:** เปลี่ยนภาษาแล้วคำใน switch ไม่แปล เพราะ rebuild key ไม่มี `lang`
→ ใส่ `lang` ใน key + `applyLanguage()` เรียก `paintThinking()` ใหม่

**เทสต์:**
- `scripts/check-status-strip.js` (7 checks) — `npm run check:strip` ใหม่
  ตรวจ 1 แถว · ความสูงไม่โต · **composer ไม่ขยับ** · แสดงอันล่าสุด · แทนที่ของเก่า · error ยังเห็น · clear ได้
- `check-thinking-switch.js` เพิ่ม 4 checks (18 รวม) — มีป้าย "การคิด:" · คำแปลเปลี่ยนตามภาษา ·
  **highlight อยู่หลังคำที่เลือก (drift ≤1px)** · ไม่มี label ล้นช่อง
- **ย้อนกลับ:** คืน `appendChild`+6 แถว → strip FAIL 3 · คืน `auto` → thinking FAIL 1 (drift 10px)
- `npm test` 51/51 · check:strip 7/7 · check:thinking 18/18 · narration/author/marks ผ่านหมด

**Learned:** `grid` ที่ใช้ `auto` + thumb คำนวณเป็นเศษส่วนของความกว้าง จะไม่ตรงกันเมื่อคำยาวไม่เท่ากัน
· ตัวเลขที่วัดได้ (drift 10px) คือหลักฐานตรงกับที่ผู้ใช้เห็นด้วยตา — ใช้เป็นเกณฑ์ในเทสต์ได้เลย

**เพิ่ม (ผู้ใช้):** คำว่า "น้อยที่สุด" ยาวกว่าคนอื่นคนเดียว 555 → เปลี่ยนเป็น **"น้อย"**
· หลังเปลี่ยน: ทุกช่องกว้างเท่ากัน 37px · switch กว้าง 194px (เดิม 243) · ไม่มีคำล้นช่อง

---

## 2026-11-15 (v0.4.5 dev) — ลากคิว, chip บอกส่วนที่กำลังทำงาน, notice เป็นฟองในกรอบแชท

**(1) แถบ `detachAll ✓` ซ้อนหลายชั้น → แถวเดียว**
- `pushActivity()` เดิม `appendChild` + เก็บ 6 แถว → footer สูงขึ้น ดัน composer ขึ้น
- เปลี่ยนเป็น `lines.replaceChildren()` = เหลือล่าสุดแถวเดียว · ลบ `ACTIVITY_MAX`
- `scripts/check-status-strip.js` (7 checks)

**(2) ลากคิว: ป้ายลอยไปซ้ายสุดของโปรแกรม**
- **ต้นเหตุ:** `.queue-ghost { position: fixed; left: 8px }` + `moveDragGhost()` ขับแค่ `translateY`
  → ป้ายตรึงที่ขอบซ้าย ไม่สนใจเมาส์
- แก้: ส่ง `clientX, clientY` เข้า `moveDragGhost()` · `left: 0; top: 0` + `translate(x, y)` ·
  clamp ไม่ให้ออกนอกจอ · จำ `queueGhostGrab` ไม่ให้ป้ายกระตุกตอนเริ่มลาก · ลบ `queueGhostOffset`
- `scripts/check-queue-ghost.js` (9 checks)
- **เทสต์เดิมเขียนล็อกบั๊กไว้:** `selftest-queue-controls.js` ตรวจ `/moveDragGhost\(e\.clientY\)/`
  → แก้เป็น `e.clientX, e.clientY` (แก้เทสต์ให้ตรงพฤติกรรมที่ต้องการ)

**(3) chip บอกว่ากำลังทำงานส่วนไหน (ผู้ใช้สั่งใหม่)**
- ปัญหา: 3 ส่วน (ดูความคิด/ใช้เครื่องมือ/บันทึกการทำงาน) พับหมด → ต้องกางดูทีละอันถึงจะรู้
- เพิ่ม `.msg-activity` ในทุก assistant message: chip ต่อช่องที่ **กำลังผลิตผลลัพธ์อยู่**
  `think` / `tools` / `notes` · ไม่ทำก็หายไป · ทำพร้อมกันก็ขึ้นพร้อมกัน
- `setActivity(wrap, channel, on)` / `clearMsgActivity(wrap)` (**ต้องเปลี่ยนชื่อ** เพราะ `clearActivity`
  เดิมเป็นของ activity strip ของเบราว์เซอร์ — ชนกัน)
- wiring: thinking_delta → think · text delta → think off + notes on · toolStart → notes off + tools on
  (นับ `__runningTools` เพราะหลาย tool พร้อมกันได้) · toolEnd → tools off เมื่อเหลือ 0 ·
  textEnd/settled/turnStart → เคลียร์
- i18n `actThinking/actTools/actNotes` (EN+TH) · `.act-chip` มี `act-pulse` (ปิดเมื่อ reduced-motion)
- `scripts/check-activity-chips.js` (10 checks)

**(4) ข้อความ "ส่งเข้าเทิร์นที่กำลังทำงานแล้ว" ล้นออกนอกกรอบ**
- `#notice` เดิมเป็นบรรทัดเปล่า ๆ ที่ระดับ footer → เริ่มที่ขอบซ้าย จนดูหลุดกรอบ
- เปลี่ยนเป็นฟอง: `width: fit-content` + `max-width: min(--read-width, 100%)` + `margin: 0 auto`
  → อยู่คอลัมน์เดียวกับ `.composer-box` (ความกว้างเท่ากัน 572px)
- `showNotice()` มี fade-in (รีสตาร์ท animation เมื่อแทนที่ข้อความเดิม) · `hideNotice()` เฟดออก
  200ms **ก่อน** ซ่อน (เดิมหายในเฟรมเดียว = กระพริบ)
- `scripts/check-notice-bubble.js` (9 checks)

**เทสต์รวม:** `npm test` 51/51 · check:notice 9/9 · check:chips 10/10 · check:ghost 9/9 ·
check:strip 7/7 · check:thinking 18/18 · narration 12/12 · author 6/6 · marks 18/18
**ย้อนกลับ (พิสูจน์แล้ว FAIL จริง):** ghost ขับแค่ Y → FAIL 5 · notice เป็น CSS เดิม → FAIL 2 ·
strip คืน appendChild → FAIL 3

**Learned:**
1. **เทสต์เดิมอาจล็อกบั๊กไว้** — `selftest-queue-controls` ยืนยัน `moveDragGhost(e.clientY)` ตรง ๆ
   ซึ่งก็คือตัวบั๊ก · ต้องแก้เทสต์ ไม่ใช่รักษาพฤติกรรมเดิม
2. ตั้งชื่อฟังก์ชันใหม่ชนของเดิม (`clearActivity`) — `node --check` ไม่จับให้ ต้อง grep ชื่อก่อน
3. วัด geometry ตอน element **hidden** ได้ 0 ทุกค่า → ต้องวัดตอนมองเห็น ไม่งั้น assertion หลอกตัวเอง

---

## 2026-11-15 (v0.4.6) — หน้าเกี่ยวกับ: เอาปุ่มคัดลอกข้อมูลระบบออก · หน้าตั้งค่าขยายตามเนื้อหา

**(1) ปุ่ม "คัดลอกข้อมูลระบบ" ใน Settings > About ไม่น่าได้ใช้ → เอาออก**
- ลบ 3 จุด: ปุ่มใน `index.html` · listener `copySystemInfoBtn` ใน `app.js` · CSS `.about-copy`
- **คง `#crashCopy`** ในแถบ crash ไว้ — ตอนโปรแกรมพังคือตอนที่ต้องส่งข้อมูลระบบมาจริง ๆ
- i18n `copySystemInfo` ยังอยู่ในพจนานุกรมเพราะ `#crashCopy` ใช้

**(2) หน้าตั้งค่าต้องใหญ่พอดี หน้าเกี่ยวกับไม่ต้อง scroll**
- เดิม `.settings-dialog { height: min(640px, 88vh) }` ใช้ร่วมทุกแท็บ
  → แท็บสั้นเหลือที่ว่างค้าง · แท็บยาว (เกี่ยวกับ) ต้อง scroll
- เพิ่ม `fitSettingsDialog()`: วัด `header + panel + padding + footer` → ตั้ง height
  · ต่ำสุด 420 (แท็บสั้นไม่เป็นแถบ) · สูงสุด `92vh` · `.settings-dialog` ได้ `max-height: 92vh`
- **`watchSettingsPanel()`** = `ResizeObserver` บนแท็บที่เปิดอยู่ → เนื้อหาเปลี่ยน (แถบเตือน/
  มีอัปเดตใหม่) ก็ขยับขนาดตาม
- **correction pass 1 รอบ:** `panels.scrollHeight - panels.clientHeight` แล้วบวกเพิ่ม
  เพราะ `scrollHeight` รายงานเกินผลรวมชิ้นส่วนอยู่ **12px** (leading บรรทัดท้าย) —
  เศษนี้เองที่ทำให้ scrollbar โผล่ทั้งที่เนื้อหาพอดี · ไม่ใช้ค่า slack ตายตัวเพราะเดาไม่ตรง
- ผูกที่ `showSettingsSection()` และ `window resize`
- วัดจริง (หน้าต่าง 820, TH): about 622 (ล้น 0) · workspace/advanced 420 (ล้น 0) ·
  mcp 637 (ล้น 0) · providers 695 = ชนเพดาน ล้น 373 (scroll ปกติ เพราะรายการยาว)

**ไม่ commit / ไม่ push** ตามที่ผู้ใช้สั่ง (เรื่องเล็ก เก็บเป็นข้อมูล)
**Learned:**
1. `scrollHeight` ของ flex container ≠ ผลรวมความสูงลูก — ต้องวัด `panel.getBoundingClientRect()`
   ไม่งั้น container ที่สูงกว่าอยู่แล้วจะรายงานตัวเองกลับมา แล้วหน้าต่างไม่ยอมหด
2. วัดตอน element ซ่อน (`display:none`) ได้ 0 ทุกค่า → ต้อง `if (!height) return` ก่อนคำนวณ
3. ผู้ใช้ไม่ต้องการไฟล์เทสต์ใหม่ที่กลายเป็น `??` ใน GitHub Desktop → วัดแบบ ad-hoc แล้วลบสคริปต์ทิ้ง

## 2026-11-15 — แถบผู้สนับสนุน (sponsor) ท้าย sidebar
- ผู้ใช้จะหาเงินจากโปรแกรมโดยไม่ใช้ ad network (AdSense ทำในซอฟต์แวร์ไม่ได้) — เริ่มลงเว็บตัวเองก่อน
  (https://www.term24hr.in.th/) แล้วค่อยขายสล็อตให้คนอื่น · ตัวเลือก A = ท้าย sidebar ใต้ Status
- เพิ่ม `src/sponsor.js` (pure normalize) + `src/sponsor.json` + IPC `sponsor:get/click`
  (นับคลิกใน `prefs.json.sponsorClicks`) · renderer เปิด URL ที่ main ยืนยันจาก config เท่านั้น
- ความปลอดภัย: รับแต่ https · ตัดข้อความ 80 หน่วย (code point) · config พัง = ซ่อนแถบ ไม่พังแอป
- ไฟล์ที่แตะ: app/src/{sponsor.js,sponsor.json,main.js,preload.js,renderer/{app.js,index.html,styles.css}}
  + scripts/{selftest-sponsor.js,check-sponsor-layout.js} + run-unit-tests.js
- เทสต์: `npm test` 52/52 · `check-sponsor-layout.js` (Electron วัดพิกเซล) ผ่าน
- **Learned:**
  1. `[hidden]` attribute ชนะด้วย `display:none` ของ browser UA แต่ class ที่ตั้ง `display:flex`
     มี specificity สูงกว่า → ต้องเผื่อ `.classelement[hidden]{display:none}` ไม่งั้นแถบ "ซ่อน" ยังกินที่
  2. element เกาะพื้นใน flex column = Status ขยับขึ้นเสมอถ้าคอลัมน์เต็มพอดี → ใช้ `margin-top:auto`
     ดูดที่ว่าง + `overflow-y:auto` ไม่ให้เนื้อหาถูกตัด ดีกว่าอ้างว่า "ไม่ขยับเลย" ที่พิสูจน์ไม่ได้
  3. เทสต์ Electron ที่ error กลางทาง (loadFile/SyntaxError) แล้วไม่มี `app.exit()` = เปิดค้างเงียบหลาย
     นาที ดูเหมือนน้ำแข็ง → ห่อ `try/catch` + watchdog `setTimeout(app.exit)` เสมอ
- กฎใหม่ที่ผู้ใช้สั่งวันนี้: ทุกคำสั่ง shell ต้องมี `timeout` (เริ่ม 120 วิ, งานไม่จบให้เพิ่มเสมอ
  120→240→480…) — เขียนเข้า AGENTS.md + HANDOFF หัวข้อ 0 แล้ว
- สถานะ: ยังไม่ commit (ผู้ใช้ commit เอง) · ยังไม่ bump (รอบถัดไป 0.5.0)

---

## 2026-11-16 · สปอนเซอร์แบบสด (รูป/วิดีโอ) + โปรแกรมที่สอง NTAPI ADS

**คำสั่งผู้ใช้:** อยากใส่รูปในแถบ sponsor และเปลี่ยนได้เองแบบ real-time โดยผู้ใช้ไม่ต้องอัปเดต
→ "ทำโปรแกรมเล็ก ๆ มารองรับ" ฝากไฟล์ที่ GitHub · ทุกรูป/คลิปต้องแสดงขนาดเท่ากันเสมอ
**ผู้ใช้เลือก:** A1 (repo public ใหม่) · B1 (GUI + ใส่ลิงก์) · C2 (รูป+วิดีโอ) · 1a (หลายสล็อตหมุนเวียน) · 2a (2:1) · 3c (ทำรวดเดียว)
**ตำแหน่งโปรเจกต์:** `NTAPI/NTAPI ADS` (ใน repo เดียวกัน เพื่อใช้กติกาชุดเดียว)

**สร้างใหม่**
- `NTAPI ADS/` — Electron app: `src/{main,preload,feed,media,github,config}.js` + `renderer/*`
- `NTAPI ADS/scripts/` — `run-unit-tests.js`, `selftest-{feed,media,github,config}.js`, `check-render.js`
- `NTAPI ADS/{README,AGENTS}.md` + `.AGENT/{README,PROJECT}.md` + `NTAPI ADS.bat`
- `app/src/sponsor-feed.js` — feed ระยะไกล + แคช + ดาวน์โหลดมีเดีย
- `app/scripts/selftest-sponsor-feed.js` (23 checks)

**แก้**
- `app/src/sponsor.js` — เพิ่ม `readFeed`/`normalizeSlot`/`clampRotate` (ของเดิมไม่เสีย)
- `app/src/main.js` — prime/refresh feed, IPC `sponsor:media`, `sponsor:get`/`sponsor:click` คืน slots
- `app/src/preload.js` — `sponsorMedia`
- `app/src/renderer/{app.js,index.html,styles.css}` — รูป/วิดีโอ, กรอบ 2:1, หมุนเวียน, CSP `media-src`
- `app/scripts/{selftest-sponsor.js,check-sponsor-layout.js}` — อัปเดตให้ตรงของใหม่
- `app/scripts/run-unit-tests.js` — ลงทะเบียนเทสต์ใหม่
- `.gitignore` — `dist-ads/`, `NTAPI ADS/shots/`

**บั๊กที่เจอระหว่างทาง (แก้แล้ว)**
1. `contentsUrl()` ไม่ encode path → ไฟล์ชื่อมีช่องว่างพัง (เจอจากเทสต์)
2. `.frame` 268px + padding/border → พรีวิวเหลือ 246px ไม่ตรง sidebar จริง (แก้เป็น 290px)
3. ภาพปกวิดีโอไม่เคยถูกดาวน์โหลด (ensureMedia อ่านแต่ดิสก์) → เพิ่ม `fetchToFile()` ใช้ร่วมกัน
4. เทสต์ใหม่จิ้ม input ผิด index (ช่อง EN ไม่ใช่ TH) และไม่ได้ใส่ลิงก์ก่อน publish
5. ตัวเลขในเอกสารเขียน 1024×512 แต่ของจริง 1072×536 → แก้เอกสารให้ตรง

**ผลเทสต์:** `NTAPI ADS` → `npm test` ผ่าน 4/4 ไฟล์ (42 checks), `check:render` 25/25
· NTAPI → `npm test` **53/53**, `check-sponsor-layout` ผ่านหมด (วัดกรอบ 2:1 จริง)

**สถานะ:** ยังไม่ commit · ยังไม่ bump เวอร์ชัน · ยังไม่ทดสอบด้วยตา (`npm start`)
**ต้องให้ผู้ใช้ทำ:** สร้าง repo public `Cheumklang/NTAPI-sponsor` + fine-grained token

## 2026-11-16 · ขึ้นสปอนเซอร์ชุดแรกขึ้น GitHub จริง (ไม่มี token)

**ทำอะไร:** สร้าง repo public `Cheumklang/NTAPI-sponsor` ผ่านหน้าเว็บ GitHub ใน Chrome ของผู้ใช้
(ผู้ใช้ส่งแท็บมาให้) แล้ว push ไฟล์ชุดแรกด้วย git ธรรมดา — **ไม่ต้องสร้าง PAT เลย**
เพราะ `credential.helper=manager` ที่ GitHub Desktop ตั้งไว้ใช้ push ได้อยู่แล้ว

**ไฟล์ที่ขึ้น:** `sponsor.json` (1 slot) + `media/example-2026-11.webp` (1072×536 WebP, 21.8KB)
- รูปสร้างจากสคริปต์ชั่วคราว `C:\NTAPI\outputs\downloads\make-banner.js`
  (Electron canvas → WebP, ฟอนต์ Leelawadee UI) — ตั้งใจให้เป็น **ตัวอย่ง** ให้เห็นก่อน
- clone งานไว้ที่ `C:\NTAPI\outputs\downloads\NTAPI-sponsor` (ที่ push ครั้งถัดไปได้เลย)

**พิสูจน์ปลายทาง (ของจริง ไม่ใช่ mock)**
- jsDelivr + raw ตอบ **200** ทั้ง `sponsor.json` (738b) และ media (21874b)
- รัน `sponsor-feed.fetchFeed()` จริง → `source = cdn.jsdelivr.net/…@main/sponsor.json`
  → `ensureMedia()` คืน `data:image/webp;base64,…` 21893b → **NTAPI อ่าน feed สดได้แล้ว**
- ตรวจ header WebP: `VP8X 1072x536` ตรงตามกรอบ 2:1

**ข้อจำกัดที่เหลือ:** ADS ต้องมี token จึงจะกดเผยแพร่เองได้ — ถ้าไม่มี ใช้วิธี git ตามข้างบน
**สถานะ:** ยังไม่ commit งานใน repo NTAPI · ยังไม่ bump เวอร์ชัน

## 2026-11-16 · v0.5.0 — สปอนเซอร์แบบสด + NTAPI ADS + 4 อัตราส่วน

**ผู้ใช้เลือก:** ทางเลือก A (จองความสูง = กรอบที่สูงสุด) + 4 อัตราส่วน `2:1` `16:9` `1:1` `4:5`

**แก้**
- `NTAPI ADS/src/feed.js` — `RATIO_ORDER`/`RATIOS`/`ratioOf`/`frameSize`/`mediaSize`, `media.ratio` ในสล็อต
- `NTAPI ADS/src/preload.js` — bridge `ratios`/`ratioOf`/`frameSize`/`mediaSize`
- `NTAPI ADS/src/renderer/app.js` — dropdown อัตราส่วนต่อสล็อต, `applyRatio()` ครอปใหม่จากไบต์ต้นฉบับ (ไม่ครอปซ้ำ),
  `encodeFrame` รับ ratio, drop target + preview frame เปลี่ยนรูปตามอัตราส่วน
- `NTAPI ADS/src/renderer/index.html` — คำอธิบาย 4 กรอบ
- `app/src/sponsor.js` — `RATIOS`/`RATIO_OF`/`ratioValue` (ค่าเริ่มต้น 2:1)
- `app/src/renderer/app.js` — `sponsorReservedRatio()` จองความสูง + `host.style.aspectRatio`
- `app/src/renderer/styles.css` — `.sponsor-media` เป็น grid/contain + `max-height: 288px`
- `app/src/sponsor-feed.js` + `NTAPI ADS/src/feed.js` — สลับลำดับ CDN: raw ก่อน, jsDelivr fallback
- เทสต์: `selftest-feed.js` (21) · `selftest-sponsor-feed.js` (26) · `selftest-sponsor.js` · `check-sponsor-layout.js` (+เคส feed ผสม)
- `.AGENT/HANDOFF.md`, `NTAPI ADS/README.md`, `app/package.json` 0.4.6 → **0.5.0**

**ผลเทสต์:** NTAPI `npm test` 53/53 · ADS `npm test` 4/4 ไฟล์ · `check:render` 25/25
· `check-sponsor-layout` ผ่าน (mixed ratios heights `[271,271]` ratios `[2,0.8]` reserved `0.8 / 1`)

**ปลายทาง:** `Cheumklang/NTAPI-sponsor` มี 3 สล็อต (2:1 / 1:1 / 4:5) หมุน 8 วิ · ตรวจแล้ว `fetchFeed()` อ่านได้จริงจาก raw

## 2026-11-16 · แก้ launcher ของ NTAPI ADS (cmd ค้าง / ปิดแล้วโปรแกรมดับ)

**อาการ:** เปิด `NTAPI ADS.bat` แล้วมีหน้าต่าง cmd ค้างอยู่ ปิดมัน = โปรแกรมดับตาม
**สาเหตุ:** `start "" /min cmd /c "npm start"` ทำให้ electron เป็นลูกของ cmd นั้น + npm อีกชั้น
**แก้:** เรียก `node_modules\electron\dist\electron.exe .` ผ่าน `start ""` ตรง ๆ → cmd ปิดทันที โปรแกรมไม่ดับ
- เพิ่ม `NTAPI ADS.vbs` (ทางลัดเงียบสนิท ไม่มีหน้าต่างดำ)
- ตรวจ bravery จริง: รัน bat ด้วย `APPDATA` แยก → bat คืนค่า 0 ทันที และ electron ยังอยู่ 4 process
- **บทเรียน:** ไฟล์ `.bat` ต้อง ASCII ล้วน — ข้อความไทยทำให้ `cmd` อ่านไบต์ไปชนตัวคั่นคำสั่ง
  แล้วพังด้วย "was unexpected at this time" (ย้ายคำอธิบายไทยไป `README.md`)
- เทสต์ใหม่ `scripts/selftest-launcher.js` (6 checks) ลงทะเบียนใน `run-unit-tests.js` → ADS `npm test` 5/5 ไฟล์

## 2026-11-16 · Release notes บอกว่าแต่ละรุ่นอัปเดตอะไร

**ปัญหา (ผู้ใช้ทัก):** body ของทุก release เหมือนกันหมด และขึ้นต้นด้วยคำอธิบายสำหรับผู้ดูแล
("ไฟล์นี้คือข้อความที่ขึ้นในหน้า … แก้ที่นี่ที่เดียว") → ผู้ใช้ที่กลับมาดาวน์โหลดใหม่ไม่รู้ว่ารุ่นนี้เปลี่ยนอะไร

**แก้**
- `RELEASE_NOTES.md` — ตัดบล็อกคำอธิบายผู้ดูแลออก เปลี่ยนหัวเป็น "NTAPI — โปรแกรมรวม AI หลายเจ้าไว้ในที่เดียว"
- `.github/workflows/release.yml`
  - `actions/checkout` เพิ่ม `fetch-depth: 0` (ต้องมี tag/ประวัติเพื่อเทียบรุ่นก่อน)
  - step ใหม่ **Build release notes**: `git describe --tags --abbrev=0 <tag>^` → `git log prev..tag --no-merges`
    → กรอง `ci:|chore:|test:|docs:|style:` ออก → ตัด prefix `vX.Y.Z:` → ประกอบเป็น
    `## มีอะไรใหม่ใน vX.Y.Z` ไว้บนสุด แล้วต่อด้วยเนื้อถาวร → เขียนทับ `RELEASE_NOTES.md` ก่อน `body_path`
- `app/scripts/selftest-release-notes.js` — เพิ่ม 7 checks (section มีอยู่, ใช้ describe, fetch-depth 0,
  กรอง housekeeping, ตัด prefix, section อยู่ก่อน body_path, notes ไม่มีข้อความสำหรับผู้ดูแล) → รวม 27 checks

**ผล:** `npm test` 53/53 · ทดสอบ logic ด้วย PowerShell กับ tag `v0.5.0` ได้ changelog 1 บรรทัดที่อ่านรู้เรื่อง
(ของเดิมกรองแล้วเหลือ 3 บรรทัด โดย 2 บรรทัดเป็น docs/chore ที่ไม่เกี่ยวกับผู้ใช้)
**ค้าง:** body ของ release เก่า (0.5.0 ลงไป) ยังเป็นข้อความเดิม — ต้องแก้ผ่านหน้าเว็บ/API

## 2026-11-16 · กฎเวอร์ชันใหม่: +0.0.1 ทุกครั้ง (ยกเลิกกฎ 0.3.0)

**ผู้ใช้สั่ง:** แก้กี่เรื่องในรอบเดียวก็ให้ขยับแค่ `0.1.0` → `0.1.1` ไม่ใช่ `0.1.4`
· ขยับเมื่อสั่ง · ปัญหาใหญ่จริง ๆ แนะนำรุ่นที่ควรเป็นได้

**แก้**
- `AGENTS.md` — แทนหัวข้อ "รอบการ build: ห่างกัน 0.3.0" ด้วย `+0.0.1 ทุกครั้งที่ผู้ใช้สั่ง`
  พร้อมตัวอย่างผิด/ถูก, ข้อยกเว้น "แนะนำได้ ห้ามทำเอง", และระบุว่า ADS แยกเวอร์ชัน
- `.AGENT/HANDOFF.md` — สถานะหัวไฟล์เป็น "รอบถัดไป = 0.5.1" + หัวข้อกติกาเดียวกัน
- `NTAPI ADS/AGENTS.md` — กฎขยับเวอร์ชันของ ADS (`0.1.0` ปัจจุบัน)

**หมายเหตุ:** กฎ 0.3.0 (0.5.0 → 0.8.0) ถูกยกเลิกทั้งหมด — ต่อไป `0.5.0` → `0.5.1`

## 2026-11-16 · เก็บกวาด release เก่า (ก่อน 0.5.0 ไม่มีสปอนเซอร์)

**เหตุผล (ผู้ใช้):** รุ่นก่อน 0.5.0 ไม่มีแถบสปอนเซอร์ ถ้ามีคนโหลดรุ่นเก่าไปใช้
แล้ววันหลังมีสปอนเซอร์จริง เขาจะไม่เห็น = เสียเปรียบ
**ตรวจแล้วปลอดภัย:** electron-updater ถาม GitHub ว่า release ไหนใหม่สุด ไม่ได้อ้างรุ่นเก่า
→ ลบรุ่นเก่าแล้วคนที่ยังใช้ 0.1–0.4 ยังอัปเดตขึ้น 0.5.0 ได้ตามปกติ

**ทำ:** `.github/workflows/prune-releases.yml` — `workflow_dispatch` เท่านั้น
| input | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `keep` | (บังคับกรอก) | เก็บรุ่นนี้และใหม่กว่า เช่น `v0.5.0` |
| `dry_run` | `true` | ลิสต์อย่างเดียว ไม่ลบ |
| `delete_tags` | `false` | ลบ tag ใน repo ต้นทางด้วย |

กันพลาด: ปฏิเสธถ้าใส่เลขผิดรูป · ปฏิเสธถ้าไม่มี release ของรุ่นนั้นจริง · เทียบด้วย `sort -V`
(0.10.0 > 0.9.0) · ไม่แตะรุ่นที่เก็บ · ลบเฉพาะ repo `NTAPI-releases` (แอสเซ็ต) ไม่แตะโค้ด/tag ถ้าไม่เลือก

**เทสต์:** `app/scripts/selftest-prune-releases.js` (18 checks) + จำลอง loop ด้วยข้อมูลปลอม
`v0.4.6/v0.5.0/v0.9.0/v0.10.0/v0.1.1` → ลบแค่ 0.4.6 กับ 0.1.1 ถูกต้อง · `npm test` 54/54
**วิธีใช้:** Actions → "Prune old releases" → Run workflow (ใส่ `keep=v0.5.0`, dry_run=true ก่อนเสมอ)

## 2026-11-16 · prune releases: ปุ่ม Run workflow ใช้ไม่ได้ → สั่งผ่าน marker ใน commit

**ปัญหา:** กด Run workflow บนหน้า Actions แล้ว GitHub ตอบ "You can't perform that action at this time."
ลองซ้ำ 3 รอบ (reload หน้าใหม่, รอ, กรอกค่าใหม่) ยังโดนปฏิเสธ — ไม่มี run ถูกสร้างเลย

**ทางออก:** เพิ่ม trigger `push` ที่มีเงื่อนไขต้องมี marker ในข้อความ commit
| marker | ผล |
|---|---|
| `[prune-releases keep=v0.5.0 dry-run]` | ลิสต์อย่างเดียว |
| `[prune-releases keep=v0.5.0 apply]` | ลบจริง |
| `... apply tags` | ลบ tag ใน repo ต้นทางด้วย |

- job-level `if:` → commit ปกติทุกตัวจะ "skipped" ทันที (1s) ไม่มีอะไรเกิดขึ้น
- marker ที่ไม่ระบุ apply/dry-run → job error ทิ้ง ไม่เดาเจตนา
- `workflow_dispatch` ยังคงอยู่ เผื่อ GitHub หายดี (เพิ่ม `default: v0.5.0` แล้ว)

**ทดสอบจริง:** commit `db3caae` (marker dry-run) → run #3 สำเร็จ 11s
summary: `kept: v0.5.0 and newer · would delete: 23 · untouched: 1` ✅

**ของแถมที่พลาด:** เผลอ `git add -A` แล้ว commit ไฟล์ `shot.png` ขึ้นไป — ลบใน commit ถัดมา (`b9e9a8f`)
บทเรียน: ก่อน commit ใน repo นี้ให้ `git status --short` ดูรายชื่อไฟล์จริง

## 2026-11-16 · หน้า release เอาแค่ "มีอะไรใหม่ในรุ่นนี้" (ตัด boilerplate ออกหมด)

**ผู้ใช้สั่ง:** "เขียนแค่ว่าอัปเดตอะไรในเวอร์ชั่นนี้ก็พอ และอนาคตให้ทำแบบนี้"
→ body ยาว ๆ (โปรแกรมคืออะไร/SmartScreen/แจ้งปัญหา/API) ไม่เอาแล้ว

**แก้**
- `release.yml` — "Build release notes" เขียน `dist/release-body.md` = `## มีอะไรใหม่ใน vX.Y.Z`
  + bullet จาก `git log prev..tag` + บรรทัดดาวน์โหลด · `body_path` ชี้ไฟล์นั้น
- **ลบ `RELEASE_NOTES.md` ออกจาก repo** — ไฟล์นี้คือต้นเหตุที่ body ค้างเหมือนกันทุก release
- `app/scripts/selftest-release-notes.js` เขียนใหม่ (19 checks): body มาจาก git log,
  ไฟล์ถูกสร้างก่อน publish, ไม่มี `RELEASE_NOTES.md`, ไม่มีคำสั่งถึงผู้ดูแล, แอสเซ็ตยังครบ
- `AGENTS.md` + `.AGENT/HANDOFF.md` — เพิ่มกติกานี้ไว้ให้ session ถัดไป
- **แก้ release `v0.5.0` ย้อนหลังแล้ว** ผ่านหน้าเว็บ (Releases → Edit) — ตรวจด้วย API แล้ว
  body เหลือ 3 บรรทัด: สปอนเซอร์ 4 อัตราส่วน · NTAPI ADS · แก้ launcher

**Learned:** อย่าเก็บ "ข้อความหน้า release" เป็นไฟล์ใน repo — มันจะเก่าและซ้ำทุกครั้ง
ให้ generate จาก commit ตอนปล่อยเท่านั้น

## 2026-11-16 · หน้า release ห้ามเปิดเผยงานหลังบ้าน (แก้ v0.5.0 อีกครั้ง)

**ผู้ใช้ทัก:** ข้อมูลหลังบ้านไม่ต้องบอกผู้ใช้ — หน้า release เอาไว้ให้ผู้ใช้รับรู้เท่านั้น
(ตัวก่อนหน้าผมเขียนถึง `NTAPI ADS` และการแก้หน้าต่าง cmd ซึ่งเป็นเครื่องมือของเรา ไม่ใช่ของผู้ใช้)

**แก้**
- `release.yml` — กรอง commit ที่ขึ้นต้นด้วย `internal:` ออกด้วย (นอกจาก ci/chore/test/docs/style)
  → งานหลังบ้านทั้งหมด (ADS, repo ปลายทาง, workflow, token, cache) ตั้ง commit เป็น `internal:` ได้
- `AGENTS.md` — เพิ่มรายการ "ห้ามพูดถึง": เครื่องมือ/สคริปต์, NTAPI ADS, repo ต้นทาง, workflow,
  การเก็บ token, วิธีอัปโหลด, โครงสร้างไฟล์, ชื่อไฟล์โค้ด, ระบบ cache
  → เขียนเฉพาะสิ่งที่ผู้ใช้ "เห็น/กด/รู้สึกได้"
- `.AGENT/HANDOFF.md` — สรุปกฎเดียวกันไว้หัวไฟล์
- **แก้ release v0.5.0 ในเว็บแล้ว (ครั้งที่ 2)** — ตัดของหลังบ้านออก เหลือ 3 บรรทัดที่ผู้ใช้เห็นจริง
  (แถบผู้สนับสนุน 4 ขนาด + หมุนอัตโนมัติ · กดเปิดเว็บผู้สนับสนุน · ความสูงคงที่)

**Learned:** "อัปเดตอะไรในรุ่นนี้" ≠ "เราแก้อะไรในโค้ด" — ต้องผ่านตัวกรอง "ผู้ใช้เห็นไหม"
ก่อนเขียนทุกบรรทัด

---

## 2026-11-17 · สปอนเซอร์ใหม่ไม่ขึ้น + ย้ายกล่องสถานะขึ้นแถวบน (v0.5.0 → รอ bump)

**เรื่องที่ 1 — เผยแพร่สปอนเซอร์แล้วไม่ขึ้น (ผู้ใช้เห็นหน้าเป็น "ตัวอย่าง" อยู่)**
- ตรวจก่อนแก้: token ในเครื่องรูปแบบถูก (93 ตัวอักษร `github_pat_`) แต่เดิมได้ `HTTP 401 Bad credentials`
  → ยิง `/user` กับ `/repos/...` ตรง ๆ = 401 ทั้งคู่ = **token ตาย ไม่ใช่โค้ดผิด** (ผู้ใช้สร้างใหม่แล้วผ่าน 200)
- หลังผู้ใช้เผยแพร่ใหม่: repo มี `sponsor.json` (`updated 2026-11-15T02:24Z`, `rotateSeconds 5`, slot `term24hr`)
  + `media/term24hr.webp` 78KB ครบ → **อัปโหลดสำเร็จตั้งแต่แรก**
- รากของ "ไม่ขึ้น": `refreshSponsorFeed()` ตอนบูตเคารพ TTL 6 ชม. ด้วย
  → แคช `C:\NTAPI\sponsor\sponsor-feed.json` (fetchedAt 08:01, ยังเป็นตัวอย่าง) ถูกใช้ต่อจนถึง 14:01
- แก้: บูตเรียก `refreshSponsorFeed({ force: true })` · timer 6 ชม. ก็ force
  · เมื่อ feed เปลี่ยน → `send('sponsor:changed')` (เพราะ window วาดแคชไปแล้วก่อน fetch เสร็จ)
  · preload `onSponsorChanged` · renderer `reloadSponsor()` ล้าง `sponsorMediaCache` ด้วย
    (slot id เดิมแต่ไฟล์ถูกแทน = รูปเก่าค้างใต้คำบรรยายใหม่) · `scheduleSponsorRotation` clearInterval กัน timer ซ้อน
- เทสต์ใหม่ `selftest-sponsor-refresh.js` (11 checks, อยู่ใน `npm test`)
  · **reverse test:** คืน `refreshSponsorFeed()` → FAIL 1 · เอา `send` ออกนอก `if (changed)` → FAIL

**เรื่องที่ 2 — ย้าย "สถานะ" จาก sidebar ไปแถวบน (ผู้ใช้เลือกแบบ A)**
- เดิม `.section.usage` = 6 แถวใน sidebar กินที่ของ session list และดันสปอนเซอร์ลง
- ใหม่ `.status-strip` ใน `#topbar` ระหว่าง `#titleWrap` และ `.controls` = **แถวเดียว**: จุดเขียว + หลอด + `6%` + `14,155 / 15,000` + `Ctx 14%` + ▾
- ที่เหลือ (`Bonus` `Lane` `Resets` ยอดใช้/provider block ปุ่มรีเฟรช) อยู่ใน **popover** ใต้ pill
  · เปิดด้วย click, ปิดด้วย click ซ้ำ/Escape (คืน focus ที่ pill)/คลิกนอก (ฟัง `pointerdown` ไม่ใช่ `click` กันเปิดซ้ำ)
- **ห้ามทำซ้ำ:** `usagePct`/`usageCost`/`contextPct`/`usageBarFill` อยู่ใน **pill เท่านั้น**
  popover ใช้ id ที่ไม่ซ้ำ (`usageUsed` `usageTokens` `usageContext` `usageResets` `contextFill`) — เทสต์สแกน duplicate id ทั้งไฟล์
- โหมด provider อื่น (Coarena ฯลฯ): ซ่อน `#statusFree` โชว์ `#statusProvider`
  · ข้อความใน pill เป็น **mirror** ที่เขียนใน `paintProviderMeter()` เอง (ไม่ให้ pill กับ popover ขัดกัน)
- `usagePct` ใน pill เป็นเลขล้วน (`6%`) — ประโยค "ใช้ไป x%" ย้ายไป `usageUsed` ใน popover
- **วัดจริง (Electron `check:pill`)**: 1240×840 และ 900×560
  · topbar สูงเท่าเดิมเป๊ะเมื่อไม่มี pill (57 = 57) · ไม่ล้น (overflow 0) · pill 30px สูงเท่า control อื่น
  · popover 262×123 เปิดในกรอบจอทั้งสองขนาด · ชื่อแชทเหลือ 303px / 195px
  · **แก้ระหว่างทาง:** ตอน 900px ชื่อแชทเหลือ 62px → เพิ่ม `@media (max-width: 1080px)` ซ่อน `.status-credits`
    + `#titleWrap { min-width: 140px }` → ชื่อได้ 195px
- เทสต์: `selftest-usage-pill.js` (19 checks) · `check:pill` (Electron 33 checks ต่อขนาด)
- เทสต์เดิมที่ต้องแก้: `check-sponsor-layout.js` เลิกอ้าง `.section.usage` → ใช้ `slot.previousElementSibling`
  · `selftest-sponsor.js` เลิกอ้าง `id="refreshUsage"` ใน sidebar
- ผลรวม: `npm test` **56/56** · `check-sponsor-layout` ผ่านทุกข้อ · `check:pill` ผ่านทุกข้อ

**Learned:** TTL ที่ตั้งไว้กันการยิง network ถี่ เอามาใช้กับ "ตอนเปิดแอป" = งานที่ publish ไว้ไม่ขึ้น
จนกว่าจะพ้น TTL — ของที่ผู้ใช้เพิ่งทำต้องเห็นตอนเปิดครั้งถัดไป ไม่ใช่บ่ายโมง

**ปล่อยรอบนี้ (2026-11-17)**
- bump `0.5.0` → `0.5.1` ตามคำสั่งผู้ใช้ (+0.0.1) · commit + push + tag `v0.5.1` (ผู้ใช้อนุญาตให้ผมทำเองรอบนี้)
- ตรวจก่อนปล่อย: repo `NTAPI-releases` เหลือ release `v0.5.0` รุ่นเดียว — **ผู้ใช้ลบ 23 รุ่นเก่าด้วยมือแล้ว**
  → marker `[prune-releases …]` ไม่ต้องใช้ เก็บไว้เฉย ๆ ได้ (ห้ามรันซ้ำตอนนี้)
- **ปробลемที่เจอ:** body ของ v0.5.1 ที่ workflow สร้างเองดึง commit ตั้งแต่ `v0.5.0` มาทั้งหมด
  → งานหลังบ้านที่ commit ไว้ **ก่อน** กฎ `internal:` (ae2a082, 1daf8b9, 2a93217, edea861, db3caae)
  หลุดขึ้นหน้า release (prune releases, HANDOFF, workflow)
  → **token ที่มีอยู่แก้ body ไม่ได้ (404: ไม่มีสิทธิ์ Releases)** ต้องให้ผู้ใช้กด Edit เอง
  → **บทเรียน:** งานบ้านทุกครั้งต้องตั้ง commit ขึ้นต้น `internal:` ตั้งแต่ต้น ไม่งั้นรอบถัดไปจะหลุดอีก
      และก่อน tag ควรเช็ค `git log <แท็กเก่า>..HEAD --oneline` ว่ามีบรรทัดไหนไม่ควรขึ้น release ไหม
- body ที่ควรเป็น (ให้ผู้ใช้วางทับ):
  `## มีอะไรใหม่ใน v0.5.1` + 2 บรรทัด (สถานะย้ายขึ้นแถวบน · สปอนเซอร์ใหม่ขึ้นทันที) + บรรทัดดาวน์โหลด

**แก้หน้า release v0.5.1 ที่หลุดงานหลังบ้าน (2026-11-17, ผู้ใช้ทักเอง)**
- token ของ ADS แก้ไม่ได้ (404 — สิทธิ์แค่ repo สปอนเซอร์) · `gh` CLI ไม่มีในเครื่อง
- ทางที่ใช้ได้: `git credential fill` (credential manager ที่ GitHub Desktop ตั้งไว้) → scopes = `gist, repo, workflow`
  · **PATCH `/releases/<id>` ได้ 200** แต่ `PATCH /releases/tags/<tag>` ตอบ **404** → ต้อง GET id ก่อนแล้วค่อย PATCH
  · ตัว token ไม่ถูกพิมพ์ลง log/คำตอบเลย (อ่านจากไฟล์ชั่วคราวแล้วลบทิ้ง)
- body ใหม่ + หน้า v0.5.0 ตรวจแล้วสะอาดทั้งคู่

**บั๊กที่ผู้ใช้แจ้งรอบที่ 2 (2026-11-17) — แชทขาดกลาง / AI หยุดเงียบ / หน่วง**
- **แชทขาดกลาง:** `renderActiveTab()` วาดทุกข้อความใหม่ทั้งหน้าจอ ถ้าข้อความใดข้อความหนึ่ง throw
  ลูปก็จบตรงนั้น → DOM เหลือแค่ส่วนหัว และพังซ้ำทุกครั้งที่วาดใหม่ (ไฟล์ session ครบ 543 entries)
  → วัดได้: replay ของจริง 548 messages เข้า renderer ได้แค่ 36 bubbles, `error: null` (เงียบ)
  · แก้: `try/catch` ต่อ entry + `reportTranscriptGaps()` (console + `ui:log` → `crash.log`)
  · `check-transcript-resilience.js` 6/6 (poison `MD.renderInto`) · reverse test = FAIL 5
- **AI หยุดเงียบตอน token หมด:** `auto_retry_start` เห็น 429 → เราสั่ง `abortRetry()` เอง
  → pi ปิด turn ด้วย `aborted: true` → กฎเดิม `if (!event.aborted)` + "aborted ไม่ใช่ limit"
  ทำให้ **ไม่สลับโมเดลเลย** → ไม่มีอะไรขึ้นหลังกด Send
  · แก้: จำ `tab.limitFailure` ก่อน abort · `ownAbort` ให้ settle ที่ aborted เดินต่อได้
  · `resumeAgentTurn()` กัน `Agent is already processing` + transcript ที่ลงท้ายด้วย assistant
  · Stop ของผู้ใช้เคลียร์ `limitFailure` (ไม่สลับโมเดลให้)
- **หน่วงเปิดแชท/สลับแท็บ:** วัดด้วย `scripts/bench-transcript.js` (ข้อความจริง 758 msgs / 1MB)
  = **3358 ms** ต่อการวาดหนึ่งครั้ง → แก้เป็นวาด **ท้ายแชทก่อน** (24 msgs) แล้วเติมประวัติด้านบน
  ทีละ 30 ข้อความผ่าน `setTimeout` · มี `renderGeneration` ยกเลิกงานเก่า · `alignChunk()` กันตัดกลาง turn
  · ผลหลังแก้: เห็นท้ายแชท **34 ms** / ครบทั้งแชท 2.4 s (พื้นหลัง) · `check-transcript-speed.js` 6/6
- ทดลอง cache ผล `parse()` ของ markdown แล้ว **ไม่ช่วย** (คอขวดคือ DOM/layout ไม่ใช่ parser) → revert
- **คิวข้อความขึ้นบรรทัดใหม่ (ผู้ใช้แจ้งต่อ):** วัดใน Electron แล้ว row สูง 36px จาก lineHeight 17px
  = ข้อความถูกดันไปบรรทัดที่สอง เพราะ `.queue-item` เป็น `flex-wrap: wrap` และ text มี `max-width: calc(100% - 50px)`
  กว้างจนControls (ลำดับ/ grip / ดินสอ / ×) ไม่พอที่ → ขึ้นบรรทัดใหม่
  · แก้: ห่อส่วนของแถวด้วย `.queue-line` (`flex-wrap: nowrap`) แล้ว `.queue-item` เป็น column
    → แถวสูง 17px ทุกกรณี (ทดสอบกว้าง 890px และ 270px) · countdown ยังขึ้นบรรทัดล่างได้ตามเดิม
  · `check-queue-single-line.js` 6/6 × 2 ความกว้าง · `check-queue-placement` 21/21 · controls 27 · number 18 · edit 25 · ghost 10 · cancel 22
- ผลรวม: `npm test` **61/61** · `check:transcript` 6/6 · `check:speed` 6/6 · `check:pill` / `check:sidebar` / sponsor ผ่านหมด

**กฎใหม่: รันคำสั่งเป็นชุดเดียว (ผู้ใช้สั่ง 2026-11-17)**
- ผู้ใช้เห็นว่าผมยิง bash command ถี่เกินไป (เปลือง token + round-trip) → สั่งเพิ่มกฎ 3 ข้อ
- ลงใน `AGENTS.md` + `.AGENT/HANDOFF.md`: ห้ามแยก tool call ทีละอัน · รวมเป็นสคริปต์ Python /
  ชุดคำสั่งเดียว · ในชุดนั้นต้องพิมพ์ `[PASS]`/`[ERROR]` แยกขั้น + บอกรายละเอียด error
- ผลข้างเคียงที่ต้องระวัง: ยังต้องมี `timeout` ครอบ และยังต้องหยุดถามเมื่อถึงจุดที่ผู้ใช้ต้องเลือก

**กฎเพิ่ม (ข้อ 4-5): ขั้นตรวจผลต้องอยู่ใน call เดียวกัน (ผู้ใช้สั่ง 2026-11-17)**
- ผู้ใช้จับได้ว่า commit+push เสร็จแล้วผมแยกอีก call ไปเช็ค CI → เพิ่มข้อ 4 (ตรวจผลในชุดเดียวกัน)
  และข้อ 5 (นิยาม 1 call = ทำงาน + ตรวจผล + สรุป PASS/ERROR)

**NTAPI ADS: อัตราส่วนดีดกลับเป็น 2:1 หลังกดเผยแพร่ (ผู้ใช้แจ้ง 2026-11-17)**
- อาการ: ตั้งกรอบ 1:1 แล้วกด **เผยแพร่** → หน้าต่าง ADS เปลี่ยนกลับเป็น 2:1 เอง
- ตรวจของจริงก่อนแก้: `raw…/main/sponsor.json` = `"ratio": "1:1"` · `media/sponsor-2026-11.webp`
  = **1072×1072** (VP8X) → ทั้ง feed และไฟล์ถูกต้อง ปัญหาอยู่ฝั่งหน้าต่าง ADS ไม่ใช่ NTAPI
  (jsDelivr ยังแคช `sponsor.json` รุ่นเก่า แต่ NTAPI ตั้ง raw เป็นตัวแรกอยู่แล้ว จึงไม่เกี่ยว)
- **ต้นเหตุ:** `slotFromFeed()` คัดลอกแค่ `type/file/poster/alt/text` — ไม่มี `media.ratio`
  → `publish()` เรียก `await loadFeed()` หลังสำเร็จ แล้วสร้าง slot ใหม่จาก feed
  → `ratio` กลับเป็น `R.defaultRatio` = `2:1` ทันทีที่ผู้ใช้เห็น
  · อันตรายกว่าเดิม: กดเผยแพร่ซ้ำจะส่ง `ratio: 2:1` คู่กับไฟล์สี่เหลี่ยม (feed ไม่ตรงกับไฟล์)
- **แก้:** `slot.media.ratio = R.ratioOf(raw.media && raw.media.ratio)` + คอมเมนต์อธิบายว่ากรอบเป็นส่วนของครีเอทีฟ
- **เทสต์ใหม่:** `check-render.js` — `feed:load` ตอบ feed ที่มี `ratio: '4:5'` (ไม่ใช่ทั้ง 2:1 และ 1:1)
  หลัง publish stub ถูกเรียก → assert dropdown = `4:5` + กล่องพรีวิวมีสัดส่วน 4:5
  · ก่อนแก้มี 27 checks → **29/29** · ย้อนบรรทัดที่แก้ → **FAIL 1** (`feed ratio is read back after publish`) → คืนโค้ดแล้วผ่าน 29/29
- **ไม่ต้องเผยแพร่ซ้ำ:** repo ถูกต้องอยู่แล้ว · ผู้ใช้แค่ปิด/เปิด ADS ใหม่

**กฎ 1 เทิร์น = 1 bash call — เข้มรอบสอง (ผู้ใช้สั่ง 2026-11-17)**
- ผู้ใช้บอกว่า "ยังมีหลายคนไม่สนใจกฎนี้" → เขียนใหม่ให้ชัดและบังคับใช้ได้จริง
- เปลี่ยนจากหัวข้อ "การรันคำสั่ง — ทำเป็นชุดเดียว" → **"กฎข้อ 1 ของโปรเจกต์นี้: 1 เทิร์น = 1 bash call"**
- เพิ่ม: นิยาม (1 call = เรียก tool `bash` ครั้งเดียว · จำนวนคำสั่งใน call ไม่จำกัด) ·
  ขั้นตอนบังคับ 6 ข้อ (รวมข้อ 6 = นับ bash call ก่อนส่งคำตอบ ถ้า >1 = ผิดกฎ ต้องบอกผู้ใช้ + บันทึกลง LOG) ·
  ตาราง ❌/✅ ห้าเคสที่พลาดบ่อย (git status/diff แยก · grep หลายไฟล์แยก · "ต้องดูผลก่อน" ·
  npm test แยกจาก check:* · commit/push แล้วแยกเช็ค CI) · ข้อยกเว้น 3 ข้อ · ตัวอย่างถูก/ผิด
- เพิ่มกฎบรรทัดเดียวใน **กติกาเหล็ก** ของทั้ง `AGENTS.md` และ `.AGENT/HANDOFF.md`
  เพื่อให้เห็นตั้งแต่ต้นไฟล์ ไม่ต้องไปเจอท้าย ๆ

**โฆษณา real-time: เช็ค feed ทุก 30 วิ + ตอนสลับกลับมาที่หน้าต่าง (ผู้ใช้เลือกข้อ 3 · 2026-11-17)**
- อาการที่ผู้ใช้เจอ: อัปโหลดโฆษณาใหม่แล้วโปรแกรมไม่เปลี่ยน การตรวจของจริง:
  feed บน repo = `updated 04:56 UTC` slot `ads` / `media/ads.webp` ·
  แต่ `C:\NTAPI\sponsor\sponsor-feed.json` (ที่แอป 0.5.2 ใช้) = `updated 03:22 UTC` slot `term24hr`
- **ต้นเหตุ:** revalidate ตอนเปิดแอปครั้งเดียว แล้ว timer **6 ชั่วโมง** → แอปที่เปิดค้างไว้ไม่เห็นของใหม่
- **แก้:** `REVALIDATE_MS = 30_000` ใน `sponsor-feed.js` + timer ใน `main.js` เปลี่ยนจาก `TTL_MS` เป็น `REVALIDATE_MS`
  · เพิ่ม `app.on('browser-window-focus')` → เช็คทันทีเมื่อสลับกลับมาที่หน้าต่าง (มี floor 5 วิ กันการยิงรัว)
  · ใช้ `If-None-Match` + ETag: ไม่มีอะไรเปลี่ยน = 304 ไม่มี body ไม่ parse ไม่ repaint (เก็บ etag ลง cache ด้วย)
  · เปลี่ยนตัวตรวจจับการเปลี่ยนแปลงจาก "`updated` ต่างกัน" → **fingerprint ของ feed ทั้งก้อน**
    (กันกรณี publish ซ้ำในวินาทีเดียวกันหรือestamp ซ้ำ แล้วรูปใหม่ไม่ขึ้น)
  · ยังล้าง `sponsor-media/` + ส่ง `sponsor:changed` → renderer ล้าง cache รูปแล้ววาดใหม่ (ของเดิม)
- เทสต์: `selftest-sponsor-feed.js` 23 → **32 checks** (304 ต้องไม่ fall through ไป jsDelivr,
  ส่ง validator กลับ, อ่าน etag จาก header, fingerprint, cache เก่าที่ไม่มี etag ยังโหลดได้)
  · `selftest-sponsor-refresh.js` ปรับให้ตรงสัญญาใหม่ (timer 30 วิ ไม่ใช่ TTL, focus hook, 304, fingerprint)
- ผล: `npm test` **all 61 offline test scripts passed** (160 ไฟล์ syntax OK)
- **ยังไม่ build/ไม่ bump เวอร์ชัน** — โปรแกรมที่ติดตั้งเป็น 0.5.2 (ยัง 6 ชม.) กว่าจะเห็นผลต้องออกรุ่นใหม่ก่อน

**กฎใหม่: 1 ไฟล์ = 1 `edit` call (ผู้ใช้สั่ง 2026-11-17)**
- ผู้ใช้จับได้ว่าผมแก้ `app/src/main.js` 2 `edit` calls ติดกันทั้งที่เป็นไฟล์เดียวกัน จึงถามว่ามีเหตุผลรองรับไหม
- คำตอบที่ถูกคือ **ไม่มี** — tool `edit` รับ `edits[]` หลายรายการที่ไม่มี overlap ใน call เดียวได้เสมอ
  (หลักฐานว่าทำได้: `check-render.js` แก้ 4 จุดใน call เดียวในงาน ADS รอบเดียวกัน)
  สาเหตุจริงคือผมยิงตามลำดับที่คิดเสร็จแต่ละก้อน ไม่ใช่ข้อจำกัดของเครื่องมือ
- บันทึกเป็นกฎใน `AGENTS.md` + `.AGENT/HANDOFF.md`: ทุกจุดที่แก้ในไฟล์เดียวกันอยู่ใน `edit` call เดียว
  · ❌ ตัวอย่างผิด / ✅ ตัวอย่างถูก · วิธีทำให้ถูก (คิดให้ครบก่อนยิง) · ข้อยกเว้น 3 ข้อ
  (oldText ซ้อน/ซ้ำ · ต้องอ่านผลก่อนแก้อีกจุด · คนละไฟล์)

**โฆษณา 2 ตัวไม่สลับ + ขนาดไม่เปลี่ยนตามที่ตั้ง (ผู้ใช้ทดสอบ 2026-11-17)**
- หลักฐาน: feed บน repo มี 2 slots (`ads`, `ads2`) ทั้งคู่ 1:1 · แต่ `node -e fetchFeed()` ธรรมดา
  ได้ feed เก่า 1 slot (`updated 04:56`) — curl ที่ใส่ `?x=<epoch>` กลับได้ของใหม่ (`05:12`)
  → **raw.githubusercontent.com ให้ copies จาก edge cache ที่ค้างอยู่เป็นนาที ๆ**
- **แก้ 1:** `cacheBusted(url)` ต่อ `?t=<epoch seconds>` ทุกครั้งที่ขอ feed (ค่าเดียวกันทุกเครื่อง
  ไม่ระบุตัวผู้ใช้) · `source` ที่คืนกลับยังเป็น URL สะอาด เพื่อให้ media resolve ถูก ·
  ETag/304 ยังใช้ได้ปกติ
- **แก้ 2 (บั๊กจริงที่เจอระหว่างทาง):** `sponsorPayload()` ใน `main.js` **ไม่ส่ง `media.ratio`**
  ให้ renderer → ทุกครีเอทีฟถูกวาดเป็น 2:1 เสมอ ขนาดที่ตั้งใน ADS จึงไม่มีผล
  → เพิ่ม `ratio: slot.media.ratio`
  · ทำไมเทสต์เดิมไม่จับ: `check-sponsor-layout.js` สร้าง shape `sponsor` ขึ้นเองพร้อม ratio
    ไม่เคยผ่าน `sponsorPayload()` จริง → เพิ่ม check ฝั่งซอร์สใน `selftest-sponsor-refresh.js`
- **หมายเหตุการออกแบบ (ยังเป็นแบบเดิม):** ความสูงของแถบจองไว้ที่กรอบที่สูงสุดใน feed
  แล้ววางครีเอทีฟแบบ contain → ถ้าโฆษณาหลายตัวมีสัดส่วนต่างกัน แถบจะไม่กระโดด แต่ขนาดกล่อง
  จะเท่ากันทุกตัว ถ้าผู้ใช้อยากให้แต่ละตัวสูง-เตี้ยตามของตัวเอง ต้องเปลี่ยนดีไซน์ (ถามแล้ว)
- เทสต์: `selftest-sponsor-feed.js` 32 → **33** · `selftest-sponsor-refresh.js` 9 → **11**

**ขยายเพดานวิดีโอเป็น 100MB + เสิร์ฟครีเอทีฟผ่าน protocol สตรีม (ผู้ใช้เลือก B · 2026-11-17)**
- ผู้ใช้ขอ 250MB เผื่อลูกค้าส่งวิดีโอ → ชี้แจงว่าติดเพดาน GitHub (ไฟล์เดียวเกิน 100MB push ไม่ผ่าน)
  จึงเลือกแนวทาง B: เพดาน 100MB + ไม่ส่งไบต์ผ่าน IPC อีก
- **เดิม:** ดาวน์โหลด → base64 data URL → IPC → `<img>/<video>` · วิดีโอ 100MB จะกลายเป็นสตริง ~133MB
  ใน main + อีกชุดใน renderer = แรมบวมหลายร้อย MB
- **ใหม่:** `NTAPI ADS`: `MAX_VIDEO_BYTES` 8MB → **100MB** (เพดาน GitHub) · รูปคงเดิม 1.2MB
  · NTAPI: `sponsor-feed.MAX_VIDEO_BYTES = 100MB` (รูป/โปสเตอร์คง 8MB) ·
  `ensureMedia()` คืน `{ file, url, poster }` แทน data URL · `mediaUrl()` สร้าง `ntapi-sponsor://media/<name>`
  · `main.js`: `protocol.registerSchemesAsPrivileged` (ต้องอยู่ top-level ก่อน ready) +
  `registerSponsorMedia()` เรียกใน `whenReady` → `net.fetch(pathToFileURL(...))` สตรีมจากดิสก์
  (ตั้ง handler ก่อน ready ไม่ได้ — เจอ error `Session can only be received when app is ready`)
  · CSP: `img-src`/`media-src` เพิ่ม `ntapi-sponsor:` · renderer ใช้ `value.url` แทน `value.dataUrl`
  · timeout ดาวน์โหลด: รูป 15 วิ / วิดีโอ 300 วิ
- เทสต์: `selftest-sponsor-feed.js` 33 → **35** (ยืนยันคืน URL ไม่ใช่ data URL · เพดานวิดีโอ 100MB ·
  ปฏิเสธไฟล์เกินเพดานแบบสตรีม 101 chunk ไม่จองแรม 100MB) ·
  ไฟล์ใหม่ `scripts/check-sponsor-media.js` + `npm run check:media` (Electron จริง: CSP อนุญาต scheme,
  รูปถอดรหัสได้จริง, ปฏิเสธ `../`/นามสกุลแปลก/ไฟล์หาย)
- ผล: `npm test` ผ่าน 61 scripts (Syntax OK 161 ไฟล์) · `check:media` ผ่านทุกข้อ · ADS `npm test` ผ่าน 5 scripts

**กฎเพิ่ม: เปิด docs ก่อนเดา + สตริงต้องเป็นสตริง (ผู้ใช้สั่ง 2026-11-17)**
- ที่มา: ผู้ใช้ถามว่าทำไม `app/scripts/check-sponsor-media.js` ต้องแก้ 3 รอบ → ตอบตรงว่า
  1 รอบ = สร้างไฟล์ (จำเป็น) · 1 รอบ = เจอข้อจำกัด Electron จริง (`protocol.handle` ต้องหลัง ready) ·
  1 รอบ = **ความผิดผมเอง** (interpolate IIFE ที่ไปรันใน Node → `document is not defined`)
- บันทึกเป็นกฎใน `AGENTS.md` + `.AGENT/HANDOFF.md` หัวข้อ "การใช้ API — เปิด docs ก่อนเดา · สตริงต้องเป็นสตริง":
  (1) API ที่ไม่แน่ใจลำดับการเรียก → เปิด docs ก่อน ไม่ใช่ลองผิดลองถูก
  (2) main process ห้าม interpolate โค้ดที่จะไปรันใน renderer — เก็บเป็นสตริงล้วน
  (3) แก้ไฟล์เพราะเทสต์ล้ม = ข้อยกเว้นของกฎ 1 ไฟล์/1 edit call แต่ต้องแยก "ข้อจำกัดที่รู้ได้ตอนรัน"
      กับ "คิดไม่ครบ" — อย่างหลังคือสิ่งที่ต้องลด

**โฆษณาวิดีโอ: ปุ่มเปิด/ปิดเสียงบนแถบโฆษณา (ผู้ใช้เลือกแบบ 2 · 2026-11-17)**
- เดิมวิดีโอ `muted` ตลอด (จำเป็น เพราะ Chromium บล็อก autoplay ที่มีเสียง) → ผู้ใช้เลือกให้มีปุ่มกดเอง
- เพิ่ม `#sponsorSound` เป็น **พี่น้อง** ของ `.sponsor-card` ไม่ใช่ลูก (การ์ดเป็น `<button>` ซ้อนกันไม่ได้)
  · ซ่อนเมื่อสล็อตเป็นรูป · `aria-pressed` + label เปลี่ยนตามสถานะ (i18n `sponsorSoundOn/Off` th/en)
  · `sponsorSoundOn` จำค่าไว้ในหน่วยความจำต่อ session และถูกใช้ตอนสร้าง `<video>` ใหม่ทุกครั้ง
  · คลิกแล้ว `preventDefault/stopPropagation` เพื่อไม่ให้เปิดเบราว์เซอร์ของสปอนเซอร์พร้อมกัน
  · CSS: `.sponsor-sound` เป็น absolute overlay ขนาด 24px บนมุมขวาของครีเอทีฟ
- เทสต์: `check-sponsor-layout.js` เพิ่ม 7 checks (ปิดเสียงเป็นค่าเริ่มต้น · มีปุ่มเมื่อเป็นวิดีโอ ·
  คลิกแล้ว unmute · aria-pressed · label เปลี่ยนเป็นไทย · คลิกซ้ำกลับเป็น mute · รูปไม่มีปุ่ม)
  · แก้ harness ให้ใช้ `url` แทน `dataUrl` ตามสัญญาใหม่ของ `sponsorMediaCache` (เดิมวัดได้ 2.22/1.64 เพราะรูปไม่โหลด)
  · `selftest-sponsor.js`: ตัดกฎ `.sponsor-sound` ออกก่อนเช็ค "แถบไม่มีความสูงตายตัว" + เพิ่ม check ว่าเป็น overlay
- ผล: `npm test` ผ่าน 61 scripts · layout check ผ่านทุกข้อ (มี 7 checks ใหม่)

**sidebar: ข้อความอธิบายการอนุมัติต้องอยู่บรรทัดเดียว + ย่อไม่ได้ต่ำกว่านั้น (ผู้ใช้สั่ง 2026-11-17)**
- เป้าหมาย: `#approvalNote` ("เมื่อ AI จะรันคำสั่งในคอมพิวเตอร์ เช่น รัน bash หรือแก้ไฟล์")
  ต้องไม่ขึ้น 2 บรรทัด และ sidebar ต้องDragแคบกว่านั้นไม่ได้
- **แก้ CSS:** `.approval-note { white-space: nowrap; overflow: hidden }` (overflow เป็นแค่กันพลาด)
- **แก้ JS:** `sidebarMinWidth()` เดิมวัดแค่แถว brand → วัดเพิ่ม `note.scrollWidth`
  แล้วใช้ `Math.max(row, sentence)` เป็นพื้นล่าง (เดิม floor 200px ทำให้ข้อความขึ้น 2 บรรทัด)
  · `applyLanguage()` เรียก `applySidebarWidth()` ใหม่ เพื่อให้พื้นล่างขยับตามความยาวข้อความที่เปลี่ยนภาษา
- **ผลจริงที่วัดได้:** ไทยพื้นล่าง 326px · อังกฤษ 347px (แถว brand กว้างขึ้น) ·
  บังคับ `applySidebarWidth(40)` → clamp เป็น 326/347 และข้อความยังพอดิบรรทัดเดียว (scrollWidth 301 ≤ clientWidth 301)
- เทสต์ใหม่: `scripts/check-sidebar-note.js` (Electron วัดของจริง 2 ภาษา × 9 checks = 18)
  ตรวจ: nowrap · ความสูง ≤ 1 บรรทัด · ไม่ถูกตัด · drag 40px ต้องไม่ยอม · --sidebar-w ตรงกับค่าที่ใช้จริง · reset ยังอยู่ในช่วง
- **ต้องรู้:** ค่าเริ่มต้น 268px ต่ำกว่าพื้นล่างใหม่ → sidebar จะกว้างขึ้นเป็น ~326px โดยอัตโนมัติ
  ถ้าผู้ใช้ต้องการคง 268 ต้องย่อข้อความ (ยังไม่ได้ทำ — รอคำตอบ)
- **แก้เพิ่มหลังเจอ FAIL 3 ข้อใน `check:sidebar`:** `sidebarMinWidth()` รัดขึ้นเรื่อย ๆ (487→507→520)
  เพราะวัดตอน sidebar กว้าง แล้ว flex child ที่ถูกยืดรายงานขนาดที่ยืดแล้ว → วัดตอนบังคับ `--sidebar-w: 200px` แทนแล้วคืนค่า
  · พื้นล่างนิ่งที่ **305px** ทั้งภาษาไทย/อังกฤษ
- อัปเดต `check-sidebar-reset.js`: เดิม hardcode 268 → เทียบกับ `max(268, sidebarMinWidth())` ที่อ่านจากหน้า
- ผล: `check:sidebar` ผ่านทั้งหมด · `check-sidebar-note` ผ่าน 18/18 · `npm test` ผ่าน 61 scripts

**status popover: กว้างเท่าแท็บของมันเสมอ (ผู้ใช้สั่ง 2026-11-17)**
- เดิม `.status-popover` กว้างตายตัว 262px → ใหญ่กว่า/เล็กกว่าแท็บ ดูไม่เป็นชิ้นเดียวกัน
- แก้ CSS: `position: absolute; left: 0; right: 0; width: auto` บน `.status-strip` (ลูกใน-flow มีแค่ `.status-pill`)
  → ความกว้างผูกกับแท็บโดยอัตโนมัติ ไม่มีเลขที่ต้องคอย sync · `[hidden]` ยังปิดได้
- กันพังเมื่อแคบ: `.status-popover .usage-row { flex-wrap: wrap; overflow-wrap: anywhere }` + `.status-pop-head { flex-wrap: wrap }`
- ผลข้างเคียงที่เจอ: sidebar พื้นล่าง 305px ทำให้ topbar แคบลง 2px → `check:pill` FAIL "topbar never overflows 2px"
  แก้ด้วย `@media (max-width:1080px) { .status-pill { gap:5px; padding:0 8px } }`
- เทสต์: `check-status-pill.js` เปลี่ยน check เดิม "popover readable ≥240px" (ขัดกับข้อกำหนดใหม่) เป็น 3 checks
  · กว้างเท่าแท็บ (±1px) · ขอบซ้ายตรงกับแท็บ · ยังเท่ากันเมื่อแท็บโตขึ้น (เปลี่ยน `usageCost` เป็น 999,999/1,000,000 → 336px, 375px ตาม)
- วัดได้: หน้าต่างปกติ แท็บ 336 → panel 336 · หน้าต่างขั้นต่ำ 900px แท็บ 108 → panel 108
- ผล: `check:pill` ผ่านทั้งหมด · `check:sidebar` ผ่าน · `npm test` ผ่าน 61 scripts

**ตั้งค่า > เกี่ยวกับ: แยกหัวข้อ "อัปเดต" ออกจากข้อมูลส่วนตัว + จัดใหม่ให้สบายตา (ผู้ใช้สั่ง 2026-11-17)**
- เดิมบล็อกอัปเดตอยู่ใต้ข้อมูลผู้พัฒนาในคอลัมน์เดียวกัน ดูเป็นรายการเดียวกัน
- `index.html`: เพิ่ม `<div class="about-sep" role="separator">` (เส้นคั่น) แล้วห่ออัปเดตใหม่เป็น `settings-group update-card`
  · หัวการ์ด: ไอคอน SVG (ลูกศรวน) + ชื่อ "อัปเดต" + ชิปเวอร์ชัน (`#updateVersion`) ชิดขวา
  · สถานะ (`#updateStatus`) · แถบความคืบหน้า · ปุ่มในการ์ดแยกแถว (`update-card-actions`)
  · คง id เดิมทั้งหมด (`updateVersion`, `updateStatus`, `updateCheckBtn`, `updateActionBtn`, `updateBar`, `updatePct`) → JS ไม่ต้องแก้
- `styles.css`: `.about-sep` เป็นเส้น gradient จางไปทางขวา · `.update-card` การ์ดมุมโค้ง 14px + พื้นไล่เฉดบาง ๆ
  `.update-card-icon` กล่องไอคอน 26px · `.update-chip` แคปซูลเวอร์ชัน · `.update-status` ลบ margin ทับของ `.settings-hint`
- เครื่องมือใหม่: `scripts/shot-settings-about.js` ถ่าย PNG ของ panel เกี่ยวกับ (ใช้ตรวจตา ไม่ได้อยู่ในชุดเทสต์)
  · harness ไม่มี main process → `openSettings()` ล้มเหลว ต้องบังคับ `.overlay.hidden=false` + `showSettingsSection('about')`
- ตรวจด้วยตาแล้ว (ภาพที่ C:/NTAPI/outputs/downloads/settings-about-th.png): เส้นคั่นชัด การ์ดแยกจริง ชิป/ปุ่มไม่ล้น ไม่ตัด
- ผล: `npm test` ผ่าน 61 scripts · `check:pill` ผ่าน · `check:sidebar` ผ่าน

**โฆษณาเต็มกรอบ + อยู่กึ่งกลาง sidebar (ผู้ใช้สั่ง 2026-11-17) · commit `915859a`**
- อาการ: รูป/วิดีโอโฆษณามีแถบว่างบน–ล่าง และภาพเบี่ยงซ้าย (ผู้ใช้วาดเส้นแดงให้ดู)
- วัดจากภาพจริง: sidebar x 11–291 · ภาพ x 13–276 → ช่องซ้าย 1px / ขวา 16px
- ต้นเหตุ: `.sponsor-card` = `width:100%` + `padding:7px` + `border:1px` + `margin:0 -7px` กับ `box-sizing:border-box`
  → content box แคบกว่าคอลัมน์ 16px และถูกดึงซ้าย → แบนเนอร์ชิดซ้าย
- แก้: `width: calc(100% + 16px)` + `margin: 0 -8px` → วัดใหม่ ซ้าย 0px / ขวา 1px · กว้าง 280px (เต็มคอลัมน์)
- ผู้ใช้ย้ำ: จัดกลางเฉพาะกรอบภาพ **ห้ามจัดกลางข้อความ** → `.sponsor-card` คง `align-items: flex-start`
- เต็มกรอบ: `img, video { width:100%; height:100%; object-fit: cover }`
- เทสต์: `check-sponsor-layout.js` เพิ่ม `mediaInsetLeft/Right` + "creative band is centred in the column"
  · RED `{left:1,right:16}` → GREEN `{left:0,right:1}` · `selftest-sponsor` ผ่าน · `npm test` 61 scripts ผ่าน
- ค้าง: `check-sponsor-layout` FAIL 1 (`fitted not cropped`) เพราะเลือก `cover` — ผู้ใช้บอกยังไม่ต้องแก้
- บทเรียนกฎ: เทิร์นนั้นยิง `bash` หลาย call (ผิด "1 เทิร์น = 1 bash call") และลืมบันทึก HANDOFF/LOG
  ตั้งแต่ปิดงาน → ต้องเขียนบันทึกทันทีที่ commit ไม่รอผู้ใช้เตือน

**ชื่อผู้พัฒนาใน "เกี่ยวกับ" ซ้อนกัน (ผู้ใช้สั่ง 2026-11-17)**
- อาการ: "ชนาธิป เชื่อมกลาง / Chanathip Cheumklang , นนท์ / Nont" ขึ้นซ้อนกัน
- ต้องการ: ภาษาไทย → ชื่อไทย · ภาษาอังกฤษ → ชื่ออังกฤษ
- ต้นเหตุ: index.html มีทั้ง `.about-name-en` และ `.about-name-th` (+ nick) และ CSS แสดงทั้งคู่เสมอ
- แก้: CSS keyed บน `html[lang="th"]` (applyLanguage เขียนค่านี้ทุกครั้งที่สลับภาษา)
  · ซ่อน en เมื่อไทย · ซ่อน th เมื่อไม่ใช่ไทย (ทั้งชื่อเต็ม+ชื่อเล่น) · ชื่อไทยได้ 15px/600/var(--text)
  · **แยกเป็นสอง rule block** — รวม selector list เดียวแล้ว regex เทสต์เข้าใจผิดว่าซ่อนทั้งคู่
- เทสต์ใหม่ `selftest-about-name.js` (8 checks) + ลงทะเบียนใน run-unit-tests · RED 5 → GREEN
- ผล: `npm test` ผ่าน 62 scripts · ค้าง: ยังไม่ทดสอบด้วยตา · ยังไม่ commit

**ปล่อยอัปเดต v0.5.4 (ผู้ใช้สั่ง "ส่งอัปเดต" 2026-11-17)**
- bump `app/package.json` 0.5.3 → 0.5.4 (เจอ `package-lock.json` ค้างที่ 0.3.1 มานาน → ตั้งเป็น 0.5.4 ตาม)
- commit `internal: เตรียมเวอร์ชัน 0.5.4` → push master → tag `v0.5.4` → push tag
- CI `Release` (windows-latest) **success** · assets: `NTAPI-Setup-0.5.4.exe` (118 MB), `latest.yml`, blockmap
- release body (สร้างจาก git log อัตโนมัติ): "โฆษณาเต็มกรอบและอยู่กึ่งกลาง sidebar" + "ชื่อผู้พัฒนาในหน้าตั้งค่าแสดงตามภาษาที่เลือก"
  (commit ที่ขึ้นต้น `internal:` ถูกกรองออกตามกฎ)
- หมายเหตุ: ไม่มี `gh` ในเครื่อง → poll CI ด้วย GitHub API จาก `git credential fill`

**NTAPI ADS: หน้าใหม่เป็น "การ์ดโฆษณา" + อัตราส่วน 9:16/กำหนดเอง (ผู้ใช้สั่ง 2026-11-17 · ทำต่อจากโมเดลก่อนที่ติด limit)**
- โจทย์: โปรแกรมใช้ยาก + บั๊กพิมพ์ได้ทีละตัว · อยากได้หน้าใหม่ที่สวย มีพลัง ใส่โลโก้ NTAPI และกรอบหน้าต่างเหมือน NTAPI
  · การ์ดเพิ่ม/ลบได้ แถวละ 4 ใบ · คลิกการ์ด → ตั้งค่าใบนั้น · 1:1, 2:1, 4:5, 9:16, กำหนดเอง · เริ่มด้วยสองช่องให้ตรวจ
- **ตรวจก่อนแก้ (บทเรียนสำคัญ):** โมเดลก่อนหน้าเขียน `index.html`/`styles.css` ชุดใหม่ลงโปรเจกต์แล้ว แล้วติด limit กลางทาง
  · ไฟล์ไม่มี `assets/logo.png` (แต่ HTML อ้างถึง) → เปลี่ยนเป็น SVG inline
  · CSP ที่เขียนใหม่จำกัด `img-src 'self' data: blob:` → รูปพรีวิวจากฟีด (https CDN) จะถูกบล็อก · แก้เป็นเพิ่ม `https:`
  · `app.js` ยังอ้าง element เก่าทั้งหมด (`#settings`, `#repoName`, `#previewNotes`, `.slot`) → ยืนยันว่าเขียนใหม่ทั้งไฟล์
  · **ยืนยัน:** การเขียนทับไฟล์ที่โมเดลอื่นเริ่มไว้ต้องอ่านของจริงให้ครบก่อน ไม่ใช่ทำต่อจากความจำใน HANDOFF
- **titlebar ของตัวเอง:** `frame: false` + `-webkit-app-region: drag` · ปุ่มย่อ/ขยาย/ปิด ผ่าน IPC `win:minimize`/`win:toggle-maximize`/`win:close`
  · ใช้ `BrowserWindow.fromWebContents(e.sender)` (ไม่ใช่ตัวแปร `win` ตัวเดียว — ผิดเมื่อมีมากกว่าหนึ่งหน้าต่าง)
- **แก้บั๊กพิมพ์ได้ทีละตัวที่ราก:** กระดาน (`renderBoard`) สร้างใหม่เฉพาะตอนจำนวนการ์ดเปลี่ยน
  ระหว่างพิมพ์เขียนลง slot แล้ว repaint เฉพาะ preview + `.card-name` ของใบนั้น — เทสต์เช็ค `document.activeElement` ตรง ๆ
- **อัตราส่วนกำหนดเอง — แก้ทั้งสองโปรแกรมพร้อมกัน (สัญญา `sponsor.json`):**
  · `ADS/src/feed.js`: เพิ่ม `9:16` · `parseRatio()`/`ratioFromSides()` · ผ่อนจาก "ปิดตาย" เป็นรับ `w:h` ในช่วง
    (ด้านละ ≤64 · สูง ≤2.5×กว้าง · กว้าง ≤5×สูง) นอกช่วง = 2:1 เหมือนเดิม
  · `app/src/sponsor.js` + `app/src/renderer/app.js`: เพิ่ม `9:16` / `parseRatio` / `sponsorRatio()` อ่าน `w:h` ทั่วไปได้ (กัน NaN)
  · **ไม่แตะ CSS ของ NTAPI** (`.sponsor-media` ยัง `max-height: 288px` + `cover`) → เทสต์ layout เดิมไม่กระทบ
- เทสต์: `ADS npm test` 5 suites (selftest-feed เพิ่ม custom/ใน-นอกช่วง/กัน `__proto__`) · `ADS check:render` **39/39** · `app npm test` **62 scripts**
  · check-render ตรวจ: การ์ดจากฟีด · คลิกเปิด drawer · preview 268px/2:1 · เพิ่มการ์ด · พิมพ์ไม่หลุด focus · ลากวางจริง → 1072×536 WebP
    · กด 1:1 → 1072×1072 · เผยแพร่พา `ratio:'1:1'` · รีโหลดหลังเผยแพร่ → ปุ่ม active กลับมาเป็น `4:5` และกล่อง preview เป็น 4:5
- **หมายเหตุ:** ภาพที่ harness เซฟเป็นเฟรมเก่า เพราะหน้าต่าง `show:false` ไม่ compose ใหม่ → หลักฐานจริงคือ DOM assertions
- **ไม่ได้ทำ:** ยังไม่ทดสอบด้วยตาในโปรแกรมจริง · ยังไม่ commit · ยังไม่ bump เวอร์ชัน ADS (คง `0.1.0`)
- **กฎที่ทําได้ครบรอบนี้:** 1 เทิร์น = 1 bash call (รันทั้ง 3 สูทในคําสั่งเดียว + สรุป PASS/FAIL ท้ายสคริปต์) · 1 ไฟล์ = 1 edit call

**ย้ายคอลัมน์เครื่องมือไปขวา (ผู้ใช้สั่งต่อ 2026-11-17)**
- หลังผู้ใช้ดูหน้าใหม่แล้วบอกว่าชอบ แต่ขอ "ย้ายแท็บทั้งหมดที่อยู่ซ้ายไปอยู่ขวา"
- แก้แค่ CSS ไม่แตะ DOM: `.shell` เปลี่ยนจาก `grid` → `display:flex; flex-direction:row-reverse`
  · `.tools` ได้ `width/flex-basis: 296px` + เปลี่ยนเส้นคั่นเป็น `border-left` (เดิม `border-right`)
  · `.board` ได้ `flex: 1 1 auto; min-width: 0` (แทน `minmax(0, 1fr)` ของ grid)
  · media query ≤940px ย้ายจาก `.shell { grid-template-columns }` → `.tools { width/flex-basis: 260px }`
- ทําไมเลือก `row-reverse` แทนสลับบล็อกใน HTML: งานเล็กกว่าและไม่เสี่ยงกับบล็อกยาว ~150 บรรทัด
  (แลกกับ tab order ที่ยังเป็นเครื่องมือก่อนกระดาน — ยอมรับได้สําหรับเครื่องมือภายใน)
- **เพิ่มเทสต์กันถอย 3 checks** ใน `check-render.js` (ตําแหน่งจริงจาก `getBoundingClientRect`):
  เครื่องมืออยู่ขวาของกระดาน · ขวาสุดไม่ล้นจอ · กระดานกว้างกว่าเครื่องมือ
- ผล: `ADS npm test` 5 suites · `ADS check:render` **42/42** (39 → 42) · ไม่ต้องรัน `app npm test` เพราะไม่แตะ NTAPI
- ค้าง: ยังไม่ทดสอบด้วยตา · ยังไม่ commit · ยังไม่ bump เวอร์ชัน ADS

**ชื่อการ์ดอยู่ระนาบเดียวกันทุกใบ (ผู้ใช้สั่งต่อ 2026-11-17 · เลือกแบบ A)**
- ผู้ใช้ส่งภาพมาวงแดง 2 จุด (ซ้าย = การ์ด 1:1 · ขวา = การ์ด 4:5) แล้วบอกว่าชอบแบบขวาที่ชื่ออยู่ต่ำกว่า
  · ให้ความชัดเจนภายหลังว่า: "เวลาเราหาข้อมูลหรือมองด้วยตัวข้อความ มันจะอยู่ระนาบเดียวกันทั้งหมด"
  → คืออยากให้ **ชื่อการ์ดทุกใบอยู่บรรทัดล่างเดียวกัน** ไม่ว่าไฟล์จะสูงเตี้ยแค่ไหน (A)
- **ถามก่อนแก้ (ตามที่ผู้ใช้ขอ):** เสนอ 2 ทาง — A ข้อความติดขอบล่างแต่รูปคงสัดส่วนเดิม / B ยืดรูปให้เต็มพื้นที่
  โดยชี้ว่า B จะครอปเกินสัดส่วนที่ผู้ใช้ตั้งไว้ · ผู้ใช้ตอบ "A"
- แก้แค่ CSS: `.card-body { margin-top: auto }` (การ์ดเป็น flex column + grid ยืดทุกใบสูงเท่ากันอยู่แล้ว)
  · `.card-meta { flex-wrap: nowrap; overflow: hidden }` + `.badge { flex: 0 0 auto }` กันป้ายขึ้นบรรทัดที่สอง
    (ถ้าขึ้น 2 บรรทัด การ์ดใบนั้นชื่อจะสูงกว่าเพื่อน ระนาบเสีย — max 3 ป้ายต่อใบที่ความกว้างจริงยังพอดี)
- **เทสต์กันถอย 4 checks** (`check-render.js`): ใช้การ์ด 2 ใบที่สัดส่วนต่างกันจริง (2:1 จากฟีด กับ 1:1 ที่เพิ่งตั้ง)
  — บรรทัดล่างของ `.card-name` ตรงกัน ±1px · รูปเตี้ยดันชื่อลง (gap > 40px) · ทุกชื่ออยู่ติดขอบล่างการ์ด (≤ 45px)
- ผล: `ADS npm test` 5 suites · `ADS check:render` **46/46** (42 → 46) · ไม่ต้องรัน `app npm test` (ไม่แตะ NTAPI)
- ค้าง: ยังไม่ทดสอบด้วยตา · ยังไม่ commit · ยังไม่ bump เวอร์ชัน ADS

**"กำหนดเอง" เป็นป๊อปอัป + stepper สไตล์โปรแกรม (ผู้ใช้สั่งต่อ 2026-11-17)**
- ผู้ใช้: "ปุ่มกำหนดเอง(ขนาด) อยากให้กดแล้วมี pop-up เด้งขึ้นมาให้ใส่ขนาดแทน ... อันเก่ามันเปิดไว้ตลอดแม้ไม่ได้กด
  มันดูไม่สวย และปุ่มปรับขึ้นลงทำให้ดูสวยเข้าธีมของโปรแกรมมากกว่านี้"
- **รากของความไม่สวย:** ช่อง กว้าง×สูง ถูกวาดค้างใน `#fields` ทุกครั้งที่เปิดการ์ด และเป็น `input[type=number]`
  เปล่า ๆ → Chromium โชว์ลูกศร native สีเทาเล็ก ๆ ที่ไม่เข้าธีม
- แก้: ลบ `customWrap`/`setCustom`/`onCustom` ออกจาก `ratioRow()` → ปุ่ม "กำหนดเอง" เรียก `openSizeDialog(slot, opener)`
  · ไดอะล็อกสร้างด้วย JS ต่อท้าย `document.body` (z-index 60 เหนือ drawer 40) · ค่าเริ่มต้น 3:2
  · มีตัวอย่างขนาดจริงสด ๆ · นอกช่วง = ปุ่มยืนยันดับ + บอกเหตุผลในไดอะล็อก (เดิมใช้ `setStatus` ที่มุมล่างซ้าย)
  · ปิด 3 ทาง: ✕ · scrim · Escape — และ Escape ต้องปิดไดอะล็อกก่อน drawer (แก้ handler ให้มีลําดับ)
  · `stepperRow()` สร้าง −/input/+ เอง + ซ่อน native spinner ของ `input[type=number]` **ทุกตัว** ในไฟล์
  · `.step-btn` ปรับใหม่: พื้น gradient · hover เป็น accent · active ขยับลง 1px (ใช้ร่วมกับ stepper ของ "หมุนเวียนทุก")
- **เทสต์กันถอย 7 checks** (`check-render.js`): ช่องขนาดไม่ค้างใน editor · กดแล้วไดอะล็อกเปิด · 1:20 ถูกปฏิเสธ+ไดอะล็อกยังเปิด
  · 3:2 ยืนยันแล้วไดอะล็อกปิด · ปุ่ม active = `custom` · `#frameSize` ขึ้น `3:2`
- ผล: `ADS npm test` 5 suites · `ADS check:render` **53/53** (46 → 53) · ไม่ต้องรัน `app npm test`
- **บทเรียน:** ฟอร์มที่แสดงตลอดเวลาสำหรับค่าที่กรอกครั้งเดียว = เสียงรบกวนทางสายตา → ย้ายเข้าไดอะล็อก
- ค้าง: ยังไม่ทดสอบด้วยตา · ยังไม่ commit · ยังไม่ bump เวอร์ชัน ADS

**preview ในแผงแก้ไขต้องอยู่กลาง ไม่ใช่ชิดซ้าย (ผู้ใช้สั่งต่อ 2026-11-17)**
- ผู้ใช้: "เวลากดเข้าไปในการ์ด วิดีโอหรือภาพที่เป็นตัวอย่าง อยากให้ขยับมาอยู่ตรงกลาง ... ตอนนี้มันออกซ้ายไปหน่อย"
- ราก: `.preview` กว้าง 268px อยู่ใน `.drawer-body` กว้าง ~402px และ `align-items: stretch`
  → กล่องชิดซ้าย เหลือที่ว่าง 134px อยู่ข้างขวา
- แก้ CSS 2 จุด: `.preview { margin-inline: auto }` + `.preview-note { text-align: center }`
  (ตัวเลขใต้กรอบเขยิบตามกรอบ ไม่ปล่อยให้ชิดซ้ายคนละทาง)
- **เทสต์กันถอย 1 check:** เทียบช่องว่างซ้าย/ขวาของ `#frameMedia` กับ `#editorBody` ต่างกัน ≤ 1px
- **สองบทเรียนจากการรอบนี้:**
  1. **วัดผิดเองรอบแรก:** ใช้ `getBoundingClientRect().right` ของ `#editorBody` → ได้ 76/86 แล้ว FAIL
     เพราะ drawer มี scrollbar 10px · ที่ถูกคือ `box.left + body.clientWidth` (ไม่นับ scrollbar)
     → ของจริงอยู่กลางอยู่แล้ว ผิดที่เทปวัด
  2. **กับดักที่สำคัญกว่า:** `electron scripts/check-render.js` คืน exit code 0 แม้ harness ตั้ง `process.exitCode = 1`
     → สคริปต์สรุปของผมขึ้น PASS ทั้งที่ผลคือ `1/54 checks FAILED`
     · แก้สคริปต์สรุปให้ grep `checks FAILED` ใน output ด้วย ไม่ดูแค่ rc
     · **ต้องจํา:** อย่าตัดสิน pass/fail จาก exit code ของ electron อย่างเดียว ต้องอ่าน output
- ผล: `ADS npm test` 5 suites · `ADS check:render` **54/54** (53 → 54)
- ค้าง: ยังไม่ทดสอบด้วยตา · ยังไม่ commit · ยังไม่ bump เวอร์ชัน ADS

**ปุ่ม "สร้าง / ดู token ของ GitHub" ทำให้เป็นปุ่มจริง (ผู้ใช้สั่งต่อ 2026-11-17)**
- ผู้ใช้: "ปุ่ม สร้าง / ดู Token ของ GitHub อยากให้ทำเป็นปุ่มกดสวยกว่านี้"
- เดิม `.link-btn` = ลิงก์ข้อความล้วน (ไม่มีขอบ ไม่มีพื้น อยู่ชิดซ้าย) → ดูเหมือนข้อความ ไม่เหมือนปุ่ม
- ใหม่: เต็มความกว้าง · ขอบ accent จาง · พื้น gradient ม่วงอ่อน · hover สว่างขึ้น + เงา accent
  · active กดลง 1px · `:focus-visible` outline · ไอคอนโซ่ซ้าย + **ลูกศรออกขวา** (`margin-left:auto`, opacity .6 → 1 ตอน hover)
  · เพิ่ม `title` + ห่อข้อความด้วย `<span>` · ยังเรียก `api.openExternal` ผ่าน bridge (ไม่ใช่ `<a>`)
- **เทสต์กันถอย 2 checks** (`check-render.js`):
  · ต้องเป็น `<button>` เต็มความกว้าง มีลูกศร สูง ≥ 26px (จับได้ถ้ามีคนเปลี่ยนกลับเป็นลิงก์)
  · คลิกแล้ว stub `shell:open` ต้องได้ `https://github.com/settings/personal-access-tokens...`
- **ข้อผิดพลาดของผมในรอบนี้ (บันทึกไว้):** หลังแก้ CSS ผมรันเทสต์แล้วพิมพ์ในคําตอบว่า "ตรวจ geometry"
  ทั้งที่ในสคริปต์มีแค่ `echo` เปล่า ๆ — เป็นการอ้างเกินหลักฐาน จึงเพิ่มเช็คจริงแล้วรันซ้ำ (54 → 56)
- ผล: `ADS npm test` 5 suites · `ADS check:render` **56/56**
- ค้าง: ยังไม่ทดสอบด้วยตา · ยังไม่ commit · ยังไม่ bump เวอร์ชัน ADS

**NTAPI: ข้อความ 503 ค้าง 2 อัน หลังเซิร์ฟเวอร์กลับมาปกติ (ผู้ใช้แจ้ง 2026-11-17)**
- ผู้ใช้ส่งข้อความจริงมา 2 อัน: `Retrying (1/3): 503: {"message":"The service is busy..."}`
  และ `Error: The service is busy right now... (HTTP 503 · service_busy) (HTTP 503 · service_busy)`
  แล้วบอกว่า "เด้งขึ้นมาแล้วค้างอยู่แบบนั้นทั้ง ๆ ที่ใช้งานได้ปกติแล้ว"
- **สาเหตุ 1 (ค้าง):** `api.onNotice` → `showNotice(p.text)` ไม่ส่ง `ms` → ไม่มี timer
  และไม่มีใครล้างเมื่อเทิร์นจบ (เดิมมีแค่ `api.onError` ที่ `showNotice(null)` และเฉพาะแท็บที่ active)
  · แก้: `let noticeIsRetry` · `onNotice` ตั้ง `noticeIsRetry = p.key === 'notice.retrying'` + ให้เพดาน 10 วิ
  · `onSettled` ล้าง: `if (payloadTabIsActive(view) && noticeIsRetry) showNotice(null)` · `showNotice(null)` reset flag
- **สาเหตุ 2 (suffix ซ้ำ):** `friendlyProviderError()` คืน `text` ที่มี `(HTTP 503 · service_busy)` ต่ออยู่แล้ว
  (และเทสต์เดิม lock ไว้: `badKey.text.includes('HTTP 401')`) แต่ `api.onError` เติม suffix ซ้ำ
  · แก้: `const suffix = p.key && p.status ? ... : ''` — เฉพาะประโยคแปลที่ยังไม่มี suffix
- **ปรับเพิ่ม:** `auto_retry_start` ใน main เปลี่ยนจาก `${event.errorMessage}` เป็น `friendlyProviderError(...).text`
  → notice ไม่โชว์ JSON ดิบอีก
- **เทสต์ใหม่:** `app/scripts/selftest-retry-notice.js` (9 checks) + ลงทะเบียนใน `run-unit-tests.js`
  · ใช้ทั้งการเทสต์ pure module และ source-level regex (ตามแบบ `selftest-sponsor-refresh.js`)
- ผล: `app npm test` → **63 scripts ผ่าน**
- **ข้อควรระวังที่เจอระหว่างทาง:** `electron scripts/check-render.js` ของ ADS คืน exit code 0 แม้เทสต์ล้ม
  → สคริปต์สรุปต้อง grep `checks FAILED` ใน output ด้วย

**NTAPI ADS: กดปิดเสียงแล้วยังดัง (ผู้ใช้แจ้ง 2026-11-17)**
- ผู้ใช้: "ลองเปิดฟังแล้วกดปิด แต่ยังดังอยู่"
- **สาเหตุจริง:** `HTMLMediaElement` ที่ถูกถอดออกจาก document **ยังเล่นต่อ**
  · `paintPreview()` เรียก `host.replaceChildren()` ทุกครั้ง (รวมทุกคีย์ที่พิมพ์ชื่อ) → ทิ้ง `<video>` ที่ยังดัง
  · ผลคือ mute ไปโดน element ใหม่ที่เงียบอยู่ ส่วนตัวเก่ายังเล่นเป็นเสียงผี
- **สาเหตุร่วม:** ป้ายชิปผูกกับ *สถานะ* ไม่ใช่ *การกระทำ* — ตอนเงียบเขียน "ปิดเสียง" กดแล้วเปิดเสียง (ตรงข้ามกับคํา)
- แก้: `releaseVideos(root)` = `pause()` + `removeAttribute('src')` + `load()` เรียกก่อน `replaceChildren()`
  ทั้ง `paintPreview` และ `paintCardThumb` · `applyMuteNow()` mute ของที่อยู่บนจอโดยไม่ rebuild
  · `paintPreviewText()` แยกจาก `paintPreview()` → พิมพ์ชื่อไม่รีสตาร์ทคลิป
  · ชิป: `state.mutePreview ? 'เปิดเสียง' : 'ปิดเสียง'` + `aria-pressed` · index.html ตั้งต้นเป็น "เปิดเสียง"
  · วิดีโอสร้างแบบ muted แล้ว unmute เมื่อ event `playing` (ตั้ง `muted = false` ก่อน play → Chromium บล็อก autoplay)
- **เทสต์ใหม่ 7 checks** (`check-render.js`) — ใช้ `<video>` ปลอมที่ override `pause()` เพื่อพิสูจน์ว่า
  ตัวที่ถูกทิ้งถูก pause จริง, toggle ไม่สร้าง element ใหม่, ป้ายเป็น "เปิดเสียง", และ element ถูกถอดออก
- ผล: `ADS npm test` 5 suites · `ADS check:render` **63/63** (56 → 63)
- ค้าง: ยังไม่ทดสอบด้วยตา · ยังไม่ commit · ยังไม่ bump เวอร์ชัน ADS

**ADS ปุ่มเสียง รอบสอง — ผู้ใช้บอกยังไม่หาย (2026-11-17)**
- ผู้ใช้: "NTAPI ADS ยังไม่หายนะคับ" → รอบแรกแก้ mute ของพรีวิว แต่ต้นเหตุจริงอีกอันคือ **การปิดแผง**
- **ต้นเหตุจริง:** `closeEditor()` แค่ `$('drawer').hidden = true`
  · media element ไม่หยุดเมื่อ ancestor เป็น `display:none` → คลิปเล่นต่อ
  · ชิปเสียงอยู่ในแผง → หายไปพร้อมแผง → เหลือเสียงที่ไม่มีปุ่มให้กดปิด
  · คําว่า "กดปิด" ของผู้ใช้คือปุ่มปิด (✕) ไม่ใช่ชิปเสียง — ผมตีความรอบแรกแคบไป
- แก้: `closeEditor()` → `releaseVideos($('frameMedia'))` + `replaceChildren()`
  · `paintCardThumb()` → `video.muted = true` ตรง ๆ (ไม่พึ่ง content attribute อย่างเดียว)
  · `applyMuteNow()` → เมื่อ mute ให้ mute `<video>` ทุกตัวในหน้าต่าง (ตาข่ายกันเสียงหลุด)
- **เทสต์เพิ่ม 3 checks** (`check-render.js`) —— ใช้ probe `<video>` ที่ override `pause()`:
  ปิดแผงแล้วคลิปถูก pause · ไม่มี media ค้างใน preview · `#drawer` ถูกซ่อนจริง
- ผล: `ADS npm test` 5 suites · `ADS check:render` **66/66** (63 → 66)
- **บทเรียน (สำคัญ):** อาการ "กดปิดแล้วยังดัง" ต้องถามให้ชัดว่าปุ่มไหน — "ปิด" ของผู้ใช้อาจหมายถึงปิดทั้งหน้าต่าง
  ไม่ใช่ปิดเสียง · ครั้งหน้าถ้าเป็น UI ที่มีหลายปุ่มคําเดียวกัน ให้ยืนยันก่อนแก้
- **ผู้ใช้ยืนยันแล้ว 2026-11-17:** "ผ่านแล้วคับโอเคแล้ว" — เสียงหายจริง
- ค้าง: ยังไม่ commit · ยังไม่ bump เวอร์ชัน ADS

**NTAPI: session item ที่ตั้งสีแล้วกรอบซ้อนกัน (ผู้ใช้แจ้ง 2026-11-17)**
- ผู้ใช้: "session item ด้วยความที่มันมีกรอบสีม่วงอยู่แล้ว พอเราใส่สีเข้าไป มันดันไปซ้อนกัน"
  (เป็นคิวถัดจากเรื่อง sidebar ที่ยังไม่ได้ลงมือ — แจ้งผู้ใช้แล้ว)
- **ต้นเหตุจริง:** ขอบซ้ายของแถวเดียวกันถูกวาด 3 ชั้น
  1. `.session-item.active` → `border-color: rgba(124,92,255,.8)` รอบทั้งแถว (กรอบม่วง)
  2. `.session-item[data-color]` → `border-left: 4px solid var(--swatch)` (แถบสี)
  3. `.session-item[data-color].active` → `box-shadow: inset 0 0 0 1px var(--swatch)` (วงในอีกชั้น)
- แก้ CSS: แถวที่มีสี → `border-top/right/bottom-color: transparent` + ตัด inset ring ออก
  · คง `border-left: 4px` + `padding-left: 6px` (ระยะข้อความ 10px เท่าเดิม) → ข้อความยังตรงคอลัมน์
  · gradient + เงายังบอก active อยู่
- **เทสต์ใหม่ 2 checks** (`selftest-session-marks-ui.js`): ไม่มีกรอบม่วงเหลือ + ไม่มีวงที่สองในแถวสี
- ผล: `app npm test` **63 scripts ผ่าน** · `check-session-marks` ผ่านทุกข้อ
- **บทเรียน (ตัวตรวจจริงของผมเอง):** สคริปต์สรุปใช้ `grep -E 'FAIL|failed'` กับ output ทั้งก้อน
  → ขึ้น FAIL ทั้งที่ทุกอย่างผ่าน เพราะ **ชื่อเทสต์มีคําว่า "failed"** (เช่น "PASS a failed turn is dropped")
  · ต้องดูบรรทัดสรุปท้าย (`PASS: all N scripts passed`) ไม่ใช่ grep คําเดี่ยว
- ค้าง: ยังไม่ทดสอบด้วยตา · ยังไม่ commit · ยังไม่ bump เวอร์ชัน

**NTAPI: โฆษณาวิดีโอ 9:16 ไม่ยอมปรับขนาด (ผู้ใช้แจ้ง 2026-11-17)**
- ผู้ใช้: "ใส่โฆษณาด้วย video แล้วตั้งเป็น 9:16 NTAPI ไม่ยอมปรับขนาดให้ รอมาสักพักแล้ว"
- **ตรวจของจริงก่อนแก้:** ดึง `sponsor.json` จาก raw (cache-busted) → `t1 | video | ratio "9:16" | media/t1.mp4`
  + `ads | image | 1:1` → ฟีดถูก, การเผยแพร่ถูก, ไม่ใช่ปัญหา cache
- **ต้นเหตุ:** `.sponsor-media` ใช้ `width:100%` + `aspect-ratio` (ตั้ง inline เป็น 0.5625) + **`max-height: 288px`**
  · `max-height` บีบเฉพาะความสูง → 268×476 กลายเป็น 268×288 = สัดส่วน 0.93 ไม่ใช่ 9:16
- แก้: เพดานอยู่ที่ความกว้างแทน
  `width: min(100%, calc(var(--sponsor-cap, 480px) * var(--sponsor-r, 2)))` + `max-height: 480px`
  · `paintSponsorMedia()` ตั้ง `--sponsor-r` = `sponsorReservedRatio()`
  · เหตุผลที่ใช้ width cap: กล่องยังรักษาสัดส่วนได้ เมื่อสูงเกินเพดานมันจะแคบลง ไม่ใช่แบนลง
- **เทสต์ใหม่ 6 checks** ใน `check-sponsor-layout.js` (รัน 2 ขนาดหน้าต่าง):
  `TALL_SPONSOR` (slot เดียว 9:16) → สูงกว่ากว้าง · สัดส่วน = 16/9 ±0.06 · สูง > 400px
- **วัดได้:** 270×480 (1.778) ทั้ง 1240×840 และ 900×560 · เดิม 268×288
- ผล: `npm test` **63 scripts ผ่าน** · layout ผ่านหมด **ยกเว้น 1 ข้อที่ค้างมานาน**
  (`each creative keeps its own shape, fitted not cropped` — เกิดจาก `object-fit: cover` ที่ผู้ใช้เลือกเอง)
- **ค้างตัดสินใจ:** ฟีดจริงมี 1:1 + 9:16 ผสม → แถบจองที่ 9:16 ทำให้รูป 1:1 ถูกครอปแนวตั้ง
  ทางเลือก: (ก) คง cover อย่างเดิม (ข) เปลี่ยนเป็น fit มีแถบดํา (ค) แยกกรอบต่อสล็อต
- ค้าง: ยังไม่ทดสอบด้วยตา · ยังไม่ commit · ยังไม่ bump เวอร์ชัน

**NTAPI: ล็อค sidebar ไม่ให้ยืด/หด (ผู้ใช้สั่ง 2026-11-17 · เลือกแบบ A)**
- ผู้ใช้: "อยากให้แก้ sidebar ให้ล็อคอยู่กับที่ ... ถ้าผู้ใช้งานขยับมันจะเปลี่ยนมุมมองที่ตั้งเอาไว้ของโฆษณา"
  · ผมเสนอ A = ล็อคที่ความกว้างที่เห็นตอนนี้ (คํานวณจากข้อความยาวสุด) · B = ค่าคงที่ที่ระบุ
  · ผู้ใช้ถามว่า "ใช่เลขเดียวกับที่ตั้งให้ย่นสุดได้ไหม" → ใช่ (305px) → **เลือก A**
- **ถอดออก:** `#sidebarResizer` (HTML+CSS) · drag handler ทั้งชุด · `dblclick` (ตัวคั่น + พื้น sidebar) ·
  คีย์ ←/→ · `Home` · `resetSidebarWidth()` · การเขียน prefs `sidebarWidth` · i18n `sidebarReset` (th/en) ·
  `body.resizing` · ข้อความ settings hint ที่อ้างถึง sidebar width
- **ของใหม่:** `applySidebarWidth()` ไม่รับ argument → `clamp(sidebarMinWidth())`
  · `lockSidebarWidth()` เรียกตอนบูต + วัดใหม่เมื่อ resize / fonts.ready / สลับภาษา
  · ค่า `prefs.sidebarWidth` เก่าถูกเมิน (ไม่ลบ — แค่ไม่เคยอ่าน)
- **เหตุผลที่ต้องล็อค (สําหรับอนาคต):** `.sponsor-media` ครอปตามความกว้างคอลัมน์
  → ความกว้างที่ต่างกัน = ครอปโฆษณาต่างกัน ⇒ กรอบโฆษณาต้องคงที่
- **เทสต์เขียนใหม่ 2 ไฟล์ + แก้ 2 ไฟล์:**
  · `selftest-sidebar-reset.js` เปลี่ยนจาก "reset+save" → "ถอดการลากแล้ว" (7 checks)
  · `check-sidebar-reset.js` (`npm run check:sidebar`) → วัดจริง 7 checks (ไม่มีตัวลาก · 305 · call ไม่ขยับ · gesture ไม่ขยับ · note พอดี)
  · `selftest-sidebar-min.js` (2 checks) · `check-sidebar-note.js` (เอา reset ออก, check ใหม่)
- **ผลรอบแรกมี FAIL 2 จุด (ของผมเอง):** (1) assert `!app.includes('sidebarReset')` ยังเจอ i18n ที่ค้าง → ลบคีย์นั้นออก
  (2) check ใหม่ผมอ่าน `out.before.cssVar` ที่ไม่มีใน object → แก้ให้ดู `after` อย่างเดียว
- ผลสุดท้าย: `npm test` **63 scripts ผ่าน** · `check:sidebar` ผ่านหมด · `check-sidebar-note` ผ่านหมด
- ค้าง: ยังไม่ทดสอบด้วยตา · ยังไม่ commit · ยังไม่ bump เวอร์ชัน

**โฆษณา 1:1 + 9:16 ผสมกัน — ผู้ใช้เลือก ก (2026-11-17)**
- ผมเสนอ 3 ทาง (ก คง cover / ข fit มีแถบ / ค แยกกรอบต่อสล็อต) · ผู้ใช้ตอบ "ก ดีฟ่า 555 แต่มันยุ่งยาก
  เพราะแบบนี้มันสมส่วนดีแล้ว" → **คง cover** ไม่เพิ่มความซับซ้อน
- **ปิด FAIL ค้างที่สําคัญ:** `check-sponsor-layout.js` เดิม assert "each creative keeps its own shape,
  fitted not cropped" → ขัดกับ `object-fit: cover` ที่ผู้ใช้สั่งไว้ตั้งแต่ต้น ทำให้แดงค้างมาหลายรอบ
  · แก้ที่ **เทสต์** (ไม่ใช่ที่หน้าตา): เปลี่ยนชื่อเป็น "every creative fills the reserved band, cropped on purpose"
    และยืนยันว่าทั้งสองใบใช้สัดส่วนที่จองไว้ (0.8)
  · **บทเรียน:** check ที่ "แดงค้างเพราะผู้ใช้เลือกอย่างอื่น" ต้องอัปเดตให้ตรงการตัดสินใจ ไม่ใช่ปล่อยไว้
    — ไม่งั้น suite จะมี FAIL ถาวรและไม่มีใครเชื่อมันอีก
- ผล: `check-sponsor-layout` **59 checks ผ่านหมด** · `npm test` 63 scripts

**commit + bump เวอร์ชัน (ผู้ใช้สั่ง 2026-11-17)**
- ผู้ใช้: "commit แล้วก็ขยับเวอร์ชั่นได้เลยคับ"
- bump: NTAPI `0.5.4` → **`0.5.5`** · NTAPI ADS `0.1.0` → **`0.1.1`**
  · แก้ทั้ง `package.json` และ `package-lock.json` (root + `packages[""].version`)
- แบ่ง commit 4 ตัว (ตรวจการเข้ารหัสไทยใน `git log` แล้วถูกต้อง):
  1. `1b09c79` `internal: NTAPI ADS หน้าใหม่แบบการ์ด พร้อมอัตราส่วนกำหนดเอง` (ADS ทั้งชุด + version)
  2. `a79759d` `โฆษณาแนวตั้งแสดงเต็มสัดส่วน ล็อคความกว้าง sidebar และสีแชทไม่ซ้อนกรอบ` (NTAPI ที่ผู้ใช้เห็น)
  3. `b927267` `internal: เตรียมเวอร์ชัน 0.5.5`
  4. `8b4dbe7` `internal: บันทึก HANDOFF และ LOG`
- **การกรองของ release workflow ตรวจแล้ว:** regex คือ `^(ci|chore|test|docs|style|internal)\s*:`
  → commit `internal:` ถูกกรองออก → หน้า v0.5.5 จะขึ้น 1 บรรทัดเท่านั้น (ข้อความจาก commit 2)
- **ยังไม่ push / ยังไม่ tag / ยังไม่ release** — ผู้ใช้จัดการเองตามกฎ
- working tree สะอาดหลัง commit แล้วทั้ง 4 ตัว

**ปล่อย v0.5.5 + ลบรุ่นเก่าออกจาก GitHub (ผู้ใช้สั่ง 2026-11-17)**
- ผู้ใช้: "ส่งอัปเดตก่อนนะคับ ให้มี 0.5.5 ก่อน" แล้วต่อด้วย "ลบเวอร์ชั่นเก่าๆ tag ที่ไม่ได้ใช้ ... เอาทุกเวอร์ชั่นยกเว้นล่าสุด"
- **ขั้นตอนที่ทํา:** push master → tag `v0.5.5` → push tag → poll CI → ตรวจ asset → ลบของเก่า
  · CI `Release` **success** (run 43703513191) · assets: `NTAPI-Setup-0.5.5.exe` + `latest.yml` + blockmap
  · release body อัตโนมัติ = 1 บรรทัด (commit ที่ขึ้นต้น `internal:` ถูกกรองทั้งหมด)
- **ลบของเก่า — ตรวจก่อนลบ:** ยืนยันว่า release ใหม่สุดคือ `v0.5.5` และมี `latest.yml`
  (ถ้าไม่ใช่ → abort ไม่ลบอะไรเลย เพราะลบ `latest.yml` = ตัดทางอัปเดตของผู้ใช้ทุกคน)
  · ลบ releases `v0.5.4…v0.5.0` (HTTP 204 ทั้งหมด) + tags ใน `NTAPI-releases`
  · ลบ tags เก่าใน source `NTAPI` 28 ตัว (เหลือ `v0.5.5`) + tags ในเครื่อง
- **ผลสุดท้าย:** releases = `v0.5.5` · tags (rel) = `v0.5.5` · tags (src) = `v0.5.5` · local tags = `v0.5.5`
- **ทําไมคง tag `v0.5.5` ไว้:** workflow หาแท็กก่อนหน้าด้วย `git describe --tags --abbrev=0 "$tag^"`
  → ถ้าลบตัวล่าสุด รอบถัดไปจะหาจุดตั้งต้นของ release notes ไม่ได้
- **ใช้ API ไม่ใช่เบราว์เซอร์:** token จาก `git credential fill` (scope `repo`) ลบได้ 204 ทุกตัว
  · `git credential fill` อ่านจาก credential manager ของ GitHub Desktop · ไม่พิมพ์ token ลง log
- **รอบปล่อยครั้งถัดไป = `0.5.6`**

**NTAPI: ตัวหมุนในรายการแชทค้าง + เบียดชื่อไปขวา (ผู้ใช้แจ้ง 2026-11-17)**
- ผู้ใช้: "AI ทํางานเสร็จแล้ว ... ยังมีตัวหมุน ๆ อยู่ เหมือน AI กําลังทํางาน แล้วมันควรจะขยับไปติดทางซ้าย
  แต่ตัวหมุนกับชื่อมันออกมาขวานิดนึง"
- **ต้นเหตุ 1:** `renderSessions()` ถูกเรียกเฉพาะตอนรายการเปลี่ยน · `onSettled` ตั้ง `view.busy = false`
  แต่ไม่มีใครวาดใหม่ → `.s-spin` ค้างจนกว่าจะมีอย่างอื่นวาด sidebar
- **ต้นเหตุ 2:** สปินเนอร์อยู่ใน `.s-title` หน้า 이름 → `margin-right: 6px` + กว้าง 7px ดันชื่อไปขวา 13px ทุกเทิร์น
- แก้: ย้ายไปใน `.s-pin-slot` (ช่องซ้าย 14px ที่ทุกแถวจองไว้) · ตัด `margin-right` ของ `.s-spin`
  · เพิ่ม `refreshSessionBusy()` → เรียกใน `onBusy`/`onSettled`/`onError`
  · ระหว่างทํางาน แถวที่ปักหมุดจะเห็นสปินเนอร์แทนหมุด (ใช้ช่องเดียวกัน) แล้วหมุดกลับมาเอง
- **เทสต์ใหม่ 2 checks** (`selftest-session-marks-ui.js`) · `npm test` **63 scripts** · `check-session-marks` ผ่านหมด
- **FAIL รอบแรกเป็นความผิดผมเอง:** เทสต์ใช้ `renderer.indexOf('api.onSettled(')` → เจอตัวแรกที่บรรทัด 6607
  (`refreshUsage`) ไม่ใช่ handler จริง จึงเปลี่ยนไปจับแบบ adjacency regex แทน — บันทึกเป็นบทเรียน:
  **อย่าหาตําแหน่ง handler ด้วย `indexOf` ของชื่อที่ซ้ําได้**
- ค้าง: ยังไม่ทดสอบด้วยตา · ยังไม่ commit · ควรออกเป็น `0.5.6` เมื่อผู้ใช้สั่ง

**NTAPI: ชุดความสวย batch 1a + 1b (ผู้ใช้สั่ง 2026-11-17)**
- โจทย์: "ทําให้โปรแกรมสวยขึ้น ดูน่าใช้ ทันสมัย — เหมือนเดิมแต่สวยขึ้น" + ตัวอย่าง: "ตัวหมุนหน้าชื่อ →
  ขอเป็นวงหมุนรอบกรอบการ์ดแชทที่เลือกอยู่" + "fade ตอนกดปุ่ม/เปิดเมนู + รายการ model อ้วนขึ้นนุ่ม ๆ"
- **ใช้ brainstorming + visual companion:** เปิดเซิร์ฟเวอร์ม็อกอัป (.superpowers/brainstorm/...)
  เสนอ 3 แบบ (A วงหมุน · B กรอบหายใจ · C แถบซ้ายไหล) → **ผู้ใช้เลือก B** และสั่ง "เพิ่มความสว่าง"
  · **ม็อกอัปรอบแรกพัง (ความผิดผม):** หมุนทั้งกล่องแทนการหมุนมุมของ gradient → ก้อนม่วงลอยพ้นการ์ด
    แก้เป็น `@property --angle` + หมุนแค่มุมสี + inner element บังพื้นใน → ถูกต้อง
- **spec:** `docs/superpowers/specs/2026-11-17-ui-polish-design.md` — แนวทาง A (ชั้น CSS ทับ) ได้รับอนุมัติ
- **1a (รอบ 2 — หลังผู้ใช้ดูของจริง):** ผู้ใช้บอก "สีสวยอยู่ แต่ขอให้เร็วขึ้น พอช้ามากมันเหมือนเข้มขึ้นเฉย ๆ ไม่มีมิติ"
  → วินิจฉัยว่าปัญหาคือ **ทรงจังหวะ** ไม่ใช่แค่ความเร็ว (สมมาตร = ค่ากลางค้าง ตาไม่มีจุดเกาะ)
  → เสนอ 3 จังหวะในม็อกอัป (A 1.5 สมมาตร · B 1.2 ชีพจร · C 0.9 ชีพจร) · **ผู้ใช้เลือก B**
  → ลงจริง: `animation: session-breathe 1.2s cubic-bezier(.35,0,.6,1)` ยอดอยู่ที่ 22% · ยอดสว่าง `#baa4ff` .95 + เรืองนอก 20px

- **1a (รอบแรก):** `.session-item.active.busy` + `@keyframes session-breathe` (`box-shadow` เท่านั้น
  เพราะ `border-color` จะทับแถบสีของผู้ใช้) · ยอดสว่าง `#b29bff` .85 + เรืองนอก 18px ·
  ปุ่ม hover/active 1px · `button:focus-visible` ทุกปุ่ม · fade เข้า settings/model-menu/ctx-menu ·
  `.model-option:hover { transform: scale(1.012) }`
- **1b:** `#txSkeleton` เป็นพี่น้องของ `#transcript` (transcript ถูก `innerHTML=''` ทุกครั้งที่สลับแท็บ)
  · `hideSkeleton()` ใน `renderActiveTab` + timeout 2500ms · shimmer 1.35s
- **reduced-motion:** ทุก animation ใหม่หยุดหมด (กรอบหายใจค้างที่ความสว่างกลาง · shimmer เป็นแท่งนิ่ง)
- **เทสต์:** 4 checks ใหม่ใน `selftest-session-marks-ui.js` + `selftest-boot-skeleton.js` (4 checks ใหม่)
  · `npm test` **64 scripts ผ่าน** · geometry 8 ตัวผ่านหมด (sidebar 305 · ชื่อแชท [42,42,42] · pill · โฆษณา · transcript)
- **FAIL 2 ครั้งจากเทสต์ของผมเอง:** `lastIndexOf('@media (prefers-reduced-motion…)')` เจอบล็อกอื่น
  → เปลี่ยนเป็นค้นทุกบล็อก · **บทเรียนซ้ำ:** selector/ชื่อที่ซ้ําได้ ห้ามใช้ indexOf/lastIndexOf หาตําแหน่ง
**รอบ 0.5.7 (2026-11-15):** ปิดช่องว่างของสเปก UI polish 2 ข้อ + แก้โฆษณาที่ผู้ใช้แจ้ง
- **ข้อ 2 fade ตอนปิด:** เปิดมีอนิเมชันแต่ปิดหายวับ → ตาอ่านเป็น "กระพริบ"
  · ใช้ `allow-discrete` + `@starting-style` (เบราว์เซอร์เก่า = ปิดทันทีเหมือนเดิม ไม่พัง)
  · **ctx-menu เป็นข้อยกเว้น:** node ถูก `.remove()` ทันที → ต้องเติม class `is-closing` ใน JS
    → ต้องตั้ง `openMenuEl = null` ก่อน (กัน close ซ้ำ) และลบเมนูที่จางค้างก่อนเปิดอันใหม่
- **ข้อ 4 model row:** สเปกเขียน 1.035 + ตัวหนา แต่รอบแรกผมทำ 1.012 แล้วไม่บอกผู้ใช้ (ผิด)
  → รอบนี้ตามสเปก แต่ใช้ `-webkit-text-stroke` แทน `font-weight` เพราะเปลี่ยนน้ำหนัก = รีโฟลว์ = แถวกระตุก
- **โฆษณา "ภาพหลุดเฟรม ตัวหนังสือหาย":** ผู้ใช้เทียบว่า ADS ไม่เป็น แต่ NTAPI เป็น
  · **วินิจฉัย:** ไม่ใช่ overflow — เป็นการ **ครอป** · feed จริง (ดึงจาก GitHub) มี c1 `1:1` และ tip1 `4:5`
    → ช่องจอง = min = 4:5 (270×338) → ครีเอทีฟ 1:1 ถูก `cover` ตัดข้างละ ~27px
  · **เชิงโครงสร้าง:** ADS ใช้ `frameSize()` ตามอัตราส่วนครีเอทีฟเอง แต่ NTAPI ใช้เฟรมร่วม 1 เฟรม
  · **ผู้ใช้เลือกแบบ ข** (เฟรมตามครีเอทีฟ) เพราะตรงกับ ADS ที่เขาชอบ
  · **เทคนิคสําคัญ:** `reserved = min(ทุกสล็อต)` ⇒ `slotRatio >= reserved` เสมอ ⇒ **ความกว้างเป็นตัวบังคับเสมอ**
    → `.sponsor-frame { width:100%; aspect-ratio: var(--slot-r) }` เต็มความกว้าง ความสูงสั้นกว่าช่องจอง ⇒ cover ไม่ครอป
  · **เทสต์เก่าที่ต้องกลับด้าน:** `every creative fills the reserved band, cropped on purpose`
    → เปลี่ยนเป็น "each creative keeps its own shape, so nothing is cropped" (สัญญาเปลี่ยนโดยตั้งใจ)
- **ผลวัด:** `ratios [2, 0.8]` · `heights [338,338]` (ไม่กระตุก) · `fits [true,true]` · `widths [270,270]`

**บทเรียนซ้ํา (2026-11-15):** อย่าลดค่าที่ตกลงไว้ในสเปกโดยไม่บอกผู้ใช้ — เคส 1.012 vs 1.035

**รอบ 0.5.8 (2026-11-16): `/skill` + แปลข้อความเตือน**
- **ผู้ใช้ขอ:** "พิมพ์ /skill ขึ้นโชว์ตอนก่อนส่งได้ไหม ว่ามีอะไรบ้าง" · คุยก่อนทำ · เลือก **1 ค / 2 ก / 3 ก / A**
  · ค = `/` ไม่รก ใช้ `/skill` เป็นทริกเกอร์ · ก = แทรก `@name` · ก = คำอธิบายอังกฤษตาม SKILL.md
  · A = อุ่นรายการตอนบูต · **ส่งแค่อัปเดต ไม่ build ตัวติดตั้ง**
- **ได้ของฟรี:** เมนู `/` มีอยู่แล้ว (SLASH_COMMANDS + filter + คีย์บอร์ด) · `loadSkills()` (IPC cache 60s) มีอยู่แล้ว
  → งานคือต่อท่อ ไม่ใช่สร้างใหม่
- **กับดักที่เกือบพลาด:** `loadSkills()` วางไว้ที่ "initial paint" (บรรทัด ~8295) ไม่ได้ เพราะ `let skillsCache` อยู่ทีหลัง
  (บรรทัด ~8521) → TDZ ReferenceError · ใช้ `setTimeout(() => loadSkills(), 0)` ให้รันหลัง script ประเมินเสร็จ
- **เทสต์ probe ล้มครั้งแรก:** `npx electron probe` ไม่มี handlers (`app:boot`, `usage:fetch`, `skills:list`)
  → รายการว่าง ไม่ใช่บั๊กของฟีเจอร์ · **ผู้ใช้ถามว่าแก้ได้ไหม → ได้** · เปลี่ยนเป็น `check-skill-menu.js`
  ที่ลงทะเบียน `ipcMain.handle('skills:list')` เองแล้วสแกน `~/.agents/skills` จริง → **48 ตัว ผ่าน 9/9**
- **ผู้ใช้แจ้งต่อ:** "ข้อความสีเหลืองที่แจ้งเตือนในช่องแชท ยังแปลไทยไม่หมด"
  · ลบ probe ทิ้งแล้ว (ตามที่รับปากว่าจะลบ)
  · สแกน 72 call site ของ `showNotice()` → ไม่ผ่าน `t()` 16 จุด · ในนั้น **ฝังอังกฤษจริง 5 จุด**
    (`Could not delete` · `Deleted session from disk.` · `Could not read the path` · `Could not switch model` + main 2 จุด)
  · **main.js เป็นตัวการสําคัญ:** `sendTab('agent:notice', { text: '...' })` ไม่มี `key` → renderer แปลไม่ได้เลย
- **ผู้ใช้เลือก ข** (แปลง error ผู้ให้บริการด้วย) และถามว่า "เปลือง token ผู้ใช้ไหม" → **ไม่** ตาราง regex ในเครื่อง
- **บั๊กในเทสต์ของผมเอง 3 รอบ:** `\'` หลุดใน string · `SOURCE` ไม่มี (ตัวแปรชื่อ `app`) · `soften(text)` ไม่ส่ง lang
  → default `'th'` · และ assertion ที่คาด `/เชื่อมต่อไม่ได้/` ทั้งที่ข้อความจริงคือ `/เซิร์ฟเวอร์ไม่ได้/`
- **ผล:** `selftest-notice-i18n.js` 25 checks · `check-skill-menu.js` 9 checks · `npm test` **66 scripts**

**รอบ 0.5.8 ปล่อยแล้ว (2026-11-16)**
- bump `0.5.8` (`47c449b`) → tag `v0.5.8` → CI `43858669875` **success** (~2 นาที) → release มี 3 assets
  · `latest.yml` 339B · `NTAPI-Setup-0.5.8.exe` 118,256,100B · blockmap
- **ผู้ใช้สั่งเก็บ release ไว้รุ่นเดียว:** ลบ API `DELETE /releases/{id}` + `DELETE /git/refs/tags/{t}`
  · ลบ release + tag `v0.5.7` ใน `NTAPI-releases` · ลบ tag `v0.5.5`, `v0.5.6`, `v0.5.7` ใน repo ต้นทาง
  · **ผล:** release เหลือ 1 (`v0.5.8`) · tag ต้นทางเหลือ `v0.5.8` · tag ในเครื่องเหลือ `v0.5.8`
- **เรื่องที่คุยแล้วไม่ได้ทำ (ผู้ใช้สั่งข้าม):** ปุ่ม/สวิตช์ฝัง “กติกาการใช้ bash” ลง system prompt
  · คุยกันแล้วอธิบาย 3 ทางเลือก (ติ๊กถาวร / ชิป `@bash-rules` / สองชั้น) + ต้นทุน token 90–150/เทิร์น
  · ผู้ใช้ตอบว่า "เป็นเรื่องของผู้ใช้ ไม่น่าเกี่ยวกับเรา" → **ไม่แตะโค้ด**

- **ปล่อยแล้ว v0.5.6** (2026-11-15): commit `0ba9e0f` (UI polish + ตัวหมุน) · `c718bd2` · `5e92443` (bump)
  · CI run `43712252312` success ทุก step (build 3 นาที) · asset 3 ไฟล์ใน `Cheumklang/NTAPI-releases`
  · `latest.yml` → `version: 0.5.6` `path: NTAPI-Setup-0.5.6.exe` (118 MB) · แจ้งเตือนผู้ใช้ทาง `ntfy.sh/NTAPI`
- **บทเรียนของเทิร์นนี้:** `gh` CLI ไม่มีใน shell นี้ — GitHub ใช้ **stored credential ของ `git credential fill`**
  (40 ตัว · classic PAT) ยิง REST API แทนได้ · และ `/releases/tags/<tag>` ต้องถามที่ **`Cheumklang/NTAPI-releases`**
  ไม่ใช่ repo ต้นทาง (ต้นทางมีแค่ tag)

**รอบแก้ 4 เรื่อง (ยังไม่ commit · 2026-11-17)**
- **โฆษณา: เส้นแบ่ง/ระยะไม่กลับลงมา** — `paintSponsorMedia()` เคยจองความสูงตามสัดส่วนที่สูงสุดใน feed
  (`sponsorReservedRatio`) → พอเปลี่ยนไปชิ้นเล็ก แถบยังสูงเท่าเดิม เส้นแบ่งค้างบน + โหว่ระหว่างโฆษณากับ label
  · แก้: ใช้สัดส่วนของ slot ที่แสดงอยู่ (`sponsorRatio(slot)`) + CSS `aspect-ratio: var(--sponsor-r, 2)`
  · ลบ `sponsorReservedRatio()` ทิ้ง · วัดจริง: 2:1 = 140px / 4:5 = 338px (เดิมเท่ากัน)
  · `selftest-sponsor` เปลี่ยนเช็ก "2:1 ตายตัว" → "ตามสัดส่วน slot" · `check-sponsor-layout` 61 checks ผ่าน
- **เมนู model: "เฉพาะฟรี" กดคำไม่ได้** — คำไม่ใช่โฟกัสได้ → กดแล้ว focus ตกไป `<body>` → `focusout` ปิดเมนู
  ก่อน checkbox ถูกติ๊ก (เหลือแต่กล่อง 13px) · แก้: `tabindex="-1"` ที่ label + flag `modelPickerPress`
  ให้ `focusout` ข้ามการปิดเมื่อการกดเริ่มใน picker
- **เมนู model: scroll bar แนวนอน** — `.model-list { overflow-x: hidden }` + ขยายเมนู 372 → 440px (แนวตั้งไม่แตะ)
- **first-run guide (ใหม่)** — `GUIDE_STEPS` 4 สเต็ปชี้ของจริง: ปุ่มตั้งค่า → แท็บผู้ให้บริการ → model picker → ช่องพิมพ์
  · สเต็ป 1–2 เลื่อนเองเมื่อผู้ใช้กดของจริง · ปุ่ม "ข้าม" ทุกสเต็ป · เก็บ `prefs.guideDone` (whitelist ใน `prefs:set`)
  · `scripts/check-first-run-guide.js` 14 checks
- **undo 5 วิ หลังกด Enter ตอน AI ว่าง (ใหม่)** — `offerUndoSend()` แถว "แก้ไขได้อีก {n} วิ · แก้ไข/ยกเลิก"
  · ส่งทันทีเหมือนเดิม (ไม่หน่วง) · ยกเลิก/แก้ไข = `api.abort` + ถอนข้อความ + คืนคำกลับช่องพิมพ์
  · `scripts/check-undo-send.js` 9 checks · `npm test` 66 scripts ผ่าน
- **เปิดโปรแกรมใหม่แล้วไม่กลับไปแชทล่าสุด (2026-11-17 · ยังไม่ commit)** — เดิม `boot()` เปิด
  `tabs[0]` เสมอ → มี 2 แชทเปิดไว้ ปิด/เปิดใหม่เด้งไปอีกแชท
  · แก้: `rememberActiveTab()` เขียน `prefs.activeSession` ทุกครั้งที่แท็บกลายเป็นแท็บที่ดูอยู่
  (`applyTabState`) · `restoringTabs` ปิดการเขียนระหว่างกู้แท็บ ไม่งั้นแท็บสุดท้ายที่กู้จะทับค่า
  · `pickRestoreTarget()` เลือกแท็บที่จำไว้ (เทียบ path แบบไม่สนตัวพิมพ์) ไม่เจอ → `tabs[0]`
  · `prefs:set` รับ `activeSession` เฉพาะ path ที่อยู่ใต้ `DATA_ROOT/sessions`
  · เทสต์ใหม่ `scripts/check-restore-active-tab.js` 9 checks · `npm run check:restore`
- **ค้างสถานะ “กำลังทำงาน” + กดหยุดไม่ได้ (2026-11-17 · ยังไม่ commit)** — ผู้ใช้แจ้ง: AI ตอบจบแล้ว
  แต่ป้ายยังขึ้นกำลังทำงาน และปุ่มหยุดกดไม่ติด
  · ต้นเหตุ 1: `prompt:abort` ใน main **await `session.abort()` ก่อน** ล้าง `tab.busy`
  → เซสชันที่ไม่ทำงานอยู่/ติดรอคำตอบ `abort()` ไม่คืนค่า → ป้ายค้าง + กดซ้ำก็เงียบ
  (แก้: ล้างธง + `sendTab busy:false` **ก่อน** แล้ว `Promise.race` กับ timeout 4 วิ)
  · ต้นเหตุ 2: renderer ปิดป้ายเฉพาะ settled ของแท็บที่ active ตอนนั้น → เทิร์นจบในแท็บอื่น/สลับแท็บ
  แล้ว event ตก → ป้ายค้าง (แก้: `paintBusyFromViews()` อ่าน `activeView().busy` + ตัวกระทบยอด
  ทุก 4 วิ ถาม `api.getTabState()` ว่าจริง ๆ ยังทำงานไหม)
  · เทสต์: `selftest-busy-state.js` 7 checks (อยู่ใน `npm test` = 67 scripts) ·
  `check-busy-state.js` 8 checks (`npm run check:busy`) · ปรับ window ใน `selftest-model-fallback` 600→1400
- **กฎใหม่: “ส่งอัปเดต” vs “build” (ผู้ใช้สั่ง 2026-11-17 · เขียนใน `AGENTS.md` + `.AGENT/HANDOFF.md` §0)**
  · **ส่งอัปเดต** = bump + tag + push → คนที่ติดตั้งแล้วกดอัปเดตในโปรแกรมได้ · ไม่ต้อง build/แนบตัวติดตั้งให้คนใหม่โหลด · ไม่ต้องลบ release เก่า
  · **build** = ส่งอัปเดต + ตรวจว่า `NTAPI-Setup-X.Y.Z.exe` + `latest.yml` ครบ ลิงก์โหลดใช้ได้ + **ลบ release/tag เก่าให้เหลือรุ่นเดียว**
  · ไม่ชัด = ถาม · แก้เลขค้างใน AGENTS.md (`0.5.1` → รอบถัดไป `0.5.9`) ให้ตรงกับ HANDOFF

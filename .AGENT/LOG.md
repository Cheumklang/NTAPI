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

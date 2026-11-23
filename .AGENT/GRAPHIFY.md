# แผนที่นำทางโค้ด — Graphify

อัปเดตล่าสุด: 2026-11-22 · Graphify CLI `0.9.115` · สร้างจาก working tree ขณะ `HEAD` อยู่ที่ `b771e06d11c72b56860a6dc8e2de3c90ca487c9b` (รวม source changes ที่มีอยู่ใน working tree ตอนสแกน ไม่ได้จำกัดเฉพาะ commit นี้)

## ใช้ไฟล์นี้อย่างไร

เริ่มจากแผนที่ Graphify เพื่อหาจุดเชื่อมและชื่อฟังก์ชัน จากนั้นเปิด source จริงเพื่อตรวจรายละเอียดก่อนอธิบายหรือแก้ไข โหนด `EXTRACTED` สะท้อนโครงสร้างที่ parser พบ ส่วน `INFERRED` เป็นข้ออนุมานและต้องตรวจยืนยันเอง

- ไฟล์กราฟ: `graphify-out/graph.json`
- รายงานจาก Graphify: `graphify-out/GRAPH_REPORT.md`
- กราฟนี้สร้างด้วย `--code-only` — **ไม่มีเอกสาร รูปภาพ หรือวิดีโออยู่ในกราฟ**
- ไม่ได้เรียก LLM/API: สกัดโค้ด 333 ไฟล์ในเครื่อง ได้ 3,779 nodes; ไฟล์ `graph.json` มี 7,254 links ส่วนรายงาน clustering แสดง 6,416 edges หลังสร้างกราฟ; ค่า token 0
- รายงานมี 240 communities แต่ตั้ง `--no-label` จึงชื่อเป็น `Community N` ไม่ใช่ชื่อ subsystem ที่คนตั้งให้ และปิด visualization ด้วย `--no-viz`
- repo มีสองโปรแกรม: NTAPI (`app/`) และ NTAPI ADS (`NTAPI ADS/`); graph ครอบคลุมโค้ดของทั้งคู่และสคริปต์/ไฟล์โค้ดระดับราก
- Graphify แจ้งว่า `.last-token` เป็นไฟล์น่าสงสัยและไม่รวมไว้; อย่าพยายามใส่ secrets เข้า graph
- `built_at_commit` ใน graph เป็นเพียง HEAD ตอนสร้าง ไม่ได้แปลว่าสแกนเฉพาะ committed files; การสแกนรวมไฟล์ source ที่แก้/เพิ่มอยู่ใน working tree ตอนนั้นด้วย หากมีการแก้ไฟล์หลังสร้างให้ถือว่ากราฟอาจเก่า

## จุดเริ่มสำรวจ NTAPI

1. `app/src/main.js` — Electron main process, หน้าต่าง, IPC/session lifecycle และ wiring หลัก; เริ่มหา flow ฝั่ง main ที่นี่
2. `app/src/preload.js` — bridge แบบจำกัดระหว่าง renderer กับ main; ใช้คู่กับ handler ใน `main.js` เวลาตาม IPC
3. `app/src/renderer/app.js` — UI และ state/render ของหน้าแชท; เป็นไฟล์ใหญ่ แนะนำค้นชื่อฟังก์ชันเฉพาะแทนการอ่านรวดเดียว
4. `app/src/freepi-bridge.js` — สร้าง Pi session, provider/model, credentials/config และ tools ที่ผูกกับ agent
5. `app/src/provider-plan.js`, `app/src/provider-errors.js`, `app/src/renderer/provider-ui.js` — แยกดูการจัดแผน provider, แปล error และ UI เลือก provider/model
6. `app/src/browser-bridge.js`, `app/src/browser-claims.js`, `app/browser-extension/` — การเชื่อม browser extension, claimed tabs และ browser tools
7. `app/src/system/` — adapter แยก OS: `linux.js` กับ `atspi.py`; `windows.js` กับ `uia.ps1` · หากแก้ข้ามแพลตฟอร์ม ให้เช็กคู่ adapter และทดสอบอีกฝั่งตามกฎใน `AGENTS.md`
8. `app/scripts/` — selftest และ check scripts; ใช้ `app/scripts/run-unit-tests.js` กับ `app/package.json` เพื่อดูรายการทดสอบที่ลงทะเบียนจริง

Graphify hubs ที่ช่วยนำทาง: `t()` และ `el()` (renderer utilities), `createFreePiSession()` (`freepi-bridge.js`), `activeView()`/`renderActiveTab()` (`renderer/app.js`), `createBrowserBridge()` (`browser-bridge.js`). ค่า degree เป็นจำนวนการเชื่อมในกราฟ ไม่ได้แปลว่าเป็นจุดผิดพลาดหรือควรแก้ก่อนเสมอ

## จุดเริ่มสำรวจ NTAPI ADS และจุดเชื่อมระหว่างโปรแกรม

- `NTAPI ADS/src/main.js` — Electron main และ orchestration การเผยแพร่
- `NTAPI ADS/src/feed.js` — สร้าง/normalize ข้อมูล sponsor feed (`buildFeed()`)
- `NTAPI ADS/src/renderer/app.js` — หน้าจอจัดการและ publish
- `app/src/sponsor.js` และ `app/src/sponsor-feed.js` — ฝั่ง NTAPI อ่าน/normalize feed
- สัญญาระหว่างโปรแกรมคือ `sponsor.json`; หากแตะ schema ให้ตรวจ producer/consumer ทั้งสองฝั่งและเทสต์ทั้งคู่ตาม `AGENTS.md`

## แผนที่เอกสารที่กราฟรอบนี้ไม่ได้อ่าน

เมื่อต้องการบริบท/กฎ/ประวัติ ให้เปิดเอกสารเหล่านี้โดยตรง (ไม่ใช่สั่งถามกราฟ):

- `AGENTS.md` — กฎงานสำคัญ ภาษาไทย การข้าม Windows/Linux และการทดสอบ
- `.AGENT/HANDOFF.md` — สถานะล่าสุด งานค้าง และคำสั่ง/การตัดสินใจล่าสุด
- `.AGENT/PROJECT.md` — ภาพรวมสถาปัตยกรรมและคำสั่งทดสอบ
- `.AGENT/LOG.md` — ประวัติการทำงาน
- `NTAPI ADS/AGENTS.md` — ชี้กลับมากฎ root และข้อควรระวังเฉพาะ ADS
- `PROVENANCE/README.md` — กติกาหลักฐาน provenance; ห้ามแก้ ledger ด้วยมือ
- `docs/superpowers/specs/` และ `docs/superpowers/plans/` — สเปก/แผนฟีเจอร์

## คำสั่ง Graphify สำหรับ session ถัดไป

รันจาก root ของ repo (`/home/nt/NT-ALL/NTAPI` บน Ubuntu หรือ `Z:\NT-ALL\NTAPI` บน Windows VM):

```bash
graphify explain "createFreePiSession()" --all
graphify explain "createBrowserBridge()" --all
graphify query "How does the main process connect preload, renderer and Pi sessions?" --budget 2000
graphify path "createFreePiSession()" "planProviders()" --undirected
```

หลังเปลี่ยนโค้ดและต้องการสร้างกราฟ code-only ใหม่ ให้รันจาก repo root:

```bash
graphify extract . --code-only --no-cluster --no-gitignore
graphify cluster-only . --no-label --no-viz
```

คำสั่งสร้าง/เขียน `graphify-out/` แต่ไม่แก้ source code หรือส่ง code/docs ไป LLM; ใช้เฉพาะเมื่อจำเป็น เพราะ full extraction ใช้เวลามากกว่าการ query กราฟที่มีอยู่

## ขอบเขตการใช้เครื่องมือใน session ที่สร้างแผนที่นี้

- Graphify ใช้สำรวจและสร้างกราฟ local-only ตามข้างต้น
- `ponytail` ใช้กำกับขอบเขตแบบ minimal และยืนยันว่าไม่แก้โค้ดโปรแกรม
- `claude-mem` ถูกถอนการติดตั้งแล้วตามคำสั่งผู้ใช้; ห้ามใช้/ติดตั้งกลับโดยไม่มีคำสั่งใหม่
- การสำรวจนี้อ่านไฟล์และเขียนเฉพาะ `graphify-out/` กับเอกสารนำทาง/บันทึกส่งต่อ ไม่มีการแก้ source code

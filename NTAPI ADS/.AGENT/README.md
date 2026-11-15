# .AGENT — ความจำของ NTAPI ADS

โปรแกรมนี้ใช้ระบบความจำ **ชุดเดียวกับ NTAPI** (repo เดียวกัน)

## ลำดับการอ่าน
1. **`../../.AGENT/HANDOFF.md`** ← สถานะจริงของทั้งสองโปรแกรม (อ่านก่อนเสมอ)
2. `PROJECT.md` (โฟลเดอร์นี้) — สถาปัตยกรรม + จุดตัดสินใจที่ห้ามเผลอกลับ
3. `../../.AGENT/LOG.md` — ประวัติงาน (ต่อท้ายล่าสุด)
4. `../../AGENTS.md` — กติกาเหล็ก

## กติกา
เหมือน NTAPI ทุกข้อ: ห้าม commit/push/tag เอง · commit message ภาษาไทยบรรทัดเดียว ·
ห้ามขยับเวอร์ชันเอง · ทุกคำสั่ง shell ต้องมี `timeout` · ตอบภาษาไทย

## ข้อที่ต่างจาก NTAPI
- ไม่มี installer/release flow ของตัวเอง (ใช้ `npm run dist` เมื่อสั่งเท่านั้น)
- **ห้าม commit token** — อยู่ที่ userData (`%APPDATA%/ntapi-ads/ads-config.json`) เท่านั้น
- แก้ `src/feed.js` = แก้สัญญากับ NTAPI → ต้องแตะ `../../app/src/sponsor.js` ด้วย

## โปรโตคอลก่อนจบ session
อัปเดต `../../.AGENT/HANDOFF.md` (หัวข้อที่เกี่ยวกับ ADS) + ต่อท้าย `../../.AGENT/LOG.md`

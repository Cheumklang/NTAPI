# คำแถลงความเป็นเจ้าของ — NTAPI

> เอกสารนี้อธิบายเจ้าของและประวัติของโปรเจกต์ NTAPI ใช้ประกอบหลักฐานที่เก็บใน `PROVENANCE/`

## เจ้าของ / ผู้สร้าง
- **ผู้ถือสิทธิ์:** Cheumklang
- **โปรเจกต์:** NTAPI — แอปแชทบน Windows (Electron)
- **พื้นที่จัดเก็บซอร์ส (private):** `C:\Users\cheum\OneDrive\เดสก์ท็อป\NTAPI`
- **พื้นที่ปล่อยรุ่น (public):** `https://github.com/Cheumklang/NTAPI-releases`

## สิ่งนี้ยืนยันอะไร
- ตัวโปรแกรม (โค้ดใน `app/`) เป็นงานสร้างสรรค์ที่เขียนขึ้นโดยเจ้าของ
  และประวัติการเขียนต่อเนื่องกันตั้งแต่ commit แรกใน git history
- ทุกรุ่นที่ปล่อย (`NTAPI-Setup-X.Y.Z.exe`) ถูกสร้างจากซอร์สนี้ และตรวจ hash ได้
- ระบบ "สมุดบันทึกหลักฐาน" (`PROVENANCE/`) เริ่มรันวันที่ 2026-11-17
  และถูกเพิ่มเข้าในกติกาของโปรเจกต์ (AGENTS.md) ให้บันทึกอัตโนมัติทุกการทำงาน

## เส้นเวลา
- โปรเจกต์เริ่มพัฒนาใน repo เดียวกับแอป NTAPI (ดู commit แรกใน `git log`):
  `git log --reverse --format="%ad %an %s" --date=iso`
- รุ่นแรก ๆ ปล่อยผ่าน `Cheumklang/NTAPI-releases` (ดู `git tag` ของ release ต่าง ๆ)

## การบันทึกอัตโนมัติ (ไม่ต้องสั่ง)
| โอกาส | สิ่งที่ถูกบันทึก | โดยใคร |
|---|---|---|
| ทุก commit | hash chain entry + commit/tree hash | git hook `.githooks/post-commit` |
| ทุกการทำงาน (session) | เวลา + โมเดล + commit + ไฟล์ที่แก้ (พร้อม sha256) | `provenance.js record-session` (ตามกฎ AGENTS.md) |
| ทุกการปล่อยรุ่น | version + tag + commit + CI + sha256 ตัวติดตั้ง | `provenance.js record-release` (ตามกฎ build) |
| รายวัน / ตามจังหวะ | หัว chain → `manifest.txt` + `anchors/` | `provenance.js anchor` |

## วิธีตรวจว่าหลักฐานยังสมบูรณ์
```bash
node app/scripts/provenance.js verify
```
ผลที่ถูกต้อง: `OK … entries, … record file(s) verified` + `head seq …` พร้อม hash ตรงกับ `manifest.txt`
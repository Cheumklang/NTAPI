# PROVENANCE — หลักฐานว่าโปรแกรมนี้เป็นผลงานของคุณ

โฟลเดอร์นี้คือ **หลักฐานแสดงการเป็นผู้สร้าง (authorship evidence)** ของโปรเจกต์ NTAPI
สร้างไว้เผื่อกรณีมีผู้อื่นลอกงานแล้วอ้างว่าเขาทำก่อน — ใช้ประกอบการอ้างอิงในศาลได้

## มีอะไรในนี้

| ที่ | คืออะไร |
|---|---|
| `ledger.jsonl` | **สมุดบัญชีหลัก** — 1 บรรทัด = 1 เหตุการณ์ (สร้างระบบ, ทำงาน, commit, ปล่อยรุ่น) เรียงต่อกันแบบ **hash chain** แก้บรรทัดเก่าทีหลังไม่ได้ เพราะจะทำให้ hash ต่อจากนั้นแตกหมด |
| `sessions/<เดือน>/` | บันทึกการทำงานแต่ละ session: เวลา, โมเดล, commit ที่ใช้, ไฟล์ที่แก้ + **sha256 ของแต่ละไฟล์** |
| `releases/vX.Y.Z.json` | บันทึกการปล่อยแต่ละรุ่น: version, tag, commit, CI, **sha256 ของตัวติดตั้งที่คนโหลดจริง** |
| `anchors/<วันที่>.txt` | สแนปชอตหัว chain รายวัน — เอาไว้พิมพ์/เซ็น/แชร์เป็นพยานภายนอก |
| `manifest.txt` | สรุปหัว chain ล่าสุด (อัปเดตอัตโนมัติทุกครั้งที่ `anchor`) |
| `AUTHORSHIP.md` | คำแถลงความเป็นเจ้าของ (ชื่อเจ้าของ, repo, วันที่เริ่ม) |
| `README.md` | ไฟล์นี้ |

## ระบบทำงานยังไง (สั้น)

ทุกเหตุการณ์บันทึกเป็นบรรทัดใน `ledger.jsonl`:

```
hash(n) = sha256( seq, kind, เวลา, สรุป, data, prev = hash(n-1) )
```

- `prev` ชี้ hash ของบรรทัดก่อน → **แก้บรรทัดไหน = แตกทั้งสายต่อจากนั้น**
- `data` ผูกกับเนื้อหาจริงผ่าน hash ของ git (commit/tree) และ sha256 ของไฟล์งาน/ตัวติดตั้ง
- `verify` จะไล่ตรวจทั้งสายแล้วบอกทันทีว่าจุดไหนถูกแก้ทีหลัง

## คำสั่งที่ใช้ (รันใน `app/`)

```bash
node app/scripts/provenance.js status        # สถานะปัจจุบัน (ใช้ทุกเทิร์น)
node app/scripts/provenance.js record-session --note "สรุปงาน"   # บันทึก session
node app/scripts/provenance.js record-commit # บันทึก commit (hook ทำอัตโนมัติ)
node app/scripts/provenance.js record-release 0.5.12 --asset "NTAPI-Setup-0.5.12.exe:118266209:<sha256>" --ci "https://github.com/Cheumklang/NTAPI/actions/runs/123"
node app/scripts/provenance.js anchor        # อัปเดต manifest + anchors
node app/scripts/provenance.js verify        # ตรวจว่าสาย chain เรียบร้อย
```

- **ทุก commit บันทึกอัตโนมัติ** ผ่าน git hook (`.githooks/post-commit` — `core.hooksPath` ตั้งไว้แล้ว)
- ทุกครั้งที่ปล่อยรุ่นใหม่: หลัง CI สำเร็จ ต้องรัน `record-release` พร้อม sha256 ของตัวติดตั้ง

## ทำไมถึงอ้างในศาลได้

หลักฐานแบบนี้ไม่ได้พิสูจน์ "จริง" แต่พิสูจน์ **ลำดับเวลาและความต่อเนื่อง** ที่คนลอกงานสร้างไม่ได้:

1. **มีอยู่ก่อน** — บันทึกถูกเขียนตอนเกิดเหตุ (timestamp + git commit date + CI run)
2. **ผูกกับเนื้อหา** — งานชิ้นไหนเขียนเมื่อไหร่ อยู่ใน commit/tree hash และ sha256 ของไฟล์
3. **แก้ทีหลังไม่ได้** — hash chain + verify; ถ้ามีใครแก้ `ledger.jsonl` จะจับได้ทันที
4. **มีคนกลางยืนยัน** — GitHub (commit history + release + CI) และ OneDrive (version history)
   เป็นผู้ถือสำเนาอิสระที่ระบุวัน-เวลาจากฝั่งเขา

### ข้อจำกัดที่ต้องรู้ตรง ๆ
- hash chain พิสูจน์ได้เท่าที่ **หัว chain** ถูกตีเวลาโดยภายนอก (GitHub/OneDrive/พิมพ์ออกมา)
  → **ทุกครั้งที่ `anchor` ให้สำเนา `manifest.txt` ไปไว้ที่อื่น** (เมลล์ตัวเอง, อัปโหลดส่วนตัว,
  พิมพ์เก็บ) เพราะถ้าทุกสำเนาอยู่ในเครื่องเดียว ก็อ้าง "ถูกแก้ทั้งชุด" ได้
- git commit *date* ย้อนหลังได้ ถ้าใครมีสิทธิ์ใน repo — แต่ GitHub จะมี **push date** แยก
  และ release/CI มีเวลาของ GitHub อีกชั้น

### ถ้าจะใช้จริงในชั้นศาล
1. รัน `node app/scripts/provenance.js verify` → เก็บผล (ต้องเป็น `OK …`)
2. รัน `anchor` → นำ `manifest.txt` ไปพิมพ์ 2 ชุด + ให้ใครสักคนลงนามกำกับวันเวลา
3. Export git history: `git bundle create ntapi-YYYY-MM-DD.bundle --all` เก็บไว้ในเครื่องอื่น
4. เก็บหน้าจอ GitHub: repo commits + release assets + CI run (มีวันเวลาฝั่ง GitHub)
5. เก็บตัวติดตั้งที่ปล่อยจริง 1 ไฟล์ + hash (ใน `releases/vX.Y.Z.json` มีอยู่แล้ว)

## กติกา (อ่านแล้วทำตามเสมอ)
- **ห้ามแก้ไฟล์ในโฟลเดอร์นี้ด้วยมือ** — ให้ใช้สคริปต์เท่านั้น
- ห้ามใส่ข้อมูลส่วนตัว/คีย์/อะไรที่เป็นความลับลงในบันทึก (มันถูก commit ขึ้น GitHub)
- ถ้า `verify` ไม่ผ่าน → **หยุดงานแล้วแจ้งผู้ใช้ทันที** (อาจมีใครแก้ ledger)
# NTAPI ADS

เครื่องมือสำหรับ **เผยแพร่สปอนเซอร์** ขึ้นแถบท้าย sidebar ของ NTAPI
โดยไม่ต้องอัปเดตตัวโปรแกรม NTAPI เลย

- ลากรูป/วิดีโอ หรือวางลิงก์ → เลือกอัตราส่วนกรอบได้ 4 แบบ (`2:1` · `16:9` · `1:1` · `4:5`)
  แล้วครอปให้อัตโนมัติ — NTAPI จะแสดงกล่องสูง-เตี้ยตามอัตราส่วนนั้น
- ใส่ลิงก์ปลายทาง + ข้อความ TH/EN
- กด **เผยแพร่** → เขียน `sponsor.json` + ไฟล์มีเดียขึ้น repo `Cheumklang/NTAPI-sponsor`
- NTAPI ทุกเครื่องดึงของใหม่ภายในไม่กี่นาที (แคชไว้ในเครื่อง ไม่ยิงหาผู้ใช้)

## เริ่มใช้ครั้งแรก

1. สร้าง repo **public** ชื่อ `NTAPI-sponsor` ใต้บัญชี `Cheumklang`
   (ต้อง public — NTAPI ดึงผ่าน CDN แบบไม่ใช้ token)
2. สร้าง Personal Access Token แบบ fine-grained
   → Repository access: `NTAPI-sponsor` เท่านั้น
   → Permissions: **Contents: Read and write**
3. เปิดโปรแกรม (ดับเบิลคลิก `NTAPI ADS.bat`) → **ตั้งค่า** → วาง token → **บันทึก**
4. กด **ตรวจว่าเขียนได้** ให้ขึ้น ✓ ก่อนเผยแพร่ครั้งแรก

## คำสั่ง

```bash
cd "NTAPI ADS"
npm install          # ครั้งแรกครั้งเดียว
npm start            # เปิดโปรแกรม
npm test             # เทสต์ออฟไลน์ (ไม่ใช้เน็ต/ไม่ใช้ token)
npm run dist         # สร้าง installer (ออกที่ ../dist-ads)
```

## ข้อจำกัดที่ตั้งไว้

| อย่าง | เพดาน | ทำไม |
|---|---|---|
| รูป | 1.2 MB (หลังแปลงเป็น WebP 1024×512) | แบนเนอร์ต้องไม่กินเน็ตผู้ใช้ |
| วิดีโอ | 8 MB / 10 วินาที | เกินกว่านี้เริ่มรู้สึกเหมือนโฆษณาบังคับ |
| ภาพปกวิดีโอ | 400 KB | ใช้ตอนโหลดคลิป/โหมดลดการเคลื่อนไหว |
| จำนวนสล็อต | 8 | เกินกว่านี้เท่ากับขายทั้งหน้าจอ |
| ข้อความ | 80 ตัวอักษร | sidebar กว้าง 268px |

วิดีโอ **ไม่ถูกแปลงไฟล์** (โปรแกรมนี้ไม่มี ffmpeg โดยตั้งใจ) — NTAPI ครอปให้เต็มกรอบ
ด้วย `object-fit: cover` เอง ดังนั้น"Cลิปทรงไหนก็เห็นขนาดเท่ากัน"

## ไฟล์ที่เขียนขึ้น GitHub

```
sponsor.json                 ← สัญญาระหว่างสองโปรแกรม
media/<id>.webp              ← รูป (หรือ <id>.mp4 / <id>.webm)
media/<id>-poster.webp       ← ภาพปกของวิดีโอ
```

`sponsor.json`:

```json
{
  "version": 1,
  "updated": "2026-11-16T09:12:00.000Z",
  "rotateSeconds": 15,
  "slots": [
    {
      "id": "term24hr-2026-11",
      "enabled": true,
      "url": "https://www.term24hr.in.th/",
      "media": { "type": "image", "file": "media/term24hr-2026-11.webp", "alt": "Term24hr" },
      "text": {
        "th": { "label": "ผู้สนับสนุน", "title": "เติมเกมราคาถูก รับของใน 1–5 นาที" },
        "en": { "label": "Sponsor", "title": "Game top-ups, delivered in 1–5 minutes" }
      }
    }
  ]
}
```
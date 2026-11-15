# PROJECT — NTAPI ADS คืออะไร

## ภาพรวม
**NTAPI ADS** (`ntapi-ads`) = โปรแกรมเดสก์ท็อป Electron ตัวเล็กที่ **ผู้ขายสล็อตสปอนเซอร์**
ใช้เผยแพร่รูป/วิดีโอ + ลิงก์ ขึ้นแถบท้าย sidebar ของ NTAPI โดยไม่ต้องอัปเดต NTAPI

- อยู่ใน repo เดียวกับ NTAPI: `https://github.com/Cheumklang/NTAPI.git` (private)
- ปลายทางที่เผยแพร่: **`Cheumklang/NTAPI-sponsor` (public)** — จำเป็นเพราะ NTAPI
  ดึงไฟล์ผ่าน CDN แบบไม่ใช้ token
- ผู้พัฒนา: Chanathip Cheumklang

## สแตก
- Electron ^38, ไม่มี framework ใน renderer (HTML/CSS/JS ล้วน)
- ไม่มี dependency สำหรับประมวลผลภาพ: ครอป/บีบอัดด้วย `<canvas>` → WebP
- **ไม่มี ffmpeg โดยตั้งใจ** — วิดีโอไม่ถูกแปลงไฟล์ NTAPI ครอปด้วย `object-fit: cover`
- อัปโหลดผ่าน **GitHub Contents API** (ไม่ต้องใช้ git ในเครื่อง)

## โครงสร้าง
```
NTAPI ADS/
├─ NTAPI ADS.bat          ← ดับเบิลคลิกเปิดโปรแกรม
├─ package.json           ← version, build config, สคริปต์
├─ src/
│  ├─ main.js             Electron main: window, config, GitHub, IPC
│  ├─ preload.js          bridge + bridge ของ "กติกา" (limits/crop/naming)
│  ├─ feed.js             pure: รูปแบบ sponsor.json + ข้อจำกัดทั้งหมด
│  ├─ media.js            pure: ตรวจชนิด/ขนาด, coverRect, data URL
│  ├─ github.js           pure: request shape ของ Contents API
│  ├─ config.js           pure: token/owner/repo (mask ก่อนส่งให้ renderer)
│  └─ renderer/           index.html · styles.css · app.js
├─ scripts/               run-unit-tests.js · selftest-*.js · check-render.js
└─ shots/                 ภาพหน้าจอจาก check:render (gitignored)
```

## คำสั่ง
```bash
cd "NTAPI ADS"
npm start              # เปิดโปรแกรม
npm test               # เทสต์ออฟไลน์
npm run check:render   # เปิด Electron จริง ตรวจ DOM + ลากวาง + publish
npm run dist           # installer → ../dist-ads
```

## จุดตัดสินใจที่สำคัญ (อย่าเผลอกลับ)
- **ไฟล์จริง 1072×536 (2x ของกรอบ 536×268)** — ตัวเลขนี้ผูกกับ `FRAME_*` ใน `feed.js`
  ถ้าเปลี่ยน ต้องเปลี่ยน NTAPI (`app/src/renderer/styles.css` `.sponsor-media`)
- **รูปถูกเข้ารหัสใหม่เป็น WebP เสมอ** (ไม่เก็บ PNG ต้นฉบับ) เพราะคุมขนาดได้แน่นอน
- **วิดีโอส่งขึ้นตามต้นฉบับ** + ภาพปก WebP แยกไฟล์ — ห้ามเพิ่ม ffmpeg โดยไม่ถามผู้ใช้
- **token ไม่เคยถูกส่งกลับ renderer** — `maskConfig()` คืนแค่ hint
- **media ขึ้นก่อน sponsor.json เสมอ** (`publishPlan`) — NTAPI อ่านแค่ sponsor.json
  ถ้า config ขึ้นก่อนแล้ว media หาย ผู้ใช้จะเห็นแบนเนอร์เสีย

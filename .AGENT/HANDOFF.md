# HANDOFF — ส่งต่องานไป session ถัดไป

**อัปเดตล่าสุด:** 2026-11-17 · **v0.5.1** (`master`)

> **สถานะ ณ 2026-11-17 (อ่านตรงนี้ก่อน):**
> - **v0.5.1 ปล่อยแล้ว** — บังคับ revalidate สปอนเซอร์ตอนเปิดแอป (+ push `sponsor:changed`)
>   และย้ายกล่อง **สถานะ** จาก sidebar ขึ้นเป็น **pill ในแถวเดียวกับชื่อแชท + model** (มี popover)
>   → `npm test` **56/56** · `check:pill` ผ่าน · `check-sponsor-layout` ผ่าน
> - **ค้าง: ยังไม่ทดสอบด้วยตาในโปรแกรมที่ติดตั้ง** (ผู้ใช้จะลองใช้เอง)
> - **release เก่า 23 รุ่น — ผู้ใช้ลบเองด้วยมือแล้ว (2026-11-17)** เหลือ `v0.5.0` รุ่นเดียว
>   → marker `[prune-releases …]` ไม่ต้องใช้แล้ว ลบทิ้งได้เมื่อสะดวก
> - รอบปล่อยครั้งถัดไป = **`0.5.2`**
> - **กฎใหม่: หน้า release ใส่เฉพาะ "มีอะไรใหม่ในรุ่นนี้" ที่ผู้ใช้เห็น** — workflow สร้างจาก `git log` เอง
>   ห้ามมีไฟล์ `RELEASE_NOTES.md` · ห้ามใส่คำอธิบายโปรแกรม/SmartScreen · **ห้ามเปิดเผยงานหลังบ้าน**
>   (ADS, repo, workflow, token, cache, ชื่อไฟล์โค้ด) → commit พวกนั้นขึ้นต้นด้วย `internal:` เพื่อถูกกรองออก
> - **ก่อน tag ทุกครั้ง:** รัน `git log <แท็กเก่า>..HEAD --oneline` แล้วเช็คว่ามีบรรทัดไหนไม่ควรขึ้นหน้า release
>   — commit งานบ้าน/HANDOFF/LOG/workflow ต้องขึ้นต้น `internal:` **ตั้งแต่ตอน commit**
>   (เคยพลาด v0.5.1: หลุดงานหลังบ้าน 5 commit เพราะ commit ก่อนตั้งกฎ)
> - **แก้หน้า release ด้วย API ได้** (token ของ ADS ไม่มีสิทธิ์ Releases):
>   `git credential fill` → scopes `gist, repo, workflow` · **ต้อง GET `id` แล้ว PATCH `/releases/<id>`**
>   (PATCH `/releases/tags/<tag>` ตอบ 404) · อย่าพิมพ์ token ลง log
> - **ค้าง: ยังไม่ได้ลบ release เก่า 23 รุ่น (< 0.5.0)** — ~~รอผู้ใช้ยืนยัน “ลบเลย”~~
>   **เสร็จแล้ว 2026-11-17: ผู้ใช้ลบเองด้วยมือ เหลือ `v0.5.0` เดียว** (dry-run ไม่ต้องใช้แล้ว)
> - `NTAPI ADS` launcher แก้แล้ว (`NTAPI ADS.bat` / `.vbs` ไม่มี cmd ค้าง) — ยังไม่ bump เวอร์ชัน ADS

> v0.4.3 รวมทุกอย่างตั้งแต่ v0.3.5: สวิตช์อนุมัติแบบสไลด์ · คิวในช่องพิมพ์
> (แก้/ลาก/ดินสอ/ghost) · คำตอบหลายก้อนไม่หาย · scroll ติดล่างเสมอ
> ดูหัวข้อ **1q** (v0.4.0–0.4.2) เป็นหลัก

> **นโยบายบันทึก (ผู้ใช้สั่ง 2026-11-15):** เขียน HANDOFF + LOG **ทุกครั้งที่ปิดงาน
> ทันที** ไม่ต้องรอผู้ใช้ทดสอบก่อน — ถ้าพบปัญหาทีหลังก็แก้เพิ่มในบันทึก
> ดีกว่าปล่อยให้บันทึกขาดช่วง

> นี่คือไฟล์ **"อ่านอันเดียวจบ"** ของ session ใหม่ — อ่านบนลงล่าง
> ถ้าคุณเป็น AI แล้วเพิ่งเปิดโปรเจกต์: อ่านหัวข้อ 0–3 ให้ครบก่อนแตะโค้ด
> ไฟล์อ้างอิงลึก ๆ (PROJECT/LOG/docs) ค่อยเปิดเมื่อจำเป็น ไม่ต้องอ่านทุก session

---

## 0) กติกาเหล็ก (ต้องทำก่อนแตะโค้ด)
- **ทุกคำสั่ง shell ต้องมี `timeout` เสมอ** เริ่มที่ 120 วินาที
  - รันจบในเวลาปกติ → ใช้ค่าเดิมได้
  - งานยังรันอยู่แต่โดน timeout ตัด (งานจริงยังไม่เสร็จ) → รอบถัดไป **เพิ่มให้มากกว่าเดิมเสมอ**
    เช่น 120 → 240 → 480 → … ตามขนาดงาน อย่าใช้ค่าเดิมซ้ำ
  - เหตุผล: ป้องกันโปรแกรม/สคริปต์ค้างเงียบ ๆ นานเกินไป (เคยเจอเมื่อ 2026-11-15 — electron test
    นิ่งไปหลายนาทีแล้วดูเหมือนค้าง) และมี log กลับมาวิเคราะห์ได้
- **ตอบเป็นภาษาไทยเสมอ** — ผู้ใช้ถนัดภาษาไทย
  - ถ้าผู้ใช้ส่งข้อความสั้น ๆ ที่เป็น**แค่ชื่อโฟลเดอร์/พาธ/URL** หรือข้อความที่ยังไม่บอกงาน
    (เช่น `C:\Users\cheum\OneDrive\เดสก์ท็อป\NTAPI`) **ให้อ่านว่า "เข้าไปดูโปรเจกต์นี้แล้วรายงาน"**
    — ไม่ใช่ "หางานให้ทำเอง" ห้ามเดาแล้วลงมือแก้โค้ด
  - ให้: อ่าน `.AGENT/HANDOFF.md` → สรุปสถานะสั้น ๆ เป็นไทย → ถามว่าอยากให้ทำอะไรต่อ (พร้อมตัวเลือก)
  - ใช้ภาษาอังกฤษได้เฉพาะโค้ด/commit message/ชื่อไฟล์/คำสั่ง shell
- **ห้าม `git commit` / `push` / tag / เปิด PR เอง — ต้องขออนุญาตผู้ใช้ก่อนเสมอ**
  (ผู้ใช้ใช้ **GitHub Desktop** จัดการ repo)
- commit message = **ภาษาไทย กระชับ บรรทัดเดียว** (ดูสไตล์: `git log --oneline`)
- ห้ามแตะ/commit: `app/Freepiai/`, `dist/`, credentials, ไฟล์ runtime (อยู่ใน `.gitignore`)
- แอปอาจรันอยู่ (electron) — จะรีสตาร์ต/ทดสอบ UI ให้ถามก่อน
- **ห้ามแตะ `C:\Program Files\NTAPI\` เด็ดขาด** — นี่คือโปรแกรมที่ติดตั้งจริง
  ผู้ใช้ใช้มันทดสอบเหมือนผู้ใช้ทั่วไป และ **อัปเดตเอง** ห้ามเปิด/ปิด/แก้/ลบ/อัปเดต/รันอะไรทั้งนั้น
  (อ่าน/ลิสต์ก็ไม่ต้อง) → ทดสอบจากซอร์สเท่านั้น: `cd app && npm start`
- **ห้ามขยับเลขเวอร์ชันเอง** (`app/package.json`) — เปลี่ยนก็ต่อเมื่อผู้ใช้สั่งเท่านั้น
  เพราะอาจแก้หลายอย่างรวมกันก่อนปล่อยอัปเดตครั้งเดียว ห้าม tag/สร้าง release เอง
- **ทำตามคิว ห้ามข้าม:** ถ้าผู้ใช้ส่งหลายเรื่อง ให้ทําตามลําดับที่ส่งมา ทีละเรื่องจนจบ
  (โค้ด + เทสต์ + commit) แล้วจึงเริ่มเรื่องถัดไป · ห้ามข้ามหรือรวมเรื่อง · ติดอะไรให้ถามแล้วรอคําตอบ
- **หลังแก้ปัญหาเสร็จทุกครั้ง:** ต้องสรุปให้ผู้ใช้ทราบว่ามีงานที่แก้แล้วค้างอยู่ (uncommitted)
  **กี่เรื่อง** และ **ถามว่าจะอัปเวอร์ชันเลยไหม** (ห้าม bump เอง)
- **รอบการอัปเวอร์ชั่น: `+0.0.1` ทุกครั้งที่ผู้ใช้สั่ง (กฎ 0.3.0 เดิม — ยกเลิกแล้ว)**
  (ผู้ใช้สั่ง 2026-11-16) `0.5.0` → `0.5.1` → `0.5.2` …
  - **แก้กี่เรื่องในรอบเดียวก็ขยับ 1 ขั้น** — จำนวน fixes ไม่เกี่ยวกับเลขเวอร์ชัน
    (ผิด: แก้ 4 เรื่อง `0.1.0` → `0.1.4` · ถูก: `0.1.0` → `0.1.1`)
  - **ห้าม bump เวอร์ชันเอง** — bump เมื่อผู้ใช้สั่งเท่านั้น
  - คำสั่ง **"build"** = สร้าง/ปล่อยตัวติดตั้ง · **"ส่งอัปเดต"** = ให้ผู้ใช้กดอัปเดตได้
  - **ข้อยกเว้น — ปัญหาใหญ่จริง ๆ แนะนำได้แต่ห้ามทำเอง:** ข้อมูลเสียหาย, ความปลอดภัย,
    แอปใช้งานไม่ได้, อัปเดตพัง → เสนอ เช่น "ควรเป็น 0.6.0 ไหมครับ" แล้วรอคำตอบ
  - **NTAPI ADS แยกเวอร์ชันของตัวเอง** (ปัจจุบัน `0.1.0`) — ขยับเมื่อผู้ใช้สั่งเช่นกัน
  - ปล่อย `0.5.0` แล้ว (2026-11-16) → รอบถัดไปคือ **`0.5.1`**
- **ห้ามอ่าน/ลิสต์ `C:\Program Files\NTAPI\`** — แม้แต่อ่านก็ไม่ต้อง
  ถ้าอยากรู้เวอร์ชันที่ติดตั้งจริง ให้ถามผู้ใช้ หรือดู `prefs.lastVersion` ใน `prefs.json`
- **อย่าเดางานจากบริบทแวดล้อม:** ถ้าข้อความของผู้ใช้ไม่ระบุงานชัดเจน (ส่งมาแค่พาธ/รูป/คำสั้น ๆ)
  ห้ามเริ่มแก้โค้ดเพราะ "เห็นว่ามีไฟล์ค้างหรือดูน่าจะอยาก" → **ถามก่อนเสมอ** แล้วรอคำตอบ
  (ผู้ใช้สั่งไว้ 2026-11-15 หลัง AI เข้าใจผิดว่าพาธล้วน ๆ คือคำสั่งให้ไปทำงาน)

## การรันคำสั่ง — ทำเป็นชุดเดียว (ผู้ใช้สั่ง 2026-11-17)

ทำไม: การยิงคำสั่งทีละบรรทัด/ทีละ tool ทำให้เปลือง token และเสีย round-trip รอผลโดยไม่จำเป็น

1. **ห้ามแยกเรียก tool/command ทีละอัน** — งานของทั้งเทิร์นให้รวมไว้ใน call เดียว
2. **Batch execution:** ถ้าต้องทำงาน/ค้นหา/ตรวจหลายจุด ให้เขียนสคริปต์ Python สั้น ๆ
   หรือมัดรวมคำสั่งด้วย `&&` / `;` แล้วรันรวดเดียวจบในเทิร์นเดียว
3. **ในชุดคำสั่งนั้นต้องมี log และดักจับ error:** พิมพ์ `[PASS]` / `[ERROR]` แยกเป็นขั้น ๆ
   พร้อมรายละเอียด (ไฟล์/บรรทัด/ข้อความ error) เพื่ออ่านผลก้อนเดียวแล้วรู้ทันทีว่าจุดไหนพัง
   แล้วแก้ต่อได้ในรอบเดียว
   - ทางที่ใช้บ่อย: python + `subprocess.run(...)` ไล่คำสั่ง แล้วพิมพ์ตารางสรุป PASS/FAIL ท้ายสคริปต์
   - ยังต้องใส่ `timeout` ครอบเหมือนเดิม (กติกาเหล็กข้อแรก)
   - **ข้อยกเว้น:** ถ้าถึงจุดที่ต้องให้ผู้ใช้ตัดสินใจ (เลือกเครื่องมือ/แนวทาง A หรือ B/ขอบเขตงาน)
     ให้หยุดถามตามปกติ — กฎนี้ลดการยิงถี่ ๆ ไม่ใช่ลดการถาม

4. **ขั้นตรวจผลต้องอยู่ในชุดเดียวกันด้วย** — ตรวจว่า "สำเร็จจริงไหม" (เช่น poll CI จนจบ,
   รันเทสต์แล้วสรุป, อ่านไฟล์ที่เพิ่งเขียน) ให้ต่อท้ายสคริปต์เดิมหรือรวมใน call เดียวกัน
   ห้ามแยกไปอีก call เพราะงานยังไม่นับว่าจบจนกว่าจะยืนยันผล
5. **นิยาม 1 call ที่ถูกต้อง** = ทำงาน → ตรวจผล → สรุป `[PASS]`/`[ERROR]` ครบในตัว
   (ที่พลาดมาแล้ว 2026-11-17: commit+push ใน call หนึ่ง แล้วแยก curl เช็ค CI อีก call)

ทำถูก: 1 call = สคริปต์เดียวที่รัน 6 คำสั่ง + พิมพ์สรุป `[PASS]/[ERROR]`
ทำผิด: 6 calls แยกกัน รอผลทีละอัน

## 1) กําลังทํา / ค้างอยู่ตอนนี้ (สําคัญสุด — อ่านก่อน)

### 1zz) สปอนเซอร์แบบสด + โปรแกรมที่สอง `NTAPI ADS` (2026-11-16) ⚠️ เสร็จ ยังไม่ commit

**โจทย์ผู้ใช้:** อยากใส่รูปในแถบ sponsor และเปลี่ยนรูปได้เองแบบ real-time โดยผู้ใช้ไม่ต้องอัปเดต
→ เลือกสร้าง **โปรแกรมเผยแพร่แยก** (`NTAPI ADS`) แล้วฝากไฟล์ที่ GitHub public

**คำตอบที่ผู้ใช้เลือก:** A1 = สร้าง repo public ใหม่ `Cheumklang/NTAPI-sponsor` · B1 = GUI + ใส่ลิงก์ได้
· C2 = รองรับทั้งรูปและวิดีโอ · 1a = หลายสปอนเซอร์หมุนเวียน · 2a = กรอบ 2:1 · 3c = ทำทั้งสองฝั่งรวดเดียว

**รูปแบบ `sponsor.json` (สัญญาระหว่างสองโปรแกรม)**
```json
{ "version": 1, "updated": "...", "rotateSeconds": 15,
  "slots": [{ "id": "term24hr-2026-11", "enabled": true, "url": "https://…",
    "media": { "type": "image|video", "file": "media/x.webp", "poster": "media/x-poster.webp", "alt": "…" },
    "text": { "th": { "label": "…", "title": "…" }, "en": { … } } }] }
```
- ผู้ผลิต: `NTAPI ADS/src/feed.js` · ผู้อ่าน: `app/src/sponsor.js` → `readFeed()`
- **แก้ชื่อฟิลด์ที่หนึ่ง ต้องแก้อีกที่ใน commit เดียวกัน**

**(ก) โปรแกรมใหม่ `NTAPI ADS/`** (อยู่ใน repo นี้ ไม่ได้แยก repo ตามที่ผู้ใช้สั่ง)
- Electron GUI: ลากไฟล์/เลือกไฟล์/**ดึงจากลิงก์** → ครอปเป็น **1072×536 WebP** (2x ของกรอบ 536×268) → ตัวอย่างจริงที่ความกว้าง 268px → กด **เผยแพร่**
- วิดีโอ: **ไม่แปลงไฟล์** (ไม่มี ffmpeg โดยตั้งใจ) · ดึงภาพปกจากเฟรม 0.4 วิ · เพดาน 8MB / 10 วิ
- อัปโหลดผ่าน **GitHub Contents API** (ไม่ต้องมี git) · media ขึ้นก่อน `sponsor.json` เสมอ
- token เก็บที่ userData (`%APPDATA%/ntapi-ads/ads-config.json`) · renderer เห็นแค่ hint (`maskConfig`)
- เทสต์: `npm test` **42 checks / 4 ไฟล์** · `npm run check:render` **25/25** (Electron จริง + ลากวางจริง)

**(ข) ฝั่ง NTAPI**
- ไฟล์ใหม่ `app/src/sponsor-feed.js` — ดึง feed (jsDelivr → raw fallback), แคช `DATA_ROOT/sponsor/`,
  TTL 6 ชม., เพดาน feed 256KB / creative 8MB, ล้าง media เมื่อ `updated` เปลี่ยน
- `app/src/sponsor.js` — เพิ่ม `readFeed`/`normalizeSlot`/`clampRotate` (ของเดิม `normalize()` คงไว้ = fallback)
- `main.js` — `primeSponsorCache()` ก่อน `createWindow()` + `refreshSponsorFeed()` แบบไม่ await
  + `setInterval` 6 ชม. (unref) · IPC ใหม่ `sponsor:media` **(โหลดเฉพาะ slot ที่แสดง)**
  · `sponsor:get` คืน slots ไม่มีไบต์ · `sponsor:click` หา slot จาก feed เท่านั้น
- renderer — `paintSponsor` วาดรูป/วิดีโอ + หมุนเวียนตาม `rotateSeconds` + `syncSponsorPlayback`
  (หยุดวิดีโอเมื่อหน้าต่างไม่ focus/ซ่อน, `prefers-reduced-motion` → ภาพนิ่ง)
- CSS — `.sponsor-media` บังคับ **aspect-ratio 2:1 + object-fit: cover** → ทุกไฟล์ขนาดเท่ากันเสมอ
- CSP — เพิ่ม `media-src 'self' data:` (วิดีโอ data URL) · **ไม่เปิด `https:`** ใน NTAPI
  (รูป/วิดีโอมาเป็น data URL จาก main เท่านั้น = ไม่รั่ว IP ผู้ใช้ให้สปอนเซอร์)
- เทสต์: `app/scripts/selftest-sponsor-feed.js` (**23 checks**) + อัปเดต `selftest-sponsor.js`
  และ `check-sponsor-layout.js` (กรอบ 2:1 วัดพิกเซลจริง, `npm test` **53/53**, layout ผ่านหมด)

**ค้าง / ต้องทำต่อ (ผู้ใช้ต้องทำเอง 1 ขั้น)**
1. ~~สร้าง repo public `Cheumklang/NTAPI-sponsor`~~ **เสร็จแล้ว 2026-11-16** — มี `sponsor.json` + `media/example-2026-11.webp`
   อยู่บน `main` แล้ว และ CDN ตอบ 200 ทั้ง jsDelivr/raw — **NTAPI เห็นสปอนเซอร์ตัวอย่งได้แล้วโดยไม่ต้องมี token**
2. ยังต้องมี fine-grained token (Contents: R/W เฉพาะ repo นั้น) **เมื่อต้องการให้ ADS กดเผยแพร่เอง**
   — ถ้าไม่อยากทำ token: ใช้วิธีก่อน commit/push ผ่าน git ธรรมดา (credential ของ GitHub Desktop ใช้ได้ ไม่ต้องมี token)
3. **ยังไม่ทดสอบด้วยตา** ทั้งสองโปรแกรม (`npm start`) · `look_at_image` ยังใช้ไม่ได้ (นอกรากโปรเจกต์)
4. ยังไม่ commit งาน NTAPI · ยังไม่ bump เวอร์ชัน (NTAPI 0.4.6 · ADS 0.1.0)

**วิธี publish แบบไม่มี token (fallback ที่ใช้ได้จริง)**
```bash
cd /c/NTAPI/outputs/downloads && git clone https://github.com/Cheumklang/NTAPI-sponsor.git
# วาง media/<slug>.webp + sponsor.json → commit → git push
```
- credential มาจาก GitHub Credential Manager ที่ GitHub Desktop ตั้งไว้ → `git push` ผ่านเลย
- อย่าลืม: media ขึ้นก่อน `sponsor.json` เสมอ และ `updated` ต้องเปลี่ยนค่าทุกครั้งถึงจะล้าง cache

### 1y) แถบผู้สนับสนุน (sponsor) ท้าย sidebar (2026-11-15) ✅ เสร็จ ยังไม่ commit

**ผู้ใช้สั่ง:** เอาแบบ A (ท้าย sidebar ใต้ Status) ลงของตัวเองก่อน แล้วค่อยขายสล็อตให้คนอื่น (ไม่ใช้ ad network) · ต้องไม่รบกวนการใช้งาน · เว็บปัจจุบัน: https://www.term24hr.in.th/ (เติมเกม)

- **ไฟล์ใหม่:** `src/sponsor.js` (pure: `normalize()` ตรวจ config) + `src/sponsor.json` (ข้อมูลสปอนเซอร์) — เปลี่ยนสปอนเซอร์ = แก้ไฟล์ ไม่ต้อง build ใหม่
- IPC: `sponsor:get` / `sponsor:click` (นับคลิกก่อนเปิดเบราว์เซอร์ · เก็บใน `prefs.json.sponsorClicks` — เอาไปคุยกับสปอนเซอร์ได้) · **URL มาจาก config ใน main เท่านั้น** renderer เลือกเองไม่ได้
- **ความปลอดภัย:** รับแต่ `https:` (`javascript:`/`http:`/`file:`/host ไม่มี dot ถูกปฏิเสธ) · ข้อความตัดที่ 80 ตัวอักษร (ตัด code point ไม่ใช่ UTF-16 เพื่อไม่ตัดวรรณยุกต์ไทย) · config พัง/แก้ผิด → แถบซ่อน ไม่พังแอป
- UI: `.section.sponsor` ท้ายสุด sidebar เป็นปุ่ม ~50px สองบรรทัด ไม่มีรูป/แอนิเมชัน ติดป้าย "ผู้สนับสนุน" ชัดเจน เล่น i18n th/en
- **บักที่เจอระหว่างทำ (วัดพิกเซล) + แก้:** (1) `[hidden]` ใช้ไม่ได้กับ `.section` (display:flex ทับ) → ต้อง `.section.sponsor[hidden]{display:none}` ไม่งั้นแถบเปล่า 44px กินที่ตลอด (2) `margin-top:auto` ให้แถบลอยอยู่พื้นโดยไม่เบียด Status (3) sidebar `overflow:hidden` → `overflow-y:auto` เพื่อไม่ให้เนื้อหาถูกตัดตอนหน้าต่างเล็กสุด 560px (แถบอยู่ล่างสุดถูกตัดก่อน)
- **เทสต์:** `selftest-sponsor.js` (49 checks, offline อยู่ใน `npm test`) + `check-sponsor-layout.js` (Electron วัดพิกเซล 2 ขนาดหน้าต่าง) · ผล: `npm test` **52/52** + layout **ผ่านหมด** · ย้อนกลับที่พิสูจน์: http → FAIL 1 · renderer เปิด URL ตรง → FAIL 2 · สลับลำดับ writePrefs/open → FAIL · ลบ `[hidden]` rule → FAIL 1
- **ยังไม่ commit / ยังไม่ bump / ยังไม่ทดสอบด้วยตาบนแอปจริง** (`npm start`) — รอกดแถบแล้วเบราว์เซอร์ต้องโผล่ + คลิกนับขึ้น (ดู `prefs.json.sponsorClicks`)
- **วิธีลองสปอนเซอร์คนอื่น:** แก้ `sponsor.json` (change url + text) · ปิดชั่วคราว = `enabled:false` · เปลี่ยน id = นับคลิกใหม่ (เปลี่ยนผู้สนับสนุน)

### 1x) หน้าเกี่ยวกับ: เอาปุ่มคัดลอกข้อมูลระบบออก · หน้าตั้งค่าขยายตามเนื้อหา (2026-11-15) ⚠️ แก้แล้ว ยังไม่ commit

**ผู้ใช้สั่งว่าเรื่องเล็ก ไม่ต้อง commit/push** — เก็บไว้เป็นข้อมูลว่าทำอะไรไปแล้ว
(อย่าเพิ่ง commit เว้นแต่ผู้ใช้สั่ง)

1. **ลบปุ่ม "คัดลอกข้อมูลระบบ" ออกจาก Settings > About** — ลบ 3 จุด:
   ปุ่มใน `index.html` · listener `copySystemInfoBtn` ใน `app.js` · CSS `.about-copy`
   · **ปุ่ม `#crashCopy` ในแถบ crash ยังอยู่** (ตั้งใจ — ใช้ตอนโปรแกรมพัง)

2. **หน้าตั้งค่าไม่ต้อง scroll บนหน้าเกี่ยวกับ** — เดิมทุกแท็บตรึง 640px
   → ใส่ `fitSettingsDialog()` + `watchSettingsPanel()` (ResizeObserver) ใน `app.js`
   - วัดความสูงจริงของแท็บที่เปิด → ตั้ง `dlg.style.height` · ต่ำสุด 420 · สูงสุด `92vh`
   - **มี correction pass 1 รอบ** เก็บส่วนที่ `scrollHeight` รายงานเกินผลรวมชิ้นส่วน (~12px
     จาก leading บรรทัดท้าย) — ตัวนี้คือสาเหตุที่ scrollbar โผล่ทั้งที่เนื้อหาพอดี
   - `.settings-dialog` เพิ่ม `max-height: 92vh` (inline height ไม่ให้ทะลุจอ)
   - **ผลวัด:** about 622px ล้น 0 · workspace/advanced 420 ล้น 0 · mcp 637 ล้น 0 ·
     providers 695 (ชนเพดาน) ล้น 373 = scroll ตามปกติเพราะเป็นรายการยาว
   - เรียกที่ `showSettingsSection()` + `window resize`

**ยังไม่ commit** · `check:notice` / `check:chips` ยัง PASS · ไม่มีไฟล์เทสต์ใหม่
(ผู้ใช้ไม่อยากให้มีไฟล์ค้างใน GitHub Desktop)

### 1w) ลากคิว · chip สถานะ · notice เป็นฟอง (2026-11-15) ✅ เสร็จ ยังไม่ commit

1. **`detachAll ✓` ซ้อนหลายชั้น** → `pushActivity()` = `replaceChildren()` เหลือแถวเดียว
   · ลบ `ACTIVITY_MAX` · **composer ไม่ถูกดันขึ้น** · check:strip (7)
2. **ลากคิว ป้ายไปซ้ายสุด** → เดิม `left:8px` + ขับแค่ Y · แก้เป็น `translate(x,y)` + clamp
   · จำ grab offset · check:ghost (9) · **แก้เทสต์เดิมที่ล็อกบั๊กไว้**
3. **chip บอกส่วนที่กำลังทำงาน** → `.msg-activity` ในทุกข้อความ AI: `think`/`tools`/`notes`
   ขึ้นเฉพาะส่วนที่กำลังทำ · ทำพร้อมกันขึ้นพร้อมกัน · `__runningTools` นับ tool ที่ยังรัน
   · **ชื่อฟังก์ชัน `clearMsgActivity`** (ชนกับ `clearActivity` ของเบราว์เซอร์) · check:chips (10)
4. **notice ล้นออกนอกกรอบ** → ฟอง `fit-content` + `margin:0 auto` ตรงคอลัมน์ `.composer-box`
   · fade-in/out 200ms · check:notice (9)

**ยังไม่ bump เวอร์ชัน / ยังไม่ commit / ยังไม่ปล่อย** (v0.4.5 ปล่อยไปแล้วรอบก่อน)

### 1v) status strip แถวเดียว · ป้าย "การคิด:" · highlight ตรงช่อง (2026-11-15) ✅ v0.4.5

1. **`detachAll ✓` ซ้อนหลายชั้น** → `pushActivity()` เปลี่ยนเป็น `replaceChildren()`
   เหลือแถวเดียว = ล่าสุด · ลบ `ACTIVITY_MAX` · **composer ไม่ถูกดันขึ้นแล้ว**
2. **ป้าย "การคิด:"** → `#thinkingLabel` + `aria-labelledby` · i18n `thinking` = `'การคิด:'`
3. **highlight เบี่ยง + ทับตัวอักษร** → ต้นเหตุคือ grid `minmax(0, auto)` (ช่องกว้างไม่เท่า)
   แต่ thumb คำนวณ `1/--count` → เปลี่ยนเป็น `minmax(0, 1fr)` · **วัด drift 0px (เดิม 10px)**
4. เปลี่ยนภาษาแล้วคำใน switch ไม่แปล → ใส่ `lang` ใน rebuild key
5. `thinkingMinimal` เปลี่ยนคำ "น้อยที่สุด" → **"น้อย"** (คำอื่นสั้นหมด) · ทุกช่องกว้าง 37px เท่ากัน
- เทสต์: `npm run check:strip` (7) · `check:thinking` (18)
- ย้อนกลับ: คืน appendChild → FAIL 3 · คืน `auto` → FAIL 1 (drift 10px)

### 1u) ปุ่มระดับการคิด → สไลด์ไล่สี แสดงตลอด (2026-11-15) ✅ เสร็จ ยังไม่ commit

ผู้ใช้: ปุ่ม "การคิด" หายไปบางที อยากให้ขึ้นตลอด · เปลี่ยน dropdown → สไลด์แบบ "การอนุมัติเครื่องมือ"
· ห้ามย้ายตำแหน่ง · สีเขียว(ประหยัด) → แดง(แพง) · **ผู้ใช้เลือก A** = แสดงแต่หรี่+ล็อกเมื่อไม่รองรับ

- **สาเหตุที่หาย:** SDK คืน `supported:false` + `["off"]` → เดิม `select.hidden = true`
- `#thinkingSelect` ถูกซ่อนถาวร (แหล่งค่าให้ IPC/เทสต์) · `#thinkingSwitch` เป็น radio group + thumb
  อยู่ใน **ตำแหน่งเดิม** ของ topbar (ซ้าย model picker)
- สร้าง radio ตาม level ที่ model ให้จริง (ไม่ hardcode 5) · `--count/--at/--p`
- ไม่รองรับ: `disabled` + `.is-locked` + `#thinkingNote` บอกเหตุผล — **ไม่ซ่อน**
- สี `hsl(calc(140 - (--p*140)) 58% 34%)` · อิงตำแหน่ง → model 3 ระดับก็ไล่เต็มช่วง
- คลิก → hidden select → `session:thinking` (path เดิม ไม่แตะ main)
- `/thinking` focus radio แทน select ที่ซ่อนอยู่
- เทสต์: `npm run check:thinking` (14 checks) · ย้อนกลับ FAIL 5 · layout 30px/57px ไม่ตัดบรรทัด

### 1t) พับ "บันทึกการทำงาน" (2026-11-15) ✅ เสร็จ ยังไม่ commit

ผู้ใช้เห็นข้อความยาว ๆ ของ AI เต็มจอ (กรอบสีเขียว) อยากให้ย่อแบบ "ใช้เครื่องมือ N ครั้ง"
แต่ **คำตอบสุดท้ายต้องไม่ย่อ** · ผู้ใช้ยืนยันว่าเป็น A = ไม่ใช่ thinking

- **ไม่ใช่ thinking** — thinking พับอยู่แล้ว · เป็น **`.body` หลายก้อนต่อเทิร์น**
  (พูด → tool → พูด) ที่เดิมแสดงเต็มทุกก้อน
- `sealBody()` เรียก `collapseNarration()` → ย้ายก้อนนั้นเข้า `.narration-group`
  ปุ่มบรรทัดเดียว "บันทึกการทำงาน N ช่วง" ปิดเริ่มต้น · **ก้อนสุดท้ายไม่ถูก seal = คำตอบเปิดเสมอ**
- replay เรียก `sealBody()` ตอนเจอ `m.kind === 'tool'` → ผลเหมือน live
- **บั๊กเดิมที่แก้ด้วย:** replay ใช้ `.body` ตัวแรก → ทุกก้อนต่อกันเป็นบับเบิลยักษ์
  → เปลี่ยนเป็น `currentBody(wrap)`
- เทสต์: `npm run check:narration` (12 checks, รวม live path) · ย้อนกลับ FAIL 9
- วัดจริง: เทิร์นที่เคยเต็มจอ → 156px

### 1s) ป้ายผู้ตอบ = provider + model (2026-11-15) ✅ เสร็จ ยังไม่ commit

เดิม `addMessage()` ใส่ `t('assistant')` = `"NTAPI"` ตายตัวทุกคำตอบ
→ เปลี่ยนเป็น `messageAuthor()` = `providerLabel | Model: <ชื่อ model>`
เช่น `FreePi | Model: DeepSeek V4.1 Flash` (CSS upper จะแสดงเป็น `FREEPI | MODEL: …`)

- `refreshMessageAuthors()` เรียกหลังสลับ model → ป้ายของคำตอบเก่าในเธรดเดียวกันอัปเดตตาม
- ไม่มี model → ถอยไป `t('assistant')` ไม่พิมพ์ตัวคั่นลอย ๆ
- คำตอบของผู้ใช้ (`You` / `คุณ`) ไม่เปลี่ยน
- เทสต์: `npm run check:author` (6 checks) · ย้อนกลับแล้ว FAIL 3

### 1r) `/clear` เก็บชื่อ+model · ปักหมุดแชท · สีแชท (2026-11-15) ✅ STAGED, ยังไม่ commit

**(ก) `/clear` ไม่ลบชื่อแชทแล้ว (และไม่เปลี่ยน model)**
- ราก: `session:clear` สร้าง `SessionManager.create` ใหม่ → `sessionName` ว่าง → `attachTab()`
  เข้าเงื่อนไข `if (!handle.session.sessionName)` แล้ว `deriveName()` ใส่ชื่อจากข้อความแรก
  · model ก็ถูกเลือกใหม่จาก `plan.defaultProvider/defaultModel` ของแผน
- แก้ (ใน `main.js` `ipcMain.handle('session:clear')`): อ่าน `sessionName` + `session.model`
  **ก่อน** `tab.handle.dispose()` แล้วหลัง `attachTab()` ใหม่: `setSessionName(keepName)`
  (เขียนผ่าน `appendSessionInfo` เหมือน rename) + `handle.setModel(provider,id)`
  · อัปเดต `state.name` / `state.model` ให้ renderer ตรงกับความจริง
  · คืน `keptName` / `keptModel` → renderer ขึ้น notice `clearKeptName`
- **ยังเป็นเซสชันใหม่จริง** (ไฟล์ `.jsonl` ใหม่, id ใหม่, บริบทว่าง) = token เท่ากับกด "+ New"
  ตามที่ผู้ใช้ยืนยัน (`pull request: 1A + 2A`)
- ทั้ง rename และ setModel เป็น best-effort (`try/catch` เฉย ๆ) — ล้มเหลวต้องไม่ทำให้ clear ล้ม

**(ข) ปักหมุด + สีแชท — ไฟล์ใหม่ `src/session-marks.js` (pure module)**
- เก็บใน **`prefs.json` คีย์ `sessionMarks`** คีย์ย่อย = path ของไฟล์ `.jsonl` (normalize +
  `toLowerCase()` บน Windows) — **ไม่เขียนอะไรลง `.jsonl` ของ pi** (SDK เป็นเจ้าของฟอร์แมต)
- `readMark` / `applyMark` (pure, ไม่ mutate) / `sortByMark` / `pruneMarks`
- สีเป็นรายการปิด 7 สี (`red orange yellow green blue purple pink`) — ค่าที่ไม่รู้จัก
  **ถูกทิ้ง ไม่เก็บดิบ** (ทดสอบแล้วว่าค่า `RED`/`chartreuse` ไม่สร้าง entry)
- mark ที่ว่าง (ไม่หมุด ไม่สี) → `delete` ออกจาก store ไม่เก็บเป็น `{pinned:false,color:null}`
- `pruneMarks` เรียกทุกครั้งที่ `listSessions()` → prefs ไม่บวมเมื่อลบแชทไปแล้ว
- **`sortByMark` ไม่เรียงตามเวลา** — แค่ย้าย pinned ขึ้นบน ที่เหลือคงลำดับเดิมที่ `listSessions`
  เรียงมาแล้ว (ถ้าเรียงซ้ำจะกลายเป็น sort ตัวที่สองที่แย่งกับ sort ตาม `created`)
  · **บทเรียน:** เทสต์ชุดแรกเขียนผิดคาดหวังว่าระยะเวลาจะจัดลำดับ → แก้ที่เทสต์ ไม่ใช่ที่โค้ด
- IPC: `session:mark` (ตรวจว่า path อยู่ใต้ `SESSIONS_ROOT`), `session:colors`
- UI: `.s-pin-slot` (ช่องกว้าง 14px **จองไว้ทุกแถว** แม้ไม่มีหมุด) + แถบสี `border-left: 4px`
  · เมนูคลิกขวา: ปักหมุด/เอาหมุด + สวอตช์ 7 สี + "ไม่ใช้สี" · กดสีเดิมซ้ำ = เอาสีออก
  · `sessionMarksLocal` ใน renderer เป็น mirror ให้คลิกติดทันที (IPC ตอบช้ากว่า render)

**บั๊กที่เจอจากการวัดพิกเซล (แก้แล้ว):**
1. **ชื่อแถวไม่ตรงคอลัมน์** — ตอนแรกใส่ไอคอนหมุดแบบมีเงื่อนไข → แถวที่ปักหมุดชื่อเริ่มที่ 42px
   แถวอื่น 21px (リストดูพัง) → เปลี่ยนเป็น slot กว้างคงที่ที่ทุกแถวมี
2. **1px เหลื่อมระหว่างสถานะ** — `box-sizing: border-box` → ระยะข้อความ = `border-left + padding-left`
   · แถวธรรมดา 1+9=10 แต่ `.open` 2+7=9 และ `.active` 3+6=9 → ปรับเป็น 2+8 / 3+7 / สี 4+6 = **10 ทุกสถานะ**
   · วัดจริงหลังแก้: `[42, 42, 42, 42, 42]`
3. `session:mark` เคยเทียบ `root` ที่ยังไม่ lower-case → บน Windows path ที่ตัวพิมพ์ต่างกันจะถูกปฏิเสธ

**เทสต์:**
- `scripts/selftest-session-marks.js` (24 checks, pure) — identity ข้ามการเขียน path ต่างแบบ,
  corrupt entry, prune, palette round-trip, ลำดับ pinned, ไม่ mutate
- `scripts/selftest-session-marks-ui.js` (20 checks, static) — `/clear` อ่านชื่อ**ก่อน** dispose,
  เขียนกลับ, set model, ยังลบไฟล์เดิม, list/`session:mark`/preload, sidebar วาดหมุด+สี,
  palette renderer ตรงกับ `session-marks.js`, i18n ครบ 2 ภาษา, CSS ทุกสี, **สีต้องชนะ `.active`**
- `scripts/check-session-marks.js` (18 checks, Electron) — `npm run check:marks`
  · **Important:** `window.freepi` จาก contextBridge เป็น **frozen** — แก้ `api.listSessions`
    ในหน้าเว็บไม่ได้ผลเงียบ ๆ (เจอจริงตอนแรก: ทุกอย่างว่าง) → ต้อง `ipcMain.handle('session:list')`
    ที่ main process แทน (และทดสอบ IPC จริงไปด้วย)
- ผล: `npm test` **51/51** · `check:marks` **18/18**
- ย้อนกลับที่พิสูจน์แล้ว: ลบ `setSessionName(keepName)` → UI FAIL 1 · ทำให้ `state.model` ไม่รับค่า
  → FAIL 1 · สลับ `[...rest, ...pinned]` → marks FAIL 1 · ย้าย CSS สีไปก่อน `.active` → FAIL 1

**ค้าง/ยังไม่ทำ:** ยังไม่ commit (ผู้ใช้ commit เองด้วย GitHub Desktop) · ยังไม่ bump เวอร์ชัน
(ยัง 0.4.3) · **ยังไม่ได้ทดสอบด้วยตาบนแอปจริง** (`npm start`) — `look_at_image` ใช้ไม่ได้ทั้ง session
จึงวัดด้วย `getBoundingClientRect` + `getComputedStyle` แทน

**คิวถัดไป (ผู้ใช้สั่งไว้ 2026-11-15 ระหว่างงานนี้):** คำตอบยาวมาก → ต้องมีปุ่มย่อ/ขยาย
(แบบเดียวกับแถวสรุป "ใช้เครื่องมือ … ครั้ง") เพื่อให้หาข้อความที่ตัวเองพิมพ์ล่าสุดได้ง่าย


### 1q) v0.4.0 → v0.4.2 (2026-11-14/15) ✅ ปล่อยแล้ว ไม่มีงานค้าง

`v0.4.0` = `b81b71d` · `v0.4.1` = `8515bbf` · **`v0.4.2` = `81349d1`** (ล่าสุด)

**(ก) คิวในช่องพิมพ์ (v0.4.0)**
- `queue compact` — เก็บแถวให้เตี้ย แสดงเฉพาะหัวคิว
- `queue placement` (`8eb9d3d`) — ย้าย `#queueBar` ออกจาก `.composer-side` มาเป็นลูกตรง
  ของ `.composer-box` + `flex-wrap: wrap` + `flex: 1 0 100%` → **เต็มความกว้างใต้ปุ่มส่ง**
- `queue edit-in-place` (`e30114e`) — `item.editing` + `item.draft` อยู่ในตัว item → รอด re-render
  · `drainQueue` เช็ค `queue[0].editing` **ก่อน** `shift()` → ของที่กำลังแก้ไม่ถูกส่ง
  · `saveQueueEdit` เขียนทับที่ตำแหน่งเดิม ไม่ splice/push
- `queue drag` — ที่จับ `⠿` และแถวเองลากได้ · `moveQueueItem(id,delta)` ใช้ร่วมกับ Alt+↑/↓
  · `queueDropIndex(clientY)` เทียบจุดกึ่งกลางแถว · แถวที่กำลังแก้ลากไม่ได้
  · ฟัง `pointerup` ที่ `window` เพราะปล่อยนอกคิวได้
- `× before text` (`5e9c052`) — `.queue-text` เคยเป็น `flex: 1 1 auto` ดันปุ่มไปขวาสุด
  → เปลี่ยนเป็น `flex: 0 1 auto; max-width: calc(100% - 50px)` · ลำดับแถว `⠿ → × → ข้อความ`
  · selector `.queue-item .queue-remove` (0,1,1) ต้องชนะ `.queue-item button` (0,1,0)
- `cancel button` (`d7f5972`) — **บั๊ก:** `holdMessage()` destruct `onCancel` แล้ว `giveBack`
  capture ค่าตอนสร้าง; `queueMessage()` ตั้ง `hold.onCancel` ได้**หลัง**ฟังก์ชันคืนค่า
  → ค่าที่ capture เป็น `undefined` → กดยกเลิกแล้วไม่มีอะไรเกิดขึ้น
  · แก้: `const handler = record.onCancel || onCancel` อ่านตอนกด
- `approval switch` (`f781a90`) — `<select>` → `<div role=radiogroup>` 3 ปุ่ม radio
  + `.approval-thumb` เลื่อนด้วย `--at` (`translateX(calc(var(--at) * 100%))`)
  · radio ที่ซ่อนใช้ `clip-path: inset(50%)` **ไม่ใช่** `display:none` → โฟกัสยังอยู่
  · เหตุผลที่เลือก radio ไม่ใช่ปุ่ม: ลูกศรกดได้, screen reader อ่าน "2 of 3", `:checked` คือ state
- `send scrolls` (`8515bbf`) — `renderUserMessage()` ไม่เคยเลื่อน; `scrollToBottom()` เคารพ
  `isReadingUp()` ซึ่งถูกสำหรับคำตอบที่มาใหม่ แต่ผิดสำหรับข้อความที่ผู้ใช้พิมพ์เอง
  · แก้: `scrollToBottom(true)` เป็นบรรทัดท้ายของ `renderUserMessage()` — ฟังก์ชันนี้คือ
  จุดเดียวที่ "ผู้ใช้พูด" (ส่งปกติ, steer, จากคิว)
- `edit pencil + drag ghost` (`d2c6c2e`) — ย้ายปุ่มแก้ไขไป**หน้า**ข้อความ เป็น `✎` (`\u270e`)
  พร้อม `title` + `aria-label` (glyph เดี่ยว screen reader อ่านไม่ออก)
  · ปุ่มนำแถวทั้งคู่เห็นได้ตอน rest (`opacity .55`) ไม่ซ่อนรอ hover — เดิมซ่อนแล้วเหลือช่องว่าง
  · ghost: `showDragGhost/moveDragGhost/hideDragGhost` สร้าง `<div class=queue-ghost>`
  `position: fixed; pointer-events: none; opacity .82` · **ไม่มีปุ่มข้างใน** (คลิกพลาดต้องไม่ลบ)
  · สร้างจาก `.queue-text` ไม่ใช่ `cloneNode` · ซ่อนตอน `pointerup` **และ** `pointercancel`
  · วัดจริง: `⠿ 0 · ✎ 10 · × 30 · ข้อความ 47` (ดินสอจบ 26 ไม่ทับ)

**(ข) บั๊กใหญ่ 2 ตัวที่แก้ใน v0.4.2**

`cb3ba1a` — **คำตอบหลายก้อนในเทิร์นเดียวถูกทับ**
- ราก: 1 เทิร์นมี **หลาย block ของ prose** (วางแผน → เรียกเครื่องมือ → รายงาน)
  แต่ละ block มาเป็น `text_end` ของตัวเอง และ `onTextEnd` ทำ `body.__fpText = p.text` → ทับก้อนก่อน
- แก้ 3 จุด: (1) `currentBody(wrap)` คืน `.body` **ตัวสุดท้าย** สร้างใหม่ถ้าตัวสุดท้าย `__fpDone`
  (2) `sealBody(wrap)` เรียกใน `api.onToolStart` **ก่อน** `toolCard()` ปิด body ที่มีข้อความ
  (3) `onDelta`/`onTextEnd` ใช้ `currentBody()` · CSS `.msg.assistant .body + .body { margin-top: .7em }`
- **`sealBody` จำเป็นจริง** — ถ้าไม่มี `text_end` มาก่อน tool call (เทสต์พิสูจน์แล้ว)
- replay (`renderActiveTab`) ไม่มีบั๊กนี้เพราะ append อยู่แล้ว → บั๊กเกิดเฉพาะ live stream

`80fd1dd` — **อยู่ล่างสุดแล้วต้องติดล่างเสมอ**
- ราก: `scrollToBottom()` **วัดระยะทุกครั้ง** (`distanceFromBottom() > NEAR_BOTTOM_PX`)
  เนื้อหาโตใต้ตาผู้อ่านที่ไม่เคยแตะ scrollbar → ระยะดูเหมือนเลื่อนหนี
  · วัดก่อนแก้: `0 → 84 → 168 → 252 → 336 → 420 → 504` (ไหลออกไปเรื่อย ๆ)
- แก้: เก็บสถานะ `pinnedToBottom` แทนการวัด · `syncFollow()` ตั้งค่าจากระยะ,
  `isReadingUp()` คืน `!pinnedToBottom` · `scrollToBottom(force)` ใช้ `if (!force && !pinnedToBottom) return`
  · `jumpingToBottom` guard + `scrollend` + fallback 420ms (scroll event กลางทางการ jump จะ unpin ผิด)
  · listener เปลี่ยน `scroll` → `syncFollow`

**(ข2) `98125ea` — ดินสอแก้ไขในคิวแล้ว countdown ยังเดิน** (ผู้ใช้ทดสอบเจอเอง 2026-11-15)
- ราก: `queue-edit-btn` ตั้ง `item.editing` แล้ว `renderQueue()` เฉย ๆ **ไม่แตะ hold**
  → `setInterval` เดินต่อ ยิง `send()` ครบ 5 วิ **ขณะผู้ใช้กำลังพิมพ์** = ส่งข้อความเก่าออกไป
- ฝั่งที่ถูกคือ `holdEdit` ซึ่งเรียก `giveBack(true)` → `detach()` → `clearInterval` + `holds.delete`
- แก้: เพิ่ม `cancelHoldFor(queueId)` + ปุ่มดินสอเรียก **ก่อน** ตั้ง `editing`
  · **จงใจไม่ใช้ `giveBack(true)`** — ดินสอแก้ในที่ ไม่ดึงข้อความกลับช่องพิมพ์
- เทสต์: `selftest-queue-edit-hold.js` (19) · `check-queue-edit-hold.js` (14, รอครบ 6 วิจริง)
- ย้อนกลับ: ลบ `cancelHoldFor(...)` → FAIL 1 + Electron FAIL 5 (`sent:1`)
- **Learned:** `saveQueueEdit` เรียก `drainQueue()` → เซฟแล้ว **ส่งทันที** ถ้าคิวว่าง
  อย่าเขียนเทสต์ว่า "เซฟแล้วยังอยู่คิว"

**(ข3) `d16be22` — ghost ใหญ่เกิน + เพิ่มเลขลำดับหน้าคิว** (ผู้ใช้ทดสอบเจอเอง 2026-11-15)
- ราก ghost: `showDragGhost()` ตั้ง `ghost.style.width` = ความกว้าง `#queueBar` (850px)
  + ใส่ข้อความเต็ม → แถบเต็มความกว้าง**บังรายการที่ลากไปใส่**
  · หลังแก้ `shortenGhost(text, 32)` + `max-width: 260px` + `border-radius: 999px`
  · วัดจริง **850px → 176px** (เล็กลง 79%), 33 code point + `…`
  · **ตัดด้วย `[...flat]` ไม่ใช่ slice ตรง ๆ** — สระ/วรรณยุกต์ไทยแยก code point
    slice แบบ UTF-16 จะตัดวรรณยุกต์หลุดจากพยัญชนะ
- เลขลำดับ: `<span class="queue-num">` เป็นลูกตัวแรก (ก่อน `⠿`) · `t('queuePosition',{n})`
  · `tabular-nums` ให้เลข 1/2 หลักกว้างเท่ากัน · คำนวณจาก `index` ตอน render → อัปเดตตามหลังลาก
- เทสต์: `selftest-queue-number.js` (24) · `check-queue-number.js` (19, Electron วัดจริง)
- ย้อนกลับ: คืน `ghost.style.width` → FAIL 3 (`chars:90`) · comment `appendChild(num)` → FAIL 3
- **Learned:** เพิ่ม element หน้าแถวทำให้ `check-queue-placement.js` พัง 3 ข้อ (geometry เลื่อน ~15px)
  → `gripFirst` ต้องข้าม `.queue-num`, เพดานระยะ 40 → 60px · **รันเทสต์ geometry เก่าทุกครั้งที่เพิ่ม element**

**(ข4) `5a34a25` — หน้า release ไม่มีคำอธิบาย (เตรียมปล่อยสู่สาธารณะ)**
- ราก: `release.yml` ไม่เคยตั้ง `body`/`body_path` → release มีแค่ชื่อ + ไฟล์ `.exe`
- แก้: `RELEASE_NOTES.md` ที่ **repo root** + `body_path: RELEASE_NOTES.md` (root-relative)
  + `package.json` description เป็นภาษาไทยที่สื่อความหมาย
- `RELEASE_NOTES.md` ตอบคำถามที่คนโหลดต้องรู้: โปรแกรมคืออะไร · ต้อง Windows อะไร ·
  **ทำไม Windows เตือน → More info → Run anyway** (ไม่มี code signing) · อัปเดตเอง ·
  แจ้งปัญหาที่ไหน · API ของเจ้าอื่นมีกติกาของตัวเอง
- เทสต์: `selftest-release-notes.js` (19, offline, อยู่ใน `npm test`)
- **`LICENSE` ยังไม่มี — ผู้ใช้เลือกข้าม** (ไม่ใช่เรื่องงบ แต่ผู้ใช้ไม่ต้องการ)
- **ข้อจำกัด:** release ที่ปล่อยแล้วแก้ย้อนหลังไม่ได้ (ไม่มี `gh`, repo private)
  → คำอธิบายเริ่มมีที่ **v0.5.0** · ถ้าอยากให้ v0.4.3 มี ผู้ใช้กด Edit ที่หน้าเว็บเอง

**(ค) เทสต์**
- `npm test` = **49/49** (ทุกไฟล์ผ่าน `node --check` ก่อน)
  · **ต้องลงทะเบียน `selftest-*.js` ใน `TESTS` ของ `scripts/run-unit-tests.js`** ไม่งั้นไม่รัน
- npm scripts: `check:queue` `check:reload` `check:history` `check:hold` `check:attach`
  `check:read` `check:cancel` `check:queue-edit` `check:approval` `check:blocks`
  `check:queue-controls` `check:queue-edit-hold` `check:queue-number`
- เทสต์ Electron ที่สำคัญ: `check-queue-controls.js` (27) · `check-turn-blocks.js` (17)
  · `check-read-position.js` · `check-cancel-button.js`

**ย้อนกลับที่พิสูจน์แล้ว (reverse test):**
- คืน overwrite ใน `onTextEnd` → FAIL 2 (`["อ่านเสร็จแล้ว","อ่านเสร็จแล้ว"]`)
- ลบ `sealBody` → FAIL 2 (`["จะทำก่อนแล้วทำต่อ"]`)
- คืนการวัดระยะ → FAIL 2 (`[84,168,252,336,420,504]`)
- ย้ายดินสอกลับท้ายแถว → FAIL 4 (`edit:146, text:27`)
- ลบ `showDragGhost` → FAIL 4 (`count:0`)
- ลบ `record.onCancel ||` → FAIL 7 (`afterQueue:1`)

**Learned (สำคัญสำหรับ session ถัดไป):**
1. **scroll event เป็น async** — `dispatchEvent` กับการเขียน `scrollTop` อาจมาสลับลำดับ
   ต้องรอ `requestAnimationFrame` 2 ครั้ง + 80ms ก่อนอ่าน state
2. **ปุ่ม `hidden` มี rect เป็นศูนย์** — เทสต์ geometry ต้อง unhide ก่อน แล้วคืนค่า
3. **`scrollTop = …` เฉย ๆ ไม่ใช่ scroll** — ต้อง `dispatchEvent(new Event('scroll'))`
   ไม่งั้น `pinnedToBottom` ยังเป็น `true` และเทสต์ผ่านโดยบังเอิญ
4. **regex ในเทสต์อาจไปชน comment** — comment ที่มี `scrollToBottom()` ทำให้ check ผ่าน/ตกผิด
   (เคยเจอ: comment มีคำว่า `scrollToBottom()` แล้ว regex จับ)
5. **bash heredoc กับ backtick ใน template string ชนกัน** — ไฟล์เทสต์ขาดกลางบรรทัด
   ต้องเขียนด้วย `write` tool แล้ว `cat` ต่อ
6. **`git checkout` กลางคัน** ทำให้ suite รายงาน FAIL หลอก — รอ restore เสร็จแล้วรันใหม่

**หมายเหตุเครื่องมือ:** `look_at_image` ใช้ไม่ได้ทั้ง session (reject ทุก path) ·
`gh` ไม่มีในเครื่อง และ repo เป็น private → **ดู CI ไม่ได้** ต้องให้ผู้ใช้เปิด
`https://github.com/Cheumklang/NTAPI-releases/releases`

**ต่างกันระหว่าง Ctrl+Shift+R กับปิดเปิดใหม่ (ผู้ใช้ถาม 2026-11-15):**
- `Ctrl+Shift+R` ทิ้ง renderer แต่ **main process + agent ที่กำลังรันอยู่ยังไม่ตาย**
  · `tab:open` reattach ด้วย session file (ดู `main.js` ~2384) ไม่สร้างแท็บซ้ำ
  · **`main.js` / `preload.js` ไม่ถูกโหลดใหม่** → แก้สองไฟล์นี้ต้อง `npm start` ใหม่
- ปิดโปรแกรม → ทุกอย่างตายทั้ง agent + คิว + hold
- **คิวและ hold อยู่ใน memory ของ renderer เท่านั้น ไม่ลง disk** → หายทั้งสองกรณี

### 1p) งาน 4 เรื่องหลัง v0.3.5 (2026-11-14) — commit แล้ว ยังไม่ build

รอบนี้ **ไม่ bump เวอร์ชัน** (ยัง 0.3.5) ตามกติกาสร้างทุก 0.5.0

**(ก) แนบไฟล์/วิดีโอไม่ได้** (`51c327e`)
- ราก: `mimeFor()` คืน `'image/png'` ให้ทุกนามสกุลที่ไม่รู้จัก → `.mp4` ถูกอ่านทั้งไฟล์เป็น
  base64 แล้วส่งเป็น data URI ที่ประกาศว่าเป็น PNG → `<img>` ภาพแตก
- แก้: `mimeFor()` คืน `null` สำหรับชนิดที่ไม่รู้จัก · เอา allowlist ใน dialog ออก
  (`All files` เดียว) · renderer ใช้ `INLINE_IMAGE_TYPES` ชัดเจน (png/jpeg/webp/gif/bmp)
  ไม่ใช้ `file.type.startsWith('image/')` → SVG ก็ไม่ถูก inline
- เพิ่ม `describeFile()` → prompt บอก AI ว่าไฟล์คือ video/audio/pdf/archive/ฯลฯ
  และสั่งให้ "แก้ปัญหาเองถ้าเปิดรูปแบบไม่ได้"
- เทสต์: `selftest-attachments.js` (26) · `check-attachment-video.js` (6, Electron จริง)
  → `npm run check:attach`
- **หมายเหตุ:** ลากวางเคยได้เพราะเส้นทางนั้นใช้ `file.type` ของ OS ซึ่งถูกต้อง

**(ข) ข้อความถูกดีดลงล่างตลอดตอนกำลังอ่าน** (`dd7d496`)
- ราก: `scrollToBottom()` ถือว่า "อยู่ล่าง" ถ้าห่างจากล่าง < 180px (~3 บรรทัด)
  → เลื่อนขึ้นไปอ่านคำตอบก่อนหน้ายังนับว่าอยู่ล่าง · และมี 4 จุดเรียกด้วย `force=true`
  (ข้อความ AI ใหม่, สตรีม token, tool เสร็จ, shell card) ซึ่งข้ามการเช็คไปเลย
- แก้: `NEAR_BOTTOM_PX = 48` · `isReadingUp()` + `syncJumpToBottom()` เป็นตัวตัดสินที่เดียว
  · ลบ `force` ออกจากเส้นทาง output (เหลือ 3 จุดที่ควร force: สลับแท็บ, ข้อความตัวเอง,
  boot) · เพิ่มปุ่ม `#jumpToBottom` ("ล่าสุด") ลอยกลางล่างของการแชท โผล่เมื่อเลื่อนขึ้น
- `#transcript` ถูกห่อด้วย `.transcript-wrap` (position:relative) เพื่อให้ปุ่มเกาะขอบล่าง
  โดยไม่เลื่อนหายไปกับข้อความ
- เทสต์: `selftest-read-position.js` (31) · `check-read-position.js` (16, Electron จริง)
  → `npm run check:read`
- **บทเรียน:** `scroll-behavior: smooth` ทำให้อ่าน `scrollTop` ทันทีหลังตั้งค่าได้ค่าเก่า —
  เทสต์ต้อง `insertCSS` ปิด smooth ก่อนวัด และต้องโหลด `preload.js` ไม่งั้น `api.getWinState()`
  throw แล้ว listener ทั้งไฟล์ไม่ถูกผูก (เทสต์จะหลอกว่าผ่าน)

**(ค) `npm test` ตรวจ syntax ทุกไฟล์แล้ว** (`8100fca`)
- เพราะเคยพิมพ์ `'the composer's left edge'` (apostrophe ปิด string) แล้วมีแค่ Electron
  เด้ง error dialog — offline test ไม่จับเพราะไม่เคย parse สคริปต์ Electron
- ตอนนี้ `run-unit-tests.js` รัน `node --check` ทุกไฟล์ใน `src/` + `scripts/` ก่อน (110 ไฟล์)

**สถานะรวม:** `npm test` = **42/42** · master สะอาด · ยังไม่ build

**ยังค้าง:** ผู้ใช้รายงานว่าข้อความ "หาย" จากประวัติ (วิดีโอ) — **ยังไม่ได้ไข**
รอคำตอบว่าเป็นแบบ A (หายถาวรจนรีสตาร์ต) / B (หายชั่วคราวแล้วกลับมา) /
C (เฉพาะตอนแนบไฟล์) / D (ไม่แนบก็หาย) ห้ามบอกว่าแก้แล้วจนกว่าจะยืนยันได้

### 1o) สวิตช์อนุมัติ 3 ระดับ — แทนสวิตช์ล่องหน 4 ตัว (2026-11-14) v0.3.5

**อาการที่ผู้ใช้เจอ:** dialog อนุมัติเครื่องมือ "บางทีก็ขึ้น บางทีก็ไม่ขึ้น"

**รากปัญหา:** มี 4 ที่ตัดสินพร้อมกันว่า dialog จะขึ้นหรือไม่
1. ช่องติ๊ก "ไม่ต้องถามซ้ำในเซสชันนี้" (`allowedTools`)
2. ปุ่ม "Allow everything" (`allowEverything`)
3. `approvalVerdict()` ที่ให้ browser autopilot ตัดสินเงียบ ๆ
4. `ALWAYS_ASK` (จ่ายเงิน/ลบบัญชี) — **โค้ดตาย**: เรียกจากเทสต์เท่านั้น ไม่เคยต่อสายกับแอปจริง

ทั้งหมดเก็บใน memory (ปิดแอปแล้วหาย) → คำสั่งเดิมถามวันนี้ รันเงียบพรุ่งนี้
และขึ้นกับโมเดล/แท็บ/เวลาที่ autopilot ยังไม่หมดอายุ

**แก้:** เหลือสวิตช์เดียวที่ผู้ใช้เลือก = ตัวชี้ขาด
- ไฟล์ใหม่ `src/approval-policy.js` — `ask` / `allow` / `deny` (ค่าตั้งต้น `ask`)
  - `decide(policy)` รับ **อาร์กิวเมนต์เดียวโดยเจตนา** → เอาโมเดล/แท็บ/ชื่อ tool มาขยับคำตอบไม่ได้
  - ค่าที่พิมพ์ผิด/ค่าว่าง **ไม่ถือว่าอนุมัติ** → ถอยไป `ask`
  - `policyFromLegacy()` อ่านค่าเก่า (`allowEverything`/`allowedTools`) ตอนอัปเกรด
- `main.js` — `approvalPolicy` เก็บใน `prefs.json` (ไม่หายเมื่อปิดแอป) · `askApproval()` ไม่ดู
  policy อื่นเลย · IPC `approval:setMode`/`getMode` คืน `{policy}`
- UI — dropdown ในแถบข้างใต้ Workspace + คำอธิบาย · dialog เหลือ 2 ปุ่ม (Allow/Deny)
  ไม่มี remember อีก · แบนเนอร์เตือนค้างตลอดเมื่อไม่ใช่ `ask` + ปุ่ม "กลับมาถาม"
- **ลบ `approvalVerdict()` ออกจาก `browser-autopilot.js`** — autopilot ยังคุมอายุงานได้ แต่
  ไม่มีสิทธิ์ตัดสินว่าจะถามไหม · เทสต์ autopilot เปลี่ยนไปทดสอบ `allows()` แทน
- ลบคีย์ i18n ที่ไม่มีใครใช้ (allowAll / rememberTool / confirmAllowAll / allowAllTitle / Sub / Meta / confirmAllowAllAction)

**เทสต์:** `selftest-approval-policy.js` (33 checks) — ตรวจแยกทีละสวิตช์เก่าว่าขยับคำตอบไม่ได้,
ค่าขยะไม่กลายเป็น permission, path อัปเกรด, `decide.length === 1`
→ `npm test` **PASS 34/34**

**เลือกแล้วไม่ทำ:** ถามซ้ำเรื่องจ่ายเงิน/ลบบัญชีแม้ตอน `allow` — เพราะฟีเจอร์นั้นยังไม่เคยต่อสาย
ผู้ใช้ไม่เคยเห็น ใส่ไปจะเป็นสวิตช์ล่องหนตัวใหม่ (ถ้าจะทำ ต้องแยกงาน + ทดสอบกับ Chrome จริง)

**แก้เพิ่มหลัง build แรก (สวิตช์ถูกวาดทับด้วยธีม Windows):** `<select>` ยืมคลาส `.path-btn`
(ออกแบบมาเพื่อ `<button>`) → Windows วาดกรอบขาวทับธีมมืด ตอนนี้มีคลาสของตัวเอง
`approval-policy-select` (`appearance:none` + token + focus ring + `option` ธีมมืด)
เทสต์กันซ้ำ `selftest-approval-ui.js` (ทดสอบแล้วว่าใส่ `.path-btn` กลับจะ FAIL จริง) → `npm test` **35/35**

**ปรับตามที่ผู้ใช้ทดสอบแล้ว (ล้น/เกะกะ):** สวิตช์เหลือแถวเดียว (ไม่มี heading/hint —
ข้อความย้ายไป `title` ที่เปลี่ยนตามค่า) และย้ายไปใต้ Workspace · แบนเนอร์ "ไม่ถาม" ย้ายไปล่างสุด
ของแถบข้าง (ใต้ Status) ไม่ดันเนื้อหาแล้ว · `selftest-approval-ui.js` +4 checks
(ทดสอบย้อนกลับ: ย้ายแบนเนอร์ขึ้นบน → FAIL จริง)

**ลบแบนเนอร์ "กลับมาถาม" ออกแล้ว (ผู้ใช้ชี้ว่าไม่ต้องใช้):** เหลือสวิตช์เป็นตัวควบคุมเดียว
— ไม่มี `#approvalModeBanner` / `#approvalModeReset` / i18n `approvalsOff`+`turnPromptsBackOn` /
CSS `.approval-banner` แล้ว · เทสต์เปลี่ยนเป็นตรวจว่า**ไม่มี**ของเหล่านั้น (ทดสอบย้อนกลับ FAIL จริง)

**แถบกิจกรรม AI ย่อเป็นข้อความ:** ย้าย `#activityStrip` ไปอยู่ใน `.status-row` แถวเดียวกับ
"กำลังทำงาน…" · ตัดปุ่ม "ดูแท็บนั้น" (`#activityFocus`) ออก · ไม่มีกรอบ/พื้นหลังแล้ว
เหลือข้อความ + ปุ่ม Stop แบบลิงก์ · เทสต์ +8 checks (ย้อนกลับ FAIL จริง)

**/compact เข้าคิวได้แล้ว:** เดิมระหว่างเทิร์นทำงานจะปฏิเสธ ("รอให้รอบนี้เสร็จก่อน")
ตอนนี้เข้าคิวเป็น action (`{kind:'action'}`) แล้วรันเมื่อเทิร์นจบ · `drainQueue` รัน action
แล้ว drain ต่อเอง (action ไม่สร้างเทิร์น) · Ctrl+Enter ที่พิมพ์ `/compact` จับเป็นคำสั่ง
(`findSlashCommand`) ไม่ส่งเป็นข้อความ · i18n ใหม่ `compactFailed`
· เทสต์ `selftest-compact-queue.js` (ทดสอบย้อนกลับ FAIL จริง) → `npm test` **36/36**

**สวิตช์อนุมัติมีหัวข้อแล้ว:** `<label for="approvalPolicy">การอนุมัติเครื่องมือ</label>` +
บรรทัดอธิบายสั้น (`.approval-note`) ว่าหมายถึงอะไร · เปลี่ยน option `deny` เป็น
**"ไม่อนุมัติเลย"** (เดิม "ไม่อนุมัติเสมอ") พร้อม `APPROVAL_TITLES` ให้ตรงกัน
· เทสต์เปลี่ยนจาก "ไม่มีหัวข้อ" → ตรวจว่ามี `<label for>` จริง (ย้อนกลับ FAIL 4 จริง)

**ปล่อย v0.3.5 แล้ว (2026-11-14):** merge เข้า `master` (`daf9ef8`) · build + `latest.yml` ใหม่ ·
push tag `v0.3.5` → GitHub Actions (`release.yml`) build และอัปโหลดไป `Cheumklang/NTAPI-releases`
· `npm run release` ในเครื่องใช้ไม่ได้ (ไม่มี `GH_TOKEN`) — ใช้ Actions เท่านั้น

**คิวการส่งอยู่ในกล่องแชทแล้ว:** ย้าย `#queueBar` เข้าไปใน `.composer-box` เป็นคอลัมน์
`.composer-side` ชิดขวา **ใต้ปุ่มส่ง** (ไม่ใช่แถวลอยเหนือกล่องเหมือนเดิม) · `max-width: 46%`
กันไม่ให้ล้น · ไม่มีกรอบ/พื้น/พิล · `×` โผล่ตอน hover/focus · หัวข้อ `ในคิว: n`
· เทสต์ 2 ชั้น: `selftest-queue-chrome.js` (static, ย้อนกลับ FAIL 4) และ
`scripts/check-queue-placement.js` (Electron วัดพิกเซลจริง 13 checks, ย้อนกลับ FAIL 5)
· `npm run check:queue` · `npm test` **37/37**

**Ctrl+Shift+R ระหว่างงานใช้ได้แล้ว:** reload ทำลายแค่ renderer ส่วน tab/agent อยู่ใน main process
ที่แก้ 3 จุด: `tab:open` reattach กับ tab ที่เปิด session file เดียวกันอยู่แล้ว (เดิมสร้าง tab ใหม่เสมอ
ทำให้งานที่รันอยู่กลายเป็นกำพร้า), `boot()` ใช้ `applyTabState` (เดิมสร้าง view เปล่าทิ้ง state),
`applyTabState` คืน `setBusy` (เดิมหลัง reload ปุ่มส่งดูว่างทั้งที่งานยังรัน → กดซ้ำได้)
· เทสต์ `selftest-reload-reattach.js` (ย้อนกลับ FAIL 9) + `check-reload-safety.js` +
`check-reload-reattach-live.js` · `npm run check:reload` · `npm test` **38/38**

**ข้อความที่ส่งแล้วไม่หายจากประวัติ:** `applyTabState` ใช้ `mergeIncomingMessages` —
ข้อความ `pending` ถูกเก็บไว้จน session มี ทำให้ compact/undo/สลับ key แทรกช่วงส่ง ไม่ลบข้อความ
· จุดส่ง 3 แห่ง mark `pending` · เทสต์ `selftest-history-merge.js` (ย้อนกลับ FAIL 2/3/2)
+ `check-history-merge.js` (renderer จริง 8 checks) · `npm run check:history` · `npm test` **39/39**

**ข้อความระหว่างงานหน่วง 5 วิ + แก้ไข/ยกเลิก:** `HOLD_SECONDS=5` · ข้อความขึ้นทันทีนับถอยหลัง
5→1 แล้วส่งเอง · ปุ่ม **แก้ไข** ดึงข้อความ+รูปกลับช่องพิมพ์ · **ยกเลิก** ทิ้ง · ใช้ทั้งทาง
Enter (steer) และ Ctrl+Enter (คิว) · สลับแท็บ/แท็บปิด = ยกเลิก · เทิร์นจบก่อนครบ 5 วิ = ส่งเลย
· เทสต์ `selftest-hold-before-send.js` (ย้อนกลับ FAIL 2/1/1) + `check-hold-before-send.js`
(กดปุ่มจริง 13 checks) · `npm run check:hold` · `npm test` **40/40**

**ค้าง:** ยังไม่ได้ทดสอบ UI จริงด้วยตารอบสอง (`npm start`) และยังไม่ได้ทดสอบ
browser agent mode กับ Chrome จริงรอบยืนยัน

### 1n) FreePi 426 `upgrade_required` — แก้เสร็จ + bump 0.3.4 (2026-11-14) ✅ UNCOMMITTED

**อาการ:** ใช้ FreePi ไม่ได้ ขึ้น "ไคลเอนต์เวอร์ชันเก่าเกินไป — รัน `npx free-pi-cli@latest`"
ทั้งที่ CLI บนเครื่องเป็น 0.6.21 (ล่าสุดแล้ว)

**รากปัญหา:** (1) fallback hardcode `0.6.20` ต่ำกว่า min ของ backend (0.6.21)
(2) `CLIENT_VERSION` คำนวณครั้งเดียวตอน module load → อัป CLI ระหว่างเปิดแอปไม่มีผล
(3) `AppData\Roaming\npm` มี 0.6.19 ค้าง และไม่มีการกันค่าที่ต่ำกว่า min

**แก้:** ไฟล์ใหม่ `src/client-version.js` (detection สดทุกครั้ง · `CLIENT_VERSION_FLOOR`
`resolveClientVersionFloor()` ถาม backend ตอนเปิดแอป · `upgradedClientVersion()` กู้หลัง 426 ·
`isUpgradeRequired()`) + `freepi-bridge.js` (`currentClientVersion()`, `refreshClientVersion()`)
+ `main.js` (startup fetch + กู้ 426 ครั้งเดียวต่อแท็บ) + `selftest-client-version.js` (29 checks)

**เทสต์:** `npm test` → **PASS 33/33** · ยืนยันกับ backend จริง (min = 0.6.21) ผ่าน ·
จำลอง backend อนาคตบนเครื่องไม่มี CLI → ส่ง 0.8.3 ได้เอง

**ไม่ต้องคอยอัปเดตแอปอีก:** เครื่องที่มี CLI ใหม่ → อ่านสด · backend ขึ้น min กลาง session → กู้ 426
เอง · เครื่องใหม่ไม่มี CLI → ถาม backend ตอนเปิดแอป เหลือแค่ `CLIENT_VERSION_FLOOR` เป็นค่าสำรอง
ตอนออฟไลน์ครั้งแรก

### 1m) Browser agent mode — งาน 1–12 เขียนเสร็จแล้ว (2026-11-14) สาขา `feat/browser-agent-mode`

**เป้าหมาย:** ให้ AI "มองหน้าเว็บแบบกด F12" (อ่านโครงสร้าง + ชี้เป้าด้วย `ref`) ทำงานในแท็บจริงที่ผู้ใช้อมอบให้
และทำจนจบงานโดยไม่ถามทีละขั้น — ตามที่ผู้ใช้ขอว่า *"อยากให้ทำได้แบบ opencode"*

**สเปก/แผน:** `docs/superpowers/specs/2026-11-14-browser-agent-mode-design.md` +
`docs/superpowers/plans/2026-11-14-browser-agent-mode.md` · ledger: `.superpowers/sdd/2026-11-14-browser-agent-mode/progress.md`

**ทำอะไรไปแล้ว (commit บนสาขา):**
1. `src/browser-snapshot.js` — ข้อเท็จจริง DOM → role/ชื่อ/ref + งบโทเคน + ตารางให้ค้น
2. `background.js` — เก็บ DOM ดิบ + เจาะ iframe ข้ามโดเมน (isolated world ต่อ frame)
3. `background.js` — จัดการ `confirm()`/`alert` + รอ navigate + `wait { networkIdle }`
4. `src/browser-target.js` + tool `browser_snapshot`/`browser_find` + ทุก tool รับ `ref` + audit ทุกคำสั่ง
5. `src/browser-claims.js` — โดเมนหลัก (eTLD+1) + ที่เก็บแท็บที่มอบ
6. `src/browser-autopilot.js` — โหมดมอบงาน + กฎหมดอายุ + รายการที่ต้องถามเสมอ
7. `browser-bridge.js` — `NOT_CLAIMED` กันไม่ให้แตะแท็บที่ยังไม่ได้มอบ + activity
8. `background.js` — `tabs-real` + handshake รับการมอบแท็บจากป๊อปอัป + `detachAll`
9. `main.js`/`preload.js` — สถานะ claim/autopilot + IPC + ตัดสินใจอนุมัติ
10. UI — รายการแท็บ · สวิตช์มอบงาน · **แถบกิจกรรมสด + ปุ่มหยุด** · จุดสถานะบนชิป
11. `popup.*` — ปุ่ม "ใช้แท็บที่เปิดอยู่"
12. แจ้ง `tabClosed` / `navigate` → จบโหมดมอบงานเอง + กฎใน system prompt

**สถานะเทสต์:** `cd app && npm test` → **PASS 32/32** (เพิ่ม 3 ตัวใหม่: snapshot, target, claims, autopilot — รวมเป็น 32)

**ยังไม่ได้ทำ (ค้างจริง):**
- ⚠️ **ทดสอบกับ Chrome จริงรอบยืนยัน** — แก้บั๊ก "รายงานว่าถูกปฏิเสธทั้งที่ไม่มี dialog" แล้ว
  (แท็บว่างไม่ถูกเสนอ · claim ที่ล้มเหลวไม่เงียบ · error ในระบบอนุมัติไม่ถูกเรียกว่า "ผู้ใช้ปฏิเสธ")
  แต่ยังไม่มีรอบทดสอบยืนยันหลังแก้
- ยังไม่ merge เข้า `master`
- **เลื่อนไป phase 2:** console/network inspection, อัปโหลดไฟล์, มอบหลายแท็บพร้อมกัน, แผง mirror
- **ข้อจำกัดที่ต้องยืนยันตอนเทสต์มือ:** iframe ที่เป็น out-of-process จริง (site isolation) อาจไม่ถึงด้วย `chrome.debugger` API แบบ flat; iframe ข้ามโดเมนแบบ same-process ใช้ได้

### 1n) FreePi 426 `upgrade_required` — แก้เสร็จ ปล่อย v0.3.4 แล้ว (2026-11-14) ✅

**อาการ:** ใช้ FreePi ไม่ได้ ขึ้น "ไคลเอนต์เวอร์ชันเก่าเกินไป — รัน `npx free-pi-cli@latest`"
ทั้งที่ CLI บนเครื่องเป็น 0.6.21 (ล่าสุดแล้ว)

**รากปัญหา:** (1) fallback hardcode `0.6.20` ต่ำกว่า min ของ backend (0.6.21)
(2) `CLIENT_VERSION` คำนวณครั้งเดียวตอน module load → อัป CLI ระหว่างเปิดแอปไม่มีผล
(3) `AppData\Roaming\npm` มี 0.6.19 ค้าง และไม่มีการกันค่าที่ต่ำกว่า min

**แก้:** ไฟล์ใหม่ `src/client-version.js` (detection สดทุกครั้ง · `CLIENT_VERSION_FLOOR`
`resolveClientVersionFloor()` ถาม backend ตอนเปิดแอป · `upgradedClientVersion()` กู้หลัง 426 ·
`isUpgradeRequired()`) + `freepi-bridge.js` (`currentClientVersion()`, `refreshClientVersion()`)
+ `main.js` (startup fetch + กู้ 426 ครั้งเดียวต่อแท็บ) + `selftest-client-version.js` (29 checks)

**เทสต์:** `npm test` → **PASS 33/33** · ยืนยันกับ backend จริง (min = 0.6.21) ผ่าน ·
จำลอง backend อนาคตบนเครื่องไม่มี CLI → ส่ง 0.8.3 ได้เอง

**ไม่ต้องคอยอัปเดตแอปอีก:** เครื่องที่มี CLI ใหม่ → อ่านสด · backend ขึ้น min กลาง session → กู้ 426
เอง · เครื่องใหม่ไม่มี CLI → ถาม backend ตอนเปิดแอป เหลือแค่ `CLIENT_VERSION_FLOOR` เป็นค่าสำรอง
ตอนออฟไลน์ครั้งแรก

### 1z) แบทช์ v0.3.3 (2026-11-14) — 5 เรื่อง + บั๊กใหญ่ 2 ตัว ✅ commit + tag แล้ว

1. **บั๊กใหญ่: สคริปต์กลางของ renderer ไม่เคยโหลดเลย**
   - `index.html` อ้าง `error-messages.js` / `duration.js` แต่ไฟล์อยู่ที่ `src/` ไม่ใช่ `src/renderer/`
     → **404 เงียบ ๆ** อาการที่ผู้ใช้เห็น: เวลายังเป็น `9150 ms` ทั้งที่เลือกไทย
     และ **ข้อความ error/notice 2 ภาษาของ v0.3.1 ไม่เคยทำงาน** (ตกไปโชว์ key ดิบ)
   - แก้ path เป็น `../error-messages.js`, `../duration.js`
   - เจอบั๊กซ้อน: ทั้งสองไฟล์ประกาศ `const api` ระดับบนสุด → `Identifier 'api' has already been
     declared` สคริปต์ที่สองไม่รัน ⇒ ครอบ IIFE แบบ `markdown.js` / `provider-ui.js`
   - **กันซ้ำ:** `selftest-duration.js` ตรวจว่า ทุก `<script src>`/`<link href>` ใน index.html
     มีไฟล์จริง + โมดูลกลางต้องเป็น IIFE (ทดสอบย้อนกลับแล้วว่า FAIL จริง)
     และ `scripts/check-duration-wiring.js` (Electron) พิสูจน์ผลจริงใน index.html
2. **fallback สลับโมเดลจริง ไม่ข้ามตัว** (`src/model-fallback.js`, `src/main.js`)
   - เดิม `switchToNextFreeModel` ใส่ `tried` ให้โมเดลที่เพิ่งสลับ **ไป** ทันที + settle path
     อ่าน `session.model` (= ตัวที่เพิ่งสลับไป) มาโทษ ⇒ ข้าม 1 ตัวทุกครั้ง pool หมดเร็วเกินจริง
   - ตอนนี้โทษจาก `failedModelFromMessage(last)` (provider/model บน assistant message ที่ error)
     และไม่ retire โมเดลที่แค่ "ถูกเลือก"
   - `auto_retry_start`: ยกเลิก backoff ที่ไม่ productive ด้วย `abortRetry()` + `queueMicrotask`
     (pi สร้าง abort controller *หลัง* ยิง event นี้) แล้วให้ settle path เป็นคนสลับ + `continue()`
   - ไล่บนลงล่างจนหมด pool ค่อยแจ้ง (ตามที่ผู้ใช้ขอ) — ไม่หยุดหลังครั้งเดียว
3. **หน่วยเวลา 2 ภาษา** (`src/duration.js`) — th: `วินาที/นาที/ชม./มิลลิวินาที`, en: `sec/min/h/ms`
   (<100 ms ไทย = `86 มิลลิวินาที`) ใช้ทั้งการ์ด tool และตัวนับสิทธิ์ (ไม่ขึ้น `0 นาที` แล้ว)
4. **error banner ไม่ชิดขอบ** — `.transcript > .error-banner` คิด gutter 22px เอง
   (เดิม `padding: 8px 12px` ทับ inset ของ `.transcript > *`)
5. **UI** — ปุ่ม dialog ควบคุมเบราว์เซอร์ (helper row เท่ากัน + footer ซ้าย/ขวา + เลื่อนได้),
   sidebar กันทับ (ความกว้างขั้นต่ำวัดจากแถวบนจริง), การ์ด tool ที่ collapsed ซ่อนรูป preview
   ด้วย ⇒ การ์ดที่ **ล้มเหลวไม่ขยายอีก** (`Failed` แค่ทำเครื่องหมาย), หน้าติดตั้ง NSIS มีแบรนด์

**ขั้นถัดไป:** รอผู้ใช้ทดลอง v0.3.3 (fallback, หน่วยเวลา, browser control live)
ถ้า browser control มีปัญหา ขอ `browser-audit.log` + ข้อความ error ในแชท

**Deferred (ยังไม่ทำ):** (a) ไม่มี unit test ยืนยัน DOM ของ `#browserBtn`/dialog (พึ่ง boot smoke)
(b) extension ไม่จำกัดโดเมน (อนุมัติต่อ tool ไม่ใช่ต่อเว็บไซต์)
(c) ข้อความผลลัพธ์ tool (เช่น `Browser error (...)`) ยังเป็นอังกฤษ
(d) banner เก่าไม่ย้อนแปลเมื่อสลับภาษา
> ⚠️ ตรวจ `git status` เทียบกับที่นี่เสมอ — อาจมี session อื่นทํางานคู่ขนานอยู่
> สถานะ: งาน 1a–1l อยู่ใน v0.2.6 (รวมงาน session อื่น: single-instance)

### 1a) เคส LLM7 — แก้เสร็จ ยืนยันกับโมเดลจริงแล้ว และ commit แล้ว (`e6b959d`)
- **อาการ:** reasoning model กินโควตา output จนหมด แล้วได้ `finish_reason: "length"` + content ว่าง
  → หน้าต่างเงียบ อ่านเหมือนแชทค้าง
- **รากปัญหา (ยืนยันด้วยเทสต์สด + โทเคนจริง 2 ชั้น):**
  1. `reasoning_effort: "minimal"` (มาจาก thinkingLevel ของแอป) ทำให้ LLM7 ตัดจบกลางความคิด
     → `length` + content ว่าง (ทดสอบซ้ำได้: ส่ง param นี้แล้วว่างทันที, ตัดออกแล้วตอบปกติ)
  2. **สาเหตุจริงของดีฟอลต์:** โมเดลฟรีตัวแรกของ catalog คือ `DeepSeek-V4-Flash-0731`
     ซึ่งบนเลนฟรีถูกบีบ output เหลือ ~128 tokens (วัดจาก usage: `completion_tokens: 128`
     ทุกครั้ง ไม่ว่า `max_tokens` จะเป็น 512 หรือ 32768) — reasoning กินหมดก่อนตอบ
     ส่วนโมเดลฟรีที่ไม่คิดก่อนตอบ (gpt-oss:20b, codestral-latest) ตอบครบ 245–448 tokens
- **ที่แก้ (ยังไม่ commit):**
  - `app/src/llm7.js` — compat: `maxTokensField: 'max_tokens'`, `supportsReasoningEffort: false`
    + `PREFERRED_FREE_MODELS` / `preferredLlm7Model()` เลือกดีฟอลต์จากรายชื่อที่พิสูจน์แล้ว
  - `app/src/provider-plan.js` — ดีฟอลต์ llm7 ใช้ `preferredLlm7Model()` แทน "ตัวแรกที่ฟรี"
  - `app/src/main.js` — notice เมื่อ `stopReason === 'length'` และไม่มีคำตอบ (กันหน้าต่างเงียบ)
  - เทสต์: `selftest-llm7.js` (+compat/default), `selftest-provider-plan.js` (+ดีฟอลต์แบบเรียงสลับ)
- **ยืนยัน:** รัน bridge จริงด้วยโทเคนที่บันทึกไว้ — ดีฟอลต์ใหม่ `gpt-oss:20b` ตอบ
  "สวัสดีครับ! มีอะไรให้ช่วยเหลือได้บ้างครับ?" ใน 1 วินาที (stop=stop)
- **รอบ 2 (หลังผู้ใช้ลองจริง):** แท็บเดิมยังจำ DeepSeek ไว้ → เพิ่มการแก้ให้เองใน `main.js`
  (`planEmptyAnswerRetry()` / `runEmptyAnswerRetry()`): เทิร์นจบ `length` + ไม่มีคำตอบ
  → ลองซ้ำโมเดลเดิม 1 ครั้ง (รอ 2.5 วิ) → ถ้ายังว่างจึงสลับไป `gpt-oss:20b` แล้วส่งซ้ำ
  (สูงสุด 2 ครั้ง/ข้อความผู้ใช้, ยกเลิกทันทีถ้าผู้ใช้ส่งข้อความใหม่, ใช้ `promptSeq` กันส่งซ้ำ)
  ต้องมีธง `reasoning` ใน `llm7ModelEntries()` (เพิ่มแล้ว)
- **รอบ 3 (ผู้ใช้ท้วงว่า "พิมพ์ยาวๆ แล้วตอบ" — ท้วงถูก):** วัดซ้ำแล้วพบว่า **ไม่เกี่ยวกับความยาวข้อความ**
  อาการมาจาก **โหมดลดทอนชั่วคราวของ LLM7**: `usage.prompt_tokens = 32` + `completion = 128` เป๊ะ
  แล้วกลับมาปกติเองภายใน ~4 วินาที (ข้อความยาวก็ล้มได้, ข้อความสั้นก็ผ่าน) → จึงเปลี่ยนลำดับกู้เป็น
  "ลองซ้ำก่อน แล้วค่อยสลับโมเดล" และแยกตรรกะเป็น `src/empty-answer.js` + `selftest-empty-answer.js`
  (สรุป: ไม่ใช่บั๊กในโค้ดแอป แต่แอปเดิมเลือกโมเดลเสี่ยง + เงียบเกินไป)
- **ต้องทําต่อ:** เสร็จแล้ว — ปล่อย v0.2.2 ขึ้น `NTAPI-releases` ถูกต้อง; เหลือผู้ใช้อัปเดตโปรแกรมที่ติดตั้ง + ทดสอบเอง

### 1b) ไฟล์ค้างอื่น ๆ
- [x] **root `README.md`** — ลบแล้วตามคําสั่งผู้ใช้ (2026-11-14) เนื้อหาย้ายเข้า `.AGENT/PROJECT.md` (ภาคผนวก)
- [x] **probe scripts + artifact** — ลบออกหมดแล้ว (ใช้ชั่วคราว ไม่ควรอยู่ในรีโป)
- [x] **งานระบบ `.AGENT`** — commit `82844d7` + push แล้ว

### 1c) ลิสต์แชทที่บันทึกไว้ — แก้ให้เรียงนิ่ง (commit `50338cc` + push แล้ว)
- **ปัญหา:** ซ้ายมือสลับที่ไปมา ผู้ใช้กดผิด เพราะเรียงตาม `modified` (เวลาที่แชทถูกเขียนล่าสุด)
  → ทุกครั้งที่ส่งข้อความในแชทไหน แชทนั้นเด้งขึ้นบน
- **แก้:** เรียงตาม **`created` (เวลาสร้าง) ใหม่→เก่า** + tie-break ด้วย `id` (นิ่งสนิท
  ให้แชทใหม่สุดอยู่บนเสมอ) และแสดงวันที่สร้างบนแถว
- ไฟล์: `app/src/main.js` (`listSessions`), `app/src/renderer/app.js` (`renderSessions`)
- ยืนยัน: `node --check` ผ่านทั้งสองไฟล์, `selftest-session-paths.js` PASS

### 1d) ข้อความที่ส่งกลางเทิร์น (steer) โผล่ผิดลําดับ — แก้แล้ว (commit `1f05f90`)
- **ปัญหา:** ส่งข้อความขณะ AI กำลังทำงาน → ข้อความไปอยู่ล่างสุด และคำตอบที่เหลือสตรีมกลับเข้า
  บล็อกเดิมด้านบน → คำตอบไปโผล่เหนือข้อความผู้ใช้ อ่านสลับลําดับ สับสน
- **แก้:** เพิ่ม event `turn_start` (main → renderer) แล้ว “ปิดบล็อก” ตอนขึ้นเทิร์นใหม่
  เพื่อให้คำตอบที่ตอบข้อความนั้นไปอยู่ **ใต้** ข้อความผู้ใช้
  - `app/src/main.js`: case `turn_start` → ส่ง `agent:turnStart`
  - `app/src/preload.js`: เพิ่ม `onTurnStart`
  - `app/src/renderer/app.js`: `view.steerPending` + `api.onTurnStart` + reset ใน settled/error
- ยืนยัน: `node --check` ผ่าน 3 ไฟล์, selftest (sse-guard/provider-plan/empty-answer) PASS,
  ตรวจลําดับ event ใน SDK แล้วว่า `turn_start` ยิงก่อนข้อความ steer + คำตอบใหม่
- **สถานะ:** commit `1f05f90` → อยู่ใน v0.2.3 แล้ว; เหลือผู้ใช้ทดสอบ UI จริง

### 1e) คําว่า "กำลังทำงาน..." ให้ขยับ (commit `1f05f90`)
- **เหตุ:** ข้อความนิ่ง อ่านเหมือนโปรแกรมค้าง
- **แก้:** ต่อท้ายด้วยจุด 3 จุด เด้ง/จางสลับจังหวะ (`.hint-dots`, `@keyframes hint-dot`)
  - `app/src/renderer/app.js` (`setBusy`), `app/src/renderer/styles.css`
  - รองรับ `prefers-reduced-motion` (หยุดขยับให้คนที่ปิดอนิเมชัน)
- ยืนยัน: `node --check` ผ่าน; ยังไม่ทดสอบ UI

### 1f) ปรับ model picker + สถานะ Coarena (commit `f6483b9`)
- **ลบปุ่ม** "คำสั่ง (Ctrl+P)" ออกจาก sidebar (คีย์ลัด Ctrl+P ยังใช้ได้)
- **เรียง A-Z:** ค่ายเรียง A-Z (Coarena→FreePi→LLM7→NVIDIA→Token Harbor→Zro)
  และโมเดลในแต่ละค่ายเรียง A-Z (ทำใน `provider-ui.js` `groupModelsByProvider`)
- **ดาวโปรด:** ปุ่มดาวทุกแถวโมเดล → ดาวแล้วได้โฟลเดอร์ "รายการโปรด" อยู่บนสุด
  (เก็บใน `localStorage` คีย์ `ntapi.favoriteModels`; ตัวที่ติดดาวยังอยู่ใต้ค่ายเดิมด้วย)
- **tooltip ฟองอากาศ:** ชี้เมาส์ที่โมเดล → แสดงโลโก้ค่าย + ชื่อค่าย เป็น pill ไม่มีมุม
- **สถานะ Coarena:** เพิ่มแถบ % งบรายวัน (`usd_per_day`/`cost_usd`) + เวลารีเซ็ต
  (เดิมมีแค่บรรทัด limits)
- ไฟล์: `app/src/renderer/provider-ui.js`, `renderer/app.js`, `renderer/index.html`,
  `renderer/styles.css`, `scripts/selftest-provider-ui.js`, `scripts/selftest-model-picker.js`
- **ยืนยัน:** `selftest-provider-ui` PASS, `selftest-model-picker` PASS (A-Z / ดาว / tooltip จริง),
  `node --check` ผ่าน, ชุด provider-plan/errors/key/model-filter/prompt-mode/markdown/session-paths PASS

### 1g) ไอคอนแอปเป็นสี่เหลี่ยม — ท ามุมโค้ง (commit `19497a8`)
- **ปัญหา:** ไอคอนบนเดสก์ท็อป/ทาสก์บาร์ (`build/icon.png`) เป็นสี่เหลี่ยม แต่ในโปรแกรมมี CSS `border-radius`
- **แก้:** เบิร์นมุมโค้ง (rx = 8/28 ของด้าน ให้ตรง `.brand-icon`) + พื้นหลังโปร่งใส ผ่าน
  `tools/round-icon.js` (idempotent) → `build/icon.png` (512, rx146), `assets/icon.png` (256, rx73)
- ผลกับ shortcut/taskbar/installer จะเห็นหลังบิลด์ release ถัดไป

### 1h) single-instance lock — session อื่นท า (commit `efc866b`)
- `app/src/single-instance.js` (`focusExistingWindow`) + `main.js` (`requestSingleInstanceLock`)
- เทส `selftest-single-instance.js` PASS — เปิดซ้ำจะโฟกัสหน้าต่างเดิม ไม่เปิดโปรเซสใหม่
- เป็น P0 ในรีวิว

### 1i) MCP — Phase 1+2 เสร็จ (commit `0577f5e` + push แล้ว)
- **พบ:** โปรแกรม **โหลด MCP อยู่แล้ว** (`sdk.createMcpExtension()`)
- **Phase 1 (ความปลอดภัย):** `isGuardedTool()` + `mcpToolLabel()` ใน `freepi-bridge.js`
  → MCP tools ต้องอนุมัติทุกครั้ง + dialog โชว์ชื่อ server (`main.js` → `renderer/app.js`)
- **Phase 2 (ใช้ได้จริง):**
  - config ย้ายมาที่ **`C:\NTAPI\mcp.json`** ผ่าน `loadAppMcpConfig()` — หาเจอ ไม่หลบใน dot-folder
  - **opt-in / ปิดดีฟอลต์** (`mcpEnabled` ใน prefs; เปิดที่ Settings)
  - Settings แท็บ **MCP**: ติ๊กเปิด + แก้ `mcp.json` (textarea) + บันทึก (`mcp:get`/`mcp:set`)
  - เตือนเรื่อง LLM7 free (function calling เป็นสิทธิ์ Pro)
- ไฟล์: `freepi-bridge.js`, `main.js`, `preload.js`, `renderer/{app.js,index.html,styles.css}`,
  `scripts/selftest-mcp-{guard,config}.js`
- **ยืนยัน:** `selftest-mcp-guard` + `selftest-mcp-config` PASS, ชุดอื่น PASS,
  smoke test เปิด Electron จริง (model picker) PASS
- **Phase 3 (ยังไม่ทำ):** per-model gating — SDK ตั้ง exposure เป็น `codemode` อยู่แล้ว จึงยังไม่จำเป็น

### 1j) Polish Batch A + เก็บไฟล์หลุดจาก session อื่น (commit `f382f33`)
- session อื่นทิ้งไฟล์ไว้ (untracked): `src/system-info.js`, `scripts/selftest-system-info.js`,
  `scripts/run-unit-tests.js`, `docs/superpowers/plans/2026-11-14-polish-batch.md` (ทำครึ่งทาง),
  + spec MCP ที่ซ้ำ
- **ผู้ใช้ตัดสินใจ:** ยึดแนวที่ผมทำ — ลบ spec MCP ที่ซ้ำ, รับช่วงแผน polish แล้วทำ Batch A ให้จบ
- **เสร็จ:** A1 (CI + `npm test`), A2 (error boundary + คัดลอกข้อมูลระบบ), A3 (มีอยู่แล้ว),
  A4 (focus ring), A5 (settings inert + focus trap), A6 (tabular-nums), A7 (ปรับคำผสมภาษา)
- ไฟล์: `src/system-info.js`, `src/main.js`, `src/preload.js`, `renderer/{app.js,index.html,styles.css}`,
  `scripts/run-unit-tests.js`, `scripts/selftest-system-info.js`, `.github/workflows/ci.yml`,
  `package.json` (script `test`), `docs/superpowers/plans/2026-11-14-polish-batch.md`
- **ยืนยัน:** `npm test` (17 scripts) PASS, `node --check` ผ่าน, smoke test Electron PASS
- **เหลือ:** Batch B (bundle pi SDK), C (typography/first-run), Ops (code signing)

### 1k) Batch B — bundle pi SDK (commit `f382f33`)
- เพิ่ม `@earendil-works/pi-coding-agent@1.2.0` เป็น dependency → เครื่องใหม่เปิดแอปได้เลย ไม่ต้อง npx
- `resolveSdk()` ใหม่: **bundled** (`app/node_modules`) → env override → npx cache
  - SDK เป็น ESM-only, `exports` ไม่มี `require` → ต้อง `require` ที่ **โฟลเดอร์** (ใช้ `main`)
  - แยก logic เป็น `src/sdk-path.js` (เทสได้) + `selftest-resolve-sdk.js`
- `package.json` build: `asarUnpack` สำหรับ `@earendil-works/**` + `quickjs-wasi/**`
- **ยืนยัน:** `npm test` 18 scripts PASS, dist บิลด์สําเร็จ, installer 102→**118.7 MB**,
  `app.asar.unpacked` มี SDK; version ที่ bundle = pi-ai/agent-core 1.5.2, pi-tui 1.5.2
  (baseline npx = pi-tui 1.2.0, แอปไม่ใช้ TUI) 

### 1l) Batch C — typography + first-run (commit `f382f33`)
- **C2 (accent contrast):** เสร็จก่อนหน้าแล้วใน HEAD (`--accent: #8b74ff`, `--accent-soft`)
- **C1 (font):** ยกพื้นฟอนต์ต่ำสุดเป็น **12px** (35 จุด เลิกใช้ 9.5–11.5px) → 15 เหลือ 10 ระดับ
  — **ยังไม่ย่อเหลือ 4 ระดับ** เพราะต้องตรวจด้วยตา
- **C3 first-run empty state:** 3 ปุ่ม (เลือกโฟลเดอร์ / แชทใหม่ / ตั้งค่า) + บรรทัดบอกที่เก็บไฟล์
- **C4:** ป้ายระดับความคิดภาษาไทย (ปิด/น้อย/ต่ำ/กลาง/สูง)
- ไฟล์: `renderer/{app.js,index.html,styles.css}`
- **ยืนยัน:** `npm test` 18 PASS, smoke test Electron PASS

## 2) ขั้นถัดไปที่ตกลงไว้ (ทำต่อได้เลยเมื่อผู้ใช้สั่ง)

**สถานะล่าสุด 2026-11-16 (จบ session ที่ v0.5.0):** working tree สะอาด, `master` = `origin/master`
ทุกอย่าง commit + push แล้ว — **ไม่มีงานค้างในเครื่อง**

**ค้างรอผู้ใช้ตัดสินใจ 2 เรื่อง:**
1. **ลบ release เก่า 23 รุ่น (< 0.5.0)** — dry run ผ่านแล้ว (`would delete: 23, untouched: 1`)
   `workflow_dispatch` ใช้ไม่ได้ (GitHub ตอบ "You can't perform that action at this time")
   → สั่งผ่าน marker:
   ```bash
   git commit --allow-empty -m "chore: [prune-releases keep=v0.5.0 apply]"
   git push origin master     # รอ ~20 วิ แล้วดู Actions > Prune old releases
   ```
   (`dry-run` แทน `apply` = ลิสต์อย่างเดียว · เติมคำว่า `tags` = ลบ tag ต้นทางด้วย)
2. **ผู้ใช้ยังไม่ได้ลอง v0.5.0 ที่ติดตั้งจริง** — ตรวจว่าแถบสปอนเซอร์ 3 ตัวอย่าง
   (2:1 / 1:1 / 4:5 หมุนทุก 8 วิ) ไม่กระตุก และกดแล้วเปิดเบราว์เซอร์

**งานที่ทำเสร็จในรอบนี้ (ทั้งหมด push แล้ว):** launcher ADS ไม่มี cmd ค้าง ·
release notes = เฉพาะ "มีอะไรใหม่" ที่ผู้ใช้เห็น (ห้ามงานหลังบ้าน) · กฎเวอร์ชัน +0.0.1 ·
workflow prune releases · แก้ body ของ v0.5.0 ย้อนหลังแล้ว

**สถานะ 2026-11-15:** ไม่มีงานค้าง — `master` = `origin/master` = `81349d1`,
tag `v0.4.2` push แล้ว รอผู้ใช้ลองติดตั้ง

**สถานะ 2026-11-15:** ไม่มีงานค้าง — working tree สะอาด, `master` = `origin/master` = `81349d1`,
tag `v0.4.2` push แล้ว รอผู้ใช้ลองติดตั้ง

**รอบ build ถัดไป: v0.5.1** (กฎ 2026-11-16: +0.0.1 ต่อครั้งที่ผู้ใช้สั่ง)

จากลำดับใน `docs/review-2026-11-13.md` ที่ยังเหลือ:
- **P1:** MCP อ่าน `mcp.json` ได้แล้ว (`freepi-bridge.js` ~บรรทัด 1308 ผ่าน `sdk.createMcpExtension()`)
  แต่ยังไม่มี UI จัดการ — ผู้ใช้ยังต้องแก้ไฟล์เองหรือใช้ `free-pi-cli mcp add`
- **P2:** ตรวจซ้ำข้อหน้าจอ (ฟอนต์เล็ก/แถว usage ล้น/คำว่า "เครดิต") เพราะบางส่วนอาจจบแล้ว

**ปิดเคสแล้ว — อย่าเปิดซ้ำ:**
- P0 single-instance lock → เสร็จใน v0.2.4 (`efc866b`, §1h)
- P1 "กล่อง thinking ถูกซ่อน" → **ไม่ใช่บั๊ก** (ตรวจแล้ว 2026-11-14): `hideThinkingBlock` เป็นค่าของ
  TUI pi เอง ไม่มีผลกับ NTAPI และแอปมีปุ่ม "การคิด: <level>" (`#thinkingSelect`) พร้อมกล่อง
  "ดูความคิด" อยู่แล้ว — กล่องว่างแปลว่าโมเดล/เทิร์นนั้นไม่ส่ง reasoning มา ไม่ใช่แอปพลาด

## 3) รู้ไว้ก่อนลงมือ (บริบทกันหลง)
- โปรเจกต์ = Electron shell ห่อ pi agent ของ free-pi (ไม่ใช่ fork) — v **0.2.6**
- **มี session อื่นทำงานกับ repo นี้ได้พร้อมกัน** → เช็ก `git status`/`git diff` ก่อนลงมือทุกครั้ง
  อย่า revert งานคนอื่น และระวังเขียนทับไฟล์ที่กำลังแก้
- โครงสร้าง/คำสั่งรันบิลด์เทส/รายชื่อ provider → ดู `PROJECT.md` (ไฟล์เดียว มีครบ)
- สถานะ "ทำเสร็จแล้ว" ที่ยาว → ดู `LOG.md` กับ `git log`; อย่าเชื่อ HANDOFF เก่าโดยไม่เช็ก `git status`
- เซิร์ฟเวอร์ presence แยกที่ `presence/` (Node ล้วน ไม่มี dependency)

## 4) คำสั่งเร็ว ๆ
```bash
cd app && npm start                 # เปิดแอป
cd app && npm run dist              # บิลด์ installer -> ../dist
cd app && npm test                  # เทสต์ออฟไลน์ทั้งชุด (53 ไฟล์)
node scripts/selftest-<ชื่อ>.js     # เทสเดียว (ดูรายการใน PROJECT.md)

cd "NTAPI ADS" && npm start            # เปิดโปรแกรมเผยแพร่สปอนเซอร์
cd "NTAPI ADS" && npm test             # ออฟไลน์ (4 ไฟล์ 42 checks)
cd "NTAPI ADS" && npm run check:render # เปิด Electron จริง 25 checks
cd app && npx electron scripts/check-sponsor-layout.js  # วัดกรอบ 2:1 จริง
```

## ไฟล์อ้างอิง (เปิดเมื่อจำเป็น)
- `PROJECT.md` — สถาปัตยกรรม โครงสร้าง คำสั่ง เทส
- `LOG.md` — ประวัติงาน (ล่าสุดท้ายไฟล์)
- `docs/review-2026-11-13.md` — รีวิวเทียบ opencode (P0/P1/P2)
- `docs/superpowers/specs|plans` — สเปก/แผนรายฟีเจอร์

<!-- ===== ด้านล่างนี้คือส่วนที่ session ต้องอัปเดตก่อนปิด ===== -->

---

## ภาคผนวก: โปรโตคอลปิด session (ทำทุกครั้งก่อนจบ/ก่อน compact)
1. **`HANDOFF.md`** — อัปเดตหัวข้อ 1 (กำลังทำ/ค้าง), หัวข้อ 2 (ขั้นถัดไป), และวันที่ด้านบน
   ให้ตรงความจริง **ณ วินาทีที่ปิด session**
2. **`LOG.md`** — ต่อท้าย 1 หัวข้อ: วันที่ + ทำอะไร + ไฟล์ที่แตะ + ผลเทส + สถานะ commit
3. ถ้ามีการ commit — จด hash ลง LOG.md
4. **อย่า**อ่าน/เขียนทับ `LOG.md` ของเก่า (append-only)

## Browser control (ทำงานใน v ถัดไป — ยังไม่ปล่อย)

AI ขับ Chrome ของผู้ใช้เองได้ผ่านส่วนขยาย MV3 ของเรา (ไม่ต้องล็อกอินใหม่)

- โฟลเดอร์ส่วนขยาย: `app/browser-extension/` (แพ็กไปที่ `resources/browser-extension`)
- Extension id (pin ผ่าน `key` ใน manifest): `fnbhakfiojndenlkelamkfljofdojlba`
- พอร์ต: `127.0.0.1:51789` (loopback เท่านั้น) + รหัสจับคู่ 6 หลักใน `prefs.json` → `browserBridge.token`
- ปุ่มในแถบซ้ายข้างปุ่มภาษา: เปิด/ปิด + dialog ติดตั้ง (เปิดโฟลเดอร์ / คัดลอก `chrome://extensions` / รหัส)
- tool อ่าน (ไม่ถาม): `browser_tabs/read/screenshot/wait/scroll`
- tool เขียน (ถามอนุมัติผ่าน overlay เดิม): `browser_open/goto/click/type/fill/key/eval/close`
- audit: `<data root>/browser-audit.log` (JSONL, ตัดที่ 5 MB)
- ต้นทุน UX ที่ต้องรู้: Chrome ขึ้นแถบเหลือง "started debugging this browser" และส่วนขยายขอสิทธิ์กว้าง
- ปิดไว้เป็นค่าเริ่มต้น — จะไม่ listen จนกว่าผู้ใช้กดปุ่ม

### ยังต้องทํา (ตามคิว)
1. ทดสอบจริงกับ Chrome: โหลด unpacked → จับคู่ → สั่งเปิดเว็บ/อ่าน/คลิก

### ทดสอบกับ Chrome จริงแล้ว (ec578d2) — เจอบั๊ก 2 ตัวที่ปิดไม่ให้ใช้งานได้เลย

1. **tool เบราว์เซอร์มองไม่เห็น:** `defaultTools` ที่ส่งให้ `createAgentSessionFromServices`
   เป็น allow-list ไม่ใช่การเพิ่ม (ดู `docs/cli.md:128` ของ SDK) — `browser_*` ทั้ง 17 ตัว
   ถูก `registerTool` แล้วแต่ไม่ถูกใส่ในลิสต์ โมเดลจึงไม่เคยเห็นเลย แล้วตอบ "You didn't include a link"
   → แก้ด้วย `allBrowserToolNames()` และต่อท้าย allow-list เมื่อมี `browserBridge`
2. **ไม่รู้ว่ามีแท็บพร้อมใช้แล้ว:** system prompt ไม่เคยบอกสถานะแท็บ โมเดลจึงเรียก
   `browser_claim` ซ้ำ → ผู้ใช้เห็น dialog ทุกครั้ง หรือได้คำตอบ "การขอใช้แท็บถูกปฏิเสธ"
   ทั้งที่แท็บพร้อมอยู่ → เพิ่ม `browserBridge.claimedTab()` แล้วให้ prompt อ่านสดทุกเทิร์น
   (มีแท็บ = "ALREADY handed over" / ไม่มี = บอกวิธีมอบแท็บ)

เพิ่มกฎให้เข้าใจภาษาธรรมชาติด้วย: "ผมเปิดให้แล้ว" / "this news item" = แท็บ Chrome ของผู้ใช้
ห้ามขอให้วาง URL หรือคัดลอกข้อความถ้ามีแท็บให้อ่านได้

เทสต์กันซ้ำ: `selftest-browser-tools.js` (allow-list + description) และ
`selftest-browser-claims.js` (`claimedTab`) — ทดสอบแล้วว่าใส่บั๊กกลับไปจะ FAIL จริง

## v0.3.0 — มีอะไรใหม่

1. **Browser control** (ปิดไว้เป็นค่าเริ่มต้น) — AI ขับ Chrome ที่ล็อกอินอยู่ผ่านส่วนขยาย MV3
   - ปุ่มข้างปุ่มภาษา → เปิดใช้งาน → เปิดโฟลเดอร์ส่วนขยาย → Load unpacked → วางรหัส 6 หลัก
   - อ่าน (tabs/read/screenshot/wait/scroll) ไม่ถาม · เขียน (open/goto/click/type/fill/key/eval/close) ถามอนุมัติ
2. **auto-switch model เมื่อโควตาหมด** — DeepSeek ฟรีเท่านั้น ไล่บนลงล่าง ทำต่อจากจุดเดิม ไม่ต้องพิมพ์ซ้ำ
   - หมดทุกตัว → ข้อความบอกให้รอ reset (ไม่วนลองซ้ำ)
3. **error/แจ้งเตือน 2 ภาษา** — 80 ข้อความ EN/TH ตามปุ่มภาษา (แคตตาล็อกกลาง `src/error-messages.js`)
4. **แก้ UX**: กล่อง tool ที่พังไม่กางเอง + ไม่กระชากจอไปหา (เดิมเปิดเองแล้วเลื่อนจอ)

## v0.3.1 — ตอนอัปเดตไม่ต้องเดาแล้ว

ปัญหาเดิม: กดติดตั้ง → แอปหายไปเงียบๆ 20-60 วิ ไม่มีอะไรบอกว่าต้องเปิดเองไหม

- **overlay เต็มจอ** ก่อนปิด: "กำลังอัปเดต NTAPI… โปรแกรมจะเปิดกลับมาเอง" (รอ 4.5 วิ ให้อ่าน)
- **หน้าต่าง Loading แยกโปรเซส** (`NTAPI.exe --ntapi-splash`) — อยู่ต่อได้แม้แอปหลักปิดไปแล้ว และปิดตัวเองเมื่อแอปใหม่เริ่ม (อ่าน pid จาก `C:\NTAPI\update-splash.pid`)
  - ปิดเองได้ด้วยคลิก/Esc และมีหมดอายุ 6 นาที (กันค้างกรณีติดตั้งล้มเหลว)
- **หลังอัปเดตเสร็จ** ขึ้น toast "อัปเดตเป็น vX แล้ว" (เทียบ `prefs.lastVersion`)
- splash พูดตามภาษาที่ตั้งไว้ (อ่าน `prefs.json`)

**ทดสอบด้วยตาแล้ว (2026-11-16 08:01) — เห็นของจริงในแอป**
- รันจากซอร์ส: `app\node_modules\electron\dist\electron.exe . --user-data-dir=C:\NTAPI\outputs\downloads\ntapi-test-profile`
- **ต้องใส่ `--user-data-dir` แยก** เพราะแอปที่ติดตั้งจริง (`C:\Program Files\NTAPI\NTAPI.exe`) รันค้างอยู่
  และถือ single-instance lock ไว้ → ซอร์สรันตรง ๆ จะ `app.quit()` ทิ้งทันทีแบบเงียบ ๆ (exit 0, ไม่มี log)
  **ห้ามไปปิดตัวที่ติดตั้ง** (กติกาเหล็ก) → ใช้โปรไฟล์แยกแทน
- หลักฐานว่าแถบทำงานจริง: `C:\NTAPI\sponsor\sponsor-feed.json` (833b) + `C:\NTAPI\sponsor\sponsor-media\example-2026-11.webp` (21874b)
  ถูกสร้างเวลา 08:01 → main ดึง feed สำเร็จ **และ renderer ขอมีเดียจริง** (ไฟล์มีเดียถูกโหลดเพราะแถบวาดอยู่)
- หมายเหตุ: `DATA_ROOT = C:\NTAPI` (ไม่ใช่ userData) → cache สปอนเซอร์ใช้ร่วมกับแอปที่ติดตั้ง

**อัปเดต 2026-11-16 (รอบสอง): รองรับ 4 อัตราส่วน (ตัวเลือก A ที่ผู้ใช้เลือก)**
- ผู้ใช้เลือก: **A** (ชุดกรอบตายตัว + จองความสูง) และเอา **4 แบบ**: `2:1` (default) · `16:9` · `1:1` · `4:5`
- กลไก: NTAPI จองความสูง = กรอบที่ *สูงที่สุด* ใน feed → **ไม่กระโดดตอนหมุน** · แต่ละภาพ `object-fit: contain` จัดกลาง
  · เพดาน `max-height: 288px` กัน 4:5 กินคอลัมน์ในหน้าต่างเตี้ย
- ไฟล์: `NTAPI ADS/src/{feed,preload}.js` + `renderer/{app.js,index.html}` (dropdown อัตราส่วน + ครอปใหม่จากต้นฉบับ)
  · `app/src/sponsor.js` (`RATIOS`/`ratioOf`/`ratioValue`) · `app/src/renderer/{app.js,styles.css}`
  · เทสต์เพิ่ม: ADS `selftest-feed` 21 · NTAPI `selftest-sponsor-feed` 26 · `check-sponsor-layout` เพิ่มเคส feed ผสม
  ผล: `npm test` ADS 4/4 · NTAPI **53/53** · layout ผ่าน (heights [271,271] ratios [2,0.8])
- **เปลี่ยนลำดับ CDN**: ใช้ `raw.githubusercontent.com` ก่อน แล้ว jsDelivr เป็น fallback เพราะ jsDelivr แคช branch ได้ถึง 12 ชม.
  (ทดสอบจริง: publish แล้ว jsDelivr ยังคืนไฟล์เก่า) — ของสดต้องมาก่อน
- ปลายทางมี 3 สล็อตตัวอย่างแล้ว: 2:1 / 1:1 / 4:5 หมุนทุก 8 วิ (repo `Cheumklang/NTAPI-sponsor`)

## รอปล่อยรอบถัดไป (ยังไม่ bump) — 7 เรื่องที่ผู้ใช้แจ้ง

1. **แถบสถานะบนสุด** — ป้ายสถานะไม่ทับกันแล้ว กดค้าง/ชี้เมาส์เพื่อกางรายละเอียด กดเพื่อปักหมุด คลิกที่อื่น/Esc เพื่อปิด
2. **โฆษณา 1:1 กลับเป็น 2:1** — ผู้โฆษณาส่งอัตราส่วนไปกับประกาศแล้ว (ต้อง publish ประกาศใหม่เองถึงจะหาย)
3. **แถบโฆษณา** — เปลี่ยนป้ายเป็น "โฆษณาจาก FREEPI.AI" / "Ad from FREEPI.AI" และเอาไว้ใช้ซ้ำได้ (ปุ่มรีเฟรชเดิมเอาออก)
4. **ดับเบิลคลิกปรับความกว้าง sidebar** — ดับเบิลคลิกที่ขอบหรือพื้นว่างของ sidebar (หรือกด Home ที่ขอบ) = กลับค่าเริ่มต้น
5. **แชทขาดกลาง** — ข้อความที่ AI เคยตอบและคำสั่งล่าสุดเคยหายจากหน้าจอ (แต่ session ยังครบ) แก้แล้ว: วาดทีละข้อความ
   ข้อความที่วาดไม่ได้จะถูกข้ามไป ไม่ทำให้ทั้งแชทขาด และบันทึกไว้ใน `crash.log`
6. **AI หยุดเงียบตอนโทเคนหมด** — เคยสลับโมเดลไม่สำเร็จแล้วไม่มีอะไรขึ้นเลยหลังกด Send แก้แล้ว: สลับต่อและตอบให้จบ
7. **เปิดแชท/สลับแชทช้า** — แชทยาว ๆ ที่เคยรอหลายวินาที ตอนนี้เห็นข้อความล่าสุดทันที (ประวัติด้านบนเติมให้เองเบื้องหลัง)
8. **ข้อความในคิว** — ไม่ว่าพิมพ์มายาวแค่ไหน แต่ละบรรทัดสูงเท่ากันหมด (ตัด … ให้อ่านพอนึกออก) คิวเลยดูเรียบและสั้นลง

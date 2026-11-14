# HANDOFF — ส่งต่องานไป session ถัดไป

**อัปเดตล่าสุด:** 2026-11-14 · **v0.3.5** (`master`, tag `v0.3.5`)

> v0.3.5 รวม: สวิตช์อนุมัติ 3 ระดับ · browser agent mode · /compact เข้าคิว ·
> แถบกิจกรรมแบบข้อความ · v0.3.4 (FreePi 426 / จัดการเวอร์ชันไคลเอนต์อัตโนมัติ) รวมอยู่ในนี้แล้ว
> ดูหัวข้อ 1o (อนุมัติ) และ 1n (FreePi 426)

> นี่คือไฟล์ **"อ่านอันเดียวจบ"** ของ session ใหม่ — อ่านบนลงล่าง
> ถ้าคุณเป็น AI แล้วเพิ่งเปิดโปรเจกต์: อ่านหัวข้อ 0–3 ให้ครบก่อนแตะโค้ด
> ไฟล์อ้างอิงลึก ๆ (PROJECT/LOG/docs) ค่อยเปิดเมื่อจำเป็น ไม่ต้องอ่านทุก session

---

## 0) กติกาเหล็ก (ต้องทำก่อนแตะโค้ด)
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
- **รอบการ build/ปล่อย installer: ทุก ๆ 0.5.0** (0.3.5 → 0.4.0 → 0.5.0)
  - ระหว่าง patch **ไม่ต้อง build เอง** — ผู้ใช้กดอัปเดตในโปรแกรมได้เอง
  - **ห้าม bump เวอร์ชันเพื่อจะได้ build** — bump เป็น 0.x.0 เมื่อผู้ใช้สั่งเท่านั้น
  - **ข้อยกเว้น:** แก้เรื่องสำคัญจริง ๆ (ข้อมูลเสียหาย, ความปลอดภัย, แอปใช้งานไม่ได้,
    อัปเดตพัง) → **เสนอผู้ใช้ก่อน** จะ build หรือไม่ ห้าม build เงียบ ๆ
  - build/tag/release เมื่อถึงรอบ (0.5.0) หรือเมื่อผู้ใช้สั่งเท่านั้น
- **ห้ามอ่าน/ลิสต์ `C:\Program Files\NTAPI\`** — แม้แต่อ่านก็ไม่ต้อง
  ถ้าอยากรู้เวอร์ชันที่ติดตั้งจริง ให้ถามผู้ใช้ หรือดู `prefs.lastVersion` ใน `prefs.json`

## 1) กําลังทํา / ค้างอยู่ตอนนี้ (สําคัญสุด — อ่านก่อน)

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
- **C4:** ป้ายระดับความคิดภาษาไทย (ปิด/น้อยที่สุด/ต่ำ/กลาง/สูง)
- ไฟล์: `renderer/{app.js,index.html,styles.css}`
- **ยืนยัน:** `npm test` 18 PASS, smoke test Electron PASS

## 2) ขั้นถัดไปที่ตกลงไว้ (ทำต่อได้เลยเมื่อผู้ใช้สั่ง)
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
node scripts/selftest-<ชื่อ>.js     # เทส (ดูรายการใน PROJECT.md)
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

# HANDOFF — ส่งต่องานไป session ถัดไป

> **📌 สถานะล่าสุด (2026-11-21): ปล่อย v0.6.5 แล้ว · tree สะอาด · `master` = `origin/master`**
>
> ### ✅ ล่าสุด (2026-11-21) — **v0.6.8 ปล่อยแล้ว** · desktop control บน Windows
> - commit `e1f2b42` (adapter) + `23c6da6` (bump 0.6.8) · tag `v0.6.8` · Release run 44851010019 success
>   · asset 181,457,003 B sha256 `5e9fc9cb…73b23` · provenance seq 194 · เหลือ **v0.6.8 รุ่นเดียว** (แท็กเหลือ 1 ทั้งสองรีโป)
> - **บทเรียน (บันทึกใน AGENTS.md แล้ว):** `git push --tags` ดันแท็กเก่า `v0.6.5`/`v0.6.6` ที่ค้างในเครื่องขึ้นไปใหม่
>   → Release รันซ้ำ 2 รอบและปล่อยรุ่นเก่า (prune ลบทิ้งให้เอง) · ต่อไปใช้ `git push origin HEAD vX.Y.Z` + `git tag -d` ของเก่า
> - **รอผู้ใช้ทดสอบบน Windows:** เปิดสวิตช์ desktop → `system_windows` → `system_snapshot` → กดปุ่ม/พิมพ์ (`settext`)
>   ถ้าพังให้ดู error code จาก helper (`NO_POWERSHELL` / `NO_ACTION` / `STALE_REF` / `TIMEOUT`) + `C:\NTAPI\system-audit.log`
>
> ### 🖥️ Desktop control — Windows adapter เขียนเสร็จ (2026-11-21, ยังไม่ commit/ไม่ปล่อย)
> - เพิ่ม `src/system/uia.ps1` (UI Automation ผ่าน Windows PowerShell 5.1 — ไม่ต้องติดตั้งอะไร ไม่ต้อง rebuild native module)
>   · คำสั่งเดียวกับฝั่ง Linux: `probe` / `windows` / `snapshot --app N --max K` / `act --ref a/b/c --action click|settext --text T`
>   · ref = child-index path จาก desktop root (แบบเดียวกับ AT-SPI) · กดได้เฉพาะ element ที่ประกาศ pattern (Invoke/Select/Toggle/Expand) — **ไม่ขยับเมาส์ ไม่เดาพิกัด**
> - `src/system/windows.js` (adapter, mirrors linux.js: NO_POWERSHELL / TIMEOUT / windowsHide / asList กัน PowerShell ยุบ array)
> - `src/system/index.js` → `platform === 'win32'` คืน adapter จริง (เดิมคืน null = "ยังไม่รองรับ")
> - `src/system/helper-path.js` + `build.asarUnpack` เพิ่ม `src/system/{uia.ps1,atspi.py}` — สำคัญ: ไฟล์ใน `app.asar` นั้น powershell.exe/python3 อ่านไม่ได้
>   (บั๊กเดิมของ atspi.py ที่จะเจอเฉพาะคนติดตั้งจากตัวติดตั้ง — แก้แล้ว)
> - prompt/tool description ใช้ `DESKTOP_LABEL` (Windows/Linux desktop) แทนคำว่า Linux ตายตัว
> - `selftest-system-control.js` +18 เช็ค (windows adapter, pattern-only, ASCII ของ .ps1, asarUnpack, -NonInteractive, ฯลฯ) → `npm test` 95/95 · sara ok
> - **ยังไม่ได้รันบน Windows จริง** — ต้องทดสอบ: เปิดสวิตช์ในแผง → `system_windows` → snapshot → กดปุ่ม → settext
>
> ### 🔁 เปลี่ยนกฎ retention (2026-11-21, ผู้ใช้สั่งรอบสอง) — เหลือรุ่นเดียว
> - ลบ `v0.6.6` แล้ว (release 453331227 + tag ทั้ง `NTAPI` และ `NTAPI-releases`) → หน้า releases เหลือ **`v0.6.7`** เดียว (173 MB)
> - ตั้ง default ให้ตรงกัน: `prune-releases.yml` `keep_count=1` / `NTAPI_UPDATE_RETENTION:-1` · `main.js` `UPDATE_RETENTION = 1`
>   · `selftest-update-channel.js` ปรับเช็ค (เดิมบังคับ >= 2) · AGENTS.md เขียนกฎใหม่
> - **ผลที่ตามมา:** delta ใช้ไม่ได้อีก (ไม่มี blockmap รุ่นก่อน) → อัปเดตแต่ละครั้งโหลดเต็ม ~173 MB; โค้ด delta ยังอยู่ กลับมาใช้ได้แค่ตั้ง `keep_count=2`
> - ยังไม่ commit (จะติดไปกับรุ่นถัดไป 0.6.8) · `npm test` 95/95 · sara ok
>
> ### ✅ ล่าสุด (2026-11-21) — **v0.6.7 ปล่อยแล้ว** · `/skill` เห็นสกิลที่ติดตั้งเป็นแพ็กเกจ
> - ผู้ใช้เจอจริง: `pi install` superpowers แล้วไปอยู่ `C:\Users\NT\.pi\agent\git\github.com\obra\superpowers` → `/skill` ไม่เห็น
> - `packagedSkillDirs()` ใหม่: สแกน `<agent dir>/git/<host>/<owner>/<repo>` และ `<agent dir>/npm/node_modules/[<@scope>/]<pkg>`
>   ของทั้ง `~/.pi/agent` และ `~/.free-pi/agent` (repo เป็น root ที่ถูกสแกน 3 ชั้น → เจอ `skills/<name>/SKILL.md` และ `skills/<หมวด>/<name>/`)
> - ทดสอบกับข้อมูลจริงบนเครื่อง dev: roots 37 · สกิลที่เจอ 22 ตัว (superpowers + 9arm-skills) · `selftest-skill-scan.js` +3 เช็ค
>   (ใช้ home ปลอม ไม่พึ่งเครื่องจริง) → `npm test` 95/95 · sara ok
> - ปล่อยรุ่นแล้ว: commits `e427ff0` + `7335668` (bump 0.6.7) · tag `v0.6.7` · Release run 44849249186 success
>   · asset 181,453,353 B sha256 `41eddfea…490fe` · provenance seq 189 · prune เก็บ **v0.6.7 + v0.6.6** (แท็กเหลือ 2 ทั้งสองรีโป)
>   · delta ที่คาดหวัง 0.6.6→0.6.7: 51 block ≈ **0.77 MB** (99.6%) — รอยืนยันจาก `update.log` บน Windows
>
> ### ✅ ล่าสุด (2026-11-21) — **v0.6.6 ปล่อยแล้ว** · `/skill` ค้นให้ถูกจุดทุกค่าย
> - ผู้ใช้: "แต่ละคนใช้ AI ไม่เหมือนกัน … เน้นค้นหาให้เขาถูกจุดก็พอ" · **ไม่ต้องมีปุ่มนำเข้าสกิล** (ผู้ใช้ตัดออก: ผู้ใช้ส่วนใหญ่มือใหม่)
> - `skillRoots()` (main.js) เพิ่ม 18 โฟลเดอร์ home: `.agents`, `.claude`, `.cursor`, `.copilot`, `.gemini`, `.gemini/config`, `.continue`,
>   `.aider-desk`, `.openclaw`, `.codeium/windsurf`, `.config/{agents,crush,devin,goose}` (XDG ใช้ได้บน Linux; บน Windows ถ้าไม่มีก็ข้าม)
>   + ระดับโปรเจกต์ 8 โฟลเดอร์ (`skills`, `.agents`, `.claude`, `.pi`, `.cursor`, `.github`, `.gemini`, `.windsurf`)
>   + **ไต่โฟลเดอร์แม่ขึ้นไปถึง repo root** (สูงสุด 12 ชั้น) เหมือน SDK · dedupe แบบ case-insensitive บน Windows
> - hint ในเมนู `/skill` ตอนว่างอัปเดตให้ตรง (`skillSearchHint()`)
> - เทสต์ `selftest-skill-scan.js` +4 เช็ค (ทุกค่ายถูกค้น, ลำดับ `.agents` มาก่อน, 8 โฟลเดอร์โปรเจกต์, ไต่ถึง repo root แล้วหยุด) → `npm test` 95/95 · sara ok
>
> ### 🧹 ทำความสะอาด releases (2026-11-21, ผู้ใช้สั่งอีกรอบ)
> - releases 7 → **1** (`v0.6.5` · v0.6.4 ลบทิ้ง 173 MB) · tags รีโปนี้ 22 → **1** · tags ใน `NTAPI-releases` 22 → **1**
> - workflow `prune-releases.yml`: โหมดอัตโนมัติตอนนี้ลบ **แท็ก** ด้วย (`TAGS=true`) ทั้งในรีโปนี้และในรีโป release
> - เหตุผลที่ลบ v0.6.4 ได้: ไม่มีใครใช้ blockmap ของ 0.6.4 ทำ delta ได้อยู่แล้ว (0.6.4 ไม่มี `installer.exe` ใน cache) และรอบหน้า prune จะเก็บ 2 รุ่นให้เอง (0.6.6 + 0.6.5)
>
> ### ✅ v0.6.5 (2026-11-21) — ทำไมผู้ใช้ยังโหลดเต็ม 181 MB แล้วแก้อะไร
> - **ต้นเหตุจริง (อ่านจาก `electron-updater/out/AppUpdater.js:686`):** differential download อ่านไฟล์ติดตั้งรุ่นเก่าจาก `<updaterCacheDir>/installer.exe`
>   แต่ **ไม่มีโค้ดส่วนไหนเขียนไฟล์นั้น** — ตัวที่โหลดมาอยู่ที่ `pending/installer.exe` และถูกลบหลังติดตั้ง
>   → `fs.open(oldFile)` ล้ม → catch → **fallback โหลดเต็มทุกครั้ง** (ไม่เกี่ยวกับ blockmap ที่เราลบ/ไม่ลบ)
> - **แก้:** `main.js` `keepInstallerForNextDelta()` คัดลอก `pending/installer.exe` → `installer.exe` ตอน `update-downloaded`
>   (ครั้งหน้าจะมี oldFile ให้ diff) + `updaterCacheDir()` อ่านชื่อโฟลเดอร์จาก `app-update.yml`
> - **log:** `updater.logger` เขียนลง `<DATA_ROOT>/update.log` (ตัดที่ 512 KB) — ในแอป Windows ไม่มี console ให้ดู
> - **ผลที่คาด:** `0.6.4 → 0.6.5` ยังโหลดเต็ม (โค้ดที่ทำ copy อยู่ใน 0.6.5 ไม่ใช่ 0.6.4) · **ตั้งแต่ `0.6.5 → 0.6.6` เป็นต้นไปจึงเป็น delta**
>   · ตรวจได้ที่ `%LOCALAPPDATA%\ntapi-updater\installer.exe` (ต้องมี ~181 MB หลังอัปเดต 0.6.5) และ `C:\NTAPI\update.log` ต้องมีบรรทัด `Download block maps (old: …, new: …)`
> - asset `NTAPI-Setup-0.6.5.exe` 181,449,491 B · sha256 `845247de…7485` · Release run `44842961168` success · provenance seq 182
>
> ### ค้างอยู่จริง (ณ วันนี้)
> 1. ~~ทดสอบ delta update จริง~~ → **✅ ผู้ใช้ทดสอบบน Windows แล้ว (2026-11-21)** · **ตัดแนวทาง Linux/AppImage ออกโดยเจตนา (ผู้ใช้สั่ง 2026-11-21)** — ผู้ใช้จริงเป็น Windows ทั้งหมด เครื่อง Ubuntu มีแค่ผู้พัฒนา → ห้ามเสนอ `build.linux` / job `ubuntu-latest` ซ้ำ · การยืนยันฝั่ง asset ทำได้แค่: ทุกรุ่นต้องมี `.exe.blockmap` + `latest.yml` ครบ
> 2. **prune เก็บ 2 รุ่น (ผู้ใช้สั่ง 2026-11-21 — เดิม 20)** — เปลี่ยน default ใน workflow + `UPDATE_RETENTION = 2` ใน `main.js` + เทสต์แล้ว · trigger `workflow_run` ต่อติด แต่ยังไม่เคยลบจริงเลย (ตอนนี้ใน releases มี 7 รุ่น = 1.21 GB) · ต้องรัน prune จริงหนึ่งครั้งเพื่อให้เหลือ 2
> 3. **skill 2 ช่องโหว่ — ยังไม่ได้ลอง (ผู้ใช้ยืนยัน 2026-11-21)** — (A) `<agentDir>/npm/*/skills` ไม่ถูกสแกน (`skillRoots()`) (B) `resources.skills` / `resources.packages` ใน `settings.json` ไม่ถูกอ่าน · ตอนนี้มี Windows VM ให้ทดสอบได้แล้ว
> 4. ~~PAT ที่เคยหลุดในแชท~~ → **✅ ผู้ใช้แก้แล้ว (2026-11-21)**
> 5. ~~เอกสารเก่าใน HANDOFF ล้าสมัย~~ → **✅ กวาดแล้ว 2026-11-21** (หัวบล็อกเขียนใหม่ · บล็อก 2026-11-20 ที่เขียนว่า “ยังไม่ commit” แก้เป็นรุ่นที่ปล่อยจริง · ติดป้าย ARCHIVE ให้บันทึกเก่า)
> 6. ~~`check:sara` 228 จุด~~ → **✅ แก้แล้ว 2026-11-21** — `node scripts/check-sara-am.js --fix` → 0 จุด (12 ไฟล์: `.AGENT` 3, เอกสาร 5, `NTAPI ADS/src/renderer/app.js` 15, mockup/plan/spec 4) · `npm test` 95/95 · ADS 5/5
> 7. **ยังไม่มี adapter ควบคุมเครื่องฝั่ง Windows** — `src/system/index.js` คืน adapter แค่ linux (AT-SPI2) · แพลตฟอร์มอื่น = `UNSUPPORTED` · ผู้ใช้จริงเป็น Windows → งานที่มีค่าที่สุดถัดไป
> 8. **ระยะ 2 ของแผนอัปเดต (`nsis-web`)** — ยังไม่ทำ · ทำเมื่อตัวติดตั้ง 181 MB รับไม่ได้
>
> ### ✅ v0.6.4 ออกแล้ว (2026-11-21) — "extension ไปเว็บอื่นเองไม่ได้" + ลบ release เก่าเหลือ 2
> - commit `60eb93d` (browser) · `2b2672f` (prune 2 รุ่น) · `081c353` (สระอำ 228 จุด) · `62ad8f4` (bump) · tag `v0.6.4` · Release run `44841387074` success · provenance seq 179
> - asset `NTAPI-Setup-0.6.4.exe` 181,446,462 B · sha256 `7f3615a4…b9075` · blockmap 229,703 B `d9ec12f9…`
> - **prune ทำงานจริงแล้วครั้งแรก:** จาก 7 รุ่น (1.21 GB) → เหลือ **2 รุ่น** (`v0.6.4` + `v0.6.3`, ~364 MB) — กฎใหม่ใน `AGENTS.md`: เก็บ 2 รุ่นล่าสุดเสมอ (`keep_count` default 2, `UPDATE_RETENTION = 2`)
> - ยังต้องมีคนกดใช้จริงบน Windows: เปิดแอป → ถามให้ agent เปิดเว็บที่ไม่มีแท็บอยู่ → ควรเปิดเองได้และอ่าน/คลิกต่อได้
> - **ขนาดอัปเดตจริง 0.6.3 → 0.6.4 = ~0.89 MB** (วัดจาก blockmap จริง: 11,856 บล็อก × 15,304 B, เปลี่ยน 58 บล็อก · ที่เห็น 181 MB บนหน้า release คือไฟล์ติดตั้งเต็มสำหรับเครื่องใหม่ ไม่ใช่สิ่งที่ผู้ใช้เดิมโหลด)
> - ต้นเหตุ: (1) แท็บที่ agent เปิดเองไม่ถูกนับเป็นแท็บที่ใช้ได้ → `NOT_CLAIMED` ทันทีใน snapshot ที่ตามหลัง `open`
>   (2) prompt สั่งว่า "Work only in the tab the user handed over" + description ของ `browser_open` เขียนว่า "Requires a tab handed over first" → โมเดลไม่กล้าเปิดแท็บเอง
> - แก้: `browser-claims.js` เพิ่ม `own/disown/isOwned/lastOwned/ownedList` (`MAX_OWNED = 8`) · `browser-bridge.js` `targetFor()` รับแท็บที่ agent เปิดเอง + `rememberOwnership()` + `annotateTabs()` คืน `openedByAgent`
>   · `freepi-bridge.js` prompt + tool description ใหม่ · เทสต์ `selftest-browser-multitab.js` +12 เช็ค → `npm test` 95/95
> - **ต้องทดสอบกับ Chrome จริง:** เปิดแอปจากซอร์ส (ไม่ใช่ตัวติดตั้ง 0.6.3 ที่ยังเป็นโค้ดเก่า) → เปิด Browser chip → สั่ง "ไปเปิด example.com ให้ดูหน่อย"

> ### บริบทใหม่ (2026-11-21)
> - **มี Windows VM บนเครื่อง Ubuntu แล้ว** (`/home/nt/NT-ALL/NTVM`: `win10vm.sh` + `README.md`) → ทดสอบฝั่ง Windows ได้เองโดยไม่ต้องรอผู้ใช้
> - กฎเพิ่ม: ไฟล์ที่แตะแล้วเป็นภาษาไทย ต้องรัน `node app/scripts/check-sara-am.js --strict` ก่อนจบ
> - ~~ค่าตั้ง compaction~~ → **✅ ทำแล้ว + commit + ปล่อยใน 0.5.29** (รายละเอียด §1a)
>
> ### ✅ 1a) ค่าตั้งการย่อบทสนทนา (compaction) — เสร็จ 2026-11-20 · commit `b261c81` · อยู่ใน 0.5.29
> ปัญหาเดิม: `src/freepi-bridge.js` สร้าง `SettingsManager.inMemory({...})` แบบตายตัว → ไม่มีใครปรับกำลังย่อได้ และ `~/.pi/agent/settings.json` ไม่ถูกอ่านเลย
> - **bridge**: `sanitizeCompaction()` (กรอง boolean / safe integer 0–4,000,000 · ค่าเสียถูกทิ้ง ไม่ใช่ส่ง NaN เข้า SDK) → `options.compaction` → `SettingsManager.inMemory({ compaction })` · เพิ่ม `handle.setCompaction(enabled)` (มีผลทันทีทุกแท็บ) และ `handle.compactionSettings()` คืน `{enabled, reserveTokens, keepRecentTokens, contextWindow}` จาก `getCompactionSettings(session.model)`
> - **main**: `readCompactionPrefs()` + `COMPACTION_DEFAULT = { reserveTokens: 16384, keepRecentTokens: 20000 }` · ส่ง `compaction` ตอนสร้างแท็บ · IPC `settings:compaction` (อ่าน/เขียน · สวิตช์ยิง `setCompaction` ให้ทุกแท็บที่เปิด) · `settings:get` แนบ `compaction` มาด้วย · ปุ่ม Reset ล้าง `compaction: {}`
> - **UI**: Settings → ขั้นสูง → การ์ด “การย่อบทสนทนา” = สวิตช์ `#setCompactEnabled`, ช่องเลข `#setCompactKeep` / `#setCompactReserve`, บรรทัดอธิบาย `#compactHint` (“จะเริ่มย่อที่ประมาณ X จาก Y tokens” · ปิดอยู่ = บอกว่าอาจเจอ error บทสนทนายาวเกิน) + หมายเหตุตรง ๆ ว่า **เลข token มีผลกับแท็บใหม่ ส่วนสวิตช์มีผลทันที**
> - **i18n** EN+TH 8 คีย์ (`compactTitle/Enabled/KeepLabel/ReserveLabel/HintOn/HintOnPlain/HintOff/NewTabs`)
> - **เทสต์ใหม่** `scripts/selftest-compaction.js` (25 เช็ค: sanitizer รันจริงใน vm, wiring bridge/main/preload/UI, hint math, guard ไม่เขียนทับช่องที่กำลังพิมพ์, Reset ล้างค่า) → `npm test` **90/90** · sara สะอาด · บูตจริงด้วย prefs `compaction.enabled=false` ผ่าน (`ui ready`)
> - พฤติกรรมเริ่มต้น: ไม่มีคีย์ใน prefs = ใช้ default ของ SDK เดิมทุกอย่าง (ผู้ใช้เดิมไม่รู้สึกอะไรเปลี่ยน)
>
> ### เรื่องที่ปิดแล้วในรอบนี้
> - **✅ 0f) หลายแท็บ + ค้นหาแท็บ + อัปโหลดไฟล์ (2026-11-21)** — โจทย์ของผู้ใช้: “อัปคลิปขึ้น Facebook กับ TikTok ให้ผม”
>   - **`src/browser-claims.js`**: จาก 1 claim → `Map` หลายแท็บ (`MAX_CLAIMS = 8`, เกินแล้วปฏิเสธด้วย `TOO_MANY_TABS` ไม่ใช่ลบของเก่าทิ้ง) · `release(tabId)` รายตัว · `list()` · `leavesSite(url, tabId)` ตรวจมีรายแท็บ · `get()` ยังคืน claim ล่าสุดเพื่อความเข้ากันของโค้ดเดิม
>   - **`src/browser-bridge.js`**: `targetFor()` เปิดให้ทุกแท็บที่ hand over (แท็บอื่นยัง `NOT_CLAIMED`) · `claimedTabs()` · `checkUploadFiles()` ตรวจ absolute path / มีจริง / ไม่ใช่โฟลเดอร์ / ไม่ว่าง / สูงสุด 5 ไฟล์ · ผล `tabs-real` ถูกเติม `handedOver` + `claimed` ต่อแท็บ · tools ใหม่ `browser_find_tab` (read) และ `browser_upload` (write, ต้องอนุมัติ)
>   - **`browser-extension/background.js` (0.1.1 → 0.2.0)**: `listRealTabs` รับ `match`/`limit` · `openUrl` รับ `window:'user'` เปิดในหน้าต่างที่ผู้ใช้อยู่ (`userWindowId()`) · คำสั่งใหม่ `upload` → `DOM.requestNode` + `DOM.setFileInputFiles` (ทางเดียวที่แตะไฟล์ได้; page script ทำไม่ได้) พร้อมปฏิเสธ `NO_FILE_INPUT` ถ้าไม่ใช่ input type=file
>   - **UI**: การ์ด Browser แสดงหลายแท็บที่มือ + ปุ่ม “คืนแท็บนี้” ต่อแถว (`releaseOneTab`) · chip “มอบแล้ว” เมื่อมีอย่างน้อย 1 · i18n `browserReleaseTab` EN/TH
>   - **เทสต์ใหม่** `scripts/selftest-browser-multitab.js` (40 เช็ค) → `npm test` **91/91** · บูตจริงผ่าน (`ui ready`)
>   - **ข้อจำกัดที่ยังเหลือ**: Facebook Reels/Page composer อยู่ใน iframe หลายชั้น และ TikTok มี bot-check → agent เลือกไฟล์+กรอกแคปชัน แล้วให้ผู้ใช้กดโพสต์เอง เป็นทางที่ปลอดภัย
> - **✅ 0g) กล่องอนุมัติเครื่องมือมีปุ่ม “อนุมัติเสมอ” (2026-11-21)** — เดิมมีแค่ อนุญาต / ปฏิเสธ และการเลิกถามทำได้เฉพาะสวิตช์ในแถบข้าง
>   - ปุ่มที่สาม = อนุญาตครั้งนี้ + สลับ `approvalPolicy` เป็น `allow` ผ่าน `api.setApprovalMode` (ไม่สร้าง memory รายเครื่องมือแบบที่เคยถูกลบไป) แล้ว toast บอกว่าปิดคืนได้ที่สวิตช์
>   - i18n `allowAlways` / `approvalAlwaysDone` / `approvalNoMemory` EN+TH (บรรทัด “ถามทุกครั้ง” เดิมฮาร์ดโค้ดภาษาไทย เปลี่ยนเป็น `data-i18n`)
>   - เทสต์ใหม่ `scripts/selftest-approval-always.js` (29 เช็ค — รัน `answerApproval` จริงใน sandbox: allow-once ไม่แตะสวิตช์, always ตั้ง `allow`, deny ไม่แตะ, ไม่มี dialog ค้างก็ยังตั้งค่าได้) → `npm test` **93/93**
> - **✅ 0h) ควบคุมเครื่อง (Linux / AT-SPI2) เฟส 1 — commit `665deaf` · อยู่ใน v0.6.1**
>   - `src/system/atspi.py` — helper python3-gi 4 คำสั่ง: `probe` / `windows` / `snapshot` / `act`; เดิน tree แบบ DFS, ยุบ wrapper ที่มีลูกเดียวและไม่มีชื่อ/action, ตัด action ชื่อมีจุด (`view.zoom-in`) ทิ้ง, กัน `AMBIGUOUS_ACTION` เมื่อ element มี action > 8 และไม่ได้ระบุชื่อ, ทุก property อ่านผ่าน `safe()` เพื่อให้แอปที่ค้าง/ถูก AppArmor บล็อกไม่ทำให้ทั้งรอบพัง
>   - `src/system/linux.js` — เรียก helper ด้วย `execFile` (timeout), clamp `maxNodes` ≤ 250, แปลง error เป็น `NO_PYTHON` / `TIMEOUT` / `ERROR`; `src/system/index.js` คืน adapter ตาม platform (ตอนนี้มีแต่ linux, ที่อื่นคืน `null` = `UNSUPPORTED` ไม่แกล้งทำ)
>   - `main.js` — pref `systemControl.enabled` (ปิดโดยค่าเริ่มต้น), `systemGuard()` เป็นประตูเดียว (ปิด = `SYSTEM_CONTROL_OFF`), `systemBridge.call()` สำหรับ `windows/snapshot/act`, audit `<DATA_ROOT>/system-audit.log` (enabled/stopped/snapshot/act), IPC `system:getState` / `system:probe` / `system:setEnabled`, hotkey **Ctrl+Alt+Esc** ผ่าน `globalShortcut` (ถ้า Wayland ไม่ให้จับ จะรายงาน `hotkeyActive:false` และใช้ fallback keydown ในหน้าต่าง)
>   - tools ใหม่ 3 ตัว: `system_windows` (อ่าน), `system_snapshot` (อ่าน), `system_act` (เขียน → อยู่ใน `DEFAULT_GUARDED_TOOLS` = เด้งกล่องอนุมัติ), allow-list เฉพาะเมื่อมี `systemBridge`, system prompt block `## Desktop control`
>   - UI: ชิปในแถวเดียวกับปุ่มเลือก Folder (ใต้ปุ่มภาษา) + popover ที่ขึ้นคำเตือนเป็นประโยคก่อน + ปุ่มเปิด/หยุด + ป้าย hotkey + บรรทัดบอกเหตุผลเมื่อเครื่องยังใช้ไม่ได้; แบนเนอร์ amber ลอยล่างจอตอนเปิด พร้อมปุ่ม “หยุดทันที”; เปิดใช้งานต้องผ่านกล่องยืนยัน (`kind: 'system'`)
>   - เทสต์ใหม่ `scripts/selftest-system-control.js` (43 เช็ค รวม live probe บนเครื่องจริง) → `npm test` **94/94**
>   - **แก้ข้อความกู้คืนเทิร์นขึ้นซ้ำ (2026-11-21)**: หลังกู้คืน transcript มีทั้งข้อความที่ผู้ใช้ส่งจริงและโน้ตที่พกข้อความเดียวกัน → วาด 4 บับเบิล · `messagesForUi()` จำข้อความที่วาดแล้ว (`seenUser`/`seenAssistant` เทียบด้วย `searchKey`) ไม่วาดซ้ำ แต่ของที่หายจริงยังแสดง · 4 เช็คใหม่ใน `selftest-recovered-turn.js`
>   - **แก้ตัวเลขวิ่งทำกรอบกระดิก (2026-11-21)**: `#usagePct`/`#contextPct`/`#contextBarPct` ใส่ `min-width: 6ch` + ชิดขวา (ทศนิยมระหว่างนับเปลี่ยนความกว้างทุกเฟรม — ตัวจริงที่ผู้ใช้เห็น ไม่ใช่ตารางโทเคน) · `.tok-value` 11ch, `.tok-delta` 10ch กันแผง `max-content` เลื่อนทั้งใบ · `paintNumber(..., { flash: false })` ให้ตารางโทเคน ไม่แฟลช 6 ช่องพร้อมกัน · วัดด้วย Electron probe แล้วว่ากล่องนิ่ง
>   - **แก้ popover โดนบัง (2026-11-21)**: `#sidebar` มี `overflow-x: hidden` → panel ที่วาง absolute ในคอลัมน์ถูกตัดที่ขอบแชท เหลือเห็นครึ่งซ้าย · เปลี่ยนเป็น `position: fixed` (z-index 60, ไม่ถูก clip โดย overflow ของ ancestor) + `placeSysPanel()` คำนวณจาก rect ของชิปและ clamp ให้อยู่ในจอ, ผูกกับ `resize` และ scroll ของ sidebar · วัดจริงด้วย Electron probe: ชิป right=176 → panel left=186 right=454 ในหน้าต่าง 1236 = เห็นครบ
>   - **สถานะตัวเลข**: count 1200 ms + ทศนิยมระหว่างวิ่ง + flash `.num-pop` ตอนถึงค่า, poll context ทุก 800 ms เฉพาะตอน busy, สวิตช์ใน Settings (`setNumberFx`, localStorage `ntapi.numberFx`) → เทสต์ `selftest-live-numbers.js` (30 เช็ค)
>   - **`system_screenshot` (2026-11-21)**: ถ่ายด้วย `webContents.capturePage()` ของ Electron เอง (เครื่องนี้ไม่มี grim/scrot; GNOME DBus Screenshot ตอบ AccessDenied) → ระบุ app อื่นได้ `NOT_CAPTURABLE` พร้อมเหตุผล, audit `event:'screenshot'`; โมเดลที่ดูภาพได้รับ `type:'image'` ถ้าไม่ได้เซฟลง `imagesDir` คืน path · ตอนนี้มี 4 tools: windows/snapshot/screenshot/act (`system_act` ตัวเดียวที่ guarded)
>   - **แผงสถานะไม่ถูกแถวบนลาก (2026-11-21)**: `.status-popover` เดิม `position:absolute; left:50%; translateX(-50%)` อยู่ในกล่อง pill → ความกว้างแถวบนเปลี่ยน (เครดิตหาย/provider โผล่) ลากแผงทั้งใบ วัดจากคลิป mp4 ได้ 117px/2 เฟรม → เปลี่ยนเป็น `position:fixed` + `placeStatusPopover()` วัดครั้งเดียวตอนเปิด (clamp ในจอ) + resize เท่านั้น · probe ยืนยันแผงนิ่ง 542/85/288px
>   - **กล่องความคิดไม่ยุบเอง (2026-11-21)**: `renderActiveTab()` ล้าง transcript แล้ววาดใหม่จาก state ทุก history event ระหว่างเทิร์น และสาขา `m.thinking` ตั้งกล่องยุบเสมอ กล่องที่เปิดไว้อ่านจึงหาย 1-2 เฟรม (เห็นในเฟรม 9-10 / 11-12 ของคลิปผู้ใช้) → เก็บสถานะด้วย `let thinkingOpen` ใช้ทั้งตอน `addMessage()` และตอน redraw
>   - **ตัวเลขไม่แว๊บหายก่อนเริ่มวิ่ง (2026-11-21)**: `paintContext(state.stats || null)` ถูกเรียกทุก state push — payload ที่ไม่มี `stats` ทำให้เขียน "—" ทับเลขจริง 1 เฟรม → เพิ่ม `{ clear }`: ไม่ล้างค่าที่มีอยู่เพราะ payload ว่าง, ล้างเฉพาะวาดครั้งแรกกับตอนสลับแชท · กฎเดียวกันกับตารางโทเคน (`list.dataset.tab`) · 4 เช็คใหม่ใน `selftest-live-numbers.js`
>   - **v0.6.1 ออกแล้ว (2026-11-21)**: commit `665deaf` (โค้ด) + `797a71d`/`a8c47d2` (ledger) · tag `v0.6.1` · Release run `44787120528` success (tag push ไม่ทริกเกอร์ ต้องยิง `workflow_dispatch` ref `v0.6.1`) · asset `NTAPI-Setup-0.6.1.exe` 181,440,016 B sha256 `6e26aa74…` · provenance seq 166 · `npm test` 95/95, sara 228 เดิม
>   - **i18n การอนุมัติ (2026-11-21)**: `#approvalLabel` / สามตัวเลือก / `#approvalNote` / `#approvalBtnText` เป็นไทยฝังใน HTML (ไม่มี data-i18n) → เพิ่ม `data-i18n` + คีย์ `approvalShortAsk|Allow|Deny`, `approvalOptAsk|Allow|Deny`, `approvalNote` ทั้ง EN/TH, chip อ่านผ่าน `APPROVAL_SHORT` + `t()` · probe สแกน U+0E00–U+0E7F ทั้งหน้า: เหลือแต่ชื่อเจ้าของ, "สงวนลิขสิทธิ์", ป้าย "ไทย" (ตั้งใจ)
>   - **v0.6.2 ออกแล้ว (2026-11-21)**: `7c9b186` + ledger `1a505c2` · tag `v0.6.2` · Release run `44788780873` success (CI `44788760407` success) · asset `NTAPI-Setup-0.6.2.exe` 181,442,378 B sha256 `858a6cc6…701d` · provenance seq 168 · **ขนาดอัปเดต**: main เก็บ `size` ตอน `update-available` (ขนาดเต็มก่อนโหลด) และ `got`/`total` จาก `download-progress` (ขนาด delta จริง) → การ์ด Settings: "ตัวติดตั้ง 173 MB" → "2.3 จาก 12.4 MB (35%)" → "ดาวน์โหลดแล้ว 12.4 MB"; การ์ดบังคับอัปเดตบอกขนาดเต็มในประโยค (`forcedUpdateSize`) · 3 เช็คใหม่ใน `selftest-update-channel.js`
>   - **ข้อจำกัดที่รู้แล้ว**: Wayland ย้าย pointer ไม่ได้ (กดได้เฉพาะ control ที่ประกาศ action), หน้าต่าง Chromium/Electron (รวม NTAPI เอง) เปิดเผย tree แค่ 2 node จนกว่าจะเปิด renderer accessibility, ยังไม่มี `system_screenshot` และยังไม่มี adapter ฝั่ง Windows
> - v0.5.28 ปล่อยแล้ว: CI ✅ / Release (windows-latest) ✅ / Prune ✅ · assets `NTAPI-Setup-0.5.28.exe` 181,353,582 B sha256 `99ea64dd…0bb9` + blockmap + latest.yml · provenance seq 155 + anchor + verify OK
> - push ติดเพราะ PAT ไม่มี scope `workflow` → แก้โดยเปิด scope เพิ่มที่ token “NTAPI release” (ไม่ต้องสร้างใหม่ ค่าเดิมใช้ได้)
> - ขนาดตัวติดตั้งโต 113 MB → 181 MB จาก `differentialPackage: store-asar` (คาดไว้แล้ว) · รุ่นถัดไปอัปเดตควรเหลือ KB–2 MB
> - GitHub Desktop บน Ubuntu: รายการ repo ไม่ sync ผ่านบัญชี (เก็บใน `%APPDATA%\GitHub Desktop\repositories.json` บน Windows) → ต้อง **File → Add Local Repository → `/home/nt/NT-ALL/NTAPI`** (อย่า clone NTAPI ซ้ำ) · `NTAPI-releases` clone ได้ (759 KB) แต่ห้าม commit asset เข้า git เอง
>
> ---
> 📚 **ARCHIVE (ใหม่ → เก่า)** — ทุกหัวข้อด้านล่างคือบันทึก ณ เวลานั้น คำว่า “ยังไม่ commit / ยังไม่ปล่อยรุ่น” ที่ยังเหลืออยู่ **ไม่ใช่สถานะปัจจุบัน** · สถานะจริงดูจากหัวไฟล์นี้, `LOG.md` และ `git log`
> ---
>
> **✅ (2026-11-20) อัปเดตไม่กวนระหว่างใช้งาน + ข้อความแดงกดปิดได้ — commit `1238a2d` · ปล่อยใน v0.5.28**
>
> **1) แจ้งเตือนอัปเดตเฉพาะตอนเปิดโปรแกรม และตอนกดปิด**
> - `app/src/main.js`: `updateState.origin` = `startup` / `manual` / `timer` — เฉพาะ startup (ตรวจครั้งแรกหลังเปิด 30 วิ) และ manual (กด “ตรวจหาอัปเดต” ใน Settings) เท่านั้น ที่การ์ดบังคับอัปเดตขึ้นได้ · timer ทุก 6 ชม. โหลด delta ได้เงียบ ๆ แต่ **ไม่มีการ์ด ไม่มี toast**
> - `app/src/renderer/app.js` `paintForcedUpdate()`: เพิ่มเงื่อนไข `origin !== 'timer'`
> - ตอนกดปิดหน้าต่าง (`win.on('close')`): ถ้ามี `available`/`ready` → `dialog.showMessageBox` ถาม (3 ปุ่ม: ติดตั้งแล้วรีสตาร์ต / ปิดโปรแกรม / ยกเลิก) · ไม่ถามซ้ำตอน installer สั่งปิดเอง (`installing` ไม่ถูกนับ) · ใช้ `startUpdateInstall()` ตัวเดียวกันกับการ์ดและปุ่มใน Settings (ย้าย logic ออกมาจาก IPC handler)
> - ผลพลอยได้: `app:updated` เดิมเป็น channel ตาย (preload มี, main ไม่เคยส่ง) — ตอนนี้ main เขียน `prefs.updatedFrom` ตอนติดตั้ง แล้วส่ง `app:updated` หลัง UI พร้อม → ขึ้น toast + การ์ดขอบคุณพร้อม QR ค่ากาแฟ
>
> **2) ข้อความแดงปิดได้ + หายเองใน 15 วิ**
> - `appendErrorBanner()` (แบนเนอร์แดงใน transcript): กด/Enter/Space เพื่อปิด, จางหายใน 220 ms, และ `ERROR_BANNER_MS = 15_000` ปิดเอง · มี `title` บอกว่ากดได้ (i18n `errorBannerClose`)
> - `showCrashNotice()` (แบนเนอร์แดงเหนือช่องพิมพ์): `crashNoticeTimer` 15 วิ ปิดเอง · ปุ่ม Close เคลียร์ timer
> - `styles.css`: `.error-banner` เป็น `cursor: pointer` + `transition: opacity` + `.error-banner.out` / hover / focus-visible
> - เทสต์: `scripts/selftest-error-ux.js` เพิ่ม 10 เช็ค (กดปิด, 15 วิ, คีย์บอร์ด, title, fade, CSS, crash banner), `selftest-update-channel.js` เพิ่มเช็ค origin/close prompt, `selftest-update-handoff.js` ปรับให้อ่าน `startUpdateInstall()` (logic ย้ายที่)
> - `npm test` **89/89**
>
> **✅ (2026-11-20): ระยะ 1 ของแผนอัปเดตทำแล้ว — อัปเดตเล็กได้แล้ว — ปล่อยใน v0.5.28**
>
> - **ปัญหาเดิม:** ทุกอัปเดตโหลดเต็ม ~113 MB เพราะ (1) prune ลบ release เก่า → blockmap ของรุ่นเดิมหาย (2) payload เป็น solid compressed member → แก้ JS บรรทัดเดียว block เพี้ยนเกือบทั้งก้อน (3) แอปไม่เคยตรวจอัปเดตเอง
> - **แก้ `app/package.json`:** `build.nsis.differentialPackage = "store-asar"` → `resources/app.asar` ถูกเก็บแบบไม่บีบอัดและตัด block ละเอียด 4/8/16 KiB (เอกสาร electron-builder วัดจริง: แก้ 1 บรรทัดในแอป 32 MB = โหลด 0.2%) · **ผู้ใช้ยอมรับแล้ว**ว่าตัวติดตั้งรุ่นแรกจะใหญ่ขึ้น ~+20–60 MB เป็นการจ่ายครั้งเดียว
> - **แก้ `.github/workflows/prune-releases.yml`:** เพิ่ม input `keep_count` (default **2** = ล่าสุด + ก่อนหน้า → blockmap รุ่นเดิมยังโหลดได้) · `keep=<version>` เดิมยังใช้ได้ (override) · ปฏิเสธ `keep_count < 2` และปฏิเสธ version ที่ไม่มี release · ทดสอบ logic ด้วย fixture 4 รุ่นแล้ว (count=2/3, count=1 ถูกปฏิเสธ, keep=v0.5.25, keep=bogus ถูกปฏิเสธ)
> - **แก้ `app/src/main.js` `setUpdates()`:** `autoDownload = true` (เดิม false) · `updater.logger = console` (เห็นบรรทัด `Download block maps (old: …, new: …)` = รู้ว่า delta ทำงาน) · ตรวจครั้งแรกหลังเปิด 30 วิ + ทุก 6 ชม. ด้วย timer ที่ `unref()` · background check ที่ล้มเหลว **ไม่ขึ้น error ในแผง** (แค่ `console.warn`) แต่ปุ่มกดเองยังรายงาน error
> - **แก้ `app/src/renderer/app.js`:** `updateIdle` ใหม่ (ไทย: “ระบบตรวจหาอัปเดตเองทุก 6 ชั่วโมง” / EN: automatic every 6 hours) · แก้สระอำผิด 24 จุดในไฟล์นี้ (ข้อความที่ผู้ใช้เห็น) · **ปุ่มยังมีชุดเดิม** (ตรวจ/ดาวน์โหลด/ติดตั้ง) — ผู้ใช้ไม่ต้องเลือกเล็กหรือใหญ่ ระบบเลือก delta เอง
> - **เทสต์ใหม่ `app/scripts/selftest-update-channel.js`** (14 เช็ค: store-asar, blockmap ถูกอัปโหลด, autoDownload, timer+unref, keep_count=2, ข้อความ UI) ลงทะเบียนใน `run-unit-tests.js` → `npm test` **89/89**
> - **✅ ปิดแล้ว:** commit → bump 0.5.28 → push → tag → CI เขียว (รายละเอียดหัวข้อ “ปล่อย v0.5.28”)
> - **คาดการณ์รอบแรกหลังปล่อย:** ผู้ใช้ยังโหลดเต็ม 1 ครั้ง (block ของรุ่นเก่าไม่ตรงกับสคีมาใหม่) — ตั้งแต่รุ่นถัดไปจะเป็นหลัก KB–2 MB · ถ้าแก้ dependency ใหญ่ (เช่นอัป pi SDK) delta จะโตตามจริง
> - **ถ้าตัวติดตั้งใหญ่เกินรับได้:** ไปต่อระยะ 2 (`nsis-web`: stub ~2–3 MB + แพ็กเกจแอปแยก) — ยังไม่ทำ
>
> **⚠️ ล่าสุด (2026-11-20): เทสต์ 2 ตัวที่ fail บน Linux แก้แล้ว → `npm test` 88/88**
>
> - **ต้นเหตุ:** เทสต์เขียนสมมุติฐานแบบ Windows ไว้ในตัวเทสต์เอง ไม่ใช่บั๊กของโค้ด
>   · `selftest-session-paths.js` เคส `C:\Users\cheum` คาดว่าได้ `cheum` (win32 ตัดชื่อผู้ใช้ออก)
>     แต่บน POSIX สตริงเดียวกันกลายเป็น segment เดียว → ได้ `Users-cheum`
>   · `selftest-session-marks.js` เคส “ไฟล์เดียวกันสะกดต่างกัน” ใช้ `C:/...` กับ `C:\...`
>     ซึ่งบน Linux เป็นคนละไฟล์จริง ๆ (แบ็กสแลชเป็นอักขระธรรมดา)
> - **แก้ (เฉพาะไฟล์เทสต์ ไม่แตะโค้ดจริง):**
>   · paths — เคสไดรฟ์เปล่าแยกตาม `process.platform` (win32 = `cheum`, POSIX = `home-cheum` ตาม fallback)
>     และเพิ่มเคส POSIX `/srv/app/cheum` → `cheum`
>   · marks — เปลี่ยนไปใช้การสะกดที่พกพาได้ (`sub/..` ยุบด้วย `path.resolve` ทุกแพลตฟอร์ม)
>     แล้วเก็บเคส `toUpperCase()` + สลับสแลชไว้ในบล็อก `if (process.platform === 'win32')`
> - **CRLF noise ปิดจบแล้ว:** `git ls-files --eol` = 392 `i/lf` + 22 `i/-text`, ไม่มี `i/crlf` เลย
>   (`.gitattributes` `* text=auto eol=lf` ทำงานแล้ว) → งานค้างข้อนี้ไม่ต้องทำอะไรต่อ
> - ~~ค้าง: revoke PAT ที่เคยพิมพ์ในแชท~~ → **✅ ผู้ใช้แก้แล้ว 2026-11-21**

> **⚠️ ล่าสุด (2026-11-20 · Ubuntu 26.04): ผู้ใช้ใช้ Ubuntu เท่านั้น + แก้บั๊ก “ข้อความหายตอนโควต้าหมด”**
>
> - **แพลตฟอร์มตอนนั้น: Ubuntu เท่านั้น (ไม่มีเครื่อง Windows แล้ว)** — ⚠️ ล้าสมัย: 2026-11-21 ผู้ใช้ยืนยันว่า **ผู้ใช้จริงเป็น Windows ทั้งหมด** และตอนนี้มี Windows VM บน Ubuntu ใช้ทดสอบได้แล้ว
> - **build Windows installer บนเครื่องนี้ไม่ได้:** ไม่มี `wine` ในระบบ และ build config เป็น `win/nsis` → การปล่อยรุ่นต้องผ่าน CI เท่านั้น
>   (`release.yml` รันบน `windows-latest` และอัปโหลดขึ้น public repo `Cheumklang/NTAPI-releases` เมื่อ push tag `v*` → electron-updater ของผู้ใช้เห็นเอง)
> - **push จากเครื่องนี้ยังไม่ได้:** ไม่มี credential ใด ๆ — ไม่มี `gh`, ไม่มี `~/.git-credentials`, ไม่มี SSH key ส่วนตัว (มีแต่ `~/.ssh/authorized_keys`) → `git ls-remote origin` ถาม username
>   · ต้องให้ผู้ใช้ใส่ PAT (https) หรือ SSH key ก่อน จึงจะ commit+push+tag ได้
> - git identity ตั้งไว้แล้ว: `Chanathip Cheumklang <cheumklang@gmail.com>` (บันทึกเก่าที่ว่า “ยังไม่ได้ตั้ง” ล้าสมัยแล้ว)
> - **บั๊กที่แก้แล้ว (→ ปล่อยใน v0.5.24):** โควต้าหมด/context overflow → SDK เรียก `_omitRecoveryAttempt()` (เขียน `context_edit` = null ทับ assistant + tool results) แล้วตามด้วย auto-compaction
>   → `session.messages` (ต้นทางของทั้ง transcript และ request ถัดไป) ไม่มีทั้งคำถามและคำตอบที่สตรีมไปแล้ว ผู้ใช้เห็นข้อความหาย และ AI องค์ถัดไปทำงานต่อไม่ได้
>   · แก้ใน `app/src/main.js`: `tab.turnDraft` เก็บคำของผู้ใช้ + text/thinking/tools ระหว่าง turn · `recoverInterruptedTurn()` ตรวจหลัง settle ว่าของหายจาก projection จริงไหม แล้วเขียนกลับเข้า session เป็น custom message `ntapi.interrupted-turn` (อยู่ใน LLM context) · `messagesForUi` วาดกลับเป็น 2 bubble เดิม · ไม่กู้เมื่อผู้ใช้กด Stop/take-back
>   · `app/src/preload.js` + `app/src/renderer/app.js`: ช่องใหม่ `agent:recovered` → repaint ทันที
> - **ปล่อยรุ่น v0.5.24 แล้ว (2026-11-20):** push master + tag `v0.5.24` → CI `release.yml` บน windows-latest เขียว · release ขึ้น `Cheumklang/NTAPI-releases` (Setup 118,341,167 bytes · latest.yml 342 bytes · blockmap 124,796 bytes) · `provenance.js verify` ผ่านหลัง `record-release` + `anchor`
> - **กับดักที่เจอตอนปล่อยรุ่น (จดไว้):**
>   · `secrets.RELEASE_TOKEN` หมดอายุ → step `Publish release assets` fail ด้วย `Bad credentials` (build ผ่านหมด) แก้โดยอัปเดต secret ผ่าน sealed box (`crypto_box_seal` จาก `libsodium23` ในเครื่อง — ไม่มี pip/pynacl) แล้ว `POST /actions/runs/<id>/rerun-failed-jobs`
>   · CI `provenance` job fail เพราะไฟล์ `PROVENANCE/sessions/2026-11/*.md` 2 ไฟล์ค้างไม่ได้ commit → ต้อง commit ให้ครบก่อน push
>   · `git push` จาก Ubuntu: username ต้องเป็น `cheumklang` (ไม่ใช่ email) และ password ต้องเป็น PAT (ไม่ใช่รหัสบัญชี) — และการวางทั้งบล็อกทีเดียวทำให้ `read -rs` กินบรรทัดถัดไปเป็นค่า (token ว่าง)
> - **⚠️ ค้างเรื่องความปลอดภัย:** PAT ที่ใช้ push ถูกพิมพ์ในแชทแล้ว → ควรรีโวคที่ GitHub Settings → Developer settings แล้วสร้างใหม่ จากนั้นอัปเดต secret `RELEASE_TOKEN` + `git config --global credential.helper store` ใหม่
> - `npm test` บน Linux: **85/87 ผ่าน** · 2 ตัว FAIL เฉพาะแพลตฟอร์ม (`selftest-session-paths.js`, `selftest-session-marks.js` — เทสต์สมมุติ path แบบ Windows) ยังไม่แก้
> - **✅ ค้างทั้ง 4 ข้อปิดแล้ว:** credential ตั้งแล้ว · CRLF renormalize แล้ว (`git ls-files --eol` ไม่มี `i/crlf`) · เทสต์ 2 ตัวแก้แล้ว (88/88) · bump + tag ปล่อย v0.5.24 แล้ว
> - **ลำดับปล่อยรุ่นที่ถูกต้อง:** commit โค้ด → `node app/scripts/provenance.js record-commit` แล้ว commit ledger (`internal: บันทึกหลักฐานหลัง commit`) → bump version → push master → `git tag v0.5.24 && git push origin v0.5.24` → รอ CI → `provenance.js record-release 0.5.24 --asset …` + `anchor` + `verify` (CI รัน `provenance.js verify` จึงข้าม ledger ไม่ได้)

> **⚠️ ล่าสุด (2026-11-20): ย้ายมาทำบน Linux — เปิดแอปจากซอร์สได้แล้ว**
> - ผู้ใช้ย้ายเครื่องเป็น Ubuntu 26.04 (GitHub Desktop ไม่มีเวอร์ชัน Linux — เลิกพัฒนาแล้ว) → ทำงานต่อผ่าน git CLI/แชท · ยังไม่ได้ตกลงวิธี review commit (เสนอ gh CLI / VS Code / lazygit ยังไม่ได้เลือก — ตั้งชื่อ/อีเมล git ยังไม่ได้)
> - `node_modules` copy มาจาก Windows → ลง electron binary ลินุกซ์ใหม่ (`node node_modules/electron/install.js`) + `npm start` เปิด UI ได้แล้ว (`splash closed: ui ready`) · เปิดแบบ dev ด้วย `ELECTRON_DISABLE_SANDBOX=1` เพราะตั้ง chrome-sandbox 4755 ไม่ได้ (sudo ต้องรหัส)
> - `npm test` บน Linux: 87 scripts รันครบ exit 0 · **มี 2 เช็ค FAIL เฉพาะแพลตฟอร์ม** — เทสต์สมมุติ path แบบ Windows (`C:\Users\cheum` + case-insensitive) เทสต์เขียนคาดว่าเป็น win32 ขณะที่โค้ดจริงแยก platform อยู่แล้ว · ยังไม่แก้ รอผู้ใช้สั่ง
> - งานค้างเดิม: CRLF noise ~90 ไฟล์ (ยังไม่ renormalize เป็น LF) · git identity (user.name/email) · การตัดสินใจว่าเทสต์ 2 ตัวจะปรับให้รันบน Linux ได้หรือข้าม
> - **exe ผู้ใช้ Windows ไม่โดนแตะ** — CI กับ build config (`win/nsis`) ยังเหมือนเดิม การย้ายเครื่องเป็นแค่การตรวจงานเท่านั้น

> **⚠️ ล่าสุด (2026-11-18): v0.5.23 — ส่วนขยายเบราว์เซอร์ไม่เด้ง `about:blank` เองแล้ว + เขียนกฎ bash ใหม่**
> - **อาการที่ผู้ใช้เจอ:** Chrome เปิดหน้าต่าง `about:blank` เองบ่อย ๆ ระหว่างที่ agent ทำงาน
> - **ตนเหตุ:** `agentWindowId` เก็บในหน่วยความจำเท่านั้น — MV3 service worker ถูกพักทุก ~30 วิ
>   → ตื่นมาคิดว่า "ยังไม่มีหน้าต่าง" แล้วสร้างใหม่ทุกรอบ · เสริมอีกชั้น: `listTabs` (อ่านอย่างเดียว) ก็เรียก `ensureWindow()`
> - **แก้ (`app/browser-extension/background.js`):** เก็บ id ลง `chrome.storage.session` ·
>   แยก `findWindow()` (หาอย่างเดียว) ออกจาก `ensureWindow()` (สร้างเฉพาะตอนเปิดหน้า) ·
>   `listTabs`/`resolveTab` ไม่สร้างหน้าต่าง → ใช้หน้าต่างที่ผู้ใช้กำลังใช้ · `open` สร้างหน้าต่างพร้อม URL เลย ·
>   `windows.onRemoved` เคลียร์ id ที่เก็บไว้ · `manifest.json` → 0.1.1
> - **เทสต์:** เพิ่ม 4 ข้อใน `scripts/selftest-browser-extension.js` (ไม่สร้างหน้าต่างตอน list · เก็บ id · ใช้ซ้ำ) → `npm test` **87/87**
> - **ปล่อยรุ่น:** `v0.5.23` CI เขียว · `latest.yml` = 0.5.23 · Setup 118,339,105 bytes ·
>   prune เหลือรุ่นเดียว (v0.5.22 → 404) · PROVENANCE record-release + anchor + verify OK
> - **ค้าง:** ไม่มี — ทุกอย่าง commit + push แล้ว (`eac095a` · `11b373c` · `3c2c21e`) · `verify` = `OK 126 entries`
> - **ผู้ใช้ทำแล้ว:** รีโหลดส่วนขยายที่ `chrome://extensions` (ขึ้น 0.1.1) — รอตรวจว่าหน้าต่างไม่เด้งซ้ำ
> - **ขั้นถัดไปของผู้ใช้:** เปิด `chrome://extensions` → กดรีโหลดการ์ด NTAPI Browser Bridge (ต้องขึ้น 0.1.1)


> **⚠️ ล่าสุด (2026-11-17): v0.5.22 — ขยายกล่อง “ก่อนเริ่มใช้งาน” ให้ข้อความไม่ตัดบรรทัด**
> - **อาการ:** สลับ ไทย ↔ EN แล้วข้อความเกริ่นขึ้น 2 บรรทัด กล่องสูงขึ้น/เตี้ยลง ปุ่มล่างขยับไปมา
> - **ต้นเหตุ:** `.terms-dialog { max-width: 640px }` — พื้นที่ใช้ได้จริง 600 px
>   แต่ประโยคเกริ่นวัดจริงได้ ไทย 675 px / อังกฤษ 754 px → ตัดบรรทัดทั้งคู่
> - **แก้ (`app/src/renderer/styles.css`):** `max-width: min(920px, 92vw)` (กว้างขึ้น 280 px)
>   · คง `min-height: 300px` + `.dialog-actions { margin-top: auto }` กันปุ่มขยับขึ้นลง
> - **วัดผลหลังแก้ (ผ่าน CDP `Runtime.evaluate` + `Range.getClientRects`):**
>   ไทย 1 บรรทัด (675 px), อังกฤษ 1 บรรทัด (754 px), การ์ด 920 px เหลือ slack 126 px
> - **ทำไมไม่เลือกย่อข้อความ:** ข้อความเกริ่นเป็นถ้อยคำทางกฎหมาย ไม่อยากตัดถ้อยคำ
> - **เทสต์:** `npm test` **87/87**
> - **เวอร์ชัน:** `0.5.22` · prune เก็บรุ่นเดียว

> **⚠️ ก่อนหน้า (2026-11-17): v0.5.21 — สลับภาษาได้ในกล่อง “ก่อนเริ่มใช้งาน” + ภาษาเริ่มต้นตาม Windows**
> - **ปัญหา:** กล่องข้อกำหนดทับทั้งหน้าจอ ปุ่มสลับภาษาอยู่ข้างหลัง → คนที่อ่านอังกฤษไม่ออกติดอยู่ตรงนั้น
>   และเครื่องใหม่เปิดเป็นอังกฤษเสมอ (`lang: prefs.lang === 'th' ? 'th' : 'en'`)
> - **แก้ (`app/src/renderer/index.html` + `app.js` + `styles.css`):**
>   ชิป `ไทย` / `EN` มุมขวาบนของการ์ด (`#termsLangTh` / `#termsLangEn`, `aria-pressed`)
>   · `paintTermsLang()` เรียกใน `showTerms()` และ `applyLanguage()` · สไตล์ `.terms-lang-btn[aria-pressed="true"]`
> - **แก้ (`app/src/main.js`):** `initialLang(prefs)` — ใช้ `prefs.lang` ถ้ามี ไม่งั้นดู `app.getLocale()`
>   เริ่มต้นด้วย `th` → ไทย, locale อื่นทั้งหมด → อังกฤษ (มี try/catch กัน boot พัง)
>   · **ผู้ใช้ตัดสินใจ 2026-11-17: คงค่าเริ่มต้นตามระบบไว้** (ไม่บังคับไทยทุกเครื่อง) เพราะชิปในกล่องทำงานดี
> - **ข้อเท็จจริงที่เจอตอนทดสอบ:** เครื่องผู้ใช้ `Get-Culture = en-US` แต่ Windows display language = `th-TH`
>   → `app.getLocale()` คืน `en-US` จึงเปิดเป็นอังกฤษตามระบบ (ยืนยันด้วยภาพหน้าจอ + PowerShell)
> - **เทสต์:** `scripts/selftest-first-run-lang.js` (ใหม่ 13 เช็ค) ลงทะเบียนใน `run-unit-tests.js` → **87/87**
> - **เวอร์ชัน:** `0.5.21` · prune เก็บรุ่นเดียว

> **⚠️ ล่าสุด (2026-11-17): v0.5.21 — สลับภาษาได้ในกล่อง “ก่อนเริ่มใช้งาน” + ภาษาเริ่มต้นตาม Windows**
> - **ปัญหา:** กล่องข้อกำหนดทับทั้งหน้าจอ ปุ่มสลับภาษาอยู่ข้างหลัง → คนที่อ่านอังกฤษไม่ออกติดอยู่ตรงนั้น
>   และเครื่องใหม่เปิดเป็นอังกฤษเสมอ (`lang: prefs.lang === 'th' ? 'th' : 'en'`)
> - **แก้ (`app/src/renderer/index.html` + `app.js` + `styles.css`):**
>   ชิป `ไทย` / `EN` มุมขวาบนของการ์ด (`#termsLangTh` / `#termsLangEn`, `aria-pressed`)
>   · `paintTermsLang()` เรียกใน `showTerms()` และ `applyLanguage()` · สไตล์ `.terms-lang-btn[aria-pressed="true"]`
> - **แก้ (`app/src/main.js`):** `initialLang(prefs)` — ใช้ `prefs.lang` ถ้ามี ไม่งั้นดู `app.getLocale()`
>   เริ่มต้นด้วย `th` → ไทย, locale อื่นทั้งหมด → อังกฤษ (มี try/catch กัน boot พัง)
>   · **ผู้ใช้ตัดสินใจ 2026-11-17: คงค่าเริ่มต้นตามระบบไว้** (ไม่บังคับไทยทุกเครื่อง) เพราะชิปในกล่องทำงานดี
> - **ข้อเท็จจริงที่เจอตอนทดสอบ:** เครื่องผู้ใช้ `Get-Culture = en-US` แต่ Windows display language = `th-TH`
>   → `app.getLocale()` คืน `en-US` จึงเปิดเป็นอังกฤษตามระบบ (ยืนยันด้วยภาพหน้าจอ + PowerShell)
> - **เทสต์:** `scripts/selftest-first-run-lang.js` (ใหม่ 13 เช็ค) ลงทะเบียนใน `run-unit-tests.js` → **87/87**
> - **เวอร์ชัน:** `0.5.21` · prune เก็บรุ่นเดียว

> **⚠️ ล่าสุด (2026-11-17): v0.5.20 — แก้ปุ่ม “แนบไฟล์ในคิว” ที่ขึ้นชื่อคีย์ดิบ**
> - **อาการ:** กดแก้ไขคิวแล้วปุ่มแนบไฟล์ขึ้น `queueAttach` (ชื่อคีย์) แทนข้อความไทย
> - **ต้นเหตุ:** ใช้ `t('queueAttach')` / `t('queueAttachTitle')` / `t('queueRemoveImage')`
>   แต่ **ไม่มีคีย์นี้ในพจนานุกรมทั้งสองภาษา** (ของอังกฤษก็ขึ้นชื่อคีย์เหมือนกัน)
> - **เพิ่มคีย์ EN/TH:** `queueAttach`, `queueAttachTitle`, `queueRemoveImage`
>   · ไทย: “แนบไฟล์ในคิว” / “แนบไฟล์ให้ข้อความที่อยู่ในคิวนี้” / “เอาไฟล์นี้ออก”
> - **เจอของแถม 3 คีย์ที่ขาดเหมือนกัน** (ใช้ใน `index.html` ผ่าน `data-i18n`):
>   `approvalKeys`, `browserPairCode`, `guestBadge` → เพิ่ม EN/TH ครบ
> - **กันซ้ำ:** เทสต์ใหม่ `scripts/selftest-i18n-keys.js` สแกน `t('…')` + `data-i18n*`
>   ใน `app.js`/`index.html` เทียบกับพจนานุกรม **ทั้งสองภาษา** (รวมบล็อก `Object.assign(STRINGS.xx, …)`
>   ที่อยู่ท้ายไฟล์) + ตรวจว่าสองภาษามีชุดคีย์เท่ากัน → ลงทะเบียนใน `run-unit-tests.js`
> - **ลบรุ่นเก่าบน GitHub:** `[prune-releases keep=v0.5.20 apply tags]` → เหลือรุ่นเดียว
> - `npm test` **86/86**
> - **บทเรียนสระอำ:** การ `edit` แบบยกบล็อกภาษาไทยอาจเขียน `ำ` เป็น U+0E4D+U+0E32 ได้
>   (เกิดจริงกับ `queueReorder`/`queuePosition`/`queueEditingNote` — เทสต์ `selftest-queue-edit.js` จับได้)
>   → หลังแก้บล็อกไทยทุกครั้งให้รัน `npm run check:sara` หรือสแกนเฉพาะคีย์ที่แตะ

> **⚠️ ล่าสุด (2026-11-17): v0.5.19 — เวลาในรายการแชทใช้ `:` และอังกฤษเป็น 12 ชั่วโมง**
> - **ไทย:** `17/11/2569 14:21 น.` (24 ชั่วโมง, คั่นด้วย `:`)
> - **อังกฤษ:** `17/11/2026 02:21 PM` / `02:21 AM` (12 ชั่วโมง, มี AM/PM, เติมศูนย์หน้า)
>   · เที่ยงคืน = `12:07 AM` ไม่ใช่ `00:07 AM` · เที่ยงวัน = `12:07 PM`
> - **implement:** helper ใหม่ `clockText(date)` ใน `app/src/renderer/app.js`
>   ใช้ร่วมกันโดย `formatSessionDate` (รายการแชท/เมนูแชท) และ `formatShortDateTime` (เวลารีเซ็ตโควต้า)
>   → ที่เดียวคุมทั้งแอป ไม่มีจุดไหนใช้ `getHours()` แล้ว
> - **เทสต์:** `scripts/selftest-session-date.js` อัปเดต (โหลด `clockText` เข้า sandbox ด้วย)
>   + เคสใหม่: บ่าย `02:21 PM`, ตี 2 `02:07 AM`, เที่ยงคืน/เที่ยงวัน · `npm test` **85/85**
> - **เวอร์ชัน:** `0.5.19` (ผู้ใช้สั่ง “ส่งแค่อัปเดต”)

> **⚠️ ล่าสุด (2026-11-17): ส่งอัปเดต v0.5.18 — Gemini มีโควต้าฟรี + ย้อนกลับ/เปลี่ยนโมเดลระหว่าง AI ทำงาน**
> - **แทนที่แนวทางก่อนหน้า** (ที่ติด `plan: 'free'` ให้ Flash/Flash Lite) — ผู้ใช้เลือก **แผน 2**:
>   โมเดลยังเป็น `paid` พร้อมราคา และเพิ่มธง `freeTier: true` แยกต่างหาก
>   → UI โชว์ **chip “มีโควต้าฟรี”** คู่กับราคา (ไม่ซ่อนราคา)
> - **Gemini** (`app/src/google-ai.js`): `freeTier` ราย candidate (flash / flash-lite = true, pro = false)
>   · `googleModelEntries` ส่ง `freeTier` + `planNote` ราคาตามเดิม · `toModel` พา `freeTier` ผ่าน live catalog
>   · `provider-plan.js` เลือกแถว `freeTier === true` เป็นโมเดลเริ่มต้น (เข้ม ไม่เดาจากการไม่มีธง)
> - **UI** (`app/src/renderer/`): `index.html` เพิ่ม `#modelPickerFreeTier` · `styles.css` `.model-plan.free`
>   · `app.js`: chip ในแถวตัวเลือก + บนปุ่มที่ปิดอยู่ · มิเตอร์ล่างแชทขึ้น “มีโควต้าฟรีรายวัน” แต่ยังโชว์ราคา
>   · i18n EN/TH: `planFreeTier`, `planFreeTierTitle`, `googleFreeTier`
> - **ย้อนกลับระหว่าง AI ทำงานได้แล้ว** (เดิมขึ้น “รอให้รอบนี้ทำงานเสร็จก่อน”):
>   `undoLastMessage` เปิด dialog ยืนยัน (`kind: 'undoBusy'`) → ยืนยันแล้วเรียก `api.takeBackPrompt`
>   (หยุดเทิร์นด้วยเส้นทางเดียวกับปุ่มยกเลิก แล้ว undo) → ข้อความล่าสุดกลับเข้าช่องพิมพ์ผ่าน `finishUndo`
> - **เปลี่ยนโมเดลระหว่าง AI ทำงานมีคำเตือน**: `chooseModel` เห็น `view.busy` → dialog
>   (`kind: 'modelBusy'`) ปุ่ม “เปลี่ยนโมเดล / ยกเลิก” · ยืนยันแล้ว `applyModelChoice` ทำงานต่อ
> - **เทสต์:** `scripts/selftest-busy-guards.js` (ใหม่ 20 เช็ค ตรวจสายไฟของ dialog + i18n ทั้งสองภาษา
>   + chip) ลงทะเบียนใน `run-unit-tests.js` · อัปเดต `selftest-google-ai.js`, `selftest-provider-plan.js`
>   → `npm test` **85/85**
> - **เวอร์ชัน:** `0.5.18` · commit + tag + push แล้ว (CI ปล่อยรุ่น)
> - **ตรวจรุ่นที่ปล่อย:** `latest.yml` ไม่ได้อยู่ใน git ของ repo ปล่อย — เป็น **release asset**
>   ต้องอ่านจาก `GET /repos/Cheumklang/NTAPI-releases/releases/latest` (โทเคนจาก `git credential fill`)
>   · รุ่นนี้: exe 118,337,255 bytes sha256 `1939349e…3721a1` · provenance record-release seq 97 + anchor + verify OK
> - **CI ไม่ผ่านรอบแรก:** `selftest-usage-pill.js` ใช้หน้าต่าง regex 6,000 ตัวอักษรจาก
>   `function paintProviderMeter` ถึง `mirror();` — checkout บน runner เป็น CRLF ทำให้ยาวเกิน
>   → ขยายเป็น 9,000 + ย่อคอมเมนต์ที่เพิ่ม · commit `515f110` (`internal:`) · CI เขียวแล้ว
>   (รุ่นที่ปล่อยไม่มีอะไรเปลี่ยนเชิงพฤติกรรม — แก้เทสต์/คอมเมนต์อย่างเดียว)

> **⚠️ ล่าสุด (2026-11-17): Gemini มีโมเดลฟรีแล้ว (Flash / Flash Lite)**
> - **ปัญหาเดิม:** `google-ai.js` ติด `GOOGLE_PLAN = 'paid'` ทุกแถว → ไม่มีโมเดลฟรีให้เลือกเลย
>   ทั้งที่ Gemini API มีโควต้าฟรีรายวัน (ไม่มีใน EEA/UK/CH)
> - **แก้:** `plan` รายโมเดล — `gemini-2.5-flash` / `-flash-lite` = `free`, `gemini-2.5-pro` = `paid`
>   · `googleModelEntries` ให้ `planNote: ''` บนแถวฟรี (ราคายังอยู่ใน `cost` เพื่อคิดเงินเมื่อโควต้าหมด)
>   · `toModel` พา `plan` ผ่าน `resolveGoogleModels` มาด้วย
> - **มิเตอร์ล่างแชท:** ถ้าโมเดลที่เลือกเป็นแถวฟรี → `googleFreeTier` + `googleFreeLimits`
>   (เดิมโชว์ราคา $ ซึ่งขัดกับป้ายฟรี) · i18n EN/TH เพิ่ม 2 คีย์
> - **โมเดลเริ่มต้นของแชทใหม่:** `provider-plan.js` เลือกแถวที่มี `plan === 'free'` ก่อน
>   (เดิมเอา `googleList[0]` = Pro) — เช็คแบบเข้ม ไม่อิง `planOf` ที่เดา "ฟรี" เมื่อไม่มีธง
> - **เทสต์:** `selftest-google-ai.js` (+5) · `selftest-provider-plan.js` (+2 เคส) · `npm test` **84/84**
>   · `check:sara` ผ่านสำหรับคีย์ใหม่
> - **ยังไม่ commit / ยังไม่ bump** (ไฟล์ที่แก้: `app/src/google-ai.js`, `app/src/provider-plan.js`,
>   `app/src/renderer/app.js`, `app/scripts/selftest-google-ai.js`, `app/scripts/selftest-provider-plan.js`)
> - **ยังไม่ตอบ:** ลำดับความสำคัญ provider — ตอนนี้ google อยู่ท้ายสุด (หลัง DeepSeek/Anthropic)
>   ทั้งที่มีเลนฟรีแล้ว ถ้าจะย้ายขึ้นมาก่อน DeepSeek ต้องให้ผู้ใช้สั่ง

> **⚠️ ล่าสุด (2026-11-17): กฎสระอำ (U+0E33) + ตัวตรวจ `check:sara`**
> - **กฎอยู่ใน `AGENTS.md` หัวข้อ 0) ภาษา:** ใช้ `ำ` ตัวเดียว (แป้น E) ห้าม U+0E4D + U+0E32
> - **เครื่องมือ:** `cd app && npm run check:sara` รายงาน · `-- --fix` แก้ในไฟล์
> - **ที่ยังค้าง (ยังไม่แก้ รอผู้ใช้สั่ง):** 242 จุด / 19 ไฟล์ — ที่ผู้ใช้เห็นคือ
>   `app/src/renderer/app.js` 21, `app/src/renderer/index.html` 7, `TERMS.md` 22, `PRIVACY.md` 10
> - ยังไม่ commit


> **⚠️ ล่าสุด (2026-11-17): ปรับ README ของ repo ปล่อยให้ตรงรุ่น 0.5.17**
> - โลโก้ใหญ่เกิน → `<img width="88">` ใน `<div align="center">` (เดิม `![NTAPI](icon.png)` เต็มความกว้าง)
> - **ผู้ให้บริการ 9 ราย** (เดิมขาด DeepSeek / Claude / Gemini) + คอลัมน์ฟรี-เสียเงิน
> - จุดเด่นอัปเดต: Chrome/ส่วนขยาย, ระดับความคิด, แนบรูป, คิวข้อความ, อนุมัติก่อนรัน,
>   MCP + สกิล `@ชื่อ`, คำสั่งลัด, ราคา ฿/$, ปักหมุด/ใส่สีแชท · EN section ปรับตาม
> - repo ปล่อย commit `4b632f5` push แล้ว · `main...origin/main` สะอาด
>   · raw.githubusercontent มี cache ค้าง — หน้าเว็บ GitHub เห็นเนื้อหาใหม่แล้ว (ปกติ)

> **⚠️ ล่าสุด (2026-11-17): ปล่อย v0.5.17 + เก็บงานค้างใน NTAPI-releases**
> - **v0.5.17 ปล่อยแล้ว** · `latest.yml` = 0.5.17 · `NTAPI-Setup-0.5.17.exe` 118,334,466 bytes
>   sha256 `4e9103b0…e775a` · prune เหลือรุ่นเดียวบน GitHub · provenance record-release + anchor + verify OK
> - **บัคกดยกเลิกแล้วขึ้น "Token Harbor stopped responding":** แก้แล้ว — `app/src/turn-abort.js` (ใหม่၊
>   `isUserAbort`) · `prompt:abort` บันทึก `tab.userAbort` · `reportTabError` ข้าม abort ที่ผู้ใช้สั่ง
>   · `prompt:takeBack` (ใหม่) = abort + `undo()` → ข้อความที่ยกเลิกหายจาก session จริง
>   · เทสต์ `selftest-turn-abort.js` · `npm test` **84/84**
> - **repo ปล่อย (`C:\Users\cheum\OneDrive\เอกสาร\GitHub\NTAPI-releases`):** เคยมีงานค้าง
>   (README ใหม่ + LICENSE/PRIVACY/SECURITY/TERMS + `screens/app.png`, behind 1 จาก `icon.png`)
>   → commit + `pull --rebase` + push แล้ว · ตอนนี้ `main...origin/main` สะอาด
>   · **กติกาใหม่: แก้ไฟล์ใน repo ปล่อยเมื่อไหร่ ต้อง commit+push ที่นั่นด้วยทุกครั้ง**
>   (ไม่ใช่แค่ repo ซอร์ส) ไม่งั้นจะค้างใน GitHub Desktop
> - repo ซอร์ส: commit `7d86780` (งานจริง) → `d9fedc6` (บันทึก) · ไม่มีงานค้าง

> **⚠️ ล่าสุด (2026-11-17): เพิ่ม provider Claude + Gemini และชิปบอกชื่อบริษัท**
> - **Claude** (`app/src/anthropic.js`): `api: 'anthropic-messages'`, base `https://api.anthropic.com`,
>   คีย์ส่งทาง `x-api-key` + `anthropic-version: 2023-06-01` · family ที่รองรับ
>   `claude-opus-4-5` / `claude-sonnet-4-5` / `claude-haiku-4-5` — ตัดกับ `GET /v1/models` จริง
>   (alias มาก่อน, ไม่มีค่อยใช้ dated snapshot, family ที่ปลดระวางหายจากรายการ)
> - **Gemini** (`app/src/google-ai.js`): `api: 'google-generative-ai'`, base `.../v1beta`,
>   คีย์ส่งทาง `x-goog-api-key` (ไม่ใส่ใน URL) · family `gemini-2.5-pro` / `-flash` / `-flash-lite`
>   ตัดกับ `GET /v1beta/models` (เอาเฉพาะที่ `generateContent`, ใช้ cap ที่ API รายงาน)
> - **ต่อสายครบ:** `provider-plan.js` (default หลัง DeepSeek), `freepi-bridge.js`
>   (register/apply/entries/log), `main.js` (key store `anthropic.json`/`google.json`,
>   ipc `anthropic:*`/`google:*`, `settings:get`), `preload.js`, `index.html` (การ์ด),
>   `app.js` (i18n EN/TH, status, handler, meter แสดงราคา ฿/$), `provider-ui.js` (label/logo/chrome)
> - **โลโก้:** `assets/providers/anthropic.svg`, `google.svg`
> - **เทสต์ใหม่:** `selftest-anthropic.js` (23) · `selftest-google-ai.js` (22) — ลงทะเบียนใน
>   `run-unit-tests.js` · เพิ่มเคสใน `selftest-provider-plan.js`, `selftest-provider-ui.js`,
>   `check-provider-buy-links.js` · `npm test` **83/83** · `check:buy` ผ่าน
> - **ชิปสถานะ = ชื่อบริษัท** (แทนชื่อโมเดล): `pillName.textContent = company` (เช่น Token Harbor)
>   · tooltip ยังเป็น `company · model` · แก้เทสต์ `selftest-usage-pill.js` ตาม
> - ปล่อยรุ่นแล้ว: commits `93b3c0a` (สกิล) + `a96289f` (bump 0.6.6) · tag `v0.6.6` · Release run 44845195691 success
>   · asset 181,451,477 B sha256 `b6d11fe2…ff172` · provenance seq 185 · prune เก็บ **v0.6.6 + v0.6.5** (แท็กเหลือ 2 ทั้งสองรีโป)

> **⚠️ ล่าสุด (2026-11-17): แก้บั๊กระบบคิวส่งพร้อมกัน 2 ข้อความ**
> - **ต้นเหตุ:** `reconcileBusy` (heal ที่วิ่งทุก 4 วิ) เห็น renderer `view.busy=true` แต่ main `tab.busy=false` เพราะ `tab.busy` ถูกตั้งที่ `agent_start` (ทีหลัง) → เข้าใจผิดว่ามี settle หลุดแล้ว drain คิวข้อถัดไปออกไปทั้งที่เทิร์นแรกยังไม่เริ่ม → คิว 2 อันส่งพร้อมกัน
> - **แก้:** `prompt:send` (main.js) ตั้ง `tab.busy = true` + ส่ง `agent:busy(true)` ทันทีตอนรับ prompt (ก่อน `session.prompt`) — ปิดหน้าต่าง race
> - **ปุ่มอัปเดต:** ไม่ใช่บั๊ก — `setUpdates()` return ทันทีเมื่อ `!app.isPackaged` (ตอนรันจากซอร์สไม่มี updater) · ปุ่มจะขึ้น `updateDev` "ระบบอัปเดตใช้ได้กับเวอร์ชันที่ติดตั้งแล้วเท่านั้น" · publish config ชี้ `Cheumklang/NTAPI-releases` ถูกแล้ว → ใช้ได้เฉพาะตัวติดตั้ง
> - **ไฟล์:** `app/src/main.js`
> - ปล่อยรุ่นแล้ว: commits `93b3c0a` (สกิล) + `a96289f` (bump 0.6.6) · tag `v0.6.6` · Release run 44845195691 success
>   · asset 181,451,477 B sha256 `b6d11fe2…ff172` · provenance seq 185 · prune เก็บ **v0.6.6 + v0.6.5** (แท็กเหลือ 2 ทั้งสองรีโป)

> **⚠️ ล่าสุด (2026-11-17): ป้าย "ฟรี" โผล่บนโมเดลที่เสียเงิน — แก้แล้ว**
> - **ต้นเหตุ:** `paintModelTrigger()` อ่าน `plan` จาก `view.model` แต่ pi ส่งมาแค่ `{provider,id,name}` (ไม่มี `plan`) → `FPProvider.modelPlan()` คืน "free" เสมอสำหรับโมเดลที่เลือกอยู่ (รายการในเมนูถูกอยู่แล้ว เพราะอ่านจาก entry ที่มี `plan`)
> - **แก้:** เพิ่ม `modelEntryFor(model)` ดึง entry จริงจาก `menuModels` / `activeView().models` ตาม provider+id แล้วใช้ `plan`/`planNote`/`cost` จากนั้น · ย้าย `menuModels = models` มาก่อน `paintModelTrigger()` ใน `renderModelPicker()` (เดิมตั้งทีหลัง → เห็น list เก่า)
> - **เทสต์:** `selftest-model-picker.js` เพิ่ม check `paidBadge` (โมเดล paid → badge `paid` + `$0.30/$1.20`) · `npm test` 81/81 · picker selftest ผ่าน
> - **ไฟล์:** `app/src/renderer/app.js`, `app/scripts/selftest-model-picker.js`
> - **หน้าต่าง:** `minWidth`/`minHeight` = `1240×840` (เดิม `900×560`) — ย่อเล็กกว่าตอนเปิดมาไม่ได้ ขยายได้ · `app/src/main.js`
> - ปล่อยรุ่นแล้ว: commits `93b3c0a` (สกิล) + `a96289f` (bump 0.6.6) · tag `v0.6.6` · Release run 44845195691 success
>   · asset 181,451,477 B sha256 `b6d11fe2…ff172` · provenance seq 185 · prune เก็บ **v0.6.6 + v0.6.5** (แท็กเหลือ 2 ทั้งสองรีโป)

> **⚠️ ล่าสุด (2026-11-17): จัดแถวบน sidebar + ซ่อมเกจ % — ยังไม่ commit / ยังไม่ออกเวอร์ชัน**
> - **โฟลเดอร์งาน (ที่ผู้ใช้วงสีแดง)** ย้ายขึ้นแถวเดียวกับปุ่มธีม/อนุมัติ → อยู่ใน `.sidebar-tools`
>   เป็นชิป แสดงชื่อโฟลเดอร์ + tooltip เป็น path เต็ม (`paintWorkspaceChip()`)
>   · ลบ section "โฟลเดอร์งาน" เดิมออก (ประหยัด 2 บรรทัด)
> - **จัดแถวให้เท่ากัน:** โฟลเดอร์/ธีม/ถาม สูง 30px เท่ากัน เว้น 8px เท่ากัน
>   · selector ต้องเป็น `.chip-btn.workspace-chip` (2 คลาส) เพราะ `.chip-btn` ประกาศทีหลังและตั้ง `width:30px`
> - **เกจ % (โควตาวันนี้):** ต้นเหตุจริง `.usage-bar-fill` เป็น `<span>` inline → `width:45%` ไม่มีผล
>   (computed ค้าง ~8%) · แก้ `display:block` ให้ `.usage-bar` และ `.usage-bar-fill`
>   · วัดจริง: track 46px / fill 21px ที่ 45%
> - **แถวล่างตรงคอลัมน์กับแถวบน:** ชิปอนุมัติเปลี่ยนเป็นไอคอน 30px (โหมดดูจากสีไอคอน + tooltip/aria-label)
>   → ธีมอยู่ใต้ปุ่มโกลบ (x=204) และอนุมัติอยู่ใต้เฟือง (x=242) ตรงกันเป๊ะ
> - **ความกว้างขั้นต่ำ:** `sidebarMinWidth()` ใช้ `brand.scrollWidth` ด้วย + วัดใหม่เมื่อ badge
>   ผู้ใช้ออนไลน์โผล่ (`paintPresence` → `applySidebarWidth()`) — เดิมแถวบนล้นขอบ 6px ทำให้สองแถวไม่ตรงกัน
> - เทสต์: `npm test` 81/81 · shell 31 · approval 21 · sidebar reset 7 · sidebar note 17 · restore 9
> - **แถบสถานะช่วงจอเล็ก (1200/1100/1000/900):** ไม่มีอะไรล้นออกนอกหน้าต่างแล้ว
>   · "ระดับความคิด" เป็น **dropdown** (`#thinkingBtn` + `#thinkingMenu`) เปิดเมื่อ **ชี้เมาส์**
>     (เดิม `#thinkingSwitch` 5 ช่อง กว้าง ~194px) · เลือกแล้วส่งค่าเดิมทาง `#thinkingSelect`
>   · `#statusProviderMeter` ตัดด้วย ellipsis + ซ่อนที่ ≤1240 (ข้อความราคาเก็บในป๊อปอัป)
>   · breakpoint ใหม่ 1240/1120/1000/960 วางไว้ **ท้ายไฟล์** เพื่อชนะ base rules
>   (บทเรียน: media query ที่อยู่ก่อนกฎ base จะแพ้ — เคยทำให้ `min-width` ไม่ทำงาน)
> - **เทสต์:** `check-thinking-switch.js` เขียนใหม่ 17 checks (hover เปิด, เลือกแล้วถึง main 1 ครั้ง,
>   โมเดลไม่รองรับ = ล็อก) · `npm test` 81/81 · shell 31 · approval 21 · sidebar 7+17
> - **ป๊อปอัปสถานะกว้างตามข้อความ:** `width: max-content` + `left: 50%`/`translateX(-50%)`
>   + `max-width: min(560px, 100vw - 40px)` · แถว `flex-wrap: nowrap` + `white-space: nowrap`
>   → ทุกแถวบรรทัดเดียว (วัดจริง กว้าง 496px, แถวราคาสูง 17px)
> - **ชิปสถานะแสดง "ชื่อโมเดล"** (`view.model.name` เช่น DeepSeek V4.1 Flash) แทนประโยคราคา
>   · `#statusProviderMeter` ถูกซ่อนในชิป (เก็บไว้ mirror ให้ป๊อปอัป) · `title` มีชื่อเต็ม
> - **สกุลเงินตามภาษา:** `moneyText(usd)` / `moneyUnit()` — ไทยได้ `฿` เมื่อรู้เรต (FX),
>   อังกฤษได้ `$` · ราคา DeepSeek สร้างจาก `view.model.cost` ผ่าน `t('deepseekPrice', {in,out})`
>   · หน่วยท้ายค่าใช้จ่าย: `tokCostUnit` = "บาท" / "USD"
> - **บทเรียน:** media query ต้องอยู่หลังกฎ base ไม่งั้นแพ้ (เจอซ้ำสองรอบ) — ชุด responsive
>   ของ topbar อยู่ท้าย `styles.css` แล้ว
> - **tooltip ทั้งแอปตามภาษา:** ย้าย `title` ที่ hardcode อยู่ (~20 จุด) → `data-i18n-title`
>   และเพิ่ม `data-i18n-aria` ให้ปุ่มไอคอน · `applyLanguage()` แปลงทั้งชื่อที่มองเห็นและ aria-label
>   · `APPROVAL_TITLES` (ไทยล้วน) → `approvalTitle(mode)` ใช้ `t()` · ปุ่มลบไฟล์แนบใช้ `t('removeTitle')`
>   · วัดจริง: สลับ TH/EN แล้ว tooltip เปลี่ยนครบ (เหลือแต่ path โฟลเดอร์ที่เป็นข้อมูล ไม่แปล)
> - **สกุลเงินตามภาษา (ต่อ):** ราคา DeepSeek สร้างจาก `cost` ของโมเดล → ไทยได้
>   `ราคา peak ฿10.17 เข้า / ฿40.66 ออก ต่อ 1M` · อังกฤษ `$0.30 / $1.20`
>   · เพิ่ม `cost` ใน `modelEntry()` และ `deepseekModelEntries()` (เดิมถูกตัดทิ้ง ทำให้แปลงไม่ได้)
> - **เรตค่าเงิน:** `ensureUsdThb()` ใหม่ — TTL 6 ชม. ต่อการเรียก, retry 60 วิเมื่อล้มเหลว,
>   รีเฟรชอัตโนมัติทุก 6 ชม. (`setInterval`) · เรียกตอนเปิดโปรแกรม/สลับภาษา
> - **ป้าย "ปัจจุบัน/Current" ตามภาษา:** `renderSessions()` ถูกเรียกใหม่ใน `applyLanguage()`
>   (เดิมแถวถูกวาดใน JS แล้วค้างภาษาตอนที่วาด)
> - **ปุ่มโมเดลล้นกรอบตอนภาษาอังกฤษ:** `.model-picker-btn` ใช้ `max-width: min(310px, 100%)`
>   (ไม่ใช้ `width:100%` ที่ทำให้ช่องความคิดถูกบีบ) · `.think-slot` กลับเป็น `flex: 0 0 auto`
>   ให้ picker เป็นตัวยอมหด · ซ่อนคำ "Reasoning/การคิด" ที่ ≤1280 เหลือค่า + ลูกศร
>   → ที่หน้าต่าง 1240 ทั้ง TH/EN ไม่มีอะไรล้น (ตรวจด้วยภาพหน้าจอทั้งสองภาษา)
> - **ยังไม่ commit · ยังไม่ bump** (ผู้ใช้ขอดู source ก่อน)

> **⚠️ ล่าสุด (2026-11-17): ปรับ UI รอบใช้ + ปล่อย v0.5.16**
> - **โมเดล:** ปุ่ม "เฉพาะฟรี" ไม่กางโฟลเดอร์ทุกบริษัทแล้ว — เป็นตัวกรองอย่างเดียว
>   (เดิม `searching = query || freeOnly` ทำให้เปิดทุกกลุ่ม)
> - **แถบ Context:** ย้ายออกจาก `#freePiUsage` (บล็อกนั้นถูกซ่อนเมื่อผู้ให้บริการรายงานมิเตอร์เอง)
>   → `#contextUsage` อยู่นอก แสดงทุกผู้ให้บริการ + มี `#contextBarPct` กำกับตัวเลข
> - **การอนุมัติเครื่องมือ:** ย้ายไปแถวเดียวกับปุ่มธีม (`.sidebar-tools`) เป็นชิป + ป๊อปอัป
>   เปิดเมื่อชี้เมาส์/คลิก/โฟกัส · ชิปบอกสถานะปัจจุบัน · เลือกแล้วชิปเปลี่ยนทันที
>   · `sidebarMinWidth()` ไม่วัดจาก `.approval-note` แล้ว (note อยู่ในป๊อปอัปความกว้างคงที่)
> - **แผงโทเคน:** เติมหน่วยท้ายตัวเลข — `tokUnit` ("โทเคน"/"tokens"),
>   `tokUnitCache` ("โทเคน · แคช"), `tokUnitMoney` (USD)
> - **เทสต์:** `npm test` 81/81 · `check:approval` 22 · `check:sidebar` · `check-sidebar-note` · `check:shell` 31
> - **ปล่อยแล้ว:** **v0.5.16** · `NTAPI-Setup-0.5.16.exe` 118,324,689 bytes · prune ให้เหลือรุ่นเดียว

> **⚠️ ล่าสุด (2026-11-17): ปุ่ม "แชทใหม่" ช้า + ข้อความลบแชทหายทั้งที่ hover — แก้แล้ว**
> - **ช้า:** ทุกครั้งที่เปิดแชทใหม่ `createFreePiSession` ยิงเน็ตใหม่ทั้งชุด —
>   `fetchMe` (เช็กสิทธิ์) → `/client-version` (แค็ตตาล็อก) → Coarena → NVIDIA →
>   Token Harbor → LLM7 → DeepSeek **ทีละตัว** (รวม ~6 round trip ก่อนเปิดแชทได้)
>   · แก้: แคช `fetchMe` 5 นาที / แค็ตตาล็อก 10 นาที ต่อ token-ต่อคีย์ ·
>   เรียก 4 แค็ตตาล็อกพร้อมกัน (`Promise.all`) · เริ่ม Coarena ล่วงหน้าขนานกับ auth ·
>   ใส่ timeout 4 วิให้ `fetchMe` (เดิมไม่มี → เน็ตช้าค้างได้)
>   · **วัดจริง:** แชทใหม่ครั้งแรกหลังเปิดโปรแกรม 4190 → **1889 ms** ·
>     กดซ้ำ 2356–3561 → **23–221 ms** · `tab:open` 1756 → **193 ms**
> - **ข้อความ "ลบแชทนี้ออกจากเครื่องแล้ว" หายทั้งที่ hover:** มี
>   `setTimeout(() => showNotice(null), 2500)` ตั้งลบทิ้งตายตัว 2.5 วิ ไม่สนใจ
>   `noticePaused` → ตัวเลขหยุดจริงแต่แถบหาย · แก้: ลบ timer นั้น ปล่อยให้ clock
>   มาตรฐาน 5 วิ (หยุดเมื่อ hover/เลือกข้อความ) ทำงาน ·
>   เพิ่ม check กันกลับมาใน `selftest-notice-i18n.js`
> - **เทสต์:** `npm test` 81/81 · `check:notice` 17 · `check:lost` 7
> - **ไฟล์:** `app/src/freepi-bridge.js`, `app/src/renderer/app.js`, `app/scripts/selftest-notice-i18n.js`
> - **ยังไม่ commit** · ยัง `0.5.15`

> **⚠️ ล่าสุด (2026-11-17): "ข้อความหายเมื่อสลับแชท" — แก้แล้ว 5 บั๊ก + วัดความเร็ว + ทดสอบกับ DeepSeek จริง**
> - **บั๊ก 1 (ตัวหลัก):** `agent:history` ของแท็บที่ไม่ได้ดู (`/compact`, undo/redo, เปลี่ยนคีย์)
>   ถูก `applyTabState()` ตั้งเป็นแท็บที่มองเห็นทุกครั้ง → จอสลับไปแท็บอื่นเอง
>   · แก้: `applyTabState(state, { show })` · `onHistory` ส่ง `show: state.tabId === activeTabId`
> - **บั๊ก 2:** ระหว่างสตรีม ข้อความถูกเก็บแค่ใน DOM (`body.__fpText`) → สลับแท็บแล้วกลับมา
>   ข้อความที่ไหลไปแล้วหายถาวร
>   · แก้: `view.liveMessages` เก็บทุกบล็อกของเทิร์นที่กำลังรัน (delta / textEnd / toolStart
>   เขียนทั้ง DOM และ state) · `mergeLiveTurn()` รวมกับประวัติตอนวาด · steer ส่งบล็อกที่ปิดแล้วเข้า history ก่อน
> - **บั๊ก 3:** `onSettled` ไม่เคยอ่านประวัติจริงกลับมา → คำตอบที่ขาดค้างถาวร
>   · แก้: จบเทิร์น → `getTabState` แล้ว `applyTabState` (เฉพาะแท็บที่กำลังดู)
> - **บั๊ก 4 (ทำให้ handler ตายทั้งตัว):** `refreshSessionBusy()` อ้าง `state` ที่ไม่มี
>   → throw ทุกครั้งที่เทิร์นเริ่ม/จบ (busy UI, queue, แจ้งเตือนจบเทิร์นไม่ทำงาน)
>   · แก้: ใช้ `activeView()` + อัปเดตแค่คลาสของแถวใน sidebar (ไม่สแกนดิสก์)
> - **บั๊ก 5:** แชทที่เปิดใหม่ (ยังไม่มีไฟล์) ไม่ขึ้นใน sidebar ถ้าไม่ใช่แท็บที่กำลังดู
>   · แก้: ใส่ทุก view ที่ยังไม่มีในรายการ
> - **ความเร็ว:** `listSessions` cache ตาม mtime ของโฟลเดอร์ (50ms → 1-5ms) ·
>   boot ไม่วาดทุกแท็บที่ restore (วาดครั้งเดียว) · `resolveSdk()` (~1.5s) ย้ายไปหลัง `createWindow()`
>   · วัดจริง: สลับแชท ~90-110ms · เปิดไฟล์ session 34ms · boot ถึงพร้อมใช้ ~7s (ส่วนใหญ่ Electron+SDK)
> - **ทดสอบกับ DeepSeek จริง** (`deepseek-flash`, โปรไฟล์ข้อมูลใหม่จำลองเครื่องใหม่):
>   terms → ใส่คีย์ → แชทใหม่ → ถาม → สลับแชทกลางสตรีม → กลับมา → `/compact` แล้วสลับ → ผ่านทุกข้อ
> - **เทสต์:** `npm test` 81/81 · `check:lost` (ใหม่ 7) · order 8 · history 8 · transcript 6 · restore 9 · shell 31
> - **ไฟล์:** `app/src/renderer/app.js`, `app/src/main.js`, `app/scripts/repro-message-loss.js`(ใหม่),
>   `selftest-history-merge.js`, `selftest-session-marks-ui.js`, `selftest-reload-reattach.js`, `app/package.json`
> - **ยังไม่ commit** · ยัง `0.5.15`

> **⚠️ ล่าสุด (2026-11-17): ข้อความสีเหลือง/notice ไม่หาย — แก้แล้ว + เจอบั๊กเทสต์ค้าง**
> - **อาการ:** บันทึกคีย์ DeepSeek แล้วขึ้น "บันทึกคีย์ DeepSeek แล้ว" ค้าง ไม่ยอมหาย
> - **ต้นเหตุ:** `showNotice(text, ms)` ตั้ง timer **เฉพาะเมื่อมีคนส่ง ms มา** แต่ผู้เรียกส่วuใหญ่
>   (รวม `showNotice(t('deepseekSaved'))`) ไม่ส่ง → ค้างตลอดไป
> - **แก้:** ค่าเริ่มต้น **5 วินาที** (`NOTICE_DEFAULT_MS`) · `0` = อยู่จนกว่าจะมีอันใหม่ ·
>   มี **ตัวเลขนับถอยหลัง** ในแถบ (`#noticeCount`, "อีก 5 วิ" / "5s")
>   · **หยุดนับ** เมื่อ: เอาเมาส์ชี้ (`pointerenter/mouseenter`) · focus เข้าไป · **เลือกข้อความ**
>   (`selectionchange`) → ปล่อยแล้วนับต่อ **จากที่หยุด** ไม่ใช่เริ่มใหม่ · ข้อความเลือก/copy ได้ (`user-select: text`)
> - **บั๊กที่สองที่เจอระหว่างเทสต์ (สำคัญต่อ CI):** ธีมเคยส่งผ่าน `ipcRenderer.sendSync`
>   ทำให้ **หน้าต่างที่โหลดโดยไม่มี main process ค้าง** (สคริปต์ `scripts/check-*.js` ทุกตัว)
>   → `npm run check:read` เคย timeout 420s มาแล้ว · **แก้:** ส่งผ่าน
>   `webPreferences.additionalArguments: ['--ntapi-theme=…']` (preload อ่าน `process.argv`)
>   → **ไม่มี IPC เลย** และลบ `ipcMain.on('prefs:themeSync')` ออก
>   · `backgroundColor` ของหน้าต่างก็ตามธีมแล้ว (กันจอวาบ)
> - **เทสต์:** ใหม่ `selftest-notice-countdown.js` (**39**) + `check-notice-countdown.js`
>   (`npm run check:notice`, **17 live**) — พิสูจน์ว่า 5 วิแล้วหายจริง / hover แล้วหยุดจริง /
>   ปล่อยแล้วนับต่อ / 0 = ค้าง / เลือกข้อความได้
> - `npm test` **81/81** · `check:shell` 31 · `check:read` 34 (ไม่ค้างแล้ว) · `prove:verify` OK 62
> - **ยังไม่ commit** · `0.5.15`

> **⚠️ ล่าสุด (2026-11-17): Light mode ทำให้ข้อความบางส่วนมองไม่เห็น — แก้แล้ว**
> - **อาการ:** เปิด Light mode แล้วมีข้อความสีขาวบนพื้นขาว (ผู้ใช้ส่งภาพ: ตัวหนาในข้อความหาย,
>   แถบ settings ที่เลือก, highlight ค้นหา ฯลฯ)
> - **ต้นเหตุ:** สีข้อความที่ยังเป็น **literal** (`color:#fff`, `#b9a7ff`, `#cfe0ff`, `#c6cddd`,
>   `#a9b1c4`, `#6b7290`) ไม่เปลี่ยนตามธีม · รวมถึง `p.style.color='#8b93a7'` ใน app.js ด้วย
> - **แก้:** เพิ่ม token ใหม่ **ทั้งสองธีม**: `--on-accent` (ขาวบนปุ่มที่เติมสี), `--accent-fill`,
>   `--danger-fill` (สีเข้มพอให้ขาวอ่านได้ — เพราะ `--accent` ถูกเลือกมาให้เป็น *ข้อความ*
>   บนพื้นมืด จึงเหลือเพียง 3.5:1 เมื่อมีตัวขาวทับ), `--titlebar-fg`, `--titlebar-fg-hover`,
>   `--code-accent`, `--file-fg`, `--dim-fg`, `--disabled-fg` · แทนที่ทุกจุดที่เหลือ
> - **เทสต์:** `selftest-theme.js` เพิ่ม **113 checks** (รวมคู่สีใหม่ + ห้าม `color:#fff`
>   และห้าม literal ใน app.js) · `check-shell-usable.js` (`npm run check:shell`) เพิ่ม probe
>   **วัด contrast จริงในโหมดสว่าง** 7 จุด — ผ่าน 31 checks · **พิสูจน์แล้ว**: ใส่ `#fff` กลับไป
>   → probe FAIL ที่ `1:1` จริง
> - `npm test` **80/80** · `prove:verify` OK 61 · **ยังไม่ commit** · `0.5.15`

> **⚠️ เรื่องล่าสุดที่เพิ่งแก้ (2026-11-17): โปรแกรมเปิดมาแล้วใช้ไม่ได้ — แก้แล้ว**
> - **อาการ:** เปิดแอปแล้วกด/พิมพ์อะไรไม่ได้เลย ช่องพิมพ์หายไป (ผู้ใช้ต้องกลับไปใช้ exe ที่ติดตั้ง)
> - **ต้นเหตุ:** ใน `index.html` ผมใส่ **`</div>` เกิน 1 ตัว** หลังบล็อก `.sidebar-tools`
>   → `#sidebar` ปิดก่อนกำหนด → ตัวเลือก workspace / รายการแชท / Token Status / **#composer**
>   หลุดออกจากโครง (กลายเป็น sibling ของ `#app`) → ช่องพิมพ์ถูกดันตกขอบล่างจอ
>   · ไม่มี error ใน console เลย เพราะทุก script รันได้หมด — ผิดที่ markup อย่างเดียว
> - **แก้:** ลบ `</div>` เกินออก
> - **เจอบั๊กที่ 2 ด้วย:** `theme-boot.js` อ่าน `window.api` แต่ preload เปิดชื่อ `window.freepi`
>   → ธีมที่บันทึกไว้ **ไม่ถูกใช้ตอนเปิดโปรแกรม** (ฟีเจอร์ "ไม่วาบ" ไม่เคยทำงานจริง) → แก้เป็น
>   `window.freepi || window.api`
> - **กันซ้ำ:** `scripts/selftest-markup-structure.js` (18 checks — เดิน tag stack ทั้งไฟล์
>   + ยืนยันว่า `#composer` อยู่ใน `#main` และ `#pickFolder`/`#sessionList`/`#themeBtn` อยู่ใน `#sidebar`)
>   · พิสูจน์แล้วว่าใส่ `</div>` เกินกลับไป → เทสต์ FAIL จริง
> - **ตรวจกับหน้าต่างจริง:** `scripts/check-shell-usable.js` (`npm run check:shell`) **23 checks ผ่าน**
>   — วัดว่า composer อยู่ใน #main, ช่องพิมพ์มองเห็น/โฟกัส/พิมพ์ได้, ไม่มีอะไรบัง, Send ติด,
>   กดปุ่มธีมแล้วพื้นหลังเปลี่ยนจริง, และ **ธีม light ที่บันทึกไว้ถูกใช้ก่อน first paint**
> - `npm test` **80/80 scripts** · `prove:verify` OK 60
> - **ยังไม่ commit** · `0.5.15`

> **คิวงาน (ผู้ใช้สั่งต่อเนื่อง 2026-11-17 — ทำตามลำดับ):**
> 1. ✅ **DeepSeek provider** — เสร็จ (62 checks)
> 2. ✅ **เลื่อนตามล่าสุดอัตโนมัติระหว่างสตรีม** — เสร็จ (root cause: `syncFollow()` อ่านการโตของ layout เป็น "ผู้ใช้เลื่อนหนี")
> 3. ✅ **รูปในคิวแก้ไขแสดงขนาดจริง** — เสร็จ (class 4 ตัวไม่มี CSS เลย)
> 4. ✅ **วันที่แชทที่บันทึกไว้ = วว/ดด/ปปปป** (ไทย พ.ศ. 2569 · EN ค.ศ. 2026) — เสร็จ
> 5. ✅ **Light/Dark mode** (ค่าเริ่มต้น Dark · ปุ่มอยู่ใต้ปุ่มตั้งค่า) — เสร็จ
> - **ทั้ง 5 เรื่องยังไม่ commit** · `app/package.json` ยัง `0.5.15` · ยังไม่ทดสอบในแอปจริง

> **สถานะล่าสุด (เสร็จในเครื่องทั้งหมด — `npm test` 79/79 scripts ผ่าน):**
> - **DeepSeek** (`app/src/deepseek.js` ใหม่): 2 รุ่น `deepseek-flash` (vision) + `deepseek-v4-pro` (text)
>   · `reasoning: true` · cost = ราคา peak · เป็น **default ตัวสุดท้าย** (ไม่ให้ paid แซง free)
>   · ต่อสายครบ: provider-plan, freepi-bridge (`applyDeepSeekKey`), main (key store + IPC),
>   preload, index.html card, provider-ui, app.js i18n/มิเตอร์/ปุ่ม, provider-errors (`DEEPSEEK_HINTS`),
>   error-messages (`deepseek.*`, `stall.deepseek`, `net.deepseek`) · โลโก้ `assets/providers/deepseek.svg`
> - **Auto-scroll**: `syncFollow()` ที่ใช้ `lastScrollSet` (offset ที่โค้ดเขียนเอง) ต้อง **ยอมรับว่าเป็นของเรา**
>   มิฉะนั้นการโตของ layout ระหว่างสตรีม (thinking ขยาย, รูปโหลดเสร็จ, markdown re-render)
>   ทำให้ระยะห่าง > 48px → เข้าใจผิดว่าเลื่อนหนี → หยุดตามทั้งเทิร์น · เพิ่ม `followStream()`
>   ที่ยืม `holdBottom()` (re-pin 50ms นาน 900ms หลัง delta สุดท้าย)
> - **คิวแก้ไข**: `.queue-edit-media/.queue-edit-chip/.queue-edit-rm/.queue-attach` **ไม่มี CSS เลย**
>   → รูปขนาดจริงบังจอ · เพิ่ม CSS ครบ (chip 46×46, `object-fit: cover`, ปุ่ม × มุมบน, ปุ่มเพิ่มรูป)
> - **วันที่**: `formatSessionDate()` — วว/ดด/ปปปป, `th` บวก 543 (พ.ศ.), `en` คง ค.ศ. · แทน `toLocaleString()`
> - **ธีม**: token ทุกสี (ถอด 65 hex → `--surface-1..4`, `--line-2`, `--muted-2`, `--gold`, `--chip-fg`)
>   · `html[data-theme='light']` re-point เฉย ๆ · `theme-boot.js` ตั้ง attr **ก่อน first paint**
>   ผ่าน `api.getThemeSync()` (sendSync) → กันจอวาบ dark→light · `prefs.theme` default `dark`
>   · ปุ่ม `#themeBtn` (พระจันทร์/ตะวัน) อยู่ **แถวใหม่ใต้ปุ่มตั้งค่า** (`.sidebar-tools`) เพื่อไม่ให้
>   ความกว้างขั้นต่ำของ sidebar เปลี่ยน · คีย์ลัด `Ctrl+Shift+T`... **ไม่ใช่** — ใช้ `Ctrl+T`
>   (ข้ามตอนพิมพ์ใน input) · **ปรับสี dark 2 ค่า**: `--accent` `#7c5cff`→`#8b74ff` (4.35→5.43:1)
>   และ `--muted-2` `#6f7891`→`#767f99` (4.29→4.74:1) เพราะต่ำกว่า WCAG AA
> - **เทสต์ใหม่ 4 ไฟล์:** `selftest-deepseek.js` (62) · `selftest-follow-stream.js` (19) ·
>   `selftest-queue-edit-media.js` (26) · `selftest-session-date.js` (13) · `selftest-theme.js` (86,
>   วัด contrast จริงตามสูตร WCAG) · แก้ `selftest-read-position.js` ให้รับ `followStream()`
> - **ไฟล์ที่แก้:** `app/src/{main,preload,provider-plan,freepi-bridge,provider-errors,error-messages,deepseek}.js`,
>   `app/src/renderer/{app.js,index.html,styles.css,provider-ui.js,theme-boot.js(ใหม่)}`,
>   `app/src/renderer/assets/providers/deepseek.svg`(ใหม่), `app/scripts/*`(ใหม่ 5 + แก้ 2), `AGENTS.md`(กฎใหม่)
> - **กฎใหม่ใน AGENTS.md:** "รวมงานที่ไม่อาศัยกันไว้ในบล็อกเดียวเสมอ" — ผู้ใช้ขอให้ปรับเอง เพราะยิง bash
>   หลายครั้งโดยไม่จำเป็น (เปลือง token)
> - **ยังไม่ทดสอบในแอป:** `cd app && npm start` → สลับธีม (ต้องไม่วาบ) · ส่งข้อความยาวดูว่าเลื่อนตาม ·
>   คิว+รูป · วันที่ในแชทที่บันทึก · ใส่คีย์ DeepSeek จริง

> **คิวงานปัจจุบัน (ผู้ใช้สั่งต่อเนื่อง 2026-11-17 — ทำตามลำดับ ห้ามข้าม):**
> 1. ✅ **DeepSeek provider** — เสร็จในเครื่อง (75/75) ยังไม่ commit
> 2. ⏳ **ระหว่าง AI คิด/พิมพ์ ต้องเลื่อนตามล่าสุดอัตโนมัติ** — ผู้ใช้ส่งภาพยืนยัน 2 ครั้ง
>    (scrollbar ค้างกลางทาง ต้องเลื่อนเมาส์ตามเอง) · ภาพ: `shots/scroll-bug-2.png`
> 3. ⏳ **แก้ข้อความในคิวที่มีรูปแนบ → รูปแสดงขนาดจริงบังจอ**
> 4. ⏳ **แชทที่บันทึกไว้: วันที่เป็น วว/ดด/ปปปป** — ไทยใช้ พ.ศ. (17/11/2569) EN ใช้ ค.ศ. (17/11/2026)
> 5. ⏳ **Light/Dark mode** — ค่าเริ่มต้น Dark · ปุ่มอยู่ใต้ปุ่มตั้งค่าใน sidebar (ไม่ให้ตำแหน่งขยับ)

> **สถานะล่าสุด (DeepSeek — เสร็จในเครื่อง ยังไม่ commit):**
> - เพิ่ม provider `deepseek` แบบ first-party (paid, prepaid balance): `app/src/deepseek.js` ใหม่
>   · 2 โมเดล `deepseek-flash` (vision, 1M ctx, max out 384K) และ `deepseek-v4-pro` (text only)
>   · `reasoning: true` ทั้งคู่ — pi-ai รองรับ DeepSeek native (`thinkingFormat: "deepseek"`, echo `reasoning_content`)
>   · `cost` = ราคา **peak** (ประมาณการมีแต่เกิน ไม่มีขาด)
> - ต่อสายครบ: `provider-plan.js` (deepseek เป็น **ตัวเลือกสุดท้าย** ไม่ให้ paid แซง free) ·
>   `freepi-bridge.js` (register/entries/`applyDeepSeekKey`) · `main.js` (key store `deepseek.json`,
>   IPC `deepseek:status|setKey|clearKey`) · `preload.js` · `index.html` (card) · `provider-ui.js`
>   (logo/label/meter) · `app.js` (i18n en+th, มิเตอร์, ปุ่มบันทึก/ลบ/รับคีย์/เติมเงิน, ยืนยันลบ)
> - ข้อความ error: `provider-errors.js` `DEEPSEEK_HINTS` + `stall.deepseek` · `error-messages.js`
>   `deepseek.*` + `stall.deepseek` + `net.deepseek` — **402 = ยอดเงินหมด** (ไม่ใช่คีย์ผิด),
>   400 ที่มีคำว่า reasoning_content = บอกให้เริ่มแชทใหม่
> - เทสต์ใหม่ `app/scripts/selftest-deepseek.js` **62 checks** · `npm test` **75/75 scripts** ผ่าน
> - โลโก้: `app/src/renderer/assets/providers/deepseek.svg` (วาดเอง ไม่ได้ลอกจากของเขา)
> - **ยังไม่ทดสอบกับคีย์จริง** — ต้องมี key จาก platform.deepseek.com แล้ว `cd app && npm start`

> **สถานะ ณ 2026-11-17 (รูปที่แนบตอนสลับแชท + ดูรูปในโปรแกรม + ความคิดตามล่าสุด — เสร็จในเครื่อง ยังไม่ commit):**
> - **ผู้ใช้แจ้ง 3 เรื่อง (ทำตามคิว ห้ามลัด):**
>   1. สลับแชทไปแล้วกลับมา **รูปที่เคยส่งกลายเป็นข้อความ** `[Attached image saved to: …]`
>   2. อยาก **กดดูรูปที่แนบได้** (รวมรูปที่ AI ส่งมา) **ในโปรแกรม** ไม่ใช่เปิด Photos ของ Windows
>      · ปิดได้ด้วยการกดตรงไหนก็ได้ที่ไม่ใช่รูป · มีปุ่ม × มุมขวาบนด้วย
>   3. ตอน AI คิด **อยากให้เลื่อนตามล่าสุดตลอด** (เดิมต้อง scroll เอง) · พับ/ขยายยังใช้ได้เหมือนเดิม
> - **สาเหตุ (1):** free-pi เป็นข้อความล้วน → `prompt:send` เขียนรูปลง `outputs/.ntapi-attachments`
>   แล้วต่อท้าย prompt ด้วย 2 บรรทัด (note + “The image is saved on disk…”) · session เก็บ **ข้อความ**
>   เหล่านั้น ไม่ได้เก็บรูป → ตอน replay `messagesForUi` ส่งมาเป็น text และ `renderUserMessage` วาดเป็น prose
> - **แก้ (1):** `main.js` เพิ่ม `splitAttachmentNotes()` + `ATTACHED_IMAGE_NOTE`/`ATTACHED_IMAGE_HINT`
>   (ตัดเฉพาะ **ทั้งบรรทัด** ที่แอปนี้เขียนเอง) คืน `imagePaths` มากับข้อความ · `messagesForUi` ส่ง `imagePaths`
>   · `fs:readImage` → `resolveReadableImage()` ที่ยอมอ่าน **โฟลเดอร์ attachments เท่านั้น** เพิ่มจาก workspace
>   (เดิมปฏิเสธเพราะรูปอยู่นอก workspace — นี่คือเหตุผลที่รูปไม่กลับมา) · renderer
>   `renderUserMessage(text, attachments, { imagePaths, cwd })` + `paintStoredImages()`
> - **แก้ (2):** `index.html` `#imageViewer` (dialog + `#imageViewerImg` + `#imageViewerCaption` + `#imageViewerClose` ×)
>   · `styles.css` `.image-viewer*` (z-index 80 · พื้นหลังมืด + blur · × มุมขวาบน · `cursor: zoom-in`)
>   · `app.js` `openImageViewer`/`closeImageViewer` + ปิด 3 ทาง (× · คลิกที่ไม่ใช่รูป · Escape แบบ capture)
>   + delegated click ครอบ `#transcript, #attachments` → ครอบทุกภาพ (ส่งไป/ได้มา/tool result/พรีวิว)
>   · **เลิกใช้ `api.openPath` กับรูป** (เดิมเปิด Photos) · `galleryImage()` ใช้ร่วมทุกจุด
> - **แก้ (3):** `pinThinkingScroll()` + `followThinkingScroll()` — กล่องความคิดสูงสุด 320px มี scroll เอง
>   จึงเลื่อนตามท้ายตลอด และหยุดตามเมื่อผู้ใช้เลื่อนเอง (slack 8px) · เรียกทั้ง live (`+= p.delta`) และ replay
>   · **ไม่แตะ** ตัวพับ/ขยาย
> - **i18n:** เพิ่ม `imageViewerLabel`/`imageViewerClose` (en+th) ตั้ง aria-label ตอนเปิด
> - **เทสต์:** **ไฟล์ใหม่** `app/scripts/selftest-image-viewer.js` **62 checks** (รัน splitter ตัวจริง
>   กับข้อความจริง · ตรวจว่าเลิกใช้ openPath · ตรวจการปิด 3 ทาง · ตรวจ thinking) · `npm test` **74/74**
>   · `provenance verify` **OK 58 entries** (record-session แล้ว seq 58)
> - **หลักฐานจากข้อมูลจริง:** รัน splitter กับบรรทัดผู้ใช้จริงใน
>   `C:\NTAPI\sessions\NTAPI-Chat\2026-11-16T23-21-01-378Z_…jsonl` → ข้อความไทยคงเดิม + เจอ path 1 รูป
> - **ไฟล์ที่แก้:** `app/src/main.js`, `app/src/renderer/app.js`, `app/src/renderer/index.html`,
>   `app/src/renderer/styles.css`, `app/scripts/run-unit-tests.js` + ใหม่ `app/scripts/selftest-image-viewer.js`
> - **สถานะรุ่น:** `app/package.json` ยัง **`0.5.15`** · **ห้าม commit / bump / ปล่อยจนผู้ใช้สั่ง**
> - **ยังไม่ทดสอบกับของจริง:** `cd app && npm start` → ส่งรูป → สลับแชทไปกลับ → รูปต้องกลับมา ·
>   คลิกรูปดูในแอป · คลิกพื้นหลัง/×/Esc ปิด · กล่องความคิดเลื่อนตามเอง
> - **เรื่องที่ผู้ใช้ตัดออกจากคิว:** nvidia (ผู้ใช้สั่ง “เรื่อง nvidia ไม่ต้องนะคับ”) — ไม่ต้องทำ
> - **บทเรียนเทิร์นนี้:** ยิง `bash` หลายครั้งเกินกฎ 1 เทิร์น = 1 call เพราะทยอยเก็บข้อมูลทีละก้อน
>   → รอบหน้าวางแผนให้ครบก่อนยิง (อ่าน/แก้/เทสต์/บันทึก ในชุดเดียว)

> **สถานะ ณ 2026-11-17 (ปุ่ม “ปิดเซสชันที่ค้าง” — ทางออก session เต็ม 4 ของ free-pi · เทสต์ครบ · ยังไม่ commit 3 งาน):**
> - **ผู้ใช้พบ:** ใช้ 2 session ใน model เดียวกัน (FREE DeepSeek V4 Flash) ไม่ได้ — เปิด 2 แชท ตัวหลังส่งไม่ติด
> - **สาเหตุ:** free-pi จำกัด **4 running sessions ต่อบัญชี** — session ที่ปิดแท็บแล้วยังนับค้างบนเซิร์ฟเวอร์
>   (ไม่มี endpoint ปิด session ต่อแท็บ) → เปิด-ปิดแท็บสะสมจนเต็ม → error `concurrent_session`
>   (“บัญชีนี้เปิดเซสชันครบจำนวนแล้ว”)
> - **แก้:** `app/src/session-reset.js` (ใหม่) — POST `/session/reset` (endpoint เดียวกับ CLI `/close-other-session`)
>   · `main.js` ipc `account:resetSession` · `preload.js` `resetFreePiSession` ·
>   ปุ่ม “ปิดเซสชันที่ค้าง” ใน Settings → FreePi (`accountResetSession`, ซ่อนเมื่อไม่มี token) · i18n en/th
> - **เทสต์:** `selftest-reset-session.js` (fake fetch + temp credentials) 5/5 · npm test **73/73**
>   · scroll/undo/composer/notices/pill ✅ · `prove:verify` **OK 57** (seq 54–57: composer → notice → session reset)
> - **ยังไม่ commit 3 งาน** · `app/package.json` = `0.5.15` · **ห้ามปล่อยอัปเดตจนผู้ใช้สั่ง**
> - **ลองได้เลย:** `cd app && npm start` → Settings → การ์ด FreePi → “ปิดเซสชันที่ค้าง” → พิมพ์แชทใหม่

> **สถานะ ณ 2026-11-17 (notice เป็นของแต่ละแชท — /compact ใน B ไม่เด้งไป A · เทสต์ครบ · ยังไม่ commit 2 งาน):**
> - **ที่แก้เพิ่ม:** แถบข้อความ (notice) เดิมเป็น element เดียวทั้งแอป ไม่ผูก session —
>   `/compact` ใน B ขึ้น “กำลังย่อบทสนทนา…” ตอนสลับไป A ยังเห็นค้างอยู่
> - **แก้:** `showNotice(text, ms, ownerTabId)` — owner เริ่มต้น = activeTabId, **park ไว้ใน view.notice**
>   ถ้า owner ไม่ใช่ tab ที่เปิด → ไม่แสดงบนจอ; output เต็มแค่เมื่อ tab นั้นกลับมา
>   · `hideNoticeNow()` ซ่อนทันทีตอนสลับแท็บ · `restoreTabNotice()` คืน notice ของแท็บที่เขาพร้อมเวลาเหลือ
>   (หมดอายุไปแล้วไม่คืน) · `runCompact` ส่ง `view.tabId` เป็น owner ทั้งตอนเริ่มและตอนเสร็จ
> - **เทสต์ใหม่:** `app/scripts/check-tab-notices.js` (Electron, 6 checks — แสดงในแชทที่สั่ง ·
>   สลับไปซ่อน · กลับมาคืน sticky · timed ซ่อนตอนไป · timed กลับพร้อมเวลาเหลือ · หมดอายุไม่คืน)
> - **ก่อนหน้า (ยังไม่ commit ด้วย):** composer แยกต่อแชท (`composerText`/`composerImages`, งานก่อน)
> - **เทสต์ชุดเต็ม:** npm test 72/72 · check:scroll ✅ · check-undo-history ✅ · check-composer-drafts ✅
>   · check-tab-notices ✅ · check:pill ✅ · `prove:verify` **OK 56** (seq 54–56)
> - **ยังไม่ commit** · `app/package.json` = `0.5.15` · **ห้ามปล่อยอัปเดตจนผู้ใช้สั่ง**

> **สถานะ ณ 2026-11-17 (ช่องพิมพ์เป็นของแต่ละแชท — รูป/ข้อความไม่ลากข้าม session · เทสต์ครบ · ยังไม่ commit):**
> - **ผู้ใช้บ่น:** สลับแชทแล้วเจอรูปเดียวกันในคนละแชท · พิมพ์ข้อความ + แนบรูปทิ้งไว้ เปลี่ยน session แล้วมันตามไปด้วย
> - **คำตอบ:** session แยกกันอยู่แล้วจริง (แต่ละแท็บ = AgentSession คนละตัว · ไฟล์ session คนละไฟล์) —
>   แต่ **ช่องพิมพ์ (ข้อความที่ยังไม่ส่ง + รูปที่แนบ) เป็นตัวแปรก้อนเดียวใช้ร่วมทุกแท็บ** (`pendingImages` global)
> - **แก้:** `createView` เพิ่ม `composerText`/`composerImages` · `stashComposer()` ตอนออกจากแท็บ ·
>   `loadComposer()` ตอนเข้าำท็บ · `applyTabState` ตรวจ `tabChanged` (activeTabId !== state.tabId) เป็นตัวตัดสิน
>   · `closeTab` + ลบ session จากดิสก์: ล้าง composer ของแท็บที่จากไป และ **ไม่ตั้ง activeTabId ก่อน**
>   เพื่อให้ applyTabState คืนคอมโพเซอร์ของแท็บปลายทางเอง · `/clear` ล้างก่อนวาด
> - **เทสต์ใหม่:** `app/scripts/check-composer-drafts.js` (Electron, 6 checks — พิมพ์+แนบ 2 รูปใน A ·
>   สลับไป B ว่าง · กลับ A คืนครบ · B คงคำของตัวเอง · ปิดแท็บ A ไม่ลากข้าม)
> - **เทสต์ชุดเต็ม:** npm test 72/72 · check:scroll ✅ · check-undo-history ✅ · check-composer-drafts ✅
>   · check:pill ✅ · selftest-token-usage 20 · selftest-legal-docs 20 · check:legal 7 · `prove:verify` **OK 55** (seq 55)
> - **ยังไม่ commit** · `app/package.json` = `0.5.15` · **ห้ามปล่อยอัปเดตจนผู้ใช้สั่ง** · แนะนำลอง `cd app && npm start`

> **สถานะ ณ 2026-11-17 (เปลี่ยนแชทไม่ไหลยาว + แก้ปุ่มยกเลิกในคิวส่งทันที — แก้แล้ว · เทสต์ครบ · ยังไม่ commit):**
> - **งาน 1 (ผู้ใช้บ่น):** สลับแชททีไร scroll ไหลจากบนสุดข้ามแชททั้งแชทลงมาล่างสุด — ขัดใจเมื่อแชทยาว
>   **ต้นเหตุ:** `.transcript { scroll-behavior: smooth }` (styles.css) ทำให้**ทุกครั้ง**ที่โปรแกรมตั้ง
>   `scrollTop` animate ไหล (ทั้งสลับแชท และ pump `pinScrollTop` ทุก 50ms ตอน streaming)
>   **แก้:** ลบ `scroll-behavior: smooth` ออกจาก `.transcript` — กระโดดทันทีทุกเส้นทาง (สลับแชท ·
>   ข้อความใหม่ไหลเข้า · ปุ่มลงล่างสุด) · ปรับ comment ที่ปุ่ม jump ให้ตรงพฤติกรรม
> - **งาน 2 (ผู้ใช้แจ้ง):** ข้อความติดคิว → กดแก้ไข → กดปุ่ม "ยกเลิก" → **ดันถูกส่งไปแทน**
>   **ต้นเหตุ:** `cancelQueueEdit` เดิมตั้ง `editing=false` แล้วเรียก `drainQueue(view)` — ถ้าเทิร์นเพิ่งจบ
>   ข้อความถูก shift+ส่งทันที ทั้งที่ผู้ใช้กด "ยกเลิก" ด้วยความเข้าใจว่าไม่เอาแล้ว
>   **แก้:** ยกเลิก = **เอาข้อความออกจากคิว** (`splice`) แล้ว**คืน draft ที่กำลังพิมพ์ + ภาพกลับช่องพิมพ์**
>   (ไม่มีอะไรถูกส่งให้เอง) — ปุ่ม "บันทึก" ยังส่งตามเดิม · อัปเดต `selftest-queue-edit.js` 3 ข้อให้ตรงดีไซน์ใหม่
> - **เทสต์:** npm test **72/72** · check:scroll ✅ · check-undo-history ✅ · selftest-token-usage 20
>   · selftest-legal-docs 20 · check:legal 7 · check:pill ✅ · `prove:verify` **OK 53 entries** (seq 53)
> - **ยังไม่ commit** · `app/package.json` = `0.5.15` · **ห้ามปล่อยอัปเดตจนผู้ใช้สั่ง** ·
>   แนะนำลอง `cd app && npm start`: สลับแชทดู + จัดคิว 2 ข้อความ กดยกเลิกตอนกำลังแก้

> **สถานะ ณ 2026-11-17 (แก้บั๊กปุ่มย้อนกลับ undo: ฟองข้อความไม่หาย — แก้แล้ว · ทดสอบแล้ว · ยังไม่ commit):**
> - **อาการผู้ใช้:** กด Undo → ข้อความเด้งกลับช่องพิมพ์ แต่ฟองในแชทไม่ยอมหาย
> - **ต้นเหตุ (พิสูจน์ด้วยเทสต์จริงแล้ว):** `submit()` เขียน `{pending:true}` ไว้ใน `view.messages` — ปกติ
>   merge จะลบทิ้งเมื่อ history event ยืนยันว่าข้อความเข้ารู่ session แล้ว แต่ถ้า pending copy ยังค้างถึงตอน undo
>   (event ยังไม่มา / ข้อความถูกเขียนใหม่จน prefix ไม่ตรง) → หลัง undo session ลบข้อความแล้ว
>   → `mergeIncomingMessages` เห็น pending copy ว่า "session ยังไม่มี" → **splice กลับเข้าไป = ฟองเด้งคืน**
> - **แก้:** `undoLastMessage()` เรียก `dropStalePending(view, res.text)` ก่อนคืนข้อความเข้าช่องพิมพ์ — ลบ
>   pending user copy ที่ข้อความตรงกัน (กฎขอบเขตเดียวกับ merge: ตรงเป๊ะ หรือ prefix กันโดยตัวถัดไปเป็น
>   `\n`/space/tab) ออกจาก `view.messages`
> - **เทสต์ใหม่ 2 ตัว:** `app/scripts/repro-undo.js` (node + SDK จริง + faux offline — พิสูจน์ว่า session state
>   หลัง undo ถูกต้องจริง) · `app/scripts/check-undo-history.js` (Electron window จริง: Scenario A สะอาดผ่าน
>   · Scenario B มี pending ค้าง **แดงก่อนแก้** = reproduce อาการตรง ๆ → **เขียวหลังแก้**)
> - **เทสต์ชุดเต็ม:** `node --check` 7 ไฟล์ · `selftest-token-usage` 20 · `selftest-legal-docs` 20
>   · `npm test` 72/72 · `check:legal` 7 · `check:pill` ผ่าน · `check-undo-history` ผ่าน
>   · `prove:verify` **OK 52 entries** (record-session seq 52)
> - **ยังไม่ commit** · `app/package.json` = `0.5.15` · **ห้ามปล่อยอัปเดตจนผู้ใช้สั่ง** ·
>   **แนะนำให้ผู้ใช้ลองกด undo ใน `cd app && npm start` ก่อน**

> **สถานะ ณ 2026-11-17 (จัดหน้าโทเคนใหม่ + ปุ่มปฏิเสธ — ยังไม่ commit · ยังไม่ปล่อย):**
> - **ผู้ใช้ขอ:** (ก) ไม่รู้ว่าอันไหนแคช อันไหนโทเคน → **แยกเป็นหัวข้อ** · (ข) อยากได้ **ค่าต่าง `+`**
>   ต่อรอบ · (ค) "4 รอบก่อน" → เหลือ **2 รอบ = รอบก่อน / รอบปัจจุบัน** (เลข 1-4 งง)
>   · (ง) เพิ่มปุ่ม **"ปฏิเสธ"** ในหน้ายอมรับข้อกำหนด → ปิดโปรแกรม
> - **หน้าตาใหม่ของบล็อกโทเคน:** หัวข้อ `รวมทั้งเซสชัน` (ใช้ไปทั้งหมด · ส่งให้ AI · AI ตอบกลับ ·
>   ส่ง + ตอบ · ค่าใช้จ่าย) แล้วหัวข้อ `แยกที่ส่งไป` (**โทเคนใหม่** · **โทเคนจากแคช**)
>   แล้วหัวข้อ `เทียบ 2 รอบ` เป็นตาราง 3 คอลัมน์: รอบ | รวม | เทียบก่อน (`+1,204` / `−318`)
>   · hover ที่ค่าต่างดู ส่ง/ตอบ แยกได้
> - **เลย์เอาต์:** เปลี่ยน `.tok-row` จาก flex → **grid 2 คอลัมน์** (1fr auto) ตัวเลขชิดขวาเรียงเป็นแถว
>   (เดิม flex-wrap ทำให้ตัวเลขตกบรรทัด = อ่านไม่ได้) · เทิร์นเป็น grid 3 คอลัมน์ · กลุ่มย่อยเลิกใช้ลูกศร ↳
> - **ตรรกะ:** `usage-totals.js` เปลี่ยน `previousTurns` → **`recentTurns(totals, 2)`** (+ `turnDelta`)
>   → แต่ละรอบพก `delta` เทียบรอบก่อนหน้า (รอบแรกสุดยังคิด delta จากรอบที่ซ่อนอยู่ ไม่รีเซ็ตเป็น 0)
>   · `usageTotals()` แนบ `recent` มากับผลลัพธ์ → renderer แค่เพนต์ (`costText`, `deltaText`)
> - **ปุ่มปฏิเสธ:** `#termsDecline` → `api.quitApp()` → IPC `app:quit` → `app.quit()` (ปิดทุกอย่าง)
> - **เทสต์:** `selftest-token-usage` **20 checks** (รวม delta บวก/ลบ · รอบเดียวไม่มี delta · เอาแค่ 2 รอบล่าสุด)
>   · `selftest-legal-docs` **20** · `npm test` **72/72** · `check:legal` 7 · `check:pill` ผ่าน
>   · `prove:verify` **OK 51 entries**
> - **ภาพตัวอย่างไว้ดูผล:** `shots/token-panel-preview.png` (สร้างด้วย `cd app && npx electron scripts/shot-status-tokens.js`
>   — สคริปต์ช่วยพัฒนา ไม่ใช่เทสต์ · ไฟล์ภาพยังไม่ commit)
> - **ยังไม่ commit** · `app/package.json` = **`0.5.15`** · **ห้ามปล่อยอัปเดตจนผู้ใช้สั่ง**
> - **ยังไม่ทดสอบกับของจริง** — รอผู้ใช้ตรวจภาพ/ลอง `npm start`

> **สถานะ ณ 2026-11-17 (หน้ายอมรับข้อกำหนด: เพิ่มปุ่มปฏิเสธ — ยังไม่ commit · ยังไม่ปล่อย):**
> - **ผู้ใช้ขอ:** หน้ายอมรับมีแต่ "ยอมรับ" ไม่มี "ปฏิเสธ" → ถ้ากดปฏิเสธ **ให้ปิดโปรแกรม**
> - **แก้:** `index.html` เพิ่ม `#termsDecline` (`ghost`, ซ้ายของปุ่มยอมรับ) · `app.js` i18n
>   `termsDecline` EN/TH + handler ที่ **ปิดทั้งสองปุ่มกันกดซ้ำ** แล้วเรียก `api.quitApp()`
>   · `preload.js` `quitApp` → IPC `app:quit` · `main.js` `ipcMain.handle('app:quit')` = `app.quit()`
>   (ปิดหน้าต่าง agents presence timer ทั้งหมด)
> - **เทสต์:** `selftest-legal-docs` **20 checks** (เพิ่ม: ปุ่มปฏิเสธมีจริง · ปุ่มเรียก quitApp ·
>   IPC มีอยู่และเรียก `app.quit()` · คีย์ i18n แปลทั้งสองภาษา 2 ที่) · `npm test` **72/72**
>   · `check:legal` 7 · `check:pill` ผ่าน · `prove:verify` **OK 49 entries** · bash 1 call
> - **ค้าง:** ยังไม่ commit · `app/package.json` ยัง `0.5.15` · **ห้ามปล่อยอัปเดตจนสั่ง**

> **สถานะ ณ 2026-11-17 (ช่องโทเคนเสร็จ — ยังไม่ commit · ยังไม่ปล่อย `0.5.16`):**
> - **ผู้ใช้สั่ง:** ทำช่องโทเคนในป้ายสถานะ ให้รู้ว่าใช้ไปเท่าไหร่ — 5 ค่า
>   (รวมทั้ง session · ส่งออกไป · AI ตอบกลับ · ส่ง+ตอบ · 4 รอบก่อน) แบบชี้เมาส์เท่านั้น
>   เพราะพื้นที่ป้ายเหลือน้อย · **ใช้ได้ทุกโมเดล** · ค่าเงินใช้ `฿`/`$` และ **ดึงอัตราจริงจากเน็ต**
> - **แหล่งข้อมูล:** `assistant message.usage` ที่ SDK เก็บอยู่แล้ว (`input`/`output`/`cacheRead`/`cacheWrite`/
>   `reasoning`/`cost`) — ไม่ประมาณเอง เจ้าไหนไม่ส่ง ได้ `—`
> - **ไฟล์ใหม่:** `app/src/usage-totals.js` (คำนวณ + จัดกลุ่มเป็นรอบ) · `app/src/fx-rate.js`
>   (USD→THB จาก `open.er-api.com`, cache 6 ชม., ไม่ throw) · `app/scripts/selftest-token-usage.js` (18 checks)
> - **นิยามที่เลือก (กันบรรทัดซ้ำ):** `ใช้ไปทั้งหมด` = input+แคช+ตอบ · `ส่งให้ AI` = input+แคช
>   (แยก `ข้อความใหม่` / `อ่านจากแคช`) · `ส่ง + ตอบ` = input+ตอบ (ไม่รวมแคช) · cacheWrite+Read รวมกัน
> - **ค่าใช้จ่าย:** `cost.total > 0` → `฿` (ไทย, แปลงด้วยอัตราจริง) / `$` (EN) · `0` + รู้ว่าเป็นรุ่นฟรี
>   → `ฟรี` · `0` แต่ไม่รู้ราคา → `ไม่ทราบราคา` (ห้ามเขียน "ฟรี" เดา ๆ) · อัตราแลกเปลี่ยนดึง **เฉพาะตอนมีราคาให้แสดง**
> - **compaction = เริ่มนับใหม่** (คำนวณจาก `session.messages` ที่ถูกเขียนใหม่) ตามที่ผู้ใช้เลือก
> - **จุดเชื่อม:** `main.js` `tabState()` เพิ่ม `usage:` · IPC ใหม่ `fx:usdThb` · `preload.js` `getUsdThb`
>   · `app.js` `paintTokenUsage()` + `costText()` + `ensureUsdThb()` · เรียกตอน `setStatusPopover(true)`
>   และเมื่อ `applyTabState` ถ้าป็อปอัปเปิดอยู่ · `index.html` ส่วน `#tokenUsage` · `styles.css` `.token-usage`
> - **กฎหมาย:** `PRIVACY.md` เพิ่มแถว `open.er-api.com` (ไม่มีข้อมูลผู้ใช้) + English summary
> - **เทสต์:** `npm test` **72/72** · `selftest-token-usage` 18 · `selftest-legal-docs` 19 · `check:legal` 7
>   · `check:pill` ผ่าน · `prove:verify` **OK 48 entries**
> - **ยังไม่ commit** (ไฟล์ค้าง: TERMS.md, PRIVACY.md, PROVENANCE, `.AGENT/`, app/scripts 3, app/src 6, ไฟล์ใหม่ 4)
>   · `app/package.json` = **`0.5.15`** · **ห้ามปล่อยอัปเดตจนผู้ใช้สั่ง**
> - **ยังไม่ได้ทดสอบกับของจริง:** ต้องลอง `cd app && npm start` แล้วชี้ที่ป้ายสถานะดูว่าตัวเลขตรงกับ
>   `usage` ใน session file และค่าเงินเปลี่ยนเป็น ฿ เมื่อภาษาไทย

> **สถานะ ณ 2026-11-17 (`0.5.16` ยังไม่ออก — งานกฎหมายเสร็จในเครื่องแล้ว ยังไม่ commit):**
> - **ผู้ใช้สั่ง:** "เริ่มทำได้เลยคับ แต่อย่าพึ่งปล่อยอัปเดตนะคับ ... ทำเสร็จแค่ในเครื่องเราก่อน"
>   → ทำครบ 4 ข้อที่เสนอ ไม่ bump ไม่ tag ไม่ push
> - **(1) หน้ายอมรับข้อกำหนดตอนเปิดครั้งแรก** `#termsOverlay` ใน `index.html` (ไม่มีปุ่มปิด/ไม่มี Escape
>   — ปิดได้ด้วยการยอมรับเท่านั้น) · `app.js`: `TERMS_VERSION = '2026-11-17'` · `termsAccepted()`
>   · `showTerms()` · `acceptTerms()` · เรียก `if (!termsAccepted()) showTerms()` ทันทีหลัง `applyLanguage()`
>   · `maybeShowGuide()` ไม่ทำงานถ้ายังไม่ยอมรับ → กดรับแล้วค่อยขึ้นไกด์ · ลิงก์ TERMS/PRIVACY บนหน้านี้
>   ใช้ handler เดียวกับหน้า About (เพิ่ม `.terms-legal-links .link-btn` เข้า loop เดิม)
>   · `main.js` `prefs:set` รับ `termsAccepted` **เฉพาะรูปแบบ `YYYY-MM-DD`** (กัน prefs กลายเป็นที่เก็บข้อความอิสระ)
> - **(2) `PRIVACY.md`**: เพิ่มหัวข้อ `### ระยะเวลาเก็บรักษาข้อมูล` (ตาราง 4 แถว: แชท/การตั้งค่า · คีย์ ·
>   `crash.log` = ไม่มีกำหนดอัตโนมัติจนผู้ใช้ลบเอง · รหัสนับคนออนไลน์ = หน่วยวินาทีในหน่วยความจำ) + English summary
> - **(3) `PRIVACY.md` §7 ผู้เยาว์**: เปลี่ยนจาก "13 ปีขึ้นไป" (COPPA สหรัฐ) → **มาตรา 20 แห่ง PDPA**
>   (ต่ำกว่า 10 ปีต้องได้ความยินยอมจากผู้ปกครอง · 10–20 ปีให้เองได้) + เตือนไม่ให้ส่งข้อมูลของผู้อื่น/ข้อมูลสุขภาพ
> - **(4) `TERMS.md`**: §7 เพิ่ม **เพดานความรับผิด 1,000 บาท** + **การชดใช้ค่าเสียหาย (indemnity)**
>   · §9 เพิ่มกลไก "ข้อกำหนดเปลี่ยน → ขอให้ยอมรับอีกครั้ง" · **§11 ใหม่** = แยกส่วนได้ · ข้อตกลงทั้งหมด ·
>   การโอนสิทธิ · การไม่สละสิทธิ · ฉบับภาษาไทยเป็นหลัก · English summary เติม Liability/Changes
> - **เทสต์:** `selftest-legal-docs.js` เพิ่ม 6 checks (หน้ายอมรับ · TERMS_VERSION ตรงกับวันที่ใน TERMS.md ·
>   ไกด์รอการยอมรับ · retention · อายุตาม ม.20 · เพดาน/อินเดมนิตี้/ข้อกำหนดทั่วไป) → **18 checks ผ่าน**
>   · `npm test` **71/71** · `check:legal` **7 checks** · `check:pill` ผ่าน · `prove:verify` **OK 47 entries** (record-session แล้ว)
> - **ไฟล์ค้าง (ยังไม่ commit 9 ไฟล์):** `TERMS.md`, `PRIVACY.md`, `PROVENANCE/ledger.jsonl`,
>   `app/src/main.js`, `app/src/renderer/app.js`, `app/src/renderer/index.html`,
>   `app/src/renderer/styles.css`, `app/scripts/selftest-legal-docs.js`
> - **สถานะรุ่น:** `app/package.json` = **`0.5.15`** (ไม่ bump) · รุ่นถัดไปเมื่อสั่ง = **`0.5.16`**
> - **ขั้นถัดไป:** ผู้ใช้มีเรื่องให้ทำอีกหลายเรื่อง — **ห้ามปล่อยอัปเดตจนกว่าจะสั่ง** · ควรทดสอบจากซอร์ส
>   (`cd app && npm start`) ว่าเครื่องที่ยังไม่เคยยอมรับเห็นหน้ายอมรับก่อนไกด์ และกดแล้วไม่ขึ้นอีก

> **สถานะ ณ 2026-11-17 (ปล่อย `v0.5.15` แล้ว — ผู้ใช้อัปเดตในโปรแกรมได้):**
> - **ผู้ใช้สั่ง:** "commit + push ปล่อยตัวอัปเดตและ build … ลบเวอร์ชั่นเก่า tag เก่าออกด้วย"
>   (ผู้ใช้กำลังเปลี่ยน session ไปทดสอบ)
> - **ออกในรุ่นนี้ (รวมงานที่ค้างใน working tree ทุก session):**
>   `83b3fea` = ป้ายสถานะแสดงชื่อโมเดลเต็มไม่ตัด (Zro pill fix) + ลิงก์สมัคร FreePi มีรหัสแนะนำ
>   + เอกสารสิทธิ์ (`TERMS.md`/`PRIVACY.md`) + ข้อความหน้า "เกี่ยวกับ" ·
>   `91b4cf4` = `internal: bump 0.5.15` ·
>   ยังมี `fe1411c` (ถอดระบบสลับโมเดลอัตโนมัติ) กับ `2d6d5e0` (แก้เทิร์นจบเงียบเมื่อเจอ 429) ที่ค้างจาก session ก่อน
> - **ตรวจก่อนปล่อย:** `npm test` **71/71** · `check:legal` ผ่าน · `check:pill` = "All status pill checks passed"
>   · `prove:verify` OK (40 entries)
> - **ตรวจหลังปล่อย:** `latest.yml` = **`0.5.15`** · ดาวน์โหลด `NTAPI-Setup-0.5.15.exe` ได้จริง
>   (118,297,212 bytes · sha256 `2e7059f885b22f3e428e11f3f603f141b92c06bd1c641aa8309afabdbf4deaab`)
>   · หน้า release ตอบ 200
> - **หลักฐาน:** `record-release 0.5.15` (seq 43) + `anchor` + `verify` **OK 43 entries**
> - **ลบรุ่นเก่า:** push marker `[prune-releases keep=v0.5.15 apply tags]` → **ตรวจแล้ว เหลือ `v0.5.15` รุ่นเดียว**
>   (asset ของ `v0.5.14` ตอบ 404 · feed สาธารณะเหลือ `v0.5.15` · `git ls-remote --tags` เหลือ tag แค่ `v0.5.15`)
> - **สถานะรุ่น:** tag `v0.5.15` → `91b4cf4` · `app/package.json` = `0.5.15` · **รุ่นถัดไป = `0.5.16`**

> **สถานะ ณ 2026-11-17 (ป้ายสถานะ Zro: ชื่อโมเดลยาวเกินป้าย — แก้แล้ว · รวมออกใน 0.5.15):**
> - **ผู้ใช้แจ้ง (แนบภาพ):** ป้ายสถานะมุมซ้ายบน `Zro DeepSeek V4.1 Flash` ถูกตัดที่ขอบป้าย ·
>   ในป๊อปอัปแถว "โมเดล" กับ "DeepSeek V4.1 Flash" ขึ้นคนละบรรทัด · มีแถว "รีเซ็ตใน 17/11 07.00 น."
>   ค้างจากแท็บ Coarena
> - **สาเหตุ 2 จุด:** (1) `.status-popover` กว้างเท่าป้าย (`min-width: 0`) → ชื่อรุ่นยาวเกินความกว้างป้าย
>   จึงตัดขึ้นบรรทัดใหม่ (2) `.usage-row { display: flex }` ทับกฎ `[hidden]` ของเบราว์เซอร์ →
>   `#providerResetsRow` ไม่ยอมซ่อน ค่าเก่าจึงค้างอยู่ทุกผู้ให้บริการ
> - **แก้:** `styles.css` — popover `min-width: 252px` (ชิดซ้าย ขยายขวาเท่านั้น) ·
>   `.usage-row[hidden] { display: none }` · `#statusProviderMeter` ตัดด้วย `…`
>   (`min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`) ·
>   `#statusProviderName { flex: none }` · `app.js` — ป้ายใส่ `title` = ชื่อเต็ม
> - **เทสต์:** `selftest-usage-pill.js` **27 checks ผ่าน** · `npm test` **71/71** ·
>   ปรับ `check-status-pill.js` (Electron) ให้วัดแถวโมเดลบรรทัดเดียว + ชื่อไม่ล้นป้าย + popover ≥ 232
> - **ไฟล์:** `app/src/renderer/styles.css`, `app/src/renderer/app.js`,
>   `app/scripts/selftest-usage-pill.js`, `app/scripts/check-status-pill.js`
> - **สถานะ:** ออกพร้อม **`0.5.15`** (ผู้ใช้สั่ง "build" 2026-11-17) — รวมงานลิงก์แนะนำ +
>   เอกสารสิทธิ์ของอีก session ที่ค้างใน working tree ด้วย

> **สถานะ ณ 2026-11-17 (ลิงก์แนะนำ FreePi + แก้เอกสารสิทธิ์ — แก้แล้ว ยังไม่ commit):**
> - **สิ่งที่ผู้ใช้ขอ:** ลิงก์ FreePi ในโปรแกรมต้องมีรหัสแนะนำของเขา `?ref=3tygm5kd` (จะได้ค่าแนะนำ)
> - **แก้ลิงก์:** `app/src/renderer/app.js` ปุ่มสมัคร/เข้าสู่ระบบ (เดิม `https://freepi.ai/`) → `https://freepi.ai/?ref=3tygm5kd`
>   · **ไม่แตะ** `api.freepi.ai` (freepi-bridge.js `DEFAULT_BASE_URL`, main.js `FREEPI_BASE_URL`, selftest-sse-guard)
> - **ทำไมต้องแก้กฎหมาย:** TERMS §2.1 เดิมเขียนว่า "ผู้พัฒนาไม่มีส่วนได้เสียและ**ไม่ได้รับค่าตอบแทน**จากการที่คุณเติมเงิน"
>   และ §1 บอกว่ารายได้มี"โฆษณา + บริจาค**เท่านั้น**" → กลายเป็นเท็จทันทีถ้ามีค่าแนะนำ
> - **ที่แก้ `TERMS.md`:** §1 เติมแหล่งรายได้ (referral) · §2.1 เขียนใหม่ (โปรแกรมติดต่อบริษัทด้วยคีย์ผู้ใช้โดยตรง ผู้พัฒนาไม่เห็นบัญชี/เนื้อหา)
>   · **§2.5 ใหม่ = ลิงก์แนะนำ** (ไม่มีผลต่อราคา/โควตา/สิทธิ์ · ไม่ได้ข้อมูลบัญชี · ไม่ใช่เงื่อนไขการใช้ · ชี้ไป `PRIVACY.md`)
>   · §2.6 ค่าใช้จ่ายเป็นเรื่องระหว่างผู้ใช้กับผู้ให้บริการ · §5.4 ลิงก์แนะนำ**ไม่ถือเป็นการรับรอง** บริการ · English summary เติมย่อหน้า Referral links
> - **ที่แก้ `PRIVACY.md`:** หัวข้อย่อยใหม่ **"ลิงก์แนะนำของผู้ให้บริการ (referral)"** (ใต้ "เราไม่ได้ใช้" ก่อนส่วนขยายเบราว์เซอร์)
>   = เปิดลิงก์เมื่อผู้ใช้กดเท่านั้น · ไม่มีข้อมูลเพิ่มไปกับลิงก์ · คุกกี้/การเก็บข้อมูลเป็นของผู้ให้บริการตามนโยบายเขา · เราไม่ได้บัญชี/อีเมล/เนื้อหากลับ · ไม่กดก็ใช้ได้ครบทุกฟังก์ชัน
>   · เพิ่มฐานกฎหมายใน §4 (ม.24(3) คำขอของเจ้าของข้อมูล) · English summary เติมเรื่อง referral
> - **หน้า "เกี่ยวกับ" ในแอปต้องตรงกับเอกสาร:** แก้ `aboutLegalText` ทั้ง EN (`app.js:431`) + TH (`app.js:821`) และค่าเริ่มต้นใน `index.html:842`
>   → เติม "ลิงก์สมัครของผู้ให้บริการบางรายมีรหัสแนะนำของผู้พัฒนาอยู่ด้วย ซึ่งไม่มีผลต่อราคา/โควตา/สิทธิ์"
> - **เทสต์:** `node --check app.js` ผ่าน · `npm run check:legal` **7 checks passed** · `npm test` **71/71 ผ่าน**
> - **ยังไม่ commit / ยังไม่ bump** (`app/package.json` = `0.5.14`) · ไฟล์ค้างที่แก้รอบนี้: `TERMS.md`, `PRIVACY.md`, `app/src/renderer/app.js`, `index.html`
> - **กติกาที่ตั้งรอบนี้:** ถ้าเพิ่มลิงก์ที่มีผลประโยชน์ (referral/affiliate/sponsor) ต้องอัปเดต **TERMS + PRIVACY + ข้อความหน้าเกี่ยวกับ** พร้อมกันสามที่ และแก้ "วันปรับปรุงล่าสุด"
> - **ขั้นถัดไป:** รอผู้ใช้สั่ง "ส่งอัปเดต" เป็น **`0.5.15`** (จะรวมงานของอีก session ที่ยังค้างใน working tree ด้วย — ต้องให้เขา commit เองก่อน)

> **สถานะ ณ 2026-11-17 (ถอดระบบสลับโมเดลอัตโนมัติออก — `npm test` 72/72 · ยังไม่ commit):**
> - **ผู้ใช้สั่ง:** "เอาระบบสลับอัตโนมัติออกเลยคับ ผมว่ามันทำให้ผู้ใช้งานสับสน แจ้งเตือนก็ให้มันบอกแค่ว่าหมดก็พอ"
> - **ถอดออกทั้งระบบ** (สลับเองเมื่อสิทธิ์หมด + walk pool + resume เทิร์นบนโมเดลใหม่):
>   ลบ `runModelFallback`, `switchToNextFreeModel`, `fallbackState`, `announceFallbackExhausted`,
>   `resumeAgentTurn`, `dropFailedAssistant` · ลบช่อง IPC `agent:fallback` (main/preload/renderer)
>   · ลบข้อความ `notice.switched` + `fallback.exhausted` · ลบ `tab.fallback` ทั้งหมด
> - **`model-fallback.js` เหลือ 3 ฟังก์ชัน:** `isLimitError` · `isTransientThrottle` · `turnFailure`
>   (ไม่ import `model-filter` แล้ว · ไม่มีตัวช่วยเรียง/สลับโมเดล) — คงชื่อไฟล์เดิมเพื่อลดการแก้ import
> - **พฤติกรรมใหม่เมื่อเจอ 429 ที่สิทธิ์หมดจริง:** แจ้งเตือนอย่างเดียวแล้วจบเทิร์น —
>   `message_end` → `reportTabError` → `friendlyProviderError` (`fp.hourly_ceiling` = "หมดชั่วโมงนี้
>   รอรีเซ็ตแล้วกดส่งอีกครั้ง ไม่ใช่แบน ไม่ใช่แอดบล็อก") · ไม่สลับโมเดล ไม่เล่นซ้ำเอง
>   · ยัง abort backoff ที่ไร้ประโยชน์ของ pi (ไม่ต้องรอ 2–20 วิ) และยังจำ `tab.limitFailure`
>   เพื่อให้แบนเนอร์อยู่ต่อหลังวาดใหม่ (`tabState` เติม `kind:'error'`)
> - **ถอด LLM7 empty-answer recovery ด้วย (ผู้ใช้สั่ง):** ลบ `planEmptyAnswerRetry` · `runEmptyAnswerRetry`
>   · `empty-answer.js` + `selftest-empty-answer.js` · ข้อความ `notice.emptyRepeat` / `notice.emptySwitched`
>   / `notice.switchFailed` · `tab.emptyAnswer` / `tab.emptyRetryCount` / `tab.lastPromptText`
>   → ตอบว่าง = แจ้งเตือน `noticeReasoningOverflow` อย่างเดียว ไม่ลองซ้ำ ไม่สลับโมเดล
> - **ไฟล์ที่แก้รอบนี้:** `app/src/main.js`, `app/src/model-fallback.js`, `app/src/preload.js`,
>   `app/src/renderer/app.js`, `app/src/error-messages.js`,
>   `app/scripts/selftest-model-fallback.js` (เขียนใหม่), `app/scripts/selftest-error-messages.js`,
>   `app/scripts/selftest-busy-state.js`, `app/scripts/check-duration-wiring.js`,
>   `app/scripts/run-unit-tests.js` · **ลบ:** `app/src/empty-answer.js`, `app/scripts/selftest-empty-answer.js`
> - **เทสต์:** `node --check` ผ่านทุกไฟล์ที่แก้ · `selftest-model-fallback.js` ผ่าน (เพิ่ม check ว่าไม่มี
>   ชื่อฟังก์ชัน/ช่อง IPC เดิมเหลือ, ไม่มี `tab.fallback`, ไม่มี retry อัตโนมัติ) · `npm test` ผ่านครบ
> - **commit:** เทิร์นนี้ commit เดียว (`ถอดระบบสลับโมเดลอัตโนมัติ …`) · ไม่ bump / ไม่ tag / ไม่ push
>   · `app/package.json` ยัง `0.5.14` · รอบปล่อยถัดไป = **`0.5.15`** เมื่อสั่ง

> **สถานะ ณ 2026-11-17 (เก็บงานค้าง: commit โค้ดแก้ 429 แล้ว — เหลือ commit หลักฐาน):**
> - **commit `2d6d5e0`** `แก้เทิร์นจบเงียบเมื่อผู้ให้บริการตอบ 429 ถึงขีดต่อชั่วโมง`
>   = 3 ไฟล์: `app/src/main.js`, `app/src/model-fallback.js`, `app/scripts/selftest-model-fallback.js` (+161/−30)
>   → ปิดงานค้าง "เทิร์นหายเงียบ" ที่ค้างมา 1 session
> - **ตรวจก่อน commit:** `node --check` ผ่าน 3 ไฟล์ · `npm test` **72/72 ผ่าน** (exit 0) ·
>   `npm run prove:verify` OK 33 entries · `check:tools` / `check:turn-status` / `check:busy` ผ่าน
> - **ยังค้าง commit (ไม่ใช่โค้ด — เป็นหลักฐาน):** `.AGENT/HANDOFF.md`, `.AGENT/LOG.md`,
>   `PROVENANCE/ledger.jsonl`, session note ใหม่ 2 ไฟล์ (`2026-11-16-190205-…`, `2026-11-16-192245-session.md`)
>   → รอบถัดไป: `node scripts/provenance.js record-session --note "…"` แล้ว commit ขึ้นต้น `internal:`
> - **ยังไม่ bump / ไม่ tag / ไม่ push** · `app/package.json` = `0.5.14` · `latest.yml` ชี้ `0.5.14`
> - **ขั้นถัดไป:** ถามผู้ใช้ — จะ "ส่งอัปเดต" เป็น **`0.5.15`** เลยไหม (คำสั่งเต็มชุด: commit + bump + tag + push + รอ CI + ตรวจ `latest.yml`)
> - **ยังไม่มีผลทดสอบจากเครื่องจริง:** ต้องลองจากซอร์ส `cd app && npm start` ให้ free-pi ตอบ 429 ถึงขีดต่อชั่วโมง แล้วดูว่าแบนเนอร์ขึ้น + สลับโมเดลเอง
> - **บทเรียนเทิร์นนี้:** ยิง `bash` หลายครั้งเกินกฎ (1 เทิร์น = 1 call) เพราะทยอยอ่านไฟล์ทีละก้อน → รอบหน้าอ่าน/ตรวจ/เทสต์/commit รวมในสคริปต์เดียว

> **สถานะ ณ 2026-11-17 (429 `hourly_ceiling` ของ free-pi → เทิร์นหายเงียบ — แก้แล้ว ยังไม่ commit):**
> - **อาการที่ผู้ใช้เจอ:** free-pi ตอบครั้งแรกได้ พอถามต่อ **ไม่มีอะไรขึ้นเลย** — ไม่มีคำตอบ ไม่มีแบนเนอร์
>   สถานะล่างขึ้นปกติ เหมือนโปรแกรมใช้งานไม่ได้ · เรียก `npx free-pi-cli@latest` ตรง ๆ เห็น
>   `HTTP 429 … hourly limit …` แสดงว่าเซิร์ฟเวอร์ตอบ แต่โปรแกรมกลืนไป
> - **หลักฐาน:** `C:\NTAPI\sessions\NTAPI-Chat\2026-11-16T19-07-43-243Z_01a1e5c2….jsonl` —
>   user `ทำงานที่ค้างก่อนคับ` → assistant `stopReason:error` `errorMessage: 429 … hourly_ceiling` →
>   ต่อด้วย entry `context_edit` · **ไม่มีอะไรหลังจากนั้น**
> - **ต้นเหตุ (อยู่ใน SDK ไม่ใช่โค้ดเรา):** `agent-session.js` เมื่อจะ retry จะเรียก `_omitRecoveryAttempt()`
>   → `context_edit` แบบ replacement = null → `_refreshFinalizedContext()` **ตัด assistant ที่ล้มออกจาก
>   `agent.state.messages`** และ `session.messages` getter คืน projection นั้นตรง ๆ ·
>   แอปเราสั่ง `abortRetry()` (เพราะเป็นลิมิตจริง) → run settle ตอนที่ข้อความล่าสุด = ข้อความของผู้ใช้เอง
>   → ตัวอ่านตอน settle ทุกตัว (`announceIfUnreported`, `runModelFallback`) เห็นว่า "เทิร์นปกติ" แล้วจบเงียบ
> - **แก้ 3 ชั้น:**
>   1. `model-fallback.js` — เพิ่ม `turnFailure({ messages, limitFailure, seq })`:
>      อ่าน error ที่ยังอยู่ในลิสต์ ถ้าไม่มีให้ใช้ลิมิตที่ **โปรเซสเราจดไว้ก่อน abort** (ผูกด้วย `seq` ของ prompt)
>   2. `main.js` — `announceIfUnreported` + `runModelFallback` ใช้ `turnFailure` ·
>      `tab.limitFailure` เก็บ `provider`/`model` ของเส้นทางที่ถูกปฏิเสธ (ทั้ง `message_end` + `auto_retry_start`)
>   3. `main.js` `tabState` — ถ้าเทิร์นไม่ฟื้น เติม entry `kind:'error'` สังเคราะห์ท้าย transcript
>      → **แบนเนอร์แดงอยู่ต่อแม้วาดใหม่/สลับแท็บกลับมา** (เดิมหายเพราะอ่าน projection เดียวกัน)
> - **เทสต์:** `selftest-model-fallback.js` เพิ่ม 8 เคส `turnFailure` + เขียน structural check ใหม่
>   (กันอ่านแค่ข้อความล่าสุด / กันเดาโมเดลจากตัวที่เลือกอยู่) + เคส "failure ที่ถูกลบต้องยังเห็นหลังวาดใหม่" ·
>   `node --check` ผ่านทั้งสองไฟล์ · `npm test` **72/72 ผ่าน** (exit 0)
> - **ยังไม่ commit 3 ไฟล์:** `app/src/main.js`, `app/src/model-fallback.js`, `app/scripts/selftest-model-fallback.js`
>   (+ `PROVENANCE/ledger.jsonl` จาก session note)
> - **ขั้นถัดไป:** รอผู้ใช้สั่ง — commit อย่างเดียว หรือ "ส่งอัปเดต" เป็น **`0.5.15`**
>   (`app/package.json` ยังเป็น `0.5.14` · ยังไม่ bump)

> **สถานะ ณ 2026-11-17 (ลบ `v0.5.13` แล้ว — repo เหลือรุ่นเดียว):**
> - ลบ release `v0.5.13` บน `Cheumklang/NTAPI-releases` (asset หายทั้งชุด) + git ref ของ tag
> - ลบ tag `v0.5.13` ใน repo ต้นทาง: local `git tag -d` + `git push origin :refs/tags/v0.5.13`
> - **ตรวจแล้ว:** `NTAPI-releases` เหลือ **`v0.5.14` รุ่นเดียว** · tag ในเครื่องเหลือ `v0.5.14`
>   · `latest.yml` ยังชี้ `version: 0.5.14` (คนที่ติดตั้งไว้กดอัปเดตได้ตามปกติ)
> - `npm test` **72/72 ผ่าน** · `provenance verify` OK 32 entries
> - ไม่แตะ `PROVENANCE/releases/v0.5.13.json` (ledger append-only = หลักฐานว่าเคยปล่อยจริง)
> - **ค้าง commit:** `.AGENT/LOG.md`, `PROVENANCE/ledger.jsonl`, session note ใหม่ 1 ไฟล์
> - **รอบปล่อยครั้งถัดไป = `0.5.15`** (ยังไม่ bump · `app/package.json` = `0.5.14`)

> **สถานะ ณ 2026-11-17 (ปล่อยรุ่น 0.5.14 แล้ว — `latest.yml` ชี้ 0.5.14):**
> - **"ส่งอัปเดต" เสร็จครบ:** commit `1534d66` (32 ไฟล์) + tag `v0.5.14` + push `master`
> - **CI ปล่อยรุ่นแล้ว:** https://github.com/Cheumklang/NTAPI-releases/releases/tag/v0.5.14
>   · `NTAPI-Setup-0.5.14.exe` 118,298,902 B · sha256 `c29b44bd…01b3525` · `.blockmap` 124,261 B
> - **`latest.yml` = `0.5.14`** (ดาวน์โหลดมาตรวจแล้ว) → เครื่องที่ติดตั้ง 0.5.13 กดอัปเดตในโปรแกรมได้
> - **หลักฐาน:** `provenance record-release` seq 29 + `anchor` → `verify` **OK 29 entries** (exit 0)
> - **กติกาที่แก้รอบนี้ (อยู่ใน commit ของหลักฐาน):** "ส่งอัปเดต" = **commit + bump + tag + push**
>   ครบชุด ไม่ต้องขออนุญาตแยก · ต้องรอ CI แล้วตรวจ `latest.yml` ก่อนบอกว่า "อัปเดตได้แล้ว"
> - **ขั้นถัดไป:** ผู้ใช้กดอัปเดตในโปรแกรมแล้วทดสอบว่าเจอ 429 แล้วเทิร์นไม่ตายเงียบ
>   (ทดสอบจากซอร์ส `cd app && npm start`) — ยังไม่มีผลทดสอบจากเครื่องจริง
> - **บทเรียน:** เครื่องนี้ไม่มี `gh` CLI → ตรวจ CI/release ด้วย public API ของ `NTAPI-releases`
>   · ห้ามใช้ `Stop-Process` แบบกรอง command line (ฆ่า shell host ที่ใช้ร่วมกัน → งานที่กำลังรันตาย)

> **สถานะ ณ 2026-11-17 (เทิร์นจบเงียบเมื่อเจอ 429 — แก้แล้ว ยังไม่ commit):**
> - **อาการ:** เอเจนต์หยุดกลางเทิร์น สถานะล่างกลับเป็น “พร้อมใช้งาน” แต่ไม่มีแบนเนอร์หรือแจ้งเตือนใด ๆ
>   หลักฐาน: `C:\NTAPI\sessions\…\2026-11-16T13-40-05-065Z_01a1e496….jsonl` มี
>   `assistant stopReason:error` 11 ครั้ง · สามครั้งสุดท้ายเป็น Coarena
>   `429 rate_limit_exceeded` (“Limit: 10 … try again in 21s”)
> - **ต้นเหตุ 1 — abort ทั้งที่ 429 เป็นแค่ลิมิตต่อนาที:** `auto_retry_start` ยกเลิก backoff ของ pi
>   ทุกครั้งที่ `isLimitError` เป็นจริง (429 ทุกแบบ) → เทิร์นตายทั้งที่รอ 2–20 วินาทีก็ผ่าน
>   **แก้:** เพิ่ม `isTransientThrottle()` ใน `model-fallback.js` แยก “ลิมิตต่อนาที / ลองใหม่ใน N วินาที”
>   ออกจาก “สิทธิ์หมดจนถึงรอบรีเซ็ต” (`free_tier_limit_reached`, `insufficient_quota`, 402, “used up”)
>   → ลิมิตชั่วคราวปล่อยให้ pi backoff เองพร้อม `notice.retrying` · สิทธิ์ที่หมดจริงเท่านั้นจึง abort+สลับโมเดล
> - **ต้นเหตุ 2 — fallback ไม่เคยเริ่มในเทิร์นแรก:** `runModelFallback` อ่าน `tab.fallback` ตรง ๆ
>   ซึ่งเป็น `null` จนกว่าจะมีใครเรียก `fallbackState()` → ลิมิตครั้งแรกของทุก prompt จบเงียบ
>   **แก้:** `const state = fallbackState(tab);`
> - **กันซ้ำ — เทิร์นที่ล้มเหลวต้องมีข้อความเสมอ:** เพิ่ม `announceIfUnreported()` ตอน settle
>   ถ้า assistant ตัวสุดท้ายเป็น `error` และเทิร์นนี้ยังไม่เคยรายงาน → ส่ง `agent:error` ทันที
>   (`tab.lastError` เก็บ `seq` ของ prompt แล้ว)
> - **แก้คำผิด:** Coarena ไม่ได้ให้ 30 คำขอ/นาที (API บอก `Limit: 10`) → เปลี่ยนเป็น
>   “จำกัดจำนวนคำขอต่อนาทีของคีย์นี้ — รอไม่กี่วินาทีแล้วลองใหม่” ทั้ง `provider-errors.js` + `error-messages.js`
> - **เทสต์:** เพิ่มเคส throttle/spent ใน `selftest-model-fallback.js` + ตรวจ wiring
>   (ไม่ abort throttle, ใช้ `fallbackState`, มี `announceIfUnreported`) ·
>   `selftest-provider-errors.js` เลิกยืนยันเลข 30
> - **ยังไม่ commit** · **bump เป็น `0.5.14` แล้ว** (ยังไม่ tag / ยังไม่ push)
> - รุ่น `0.5.14` รวมของสองรอบ: (1) เทิร์นจบเงียบเมื่อเจอ 429 (2) เอกสารสิทธิ์ + ชิป/การ์ด tool ค้าง

> **สถานะ ณ 2026-11-17 (ชิป/การ์ด tool ค้าง — แก้แล้ว ยังไม่ commit):**
> - **ต้นเหตุ 1 — `onToolStart` นับ `runningTools` สองครั้ง** (บรรทัดต้นฟังก์ชัน + ใน branch
>   แท็บที่เปิดอยู่) → tool จบแล้วเหลือ 1 → ชิป “กำลังใช้เครื่องมือ: bash” ค้างทั้งเทิร์น
>   แม้สถานะล่างจะขึ้น “พร้อมใช้งาน” · แก้: นับครั้งเดียวตอนต้นฟังก์ชัน
> - **ต้นเหตุ 2 — วาดการ์ดจาก `view.messages` ไม่เอา `view.toolResults` มาใส่** →
>   tool ที่จบตอนอยู่แท็บอื่น พอกลับมาแชทนั้น การ์ดขึ้น “กำลังรัน…” ค้างจนปิดโปรแกรม
>   · แก้: `renderActiveTab` ในลูป `m.tools` ใส่ผลที่เก็บไว้ด้วย
> - **เพิ่ม:** turn จบแล้วไม่เคยมีผล tool (ถูกตัดกลาง/แอปปิด) → “ไม่ทราบผลลัพธ์”
>   แทนการอ้างว่ากำลังรัน · กัน `applyToolResult` ใส่ซ้ำ (ตัวนับ diff ซ้ำ)
> - **เทสต์ใหม่:** `app/scripts/check-tool-lifecycle.js` (`npm run check:tools`) 11 checks
>   — RED 5 → GREEN 11 · เพิ่ม npm script `check:undo-shortcut` (ไฟล์เทสต์เดิมไม่มี script)
> - **แก้เทสต์:** `selftest-turn-blocks.js` ตัดช่วงโค้ดด้วย `const tailFrom` แทน 4000 ตัวอักษร
>   (โค้ดยาวขึ้นแล้วช่วงขาด ทำให้ check “replay walks every stored message” แดง)
> - **ผล:** `npm test` **72/72** · `check:tools` 11 · `check:undo-shortcut` 10 · `check:busy`
>   · `check:turn-status` · `check:legal` 7 · `check:chips` · `notices:check` · `provenance verify` OK 24
> - **ยังไม่ commit / ยังไม่ bump** (0.5.13) · งานเอกสารสิทธิ์ (`LICENSE` `PRIVACY` `TERMS`
>   `SECURITY` + ลิงก์ใน About) ยังค้าง commit เหมือนบล็อกถัดไป

> **สถานะ ณ 2026-11-17 (รอบเอกสารสิทธิ์ — ยังไม่ commit):**
> - เพิ่ม `LICENSE` (proprietary, all rights reserved), `PRIVACY.md` (PDPA: presence UUID,
>   ที่เก็บข้อมูล, สิทธิเจ้าของข้อมูล), `TERMS.md` (EULA: คีย์ของผู้ใช้เอง, ห้ามหลายบัญชี,
>   โฆษณา/บริจาค, ข้อจำกัดความรับผิด), `SECURITY.md`
> - `app/package.json` เปลี่ยน `"license": "MIT"` → `"UNLICENSED"` (ซอร์สเป็น private,
>   MIT ขัดกับ LICENSE ใหม่ — ถ้าจะเปิดซอร์สค่อยเปลี่ยนกลับ)
> - `.github/workflows/release.yml` เพิ่ม SHA256 ของ `.exe` ลงท้าย release body
>   (มี guard ถ้าหาไฟล์ไม่เจอ จะไม่ทำให้ release ล้ม)
> - คัดลอก `LICENSE/PRIVACY/TERMS/SECURITY` + `screens/app.png` ไป repo
>   `Cheumklang/NTAPI-releases` และเขียน `README.md` ใหม่ (ลิงก์เอกสาร, ตารางผู้ให้บริการ,
>   ข้อความ not-affiliated, FAQ, วิธีตรวจ SHA256, วิธีลบข้อมูล)
> - เทสต์: `npm test` **71/71**, `npm run notices:check` ผ่าน, `provenance verify` OK 24 entries
> - **ยังค้าง (ต้องตัดสินใจ/ทำต่อ):** (ก) สวิตช์ปิด presence ในหน้าตั้งค่า (ตอนนี้ใช้ env
>   `NTAPI_PRESENCE_URL` แทน) (ข) ลายเซ็น/HMAC ของ `sponsor.json` (ค) code signing
>   (ง) ย้าย data root `C:\NTAPI` → `%APPDATA%` (จ) revoke ntfy token ที่อยู่ใน `AGENTS.md`
>   (ฉ) ปุ่ม/link เอกสารในหน้า About (ตอนนี้ยังไม่มีในแอป) (ช) push repo public
> - ยังไม่ขยับเวอร์ชัน (ผู้ใช้ยังไม่สั่ง)

> **สถานะ ณ 2026-11-17 (ปล่อย `0.5.13` แล้ว):**
> 1. ข้อความของผู้ใช้อยู่เหนือคำตอบเสมอ (pendingAt ใน merge) — เสร็จ, `check:order` 7, เทสต์ 70/70
> 2. ปุ่ม “ซื้อเครดิตที่ …” ครบ 5 เจ้า + `THIRD-PARTY-NOTICES.md` (MIT ต้องแนบ) + ข้อความ not-affiliated
>    ใน About + แก้ `reconcileBusy` ไม่ข้ามตอน window หลัง — เสร็จ, `check:buy` 25, เทสต์ **71/71**
> - **รอตัดสินใจ**: ปล่อย `0.5.13` เลยไหม (build + ลบ 0.5.12 เหลือรุ่นเดียว)

> - **ค้าง (ยังไม่ปล่อย):** ข้อความของผู้ใช้ไปอยู่ใต้คำตอบหลังสลับแชท → แก้ด้วย `pendingAt`
>   ใน `sendQueued` + `mergeIncomingMessages` วางกลับช่องเดิม · เทสต์ `check:order` 7 ·
>   `selftest-message-order.js` 2 · `npm test` **70/70**

> - **`v0.5.12` ปล่อยแล้ว** — 4 เรื่อง: scroll to latest · fold provider groups · queue release ·
>   PROVENANCE ledger · **รอบปล่อยครั้งถัดไป = `0.5.13`**

> - **ระบบหลักฐานการเป็นผู้สร้าง:** `PROVENANCE/` + `app/scripts/provenance.js` + git hook
>   · กติกาอยู่ใน `AGENTS.md` หัวข้อ “หลักฐานการเป็นผู้สร้าง”
>   · **ทุกเทิร์น:** `record-session` · **ทุกการปล่อย:** `record-release` + `anchor` · `verify` ต้อง OK

> - **แก้แล้ว (๓): คิวค้างเพราะ busy ค้าง** → `settleStaleTurn()` (ปลด hold + `drainQueue` ก่อนวาด),
>   `reconcileBusy()` วนทุก busy tab แล้วถาม `api.getTabState` · เทสต์ `scripts/check-stale-queue.js` (`check:stale-queue`)

> - **แก้แล้ว:** (๑) สลับแชทแล้วไม่ไปข้อความล่าสุด → `holdBottom()` + `pinScrollTop()` ยึดท้าย 900 ms
>   หลัง forced jump, ผู้ใช้ลากเองยังชนะเสมอ · เทสต์ `scripts/check-scroll-to-latest.js` (`check:scroll`)
>   (๒) รายการโมเดลย่อ/ขยายแต่ละบริษัทได้ → หัวกลุ่มเป็น `<button>`, `.model-group-body`,
>   จำใน prefs `collapsedProviders`, ค้นหากางทุกกลุ่มชั่วคราว · เทสต์ `scripts/check-model-fold.js` (`check:fold`)
> - `npm test` **69/69** · `check:read` 34 · `check:chips` · `check:busy` · `check:marks` ผ่าน
> - **ยังค้าง:** `check:turn-blocks` ข้อ gap ระหว่างบล็อก (แดงมาก่อนรอบนี้)
> - **รอบปล่อยครั้งถัดไป = `0.5.12`** (ยังไม่ commit/ปล่อย)

> **สถานะ ณ 2026-11-17 (รอบปล่อย `0.5.11` — อ่านตรงนี้ก่อน):**
> - **แก้แล้ว 3 เรื่อง (ปล่อย 0.5.11):** (ก) ปุ่ม ส่ง/หยุด ค้างหลังเทิร์นจบ — วาดปุ่มทุก event +
>   `reconcileBusy()` เทียบ DOM กับ state + ซ่อมตอน focus/visibility · (ข) ชิป “กำลังใช้เครื่องมือ”
>   ค้าง/หลุดก้อน — ลด `runningTools` ก่อน guard, `adoptLiveBubble()` ท้าย `renderActiveTab`,
>   `clearViewActivity()` ล้างทุก `.msg-activity` · (ค) ตัดป้าย “เปิดอยู่” ออกจากรายการแชท (ซ้ำกับ “ปัจจุบัน”)
>   · เทสต์ใหม่ `app/scripts/selftest-activity-state.js` · `npm test` **69/69**
> - **ยังค้าง:** `check-turn-blocks` ข้อ gap ระหว่างบล็อก แดงมาก่อนรอบนี้ (ไม่ใช่ของใหม่)
> - **ปล่อยแล้ว `v0.5.11`** (2026-11-17 · build) — CI `Release` `43888640783` success · asset ครบ · ลบ `v0.5.10` แล้ว
> - **รอบปล่อยครั้งถัดไป = `0.5.12`**

> **สถานะ ณ 2026-11-17 (รอบปล่อย `0.5.10` — อ่านตรงนี้ก่อน):**
> - **Coarena แพ็กฟรี: แก้แล้ว (3 ข้อ)** — ป้ายฟรี/เสียเงินเรียนรู้จาก 402 จริง · ข้อความ
>   `coarena.model_not_free` th+en · ไม่โชว์ JSON ดิบ · ดูหัวข้อ LOG วันเดียวกัน
>   · ไฟล์: `app/src/coarena.js`, `app/src/provider-errors.js`, `app/src/error-messages.js`,
>   `app/src/freepi-bridge.js`, `app/src/main.js`, `app/scripts/run-unit-tests.js`,
>   `app/scripts/selftest-model-filter.js`, ใหม่ `app/scripts/selftest-coarena-free-tier.js`
>   · `npm test` **68/68**
> - **ยังค้าง (จากรอบก่อน) — commit ไปพร้อมกันในรุ่นนี้:** ป้ายกำลังทำงานค้าง/คิวไม่เดิน ·
>   สถานะกิจกรรมกลางงานหาย · session สีซ้อนกรอบ · โฆษณา 9:16 · ล็อค sidebar 305px
> - **ปล่อยแล้ว `v0.5.10`** (2026-11-17 · build) — CI `Release` `43881221951` success · asset ครบ · ลบ `v0.5.9` แล้ว
> - **รอบปล่อยครั้งถัดไป = `0.5.11`**

> **สถานะ ณ 2026-11-17 รอบล่าสุด (อ่านตรงนี้ก่อน):**
> - **ค้าง 2 กลุ่ม — แก้แล้ว ยังไม่ commit (7 ไฟล์: 6 แก้ + 1 ใหม่)**
>   **(ก) ป้าย “กำลังทำงาน” ค้าง + คิวไม่เดิน** — ต้นเหตุ: ใน `api.onSettled` การเก็บ DOM (เรียกง่าย ๆ ว่าเปราะ) ทำ **ก่อน** ล้าง busy
>     → แก้: ตัวรักษาฝั่ง main (idle watchdog ทุก 4 วิ ต้องได้ `session.isIdle` 2 ครั้งติด → ล้าง busy + ส่ง settled `healed`)
>     + จัดลำดับใหม่ (busy=false → drain คิว → ค่อยแตะ DOM ใน `try/catch`) · `selftest-busy-state` 11 checks
>   **(ข) สถานะกิจกรรมกลางงานหาย** — ต้นเหตุ: ชิปวาดจาก *เหตุการณ์* ลง *บับเบิ้ล* พอแชทถูกวาดใหม่ (สลับแท็บ/รีโหลด) บับเบิ้ลใหม่ไม่รู้อะไรเลย
>     → แก้: ย้ายสถานะไปอยู่ที่ view (`view.act`, `view.runningTools`, `view.actTool`) · `markActivity` / `syncActivity` / `clearViewActivity`
>     · บับเบิ้ลถูกสร้างใหม่เมื่อไรจะวาดชิปกลับ · reconcile 4 วิ วาดซ้ำ · ชิปบอกชื่อเครื่องมือ (“กำลังใช้เครื่องมือ: bash”)
>     · **สถานะใหม่:** แถบสถานะเพิ่มขั้นตอน + เวลาที่เดินจริง → `รอคำตอบจากโมเดล` / `กำลังคิด` / `กำลังเขียนคำตอบ` / `กำลังรัน <tool>` / `กำลังลองใหม่`
>       รูปแบบ `กำลังทำงาน … ขั้น · 1 นาที 5 วินาที` (เดินทุกวินาที = หน้าต่างไม่ค้าง) · i18n th+en ครบ · เทสต์ใหม่ `check:turn-status` 6 checks
>   · เทสต์: `npm test` **67/67** · `check:turn-status` · `check:busy-state` · `check:activity-chips` · `check:status-strip` · `check:narration-fold` · `check:thinking-switch` ผ่านหมด
>   · **รู้ไว้:** `check-turn-blocks` ข้อ “gap ระหว่างบล็อก” แดง **มาก่อนรอบนี้แล้ว** (พิสูจน์ด้วย `git stash` แล้วยังแดง) ไม่ใช่ของใหม่
> - **รอบปล่อยครั้งถัดไป = `0.5.10`** · repo เหลือรุ่นเดียว `v0.5.9` (ทั้ง `NTAPI-releases` และ repo ต้นทาง)
> - **ยังไม่ตัดสินใจ:** build `0.5.10` เลย หรือทดสอบจากซอร์สก่อน (`cd app && npm start`) — รอผู้ใช้สั่ง
> - **ไอคอนหน้า GitHub releases:** เปลี่ยนเป็นไอคอนโค้งมนของโปรแกรมแล้ว (commit `0508a04` ใน `NTAPI-releases`)
> - **กฎที่เพิ่งเพิ่ม:** บันทึกงานลง `.AGENT/` **ทุกเทิร์น** ก่อนตอบ (ผู้ใช้อาจเปลี่ยน session โดยไม่บอก)

**อัปเดตล่าสุด:** 2026-11-17 · **v0.5.5 ปล่อยแล้ว** (tag `v0.5.5`) · ADS **0.1.1**

> **สถานะ ณ 2026-11-17 (อ่านตรงนี้ก่อน):**
> - **ค้าง 4 เรื่อง แก้แล้ว ยังไม่ commit (2026-11-17):**
>   (1) โฆษณาใช้สัดส่วนของ slot ที่แสดง (เส้นแบ่ง/label กลับมาแนบชิ้นเล็กแล้ว)
>   (2) เมนู model: “เฉพาะฟรี” กดคำได้ + ไม่มี scroll แนวนอน
>   (3) first-run guide 4 สเต็ป + ปุ่มข้าม (prefs.guideDone)
>   (4) undo 5 วิ หลังกด Enter ตอน AI ว่าง (แก้ไข/ยกเลิก)
>   (5) เปิดโปรแกรมใหม่กลับไปแชทล่าสุดที่เปิดไว้ (`prefs.activeSession` + `pickRestoreTarget`)
>   (6) ป้าย “กำลังทำงาน” ค้าง + กดหยุดไม่ติด (abort ล้างธงก่อน + `paintBusyFromViews` + reconcile 4 วิ)
>   · เทสต์: `npm test` 66 scripts · `check-sponsor-layout` 61 · `check-first-run-guide` 14 · `check-undo-send` 9
>   · **ปล่อยแล้ว `v0.5.9`** (2026-11-17) — CI `Release` run `43870886990` success · assets: `NTAPI-Setup-0.5.9.exe` 118,261,253B + `latest.yml` (version 0.5.9) + blockmap
>   · **repo เหลือรุ่นเดียว:** release + tag = `v0.5.9` ทั้ง `NTAPI-releases` และ repo ต้นทาง (ลบ `v0.5.8` แล้ว) · **รอบปล่อยครั้งถัดไป = `0.5.10`**
> - **v0.5.5 ปล่อยแล้ว** — CI `Release` **success** · assets: `NTAPI-Setup-0.5.5.exe` (118 MB) + `latest.yml` + blockmap
>   · release body ขึ้น 1 บรรทัด: "โฆษณาแนวตั้งแสดงเต็มสัดส่วน ล็อคความกว้าง sidebar และสีแชทไม่ซ้อนกรอบ"
>   · รัน: https://github.com/Cheumklang/NTAPI/actions/runs/43703513191
> - **repo เหลือรุ่นเดียว:** release + tag = **`v0.5.5` เท่านั้น** (ลบ `v0.5.4` … `v0.1.0` ออกทั้ง
>   `NTAPI-releases` และ source `NTAPI`) · ลบ tag เก่าในเครื่องด้วย เหลือ `v0.5.5`
> - **เวอร์ชัน:** NTAPI `0.5.5` · NTAPI ADS `0.1.1` · **รอบปล่อยครั้งถัดไป = `0.5.6`**
> - **NTAPI: ข้อความ 503 ค้าง 2 อัน — แก้แล้ว (ยังไม่ commit)** → ดูหัวข้อ **1zzzzzz (ก)**
> - **NTAPI ADS: กดปิดเสียงแล้วยังดัง — แก้แล้ว (ยังไม่ commit)** → ดูหัวข้อ **1zzzzzz (ข)**
> - **NTAPI: session item สีทับกรอบม่วง — แก้แล้ว (ยังไม่ commit)** → ดูหัวข้อ **1zzzzzz (ค)**
> - **NTAPI: โฆษณา 9:16 ไม่ยอมยืด — แก้แล้ว (ยังไม่ commit)** → ดูหัวข้อ **1zzzzzz (ง)**
> - **ค้าง: ล็อค sidebar** → **แก้แล้ว (ยังไม่ commit)** · ล็อคที่ **305px** = ความกว้างขั้นต่ำสุดที่คอลัมน์ต้องการ → ดูหัวข้อ **1zzzzzz (จ)**
> - **ปล่อยแล้ว v0.5.6** (2026-11-15) — ตัวหมุนรายการแชท (ฉ) + ชุดความสวย 1a/1b (ช) + จังหวะชีพจร
>   · CI run `43712252312` success ทุก step · asset 3 ไฟล์ใน `Cheumklang/NTAPI-releases`
>   · `latest.yml` → `version: 0.5.6` · commit `0ba9e0f` (งาน) `c718bd2` `5e92443` (bump)
> - **NTAPI ADS หน้าใหม่ทั้งชุด + อัตราส่วน 9:16/กำหนดเอง (ยังไม่ commit)**
>   → ดูหัวข้อ **1zzzzz**
> - **v0.5.4 ปล่อยแล้ว** — CI ผ่าน (`Release` conclusion: success) · asset: `NTAPI-Setup-0.5.4.exe`
>   + `latest.yml` + blockmap อยู่บน `NTAPI-releases` → กดอัปเดตในโปรแกรมได้
>   · มีอะไรใหม่: โฆษณาเต็มกรอบ+อยู่กึ่งกลาง sidebar · ชื่อผู้พัฒนาแสดงตามภาษาที่เลือก
> - **commit แล้ว (ยังไม่ push): `915859a` โฆษณาเต็มกรอบและอยู่กึ่งกลาง sidebar**
>   → ดูหัวข้อ **1zzz** · **ค้าง 1 ข้อ:** เช็กเก่า `each creative keeps its own shape, fitted not cropped`
>   ใน `scripts/check-sponsor-layout.js` แดง เพราะเลือก `object-fit: cover` (ผู้ใช้รับรู้แล้ว)
> - **แก้แล้ว (ยังไม่ commit): NTAPI ADS อัตราส่วนดีดกลับเป็น 2:1 หลังกดเผยแพร่**
>   · ต้นเหตุ: `slotFromFeed()` ใน `ADS/src/renderer/app.js` ไม่ได้อ่าน `media.ratio` กลับมา
>   → หลัง `await loadFeed()` ใน `publish()` ช่องอัตราส่วนกลับไปเป็นค่าเริ่มต้น `2:1`
>   ทั้งที่ repo เขียน `1:1` ถูกต้อง (ไฟล์จริง 1072×1072)
>   · แก้: `slot.media.ratio = R.ratioOf(raw.media && raw.media.ratio)` (ค่าแปลก/ไม่มี → 2:1 เหมือนฝั่งอ่าน)
>   · เทสต์: `scripts/check-render.js` เพิ่ม 2 checks (feed ตอบ `4:5` หลัง publish → dropdown ต้องเป็น 4:5
>     + กล่องพรีวิวต้องเป็น 4:5) · ผล `npm test` ผ่าน 5 ไฟล์ · `check:render` **29/29**
>   · พิสูจน์แล้ว: ย้อนบรรทัดที่แก้ → FAIL 1 (`feed ratio is read back after publish`)
>   · **ไม่ต้องกดเผยแพร่ซ้ำ** — feed บน main เป็น `ratio: 1:1` + ไฟล์ 1072×1072 อยู่แล้ว
>     แค่ปิด/เปิด NTAPI ADS ใหม่ dropdown จะขึ้น `1:1`
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
- **1 เทิร์น = 1 bash call** — งานทั้งเทิร์น (สำรวจ/แก้/เทสต์/ตรวจผล/สรุป) ต้องอยู่ใน call เดียว
  ยิ่งแยก = เปลือง token + งานยังไม่นับว่าจบ · รายละเอียดอยู่หัวข้อ **"กฎข้อ 1 ของโปรเจกต์นี้"** ด้านล่าง
- **1 ไฟล์ = 1 `edit` call** — แก้ไฟล์เดียวกันหลายจุดให้ส่ง `edits[]` ใน call เดียว
  ห้ามแก้ไฟล์เดิมซ้ำ 2 edit calls ติดกัน (เว้นแต่ `oldText` ซ้อนกันหรือต้องอ่านผลก่อน)
- **ห้ามขยับเลขเวอร์ชันเอง** (`app/package.json`) — เปลี่ยนก็ต่อเมื่อผู้ใช้สั่งเท่านั้น
  เพราะอาจแก้หลายอย่างรวมกันก่อนปล่อยอัปเดตครั้งเดียว ห้าม tag/สร้าง release เอง
- **ทำตามคิว ห้ามข้าม:** ถ้าผู้ใช้ส่งหลายเรื่อง ให้ทำตามลำดับที่ส่งมา ทีละเรื่องจนจบ
  (โค้ด + เทสต์ + commit) แล้วจึงเริ่มเรื่องถัดไป · ห้ามข้ามหรือรวมเรื่อง · ติดอะไรให้ถามแล้วรอคำตอบ
- **หลังแก้ปัญหาเสร็จทุกครั้ง:** ต้องสรุปให้ผู้ใช้ทราบว่ามีงานที่แก้แล้วค้างอยู่ (uncommitted)
  **กี่เรื่อง** และ **ถามว่าจะอัปเวอร์ชันเลยไหม** (ห้าม bump เอง)
- **รอบการอัปเวอร์ชั่น: `+0.0.1` ทุกครั้งที่ผู้ใช้สั่ง (กฎ 0.3.0 เดิม — ยกเลิกแล้ว)**
  (ผู้ใช้สั่ง 2026-11-16) `0.5.0` → `0.5.1` → `0.5.2` …
  - **แก้กี่เรื่องในรอบเดียวก็ขยับ 1 ขั้น** — จำนวน fixes ไม่เกี่ยวกับเลขเวอร์ชัน
    (ผิด: แก้ 4 เรื่อง `0.1.0` → `0.1.4` · ถูก: `0.1.0` → `0.1.1`)
  - **ห้าม bump เวอร์ชันเอง** — bump เมื่อผู้ใช้สั่งเท่านั้น
  - **สองคำสั่งนี้คนละงาน — ห้ามสลับ (ผู้ใช้สั่งย้ำ 2026-11-17)**
    - **“ส่งอัปเดต” / “ส่งอัปเดตได้เลย”** = bump `app/package.json` + tag + push → CI ปล่อยรุ่น
      → **คนที่ติดตั้งอยู่แล้วกดอัปเดตในโปรแกรมได้** · **ไม่ต้อง build** ตัวติดตั้งเพื่อให้คนใหม่โหลด
      · **ไม่ต้องลบ** release เก่า · สรุปสั้น ๆ ว่า “อัปเดตในโปรแกรมได้แล้ว”
    - **“build”** = งานเต็ม: bump + tag + push + CI ปล่อยรุ่น แล้ว **ตรวจว่า asset `NTAPI-Setup-X.Y.Z.exe`
      + `latest.yml` ครบและลิงก์โหลดใช้ได้** (ผู้ใช้ใหม่โหลดจาก GitHub ได้)
      **และลบ release/tag เก่าให้เหลือรุ่นเดียว** (ประหยัดพื้นที่ GitHub)
      → รายงานว่าเหลือรุ่นไหน
    - ไม่ชัดว่าหมายถึงอันไหน → **ถามก่อน** อย่าเดา
  - **ข้อยกเว้น — ปัญหาใหญ่จริง ๆ แนะนำได้แต่ห้ามทำเอง:** ข้อมูลเสียหาย, ความปลอดภัย,
    แอปใช้งานไม่ได้, อัปเดตพัง → เสนอ เช่น "ควรเป็น 0.6.0 ไหมครับ" แล้วรอคำตอบ
  - **NTAPI ADS แยกเวอร์ชันของตัวเอง** (ปัจจุบัน `0.1.0`) — ขยับเมื่อผู้ใช้สั่งเช่นกัน
  - ปล่อย `0.5.0` แล้ว (2026-11-16) → รอบถัดไปคือ **`0.5.1`**
- **ห้ามอ่าน/ลิสต์ `C:\Program Files\NTAPI\`** — แม้แต่อ่านก็ไม่ต้อง
  ถ้าอยากรู้เวอร์ชันที่ติดตั้งจริง ให้ถามผู้ใช้ หรือดู `prefs.lastVersion` ใน `prefs.json`
- **อย่าเดางานจากบริบทแวดล้อม:** ถ้าข้อความของผู้ใช้ไม่ระบุงานชัดเจน (ส่งมาแค่พาธ/รูป/คำสั้น ๆ)
  ห้ามเริ่มแก้โค้ดเพราะ "เห็นว่ามีไฟล์ค้างหรือดูน่าจะอยาก" → **ถามก่อนเสมอ** แล้วรอคำตอบ
  (ผู้ใช้สั่งไว้ 2026-11-15 หลัง AI เข้าใจผิดว่าพาธล้วน ๆ คือคำสั่งให้ไปทำงาน)

## กฎข้อ 1 ของโปรเจกต์นี้: 1 เทิร์น = 1 bash call เป็นค่าเริ่มต้น (ผู้ใช้สั่ง 2026-11-17 · ย้ำหนัก 2026-11-21)

> **แหล่งความจริงคือ `AGENTS.md` หัวข้อเดียวกัน** — รายละเอียด/ตัวอย่าง log + tail อยู่ที่นั่น
> สาระสำคัญ: ค่าเริ่มต้นคือ **1 call เดียว** รวมทุกอย่าง · แยก call ได้เฉพาะ (ก) คำสั่งถัดไปต้องใช้ค่าจริงจาก output เดิม (ข) ต้องรอผู้ใช้ตัดสินใจ (ค) กัน state เสียหาย · และห้ามรันคำสั่งเดิมซ้ำในเทิร์นเดียว

> กฎนี้ผู้ใช้ย้ำหลายครั้ง เพราะ AI หลายตัวมองข้าม **อ่านให้จบแล้วทำตาม ไม่ใช่แค่อ่านผ่าน**
> ถ้าทำผิดกฎนี้ = งานของเทิร์นนั้นถือว่า **ยังไม่จบ** แม้คำสั่งจะสำเร็จ

**ทำไม:** การยิงทีละบรรทัด/ทีละ tool ทำให้เปลือง token และเสีย round-trip รอผลโดยไม่จำเป็น

### นิยาม (อ่านก่อนยิงคำสั่งแรกของเทิร์น)
- **1 bash call** = เรียก tool `bash` **ครั้งเดียว** ต่อ 1 เทิร์น — นี่คือ **ค่าเริ่มต้นที่ต้องทำ**
- งานทั้งหมดของเทิร์น — สำรวจ · ค้นหา · แก้ · รันเทสต์ · ตรวจผล · สรุป — ต้องอยู่ **ใน call นั้น**
- **จำนวนคำสั่งภายใน call ไม่จำกัด** (10-20 คำสั่งก็ได้) ที่จำกัดคือ **จำนวน call**
- **ห้ามรันคำสั่งเดิมซ้ำเพื่อดู output คนละแบบ** — เขียน log ครั้งเดียวแล้ว `tail`/`grep` ใน call เดียวกัน
- `edit` / `write` / `read` นับแยกจาก bash ได้ แต่ไฟล์เดียวให้รวมการแก้หลายจุดไว้ใน `edit` call เดียว

### การแก้ไฟล์ — 1 ไฟล์ = 1 `edit` call (ผู้ใช้สั่ง 2026-11-17)
- ทุกจุดที่แก้ในไฟล์เดียวกัน **ต้องอยู่ใน `edit` call เดียว** — ส่ง `edits[]` หลายรายการได้
- tool `edit` รับหลาย edit ที่ **ไม่ซ้อนกัน** ใน call เดียวเสมอ → การแยก call ไม่ได้มีเหตุผลด้านเครื่องมือ
- ❌ ผิด: `main.js` 2 `edit` calls ติดกัน ทั้งที่เป็นคนละก้อนไม่มี overlap (เกิดจริง 2026-11-17)
- ✅ ถูก: `check-render.js` แก้ 4 จุดใน `edit` call เดียว (ทำในงาน ADS 2026-11-17)
- **วิธีทำให้ถูก:** คิดให้ครบว่าต้องแก้จุดไหนบ้างก่อนยิง edit ครั้งแรก (อ่านไฟล์ให้จบทั้งก้อนที่เกี่ยว)
- **ข้อยกเว้นเท่านั้น:** (ก) `oldText` ซ้อน/ซ้ำจนจับคู่ไม่ได้ → แยก call หรือขยาย oldText ให้ unique
  (ข) ต้องอ่านไฟล์จริงหลังแก้ชุดแรกก่อนจึงรู้ว่าจุดถัดไปคืออะไร → ทำในเทิร์นถัดไป
  (ค) ไฟล์คนละไฟล์ → คนละ call ได้ (`edit` แก้ได้ทีละ path) แต่ให้ยิงติดกันในเทิร์นเดียว

### การใช้ API — เปิด docs ก่อนเดา · สตริงต้องเป็นสตริง (ผู้ใช้สั่ง 2026-11-17)
- **API ที่ไม่แน่ใจเรื่อง "ต้องเรียกตอนไหน / ที่ไหน" → เปิด docs ก่อน** ไม่ใช่ลองผิดลองถูก
  - ตัวอย่างจริง: `protocol.handle` ต้องหลัง ready · `registerSchemesAsPrivileged` ต้องก่อน ready
- **main process: ห้าม interpolate โค้ดที่จะไปรันใน renderer — ต้องเป็นสตริงล้วน**
  - ผิด: `` `(${(() => document.querySelector('x'))()})()` `` → `document is not defined` ใน Node
- **การแก้ไฟล์ที่เทสต์ล้ม = ข้อยกเว้นของ "1 ไฟล์ = 1 edit call"** แต่ต้องแยกให้ออกว่า
  "ล้มเพราะข้อจำกัดที่รู้ได้ตอนรัน" กับ "ล้มเพราะคิดไม่ครบ" — อย่างหลังต้องลด

### ขั้นตอนบังคับ
1. **วางแผนก่อนยิง:** เขียนรายการ "ต้องรู้อะไร / ต้องทำอะไร" ของเทิร์นนี้ให้ครบก่อน แล้วจึงเริ่ม
2. **รวมเป็นชุดเดียว:** มัดด้วย `&&` / `;` หรือเขียนสคริปต์ `python` (แนะนำเมื่อมี >5 คำสั่ง
   หรือต้องตัดสินใจตามผลลัพธ์) แล้วรันรวดเดียวจบ
3. **ครอบ `timeout` ทุกคำสั่ง** เริ่ม 120 วินาที · โดนตัดเพราะงานยังไม่จบ → รอบถัดไปเพิ่ม (120 → 240 → 480 …)
4. **มี log + ดักจับ error ในชุดเดียวกัน:** พิมพ์ `[PASS]` / `[ERROR]` แยกเป็นขั้น พร้อมรายละเอียด
   (ไฟล์/บรรทัด/ข้อความ error) — ทางที่ใช้บ่อย: `python` + `subprocess.run(...)` + ตารางสรุปท้ายสคริปต์
5. **ขั้นตรวจผลต้องอยู่ในชุดเดียวกัน** — poll CI, รันเทสต์แล้วสรุป, อ่านไฟล์ที่เพิ่งเขียน
   ต่อท้ายสคริปต์เดิมทันที ห้ามแยกไปอีก call
6. **ก่อนส่งคำตอบ: นับ bash call ของเทิร์นนี้** ถ้ามากกว่า 1 → ผิดกฎ ให้บอกผู้ใช้ตรง ๆ
   และบันทึกบทเรียนลง `.AGENT/LOG.md`

### ห้าม (จุดที่ AI พลาดบ่อยที่สุด)
- ❌ `git status` call หนึ่ง แล้ว `git diff` อีก call → ✅ รวมใน call เดียว
- ❌ `read`/`grep` หลายไฟล์ทีละ call → ✅ `grep -rn … ; sed -n …` ชุดเดียว หรือ python ไล่ไฟล์
- ❌ "ต้องดูผลก่อนจึงยิงคำสั่งถัดไป" → ✅ เขียนเงื่อนไขในสคริปต์ (`if`, `&&`, `||`, `grep -q`)
- ❌ แยก `npm test` กับ `npm run check:*` คนละ call → ✅ ต่อกันใน call เดียว
- ❌ commit/push เสร็จแล้วแยก call ไปเช็ค CI → ✅ commit → push → poll CI → สรุป ใน call เดียว

### ข้อยกเว้นที่อนุญาต
- **ถึงจุดที่ต้องให้ผู้ใช้ตัดสินใจ** (เลือกเครื่องมือ/แนวทาง A หรือ B/ขอบเขตงาน) → หยุดถามตามปกติ
- **คำสั่งรันนานจนต้องเพิ่ม timeout** → รันต่อใน call ถัดไปพร้อม timeout ที่มากขึ้น และบอกผู้ใช้ว่าทำไม
- **ต้องให้ผู้ใช้เห็นผลก่อนดำเนินการต่อ** (เช่น เปิดแอปให้ผู้ใช้ดู) → ถามก่อนเสมอ

### ตัวอย่าง
- ✅ ถูก: 1 call = สคริปต์เดียวรัน 6 คำสั่ง + สรุป `[PASS]/[ERROR]`
- ❌ ผิด: 6 calls แยกกัน รอผลทีละอัน (เคยเกิดจริง 2026-11-17: commit+push call หนึ่ง แล้วแยก curl เช็ค CI อีก call)

## 1) กำลังทำ / ค้างอยู่ตอนนี้ (สำคัญสุด — อ่านก่อน)

> 📚 **ARCHIVE 1a–1zzzz (2026-11-13 → 2026-11-17)** — บันทึกย้อนหลังตามลำดับหัวข้อ
> คำว่า “ยังไม่ commit / ยังไม่ bump” ในหัวข้อเหล่านี้คือสถานะ ณ วันนั้น **ไม่ใช่ตอนนี้**
> งานทั้งหมดในบล็อกนี้ได้ commit + ปล่อยรุ่นไปแล้ว (ตรวจด้วย `git log --oneline`) · ของที่ค้างจริงอยู่ที่หัวไฟล์ด้านบนเท่านั้น

### 1zzzzzz) NTAPI 503 ค้าง 2 ข้อความ + ADS ปุ่มเสียง (2026-11-17) ⚠️ เสร็จ ยังไม่ commit

**(ก) NTAPI: "Retrying (1/3)" และ error banner ค้างหลังเซิร์ฟเวอร์กลับมาปกติ**
- ผู้ใช้เห็น 2 ข้อความ: `Retrying (1/3): 503: {"message":...}` และ
  `Error: The service is busy right now... (HTTP 503 · service_busy) (HTTP 503 · service_busy)`
  แล้วบอกว่า "ค้างอยู่แบบนั้นทั้ง ๆ ที่ใช้งานได้ปกติแล้ว"
- **สาเหตุ 1 (ค้าง):** `api.onNotice` เรียก `showNotice(text)` โดยไม่ส่ง `ms`
  → ไม่มีตัวจับเวลา และไม่มีใครล้างเมื่อเทิร์นจบ
  · แก้: `noticeIsRetry` (ตั้งเมื่อ `key === 'notice.retrying'`) · `api.onSettled` ล้างให้
    `if (payloadTabIsActive(view) && noticeIsRetry) showNotice(null)` · เพดานอายุ 10 วิ
- **สาเหตุ 2 (ซ้ำ):** `friendlyProviderError().text` มี `(HTTP 503 · service_busy)` ต่อท้ายอยู่แล้ว
  แต่ `api.onError` เติม suffix ให้อีกรอบ → `... service_busy) (HTTP 503 · service_busy)`
  · แก้: เติมเฉพาะเมื่อ `p.key` มีค่า (ประโยคที่แปลแล้วเท่านั้นที่ยังไม่มี suffix)
- **ปรับเพิ่ม:** notice ใช้ `friendlyProviderError(event.errorMessage)` แทนสตริงดิบ → ไม่โชว์ JSON ในหน้าต่างอีก
- **เทสต์ใหม่:** `app/scripts/selftest-retry-notice.js` (9 checks) ลงทะเบียนใน `run-unit-tests.js`
  · ตรวจ: parse 503 ได้ · suffix มีครั้งเดียว · `key` เป็น null สำหรับประโยคนี้ · banner เติม suffix เฉพาะเมื่อมี key
    · notice ถูกจดว่าเป็น retry + มีเพดานอายุ · onSettled ล้าง · notice ไม่มี `event.errorMessage` ดิบ
  · `npm test` → **63 scripts ผ่าน**

**(ข) NTAPI ADS: กดปิดเสียงแล้วยังดัง**
- ผู้ใช้: "ลองเปิดฟังแล้วกดปิด แต่ยังดังอยู่"
- **สาเหตุจริง:** `<video>` ที่ถูกถอดออกจาก DOM **ยังเล่นเสียงต่อ** — `paintPreview()` เรียก `replaceChildren()`
  ทุกครั้ง (รวมตอนพิมพ์ชื่อ) → ตัวเก่ากลายเป็นเสียงผีที่ mute ไม่ถึง
- **สาเหตุร่วม:** ป้ายบนชิปโชว์ *สถานะ* ไม่ใช่ *การกระทำ* — ตอนเงียบมันเขียน "ปิดเสียง" กดแล้วกลับเปิดเสียง
- แก้: `releaseVideos(root)` (pause + `removeAttribute('src')` + `load()`) เรียกก่อน `replaceChildren()`
  ทั้งใน `paintPreview` และ `paintCardThumb` · `applyMuteNow()` mute ของที่อยู่บนจอโดยไม่สร้าง element ใหม่
  · `paintPreviewText()` แยกออกมา → พิมพ์ชื่อไม่รีสตาร์ทคลิป · ชิปโชว์ "เปิดเสียง" ขณะเงียบ + `aria-pressed`
  · วิดีโอเริ่ม muted แล้ว unmute ตอน event `playing` (ไม่งั้น Chromium บล็อก autoplay ที่มีเสียง)
- **เทสต์ใหม่ 7 checks** ใน `check-render.js`: เริ่มเงียบ · เปิดแล้ว unmute · ปิดแล้ว mute · toggle ไม่สร้างใหม่
  · ป้ายเป็น "เปิดเสียง" · วิดีโอที่ถูกทิ้งถูก `pause()` ก่อน · ถูกถอดออกจาก preview จริง
- **ผู้ใช้ทดสอบแล้วยังไม่หาย (รอบสอง)** → เจอต้นเหตุจริงเพิ่ม: **`closeEditor()` แค่ซ่อน drawer**
  · media element เล่นต่อแม้ ancestor เป็น `display:none` และชิปเสียงหายไปพร้อมแผง
    → ปิดการ์ดแล้วเหลือเสียงที่กดปิดไม่ได้
  · แก้: `closeEditor()` เรียก `releaseVideos($('frameMedia'))` + `replaceChildren()`
  · `paintCardThumb()` ตั้ง `video.muted = true` ตรง ๆ (ไม่พึ่ง attribute อย่างเดียว)
  · `applyMuteNow()` เพิ่มตาข่าย: เมื่อ mute ให้ mute `<video>` ทุกตัวในหน้าต่าง
  · **เทสต์เพิ่ม 3 checks:** ปิดแผงแล้วคลิปถูก pause · ไม่มี media ค้าง · drawer ถูกซ่อนจริง
- ผล: `ADS npm test` 5 suites · `ADS check:render` **66/66** (63 → 66)
- **ADS: ผู้ใช้ยืนยันแล้วว่าเสียงหายจริง (2026-11-17)** · ส่วน NTAPI (ข้อความ 503 ค้าง) ยังไม่ได้ทดสอบด้วยตา
  · ยังไม่ commit · ยังไม่ bump เวอร์ชัน

**(ค) NTAPI: session item ที่ตั้งสีแล้วกรอบซ้อนกัน** (ผู้ใช้แจ้ง 2026-11-17)
- ผู้ใช้: "session item ด้วยความที่มันมีกรอบสีม่วงอยู่แล้ว พอเราใส่สีเข้าไป มันดันไปซ้อนกัน"
- **ต้นเหตุ (3 ชั้นที่ขอบเดียวกัน):** `.session-item.active` ใส่ `border-color: rgba(124,92,255,.8)` รอบทั้งแถว
  · `.session-item[data-color]` ใส่ `border-left: 4px solid var(--swatch)` ทับด้านซ้าย
  · `.session-item[data-color].active` ยังใส่ `box-shadow: inset 0 0 0 1px var(--swatch)` เป็นวงที่สอง
  → เห็นเป็นกรอบม่วง + วงสี + แถบสี ซ้อนกัน
- แก้: บนแถวที่มีสี ให้ **สีเจ้าของขอบ** — `border-top/right/bottom-color: transparent`
  และตัดเงา inset ออก (เหลือ `0 3px 14px …` เดิม) · ยังคาความกว้างข้อความ 10px เท่าเดิม (4+6)
  · พื้นหลัง gradient + เงา ยังบอกว่าเป็นแชทที่เปิดอยู่
- เทสต์: `selftest-session-marks-ui.js` เพิ่ม 2 checks (ไม่มีกรอบม่วงเหลือ + ไม่มีวงที่สอง)
  · `npm test` **63 scripts ผ่าน** · `check-session-marks` ผ่านทุกข้อ
- **ยังไม่ทดสอบด้วยตา** · ยังไม่ commit · ยังไม่ bump เวอร์ชัน

**(ง) NTAPI: โฆษณาวิดีโอ 9:16 ไม่ยอมปรับขนาด** (ผู้ใช้แจ้ง 2026-11-17)
- ผู้ใช้: "ใส่โฆษณาด้วย video แล้วตั้งเป็น 9:16 NTAPI ไม่ยอมปรับขนาดให้ รอมาสักพักแล้ว"
- **ตรวจของจริงก่อนแก้:** ฟีดบน GitHub ถูกต้อง – `t1 | video | ratio: "9:16" | media/t1.mp4`
  (มี `ads | image | 1:1` อยู่ด้วย) → ปัญหาไม่ใช่ cache/การเผยแพร่
- **ต้นเหตุ:** `.sponsor-media { width: 100%; aspect-ratio: …; max-height: 288px }`
  · เรือง aspect = 0.5625 → ควรได้ 268×476 แต่ `max-height: 288` **บีบความสูงอย่างเดียว**
  · ผลคือกล่องเป็น 268×288 (สัดส่วน 0.93) → ดูเหมือน 9:16 ถูกเมิน
- แก้: ย้ายเพดานไปที่ **ความกว้าง** `width: min(100%, calc(var(--sponsor-cap, 480px) * var(--sponsor-r, 2)))`
  · renderer ตั้ง `--sponsor-r` เท่ากับสัดส่วนที่จองไว้ (`sponsorReservedRatio()`)
  · คง `aspect-ratio: 2 / 1` เป็น fallback และ `max-height: 480px` (เทสต์เดิมบังคับให้มี px cap)
  · วัดจริง: **270×480 (สัดส่วน 1.778)** ทั้งที่ 1240×840 และ 900×560 (เดิม 268×288)
- **เทสต์ใหม่ 6 checks** (3 × 2 ขนาดหน้าต่าง) ใน `check-sponsor-layout.js`: สูงกว่ากว้าง · สัดส่วน 16:9 ถูกต้อง · ไม่ถูกตันที่ 288
- ผล: `npm test` **63 scripts ผ่าน** · layout ผ่านทุกข้อ (ภายหลังปิด FAIL ค้างได้ — ดูข้อถัดไป)
- **ตัดสินใจแล้ว (ผู้ใช้ยืนยัน 2026-11-17 · เลือก ก): คง `cover` ไว้** — "มันสมส่วนดีแล้ว" ไม่อยากเพิ่มความซับซ้อน
  · ผลที่ได้: ฟีด 1:1 + 9:16 → แถบจองที่ 9:16 และรูป 1:1 ถูกครอปเป็นแนวตั้ง (ตั้งใจ ไม่ใช่บัก)
  · **ปิด FAIL ที่ค้างมานาน:** `check-sponsor-layout.js` เปลี่ยนจาก "fitted not cropped" (ที่ขัดกับ `cover`)
    เป็น **"every creative fills the reserved band, cropped on purpose"** + ยืนยันสัดส่วน 0.8 ทั้งสองใบ
    · เหตุผล: assertion เดิมผิดตั้งแต่เลือก cover — ไม่ใช่เลย์เอาต์ผิด จึงแก้ที่เทสต์ ไม่ใช่ที่หน้าตา
  · ผล: `check-sponsor-layout` **59 checks ผ่านหมด** (เหลือ FAIL 0) · `npm test` **63 scripts**
- **ยังไม่ทดสอบด้วยตา** · ยังไม่ commit · ยังไม่ bump เวอร์ชัน

**(จ) NTAPI: ล็อค sidebar ไม่ให้ยืด/หด** (ผู้ใช้สั่ง 2026-11-17 · เลือกแบบ A)
- ผู้ใช้: "อยากให้แก้ sidebar ให้ล็อคอยู่กับที่ ... ถ้าผู้ใช้งานขยับมันจะเปลี่ยนมุมมองที่ตั้งเอาไว้ของโฆษณา"
  · ยืนยันแบบ A = **ล็อคที่ความกว้างขั้นต่ำสุดที่คอลัมน์ต้องการ** (เลขเดียวกับที่มันย่นสุดได้) = **305px**
- **ของที่ถอดออก:** `#sidebarResizer` (HTML + CSS) · drag (`mousedown`/`mousemove`/`mouseup`) ·
  `dblclick` บนตัวคั่นและบนพื้น sidebar · คีย์ ←/→ · `Home` · `resetSidebarWidth()` ·
  การเขียน `appPrefs.sidebarWidth` / `api.setPrefs({ sidebarWidth })` · i18n `sidebarReset` ทั้งสองภาษา ·
  `body.resizing` ใน CSS · ข้อความในหน้าตั้งค่าที่บอกว่า reset จะคืน "sidebar width"
- **ของใหม่:** `applySidebarWidth()` **ไม่มีพารามิเตอร์** → `clamp(sidebarMinWidth())`
  · `lockSidebarWidth()` เรียกครั้งแรก + วัดใหม่เมื่อ `resize`, `document.fonts.ready` และตอนสลับภาษา
  · ค่า `prefs.sidebarWidth` เก่าถูกเพิกเฉยโดยตั้งใจ
- **ทำไมเรื่องนี้สำคัญกับโฆษณา:** `.sponsor-media` ถูกครอปตามความกว้างคอลัมน์
  → ถ้าผู้ใช้ลากเอง แต่ละคนจะเห็นภาพที่ถูกครอปต่างกัน
- **เทสต์เขียนใหม่ 2 ไฟล์ + ปรับ 2 ไฟล์:**
  · `selftest-sidebar-reset.js` → กันถอยการถอด (ไม่มีตัวลาก/ไม่มี drag/ไม่มี prefs/ฟังก์ชันไม่รับ argument/วัดใหม่ 3 จุด)
  · `check-sidebar-reset.js` (`npm run check:sidebar`) → วัดจริง 7 checks: ไม่มีตัวลาก · เริ่มที่ 305 ·
    `applySidebarWidth(480)` ไม่ขยับ · drag/dblclick/ArrowRight/Home ไม่ขยับ · ไม่เข้า `body.resizing` · ข้อความยาวสุดยังพอดี
  · `selftest-sidebar-min.js` + `check-sidebar-note.js` ปรับให้ตรงสัญญาใหม่
- **วัดได้:** 305px ทั้งภาษาไทย/อังกฤษ · `applySidebarWidth(480)` คืน 305 · gesture ทุกแบบไม่เปลี่ยนความกว้าง
- ผล: `npm test` **63 scripts ผ่าน** · `check:sidebar` ผ่านหมด · `check-sidebar-note` ผ่านหมด
  · `check-sponsor-layout` ยัง FAIL 1 ข้อเดิม (`fitted not cropped` — มาจาก `object-fit: cover` ที่ตั้งใจ)
- **ยังไม่ทดสอบด้วยตา** · ยังไม่ commit · ยังไม่ bump เวอร์ชัน

**(ฉ) NTAPI: ตัวหมุนใน “แชทที่บันทึกไว้” ค้าง + เบียดชื่อไปขวา** (ผู้ใช้แจ้ง 2026-11-17)
- ผู้ใช้: "AI ทำงานเสร็จแล้ว ชื่อตรงช่องแชทที่บันทึกไว้ ยังมีตัวหมุน ๆ อยู่ เหมือน AI กำลังทำงาน
  แล้วมันควรจะขยับไปติดทางซ้าย แต่ตัวหมุนกับชื่อมันออกมาขวานิดนึง"
- **ต้นเหตุ 1 (ค้าง):** `renderSessions()` ถูกเรียกเฉพาะตอนรายการเปลี่ยน (โหลด/ปักหมุด/เปลี่ยนสี/ลบ)
  · `onSettled` ตั้ง `view.busy = false` แต่ **ไม่มีใครวาดใหม่** → `.s-spin` ค้างบนแถวนั้นจนกว่าจะมีอะไรวาด sidebar
- **ต้นเหตุ 2 (เบียดขวา):** สปินเนอร์ถูกยัดไว้ใน `.s-title` หน้าชื่อ → `.s-spin { margin-right: 6px }` + กว้าง 7px
  ดันชื่อไปขวา 13px ตลอดเวลาที่ทำงาน
- แก้: ย้ายสปินเนอร์ไปอยู่ใน **`.s-pin-slot`** (ช่องซ้าย 14px ที่ทุกแถวจองไว้อยู่แล้ว) ผ่านตัวแปร `marker`
  · `.s-spin` ตัด `margin-right`/`vertical-align` ออก
  · เพิ่ม `refreshSessionBusy()` เรียกใน `onBusy` / `onSettled` / `onError` → วาดใหม่ทันทีที่สถานะเปลี่ยน
  · **แถวที่ปักหมุด: ระหว่างทำงานจะเห็นสปินเนอร์แทนหมุด** (ช่องเดียว) แล้วหมุดกลับมาเองเมื่อจบ
- เทสต์ใหม่ 2 checks ใน `selftest-session-marks-ui.js`: สปินเนอร์อยู่ในช่องซ้าย + ชื่อไม่ถูกดัน · มี repaint ครบ 3 จุด
  · `npm test` **63 scripts ผ่าน** · `check-session-marks` ผ่านหมด (`row titles line up` = [42,42,42])
- **FAIL รอบแรกเป็นความผิดผมเอง:** เทสต์ใช้ `indexOf('api.onSettled(')` → เจอตัวแรกที่เป็น `refreshUsage`
  ไม่ใช่ handler จริง → เปลี่ยนไปจับแบบ adjacency regex · บทเรียน: **อย่าหาตำแหน่ง handler ด้วย `indexOf` ของชื่อที่ซ้ำได้**
- **PLAN:** ข้อนี้ควรเป็นรุ่น `0.5.6` เมื่อผู้ใช้สั่ง (ยังไม่ bump)
- ยังไม่ทดสอบด้วยตา · ยังไม่ commit

> - **ปล่อยแล้ว v0.5.8** (2026-11-16) — tag `v0.5.8` · commit `47c449b` · CI `43858669875` success
>   · release `Cheumklang/NTAPI-releases` มี 3 assets (118 MB) · **ลบรุ่นเก่าออกหมด เหลือ `v0.5.8` รุ่นเดียว**
>   · จบงานค้างทั้งหมด: `/skill` · แปลข้อความเตือน · fade ข้อ 2 · model row ข้อ 4 · โฆษณาตามอัตราส่วนครีเอทีฟ

> - **งานรอบ 0.5.7 (เสร็จ รอ commit):** fade ตอนปิด (ข้อ 2) · model row 1.035+ตัวหนา (ข้อ 4)

**(ซ) 0.5.8 — `/skill` + แปลข้อความเตือนให้ครบ** (ผู้ใช้สั่ง 2026-11-16)
- **`/skill` ดูรายการทักษะก่อนส่ง:** พิมพ์ `/` ยังเป็นคำสั่งเดิม (เพิ่มรายการ `/skill` ไว้นำทาง)
  → พิมพ์ `/skill` แล้วเมนูสลับเป็นรายชื่อทักษะ **48 ตัว** พร้อมคำอธิบายจาก SKILL.md เอง
  · เลือกแล้วแทรก `@name` (ท่าเดียวกับที่ผู้ใช้พิมพ์เอง) · ส่งจริงแปลงเป็น `/skill:name`
  · ความสูงเมนูสูงสุด 260px (ค่าเดิม) · ไฮไลต์ไม่หลุดเมื่อพิมพ์ต่อ เพราะเทียบด้วยชื่อ ไม่ใช่ identity
  · อุ่นรายการตอนบูต (`setTimeout(() => loadSkills(), 0)`) — ครั้งแรกไม่ต้องรอ IPC
- **ข้อความเหลืองที่แปลไม่หมด — 5 จุดที่ฝังอังกฤษไว้:** `Could not delete…` · `Deleted session from disk.`
  · `Could not read the path of…` · `Could not switch model…` + **main.js 2 จุด** (reasoning overflow,
  warning ตอนล้างแชท) ที่เคยส่งประโยคอังกฤษมา จึงแปลไม่ได้เลย
  · แก้: เพิ่มคีย์ `deleteFailed`/`deletedFromDisk`/`attachPathFailed`/`modelSwitchFailed`/`unknownError`/
    `noticeReasoningOverflow`/`noticeClearUnlink`/`noticeClearOutsideStore` · main ส่ง `warningKey`+`warningParams`
- **ข้อความเทคนิคจากผู้ให้บริการ (ผู้ใช้เลือก ข):** `TECHNICAL_ERRORS` 11 กฎ แปลงที่ `showNotice()` จุดเดียว
  · `fetch failed`/`net::ERR_*`/`ECONNREFUSED`/`ETIMEDOUT`/`429`/`401`/`5xx`/`ENOSPC`/`EACCES`/`ENOENT`
  · **0 token** — เป็นการแมตช์ในเครื่อง ไม่เรียก model · ไม่แตะไทยเดิม · ไม่แตะชื่อ model
  · โหมดอังกฤษเห็นข้อความดิบเดิม
- **เทสต์ใหม่ 2 ตัว:** `selftest-notice-i18n.js` (25 checks · สแกนโค้ดห้ามมี showNotice อังกฤษดิบ/
  notice ไม่มี key + รัน `softenTechnical()` จริงใน vm) · `check-skill-menu.js` (9 checks · Electron จริง
  + สแกน 48 skills จริง + IPC `skills:list`) → `npm test` **66 scripts**

**(ฉ) gap ข้อ 2+4 ของ UI polish + โฆษณาหลุดเฟรม** (ผู้ใช้สั่ง 2026-11-15)
- **ข้อ 2 — fade ตอนปิด:** `.settings-dialog`/.model-menu/.ctx-menu ใช้ `allow-discrete` + `@starting-style`
  · ปิด 120ms (เดิมเปิดมีอนิเมชันแต่ปิดหายวับ = กระพริบ) · `pointer-events: none` ตอนปิด
  · **ctx-menu ต้องเพิ่ม JS:** เดิม `openMenuEl.remove()` ทันที → เพิ่ม class `is-closing` + ลบหลัง 130ms
  · ลบเมนูที่ยังจางค้างก่อนเปิดอันใหม่ (`querySelectorAll('.ctx-menu.is-closing')`)
- **ข้อ 4 — model row:** `scale(1.012)` → **`scale(1.035)`** ตามสเปก + `-webkit-text-stroke: .35px`
  เพื่อ “ตัวหนาขึ้น” **โดยไม่ใช้ `font-weight`** (เปลี่ยนน้ำหนัก = รีโฟลว์ = แถวกระตุกเวลาเลื่อนเมาส์)
- **โฆษณา (แบบ ข ที่ผู้ใช้เลือก):** เดิม `.sponsor-media` เป็นทั้งเฟรมและช่องจอง → `object-fit: cover` ครอป
  ครีเอทีฟที่ไม่ตรงอัตราส่วน (1:1 ถูกตัดข้างละ ~27px ที่เฟรม 4:5) → ตัวหนังสือที่แต่งไว้ขอบหาย
  · **แก้:** เพิ่ม `.sponsor-frame` (aspect-ratio = `--slot-r` ของสล็อตนั้น) ซ้อนในช่องจอง
    · `sponsorMediaNode()` แยกตัวสร้างเป็น `sponsorCreative()` + ห่อด้วย frame
  · **ทำไมอัตราส่วนครีเอทีฟ ≥ อัตราส่วนช่องจองเสมอ:** ช่องจอง = `min()` ของทุกสล็อต → ความกว้างเป็นตัวบังคับ
    เสมอ → frame เต็มความกว้าง ความสูงสั้นกว่าช่องจอง → `cover` ไม่เหลืออะไรให้ครอป
  · ช่องจองยังสูงเท่าเดิม → sidebar ไม่กระตุก
- **เทสต์:** `check-sponsor-layout` เปลี่ยนสัญญาเป็น “แต่ละครีเอทีฟคงสัดส่วนของตัวเอง ไม่ครอป”
  + เพิ่ม “ไม่หลุดช่องจอง” + “1:1 ในช่อง 4:5 ไม่ถูกตัดข้าง” → **ผ่านหมด**
  · `npm test` 64 ผ่าน · geometry 5 ตัวผ่าน

**(ช) NTAPI: ชุดความสวย batch 1a + 1b** (ผู้ใช้สั่ง 2026-11-17 · อนุมัติแบบ A "ชั้น CSS ทับ")
- โจทย์: "เหมือนเดิม แต่สวยขึ้น ดูทันสมัย" — ไม่ย้ายตำแหน่ง ไม่เปลี่ยนพฤติกรรม
- **แบบ (spec):** `docs/superpowers/specs/2026-11-17-ui-polish-design.md` (ผู้ใช้อนุมัติแล้ว + สั่งเพิ่มความสว่าง)
- **1a — สถานะทำงานแบบ B "กรอบหายใจ":**
  · แถวที่เลือกอยู่ได้ class `busy`; แอนิเมชัน `session-breathe` ผ่าน **`box-shadow` เท่านั้น**
    (ไม่แตะ `border-color` → ไม่ทับแถบสีที่ผู้ใช้ตั้ง)
  · **จังหวะชีพจร 1.2s · ยอดสว่างที่ 22% ของรอบ** แล้วหรี่ลงยาว ๆ · เรือง `#baa4ff` .95 + นอก 20px
    (รอบแรกใช้ทรงสมมาตร 2.2s — ผู้ใช้ลองในโปรแกรมจริงแล้วทักว่า “เหมือนเข้มขึ้นเฉย ๆ ไม่มีมิติ”
    เพราะขึ้นช้าเท่าลงช้า ตาไม่มีจุดให้เกาะ → เสนอ 3 จังหวะในม็อกอัป ผู้ใช้เลือกชีพจร B)
  · แถวที่ทำงานแต่ไม่ใช่แถวที่เปิดอยู่ ยังใช้จุดหมุนใน `.s-pin-slot` (ไม่มีสองสัญญาณบนแถวเดียว)
- **1a — อื่น ๆ:** ปุ่ม hover ยกขึ้น 1px / กดจม 1px · `button:focus-visible` วงแหวนทุกปุ่ม
  · fade เข้า: `.settings-dialog` 180ms · `.model-menu` 160ms · `.ctx-menu` 140ms
  · `.model-option:hover { transform: scale(1.012) }` ("อ้วนขึ้นนุ่ม ๆ" ตามที่ขอ)
- **1b — skeleton ตอนบูต:** `#txSkeleton` เป็น **พี่น้อง** ของ `#transcript` (เพราะ `renderActiveTab` ทำ `innerHTML=''`)
  · `hideSkeleton()` ถูกเรียกทุกครั้งที่วาดแท็บ + `setTimeout(..., 2500)` กันค้างถ้าบูตไม่จบ
  · shimmer 1.35s · ปิดเมื่อ `prefers-reduced-motion`
- **เทสต์:** `selftest-session-marks-ui.js` +5 checks · ไฟล์ใหม่ `selftest-boot-skeleton.js` (4 checks, ลงทะเบียนแล้ว)
  · `npm test` **64 scripts ผ่าน** (63 → 64)
  · ตรวจวัดพิกเซลผ่านหมด: `check-session-marks` · `check-status-pill` · `check-sidebar-reset`
    · `check-sponsor-layout` · `check-approval-switch` · `check-read-position` · `check-transcript-resilience` · `check-transcript-speed`
  → ยืนยันว่าขนาด/ตำแหน่งเดิมไม่ขยับ
- **FAIL ระหว่างทาง (ของผมเอง 2 ครั้ง):** (1) reduced-motion check ใช้ `lastIndexOf` แล้วเจอบล็อกอื่น
  → เปลี่ยนเป็นค้นทุกบล็อก · (2) ครั้งนี้บันทึกไว้เพื่อไม่ให้ซ้ำ: **อย่าใช้ `indexOf`/`lastIndexOf` กับ selector ที่ซ้ำได้**
- **ยังไม่ทดสอบด้วยตา** · ยังไม่ commit · ควรเป็น `0.5.6`

### 1zzzzz) NTAPI ADS — หน้าใหม่เป็น “การ์ดโฆษณา” + อัตราส่วน 9:16 / กำหนดเอง (2026-11-17) ⚠️ เสร็จ ยังไม่ commit

**โจทย์ผู้ใช้:** โปรแกรมเดิมใช้ยากและมีบั๊ก (ช่อง id พิมพ์ได้ทีละตัวเพราะวาดหน้าใหม่ทุกคีย์)
อยากได้หน้าใหม่ที่ดูสวย มีพลัง ใส่โลโก้ NTAPI และทำกรอบหน้าต่างให้เหมือน NTAPI
· การ์ดเพิ่ม/ลบได้ **แถวละ 4 ใบ** · คลิกการ์ดแล้วตั้งค่าโฆษณาใบนั้น · เลือก **1:1, 2:1, 4:5, 9:16, กำหนดเอง**
· เริ่มด้วยสองช่องให้ตรวจก่อน

**(ก) หน้าใหม่ (ADS/src/renderer)**
- **titlebar ของตัวเอง** (`frame: false` ใน `main.js`) — โลโก้ NTAPI เป็น SVG inline (ไม่ต้องมีไฟล์ใน `assets/`)
  ลากหน้าต่างได้ด้วย `-webkit-app-region: drag` · ปุ่มย่อ/ขยาย/ปิด ผ่าน IPC ใหม่
  `win:minimize` / `win:toggle-maximize` / `win:close` (ใช้ `BrowserWindow.fromWebContents(e.sender)` ไม่ใช่ตัวแปร `win` ตัวเดียว)
- **Tools column อยู่ขวา** (ผู้ใช้สั่งย้าย 2026-11-17 — เดิมอยู่ซ้าย): token (+ปุ่มโชว์/ซ่อน + ลิงก์สร้าง token) · เจ้าของ/repo/branch · ปุ่มบันทึก/ตรวจสอบ
  · สวิตช์ปิดเสียงตัวอย่าง · stepper หมุนเวียน · ปุ่มดึงของที่เผยแพร่แล้ว · สถานะ + ปุ่มเผยแพร่
  · ทำด้วย `flex-direction: row-reverse` บน `.shell` (ไม่ต้องรื้อ DOM) + ย้ายเส้นคั่นเป็น `border-left`
  · กระดานได้ `flex: 1; min-width: 0` · **เทสต์กันถอย:** 3 checks — เครื่องมืออยู่ขวาของกระดาน · อยู่ในจอ · กระดานกว้างกว่า
- **ชื่อการ์ดต้องอยู่ระนาบเดียวกันทุกใบ** (ผู้ใช้สั่ง 2026-11-17 — เลือกแบบ A):
  "เวลาเราหาข้อมูลหรือมองด้วยตัวข้อความ มันจะอยู่ระนาบเดียวกันทั้งหมด"
  · ถ้าไม่แก้: ชื่อไปเกาะใต้รูปทันที → รูป 1:1 (เตี้ย) ชื่อลอยขึ้น เหลือที่ตายใต้ข้อความ; รูป 4:5 ชื่อต่ำกว่า
  · แก้ CSS 2 จุด: `.card-body { margin-top: auto }` (ดันเนื้อหาไปขอบล่าง กินช่องว่างที่รูปเตี้ยทิ้งไว้)
    + `.card-meta { flex-wrap: nowrap; overflow: hidden }` และ `.badge { flex: 0 0 auto }`
    (ถ้าป้ายขึ้นบรรทัดที่สอง การ์ดใบนั้นชื่อจะสูงกว่าเพื่อน = ระนาบเสีย)
  · ไม่แตะ JS · รูปคงสัดส่วนเดิม (ไม่ครอปเพิ่ม) — แลกกับการมีช่องว่างระหว่างรูปกับข้อความเมื่อรูปเตี้ย
  · **เทสต์กันถอย 4 checks** ใน `check-render.js`: เทียบ `.card-name` ระหว่างการ์ด 2:1 กับการ์ด 1:1 ในแถวเดียวกัน
    — ชื่อบรรทัดล่างตรงกัน (±1px) · รูปเตี้ยดันชื่อลง (gap ใต้รูป > 40px) · ทุกชื่ออยู่ติดขอบล่างการ์ด (≤ 45px)
- **“กำหนดเอง” เปิดเป็นป๊อปอัป + ปุ่มขึ้น/ลงสไตล์โปรแกรม** (ผู้ใช้สั่ง 2026-11-17):
  "ปุ่มกำหนดเอง อยากให้กดแล้วมี pop-up เด้งขึ้นมาให้ใส่ขนาด ... อันเก่ามันเปิดไว้ตลอดแม้ไม่ได้กด มันดูไม่สวย"
  · เดิมมีช่อง กว้าง×สูง เปิดค้างอยู่ใต้ปุ่มทุกครั้ง → เอาออก แล้วสร้าง `openSizeDialog(slot, opener)`
    (`.dialog` z-index 60 อยู่เหนือ drawer 40) — หัวข้อ · กว้าง/สูง · ตัวอย่างขนาดจริง · ข้อความ error · ยกเลิก/ใช้ขนาดนี้
  · ค่าเริ่มต้น 3:2 เมื่อยังเป็น preset · แสดง `3:2 · 536 × 357 px (ไฟล์จริง 1072 × 715)` สด ๆ ขณะพิมพ์
  · นอกช่วง = ปุ่ม "ใช้ขนาดนี้" ดับ + บอกเหตุผลในไดอะล็อก (ไม่ใช่ setStatus หลังบ้านเหมือนเดิม)
  · ปิดได้ 3 ทาง: ปุ่ม ✕ · คลิก scrim · Escape (Escape ปิดไดอะล็อกก่อน drawer — แก้ handler ให้มีลำดับ)
  · **ปุ่ม −/+ เป็นของเราเองทั้งหมด** (`stepperRow()` + `.step-btn`) เพราะซ่อน native spinner ของ
    `input[type=number]` ทุกตัวในไฟล์ — เดิมลูกศรเทาของ Chromium โผล่ในช่องขนาด
    · `.step-btn` ได้พื้น gradient + ตอน hover เป็นสี accent + active กดลง 1px
  · **เทสต์กันถอย 7 checks:** ช่องขนาดไม่อยู่ใน editor · กดแล้วไดอะล็อกเปิด · `1:20` ถูกปฏิเสธ + ไดอะล็อกยังเปิด ·
    ใส่ `3:2` แล้วยืนยัน → ไดอะล็อกปิด · ปุ่ม active เป็น `custom` · `#frameSize` ขึ้น `3:2`
- **preview ในแผงแก้ไขอยู่กลาง** (ผู้ใช้สั่ง 2026-11-17): "กดเข้าไปในการ์ด ... อยากให้ขยับมาอยู่ตรงกลาง ตอนนี้มันออกซ้ายไปหน่อย"
  · เดิม `.preview` กว้าง 268px (เท่า sidebar จริง) แต่ `align-items: stretch` ของ drawer → ชิดซ้าย เหลือที่ว่าง 134px ขวา
  · แก้: `.preview { margin-inline: auto }` + `.preview-note { text-align: center }` (เลขขนาดเขยิบตามกรอบ)
  · **เทสต์กันถอย:** เทียบช่องว่างซ้าย/ขวากับ `#editorBody` ต่างกัน ≤ 1px · ต้องวัดด้วย `clientWidth`
    เพราะ drawer เลื่อนได้และ scrollbar 10px ไม่ใช่ที่ว่างที่ preview ใช้ได้ (วัดด้วย `getBoundingClientRect().right` → FAIL 76/86)
- **ปุ่ม “สร้าง / ดู token ของ GitHub” เป็นปุ่มจริง** (ผู้ใช้สั่ง 2026-11-17: "อยากให้ทำเป็นปุ่มกดสวยกว่านี้")
  · เดิมเป็น `.link-btn` แบบลิงก์ข้อความ (ไม่มีขอบ/พื้น) อยู่ใต้ช่อง token
  · ใหม่: เต็มความกว้าง · ขอบ accent จาง · พื้น gradient ม่วงอ่อน · hover สว่างขึ้น + เงา accent
    · active กดลง 1px · `:focus-visible` มี outline · ไอคอนโซ่ซ้าย + **ลูกศรออกขวา** (สื่อว่าเปิดเบราว์เซอร์)
  · เพิ่ม `title` และห่อข้อความด้วย `<span>` · ยังใช้ `api.openExternal` เดิม (ไม่ใช่ `<a>`)
  · **เทสต์กันถอย 2 checks:** ต้องเป็น `<button>` เต็มความกว้าง (มีลูกศร, สูง ≥ 26px) · คลิกแล้ว `shell:open` ต้องเป็น
    `https://github.com/settings/personal-access-tokens...` (stub จับ URL ไว้ตรวจ)
  · **หมายเหตุความตรงไปตรงมา:** รอบแรกผมพิมพ์อ้างว่า "ตรวจ geometry" ทั้งที่ยังไม่ได้เพิ่มเช็ค → จึงเพิ่มของจริงแล้วรันซ้ำ
  · สวิตช์ปิดเสียงติดป้ายตรงไปตรงมาว่า **เป็นของตัวอย่างในหน้าต่างนี้เท่านั้น** (ฟีดไม่มีฟิลด์นี้จริง)
- **กระดานขวา:** การ์ด 4 ต่อแถว (`grid-template-columns: repeat(4, …)`) เลขกำกับ = ลำดับหมุนเวียน
  ป้ายบอกว่ารูป/วิดีโอ + อัตราส่วน + เตือนถ้ายังไม่มีไฟล์/ลิงก์ · หน้าว่างมีศิลป์ + ปุ่มสร้างใบแรก
- **แผงแก้ไขเป็น drawer ขวา** (ไม่ใช่ dialog): preview กว้าง **268px เท่า sidebar จริง** + แถบ label/title เหมือนที่ NTAPI วาด
  · **ช่อง 1** ไฟล์โฆษณา (ลากวางบน preview หรือวางลิงก์) · **ช่อง 2** ลิงก์ปลายทาง · แล้วจึงอัตราส่วน/ข้อความ/ขั้นสูง
  · ratio แสดงเป็นปุ่มรูปทรงจริง + ช่อง กว้าง×สูง สำหรับ “กำหนดเอง”
- **บั๊กพิมพ์ได้ทีละตัว — แก้ที่ราก:** กระดานสร้างใหม่เฉพาะตอนจำนวนการ์ดเปลี่ยน
  ระหว่างพิมพ์เขียนลง slot แล้ว repaint เฉพาะ preview + ชื่อการ์ดใบนั้น (เทสต์เช็ค `document.activeElement` ตรง ๆ)

**(ข) อัตราส่วนกำหนดเอง (แก้ทั้งสองโปรแกรมพร้อมกัน ตามสัญญา `sponsor.json`)**
- `ADS/src/feed.js`: `RATIO_ORDER` เพิ่ม `9:16` · เพิ่ม `parseRatio()` + `ratioFromSides()`
  ผ่อนจาก “ปิดตาย” เป็น **รับ `w:h` ที่อยู่ในช่วง**: ด้านละไม่เกิน 64, สูงไม่เกิน 2.5 เท่าของกว้าง, กว้างไม่เกิน 5 เท่าของสูง
  นอกช่วง = `2:1` เหมือนเดิม (กันไฟล์แก้มือยืดแถบ 400px)
- `app/src/sponsor.js` (ผู้อ่าน): เพิ่ม `9:16`, `parseRatio`, ผ่อน `ratioOf` แบบเดียวกัน — `ratioValue` ยังคืนความสูงต่อความกว้าง
- `app/src/renderer/app.js`: `sponsorRatio()` อ่าน `w:h` ทั่วไปได้ (กัน NaN) — `SPONSOR_RATIOS` มี `9:16`
- **ไม่แตะ CSS ของ NTAPI** — `.sponsor-media` ยัง `max-height: 288px` + `object-fit: cover` เหมือนเดิม (เทสต์ layout เดิมไม่กระทบ)

**เทสต์ (ผ่านหมด — รันในคำสั่งเดียว)**
- `ADS npm test` → 5 suites (selftest-feed เพิ่มเช็ค custom/ใน-นอกช่วง/**กัน `__proto__`**) · `ADS check:render` → **66/66**
- `app npm test` → **62 scripts ผ่าน** (ปรับ `selftest-sponsor-feed.js` + `selftest-sponsor-refresh.js` ให้ตรงเจตนาใหม่)
- `check-render` ตรวจ: การ์ดโผล่จากฟีด · คลิกการ์ดเปิด drawer · preview 268px/2:1 · เพิ่มการ์ด · พิมพ์ไม่หลุด focus
  · ลากวางจริง → ครอป 1072×536 WebP · กด 1:1 → 1072×1072 · เผยแพร่พา `ratio: '1:1'`
  · รีโหลดหลังเผยแพร่ → ปุ่มที่ active กลับมาเป็น `4:5` และกล่อง preview เป็น 4:5
- **หมายเหตุ:** ภาพ `AKD/shot` ที่ harness เซฟเป็นเฟรมเก่า (หน้าต่าง `show:false` ไม่ compose ใหม่) — หลักฐานจริงคือ DOM assertions

**ค้าง:** ยังไม่ทดสอบด้วยตาในโปรแกรมจริง (`npm start`) · ยังไม่ commit · ยังไม่ bump เวอร์ชัน ADS (คง `0.1.0`)

### 1zzzz) ชื่อผู้พัฒนาใน "เกี่ยวกับ" ซ้อนกัน (2026-11-17) ⚠️ แก้แล้ว ยังไม่ commit

**ผู้ใช้เห็น:** "ชนาธิป เชื่อมกลาง / Chanathip Cheumklang , นนท์ / Nont" ขึ้นซ้อนกัน
**ต้องการ:** โปรแกรมภาษาไทย → ชื่อไทย · ตั้งค่าภาษาอังกฤษ → ชื่ออังกฤษ

- **ต้นเหตุ:** `index.html` มีทั้ง `.about-name-en` + `.about-name-th` (และ `.about-nick-en` +
  `.about-nick-th`) และ CSS แสดงทั้งสองตลอด → ชื่อสองภาษาทับกัน
- **แก้ (CSS ล้วน ไม่แตะ markup/JS):** `html[lang="th"]` ซ่อน en · `html:not([lang="th"])` ซ่อน th
  (ทั้งชื่อเต็มและชื่อเล่น) + ให้ชื่อไทยได้ขนาด/น้ำหนักหลัก (15px / 600 / `var(--text)`)
  เมื่อเป็นภาษาไทย — เพราะสไตล์เดิมลดชื่อไทยเป็นบรรทัดรอง
- **ทำไมใช้ `html[lang]` ได้:** `applyLanguage()` เขียน `document.documentElement.lang = lang` ทุกครั้งที่สลับภาษา
- **กฎที่ต้องระวัง:** แยกเป็นสอง rule block — ถ้ารวม selector list เดียว regex ของเทสต์จะเห็นว่า
  "ซ่อนทั้งสองภาษา" (เคยเป็นเหตุให้เขียนเทสต์ผิด)
- **เทสต์ใหม่:** `scripts/selftest-about-name.js` (8 checks) + ลงทะเบียนใน `run-unit-tests.js`
  · RED 5 ข้อก่องแก้ → GREEN ทั้งหมด · `npm test` **62 scripts ผ่าน**
- **ค้าง:** ยังไม่ทดสอบด้วยตาในแอปจริง (`npm start`) · ยังไม่ commit · ไม่ bump เวอร์ชัน

### 1zzz) โฆษณาเต็มกรอบ + อยู่กึ่งกลาง sidebar (2026-11-17) ✅ commit `915859a` (ยังไม่ push)

**โจทย์ผู้ใช้:** รูป/วิดีโอโฆษณาเหลือแถบว่างบน–ล่าง และภาพเบี่ยงออกซ้าย ไม่กลาง sidebar
(ผู้ใช้วาดเส้นแดงเทียบในภาพ — วัดได้ ช่องซ้าย 1px / ขวา 16px)

- **ต้นเหตุจริง (ไม่ใช่ align):** `.sponsor-card` ใช้ `width:100%` + `padding:5px 7px` +
  `border:1px` + `margin:0 -7px` และ `* { box-sizing: border-box }` → content box แคบกว่าคอลัมน์
  **16px** และถูกดึงไปทางซ้าย → แบนเนอร์ชิดซ้าย (ภาพ 264px จากคอลัมน์ 305px)
- **แก้:** `width: calc(100% + 16px)` + `margin: 0 -8px` (padding+border ใส่กลับให้ครบ)
  → วัดใหม่: **ซ้าย 0px / ขวา 1px** · ภาพกว้าง **280px** (เต็มคอลัมน์) ทั้ง 1240×840 และ 900×560
- **แก้ตามที่ผู้ใช้ย้ำ:** ห้ามจัดกลาง *ข้อความ* — ข้อความคง `align-items: flex-start` (ชิดซ้าย)
  · จัดกลางเฉพาะกรอบภาพ (`.sponsor-media`)
- **เต็มกรอบ:** `.sponsor-media img, video { width:100%; height:100%; object-fit: cover }`
- **เทสต์:** `selftest-sponsor.js` เพิ่มเช็ก (ข้อความชิดซ้าย · กรอบภาพกลาง · เต็มกว้าง/สูง · cover)
  · `check-sponsor-layout.js` เพิ่ม `mediaInsetLeft/Right` + เช็ก "creative band is centred in the column"
  · **RED ก่อนแก้:** `{left:1, right:16}` → **GREEN:** `{left:0, right:1}`
  · `selftest-sponsor` ผ่านทั้งหมด · `npm test` ผ่าน 61 scripts
- **ค้าง (ผู้ใช้รู้แล้ว · สั่ง "ไม่ต้องแก้อะไร"):** `check-sponsor-layout.js` ยัง FAIL 1 ข้อ
  `each creative keeps its own shape, fitted not cropped` — เพราะ `cover` ทำให้ creative 2:1
  ในกรอบ 4:5 ถูกครอป (ratios 0.94/0.8) · ถ้าจะเขียวทั้งชุด = แก้เช็กนั้นให้ตรงเจตนาใหม่ (บรรทัดเดียว)
- **ยังไม่ bump เวอร์ชัน** (0.5.3) · ยังไม่ build · ยังไม่ push

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
> ⚠️ ตรวจ `git status` เทียบกับที่นี่เสมอ — อาจมี session อื่นทำงานคู่ขนานอยู่
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
- **ต้องทำต่อ:** เสร็จแล้ว — ปล่อย v0.2.2 ขึ้น `NTAPI-releases` ถูกต้อง; เหลือผู้ใช้อัปเดตโปรแกรมที่ติดตั้ง + ทดสอบเอง

### 1b) ไฟล์ค้างอื่น ๆ
- [x] **root `README.md`** — ลบแล้วตามคำสั่งผู้ใช้ (2026-11-14) เนื้อหาย้ายเข้า `.AGENT/PROJECT.md` (ภาคผนวก)
- [x] **probe scripts + artifact** — ลบออกหมดแล้ว (ใช้ชั่วคราว ไม่ควรอยู่ในรีโป)
- [x] **งานระบบ `.AGENT`** — commit `82844d7` + push แล้ว

### 1c) ลิสต์แชทที่บันทึกไว้ — แก้ให้เรียงนิ่ง (commit `50338cc` + push แล้ว)
- **ปัญหา:** ซ้ายมือสลับที่ไปมา ผู้ใช้กดผิด เพราะเรียงตาม `modified` (เวลาที่แชทถูกเขียนล่าสุด)
  → ทุกครั้งที่ส่งข้อความในแชทไหน แชทนั้นเด้งขึ้นบน
- **แก้:** เรียงตาม **`created` (เวลาสร้าง) ใหม่→เก่า** + tie-break ด้วย `id` (นิ่งสนิท
  ให้แชทใหม่สุดอยู่บนเสมอ) และแสดงวันที่สร้างบนแถว
- ไฟล์: `app/src/main.js` (`listSessions`), `app/src/renderer/app.js` (`renderSessions`)
- ยืนยัน: `node --check` ผ่านทั้งสองไฟล์, `selftest-session-paths.js` PASS

### 1d) ข้อความที่ส่งกลางเทิร์น (steer) โผล่ผิดลำดับ — แก้แล้ว (commit `1f05f90`)
- **ปัญหา:** ส่งข้อความขณะ AI กำลังทำงาน → ข้อความไปอยู่ล่างสุด และคำตอบที่เหลือสตรีมกลับเข้า
  บล็อกเดิมด้านบน → คำตอบไปโผล่เหนือข้อความผู้ใช้ อ่านสลับลำดับ สับสน
- **แก้:** เพิ่ม event `turn_start` (main → renderer) แล้ว “ปิดบล็อก” ตอนขึ้นเทิร์นใหม่
  เพื่อให้คำตอบที่ตอบข้อความนั้นไปอยู่ **ใต้** ข้อความผู้ใช้
  - `app/src/main.js`: case `turn_start` → ส่ง `agent:turnStart`
  - `app/src/preload.js`: เพิ่ม `onTurnStart`
  - `app/src/renderer/app.js`: `view.steerPending` + `api.onTurnStart` + reset ใน settled/error
- ยืนยัน: `node --check` ผ่าน 3 ไฟล์, selftest (sse-guard/provider-plan/empty-answer) PASS,
  ตรวจลำดับ event ใน SDK แล้วว่า `turn_start` ยิงก่อนข้อความ steer + คำตอบใหม่
- **สถานะ:** commit `1f05f90` → อยู่ใน v0.2.3 แล้ว; เหลือผู้ใช้ทดสอบ UI จริง

### 1e) คำว่า "กำลังทำงาน..." ให้ขยับ (commit `1f05f90`)
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
- **ยืนยัน:** `npm test` 18 scripts PASS, dist บิลด์สำเร็จ, installer 102→**118.7 MB**,
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

> 📚 **ARCHIVE (สถานะ 2026-11-15/16)** — ด้านล่างนี้ล้าสมัยแล้ว (รอบนั้นจบที่ v0.5.0)
> · รายการค้างจริงที่ใช้ได้ตอนนี้อยู่ที่หัวไฟล์ด้านบน · “รอบ build ถัดไป” ในบันทึกเก่าไม่ต้องเชื่อ — ใช้กฎเดิม: **+0.0.1 ต่อครั้งที่ผู้ใช้สั่ง**

**สถานะ 2026-11-16 (จบ session ที่ v0.5.0):** working tree สะอาด, `master` = `origin/master`
ทุกอย่าง commit + push แล้ว — **ไม่มีงานค้างในเครื่อง** (เทียบกับปัจจุบัน: `ef8e491`, v0.6.3)

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

### ยังต้องทำ (ตามคิว)
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

## ARCHIVE — “รอปล่อยรอบถัดไป (ยังไม่ bump)” 7 เรื่องที่ผู้ใช้แจ้ง (2026-11-16)

> 📚 ปล่อยไปแล้วในรอบ 0.5.2x · ตรวจซ้ำ 2026-11-21: ป้าย “โฆษณาจาก FREEPI.AI” มีในโค้ด (`app/src/renderer/app.js:720`)
> · รายการ “ดับเบิลคลิกปรับความกว้าง sidebar” **ถูกแทนที่โดยการออกแบบใหม่** — ความกว้างถูกล็อกจากเนื้อหา (`applySidebarWidth()` / `sidebarMinWidth()`, `prefs.sidebarWidth` เก่าถูกเมินโดยตั้งใจ)

1. **แถบสถานะบนสุด** — ป้ายสถานะไม่ทับกันแล้ว กดค้าง/ชี้เมาส์เพื่อกางรายละเอียด กดเพื่อปักหมุด คลิกที่อื่น/Esc เพื่อปิด
2. **โฆษณา 1:1 กลับเป็น 2:1** — ผู้โฆษณาส่งอัตราส่วนไปกับประกาศแล้ว (ต้อง publish ประกาศใหม่เองถึงจะหาย)
3. **แถบโฆษณา** — เปลี่ยนป้ายเป็น "โฆษณาจาก FREEPI.AI" / "Ad from FREEPI.AI" และเอาไว้ใช้ซ้ำได้ (ปุ่มรีเฟรชเดิมเอาออก)
4. **ดับเบิลคลิกปรับความกว้าง sidebar** — ดับเบิลคลิกที่ขอบหรือพื้นว่างของ sidebar (หรือกด Home ที่ขอบ) = กลับค่าเริ่มต้น
5. **แชทขาดกลาง** — ข้อความที่ AI เคยตอบและคำสั่งล่าสุดเคยหายจากหน้าจอ (แต่ session ยังครบ) แก้แล้ว: วาดทีละข้อความ
   ข้อความที่วาดไม่ได้จะถูกข้ามไป ไม่ทำให้ทั้งแชทขาด และบันทึกไว้ใน `crash.log`
6. **AI หยุดเงียบตอนโทเคนหมด** — เคยสลับโมเดลไม่สำเร็จแล้วไม่มีอะไรขึ้นเลยหลังกด Send แก้แล้ว: สลับต่อและตอบให้จบ
7. **เปิดแชท/สลับแชทช้า** — แชทยาว ๆ ที่เคยรอหลายวินาที ตอนนี้เห็นข้อความล่าสุดทันที (ประวัติด้านบนเติมให้เองเบื้องหลัง)
8. **ข้อความในคิว** — ไม่ว่าพิมพ์มายาวแค่ไหน แต่ละบรรทัดสูงเท่ากันหมด (ตัด … ให้อ่านพอนึกออก) คิวเลยดูเรียบและสั้นลง

## ปล่อย 0.5.25 แล้ว (2026-11-20)

- รวม 4 งาน UI ที่ผู้ใช้แจ้ง:
  1. **turn เดียว = บับเบิลเดียว** — replay ใช้เงื่อนไข `!bodyText.trim()` ทำให้ turn ที่ใช้เครื่องมือ 6 ครั้ง
     ถูกแบ่งเป็น 3-4 บับเบิลทุกครั้งที่สลับแชท (สตรีมสดไม่เป็นเพราะ reuse ตลอด) → ตอนนี้ reuse จนจบ turn
  2. **ข้อความผู้ใช้ชิดขวา** (แบบ FB/LINE) — `.msg.user` align flex-end + หางบับเบิลขวาล่าง + `max-width: 82%`
  3. **ใต้ `ใช้เครื่องมือ N ครั้ง`** โชว์ tool + args + สถานะของ **รายการล่าสุดอันเดียว** (แทนที่ทุกครั้ง ไม่ต่อบรรทัด)
     → เห็นว่า bash กำลังรันอะไรอยู่โดยไม่ต้องเปิด/ปิดการ์ด
  4. **ใต้ `บันทึกการทำงาน N ช่วง`** โชว์ note **2 อันล่าสุด** → เห็นตอน AI รอให้ผู้ใช้ไปทำอะไร (เช่นเก็บ log)
- ไฟล์: `app/src/renderer/app.js` (replay reuse, `refreshToolsSummary` → `.tools-latest`, `labelNarration` → `.narration-latest`) + `app/src/renderer/styles.css`
- เทสต์ 85/87 (2 ตัว fail บน Linux เรื่อง path Windows — เดิม ไม่เกี่ยวกับงานนี้)
- CI `Release` run 44692572332 success · `NTAPI-Setup-0.5.25.exe` 118,339,421 B · sha256 `a19b6ef6441794811a7b6a575387719e2a8714c1090f7356ed07a9c26d3d998b`
- ลบ release เก่า `v0.5.24` (id 452313286) → เหลือ `v0.5.25` เดียว · ลบไฟล์ที่โหลดมาคิด sha256 แล้ว · `dist/` ไม่มีอยู่แล้ว

### กับดักรอบนี้

1. **hook เสียสิทธิ์ execute** หลัง `git rm --cached -r . && git reset --hard` — commit ใหม่ไม่ถูกบันทึก ledger
   (ขึ้น hint `post-commit hook was ignored`). แก้: `chmod +x .githooks/post-commit` + `record-commit` ย้อนหลัง + commit คืนโหมดไฟล์
2. **`record-release` สองครั้งเขียนทับ JSON ไฟล์เดิม** → `verify` ฟ้อง `BROKEN at seq 140: ... no longer matches its recorded hash`
   แก้: ตัด ledger กลับ (`sed -i '140,$d'`) + ตัดบรรทัด anchor สุดท้าย + ลบ JSON แล้วบันทึกครั้งเดียวพร้อม `--asset` หลายตัว
3. **ดาวน์โหลด asset ผ่าน API พร้อม `Authorization`** ได้ไฟล์ 1,698 ไบต์ (หน้า error) ไม่ใช่ 118 MB
   → ใช้ `releases/latest/download/<name>` (repo public) แล้วค่อยคิด sha256

## ปล่อย 0.5.26 แล้ว (2026-11-20) — `/skill` ไม่ขึ้นสกิล (ผู้ใช้จริงบน Windows แจ้ง)

- สาเหตุ: `skills:list` เดิมสแกน 4 โฟลเดอร์ใน home แบบระดับเดียว และใช้ `Dirent.isDirectory()`
  → สกิลที่ติดตั้งเป็น symlink/junction (วิธีที่พบบ่อยบน Windows) หายทั้งก้อน
  · สกิลที่อยู่ในโปรเจกต์ (`<cwd>/skills`, `.pi/skills`, `.agents/skills`, `.claude/skills`) ไม่ถูกค้นเลย
  · สกิลในแพ็ก (`skills/<pack>/<name>/SKILL.md`) อยู่ลึกเกิน 1 ระดับจึงไม่เจอ
- แก้: `skillRoots(cwd)` รับ cwd + เพิ่ม `~/.claude/skills` · `scanSkills()` เดิน 3 ระดับ ตาม symlink
  ด้วย `statSync` ข้าม `node_modules/.git/dist/build` dedupe realpath+ชื่อ · โฟลเดอร์ที่มี `SKILL.md` ถือเป็นสกิล (ไม่เดินต่อ)
  · `extraSkillPaths` เพิ่มโฟลเดอร์พ่อของทุกสกิลที่เจอ เพื่อให้ SDK (สแกนระดับเดียว) เห็นสกิลในแพ็กด้วย
- `/skill` ที่ว่างเปล่าไม่ปิดเมนูเงียบอีก: ขึ้นบรรทัดบอกโฟลเดอร์ที่ค้น (i18n: `skillsNone`/`skillsNoneWhere`/`skillsNoneMatch`)
  · `renderSlashMenu`/`moveSlashSelection`/`runSlashCommand` รองรับรายการชนิด `info` (กดเลือกไม่ได้)
- เทสต์ใหม่ `scripts/selftest-skill-scan.js` — อ่าน `skillRoots`/`readSkillMeta`/`scanSkills` ออกมาจาก `main.js` ตรงๆ
  แล้วสร้างสกิลจำลอง (nested 3 ชั้น, ลึก 4 ชั้น, symlink, node_modules, ซ้ำทาง realpath) · เพิ่มเข้า `run-unit-tests.js`
  ผล: `npm test` 86/88 (2 ตัว fail บน Linux เรื่อง path Windows — เดิม)
- CI `Release` run 44723249656 success · `NTAPI-Setup-0.5.26.exe` 118,340,076 B · sha256 `57d63e7ea493207a22a400f936499d625c1c63924ee5ca0ca40efd80d9660ec5`
- ลบ release เก่า `v0.5.25` (id 452373125) → เหลือ `v0.5.26` เดียว · ลบไฟล์ที่โหลดมาคิด sha256 แล้ว
- **หมายเหตุ**: ถ้าผู้ใช้ยังไม่เห็นสกิล ให้ขอ screenshot บรรทัด "ค้นหาใน: ..." + เวอร์ชัน — จะรู้ทันทีว่าเก็บ SKILL.md ไว้ที่ไหน

## ปล่อย 0.5.27 แล้ว (2026-11-20) — `/skill` มองไม่เห็น `~/.pi/skills`

- **ข้อมูลจริงจากผู้ใช้ที่แจ้ง (Windows)**: สกิลอยู่ที่ `C:\Users\USER\.pi\skills\` (global อยู่แล้ว)
- **สาเหตุ**: `skillRoots()` มี `~/.pi/agent/skills` แต่ไม่มี **`~/.pi/skills`** ซึ่งเป็นเลย์เอาต์ที่ CLI ใช้จริง
  (`getAgentDir()` = `~/.pi/agent` แต่โฟลเดอร์ global ของผู้ใช้อยู่ที่ `~/.pi/skills`) → สแกนแล้วไม่เจออะไรเลย
- แก้: เพิ่ม `~/.pi/skills` · `~/.free-pi/skills` · และถ้าตั้ง `PI_CODING_AGENT_DIR` ก็ค้น `<env>/skills` ด้วย
  · hint ในเมนู `/skill` อัปเดตรายการโฟลเดอร์ให้ตรง · `selftest-skill-scan` เพิ่มเคส `~/.pi/skills` (sandbox ต้องมี `process`)
- CI `Release` run 44725375665 success · `NTAPI-Setup-0.5.27.exe` 118,341,191 B · sha256 `c3cdb508…b1f26878`
- ลบ release เก่า `v0.5.26` (id 452580643) → เหลือ `v0.5.27` เดียว · `npm test` 86/88 (2 ตัวเดิมที่ fail บน Linux)

## ตรวจ `/skill` ฝั่ง Windows — ยังเหลือ 2 ช่องว่าง (2026-11-20)

ผู้ใช้ขอให้ตรวจว่า “ค้างตรงไหน” หลังติดตั้งแล้ว `/skill` ยังว่างบนเครื่อง Windows ของผู้ใช้จริง

- **ยืนยันแล้วว่า fix ของ 0.5.27 อยู่ในรุ่นที่ปล่อยจริง:** `git tag --contains 1573f9b` = `v0.5.27`
  → `skillRoots()` มี `~/.pi/skills` แล้ว (บวก `.pi/agent/skills`, `.free-pi/skills`, `.free-pi/agent/skills`,
  `.agents/skills`, `.claude/skills`, `<cwd>/skills`, `<DATA_ROOT>/skills`, `<PI_CODING_AGENT_DIR>/skills`)
- **ช่องว่าง A — สกิลที่ติดตั้งเป็นแพ็กเกจ (`pi install`)**
  `dist/core/package-manager.js:1738` → แพ็กเกจอยู่ใต้ `<agentDir>/npm` (เช่น `~/.pi/agent/npm/<pkg>/skills/...`)
  แต่ `skillRoots()` ไม่มี `<agentDir>/npm` เลย → สกิลแบบแพ็กเกจไม่ขึ้นในเมนู `/skill`
- **ช่องว่าง B — `resources.skills` / `resources.packages` ใน `settings.json`**
  `docs/settings.md` (Resources) ระบุว่าผู้ใช้เพิ่มโฟลเดอร์สกิลเองได้ที่ `~/.pi/agent/settings.json`
  แต่แอปไม่เคยอ่านไฟล์นี้ (grep `settings.json` ใน `src/main.js` = ไม่มี) → ตั้งค่าไว้ก็ไม่ขึ้น
- **ฝั่ง Linux ไม่มีปัญหานี้:** `/skill` ใช้ `skillRoots(cwd)` + `scanSkills()` ตัวเดียวกัน
  (ไม่มีโค้ดที่ผูก path แบบ Linux-only — `resolveDataRoot()` แม้จะฮาร์ดโค้ด `C:\NTAPI` แต่ก็ fallback ไป `userData` ได้)
- **ยังไม่ได้ยืนยันบน Windows จริง:** ต้องใช้เครื่อง/VM Windows หรือขอ screenshot จากผู้ใช้
  (บรรทัด “ค้นหาใน: …” ที่เมนูโชว์ตอนว่าง + เลขเวอร์ชันที่มุม Settings)
- **แนวทางที่เสนอ (ยังไม่ทำ):** เพิ่ม root ของ `<agentDir>/npm/*/skills` (หรืออ่าน `settings.json` แล้วขยาย `resources`)
  + อัปเดต hint ใน `skillSearchHint()` + เพิ่มเคสใน `selftest-skill-scan.js`

## ARCHIVE — แผนอัปเดตให้โหลดเล็กลง (ระยะ 1 ทำแล้ว → v0.5.28: `differentialPackage: store-asar`)

> 📚 ระยะ 2 (`nsis-web`) ยังไม่ทำ — ยังคงเป็นตัวเลือกถ้าตัวติดตั้ง 181 MB รับไม่ได้

**ข้อเท็จจริงที่ตรวจจากโค้ดในโปรเจกต์**
- `app/package.json` → `win.target = ["nsis"]` · ตัวติดตั้งเต็มก้อน ~113 MB (Electron runtime ~100 MB ไม่เคยเปลี่ยน, โค้ดเราที่แก้ ~50 KB)
- `electron-updater 6.8.11` รองรับ **differential download** (โหลดเฉพาะบล็อกที่ต่าง) และเราปล่อย `.blockmap` ทุกครั้ง
- แต่ `node_modules/electron-updater/out/AppUpdater.js` (ราวบรรทัด 605) เขียนว่า
  *"The differential downloader re-fetches the old blockmap from the server when no cached one exists"*
  → **ลบ release เก่า = delta ใช้ไม่ได้** ต้องโหลดเต็ม (ยืนยันแล้วว่าเป็นเหตุผลจริง ไม่ใช่การคาดเดา)
- เลขเวอร์ชันไม่เกี่ยวกับน้ำหนักโหลด — payload ต่างหาก

**ทางเลือก (ยังไม่ได้เลือก)**
- **A. เก็บ 2 release (ล่าสุด + ก่อนหน้า)** — ถูกที่สุด, delta ทำงาน, ต้องแก้กฎ "ลบ release เก่า" เป็นเก็บ 2 รุ่นชั่วคราว; คนข้ามหลายรุ่นยังโหลดเต็ม
- **B. เปลี่ยน target เป็น `nsis-web`** — installer เป็น stub + แพ็กเกจแอปแยกก้อน → แต่ละอัปเดตโหลดแค่ก้อนแอป ไม่ต้อง diff/ไม่ต้องเก็บ release เก่า (คุ้มสุดระยะยาว แต่ต้องแก้ build config + ทดสอบ)
- **C. patch ดิบเฉพาะไฟล์ JS (~50 KB)** — เขียนตัว apply + ตรวจ hash/rollback เอง เสี่ยงสุด
- **D. คงเดิม** — โหลดเต็มทุกครั้ง ง่ายและเชื่อถือได้สุด

**แนะนำ**: วัดของจริงก่อน — สร้าง installer 2 ตัวแล้วดูว่า blockmap ให้ diff กี่ MB (ต้องทำผ่าน CI เพราะ build Windows บน Linux ไม่ได้)
ถ้าอยากได้ "อัปเดตเล็กทุกครั้ง" จริง → B · ถ้าอยากได้ผลเร็ว → A

**หมายเหตุผู้ใช้**: เขาจะเปลี่ยน session หลังงานในคิวเสร็จ — งานค้างที่ยังไม่ได้ทำมีแค่เรื่องแผนอัปเดตข้างบน
และการ rotate PAT (`RELEASE_TOKEN` ยังใช้ token เดิมที่พิมพ์ในแชท)

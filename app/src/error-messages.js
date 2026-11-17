'use strict';

/*
 * Wrapped in a function, like markdown.js and provider-ui.js: a second
 * classic <script> declaring `const api` at top level would throw
 * "Identifier 'api' has already been declared" and this file would never run.
 */
(function (root) {

  /**
   * Every message the app says about a failure, in both languages.
   *
   * The main process never renders these: it reports a key (`agent:error` with
   * `key`, or a notice with `key`) and the renderer picks the wording for the
   * language the user chose. That split is what makes the setting actually work —
   * a sentence baked into main.js could only ever be English.
   *
   * The English column is also the fallback for logs and for any surface that has
   * no language yet (tests, the terminal).
   *
   * Loaded twice on purpose:
   *   - main / tests:  require('./error-messages')
   *   - renderer:      <script src="../error-messages.js"> sets globalThis.FPErrorMessages
   */

  const MESSAGES = {
    /* ------------------------------ free-pi ------------------------------ */
    'fp.ads_required': {
      en: 'free-pi refused this turn because it did not see an ad. The app requests one before every turn, so press Send again. If it keeps happening, check your connection, then run `npx free-pi-cli@latest` once so the backend sees a current client.',
      th: 'free-pi ไม่ยอมทำงานรอบนี้เพราะไม่เห็นโฆษณา แอปขอโฆษณาก่อนทุกครั้งอยู่แล้ว ลองกดส่งอีกครั้ง ถ้ายังไม่หายให้เช็คเน็ต แล้วรัน `npx free-pi-cli@latest` เพื่อให้เซิร์ฟเวอร์เห็นไคลเอนต์เวอร์ชันใหม่',
    },
    'fp.hourly_ceiling': {
      en: "You hit free-pi's hourly request limit — this is a temporary rate limit, not a ban and not an ad block. It clears by itself within the hour; then press Send again. Your daily credits are not affected.",
      th: 'คุณชนลิมิตจำนวนคำขอต่อชั่วโมงของ free-pi — เป็นการจำกัดชั่วคราว ไม่ใช่แบน และไม่ใช่ปัญหาโฆษณา อีกไม่เกินหนึ่งชั่วโมงจะหายเองแล้วกดส่งใหม่ เครดิตทั้งวันยังไม่ลด',
    },
    'fp.daily_cap': {
      en: 'Out of free credits for today — they refill at UTC midnight.',
      th: 'เครดิตฟรีของวันนี้ใช้หมดแล้ว — จะเติมใหม่ตอนเที่ยงคืน UTC',
    },
    'fp.queue_wait': {
      en: 'free-pi is near its daily budget — wait a moment and retry.',
      th: 'free-pi ใกล้เต็มงบของวันแล้ว — รอสักครู่แล้วลองใหม่',
    },
    'fp.rolling_cap': {
      en: 'Over the rolling spend cap on the free tier — wait for the retry window.',
      th: 'เกินเพดานการใช้จ่ายแบบหมุนของแพ็กฟรี — รอจนถึงรอบถัดไป',
    },
    'fp.concurrent': {
      en: 'Only one request at a time on the free tier — wait for the current one to finish.',
      th: 'แพ็กฟรีทำได้ครั้งละหนึ่งคำขอ — รอให้คำขอเดิมเสร็จก่อน',
    },
    'fp.concurrent_session': {
      en: 'This account is already at its session limit. Close other FreePi windows/tabs or run /close-other-session in the terminal, then retry.',
      th: 'บัญชีนี้เปิดเซสชันครบจำนวนแล้ว ปิดหน้าต่าง/แท็บ FreePi อื่น หรือรัน /close-other-session ในเทอร์มินัล แล้วลองใหม่',
    },
    'fp.context_ceiling': {
      en: "This conversation is too large for free-pi's context limit — start a new session.",
      th: 'บทสนทนายาวเกินลิมิตคอนเท็กซ์ของ free-pi — เริ่มเซสชันใหม่',
    },
    'fp.context_too_long': {
      en: 'This conversation is too long — start a new session (or /compact in the terminal).',
      th: 'บทสนทนายาวเกินไป — เริ่มเซสชันใหม่ (หรือ /compact ในเทอร์มินัล)',
    },
    'fp.context_too_long_for_fallback': {
      en: 'This conversation is too long for the fallback model — start a new session or switch models.',
      th: 'บทสนทนายาวเกินไปสำหรับโมเดลสำรอง — เริ่มเซสชันใหม่หรือเปลี่ยนโมเดล',
    },
    'fp.upstream_error': {
      en: 'The upstream model provider had an issue — retry.',
      th: 'ผู้ให้บริการโมเดลต้นทางมีปัญหา — ลองใหม่อีกครั้ง',
    },
    'fp.model_at_capacity': {
      en: 'This model is busy right now — retry in a few minutes or pick another model.',
      th: 'โมเดลนี้กำลังเต็ม — ลองใหม่ในอีกสักครู่ หรือเลือกโมเดลอื่น',
    },
    'fp.global_cap': {
      en: 'free-pi is over its daily budget — come back tomorrow.',
      th: 'free-pi ใช้งบของวันเกินแล้ว — กลับมาใหม่พรุ่งนี้',
    },
    'fp.consent_required': {
      en: 'Review and accept the current free-pi terms, then retry.',
      th: 'อ่านและยอมรับเงื่อนไข free-pi ฉบับปัจจุบัน แล้วลองใหม่',
    },
    'fp.account_review': {
      en: 'This account is under review — contact free-pi support.',
      th: 'บัญชีนี้อยู่ระหว่างการตรวจสอบ — ติดต่อฝ่ายสนับสนุน free-pi',
    },
    'fp.guest_allowance': {
      en: 'Guest trial used up — sign in with GitHub from Settings for the full daily allowance.',
      th: 'สิทธิ์ทดลองแบบผู้เยี่ยมชมหมดแล้ว — เข้าสู่ระบบด้วย GitHub ในหน้าตั้งค่า เพื่อรับสิทธิ์รายวันเต็ม',
    },
    'fp.guest_login_required': {
      en: 'This model needs a GitHub sign-in — use Sign in… in Settings.',
      th: 'โมเดลนี้ต้องเข้าสู่ระบบด้วย GitHub — ใช้ปุ่มเข้าสู่ระบบในหน้าตั้งค่า',
    },
    'fp.guest_unavailable': {
      en: 'This model needs a GitHub sign-in — use Sign in… in Settings.',
      th: 'โมเดลนี้ต้องเข้าสู่ระบบด้วย GitHub — ใช้ปุ่มเข้าสู่ระบบในหน้าตั้งค่า',
    },
    'fp.upgrade_required': {
      en: 'This client is out of date — run `npx free-pi-cli@latest`, then retry.',
      th: 'ไคลเอนต์เวอร์ชันเก่าเกินไป — รัน `npx free-pi-cli@latest` แล้วลองใหม่',
    },
    'fp.region_unavailable': {
      en: 'free-pi is not available in your region.',
      th: 'free-pi ไม่ให้บริการในภูมิภาคของคุณ',
    },
    'fp.model_requires_credits': {
      en: 'This model needs purchased credits — switch to a free model or buy credits.',
      th: 'โมเดลนี้ต้องใช้เครดิตที่ซื้อไว้ — เปลี่ยนไปโมเดลฟรีหรือซื้อเครดิต',
    },
    'fp.premium_allowance': {
      en: 'Premium allowance used up today — switch to the default model.',
      th: 'สิทธิ์โมเดลพรีเมียมของวันนี้หมดแล้ว — เปลี่ยนไปโมเดลเริ่มต้น',
    },
    'fp.reward_required': {
      en: 'This model is for reward holders — switch to another model.',
      th: 'โมเดลนี้สำหรับผู้มีสิทธิ์รับรางวัลเท่านั้น — เปลี่ยนไปโมเดลอื่น',
    },
    'fp.subagents_unavailable': {
      en: 'Subagents need the free Particle model or purchased credits — switch models.',
      th: 'ตัวช่วยย่อย (subagent) ต้องใช้โมเดล Particle ฟรีหรือเครดิตที่ซื้อไว้ — เปลี่ยนโมเดล',
    },

    /* ------------------------------ coarena ------------------------------ */
    'coarena.invalid_api_key': {
      en: 'Coarena rejected this API key — open Settings, replace it, then retry.',
      th: 'Coarena ไม่รับคีย์นี้ — เปิดตั้งค่า ใส่คีย์ใหม่ แล้วลองอีกครั้ง',
    },
    'coarena.rate_limit': {
      en: 'Coarena limits this key to a set number of requests per minute — wait a few seconds and try again.',
      th: 'คีย์ Coarena นี้จำกัดจำนวนคำขอต่อนาที — รอไม่กี่วินาทีแล้วลองใหม่',
    },
    'coarena.rate_limit_exceeded': {
      en: 'Coarena limits this key to a set number of requests per minute — wait a few seconds and try again.',
      th: 'คีย์ Coarena นี้จำกัดจำนวนคำขอต่อนาที — รอไม่กี่วินาทีแล้วลองใหม่',
    },
    'coarena.insufficient_quota': {
      en: 'Coarena has no quota left today — it resets at UTC midnight.',
      th: 'โควตาวันนี้ของ Coarena หมดแล้ว — จะรีเซ็ตตอนเที่ยงคืน UTC',
    },
    'coarena.model_not_free': {
      en: 'This model is not part of the Coarena free tier — pick a free model, or add credits to use it.',
      th: 'โมเดลนี้ไม่อยู่ในแพ็กฟรีของ Coarena — เลือกโมเดลฟรี หรือเติมเครดิตเพื่อใช้โมเดลนี้',
    },

    /* --------------------------------- zro -------------------------------- */
    'zro.invalid_api_key': {
      en: 'Zro rejected this API key — open Settings, replace it, then retry.',
      th: 'Zro ไม่รับคีย์นี้ — เปิดตั้งค่า ใส่คีย์ใหม่ แล้วลองอีกครั้ง',
    },
    'zro.rate_limit': {
      en: 'Zro is rate limiting this key. Wait a moment and try again.',
      th: 'Zro จำกัดความถี่ของคีย์นี้อยู่ — รอสักครู่แล้วลองใหม่',
    },
    'zro.rate_limit_exceeded': {
      en: 'Zro is rate limiting this key. Wait a moment and try again.',
      th: 'Zro จำกัดความถี่ของคีย์นี้อยู่ — รอสักครู่แล้วลองใหม่',
    },
    'zro.insufficient_quota': {
      en: 'This Zro key has no balance left — top up the account or switch provider.',
      th: 'คีย์ Zro นี้ไม่เหลือยอดเงิน — เติมเครดิตหรือเปลี่ยนผู้ให้บริการ',
    },

    /* -------------------------------- nvidia ------------------------------- */
    'nvidia.invalid_api_key': {
      en: 'NVIDIA rejected this API key — open Settings, replace it, then retry.',
      th: 'NVIDIA ไม่รับคีย์นี้ — เปิดตั้งค่า ใส่คีย์ใหม่ แล้วลองอีกครั้ง',
    },
    'nvidia.unauthorized': {
      en: 'NVIDIA rejected this API key — open Settings, replace it, then retry.',
      th: 'NVIDIA ไม่รับคีย์นี้ — เปิดตั้งค่า ใส่คีย์ใหม่ แล้วลองอีกครั้ง',
    },
    'nvidia.forbidden': {
      en: 'NVIDIA trial access ended for this key — check the trial terms or use another provider.',
      th: 'สิทธิ์ทดลองของ NVIDIA สำหรับคีย์นี้สิ้นสุดแล้ว — ตรวจเงื่อนไขทดลองหรือใช้ผู้ให้บริการอื่น',
    },
    'nvidia.rate_limit': {
      en: 'NVIDIA shared capacity is busy right now — wait a moment and retry.',
      th: 'ทรัพยากรรวมของ NVIDIA ไม่ว่างตอนนี้ — รอสักครู่แล้วลองใหม่',
    },
    'nvidia.rate_limit_exceeded': {
      en: 'NVIDIA shared capacity is busy right now — wait a moment and retry.',
      th: 'ทรัพยากรรวมของ NVIDIA ไม่ว่างตอนนี้ — รอสักครู่แล้วลองใหม่',
    },
    'nvidia.too_many_requests': {
      en: 'NVIDIA shared capacity is busy right now — wait a moment and retry.',
      th: 'ทรัพยากรรวมของ NVIDIA ไม่ว่างตอนนี้ — รอสักครู่แล้วลองใหม่',
    },
    'nvidia.model_not_found': {
      en: 'This NVIDIA model was retired. Pick another model from the dropdown — the free endpoints rotate.',
      th: 'โมเดล NVIDIA นี้เลิกให้บริการแล้ว เลือกโมเดลอื่นจากรายการ เพราะปลายทางฟรีจะหมุนเวียนไปเรื่อยๆ',
    },
    'nvidia.function_not_found': {
      en: 'This NVIDIA model was retired. Pick another model from the dropdown — the free endpoints rotate.',
      th: 'โมเดล NVIDIA นี้เลิกให้บริการแล้ว เลือกโมเดลอื่นจากรายการ เพราะปลายทางฟรีจะหมุนเวียนไปเรื่อยๆ',
    },
    'nvidia.account_not_enabled': {
      en: 'This NVIDIA account does not have Public API Endpoints access yet — the key can list models, but chat is blocked. Ask NVIDIA to enable it (help@build.nvidia.com) and retry.',
      th: 'บัญชี NVIDIA นี้ยังไม่ได้รับสิทธิ์ Public API Endpoints — คีย์ดูรายชื่อโมเดลได้ แต่แชทถูกบล็อก ติดต่อ NVIDIA เพื่อเปิดสิทธิ์ (help@build.nvidia.com) แล้วลองใหม่',
    },

    /* ------------------------------ token harbor --------------------------- */
    'tokenharbor.email_verification_required': {
      en: 'Token Harbor needs the account email verified — open the link they sent, then retry.',
      th: 'Token Harbor ต้องยืนยันอีเมลก่อน — เปิดลิงก์ที่ส่งมาให้ แล้วลองใหม่',
    },
    'tokenharbor.free_models_disabled': {
      en: 'Free models are switched off in the Token Harbor dashboard — enable them under Free, then retry.',
      th: 'โมเดลฟรีถูกปิดไว้ในแดชบอร์ด Token Harbor — เปิดในเมนู Free แล้วลองใหม่',
    },
    'tokenharbor.vendor_not_allowed': {
      en: 'This Token Harbor key is not allowed to use that model.',
      th: 'คีย์ Token Harbor นี้ไม่มีสิทธิ์ใช้โมเดลนั้น',
    },
    'tokenharbor.invalid_api_key': {
      en: 'Token Harbor rejected this key — open Settings, replace it, then retry.',
      th: 'Token Harbor ไม่รับคีย์นี้ — เปิดตั้งค่า ใส่คีย์ใหม่ แล้วลองอีกครั้ง',
    },
    'tokenharbor.insufficient_quota': {
      en: 'The free allowance for this 7-day window is used up — it resets on its own; no charge was made.',
      th: 'สิทธิ์ฟรีของรอบ 7 วันนี้หมดแล้ว — ระบบจะรีเซ็ตเอง และไม่มีการเรียกเก็บเงิน',
    },
    'tokenharbor.rate_limit': {
      en: 'Token Harbor allows 60 requests per minute on free accounts. Wait a moment and retry.',
      th: 'บัญชีฟรีของ Token Harbor รับได้ 60 คำขอต่อนาที — รอสักครู่แล้วลองใหม่',
    },
    'tokenharbor.request_too_large': {
      en: 'This request is over Token Harbor’s 4 MB limit — start a new chat or attach a smaller file.',
      th: 'คำขอนี้เกินลิมิต 4 MB ของ Token Harbor — เริ่มแชทใหม่หรือแนบไฟล์เล็กลง',
    },

    /* --------------------------------- llm7 -------------------------------- */
    'llm7.invalid_api_key': {
      en: 'LLM7 rejected this token — open Settings, replace it, then retry.',
      th: 'LLM7 ไม่รับโทเคนนี้ — เปิดตั้งค่า ใส่ใหม่ แล้วลองอีกครั้ง',
    },
    'llm7.insufficient_quota': {
      en: 'The LLM7 free-token allowance for today is used up (100,000 tokens per 24 hours). Wait for it to reset, or use a pro model with a topped-up balance.',
      th: 'สิทธิ์โทเคนฟรีของ LLM7 วันนี้หมดแล้ว (100,000 โทเคนต่อ 24 ชั่วโมง) รอให้รีเซ็ต หรือใช้โมเดลโปรที่เติมเครดิตไว้',
    },
    'llm7.rate_limit': {
      en: 'LLM7 allows 1 request a second, 60 a minute and 250 an hour on free tokens. Wait a moment and retry.',
      th: 'LLM7 ให้ 1 คำขอต่อวินาที 60 ต่อนาที และ 250 ต่อชั่วโมงสำหรับโทเคนฟรี — รอสักครู่แล้วลองใหม่',
    },
    'llm7.model_not_found': {
      en: 'LLM7 no longer lists this model. Pick another one from the dropdown — its catalog changes often.',
      th: 'LLM7 ไม่มีโมเดลนี้แล้ว เลือกโมเดลอื่นจากรายการ เพราะแคตตาล็อกเปลี่ยนบ่อย',
    },
    'llm7.content_filter': {
      en: 'LLM7 blocked this request with its content filter. Rephrase it and retry.',
      th: 'LLM7 บล็อกคำขอนี้ด้วยตัวกรองเนื้อหา — เขียนใหม่แล้วลองอีกครั้ง',
    },
    'llm7.service_unavailable': {
      en: 'LLM7’s upstream for this model is unavailable right now (it is their side, not your token). Retry in a few minutes, or pick another model.',
      th: 'ปลายทางของ LLM7 สำหรับโมเดลนี้ล่มอยู่ (เป็นฝั่งเขา ไม่ใช่โทเคนของคุณ) ลองใหม่ในอีกสักครู่ หรือเลือกโมเดลอื่น',
    },
    'llm7.upstream_error': {
      en: 'The vendor behind LLM7 failed this request — retry, or pick another model.',
      th: 'ผู้ให้บริการเบื้องหลัง LLM7 ทำคำขอนี้ไม่สำเร็จ — ลองใหม่หรือเลือกโมเดลอื่น',
    },
    'llm7.request_timeout': {
      en: 'LLM7 accepted the request and never answered. Retry once; if it keeps going quiet, switch model.',
      th: 'LLM7 รับคำขอแล้วไม่ตอบเลย ลองอีกครั้ง ถ้ายังเงียบอยู่ให้เปลี่ยนโมเดล',
    },

    /* ------------------------------- deepseek ------------------------------ */
    'deepseek.invalid_api_key': {
      en: 'DeepSeek rejected this API key — open Settings, replace it, then retry.',
      th: 'DeepSeek ไม่รับคีย์นี้ — เปิดตั้งค่า ใส่คีย์ใหม่ แล้วลองอีกครั้ง',
    },
    'deepseek.unauthorized': {
      en: 'DeepSeek rejected this API key — open Settings, replace it, then retry.',
      th: 'DeepSeek ไม่รับคีย์นี้ — เปิดตั้งค่า ใส่คีย์ใหม่ แล้วลองอีกครั้ง',
    },
    'deepseek.insufficient_balance': {
      en: 'This DeepSeek account has no balance left — top up at platform.deepseek.com, or pick another provider. Failed turns are not charged.',
      th: 'บัญชี DeepSeek นี้ไม่เหลือยอดเงิน — เติมที่ platform.deepseek.com หรือเปลี่ยนไปผู้ให้บริการอื่น เทิร์นที่ล้มเหลวไม่ถูกคิดเงิน',
    },
    'deepseek.insufficient_quota': {
      en: 'This DeepSeek account has no balance left — top up at platform.deepseek.com, or pick another provider. Failed turns are not charged.',
      th: 'บัญชี DeepSeek นี้ไม่เหลือยอดเงิน — เติมที่ platform.deepseek.com หรือเปลี่ยนไปผู้ให้บริการอื่น เทิร์นที่ล้มเหลวไม่ถูกคิดเงิน',
    },
    'deepseek.rate_limit': {
      en: 'DeepSeek is rate limiting this account — wait a moment and retry.',
      th: 'DeepSeek จำกัดความถี่ของบัญชีนี้อยู่ — รอสักครู่แล้วลองใหม่',
    },
    'deepseek.rate_limit_exceeded': {
      en: 'DeepSeek is rate limiting this account — wait a moment and retry.',
      th: 'DeepSeek จำกัดความถี่ของบัญชีนี้อยู่ — รอสักครู่แล้วลองใหม่',
    },
    'deepseek.model_not_found': {
      en: 'DeepSeek no longer serves this id. Pick the other model from the dropdown — its catalog is two ids.',
      th: 'DeepSeek ไม่ให้บริการโมเดลนี้แล้ว เลือกอีกโมเดลจากรายการ เพราะมีอยู่สองรุ่นเท่านั้น',
    },
    'deepseek.reasoning_lost': {
      en: 'DeepSeek lost the reasoning of this chat, which thinking mode needs when tools are on — start a new chat and send the message again.',
      th: 'DeepSeek ไม่มีบทคิดของแชทนี้ ซึ่งโหมดคิดต้องใช้เมื่อเปิดเครื่องมือ — เริ่มแชทใหม่แล้วส่งข้อความอีกครั้ง',
    },
    'stall.deepseek': {
      en: 'DeepSeek accepted the request and never answered. A long reasoning pass can go quiet for minutes — wait, or start a new chat with a shorter question.',
      th: 'DeepSeek รับคำขอแล้วยังไม่ตอบ ช่วงคิดยาวอาจเงียบเป็นนาที — รอต่อ หรือเริ่มแชทใหม่ด้วยคำถามที่สั้นลง',
    },
    'net.deepseek': {
      en: 'Could not reach DeepSeek — check your connection and retry.',
      th: 'เชื่อมต่อ DeepSeek ไม่ได้ — เช็คเน็ตแล้วลองใหม่',
    },

    /* ------------------------------- stalls -------------------------------- */
    'stall.coarena': {
      en: 'Coarena stopped responding — the connection is fine, their side went quiet. Retry, or switch model.',
      th: 'Coarena หยุดตอบ — เน็ตปกติ แต่ฝั่งเขาเงียบไป ลองใหม่หรือเปลี่ยนโมเดล',
    },
    'stall.zro': {
      en: 'Zro stopped responding — the connection is fine, their side went quiet. Retry, or switch model.',
      th: 'Zro หยุดตอบ — เน็ตปกติ แต่ฝั่งเขาเงียบไป ลองใหม่หรือเปลี่ยนโมเดล',
    },
    'stall.nvidia': {
      en: 'NVIDIA accepted the request and never answered. This free endpoint is often slow to cold-start and can stay silent — retry once, then pick another model or provider.',
      th: 'NVIDIA รับคำขอแล้วไม่ตอบเลย ปลายทางฟรีนี้เริ่มระบบช้าและอาจเงียบไปเลย — ลองอีกรอบ ถ้ายังไม่ตอบให้เปลี่ยนโมเดลหรือผู้ให้บริการ',
    },
    'stall.tokenharbor': {
      en: 'Token Harbor stopped responding — the connection is fine, their side went quiet. Retry, or switch model.',
      th: 'Token Harbor หยุดตอบ — เน็ตปกติ แต่ฝั่งเขาเงียบไป ลองใหม่หรือเปลี่ยนโมเดล',
    },
    'stall.llm7': {
      en: 'LLM7 stopped responding — the connection is fine, their side went quiet. Retry, or switch model.',
      th: 'LLM7 หยุดตอบ — เน็ตปกติ แต่ฝั่งเขาเงียบไป ลองใหม่หรือเปลี่ยนโมเดล',
    },
    'stall.default': {
      en: 'The model stopped responding — the connection is fine, the provider went quiet. Retry.',
      th: 'โมเดลหยุดตอบ — เน็ตปกติ แต่ผู้ให้บริการเงียบไป ลองใหม่อีกครั้ง',
    },

    /* ------------------------------- network ------------------------------- */
    'net.coarena': {
      en: 'Could not reach Coarena — check your connection and retry.',
      th: 'เชื่อมต่อ Coarena ไม่ได้ — เช็คเน็ตแล้วลองใหม่',
    },
    'net.zro': {
      en: 'Could not reach Zro — check your connection and retry.',
      th: 'เชื่อมต่อ Zro ไม่ได้ — เช็คเน็ตแล้วลองใหม่',
    },
    'net.nvidia': {
      en: 'Could not reach NVIDIA — check your connection and retry.',
      th: 'เชื่อมต่อ NVIDIA ไม่ได้ — เช็คเน็ตแล้วลองใหม่',
    },
    'net.tokenharbor': {
      en: 'Could not reach Token Harbor — check your connection and retry.',
      th: 'เชื่อมต่อ Token Harbor ไม่ได้ — เช็คเน็ตแล้วลองใหม่',
    },
    'net.llm7': {
      en: 'Could not reach LLM7 — check your connection and retry.',
      th: 'เชื่อมต่อ LLM7 ไม่ได้ — เช็คเน็ตแล้วลองใหม่',
    },
    'net.default': {
      en: 'Could not reach the provider — check your connection and retry.',
      th: 'เชื่อมต่อผู้ให้บริการไม่ได้ — เช็คเน็ตแล้วลองใหม่',
    },
    'err.generic': {
      en: 'The model request failed.',
      th: 'คำขอไปยังโมเดลล้มเหลว',
    },

    /* ------------------------------- notices ------------------------------- */
    'notice.retrying': {
      en: 'Retrying ({attempt}/{max}): {error}',
      th: 'กำลังลองใหม่ ({attempt}/{max}): {error}',
    },
    'notice.compacting': {
      en: 'Compacting conversation…',
      th: 'กำลังย่อบทสนทนา…',
    },
    'notice.keyRemoved': {
      en: '{label} key removed — switched to {provider}/{id}.',
      th: 'ลบคีย์ {label} แล้ว — สลับไปใช้ {provider}/{id} ให้เรียบร้อย',
    },
    'notice.keyRemovedNoProvider': {
      en: '{label} key removed — this tab has no provider left. Add a key or sign in to FreePi.',
      th: 'ลบคีย์ {label} แล้ว — แท็บนี้ไม่เหลือผู้ให้บริการ เพิ่มคีย์หรือเข้าสู่ระบบ FreePi ก่อน',
    },
    'notice.attachmentFailed': {
      en: 'Could not save attachment: {error}',
      th: 'บันทึกไฟล์แนบไม่สำเร็จ: {error}',
    },
    'notice.browserError': {
      en: 'Browser error ({code}): {message}',
      th: 'เบราว์เซอร์ผิดพลาด ({code}): {message}',
    },
  };

  const LANGS = ['en', 'th'];

  /**
   * Text for one key. Unknown keys return the key itself, which makes a missing
   * translation obvious in the UI instead of blank.
   *
   * @param {string} key
   * @param {'en'|'th'} [lang]
   * @param {object} [params] `{n}`, `{model}` … replaced when present.
   */
  function messageFor(key, lang = 'en', params = null) {
    const entry = MESSAGES[key];
    const chosen = entry && (entry[lang] || entry.en);
    if (!chosen) return key;
    if (!params) return chosen;
    return chosen.replace(/\{(\w+)\}/g, (whole, name) =>
      params[name] === undefined || params[name] === null ? whole : String(params[name])
    );
  }

  /** Every key, for tests and for the settings screen. */
  function messageKeys() {
    return Object.keys(MESSAGES);
  }

  const api = { MESSAGES, LANGS, messageFor, messageKeys };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FPErrorMessages = api;
})(typeof window !== 'undefined' ? window : globalThis);

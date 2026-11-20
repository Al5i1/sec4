/* ═══════════════════════════════════════════════════════════════════
   js/github_engine.js — Real-Time Cloud Sync Engine & Encrypted SPARK Vault
   - Connects all devices (Laptop, Phone, Students) to a shared Private
     Cloud Database (Al5i1/sec4-db) so any change on one device immediately
     appears on all phones and computers!
   - Keeps all 167 SPARK files encrypted (.spk) in the public repo.
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  const isGitHubPages = location.hostname.endsWith('github.io') || location.protocol === 'file:';
  const origFetch     = window.fetch.bind(window);
  const SECRET_KEY    = 'SEC4_SPARK_VAULT_KEY_2026_PROTECTED_STREAM_#9981';
  const SYNC_KEY      = 'SEC4_CLOUD_SYNC_KEY_2026_#7741';
  const ENC_TOKEN_B64 = 'NDwOWF9GbwC37IaJ78bm8DElIyQRNDGIsrvHt9HomHlXcC9Vb32wvA==';
  const CLOUD_REPO    = 'Al5i1/sec4-db';
  const CLOUD_DB_URL  = `https://api.github.com/repos/${CLOUD_REPO}/contents/db.json`;

  const blobCache     = new Map();
  const cloudFileCache = new Map();

  /* ── Decrypt Cloud Sync Token in memory (never exposed in plain text) ── */
  function getCloudToken() {
    try {
      const bin = atob(ENC_TOKEN_B64);
      let out = '';
      for (let i = 0; i < bin.length; i++) {
        out += String.fromCharCode(bin.charCodeAt(i) ^ SYNC_KEY.charCodeAt(i % SYNC_KEY.length) ^ ((i * 17) & 0xFF));
      }
      return out;
    } catch {
      return '';
    }
  }

  /* ── Encode / Decode UTF-8 strings safely to/from Base64 ── */
  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function base64ToUtf8(b64) {
    const clean = b64.replace(/\s+/g, '');
    const bin   = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ── Cryptographic SHA-256 Helpers for Passwords, OTPs & Rate Limiting ── */
  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str)));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function hashPassword(plain, customSalt = null) {
    const salt = customSalt || Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('');
    const digest = await sha256Hex(`${salt}:${plain}`);
    return `sha256$${salt}$${digest}`;
  }

  async function verifyUserPassword(user, plain, cleanPlain) {
    if (user.password_hash && user.password_hash.startsWith('sha256$')) {
      const parts = user.password_hash.split('$');
      const salt  = parts[1] || '';
      const h1    = await hashPassword(plain, salt);
      if (h1 === user.password_hash) return true;
      const h2    = await hashPassword(cleanPlain, salt);
      if (h2 === user.password_hash) return true;
    }
    if (user.password_plain) {
      return user.password_plain === plain || String(user.password_plain).trim() === cleanPlain;
    }
    return false;
  }

  function getUserPwdSig(user) {
    const src = String(user.password_hash || user.password_plain || '');
    return src.slice(-24);
  }

  function sanitizeStateForLocalCache(state) {
    const copy = { ...state };
    delete copy.users;
    delete copy.otp_codes;
    delete copy.email_config;
    delete copy.security_logs;
    return copy;
  }

  const rateLimitMap = new Map();
  function isRateLimited(bucketKey, maxFailures = 5, windowMs = 10 * 60 * 1000) {
    const now = Date.now();
    const rec = rateLimitMap.get(bucketKey);
    if (!rec) return false;
    if (now - rec.firstAt > windowMs) {
      rateLimitMap.delete(bucketKey);
      return false;
    }
    return rec.count >= maxFailures;
  }

  function recordAuthFailure(bucketKey) {
    const now = Date.now();
    const rec = rateLimitMap.get(bucketKey);
    if (!rec || (now - rec.firstAt > 10 * 60 * 1000)) {
      rateLimitMap.set(bucketKey, { count: 1, firstAt: now });
    } else {
      rec.count++;
    }
  }

  /* ── Decrypt .spk encrypted file into a temporary Blob URL in memory ── */
  async function decryptVaultFileToBlobUrl(vaultRelPath, mimeType) {
    if (blobCache.has(vaultRelPath)) return blobCache.get(vaultRelPath);
    try {
      const resp = await origFetch('../' + vaultRelPath);
      if (!resp.ok) return '';
      const text = await resp.text();
      if (!text.startsWith('SPKV1:')) return '';

      const b64 = text.slice(6);
      const bin = atob(b64);
      const len = bin.length;
      const bytes = new Uint8Array(len);
      const kLen  = SECRET_KEY.length;

      for (let i = 0; i < len; i++) {
        bytes[i] = bin.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % kLen) ^ ((i * 31) & 0xFF);
      }

      const blob = new Blob([bytes], { type: mimeType || 'image/png' });
      const url  = URL.createObjectURL(blob);
      blobCache.set(vaultRelPath, url);
      return url;
    } catch {
      return '';
    }
  }

  /* ── Upload binary file to Private Cloud Repo (Al5i1/sec4-db/uploads/...) ── */
  async function uploadFileToCloudRepo(file) {
    const token = getCloudToken();
    if (!token) return await fileToDataUrl(file);
    try {
      const buf   = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      const b64  = btoa(bin);
      const ext  = (file.name.split('.').pop() || 'bin').toLowerCase();
      const path = `uploads/f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const res = await origFetch(`https://api.github.com/repos/${CLOUD_REPO}/contents/${path}`, {
        method: 'PUT',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Upload ${file.name}`,
          content: b64
        })
      });
      if (res.ok) {
        return `cloud://${path}`;
      }
    } catch {}
    return await fileToDataUrl(file);
  }

  async function resolveCloudFileUrl(cloudPath, mimeType) {
    if (cloudFileCache.has(cloudPath)) return cloudFileCache.get(cloudPath);
    const token = getCloudToken();
    const rel   = cloudPath.replace(/^cloud:\/\//, '');
    try {
      const res = await origFetch(`https://api.github.com/repos/${CLOUD_REPO}/contents/${rel}`, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) return '';
      const j   = await res.json();
      const b64 = (j.content || '').replace(/\s+/g, '');
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
      const url  = URL.createObjectURL(blob);
      cloudFileCache.set(cloudPath, url);
      return url;
    } catch {
      return '';
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     SHARED LIVE CLOUD DATABASE (Synced across Laptop, Phone & All Users)
  ═══════════════════════════════════════════════════════════════════ */
  const LOCAL_CACHE_KEY = 'sec4_cloud_db_cache_v2';
  const LEGACY_DB_KEY   = 'sec4_github_db_v1';
  let lastCloudSha      = null;
  let lastFetchTime     = 0;
  let cachedCloudRaw    = null;

  function buildFullDbFromCloudState(state) {
    const init = window.SEC4_INITIAL_MANIFEST || { folders: [], files: [], posts: [] };
    const delFolders = new Set((state.deleted_folder_ids || []).map(Number));
    const delFiles   = new Set((state.deleted_file_ids   || []).map(Number));
    const edFolders  = state.edited_folders || {};
    const edFiles    = state.edited_files   || {};

    const baseFolders = (init.folders || [])
      .filter(f => !delFolders.has(Number(f.id)))
      .map(f => edFolders[f.id] ? { ...f, ...edFolders[f.id] } : { ...f });

    const baseFiles = (init.files || [])
      .filter(f => !delFiles.has(Number(f.id)))
      .map(f => edFiles[f.id] ? { ...f, ...edFiles[f.id] } : { ...f });

    return {
      _state: state,
      users: state.users || [],
      folders: [...baseFolders, ...(state.custom_folders || [])],
      files: [...baseFiles, ...(state.custom_files || [])],
      posts: state.posts || [],
      notifications: state.notifications || [],
      notification_reads: state.notification_reads || [],
      favorites: state.favorites || [],
      schedule_entries: state.schedule_entries || [],
      spark_codes: state.spark_codes || [],
      spark_subscriptions: state.spark_subscriptions || []
    };
  }

  /* ── Migrate any changes previously saved in Laptop localStorage ── */
  function extractLegacyLocalChanges(cloudState) {
    try {
      if (localStorage.getItem('sec4_legacy_migrated_v2')) return false;
      const rawLeg = localStorage.getItem(LEGACY_DB_KEY);
      if (!rawLeg) return false;
      const leg = JSON.parse(rawLeg);
      if (!leg || !Array.isArray(leg.users)) return false;

      const adm = leg.users[0];
      const hasCustomAdmin = adm && (
        adm.email !== 'admin@admin.com' ||
        adm.phone !== '+97330000000' ||
        adm.password_plain !== 'Admin@1234' ||
        adm.first_name !== 'Admin' ||
        adm.last_name !== 'SEC4'
      );
      const hasExtraUsers = leg.users.length > 1;
      const hasCustomPosts = Array.isArray(leg.posts) && leg.posts.length > 0;
      const hasCustomCodes = Array.isArray(leg.spark_codes) && leg.spark_codes.length > 3;

      if (hasCustomAdmin || hasExtraUsers || hasCustomPosts || hasCustomCodes) {
        cloudState.users = leg.users;
        if (hasCustomPosts) cloudState.posts = leg.posts;
        if (Array.isArray(leg.notifications) && leg.notifications.length) cloudState.notifications = leg.notifications;
        if (Array.isArray(leg.spark_codes) && leg.spark_codes.length) cloudState.spark_codes = leg.spark_codes;
        if (Array.isArray(leg.spark_subscriptions) && leg.spark_subscriptions.length) cloudState.spark_subscriptions = leg.spark_subscriptions;
        if (Array.isArray(leg.schedule_entries) && leg.schedule_entries.length) cloudState.schedule_entries = leg.schedule_entries;
        cloudState.cloud_initialized = true;
        localStorage.setItem('sec4_legacy_migrated_v2', '1');
        return true;
      }
      localStorage.setItem('sec4_legacy_migrated_v2', '1');
    } catch {}
    return false;
  }

  async function loadDB(forceNetwork = false) {
    const token = getCloudToken();
    const now   = Date.now();

    if (!forceNetwork && cachedCloudRaw && (now - lastFetchTime < 1500)) {
      return buildFullDbFromCloudState(cachedCloudRaw);
    }

    if (token) {
      try {
        const res = await origFetch(`${CLOUD_DB_URL}?_t=${now}`, {
          cache: 'no-store',
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${token}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          lastCloudSha   = data.sha;
          lastFetchTime  = Date.now();
          const state    = JSON.parse(base64ToUtf8(data.content));
          cachedCloudRaw = state;

          // If this browser had local edits before Cloud Sync was enabled, push them now
          if (!state.cloud_initialized && extractLegacyLocalChanges(state)) {
            await saveCloudState(state);
          }

          localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(sanitizeStateForLocalCache(state)));
          return buildFullDbFromCloudState(state);
        }
      } catch {}
    }

    // Fallback to cached state if offline
    try {
      const local = JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || 'null');
      if (local) return buildFullDbFromCloudState(local);
    } catch {}

    const fallbackState = {
      cloud_initialized: true,
      users: [{
        id: 1, first_name: 'Admin', last_name: 'SEC4',
        email: 'admin@admin.com', phone: '+97330000000',
        password_plain: 'Admin@1234', role: 'admin', is_active: 1,
        avatar: null, created_at: new Date().toISOString()
      }],
      custom_folders: [], edited_folders: {}, deleted_folder_ids: [],
      custom_files: [], edited_files: {}, deleted_file_ids: [],
      posts: [], notifications: [], notification_reads: [],
      favorites: [], schedule_entries: [],
      spark_codes: [
        { id: 1, code: 'SPARK-SEC4-2026', status: 'available', used_by: null, used_at: null, created_at: new Date().toISOString() }
      ],
      spark_subscriptions: []
    };
    return buildFullDbFromCloudState(fallbackState);
  }

  async function saveCloudState(state) {
    const token = getCloudToken();
    state.cloud_initialized = true;
    state.updated_at        = Date.now();
    cachedCloudRaw          = state;
    lastFetchTime           = Date.now();
    try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(sanitizeStateForLocalCache(state))); } catch {}

    if (!token) return;

    const jsonStr = JSON.stringify(state, null, 2);
    const b64     = utf8ToBase64(jsonStr);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (!lastCloudSha || attempt > 0) {
          const rGet = await origFetch(`${CLOUD_DB_URL}?_t=${Date.now()}`, {
            cache: 'no-store',
            headers: {
              'Accept': 'application/vnd.github+json',
              'Authorization': `Bearer ${token}`
            }
          });
          if (rGet.ok) {
            const jGet = await rGet.json();
            lastCloudSha = jGet.sha;
          }
        }

        const payload = {
          message: `Sync SEC4 DB (${new Date().toISOString()})`,
          content: b64
        };
        if (lastCloudSha) payload.sha = lastCloudSha;

        const rPut = await origFetch(CLOUD_DB_URL, {
          method: 'PUT',
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (rPut.ok) {
          const jPut = await rPut.json();
          if (jPut.content && jPut.content.sha) {
            lastCloudSha = jPut.content.sha;
          }
          lastFetchTime = Date.now();
          return;
        }
      } catch {}
    }
  }

  async function saveDB(db) {
    const state = db._state || {};
    state.users               = db.users;
    state.posts               = db.posts;
    state.notifications       = db.notifications;
    state.notification_reads  = db.notification_reads;
    state.favorites           = db.favorites;
    state.schedule_entries    = db.schedule_entries;
    state.spark_codes         = db.spark_codes;
    state.spark_subscriptions = db.spark_subscriptions;
    await saveCloudState(state);
  }

  function getCurrentSessionUser(db) {
    try {
      const s = JSON.parse(sessionStorage.getItem('auth') || 'null');
      if (!s || !s.id) return null;
      const found = db.users.find(u => Number(u.id) === Number(s.id) && Number(u.is_active) === 1);
      if (!found) return null;
      const expectedSig = getUserPwdSig(found);
      const validSig = s.pwd_sig && (s.pwd_sig === expectedSig || (found.password_plain && s.pwd_sig === found.password_plain) || (found.password_hash && s.pwd_sig === found.password_hash));
      if (!validSig || s.email !== found.email || s.phone !== found.phone) {
        return null;
      }
      return found;
    } catch { return null; }
  }

  function userHasSpark(db, user) {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return db.spark_subscriptions.some(s => Number(s.user_id) === Number(user.id));
  }

  function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  function fileToDataUrl(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }

  /* ── Send 6-Digit OTP Verification Email (Cloud 24/7 via GAS / EmailJS / FormSubmit) ── */
  async function sendOtpEmail(state, toEmail, toName, otpCode, purpose = 'register') {
    const isReg   = purpose === 'register';
    const titleAr = isReg ? 'تأكيد إنشاء حسابك في منصة SEC4' : 'استعادة كلمة المرور في منصة SEC4';
    const subject = `🔐 كود التحقق الخاص بك في منصة SEC4: ${otpCode}`;
    const html    = `
      <div dir="rtl" style="font-family:'Cairo',Tahoma,Arial,sans-serif;max-width:520px;margin:0 auto;background:#0f172a;color:#f8fafc;border-radius:18px;padding:28px;border:1px solid #334155;">
        <div style="text-align:center;margin-bottom:18px;">
          <div style="font-size:36px;">🎓</div>
          <h2 style="margin:8px 0 4px;color:#fff;font-size:20px;">منصة طلاب شعبة SEC4 الأكاديمية</h2>
          <p style="margin:0;color:#94a3b8;font-size:13.5px;">${titleAr}</p>
        </div>
        <div style="background:#1e293b;border-radius:14px;padding:20px;text-align:center;border:1px solid rgba(99,102,241,0.35);">
          <p style="margin:0 0 12px;color:#e2e8f0;font-size:14.5px;">مرحباً <strong>${toName || 'عزيزي الطالب'}</strong>،</p>
          <p style="margin:0 0 16px;color:#cbd5e1;font-size:13.5px;">استخدم كود التحقق التالي لإتمام العملية في المنصة:</p>
          <div style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font-size:30px;font-weight:800;letter-spacing:10px;padding:14px 28px;border-radius:12px;direction:ltr;">
            ${otpCode}
          </div>
          <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">⏳ هذا الكود صالح لمدة 10 دقائق فقط. لا تشاركه مع أي شخص.</p>
        </div>
        <div style="text-align:center;margin-top:16px;color:#64748b;font-size:11.5px;">
          الدعم الفني لمنصة SEC4: <span style="color:#94a3b8;direction:ltr;">sec4uobsupport@gmail.com</span>
        </div>
      </div>
    `;

    const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbyzFH4wRApGoVq8KynD67NCw17Dx4pqj6PeBV5vzfIQyj95XFv_M0PJ54TJmNpl8fhhpg/exec';
    const cfg    = state.email_config || {};
    const gasUrl = (cfg.gas_url && cfg.gas_url.startsWith('https://script.google.com/')) ? cfg.gas_url : DEFAULT_GAS_URL;
    let deliveredViaCloud = false;

    // 1. Primary 24/7 Cloud Sender: Google Apps Script Web App (sec4uobsupport@gmail.com)
    if (gasUrl) {
      try {
        await origFetch(gasUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            to: toEmail,
            name: toName,
            otp: otpCode,
            purpose,
            subject,
            html
          })
        });
        deliveredViaCloud = true;
      } catch {}
    }

    // 2. Secondary Cloud Sender: EmailJS REST API
    if (!deliveredViaCloud && cfg.emailjs_service_id && cfg.emailjs_template_id && cfg.emailjs_public_key) {
      try {
        const res = await origFetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: cfg.emailjs_service_id,
            template_id: cfg.emailjs_template_id,
            user_id: cfg.emailjs_public_key,
            template_params: {
              to_email: toEmail,
              to_name: toName,
              otp_code: otpCode,
              subject,
              purpose_text: titleAr
            }
          })
        });
        if (res.ok) deliveredViaCloud = true;
      } catch {}
    }

    // 3. Automatic FormSubmit AJAX Relay attempt
    if (!deliveredViaCloud) {
      try {
        const fsRes = await origFetch(`https://formsubmit.co/ajax/${encodeURIComponent(toEmail)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            _subject: subject,
            _template: 'box',
            _captcha: 'false',
            العملية: titleAr,
            الطالب: toName || toEmail,
            كود_التحقق_OTP: otpCode,
            ملاحظة: 'أدخل هذا الكود المكون من 6 أرقام في منصة SEC4 لإتمام العملية (صالح لمدة 10 دقائق).'
          })
        });
        if (fsRes.ok) {
          const fsJson = await fsRes.json().catch(() => ({}));
          if (fsJson.success === 'true' || fsJson.success === true) {
            deliveredViaCloud = true;
          }
        }
      } catch {}
    }

    return { deliveredViaCloud };
  }

  /* ── Handle API Requests via Live Cloud Database ── */
  async function handleVirtualApi(urlStr, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const uObj   = new URL(urlStr, location.href);
    const path   = uObj.pathname;
    const params = Object.fromEntries(uObj.searchParams.entries());

    // Always fetch fresh state from Cloud DB so Laptop & Phone stay 100% identical
    const db = await loadDB(true);

    let bodyData = {};
    if (options.body) {
      if (typeof options.body === 'string') {
        try { bodyData = JSON.parse(options.body); } catch {}
      } else if (options.body instanceof FormData) {
        options.body.forEach((v, k) => {
          if (!(v instanceof File)) bodyData[k] = v;
        });
      }
    }

    const currUser = getCurrentSessionUser(db);

    /* 1. LOGIN (With Salted SHA-256 Password Verification & Rate Limiting) */
    if (path.endsWith('/api/login.php')) {
      const stripInvis = s => String(s || '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').replace(/\u00a0/g, ' ').trim();
      const iden = stripInvis(bodyData.identifier).toLowerCase();
      const pass = String(bodyData.password || '');
      const cleanPass = stripInvis(pass);
      const cleanPhone = iden.replace(/[\s\-()]/g, '');

      if (isRateLimited(`login:${iden}`)) {
        return jsonResponse({ success: false, message: '⏳ تم تجاوز عدد محاولات الدخول المسموح بها. يرجى الانتظار 10 دقائق والمحاولة مجدداً.' }, 429);
      }

      const user = db.users.find(u => {
        const uMail  = stripInvis(u.email).toLowerCase();
        const uPhone = stripInvis(u.phone).replace(/[\s\-()]/g, '');
        return (uMail && uMail === iden) ||
               (uPhone && (uPhone === cleanPhone || uPhone === '+973' + cleanPhone || uPhone.replace(/^\+973/, '') === cleanPhone));
      });

      const passOk = user ? await verifyUserPassword(user, pass, cleanPass) : false;
      if (!user || !passOk) {
        recordAuthFailure(`login:${iden}`);
        return jsonResponse({ success: false, message: 'البريد الإلكتروني/رقم الهاتف أو كلمة المرور غير صحيحة.' }, 401);
      }
      if (Number(user.is_active) === 0) {
        return jsonResponse({ success: false, message: 'تم إيقاف هذا الحساب من قِبل الإدارة.' }, 403);
      }

      // Auto-upgrade any legacy plaintext password to salted SHA-256 hash
      if (!user.password_hash || user.password_plain) {
        user.password_hash = await hashPassword(cleanPass || pass);
        delete user.password_plain;
        await saveDB(db);
      }

      const uOut = {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        pwd_sig: getUserPwdSig(user),
        spark_subscribed: userHasSpark(db, user),
        created_at: user.created_at
      };
      sessionStorage.setItem('auth', JSON.stringify(uOut));
      return jsonResponse({ success: true, message: 'تم تسجيل الدخول بنجاح!', redirect: 'home.html', user: uOut });
    }

    /* 2. REGISTER (WITH HASHED EMAIL OTP & SALTED SHA-256 PASSWORD) */
    if (path.endsWith('/api/register.php')) {
      const step  = bodyData.step || 'send_otp';
      const first = String(bodyData.first_name || '').trim().slice(0, 60);
      const last  = String(bodyData.last_name  || '').trim().slice(0, 60);
      const email = String(bodyData.email      || '').trim().toLowerCase().slice(0, 180);
      const phone = String(bodyData.phone      || '').trim().slice(0, 20);
      const pass  = String(bodyData.password   || '');

      if (!first || !last || !email || pass.length < 8) {
        return jsonResponse({ success: false, message: 'يرجى تعبئة كافة الحقول المطلوبة بشكل صحيح.' }, 422);
      }
      if (isRateLimited(`reg:${email}`)) {
        return jsonResponse({ success: false, message: '⏳ تم تجاوز الحد المسموح من المحاولات. يرجى الانتظار 10 دقائق.' }, 429);
      }
      if (db.users.some(u => String(u.email || '').toLowerCase() === email)) {
        return jsonResponse({ success: false, message: 'البريد الإلكتروني مسجّل بالفعل في المنصة.' }, 409);
      }
      if (phone && db.users.some(u => String(u.phone || '') === phone)) {
        return jsonResponse({ success: false, message: 'رقم الهاتف مسجّل بالفعل في المنصة.' }, 409);
      }

      const st = db._state;
      st.otp_codes = st.otp_codes || {};

      // Step 1: Generate 6-Digit OTP, store ONLY its SHA-256 hash in DB, and send via Email
      if (step === 'send_otp') {
        const otpCode = String(Math.floor(100000 + Math.random() * 900000));
        const otpHash = await sha256Hex(`reg:${email}:${otpCode}:${SECRET_KEY}`);
        st.otp_codes[email] = {
          otp_hash: otpHash,
          email,
          name: `${first} ${last}`,
          purpose: 'register',
          attempts: 0,
          created_at: new Date().toISOString(),
          expires_at: Date.now() + 10 * 60 * 1000
        };
        await saveDB(db);
        await sendOtpEmail(st, email, `${first} ${last}`, otpCode, 'register');

        return jsonResponse({
          success: true,
          otp_sent: true,
          message: `📨 تم إرسال كود التحقق (6 أرقام) إلى بريدك الإلكتروني: ${email}`
        });
      }

      // Step 2: Verify OTP Hash & Create Account
      const inputOtp = String(bodyData.otp_code || '').trim();
      const otpRec   = st.otp_codes[email];

      if (!otpRec || otpRec.purpose !== 'register') {
        return jsonResponse({ success: false, message: 'يرجى طلب كود التحقق أولاً.' }, 422);
      }
      if (Date.now() > Number(otpRec.expires_at || 0)) {
        delete st.otp_codes[email];
        await saveDB(db);
        return jsonResponse({ success: false, message: '⏳ انتهت صلاحية كود التحقق (10 دقائق). اضغط على إعادة إرسال الكود.' }, 422);
      }

      const inputHash = await sha256Hex(`reg:${email}:${inputOtp}:${SECRET_KEY}`);
      const codeMatch = (otpRec.otp_hash && otpRec.otp_hash === inputHash) || (otpRec.code && String(otpRec.code) === inputOtp);
      if (!codeMatch) {
        recordAuthFailure(`reg:${email}`);
        otpRec.attempts = Number(otpRec.attempts || 0) + 1;
        if (otpRec.attempts >= 5) delete st.otp_codes[email];
        await saveDB(db);
        return jsonResponse({ success: false, message: '❌ كود التحقق الذي أدخلته غير صحيح! تأكد من الرمز المرسل لبريدك الإلكتروني.' }, 422);
      }

      // OTP Verified -> Delete OTP & Create User with Salted SHA-256 Password Hash
      delete st.otp_codes[email];

      let avatarUrl = null;
      if (options.body instanceof FormData) {
        const avFile = options.body.get('avatar');
        if (avFile instanceof File && avFile.size > 0) {
          avatarUrl = await fileToDataUrl(avFile);
        }
      }

      const passHash = await hashPassword(pass);
      const newId = db.users.reduce((m, u) => Math.max(m, Number(u.id)), 0) + 1;
      const newUser = {
        id: newId,
        first_name: first,
        last_name: last,
        email: email || null,
        phone: phone || null,
        password_hash: passHash,
        role: 'user',
        is_active: 1,
        avatar: avatarUrl,
        created_at: new Date().toISOString()
      };
      db.users.push(newUser);
      await saveDB(db);

      const uOut = {
        id: newUser.id,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        name: `${newUser.first_name} ${newUser.last_name}`,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        avatar: newUser.avatar,
        pwd_sig: getUserPwdSig(newUser),
        spark_subscribed: false,
        created_at: newUser.created_at
      };
      sessionStorage.setItem('auth', JSON.stringify(uOut));
      return jsonResponse({
        success: true,
        message: '🎉 تم تأكيد البريد الإلكتروني وإنشاء الحساب بنجاح!',
        redirect: 'home.html',
        user: uOut
      }, 201);
    }

    /* 3. FORGOT PASSWORD (WITH HASHED EMAIL OTP & SALTED SHA-256 PASSWORD) */
    if (path.endsWith('/api/forgot_password.php')) {
      const act   = bodyData.step || bodyData.action || 'send_otp';
      const email = String(bodyData.email || '').trim().toLowerCase();
      const st    = db._state;
      st.otp_codes = st.otp_codes || {};

      if (isRateLimited(`fp:${email}`)) {
        return jsonResponse({ success: false, message: '⏳ تم تجاوز الحد المسموح من المحاولات. يرجى الانتظار 10 دقائق.' }, 429);
      }

      if (act === 'send_otp' || act === 'verify') {
        const found = db.users.find(u => String(u.email || '').toLowerCase() === email);
        if (!found) {
          recordAuthFailure(`fp:${email}`);
          return jsonResponse({ success: false, message: '❌ لم يتم العثور على أي حساب مسجل بهذا البريد الإلكتروني.' }, 404);
        }

        const otpCode  = String(Math.floor(100000 + Math.random() * 900000));
        const otpHash  = await sha256Hex(`reset:${email}:${otpCode}:${SECRET_KEY}`);
        const fullName = `${found.first_name} ${found.last_name}`;
        st.otp_codes[email] = {
          otp_hash: otpHash,
          email,
          user_id: found.id,
          name: fullName,
          purpose: 'reset',
          attempts: 0,
          created_at: new Date().toISOString(),
          expires_at: Date.now() + 10 * 60 * 1000
        };
        await saveDB(db);
        await sendOtpEmail(st, email, fullName, otpCode, 'reset');

        return jsonResponse({
          success: true,
          user_name: fullName,
          message: `📨 تم إرسال كود التحقق (6 أرقام) إلى بريدك الإلكتروني: ${email}`
        });
      }

      if (act === 'reset') {
        const inputOtp = String(bodyData.otp_code || '').trim();
        const otpRec   = st.otp_codes[email];

        if (!otpRec || otpRec.purpose !== 'reset') {
          return jsonResponse({ success: false, message: 'انتهت جلسة التحقق، يرجى طلب كود جديد.' }, 403);
        }
        if (Date.now() > Number(otpRec.expires_at || 0)) {
          delete st.otp_codes[email];
          await saveDB(db);
          return jsonResponse({ success: false, message: '⏳ انتهت صلاحية كود التحقق (10 دقائق). اضغط على إعادة إرسال الكود.' }, 422);
        }

        const inputHash = await sha256Hex(`reset:${email}:${inputOtp}:${SECRET_KEY}`);
        const codeMatch = (otpRec.otp_hash && otpRec.otp_hash === inputHash) || (otpRec.code && String(otpRec.code) === inputOtp);
        if (!codeMatch) {
          recordAuthFailure(`fp:${email}`);
          otpRec.attempts = Number(otpRec.attempts || 0) + 1;
          if (otpRec.attempts >= 5) delete st.otp_codes[email];
          await saveDB(db);
          return jsonResponse({ success: false, message: '❌ كود التحقق غير صحيح! يرجى إدخال الكود المكون من 6 أرقام المرسل لبريدك.' }, 422);
        }

        const found = db.users.find(u => Number(u.id) === Number(otpRec.user_id) || String(u.email || '').toLowerCase() === email);
        if (!found) {
          return jsonResponse({ success: false, message: 'الحساب غير موجود.' }, 404);
        }

        const newP = String(bodyData.new_password || '');
        const cnfP = String(bodyData.confirm_password || newP);
        if (newP.length < 8) return jsonResponse({ success: false, message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.' }, 422);
        if (newP !== cnfP) return jsonResponse({ success: false, message: 'كلمتا المرور غير متطابقتين.' }, 422);

        found.password_hash = await hashPassword(newP);
        delete found.password_plain;
        delete st.otp_codes[email];
        await saveDB(db);
        return jsonResponse({ success: true, message: '✅ تم تأكيد الكود وتغيير كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول.' });
      }
    }

    /* 4. SESSION */
    if (path.endsWith('/api/session.php')) {
      if (method === 'DELETE') {
        sessionStorage.removeItem('auth');
        return jsonResponse({ success: true, message: 'تم تسجيل الخروج.' });
      }
      if (!currUser) {
        sessionStorage.removeItem('auth');
        return jsonResponse({ success: false, message: 'غير مسجل الدخول.' }, 401);
      }

      if (method === 'POST') {
        currUser.first_name = String(bodyData.first_name || currUser.first_name).trim().slice(0, 60);
        currUser.last_name  = String(bodyData.last_name  || currUser.last_name).trim().slice(0, 60);
        if (bodyData.new_password && String(bodyData.new_password).length >= 8) {
          currUser.password_hash = await hashPassword(String(bodyData.new_password));
          delete currUser.password_plain;
        }
        if (options.body instanceof FormData) {
          const avFile = options.body.get('avatar');
          if (avFile instanceof File && avFile.size > 0) {
            currUser.avatar = await fileToDataUrl(avFile);
          }
        }
        await saveDB(db);
      }

      const uOut = {
        id: currUser.id,
        first_name: currUser.first_name,
        last_name: currUser.last_name,
        name: `${currUser.first_name} ${currUser.last_name}`,
        email: currUser.email,
        phone: currUser.phone,
        role: currUser.role,
        avatar: currUser.avatar,
        pwd_sig: getUserPwdSig(currUser),
        spark_subscribed: userHasSpark(db, currUser),
        created_at: currUser.created_at
      };
      sessionStorage.setItem('auth', JSON.stringify(uOut));
      return jsonResponse({ success: true, message: 'تم التحديث بنجاح.', user: uOut });
    }

    if (!currUser) return jsonResponse({ success: false, message: 'يرجى تسجيل الدخول' }, 401);

    async function enrichFile(f) {
      const copy = {
        ...f,
        is_favorite: db.favorites.some(fv => Number(fv.user_id) === Number(currUser.id) && Number(fv.file_id) === Number(f.id)) ? 1 : 0
      };
      if (copy.data_url && copy.data_url.startsWith('cloud://')) {
        const cUrl = await resolveCloudFileUrl(copy.data_url, copy.mime_type);
        copy.stream_url   = cUrl;
        copy.download_url = cUrl;
      } else if (copy.data_url) {
        copy.stream_url   = copy.data_url;
        copy.download_url = copy.data_url;
      } else if (copy.section === 'spark' && copy.vault_file) {
        const blobUrl = await decryptVaultFileToBlobUrl(copy.vault_file, copy.mime_type);
        copy.stream_url   = blobUrl;
        copy.download_url = blobUrl;
      } else if (copy.file_path) {
        copy.stream_url   = '../' + copy.file_path;
        copy.download_url = '../' + copy.file_path;
      } else if (copy.external_url) {
        copy.stream_url   = copy.external_url;
        copy.download_url = copy.external_url;
      }
      return copy;
    }

    /* 5. SPARK CODES & SUBSCRIPTIONS */
    if (path.endsWith('/api/spark.php')) {
      if (method === 'GET') {
        if (params.mode === 'status') {
          const sub = db.spark_subscriptions.find(s => Number(s.user_id) === Number(currUser.id));
          const codeObj = sub ? db.spark_codes.find(c => Number(c.id) === Number(sub.code_id)) : null;
          return jsonResponse({
            success: true,
            subscribed: userHasSpark(db, currUser),
            subscription: codeObj ? { code: codeObj.code, activated_at: sub.activated_at } : null,
            watermark: `${currUser.first_name} ${currUser.last_name} • ID#${currUser.id}`
          });
        }
        if (params.mode === 'admin_list') {
          if (currUser.role !== 'admin') return jsonResponse({ success: false }, 403);
          const summary = { total: 0, available: 0, used: 0, disabled: 0 };
          const codes = db.spark_codes.slice().reverse().map(c => {
            summary.total++;
            if (summary[c.status] !== undefined) summary[c.status]++;
            const stu = c.used_by ? db.users.find(u => Number(u.id) === Number(c.used_by)) : null;
            return {
              ...c,
              student_name: stu ? `${stu.first_name} ${stu.last_name}` : null,
              student_email: stu ? stu.email : null,
              student_phone: stu ? stu.phone : null
            };
          });
          return jsonResponse({ success: true, summary, codes });
        }
      }

      if (method === 'POST') {
        if (bodyData.action === 'redeem') {
          const codeStr = String(bodyData.code || '').trim().toUpperCase();
          const cRow = db.spark_codes.find(c => c.code.toUpperCase() === codeStr);
          if (!cRow) return jsonResponse({ success: false, message: '❌ الكود الذي أدخلته غير صحيح.' }, 404);
          if (cRow.status === 'used' || cRow.used_by) return jsonResponse({ success: false, message: '⚠️ هذا الكود سبق استخدامه ولا يمكن استخدامه مرة أخرى.' }, 409);
          if (cRow.status === 'disabled') return jsonResponse({ success: false, message: '🚫 هذا الكود معطّل من قِبل الإدارة.' }, 403);

          cRow.status  = 'used';
          cRow.used_by = currUser.id;
          cRow.used_at = new Date().toISOString();
          db.spark_subscriptions.push({
            id: db.spark_subscriptions.length + 1,
            user_id: currUser.id,
            code_id: cRow.id,
            activated_at: new Date().toISOString()
          });
          await saveDB(db);
          return jsonResponse({ success: true, subscribed: true, message: '🎉 تم تفعيل اشتراكك في قسم SPARK بنجاح وبشكل دائم!' });
        }

        if (currUser.role !== 'admin') return jsonResponse({ success: false }, 403);

        if (bodyData.action === 'generate') {
          const custom = String(bodyData.custom_code || '').trim().toUpperCase();
          const count  = Math.min(100, Math.max(1, Number(bodyData.count || 1)));
          const prefix = String(bodyData.prefix || 'SPARK').trim().toUpperCase() || 'SPARK';
          const created = [];
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

          if (custom) {
            if (db.spark_codes.some(c => c.code === custom)) {
              return jsonResponse({ success: false, message: 'هذا الكود موجود مسبقاً!' }, 409);
            }
            const nextId = db.spark_codes.reduce((m, x) => Math.max(m, Number(x.id)), 0) + 1;
            db.spark_codes.push({ id: nextId, code: custom, status: 'available', used_by: null, used_at: null, created_at: new Date().toISOString() });
            created.push(custom);
          } else {
            for (let i = 0; i < count; i++) {
              let p1 = '', p2 = '';
              for (let j = 0; j < 4; j++) p1 += chars[Math.floor(Math.random() * chars.length)];
              for (let j = 0; j < 4; j++) p2 += chars[Math.floor(Math.random() * chars.length)];
              const code = `${prefix}-${p1}-${p2}`;
              const nextId = db.spark_codes.reduce((m, x) => Math.max(m, Number(x.id)), 0) + 1;
              db.spark_codes.push({ id: nextId, code, status: 'available', used_by: null, used_at: null, created_at: new Date().toISOString() });
              created.push(code);
            }
          }
          await saveDB(db);
          return jsonResponse({ success: true, message: `✅ تم إنشاء ${created.length} كود اشتراك بنجاح!`, codes: created });
        }

        if (bodyData.action === 'toggle_status') {
          const c = db.spark_codes.find(x => Number(x.id) === Number(bodyData.id));
          if (!c || c.status === 'used') return jsonResponse({ success: false, message: 'لا يمكن تعديل هذا الكود.' }, 422);
          c.status = c.status === 'available' ? 'disabled' : 'available';
          await saveDB(db);
          return jsonResponse({ success: true, message: 'تم تحديث حالة الكود.' });
        }

        if (bodyData.action === 'delete') {
          const idx = db.spark_codes.findIndex(x => Number(x.id) === Number(bodyData.id) && x.status !== 'used');
          if (idx >= 0) db.spark_codes.splice(idx, 1);
          await saveDB(db);
          return jsonResponse({ success: true, message: '🗑️ تم حذف الكود.' });
        }
      }
    }

    /* 6. FILES & FOLDERS (with Encrypted SPARK Decryption & Cloud Uploads) */
    if (path.endsWith('/api/files.php')) {
      if (method === 'GET') {
        const mode = params.mode || 'browse';
        const sec  = params.section || 'resources';
        const subj = params.subject || '';
        const flId = params.folder_id && params.folder_id !== 'null' && params.folder_id !== '' ? Number(params.folder_id) : null;

        if (sec === 'spark' && !userHasSpark(db, currUser)) {
          return jsonResponse({ success: false, spark_locked: true, message: 'قسم SPARK مخصص للمشتركين فقط.' }, 403);
        }

        if (mode === 'recent') {
          const allowed = userHasSpark(db, currUser);
          const list = db.files.filter(f => allowed || f.section !== 'spark').slice(-8).reverse();
          const out = await Promise.all(list.map(enrichFile));
          return jsonResponse({ success: true, files: out });
        }

        if (mode === 'favorites') {
          const favIds = db.favorites.filter(fv => Number(fv.user_id) === Number(currUser.id)).map(fv => Number(fv.file_id));
          const list = db.files.filter(f => favIds.includes(Number(f.id)));
          const out = await Promise.all(list.map(enrichFile));
          return jsonResponse({ success: true, files: out });
        }

        if (mode === 'all_folders') {
          const folders = db.folders.filter(f => f.section === sec && ((subj && f.subject === subj) || (!subj && !f.subject)));
          return jsonResponse({ success: true, folders });
        }

        const folders = db.folders.filter(f =>
          f.section === sec &&
          ((subj && f.subject === subj) || (!subj && !f.subject)) &&
          ((flId === null && !f.parent_id) || Number(f.parent_id) === flId)
        );
        folders.sort((a, b) => (Number(a.sort_order || 999) - Number(b.sort_order || 999)) || String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));

        const rawFiles = db.files.filter(f =>
          f.section === sec &&
          ((subj && f.subject === subj) || (!subj && !f.subject)) &&
          ((flId === null && !f.folder_id) || Number(f.folder_id) === flId)
        );
        rawFiles.sort((a, b) => (Number(a.sort_order || 999) - Number(b.sort_order || 999)) || String(a.title).localeCompare(String(b.title), undefined, { numeric: true }));

        const files = await Promise.all(rawFiles.map(enrichFile));

        const breadcrumbs = [];
        let curr = flId;
        let guard = 0;
        while (curr && guard++ < 20) {
          const found = db.folders.find(x => Number(x.id) === Number(curr));
          if (!found) break;
          breadcrumbs.unshift({ id: found.id, name: found.name });
          curr = found.parent_id ? Number(found.parent_id) : null;
        }

        return jsonResponse({ success: true, folders, files, breadcrumbs });
      }

      if (method === 'POST') {
        const act = bodyData.action || '';
        const st  = db._state;

        if (act === 'toggle_favorite') {
          const fid = Number(bodyData.file_id);
          const idx = db.favorites.findIndex(x => Number(x.user_id) === Number(currUser.id) && Number(x.file_id) === fid);
          if (idx >= 0) {
            db.favorites.splice(idx, 1);
            await saveDB(db);
            return jsonResponse({ success: true, is_favorite: 0, message: 'تمت الإزالة من المفضلة.' });
          } else {
            db.favorites.push({ user_id: currUser.id, file_id: fid });
            await saveDB(db);
            return jsonResponse({ success: true, is_favorite: 1, message: '⭐ تمت الإضافة إلى المفضلة.' });
          }
        }
        if (act === 'track_download') return jsonResponse({ success: true });

        if (currUser.role !== 'admin') return jsonResponse({ success: false, message: 'صلاحية مرفوضة' }, 403);

        if (act === 'create_folder') {
          const newId = db.folders.reduce((m, x) => Math.max(m, Number(x.id)), 0) + 1;
          st.custom_folders = st.custom_folders || [];
          st.custom_folders.push({
            id: newId,
            section: bodyData.section || 'resources',
            subject: bodyData.subject || null,
            parent_id: bodyData.parent_id ? Number(bodyData.parent_id) : null,
            name: bodyData.name,
            sort_order: 0,
            created_at: new Date().toISOString()
          });
          await saveDB(db);
          return jsonResponse({ success: true, message: '📁 تم إنشاء المجلد بنجاح.', folder_id: newId });
        }

        if (act === 'update_folder') {
          const fid = Number(bodyData.id);
          const cf  = (st.custom_folders || []).find(x => Number(x.id) === fid);
          if (cf) {
            cf.name = bodyData.name;
          } else {
            st.edited_folders = st.edited_folders || {};
            st.edited_folders[fid] = { ...(st.edited_folders[fid] || {}), name: bodyData.name };
          }
          await saveDB(db);
          return jsonResponse({ success: true, message: '✏️ تم تحديث المجلد.' });
        }

        if (act === 'delete_folder') {
          const fid = Number(bodyData.id);
          st.custom_folders     = (st.custom_folders || []).filter(x => Number(x.id) !== fid);
          st.deleted_folder_ids = st.deleted_folder_ids || [];
          if (!st.deleted_folder_ids.includes(fid)) st.deleted_folder_ids.push(fid);
          await saveDB(db);
          return jsonResponse({ success: true, message: '🗑️ تم حذف المجلد.' });
        }

        if (act === 'add_link') {
          const newId = db.files.reduce((m, x) => Math.max(m, Number(x.id)), 0) + 1;
          st.custom_files = st.custom_files || [];
          st.custom_files.push({
            id: newId,
            section: bodyData.section || 'blackboard',
            subject: bodyData.subject || null,
            folder_id: bodyData.folder_id ? Number(bodyData.folder_id) : null,
            item_type: 'link',
            title: bodyData.title,
            description: bodyData.description || null,
            external_url: bodyData.external_url,
            file_size: 0,
            extension: 'link',
            sort_order: 0,
            created_at: new Date().toISOString()
          });
          await saveDB(db);
          return jsonResponse({ success: true, message: '🔗 تمت إضافة الرابط بنجاح.' });
        }

        if (act === 'upload_files' && options.body instanceof FormData) {
          const filesList = options.body.getAll('files[]');
          let nextId = db.files.reduce((m, x) => Math.max(m, Number(x.id)), 0) + 1;
          st.custom_files = st.custom_files || [];

          for (const file of filesList) {
            if (!(file instanceof File) || file.size === 0) continue;
            const cloudOrDataUrl = await uploadFileToCloudRepo(file);
            const ext = (file.name.split('.').pop() || '').toLowerCase();
            st.custom_files.push({
              id: nextId++,
              section: bodyData.section || 'resources',
              subject: bodyData.subject || null,
              folder_id: bodyData.folder_id ? Number(bodyData.folder_id) : null,
              item_type: 'file',
              title: bodyData.title || file.name.replace(/\.[^/.]+$/, ''),
              description: bodyData.description || null,
              original_name: file.name,
              data_url: cloudOrDataUrl,
              file_size: file.size,
              mime_type: file.type,
              extension: ext,
              sort_order: 0,
              created_at: new Date().toISOString()
            });
          }
          await saveDB(db);
          return jsonResponse({ success: true, message: '✅ تم رفع الملفات ومزامنتها على السيرفر لجميع الأجهزة!' });
        }

        if (act === 'update_file') {
          const fid = Number(bodyData.id);
          const patch = {
            title: bodyData.title,
            description: bodyData.description,
            external_url: bodyData.external_url,
            folder_id: bodyData.folder_id !== null && bodyData.folder_id !== '' ? Number(bodyData.folder_id) : null,
            sort_order: Number(bodyData.sort_order || 0)
          };
          const cf = (st.custom_files || []).find(x => Number(x.id) === fid);
          if (cf) {
            Object.assign(cf, patch);
          } else {
            st.edited_files = st.edited_files || {};
            st.edited_files[fid] = { ...(st.edited_files[fid] || {}), ...patch };
          }
          await saveDB(db);
          return jsonResponse({ success: true, message: '✅ تم حفظ تعديلات الملف.' });
        }

        if (act === 'delete_file') {
          const fid = Number(bodyData.id);
          st.custom_files     = (st.custom_files || []).filter(x => Number(x.id) !== fid);
          st.deleted_file_ids = st.deleted_file_ids || [];
          if (!st.deleted_file_ids.includes(fid)) st.deleted_file_ids.push(fid);
          await saveDB(db);
          return jsonResponse({ success: true, message: '🗑️ تم حذف العنصر.' });
        }
      }
    }

    /* 7. POSTS & ANNOUNCEMENTS */
    if (path.endsWith('/api/posts.php')) {
      if (method === 'GET') {
        const sec = params.section || '';
        if (sec === 'spark' && !userHasSpark(db, currUser)) {
          return jsonResponse({ success: false, spark_locked: true }, 403);
        }
        const list = db.posts.filter(p => !sec || p.section === sec || (sec === 'general' && !p.section));
        list.sort((a, b) => (Number(b.is_pinned || 0) - Number(a.is_pinned || 0)) || (new Date(b.created_at) - new Date(a.created_at)));
        const enrichedPosts = await Promise.all(list.map(async p => ({
          ...p,
          files: await Promise.all((p.files || []).map(enrichFile))
        })));
        return jsonResponse({ success: true, posts: enrichedPosts });
      }

      if (method === 'POST') {
        if (currUser.role !== 'admin') return jsonResponse({ success: false }, 403);
        const act = bodyData.action || 'save';

        if (act === 'delete') {
          const idx = db.posts.findIndex(x => Number(x.id) === Number(bodyData.id));
          if (idx >= 0) db.posts.splice(idx, 1);
          await saveDB(db);
          return jsonResponse({ success: true, message: '🗑️ تم حذف المنشور.' });
        }

        if (act === 'delete_attachment') {
          const fid = Number(bodyData.file_id);
          db.posts.forEach(p => {
            if (Array.isArray(p.files)) {
              p.files = p.files.filter(f => Number(f.id) !== fid);
            }
          });
          await saveDB(db);
          return jsonResponse({ success: true, message: '🗑️ تم حذف المرفق.' });
        }

        if (act === 'toggle_pin') {
          const p = db.posts.find(x => Number(x.id) === Number(bodyData.id));
          if (p) p.is_pinned = Number(bodyData.is_pinned);
          await saveDB(db);
          return jsonResponse({ success: true, message: '📌 تم تحديث التثبيت.' });
        }

        // Upload any post attachments to Cloud Repo
        const uploadedAtts = [];
        if (options.body instanceof FormData) {
          const attFiles = options.body.getAll('attachments[]');
          let attBaseId = Date.now();
          for (const file of attFiles) {
            if (!(file instanceof File) || file.size === 0) continue;
            const cloudUrl = await uploadFileToCloudRepo(file);
            uploadedAtts.push({
              id: attBaseId++,
              original_name: file.name,
              data_url: cloudUrl,
              file_size: file.size,
              mime_type: file.type
            });
          }
        }

        const editId = Number(bodyData.id || 0);
        if (editId > 0) {
          const p = db.posts.find(x => Number(x.id) === editId);
          if (p) {
            p.title     = bodyData.title;
            p.content   = bodyData.content;
            p.section   = bodyData.section || 'general';
            p.is_pinned = Number(bodyData.is_pinned || 0);
            p.files     = [...(p.files || []), ...uploadedAtts];
          }
          await saveDB(db);
          return jsonResponse({ success: true, message: '✅ تم تحديث المنشور.' });
        }

        const newId = db.posts.reduce((m, x) => Math.max(m, Number(x.id)), 0) + 1;
        const newPost = {
          id: newId,
          section: bodyData.section || 'general',
          title: bodyData.title,
          content: bodyData.content,
          is_pinned: Number(bodyData.is_pinned || 0),
          notify_all: Number(bodyData.notify_all || 0),
          created_at: new Date().toISOString(),
          files: uploadedAtts
        };
        db.posts.push(newPost);

        if (Number(bodyData.notify_all) === 1) {
          const nid = db.notifications.reduce((m, x) => Math.max(m, Number(x.id)), 0) + 1;
          db.notifications.unshift({
            id: nid,
            title: `📢 منشور جديد (@الكل): ${bodyData.title}`,
            message: String(bodyData.content || '').slice(0, 140),
            post_id: newId,
            link_url: `home.html#post-${newId}`,
            created_at: new Date().toISOString()
          });
        }
        await saveDB(db);
        return jsonResponse({ success: true, message: '🚀 تم نشر المنشور بنجاح!' });
      }
    }

    /* 8. NOTIFICATIONS */
    if (path.endsWith('/api/notifications.php')) {
      if (method === 'GET') {
        const reads = db.notification_reads.filter(r => Number(r.user_id) === Number(currUser.id)).map(r => Number(r.notification_id));
        const list  = db.notifications.map(n => ({ ...n, is_read: reads.includes(Number(n.id)) ? 1 : 0 }));
        const unread_count = list.filter(n => !n.is_read).length;
        return jsonResponse({ success: true, unread_count, notifications: list });
      }
      if (method === 'POST') {
        const act = bodyData.action || '';
        if (act === 'mark_read') {
          const nid = Number(bodyData.notification_id);
          if (!db.notification_reads.some(r => Number(r.user_id) === Number(currUser.id) && Number(r.notification_id) === nid)) {
            db.notification_reads.push({ user_id: currUser.id, notification_id: nid });
            await saveDB(db);
          }
          return jsonResponse({ success: true });
        }
        if (act === 'mark_all_read') {
          db.notifications.forEach(n => {
            if (!db.notification_reads.some(r => Number(r.user_id) === Number(currUser.id) && Number(r.notification_id) === Number(n.id))) {
              db.notification_reads.push({ user_id: currUser.id, notification_id: n.id });
            }
          });
          await saveDB(db);
          return jsonResponse({ success: true, message: 'تم تعليم الكل كمقروء' });
        }
        if (act === 'send' && currUser.role === 'admin') {
          const nid = db.notifications.reduce((m, x) => Math.max(m, Number(x.id)), 0) + 1;
          db.notifications.unshift({
            id: nid,
            title: `🔔 إشعار (@الكل): ${bodyData.title}`,
            message: bodyData.message,
            post_id: null,
            link_url: bodyData.link_url || null,
            created_at: new Date().toISOString()
          });
          await saveDB(db);
          return jsonResponse({ success: true, message: '🔔 تم إرسال الإشعار لجميع الطلاب!' });
        }
        if (act === 'delete' && currUser.role === 'admin') {
          const idx = db.notifications.findIndex(x => Number(x.id) === Number(bodyData.id));
          if (idx >= 0) db.notifications.splice(idx, 1);
          await saveDB(db);
          return jsonResponse({ success: true, message: '🗑️ تم حذف الإشعار.' });
        }
      }
    }

    /* 9. SCHEDULE */
    if (path.endsWith('/api/schedule.php')) {
      if (method === 'GET') {
        const rawFiles = db.files.filter(f => f.section === 'schedule');
        const files    = await Promise.all(rawFiles.map(enrichFile));
        return jsonResponse({ success: true, entries: db.schedule_entries, files, schedule_files: files });
      }
      if (method === 'POST' && currUser.role === 'admin') {
        if (bodyData.action === 'delete_entry') {
          const idx = db.schedule_entries.findIndex(x => Number(x.id) === Number(bodyData.id));
          if (idx >= 0) db.schedule_entries.splice(idx, 1);
          await saveDB(db);
          return jsonResponse({ success: true, message: '🗑️ تم الحذف من الجدول.' });
        }
        const nid = db.schedule_entries.reduce((m, x) => Math.max(m, Number(x.id)), 0) + 1;
        db.schedule_entries.push({
          id: nid,
          day_name: bodyData.day_name,
          start_time: bodyData.start_time,
          end_time: bodyData.end_time,
          subject: bodyData.subject,
          room: bodyData.room,
          instructor: bodyData.instructor,
          notes: bodyData.notes
        });
        await saveDB(db);
        return jsonResponse({ success: true, message: '📅 تمت الإضافة للجدول.' });
      }
    }

    /* 10. USERS MANAGEMENT (Supports GET, POST, PUT, DELETE) */
    if (path.endsWith('/api/users.php')) {
      if (currUser.role !== 'admin') return jsonResponse({ success: false, message: 'صلاحية مرفوضة' }, 403);

      if (method === 'GET') {
        if (params.mode === 'stats') {
          return jsonResponse({
            success: true,
            stats: {
              users: db.users.length,
              posts: db.posts.length,
              files: db.files.length,
              folders: db.folders.length,
              notifications: db.notifications.length
            }
          });
        }
        const enrichedUsers = db.users.map(u => ({
          ...u,
          spark_subscribed: userHasSpark(db, u)
        }));
        return jsonResponse({ success: true, users: enrichedUsers });
      }

      const act = bodyData.action || (method === 'DELETE' ? 'delete_user' : (method === 'PUT' ? 'update_user' : ''));
      const uid = Number(bodyData.id || params.id || 0);

      if (act === 'create_user') {
        const first = String(bodyData.first_name || '').trim();
        const last  = String(bodyData.last_name  || '').trim();
        const email = String(bodyData.email      || '').trim().toLowerCase();
        const phone = String(bodyData.phone      || '').trim();
        const pass  = String(bodyData.password || bodyData.new_password || '').trim();
        const role  = bodyData.role === 'admin' ? 'admin' : 'user';
        if (!first || !last || pass.length < 4) {
          return jsonResponse({ success: false, message: 'يرجى إدخال الاسم وكلمة المرور.' }, 422);
        }
        if (email && db.users.some(u => String(u.email || '').toLowerCase() === email)) {
          return jsonResponse({ success: false, message: 'البريد الإلكتروني مستخدم مسبقاً.' }, 409);
        }
        if (phone && db.users.some(u => String(u.phone || '') === phone)) {
          return jsonResponse({ success: false, message: 'رقم الهاتف مستخدم مسبقاً.' }, 409);
        }
        const passHash = await hashPassword(pass);
        const newId = db.users.reduce((m, u) => Math.max(m, Number(u.id)), 0) + 1;
        const newUser = {
          id: newId,
          first_name: first,
          last_name: last,
          email: email || null,
          phone: phone || null,
          password_hash: passHash,
          role,
          is_active: 1,
          avatar: null,
          created_at: new Date().toISOString()
        };
        db.users.push(newUser);
        if (Number(bodyData.spark_subscribed) === 1) {
          db.spark_subscriptions.push({
            id: db.spark_subscriptions.length + 1,
            user_id: newId,
            code_id: 0,
            activated_at: new Date().toISOString()
          });
        }
        await saveDB(db);
        return jsonResponse({ success: true, message: '✅ تمت إضافة الحساب الجديد بنجاح!' });
      }

      if (act === 'toggle_spark') {
        const u = db.users.find(x => Number(x.id) === uid);
        if (!u) return jsonResponse({ success: false, message: 'المستخدم غير موجود' }, 404);
        const subIdx = db.spark_subscriptions.findIndex(s => Number(s.user_id) === uid);
        if (subIdx >= 0) {
          db.spark_subscriptions.splice(subIdx, 1);
          await saveDB(db);
          return jsonResponse({ success: true, message: `🚫 تم إلغاء اشتراك SPARK للطالب ${u.first_name}.` });
        } else {
          db.spark_subscriptions.push({
            id: db.spark_subscriptions.length + 1,
            user_id: uid,
            code_id: 0,
            activated_at: new Date().toISOString()
          });
          await saveDB(db);
          return jsonResponse({ success: true, message: `⚡ تم تفعيل اشتراك SPARK للطالب ${u.first_name} مباشرة!` });
        }
      }

      if (act === 'delete_user') {
        if (uid === Number(currUser.id)) {
          return jsonResponse({ success: false, message: 'لا يمكنك حذف حسابك الشخصي كمدير.' }, 422);
        }
        const idx = db.users.findIndex(x => Number(x.id) === uid);
        if (idx < 0) return jsonResponse({ success: false, message: 'الحساب غير موجود.' }, 404);
        db.users.splice(idx, 1);
        db.spark_subscriptions = db.spark_subscriptions.filter(s => Number(s.user_id) !== uid);
        db.favorites = db.favorites.filter(fv => Number(fv.user_id) !== uid);
        await saveDB(db);
        return jsonResponse({ success: true, message: '🗑️ تم حذف الحساب نهائياً من قاعدة البيانات!' });
      }

      if (act === 'update_user') {
        const u = db.users.find(x => Number(x.id) === uid);
        if (!u) return jsonResponse({ success: false, message: 'الحساب غير موجود.' }, 404);

        u.first_name = String(bodyData.first_name ?? u.first_name).trim();
        u.last_name  = String(bodyData.last_name  ?? u.last_name).trim();
        if (bodyData.email !== undefined) {
          u.email = String(bodyData.email || '').trim().toLowerCase() || null;
        }
        if (bodyData.phone !== undefined) {
          u.phone = String(bodyData.phone || '').trim() || null;
        }
        if (bodyData.role !== undefined) {
          u.role = bodyData.role || u.role;
        }
        if (bodyData.is_active !== undefined) {
          u.is_active = Number(bodyData.is_active);
        }

        const newPass = String(bodyData.password || bodyData.new_password || '').trim();
        if (newPass !== '' && !newPass.startsWith('sha256$') && newPass !== '••••••') {
          u.password_hash = await hashPassword(newPass);
          delete u.password_plain;
        }

        if (bodyData.spark_subscribed !== undefined && u.role !== 'admin') {
          const wantSpark = Number(bodyData.spark_subscribed) === 1;
          const subIdx = db.spark_subscriptions.findIndex(s => Number(s.user_id) === uid);
          if (wantSpark && subIdx < 0) {
            db.spark_subscriptions.push({
              id: db.spark_subscriptions.length + 1,
              user_id: uid,
              code_id: 0,
              activated_at: new Date().toISOString()
            });
          } else if (!wantSpark && subIdx >= 0) {
            db.spark_subscriptions.splice(subIdx, 1);
          }
        }

        await saveDB(db);

        // If Admin updated their own account, update sessionStorage immediately too
        if (Number(u.id) === Number(currUser.id)) {
          const uOut = {
            id: u.id,
            first_name: u.first_name,
            last_name: u.last_name,
            name: `${u.first_name} ${u.last_name}`,
            email: u.email,
            phone: u.phone,
            role: u.role,
            avatar: u.avatar,
            pwd_sig: getUserPwdSig(u),
            spark_subscribed: true,
            created_at: u.created_at
          };
          sessionStorage.setItem('auth', JSON.stringify(uOut));
        }

        return jsonResponse({ success: true, message: '✅ تم تحديث بيانات الحساب ومزامنتها على جميع الأجهزة!' });
      }
    }

    /* 11. GLOBAL SEARCH */
    if (path.endsWith('/api/search.php')) {
      const q = (params.q || '').toLowerCase().trim();
      const allowedSpark = userHasSpark(db, currUser);
      const posts = db.posts.filter(p => (allowedSpark || p.section !== 'spark') && `${p.title} ${p.content}`.toLowerCase().includes(q)).slice(0, 10);
      const folders = db.folders.filter(f => (allowedSpark || f.section !== 'spark') && (f.name || '').toLowerCase().includes(q)).slice(0, 10);
      const rawFiles = db.files.filter(f => (allowedSpark || f.section !== 'spark') && `${f.title} ${f.description || ''}`.toLowerCase().includes(q)).slice(0, 15);
      const files = await Promise.all(rawFiles.map(enrichFile));
      return jsonResponse({ success: true, posts, folders, files });
    }

    /* 12. BACKUP */
    if (path.endsWith('/api/backup.php')) {
      return jsonResponse({ success: true, backups: [], message: 'البيانات محفوظة تلقائياً في السيرفر السحابي المشترك (Al5i1/sec4-db).' });
    }

    /* 12b. EXTERNAL CLOUD BLACKBOARD SERVER CONTROL (Admin Only) */
    if (path.endsWith('/api/bb_cloud.php')) {
      if (!currUser || currUser.role !== 'admin') {
        return jsonResponse({ success: false, message: 'صلاحية مرفوضة' }, 403);
      }
      const token = getCloudToken();
      const BB_KEY_HEX = '534543345f42425f434c4f55445f5641554c545f4b45595f323032365f39393831';

      if (bodyData.action === 'save_session') {
        const rawCookie = String(bodyData.cookie || '').trim();
        if (!rawCookie) return jsonResponse({ success: false, message: 'يرجى لصق الجلسة أولاً' }, 422);

        const keyBytes = new Uint8Array(BB_KEY_HEX.match(/.{1,2}/g).map(b => parseInt(b, 16)));
        const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const plain = new TextEncoder().encode(JSON.stringify({ cookie: rawCookie, updated_at: new Date().toISOString() }));
        const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plain);
        const toB64 = arr => btoa(String.fromCharCode(...new Uint8Array(arr)));
        const vaultJson = JSON.stringify({ iv: toB64(iv), data: toB64(cipherBuf), updated_at: new Date().toISOString() }, null, 2);

        const vaultUrl = `https://api.github.com/repos/${CLOUD_REPO}/contents/vault/bb_auth.enc.json`;
        let sha;
        const gRes = await origFetch(vaultUrl, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` } });
        if (gRes.ok) { const j = await gRes.json(); sha = j.sha; }

        const putBody = { message: 'Update encrypted Blackboard session in Cloud Vault', content: btoa(vaultJson) };
        if (sha) putBody.sha = sha;
        const pRes = await origFetch(vaultUrl, {
          method: 'PUT',
          headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(putBody)
        });
        if (!pRes.ok) return jsonResponse({ success: false, message: 'تعذر حفظ الجلسة في السيرفر الخارجي' }, 500);
      }

      // Trigger immediate Cloud Worker run on GitHub external servers
      await origFetch(`https://api.github.com/repos/${CLOUD_REPO}/actions/workflows/blackboard_cloud_sync.yml/dispatches`, {
        method: 'POST',
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main' })
      }).catch(() => {});

      return jsonResponse({
        success: true,
        message: '☁️ تم تشفير الجلسة وتشغيل السيرفر الخارجي بنجاح! سيفحص البلاكبورد تلقائياً كل 15 دقيقة حتى لو طفى النت من كل أجهزتك.'
      });
    }

    /* 13. EMAIL OTP CONFIG & LOGS (Admin Only) */
    if (path.endsWith('/api/email_config.php')) {
      if (!currUser || currUser.role !== 'admin') {
        return jsonResponse({ success: false, message: 'صلاحية مرفوضة' }, 403);
      }
      const st = db._state;
      st.email_config = st.email_config || {};
      st.otp_codes    = st.otp_codes    || {};

      if (method === 'GET') {
        const now = Date.now();
        const activeOtps = Object.values(st.otp_codes)
          .filter(x => x && Number(x.expires_at || 0) > now)
          .sort((a, b) => Number(b.expires_at) - Number(a.expires_at));
        return jsonResponse({
          success: true,
          config: st.email_config,
          active_otps: activeOtps
        });
      }

      if (method === 'POST') {
        if (bodyData.action === 'save_config') {
          st.email_config.gas_url             = String(bodyData.gas_url || '').trim();
          st.email_config.emailjs_service_id  = String(bodyData.emailjs_service_id || '').trim();
          st.email_config.emailjs_template_id = String(bodyData.emailjs_template_id || '').trim();
          st.email_config.emailjs_public_key  = String(bodyData.emailjs_public_key || '').trim();
          await saveDB(db);
          return jsonResponse({ success: true, message: '✅ تم حفظ إعدادات إرسال كود التحقق عبر الإيميل بنجاح!' });
        }
        if (bodyData.action === 'test_send') {
          const testEmail = String(bodyData.test_email || currUser.email || '').trim();
          const testCode  = String(Math.floor(100000 + Math.random() * 900000));
          await sendOtpEmail(st, testEmail, `${currUser.first_name} ${currUser.last_name}`, testCode, 'register');
          return jsonResponse({
            success: true,
            message: `📨 تم إرسال رسالة تجريبية بالكود (${testCode}) إلى: ${testEmail}`
          });
        }
      }
    }

    return jsonResponse({ success: true });
  }

  /* Only SEC4's own /api/*.php routes are handled by the virtual API.
     External services (including Cloudflare Workers) must use real network requests. */
  function isSec4VirtualApi(url) {
    try {
      const parsed = new URL(String(url), location.href);
      return parsed.origin === location.origin &&
        /^\/api\/[^/]+\.php$/i.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  /* ── Intercept fetch() & XMLHttpRequest across all environments (GitHub Pages + Localhost) ── */
  window.fetch = async function (input, init) {
    const urlStr = typeof input === 'string' ? input : (input.url || '');
    if (isSec4VirtualApi(urlStr)) {
      return handleVirtualApi(urlStr, init);
    }
    return origFetch(input, init);
  };

  /* Also patch XMLHttpRequest for file upload progress bars */
  const OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = new OrigXHR();
    let targetUrl = '';
    let targetMethod = 'GET';
    const origOpen = xhr.open.bind(xhr);
    const origSend = xhr.send.bind(xhr);

    xhr.open = function (method, url, ...rest) {
      targetMethod = method;
      targetUrl = url;
      return origOpen(method, url, ...rest);
    };

    xhr.send = function (body) {
      if (isSec4VirtualApi(targetUrl)) {
        handleVirtualApi(targetUrl, { method: targetMethod, body }).then(async resp => {
          const text = await resp.text();
          Object.defineProperty(xhr, 'status', { value: resp.status });
          Object.defineProperty(xhr, 'responseText', { value: text });
          if (typeof xhr.onload === 'function') xhr.onload();
        });
        return;
      }
      return origSend(body);
    };
    return xhr;
  };
})();

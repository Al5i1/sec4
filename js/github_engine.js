/* ═══════════════════════════════════════════════════════════════════
   js/github_engine.js — Serverless Engine & Encrypted SPARK Vault
   Allows SEC4 to run 100% on GitHub Pages (github.io) without PHP,
   while keeping SPARK images encrypted (.spk) in the GitHub repo!
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  const isGitHubPages = location.hostname.endsWith('github.io') || location.protocol === 'file:';
  const origFetch     = window.fetch.bind(window);
  const SECRET_KEY    = 'SEC4_SPARK_VAULT_KEY_2026_PROTECTED_STREAM_#9981';
  const blobCache     = new Map();

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

  /* ── Local Database State (Initialized from SEC4_INITIAL_MANIFEST) ── */
  const DB_KEY = 'sec4_github_db_v1';

  function loadDB() {
    let raw = localStorage.getItem(DB_KEY);
    if (raw) {
      try { return JSON.parse(raw); } catch {}
    }
    const init = window.SEC4_INITIAL_MANIFEST || { folders: [], files: [], posts: [] };
    const db = {
      users: [
        {
          id: 1,
          first_name: 'Admin',
          last_name: 'SEC4',
          email: 'admin@admin.com',
          phone: '+97330000000',
          password_plain: 'Admin@1234',
          role: 'admin',
          is_active: 1,
          avatar: null,
          created_at: new Date().toISOString()
        }
      ],
      folders: init.folders || [],
      files: init.files || [],
      posts: init.posts || [],
      notifications: [
        {
          id: 1,
          title: '📢 إعلان (@الكل): مرحباً بكم في منصة SEC4 الأكاديمية',
          message: 'تم إطلاق المنصة الرسمية لشعبة SEC4 لجمع كافة الاختبارات والمشاريع والملازم وقسم SPARK في مكان واحد.',
          post_id: 1,
          link_url: 'home.html#post-1',
          created_at: new Date().toISOString()
        }
      ],
      notification_reads: [],
      favorites: [],
      schedule_entries: [],
      spark_codes: [
        { id: 1, code: 'SPARK-SEC4-2026', status: 'available', used_by: null, used_at: null, created_at: new Date().toISOString() },
        { id: 2, code: 'SPARK-VIP1-2026', status: 'available', used_by: null, used_at: null, created_at: new Date().toISOString() },
        { id: 3, code: 'SPARK-VIP2-2026', status: 'available', used_by: null, used_at: null, created_at: new Date().toISOString() }
      ],
      spark_subscriptions: []
    };
    saveDB(db);
    return db;
  }

  function saveDB(db) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch {}
  }

  function getCurrentSessionUser(db) {
    try {
      const s = JSON.parse(sessionStorage.getItem('auth') || 'null');
      if (!s || !s.id) return null;
      return db.users.find(u => Number(u.id) === Number(s.id) && Number(u.is_active) === 1) || null;
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

  /* ── Handle API Requests in Serverless Mode ── */
  async function handleVirtualApi(urlStr, options = {}) {
    const db     = loadDB();
    const method = (options.method || 'GET').toUpperCase();
    const uObj   = new URL(urlStr, location.href);
    const path   = uObj.pathname;
    const params = Object.fromEntries(uObj.searchParams.entries());

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

    /* 1. LOGIN */
    if (path.endsWith('/api/login.php')) {
      const idf  = String(bodyData.identifier || '').trim().toLowerCase();
      const pass = String(bodyData.password || '');
      const cleanPhone = idf.replace(/[^0-9]/g, '');

      const user = db.users.find(u => {
        const uEmail = String(u.email || '').toLowerCase();
        const uPhone = String(u.phone || '').replace(/[^0-9]/g, '');
        return (uEmail && uEmail === idf) || (cleanPhone && uPhone && (uPhone === cleanPhone || uPhone.slice(-8) === cleanPhone.slice(-8)));
      });

      if (!user || user.password_plain !== pass) {
        return jsonResponse({ success: false, message: 'البريد/الهاتف أو كلمة المرور غير صحيحة.' }, 401);
      }
      if (Number(user.is_active) !== 1) {
        return jsonResponse({ success: false, message: 'تم تعطيل هذا الحساب من قِبل الإدارة.' }, 403);
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
        spark_subscribed: userHasSpark(db, user)
      };
      sessionStorage.setItem('auth', JSON.stringify(uOut));
      return jsonResponse({ success: true, message: 'تم تسجيل الدخول بنجاح.', redirect: '../html/home.html', user: uOut });
    }

    /* 2. REGISTER */
    if (path.endsWith('/api/register.php')) {
      const first_name = String(bodyData.first_name || '').trim();
      const last_name  = String(bodyData.last_name || '').trim();
      const email      = String(bodyData.email || '').trim();
      const phone      = String(bodyData.phone || '').trim();
      const password   = String(bodyData.password || '');

      if (db.users.some(u => (email && u.email.toLowerCase() === email.toLowerCase()) || (phone && u.phone === phone))) {
        return jsonResponse({ success: false, message: 'البريد أو رقم الهاتف مسجل مسبقاً.' }, 409);
      }
      const newId = db.users.reduce((m, x) => Math.max(m, Number(x.id)), 0) + 1;
      db.users.push({
        id: newId, first_name, last_name, email, phone,
        password_plain: password, role: 'user', is_active: 1, avatar: null,
        created_at: new Date().toISOString()
      });
      saveDB(db);
      return jsonResponse({ success: true, message: 'تم إنشاء الحساب بنجاح.', id: newId }, 201);
    }

    /* 3. FORGOT PASSWORD */
    if (path.endsWith('/api/forgot_password.php')) {
      if (bodyData.step === 'verify') {
        const email = String(bodyData.email || '').trim().toLowerCase();
        const phone = String(bodyData.phone || '').replace(/[^0-9]/g, '');
        const user  = db.users.find(u => u.email.toLowerCase() === email && u.phone.replace(/[^0-9]/g, '').slice(-8) === phone.slice(-8));
        if (!user) return jsonResponse({ success: false, message: '❌ لم يتم العثور على حساب يطابق البريد ورقم الهاتف.' }, 404);
        sessionStorage.setItem('fp_reset_uid', String(user.id));
        return jsonResponse({ success: true, user_name: `${user.first_name} ${user.last_name}`, message: '✅ تم التحقق بنجاح!' });
      }
      if (bodyData.step === 'reset') {
        const uid = Number(sessionStorage.getItem('fp_reset_uid') || 0);
        const user = db.users.find(u => Number(u.id) === uid);
        if (!user) return jsonResponse({ success: false, message: 'انتهت الجلسة.' }, 403);
        user.password_plain = bodyData.new_password;
        saveDB(db);
        sessionStorage.removeItem('fp_reset_uid');
        return jsonResponse({ success: true, message: '🎉 تم تغيير كلمة المرور بنجاح!' });
      }
    }

    /* 4. SESSION */
    if (path.endsWith('/api/session.php')) {
      if (method === 'POST' && (bodyData.action === 'logout' || params.action === 'logout')) {
        sessionStorage.removeItem('auth');
        return jsonResponse({ success: true });
      }
      if (!currUser) return jsonResponse({ success: false, message: 'يرجى تسجيل الدخول' }, 401);

      if (method === 'POST') {
        currUser.first_name = String(bodyData.first_name || currUser.first_name).trim();
        currUser.last_name  = String(bodyData.last_name  || currUser.last_name).trim();
        if (bodyData.new_password) currUser.password_plain = bodyData.new_password;
        if (options.body instanceof FormData) {
          const avFile = options.body.get('avatar');
          if (avFile instanceof File && avFile.size > 0) {
            currUser.avatar = await fileToDataUrl(avFile);
          }
        }
        saveDB(db);
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
        spark_subscribed: userHasSpark(db, currUser),
        created_at: currUser.created_at
      };
      sessionStorage.setItem('auth', JSON.stringify(uOut));
      return jsonResponse({ success: true, message: 'تم التحديث بنجاح.', user: uOut });
    }

    if (!currUser) return jsonResponse({ success: false, message: 'يرجى تسجيل الدخول' }, 401);

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
          saveDB(db);
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
          saveDB(db);
          return jsonResponse({ success: true, message: `✅ تم إنشاء ${created.length} كود اشتراك بنجاح!`, codes: created });
        }

        if (bodyData.action === 'toggle_status') {
          const c = db.spark_codes.find(x => Number(x.id) === Number(bodyData.id));
          if (!c || c.status === 'used') return jsonResponse({ success: false, message: 'لا يمكن تعديل هذا الكود.' }, 422);
          c.status = c.status === 'available' ? 'disabled' : 'available';
          saveDB(db);
          return jsonResponse({ success: true, message: 'تم تحديث حالة الكود.' });
        }

        if (bodyData.action === 'delete') {
          const idx = db.spark_codes.findIndex(x => Number(x.id) === Number(bodyData.id) && x.status !== 'used');
          if (idx >= 0) db.spark_codes.splice(idx, 1);
          saveDB(db);
          return jsonResponse({ success: true, message: '🗑️ تم حذف الكود.' });
        }
      }
    }

    /* 6. FILES & FOLDERS (with Encrypted SPARK Decryption) */
    if (path.endsWith('/api/files.php')) {
      if (method === 'GET') {
        const mode = params.mode || 'browse';
        const sec  = params.section || 'resources';
        const subj = params.subject || '';
        const flId = params.folder_id && params.folder_id !== 'null' && params.folder_id !== '' ? Number(params.folder_id) : null;

        if (sec === 'spark' && !userHasSpark(db, currUser)) {
          return jsonResponse({ success: false, spark_locked: true, message: 'قسم SPARK مخصص للمشتركين فقط.' }, 403);
        }

        async function enrichFile(f) {
          const copy = { ...f, is_favorite: db.favorites.some(fv => Number(fv.user_id) === Number(currUser.id) && Number(fv.file_id) === Number(f.id)) ? 1 : 0 };
          if (copy.data_url) {
            copy.stream_url   = copy.data_url;
            copy.download_url = copy.data_url;
          } else if (copy.section === 'spark' && copy.vault_file) {
            const blobUrl = await decryptVaultFileToBlobUrl(copy.vault_file, copy.mime_type);
            copy.stream_url   = blobUrl;
            copy.download_url = blobUrl;
          } else if (copy.file_path) {
            copy.stream_url   = '../' + copy.file_path;
            copy.download_url = '../' + copy.file_path;
          }
          return copy;
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
        folders.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));

        const rawFiles = db.files.filter(f =>
          f.section === sec &&
          ((subj && f.subject === subj) || (!subj && !f.subject)) &&
          ((flId === null && !f.folder_id) || Number(f.folder_id) === flId)
        );
        rawFiles.sort((a, b) => String(a.title).localeCompare(String(b.title), undefined, { numeric: true }));

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
        if (act === 'toggle_favorite') {
          const fid = Number(bodyData.file_id);
          const idx = db.favorites.findIndex(x => Number(x.user_id) === Number(currUser.id) && Number(x.file_id) === fid);
          if (idx >= 0) {
            db.favorites.splice(idx, 1);
            saveDB(db);
            return jsonResponse({ success: true, is_favorite: 0, message: 'تمت الإزالة من المفضلة.' });
          } else {
            db.favorites.push({ user_id: currUser.id, file_id: fid });
            saveDB(db);
            return jsonResponse({ success: true, is_favorite: 1, message: '⭐ تمت الإضافة إلى المفضلة.' });
          }
        }
        if (act === 'track_download') return jsonResponse({ success: true });

        if (currUser.role !== 'admin') return jsonResponse({ success: false, message: 'صلاحية مرفوضة' }, 403);

        if (act === 'create_folder') {
          const newId = db.folders.reduce((m, x) => Math.max(m, Number(x.id)), 0) + 1;
          db.folders.push({
            id: newId,
            section: bodyData.section || 'resources',
            subject: bodyData.subject || null,
            parent_id: bodyData.parent_id ? Number(bodyData.parent_id) : null,
            name: bodyData.name,
            sort_order: 0,
            created_at: new Date().toISOString()
          });
          saveDB(db);
          return jsonResponse({ success: true, message: '📁 تم إنشاء المجلد بنجاح.', folder_id: newId });
        }

        if (act === 'update_folder') {
          const fl = db.folders.find(x => Number(x.id) === Number(bodyData.id));
          if (fl) fl.name = bodyData.name;
          saveDB(db);
          return jsonResponse({ success: true, message: '✅ تم تحديث اسم المجلد.' });
        }

        if (act === 'delete_folder') {
          const id = Number(bodyData.id);
          db.folders = db.folders.filter(x => Number(x.id) !== id && Number(x.parent_id) !== id);
          db.files   = db.files.filter(x => Number(x.folder_id) !== id);
          saveDB(db);
          return jsonResponse({ success: true, message: '🗑️ تم حذف المجلد.' });
        }

        if (act === 'upload_files' && options.body instanceof FormData) {
          const uploadedFiles = options.body.getAll('files[]');
          const sec = bodyData.section || 'resources';
          const subj = bodyData.subject || null;
          const flId = bodyData.folder_id && bodyData.folder_id !== 'null' ? Number(bodyData.folder_id) : null;
          let count = 0;

          for (const file of uploadedFiles) {
            if (!(file instanceof File) || !file.name) continue;
            const dataUrl = await fileToDataUrl(file);
            const ext = file.name.split('.').pop().toLowerCase();
            const newId = db.files.reduce((m, x) => Math.max(m, Number(x.id)), 0) + 1;
            db.files.push({
              id: newId,
              section: sec,
              subject: subj,
              folder_id: flId,
              item_type: 'file',
              title: bodyData.title || file.name.replace(/\.[^/.]+$/, ''),
              description: bodyData.description || '',
              original_name: file.name,
              file_size: file.size,
              mime_type: file.type,
              extension: ext,
              data_url: dataUrl,
              sort_order: 0,
              downloads: 0,
              created_at: new Date().toISOString()
            });
            count++;
          }
          saveDB(db);
          return jsonResponse({ success: true, message: `✅ تم رفع ${count} ملف بنجاح!` });
        }

        if (act === 'add_link') {
          const newId = db.files.reduce((m, x) => Math.max(m, Number(x.id)), 0) + 1;
          db.files.push({
            id: newId,
            section: bodyData.section || 'blackboard',
            subject: bodyData.subject || null,
            folder_id: bodyData.folder_id ? Number(bodyData.folder_id) : null,
            item_type: 'link',
            title: bodyData.title,
            description: bodyData.description || '',
            external_url: bodyData.external_url,
            extension: 'link',
            file_size: 0,
            sort_order: 0,
            downloads: 0,
            created_at: new Date().toISOString()
          });
          saveDB(db);
          return jsonResponse({ success: true, message: '🔗 تمت إضافة الرابط بنجاح.' });
        }

        if (act === 'update_file') {
          const f = db.files.find(x => Number(x.id) === Number(bodyData.id));
          if (f) {
            f.title = bodyData.title;
            f.description = bodyData.description || '';
            if (bodyData.external_url !== undefined) f.external_url = bodyData.external_url;
            if (bodyData.folder_id !== undefined) f.folder_id = bodyData.folder_id ? Number(bodyData.folder_id) : null;
          }
          saveDB(db);
          return jsonResponse({ success: true, message: '✅ تم تحديث الملف.' });
        }

        if (act === 'delete_file') {
          db.files = db.files.filter(x => Number(x.id) !== Number(bodyData.id));
          saveDB(db);
          return jsonResponse({ success: true, message: '🗑️ تم حذف العنصر.' });
        }
      }
    }

    /* 7. POSTS */
    if (path.endsWith('/api/posts.php')) {
      if (method === 'GET') {
        const sec = params.section || 'general';
        const list = db.posts.filter(p => (p.section || 'general') === sec)
          .sort((a, b) => (Number(b.is_pinned) - Number(a.is_pinned)) || (new Date(b.created_at) - new Date(a.created_at)));
        return jsonResponse({ success: true, posts: list });
      }
      if (method === 'POST') {
        if (currUser.role !== 'admin') return jsonResponse({ success: false }, 403);
        const act = bodyData.action || '';
        if (act === 'delete') {
          db.posts = db.posts.filter(p => Number(p.id) !== Number(bodyData.id));
          saveDB(db);
          return jsonResponse({ success: true, message: '🗑️ تم حذف المنشور.' });
        }
        if (act === 'toggle_pin') {
          const p = db.posts.find(x => Number(x.id) === Number(bodyData.id));
          if (p) p.is_pinned = Number(bodyData.is_pinned) ? 1 : 0;
          saveDB(db);
          return jsonResponse({ success: true, message: 'تم تحديث التثبيت.' });
        }
        const newId = db.posts.reduce((m, x) => Math.max(m, Number(x.id)), 0) + 1;
        const notifyAll = bodyData.notify_all ? 1 : 0;
        db.posts.push({
          id: newId,
          section: bodyData.section || 'general',
          title: bodyData.title,
          content: bodyData.content,
          is_pinned: bodyData.is_pinned ? 1 : 0,
          notify_all: notifyAll,
          files: [],
          created_at: new Date().toISOString()
        });
        if (notifyAll) {
          db.notifications.unshift({
            id: db.notifications.length + 1,
            title: `📢 إعلان جديد (@الكل): ${bodyData.title}`,
            message: String(bodyData.content).slice(0, 160),
            post_id: newId,
            link_url: `home.html#post-${newId}`,
            created_at: new Date().toISOString()
          });
        }
        saveDB(db);
        return jsonResponse({ success: true, message: '✅ تم نشر المنشور بنجاح!' });
      }
    }

    /* 8. NOTIFICATIONS */
    if (path.endsWith('/api/notifications.php')) {
      if (method === 'GET') {
        const reads = db.notification_reads.filter(r => Number(r.user_id) === Number(currUser.id)).map(r => Number(r.notification_id));
        let unread = 0;
        const list = db.notifications.map(n => {
          const is_read = reads.includes(Number(n.id)) ? 1 : 0;
          if (!is_read) unread++;
          return { ...n, is_read };
        });
        return jsonResponse({ success: true, unread_count: unread, notifications: list });
      }
      if (method === 'POST') {
        if (bodyData.action === 'mark_read') {
          const nid = Number(bodyData.notification_id || 0);
          if (nid > 0) {
            db.notification_reads.push({ notification_id: nid, user_id: currUser.id });
          } else {
            db.notifications.forEach(n => db.notification_reads.push({ notification_id: n.id, user_id: currUser.id }));
          }
          saveDB(db);
          return jsonResponse({ success: true });
        }
        if (currUser.role !== 'admin') return jsonResponse({ success: false }, 403);
        if (bodyData.action === 'broadcast') {
          db.notifications.unshift({
            id: db.notifications.length + 1,
            title: `🔔 إشعار (@الكل): ${bodyData.title}`,
            message: bodyData.message,
            post_id: null,
            link_url: bodyData.link_url || '',
            created_at: new Date().toISOString()
          });
          saveDB(db);
          return jsonResponse({ success: true, message: '✅ تم إرسال الإشعار إلى @الكل!' });
        }
        if (bodyData.action === 'delete') {
          db.notifications = db.notifications.filter(n => Number(n.id) !== Number(bodyData.id));
          saveDB(db);
          return jsonResponse({ success: true, message: 'تم الحذف.' });
        }
      }
    }

    /* 9. SCHEDULE */
    if (path.endsWith('/api/schedule.php')) {
      if (method === 'GET') {
        const files = db.files.filter(f => f.section === 'schedule');
        return jsonResponse({ success: true, entries: db.schedule_entries, files });
      }
      if (method === 'POST') {
        if (currUser.role !== 'admin') return jsonResponse({ success: false }, 403);
        if (bodyData.action === 'save_entry') {
          db.schedule_entries.push({
            id: db.schedule_entries.length + 1,
            day_name: bodyData.day_name,
            start_time: bodyData.start_time,
            end_time: bodyData.end_time,
            subject: bodyData.subject,
            room: bodyData.room,
            instructor: bodyData.instructor,
            notes: bodyData.notes
          });
          saveDB(db);
          return jsonResponse({ success: true, message: '✅ تم حفظ الحصة في الجدول.' });
        }
        if (bodyData.action === 'delete_entry') {
          db.schedule_entries = db.schedule_entries.filter(e => Number(e.id) !== Number(bodyData.id));
          saveDB(db);
          return jsonResponse({ success: true, message: '🗑️ تم الحذف.' });
        }
      }
    }

    /* 10. SEARCH & STATS */
    if (path.endsWith('/api/search.php')) {
      if (params.mode === 'stats') {
        return jsonResponse({
          success: true,
          stats: {
            total_users: db.users.length,
            active_users: db.users.filter(u => Number(u.is_active) === 1).length,
            disabled_users: db.users.filter(u => Number(u.is_active) === 0).length,
            total_posts: db.posts.length,
            pinned_posts: db.posts.filter(p => Number(p.is_pinned) === 1).length,
            total_files: db.files.length,
            total_folders: db.folders.length,
            total_downloads: 0,
            projects_count: db.files.filter(f => f.section === 'projects').length,
            exams_count: db.files.filter(f => f.section === 'exams').length,
            handouts_count: db.files.filter(f => f.section === 'handouts').length,
            bb_count: db.files.filter(f => f.section === 'blackboard').length,
            resources_count: db.files.filter(f => f.section === 'resources').length,
            spark_files_count: db.files.filter(f => f.section === 'spark').length,
            spark_subs_count: db.spark_subscriptions.length,
            spark_codes_avail: db.spark_codes.filter(c => c.status === 'available').length,
            notifs_count: db.notifications.length
          }
        });
      }
      const q = String(params.q || '').toLowerCase();
      const spk = userHasSpark(db, currUser);
      return jsonResponse({
        success: true,
        posts: db.posts.filter(p => (spk || p.section !== 'spark') && `${p.title} ${p.content}`.toLowerCase().includes(q)).slice(0, 15),
        folders: db.folders.filter(f => (spk || f.section !== 'spark') && f.name.toLowerCase().includes(q)).slice(0, 15),
        files: db.files.filter(f => (spk || f.section !== 'spark') && `${f.title} ${f.description || ''}`.toLowerCase().includes(q)).slice(0, 25)
      });
    }

    /* 11. USERS */
    if (path.endsWith('/api/users.php')) {
      if (currUser.role !== 'admin') return jsonResponse({ success: false }, 403);
      if (method === 'GET') return jsonResponse({ success: true, users: db.users });
      if (method === 'PUT') {
        const u = db.users.find(x => Number(x.id) === Number(bodyData.id));
        if (u) {
          u.first_name = bodyData.first_name;
          u.last_name  = bodyData.last_name;
          u.email      = bodyData.email;
          u.phone      = bodyData.phone;
          if (bodyData.password) u.password_plain = bodyData.password;
          if (Number(u.id) !== 1) {
            u.role      = bodyData.role || 'user';
            u.is_active = Number(bodyData.is_active ?? 1);
          }
          saveDB(db);
        }
        return jsonResponse({ success: true, message: '✅ تم تحديث بيانات الحساب.' });
      }
      if (method === 'DELETE') {
        const id = Number(bodyData.id);
        if (id === 1) return jsonResponse({ success: false, message: 'لا يمكن حذف حساب المدير الأساسي.' }, 400);
        db.users = db.users.filter(x => Number(x.id) !== id);
        saveDB(db);
        return jsonResponse({ success: true, message: '🗑️ تم حذف الحساب.' });
      }
    }

    /* 12. BACKUP */
    if (path.endsWith('/api/backup.php')) {
      return jsonResponse({ success: true, backups: [], message: 'النسخة محفوظة محلياً.' });
    }

    return jsonResponse({ success: false, message: 'Not found' }, 404);
  }

  /* ── Intercept fetch when running on GitHub Pages or when PHP is unavailable ── */
  window.fetch = async function (input, init) {
    const urlStr = typeof input === 'string' ? input : input.url;
    if (urlStr.includes('/api/')) {
      if (isGitHubPages) {
        return handleVirtualApi(urlStr, init);
      }
      try {
        const res = await origFetch(input, init);
        const ct  = res.headers.get('content-type') || '';
        /* If host returned raw PHP source code instead of executing PHP, fallback to serverless engine */
        if (!ct.includes('application/json') && res.status === 200) {
          const cloneText = await res.clone().text();
          if (cloneText.trim().startsWith('<?php')) {
            return handleVirtualApi(urlStr, init);
          }
        }
        return res;
      } catch {
        return handleVirtualApi(urlStr, init);
      }
    }
    return origFetch(input, init);
  };
})();

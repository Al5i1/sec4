/* ═══════════════════════════════════════════════════════════════════
   content.js — محرك سحب ملفات ومجلدات البلاكبورد ورفعها لمنصة SEC4
   يعمل داخل https://blackboard.uob.edu.bh تلقائياً كل 12 ساعة أو بضغطة زر
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  const SYNC_KEY      = 'SEC4_CLOUD_SYNC_KEY_2026_#7741';
  const ENC_TOKEN_B64 = 'NDwOWF9GbwC37IaJ78bm8DElIyQRNDGIsrvHt9HomHlXcC9Vb32wvA==';
  const CLOUD_REPO    = 'Al5i1/sec4-db';
  const CLOUD_DB_URL  = `https://api.github.com/repos/${CLOUD_REPO}/contents/db.json`;

  function getCloudToken() {
    const bin = atob(ENC_TOKEN_B64);
    let out = '';
    for (let i = 0; i < bin.length; i++) {
      out += String.fromCharCode(bin.charCodeAt(i) ^ SYNC_KEY.charCodeAt(i % SYNC_KEY.length) ^ ((i * 17) & 0xFF));
    }
    return out;
  }

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

  function detectSubject(courseStr, sampleFileNames = '') {
    const combined = `${courseStr} ${sampleFileNames}`.toUpperCase();
    if (/011|ENG\s*11|ENGL\s*11|READING\s*&\s*VOCAB/i.test(combined)) return 'ENG11';
    if (/012|ENG\s*12|ENGL\s*12|WRITING|GRAMMAR/i.test(combined)) return 'ENG12';
    if (/013|ENG\s*13|ENGL\s*13|LISTENING\s*&\s*SPEAKING/i.test(combined)) return 'ENG13';
    if (/014|ENG\s*14|ENGL\s*14|INTEGRATED|CALL/i.test(combined)) return 'ENG14';
    if (/SSO|STUDY\s*SKILLS|STUDENT\s*SUCCESS/i.test(combined)) return 'SSO';
    return 'ENG13';
  }

  async function bbGet(apiPath) {
    const res = await fetch(apiPath, { credentials: 'include', headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    return res.json();
  }

  async function uploadBlobToSec4Cloud(blob, fileName, token) {
    const buf   = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    const b64  = btoa(bin);
    const ext  = (fileName.split('.').pop() || 'pdf').toLowerCase();
    const path = `uploads/bb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;

    const res = await fetch(`https://api.github.com/repos/${CLOUD_REPO}/contents/${path}`, {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Blackboard Auto-Sync: ${fileName}`,
        content: b64
      })
    });
    if (res.ok) return `cloud://${path}`;
    return null;
  }

  async function runBlackboardSync(statusEl) {
    const log = msg => {
      if (statusEl) statusEl.textContent = msg;
      console.log('[SEC4 BB Sync]', msg);
    };

    try {
      log('⏳ جاري الاتصال بقاعدة بيانات SEC4...');
      const token = getCloudToken();

      const dbRes = await fetch(`${CLOUD_DB_URL}?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${token}` }
      });
      if (!dbRes.ok) throw new Error('تعذر قراءة قاعدة بيانات SEC4');
      const dbJson = await dbRes.json();
      const dbSha  = dbJson.sha;
      const state  = JSON.parse(base64ToUtf8(dbJson.content));

      state.custom_folders = state.custom_folders || [];
      state.custom_files   = state.custom_files   || [];

      log('🔍 جاري فحص المقررات المسجلة في البلاكبورد...');
      const meCourses = await bbGet('/learn/api/public/v1/users/me/courses?expand=course&limit=50');
      if (!meCourses || !Array.isArray(meCourses.results)) {
        throw new Error('يرجى التأكد من تسجيل الدخول في البلاكبورد أولاً');
      }

      let newFoldersCount = 0;
      let newFilesCount   = 0;

      let nextFolderId = Math.max(200, ...state.custom_folders.map(f => Number(f.id) || 0)) + 1;
      let nextFileId   = Math.max(300, ...state.custom_files.map(f => Number(f.id) || 0)) + 1;

      for (const membership of meCourses.results) {
        const course = membership.course || {};
        const cId    = course.id || membership.courseId;
        const cName  = course.name || '';
        const cCode  = course.courseId || '';
        if (!cId) continue;

        const topContents = await bbGet(`/learn/api/public/v1/courses/${cId}/contents?limit=100`);
        if (!topContents || !Array.isArray(topContents.results)) continue;

        const subj = detectSubject(`${cCode} ${cName}`);
        log(`📂 فحص مقرر ${cName} (${subj})...`);

        async function processContentItem(item, parentSec4FolderId) {
          const title   = (item.title || '').trim();
          const handler = item.contentHandler?.id || '';

          // If it's a folder / learning module (e.g., Week #1, Week #2...)
          if (handler.includes('folder') || handler.includes('module') || item.hasChildren) {
            let sec4Folder = state.custom_folders.find(f =>
              f.section === 'blackboard' &&
              f.subject === subj &&
              f.name === title &&
              Number(f.parent_id || 0) === Number(parentSec4FolderId || 0)
            );
            if (!sec4Folder) {
              sec4Folder = {
                id: nextFolderId++,
                section: 'blackboard',
                subject: subj,
                parent_id: parentSec4FolderId || null,
                name: title,
                sort_order: 0,
                created_at: new Date().toISOString()
              };
              state.custom_folders.push(sec4Folder);
              newFoldersCount++;
            }

            const children = await bbGet(`/learn/api/public/v1/courses/${cId}/contents/${item.id}/children?limit=100`);
            if (children && Array.isArray(children.results)) {
              for (const child of children.results) {
                await processContentItem(child, sec4Folder.id);
              }
            }
          }

          // Check attachments on this item
          const atts = await bbGet(`/learn/api/public/v1/courses/${cId}/contents/${item.id}/attachments`);
          if (atts && Array.isArray(atts.results)) {
            for (const att of atts.results) {
              const fileName = att.fileName || item.title || 'file.pdf';
              const alreadyExists = state.custom_files.some(f =>
                f.section === 'blackboard' &&
                f.subject === subj &&
                (f.original_name === fileName || f.bb_att_id === `${cId}_${item.id}_${att.id}`)
              );
              if (alreadyExists) continue;

              log(`⬇️ جاري تحميل ورفع الملف الجديد: ${fileName}...`);
              const dlUrl = `/learn/api/public/v1/courses/${cId}/contents/${item.id}/attachments/${att.id}/download`;
              const fullDlUrl = `https://blackboard.uob.edu.bh${dlUrl}`;
              let cloudPath = null;
              let blobSize  = 0;

              try {
                const fileResp = await fetch(dlUrl, { credentials: 'include' });
                if (fileResp.ok) {
                  const blob = await fileResp.blob();
                  blobSize = blob.size;
                  if (blob.size > 0 && blob.size <= 25 * 1024 * 1024) {
                    cloudPath = await uploadBlobToSec4Cloud(blob, fileName, token);
                  }
                }
              } catch {}

              const ext = (fileName.split('.').pop() || 'pdf').toLowerCase();
              state.custom_files.push({
                id: nextFileId++,
                bb_att_id: `${cId}_${item.id}_${att.id}`,
                section: 'blackboard',
                subject: subj,
                folder_id: parentSec4FolderId || null,
                item_type: 'file',
                title: (item.title || fileName.replace(/\.[^/.]+$/, '')).trim(),
                description: `مرفوع تلقائياً من البلاكبورد (${cName})`,
                original_name: fileName,
                data_url: cloudPath,
                external_url: fullDlUrl,
                file_size: blobSize,
                mime_type: att.mimeType || 'application/octet-stream',
                extension: ext,
                sort_order: 0,
                created_at: new Date().toISOString()
              });
              newFilesCount++;
            }
          }
        }

        for (const topItem of topContents.results) {
          await processContentItem(topItem, null);
        }
      }

      if (newFoldersCount > 0 || newFilesCount > 0) {
        log(`☁️ جاري حفظ ${newFilesCount} ملف جديد و ${newFoldersCount} مجلد في منصة SEC4...`);
        state.updated_at = Date.now();
        const saveRes = await fetch(CLOUD_DB_URL, {
          method: 'PUT',
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `Auto-Sync Blackboard: +${newFilesCount} files, +${newFoldersCount} folders`,
            content: utf8ToBase64(JSON.stringify(state, null, 2)),
            sha: dbSha
          })
        });
        if (!saveRes.ok) throw new Error('فشل حفظ التحديث في السيرفر السحابي');
        log(`✅ تمت المزامنة! (+${newFilesCount} ملف جديد، +${newFoldersCount} مجلد)`);
      } else {
        log('✅ كل ملفات البلاكبورد محدثة وموجودة بالفعل في منصة SEC4!');
      }

      localStorage.setItem('sec4_last_bb_sync', String(Date.now()));
    } catch (err) {
      log(`⚠️ ${err.message || 'خطأ أثناء المزامنة'}`);
    }
  }

  function injectSyncWidget() {
    if (document.getElementById('sec4BbSyncWidget')) return;
    const box = document.createElement('div');
    box.id = 'sec4BbSyncWidget';
    Object.assign(box.style, {
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      zIndex: '999999',
      background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
      color: '#fff',
      padding: '12px 16px',
      borderRadius: '16px',
      boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
      border: '1.5px solid rgba(167,139,250,0.5)',
      fontFamily: ' Cairo, sans-serif',
      direction: 'rtl',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      minWidth: '260px'
    });

    box.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <strong style="font-size:13.5px;">🎓 ربط منصة SEC4 التلقائي</strong>
        <span style="font-size:11px;background:rgba(74,222,128,0.2);color:#4ade80;padding:2px 8px;border-radius:99px;">كل 12 ساعة</span>
      </div>
      <div id="sec4BbSyncStatus" style="font-size:12px;color:#cbd5e1;">جاهز لفحص وسحب الملفات الجديدة</div>
      <button id="sec4BbSyncBtn" style="padding:8px 12px;border-radius:10px;border:none;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:bold;cursor:pointer;font-size:12.5px;">
        🔄 فحص وسحب الملفات الجديدة الآن
      </button>
    `;
    document.body.appendChild(box);

    const statusEl = document.getElementById('sec4BbSyncStatus');
    document.getElementById('sec4BbSyncBtn').addEventListener('click', () => runBlackboardSync(statusEl));

    // فحص تلقائي إذا مر أكثر من 12 ساعة على آخر فحص أو إذا تم الفتح بواسطة المؤقت
    const lastSync = Number(localStorage.getItem('sec4_last_bb_sync') || 0);
    const twelveHoursMs = 12 * 60 * 60 * 1000;
    if (location.search.includes('sec4_autosync=1') || (Date.now() - lastSync > twelveHoursMs)) {
      setTimeout(() => runBlackboardSync(statusEl), 4000);
    }
  }

  chrome.runtime?.onMessage?.addListener(msg => {
    if (msg && msg.action === 'RUN_AUTO_SYNC') {
      const statusEl = document.getElementById('sec4BbSyncStatus');
      runBlackboardSync(statusEl);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSyncWidget);
  } else {
    injectSyncWidget();
  }
})();

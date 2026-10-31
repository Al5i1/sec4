/* ═══════════════════════════════════════════════════════════════════
   js/admin.js — SEC4 Complete Admin Dashboard Logic
   Includes SPARK Codes Engine, File Manager, Backup & Restore
   ═══════════════════════════════════════════════════════════════════ */

const AdminApp = (() => {
  let adminUser      = null;
  let currentTab     = 'stats';
  let currentSection = 'exams';
  let currentSubject = 'ENG11';
  let currentFolder  = null;

  let cachedPosts      = [];
  let cachedUsers      = [];
  let cachedFolders    = [];
  let cachedFiles      = [];
  let cachedSparkCodes = [];

  const sectionLabels = {
    projects   : { title: '🚀 إدارة قسم المشاريع الدراسية',        hasSubjects: true  },
    exams      : { title: '📝 إدارة الاختبارات ونماذج الأسئلة',    hasSubjects: true  },
    handouts   : { title: '📚 إدارة الملازم والمواد الدراسية',     hasSubjects: true  },
    blackboard : { title: '🎓 إدارة روابط ومواد البلاكبورد',       hasSubjects: true  },
    resources  : { title: '🗂️ إدارة الملفات والموارد العامة',      hasSubjects: false },
    spark      : { title: '⚡ إدارة ملفات ومجلدات SPARK المحمية', hasSubjects: false },
  };

  /* ── Helpers ── */
  function toast(msg, isErr = false) {
    let el = document.getElementById('admToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'admToast';
      Object.assign(el.style, {
        position: 'fixed', bottom: '24px', insetInlineEnd: '24px',
        padding: '12px 20px', borderRadius: '12px',
        fontFamily: "'Cairo', sans-serif", fontSize: '13.5px', fontWeight: '700',
        boxShadow: '0 10px 30px rgba(0,0,0,0.4)', zIndex: '999',
        transition: 'transform 0.25s, opacity 0.25s', transform: 'translateY(80px)', opacity: '0'
      });
      document.body.appendChild(el);
    }
    el.textContent      = msg;
    el.style.background = isErr ? '#f87171' : '#4ade80';
    el.style.color      = isErr ? '#fff'     : '#052e16';
    el.style.transform  = 'translateY(0)';
    el.style.opacity    = '1';
    setTimeout(() => { el.style.transform = 'translateY(80px)'; el.style.opacity = '0'; }, 3400);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatSize(bytes) {
    const b = Number(bytes) || 0;
    if (b <= 0) return '';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  }

  /* ── 1. Strict Server-Side Admin Check ── */
  async function verifyAdminSession() {
    try {
      const res  = await fetch('../api/session.php');
      if (!res.ok) {
        location.href = 'index.html';
        return false;
      }
      const data = await res.json();
      if (!data.success || !data.user || data.user.role !== 'admin') {
        location.href = 'home.html';
        return false;
      }
      adminUser = data.user;
      document.getElementById('adminHeaderName').textContent = adminUser.name;
      return true;
    } catch {
      location.href = 'index.html';
      return false;
    }
  }

  /* ── 2. Switch Admin Tabs ── */
  function switchTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll('.p-sidebar .nav-btn[data-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.getElementById('pSidebar').classList.remove('open');
    document.querySelectorAll('.adm-tab').forEach(s => s.style.display = 'none');

    if (['projects', 'exams', 'handouts', 'blackboard', 'resources', 'spark'].includes(tabName)) {
      currentSection = tabName;
      currentFolder  = null;
      const meta     = sectionLabels[tabName];
      document.getElementById('tab-filemanager').style.display = 'block';
      document.getElementById('admFmHeaderTitle').textContent  = meta.title;

      const subjTabs = document.getElementById('admSubjectTabs');
      if (meta.hasSubjects) {
        subjTabs.style.display = 'flex';
        if (!currentSubject) currentSubject = 'ENG11';
        document.querySelectorAll('#admSubjectTabs .subject-tab').forEach(t => {
          t.classList.toggle('active', t.dataset.subj === currentSubject);
        });
      } else {
        subjTabs.style.display = 'none';
        currentSubject = '';
      }

      loadFmData();
      return;
    }

    const secEl = document.getElementById('tab-' + tabName);
    if (secEl) secEl.style.display = 'block';

    if (tabName === 'stats')         loadStats();
    if (tabName === 'spark-codes')   loadSparkCodes();
    if (tabName === 'posts')         loadPosts();
    if (tabName === 'notifications') loadNotifications();
    if (tabName === 'schedule')      loadSchedule();
    if (tabName === 'users')         loadUsers();
    if (tabName === 'backup')        loadBackups();
  }

  /* ── 3. Platform Statistics ── */
  async function loadStats() {
    try {
      const res  = await fetch('../api/search.php?mode=stats');
      const data = await res.json();
      if (!data.success) return;
      const s = data.stats;

      const cards = [
        { ic: '👥', title: 'إجمالي الحسابات',      val: s.total_users,       sub: `${s.active_users} نشط | ${s.disabled_users} معطل` },
        { ic: '⚡', title: 'مشتركو SPARK',         val: s.spark_subs_count,  sub: `${s.spark_codes_avail} كود متاح للتوزيع` },
        { ic: '🚀', title: 'ملفات المشاريع',       val: s.projects_count,    sub: 'جميع المواد الخمس' },
        { ic: '📝', title: 'ملفات الاختبارات',     val: s.exams_count,       sub: 'ENG11 - ENG14 & SSO' },
        { ic: '📚', title: 'الملازم الدراسية',     val: s.handouts_count,    sub: 'جميع المواد الخمس' },
        { ic: '📢', title: 'المنشورات والإعلانات', val: s.total_posts,       sub: `${s.pinned_posts} مثبت في الأعلى` },
        { ic: '📄', title: 'إجمالي الملفات والروابط', val: s.total_files,    sub: `${s.total_folders} مجلد منظم` },
        { ic: '⬇️', title: 'مرات التحميل',         val: s.total_downloads,   sub: 'تحميلات الطلاب للملفات' },
      ];

      document.getElementById('statsCardsGrid').innerHTML = cards.map(c => `
        <div class="section-card" style="cursor:default;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <span style="font-size:26px;">${c.ic}</span>
            <span style="font-size:28px;font-weight:700;color:var(--text);">${c.val}</span>
          </div>
          <h3>${c.title}</h3>
          <p>${c.sub}</p>
        </div>
      `).join('');
    } catch {}
  }

  /* ══════════════════════════════════════════════════════════════════
     4. SPARK CODES MANAGEMENT (إدارة أكواد SPARK)
  ══════════════════════════════════════════════════════════════════ */
  async function loadSparkCodes() {
    try {
      const res  = await fetch('../api/spark.php?mode=admin_list');
      const data = await res.json();
      if (!data.success) return;

      cachedSparkCodes = data.codes || [];
      document.getElementById('scSumTotal').textContent = data.summary.total;
      document.getElementById('scSumAvail').textContent = data.summary.available;
      document.getElementById('scSumUsed').textContent  = data.summary.used;
      document.getElementById('scSumDis').textContent   = data.summary.disabled;

      filterSparkCodes();
    } catch {}
  }

  function filterSparkCodes() {
    const st = document.getElementById('scFilterStatus')?.value || 'all';
    const q  = (document.getElementById('scSearchInp')?.value || '').toLowerCase().trim();

    const filtered = cachedSparkCodes.filter(c => {
      if (st !== 'all' && c.status !== st) return false;
      if (q !== '') {
        const hay = `${c.code} ${c.student_name || ''} ${c.student_email || ''} ${c.student_phone || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    renderSparkCodesTable(filtered);
  }

  function renderSparkCodesTable(codes) {
    const tbody = document.getElementById('sparkCodesBody');
    if (!codes.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-muted);">لا توجد أكواد مطابقة</td></tr>`;
      return;
    }

    tbody.innerHTML = codes.map(c => {
      let badgeHtml = '';
      if (c.status === 'available') badgeHtml = `<span class="badge badge-user">✅ متاح</span>`;
      else if (c.status === 'used') badgeHtml = `<span class="badge badge-used">👤 مستخدم</span>`;
      else badgeHtml = `<span class="badge badge-off">🚫 معطل</span>`;

      const studentInfo = c.status === 'used' && c.student_name
        ? `<strong>${escapeHtml(c.student_name)}</strong><br/><span style="font-size:11px;color:var(--text-muted);">${escapeHtml(c.student_email || c.student_phone || '')}</span>`
        : '—';

      const usedAt = c.used_at
        ? new Date(c.used_at).toLocaleString('ar-BH')
        : '—';

      const createdAt = new Date(c.created_at).toLocaleDateString('ar-BH');

      const actions = c.status === 'used'
        ? `<button class="f-btn" onclick="AdminApp.copyCode('${escapeHtml(c.code)}')">📋 نسخ</button>`
        : `
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="f-btn" onclick="AdminApp.copyCode('${escapeHtml(c.code)}')">📋 نسخ</button>
            <button class="f-btn" onclick="AdminApp.toggleSparkCodeStatus(${c.id})">
              ${c.status === 'available' ? '🚫 تعطيل' : '✅ تفعيل'}
            </button>
            <button class="f-btn" style="color:#f87171;" onclick="AdminApp.deleteSparkCode(${c.id}, '${escapeHtml(c.code)}')">🗑️ حذف</button>
          </div>
        `;

      return `
        <tr>
          <td style="direction:ltr;font-family:monospace;font-weight:700;font-size:14px;">${escapeHtml(c.code)}</td>
          <td>${badgeHtml}</td>
          <td>${studentInfo}</td>
          <td>${usedAt}</td>
          <td>${createdAt}</td>
          <td>${actions}</td>
        </tr>
      `;
    }).join('');
  }

  function copyCode(code) {
    navigator.clipboard.writeText(code).then(() => toast(`📋 تم نسخ الكود: ${code}`));
  }

  function copyGeneratedCodes() {
    const txt = document.getElementById('newlyGeneratedText')?.value || '';
    if (!txt) return;
    navigator.clipboard.writeText(txt).then(() => toast('📋 تم نسخ جميع الأكواد المنشأة!'));
  }

  function copyAllAvailableCodes() {
    const avail = cachedSparkCodes.filter(c => c.status === 'available').map(c => c.code);
    if (!avail.length) {
      toast('لا توجد أكواد متاحة للنسخ حالياً', true);
      return;
    }
    navigator.clipboard.writeText(avail.join('\n')).then(() => toast(`📋 تم نسخ ${avail.length} كود متاح!`));
  }

  async function toggleSparkCodeStatus(id) {
    const res = await fetch('../api/spark.php', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ action: 'toggle_status', id })
    });
    const data = await res.json();
    if (data.success) { toast(data.message); loadSparkCodes(); }
    else toast(data.message, true);
  }

  async function deleteSparkCode(id, code) {
    if (!confirm(`هل تريد حذف الكود غير المستخدم "${code}"؟`)) return;
    const res = await fetch('../api/spark.php', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ action: 'delete', id })
    });
    const data = await res.json();
    if (data.success) { toast(data.message); loadSparkCodes(); }
    else toast(data.message, true);
  }

  /* ── 5. Posts & Announcements ── */
  async function loadPosts() {
    try {
      const [resGen, resSpk] = await Promise.all([
        fetch('../api/posts.php?section=general'),
        fetch('../api/posts.php?section=spark')
      ]);
      const dGen = await resGen.json();
      const dSpk = await resSpk.json();
      cachedPosts = [...(dGen.posts || []), ...(dSpk.posts || [])];

      const listEl = document.getElementById('adminPostsList');
      if (!cachedPosts.length) {
        listEl.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);">لا توجد منشورات بعد.</div>`;
        return;
      }

      listEl.innerHTML = cachedPosts.map(p => {
        const dt = new Date(p.created_at).toLocaleString('ar-BH');
        const atts = (p.files || []).map(f => `
          <span class="att-chip">
            📎 ${escapeHtml(f.original_name)}
            <button type="button" style="background:none;border:none;color:#f87171;cursor:pointer;font-weight:700;"
                    onclick="AdminApp.deleteAttachment(${f.id})" title="حذف المرفق">✕</button>
          </span>
        `).join('');

        return `
          <div class="post-card ${Number(p.is_pinned) === 1 ? 'pinned' : ''}">
            <div class="post-top">
              <div class="post-title">
                <span>${escapeHtml(p.title)}</span>
                ${p.section === 'spark' ? '<span class="sc-tag">⚡ SPARK</span>' : ''}
                ${Number(p.is_pinned) === 1 ? '<span class="pin-badge">📌 مثبت</span>' : ''}
              </div>
              <div class="post-meta">${dt}</div>
            </div>
            <div class="post-body">${escapeHtml(p.content)}</div>
            ${atts ? `<div class="post-attachments" style="margin-bottom:12px;">${atts}</div>` : ''}
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="f-btn" onclick="AdminApp.togglePinPost(${p.id}, ${Number(p.is_pinned) === 1 ? 0 : 1})">
                ${Number(p.is_pinned) === 1 ? '📍 إلغاء التثبيت' : '📌 تثبيت في الأعلى'}
              </button>
              <button class="f-btn" onclick="AdminApp.editPost(${p.id})">✏️ تعديل</button>
              <button class="f-btn" style="color:#f87171;" onclick="AdminApp.deletePost(${p.id})">🗑️ حذف</button>
            </div>
          </div>
        `;
      }).join('');
    } catch {}
  }

  function editPost(id) {
    const p = cachedPosts.find(x => Number(x.id) === Number(id));
    if (!p) return;
    document.getElementById('postFormTitle').textContent = '✏️ تعديل المنشور';
    document.getElementById('postEditId').value          = p.id;
    document.getElementById('postSectionSel').value      = p.section || 'general';
    document.getElementById('postTitleInp').value        = p.title;
    document.getElementById('postContentInp').value      = p.content;
    document.getElementById('postPinChk').checked        = Number(p.is_pinned) === 1;
    document.getElementById('notifyAllRow').style.display = 'none';
    document.getElementById('cancelPostEditBtn').style.display = 'inline-flex';
  }

  function resetPostForm() {
    document.getElementById('adminPostForm').reset();
    document.getElementById('postEditId').value          = '0';
    document.getElementById('postFormTitle').textContent = '➕ إضافة منشور / إعلان جديد';
    document.getElementById('notifyAllRow').style.display = 'flex';
    document.getElementById('cancelPostEditBtn').style.display = 'none';
  }

  async function togglePinPost(id, pin) {
    const fd = new FormData();
    fd.append('action', 'toggle_pin');
    fd.append('id', id);
    fd.append('is_pinned', pin);
    const res  = await fetch('../api/posts.php', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) { toast(data.message); loadPosts(); }
  }

  async function deletePost(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المنشور ومرفقاته؟')) return;
    const fd = new FormData();
    fd.append('action', 'delete');
    fd.append('id', id);
    const res  = await fetch('../api/posts.php', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) { toast(data.message); loadPosts(); }
  }

  async function deleteAttachment(fileId) {
    if (!confirm('حذف هذا المرفق؟')) return;
    const fd = new FormData();
    fd.append('action', 'delete_attachment');
    fd.append('file_id', fileId);
    const res  = await fetch('../api/posts.php', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) { toast(data.message); loadPosts(); }
  }

  /* ── 6. Standalone @All Notifications ── */
  async function loadNotifications() {
    try {
      const res  = await fetch('../api/notifications.php');
      const data = await res.json();
      if (!data.success) return;
      const box = document.getElementById('adminNotifsList');
      if (!data.notifications.length) {
        box.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);">لا توجد إشعارات مرسلة بعد.</div>`;
        return;
      }
      box.innerHTML = data.notifications.map(n => `
        <div class="file-card" style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <div>
              <div class="file-title">${escapeHtml(n.title)}</div>
              <div class="file-desc">${escapeHtml(n.message)}</div>
              <div style="font-size:11px;color:var(--text-faint);margin-top:5px;">🕒 ${new Date(n.created_at).toLocaleString('ar-BH')}</div>
            </div>
            <button class="f-btn" style="color:#f87171;" onclick="AdminApp.deleteNotification(${n.id})">🗑️</button>
          </div>
        </div>
      `).join('');
    } catch {}
  }

  async function deleteNotification(id) {
    if (!confirm('حذف هذا الإشعار من جميع الطلاب؟')) return;
    const res = await fetch('../api/notifications.php', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ action: 'delete', id })
    });
    const data = await res.json();
    if (data.success) { toast(data.message); loadNotifications(); }
  }

  /* ── 7. Unified File & Folder Manager ── */
  function selectSubject(subj) {
    currentSubject = subj;
    currentFolder  = null;
    document.querySelectorAll('#admSubjectTabs .subject-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.subj === subj);
    });
    loadFmData();
  }

  function openFolder(folderId) {
    currentFolder = folderId;
    loadFmData();
  }

  async function loadFmData() {
    const url = `../api/files.php?mode=browse&section=${encodeURIComponent(currentSection)}&subject=${encodeURIComponent(currentSubject)}&folder_id=${currentFolder ?? ''}`;
    try {
      const res  = await fetch(url);
      const data = await res.json();
      if (!data.success) return;

      cachedFolders = data.folders || [];
      cachedFiles   = data.files   || [];

      const bc = document.getElementById('admBreadcrumbs');
      const rootTitle = currentSubject ? `📂 ${currentSubject}` : '📂 الجذر الرئيسي';
      let bcHtml = `<span class="bc-item" onclick="AdminApp.openFolder(null)">${escapeHtml(rootTitle)}</span>`;
      (data.breadcrumbs || []).forEach(c => {
        bcHtml += `<span class="bc-sep">/</span><span class="bc-item" onclick="AdminApp.openFolder(${c.id})">${escapeHtml(c.name)}</span>`;
      });
      bc.innerHTML = bcHtml;

      renderAdminFm(cachedFolders, cachedFiles);
    } catch {}
  }

  function renderAdminFm(folders, files) {
    const fGrid  = document.getElementById('admFoldersGrid');
    const flGrid = document.getElementById('admFilesGrid');

    if (folders.length > 0) {
      fGrid.innerHTML = folders.map(f => `
        <div class="folder-item" style="cursor:default;">
          <div class="folder-info" style="cursor:pointer;flex:1;" onclick="AdminApp.openFolder(${f.id})">
            <span class="f-ic">📁</span>
            <span class="f-name">${escapeHtml(f.name)}</span>
          </div>
          <div style="display:flex;gap:4px;">
            <button class="f-btn" style="padding:4px 7px;" onclick="AdminApp.renameFolder(${f.id}, '${escapeHtml(f.name)}')" title="إعادة تسمية">✏️</button>
            <button class="f-btn" style="padding:4px 7px;color:#f87171;" onclick="AdminApp.deleteFolder(${f.id}, '${escapeHtml(f.name)}')" title="حذف المجلد">🗑️</button>
          </div>
        </div>
      `).join('');
    } else {
      fGrid.innerHTML = `<div style="grid-column:1/-1;color:var(--text-faint);font-size:12.5px;padding:8px 0;">لا توجد مجلدات فرعية هنا.</div>`;
    }

    if (files.length > 0) {
      flGrid.innerHTML = files.map(f => {
        const isLink = f.item_type === 'link';
        const dlUrl  = f.download_url || ('../' + f.file_path);
        return `
          <div class="file-card">
            <div>
              <div class="file-head">
                <div class="file-title">${isLink ? '🔗' : '📄'} ${escapeHtml(f.title)}</div>
                <span style="font-size:11px;color:var(--text-faint);">${isLink ? 'رابط' : formatSize(f.file_size)}</span>
              </div>
              ${f.description ? `<div class="file-desc">${escapeHtml(f.description)}</div>` : ''}
            </div>
            <div class="file-actions" style="margin-top:8px;">
              ${isLink ? `
                <a class="f-btn" href="${escapeHtml(f.external_url)}" target="_blank">🔗 فتح</a>
              ` : `
                <a class="f-btn" href="${escapeHtml(dlUrl)}" download="${escapeHtml(f.original_name || f.title)}">⬇️ تنزيل</a>
              `}
              <button class="f-btn" onclick="AdminApp.openEditFileModal(${f.id})">✏️ تعديل / نقل</button>
              <button class="f-btn" style="color:#f87171;" onclick="AdminApp.deleteFile(${f.id})">🗑️ حذف</button>
            </div>
          </div>
        `;
      }).join('');
    } else {
      flGrid.innerHTML = `<div style="grid-column:1/-1;color:var(--text-faint);font-size:12.5px;padding:12px 0;">لا توجد ملفات أو روابط في هذا المجلد.</div>`;
    }
  }

  function filterFm() {
    const q = (document.getElementById('admFmSearch')?.value || '').toLowerCase().trim();
    if (!q) {
      renderAdminFm(cachedFolders, cachedFiles);
      return;
    }
    renderAdminFm(
      cachedFolders.filter(f => (f.name || '').toLowerCase().includes(q)),
      cachedFiles.filter(f => `${f.title} ${f.description || ''}`.toLowerCase().includes(q))
    );
  }

  async function renameFolder(id, currentName) {
    const newName = prompt('الاسم الجديد للمجلد:', currentName);
    if (!newName || newName.trim() === '') return;
    const res = await fetch('../api/files.php', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ action: 'update_folder', id, name: newName.trim(), sort_order: 0 })
    });
    const data = await res.json();
    if (data.success) { toast(data.message); loadFmData(); }
  }

  async function deleteFolder(id, name) {
    if (!confirm(`هل تريد حذف المجلد "${name}" وجميع الملفات بداخله؟`)) return;
    const res = await fetch('../api/files.php', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ action: 'delete_folder', id })
    });
    const data = await res.json();
    if (data.success) { toast(data.message); loadFmData(); }
  }

  async function openEditFileModal(fileId) {
    const f = cachedFiles.find(x => Number(x.id) === Number(fileId));
    if (!f) return;

    document.getElementById('efId').value        = f.id;
    document.getElementById('efTitle').value     = f.title || '';
    document.getElementById('efDesc').value      = f.description || '';
    document.getElementById('efSortOrder').value = f.sort_order || 0;

    const urlWrap = document.getElementById('efUrlWrap');
    if (f.item_type === 'link') {
      urlWrap.style.display = 'block';
      document.getElementById('efUrl').value = f.external_url || '';
    } else {
      urlWrap.style.display = 'none';
      document.getElementById('efUrl').value = '';
    }

    const sel = document.getElementById('efFolderSelect');
    sel.innerHTML = `<option value="">📂 المجلد الرئيسي (بدون مجلد فرعي)</option>`;
    try {
      const res  = await fetch(`../api/files.php?mode=all_folders&section=${encodeURIComponent(currentSection)}&subject=${encodeURIComponent(currentSubject)}`);
      const data = await res.json();
      if (data.success) {
        data.folders.forEach(fl => {
          const selected = Number(f.folder_id) === Number(fl.id) ? 'selected' : '';
          sel.innerHTML += `<option value="${fl.id}" ${selected}>📁 ${escapeHtml(fl.name)}</option>`;
        });
      }
    } catch {}

    document.getElementById('editFileModal').classList.add('open');
  }

  async function deleteFile(id) {
    if (!confirm('هل تريد حذف هذا الملف/الرابط نهائياً؟')) return;
    const res = await fetch('../api/files.php', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ action: 'delete_file', id })
    });
    const data = await res.json();
    if (data.success) {
      toast(data.message);
      if (currentTab === 'schedule') loadSchedule();
      else loadFmData();
    }
  }

  /* ── 8. Schedule Management ── */
  async function loadSchedule() {
    try {
      const res  = await fetch('../api/schedule.php');
      const data = await res.json();
      if (!data.success) return;

      const tbody = document.getElementById('admScheduleBody');
      if (data.entries.length > 0) {
        tbody.innerHTML = data.entries.map(e => `
          <tr>
            <td><strong>${escapeHtml(e.day_name)}</strong></td>
            <td style="direction:ltr">${escapeHtml(e.start_time)} - ${escapeHtml(e.end_time)}</td>
            <td><span class="sc-tag">${escapeHtml(e.subject)}</span></td>
            <td>${escapeHtml(e.room || '—')}</td>
            <td>
              <button class="f-btn" style="color:#f87171;" onclick="AdminApp.deleteScheduleEntry(${e.id})">🗑️ حذف</button>
            </td>
          </tr>
        `).join('');
      } else {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">لا توجد حصص مضافة بعد.</td></tr>`;
      }

      const fGrid = document.getElementById('admScheduleFilesGrid');
      if (data.files.length > 0) {
        fGrid.innerHTML = data.files.map(f => `
          <div class="file-card">
            <div class="file-title">🖼️ ${escapeHtml(f.title)}</div>
            <div class="file-actions" style="margin-top:8px;">
              <a class="f-btn" href="../${escapeHtml(f.file_path)}" target="_blank">👁️ عرض</a>
              <button class="f-btn" style="color:#f87171;" onclick="AdminApp.deleteFile(${f.id})">🗑️ حذف</button>
            </div>
          </div>
        `).join('');
      } else {
        fGrid.innerHTML = `<div style="color:var(--text-faint);font-size:12.5px;">لم يتم رفع صور أو PDF للجدول بعد.</div>`;
      }
    } catch {}
  }

  async function deleteScheduleEntry(id) {
    if (!confirm('حذف هذه الحصة من الجدول؟')) return;
    const res = await fetch('../api/schedule.php', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ action: 'delete_entry', id })
    });
    const data = await res.json();
    if (data.success) { toast(data.message); loadSchedule(); }
  }

  /* ── 9. Student Accounts Management ── */
  async function loadUsers() {
    try {
      const res  = await fetch('../api/users.php');
      const data = await res.json();
      if (!data.success) return;
      cachedUsers = data.users || [];
      renderUsersTable(cachedUsers);
    } catch {}
  }

  function renderUsersTable(users) {
    const tbody = document.getElementById('admUsersBody');
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:26px;color:var(--text-muted);">لا يوجد مستخدمون</td></tr>`;
      return;
    }
    tbody.innerHTML = users.map((u, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${escapeHtml(u.first_name)} ${escapeHtml(u.last_name)}</strong></td>
        <td style="direction:ltr;text-align:start">${escapeHtml(u.email || '—')}</td>
        <td style="direction:ltr;text-align:start">${escapeHtml(u.phone || '—')}</td>
        <td>
          ${Number(u.is_active) === 1
            ? '<span class="badge badge-user">✅ نشط</span>'
            : '<span class="badge badge-off">🚫 معطّل</span>'}
        </td>
        <td>
          <span class="badge badge-${u.role}">${u.role === 'admin' ? '🛡️ Admin' : '👤 طالب'}</span>
        </td>
        <td>${new Date(u.created_at).toLocaleDateString('ar-BH')}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="f-btn" onclick="AdminApp.openEditUser(${u.id})">✏️ تعديل كامل</button>
            <button class="f-btn" onclick="AdminApp.quickToggleActive(${u.id})">
              ${Number(u.is_active) === 1 ? '🚫 تعطيل' : '✅ تفعيل'}
            </button>
            <button class="f-btn" style="color:#f87171;" onclick="AdminApp.deleteUser(${u.id}, '${escapeHtml(u.first_name)}')">🗑️ حذف</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function filterUsers() {
    const q = (document.getElementById('userSearchInput')?.value || '').toLowerCase().trim();
    if (!q) {
      renderUsersTable(cachedUsers);
      return;
    }
    renderUsersTable(cachedUsers.filter(u =>
      `${u.first_name} ${u.last_name} ${u.email || ''} ${u.phone || ''}`.toLowerCase().includes(q)
    ));
  }

  function openEditUser(id) {
    const u = cachedUsers.find(x => Number(x.id) === Number(id));
    if (!u) return;
    document.getElementById('euId').value     = u.id;
    document.getElementById('euFirst').value  = u.first_name || '';
    document.getElementById('euLast').value   = u.last_name  || '';
    document.getElementById('euEmail').value  = u.email      || '';
    document.getElementById('euPhone').value  = u.phone      || '';
    document.getElementById('euPass').value   = '';
    document.getElementById('euActive').value = Number(u.is_active) === 1 ? '1' : '0';
    document.getElementById('euRole').value   = u.role || 'user';
    document.getElementById('editUserModal').classList.add('open');
  }

  async function quickToggleActive(id) {
    const u = cachedUsers.find(x => Number(x.id) === Number(id));
    if (!u) return;
    const newActive = Number(u.is_active) === 1 ? 0 : 1;
    const res = await fetch('../api/users.php', {
      method : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        id         : u.id,
        first_name : u.first_name,
        last_name  : u.last_name,
        email      : u.email,
        phone      : u.phone,
        role       : u.role,
        is_active  : newActive
      })
    });
    const data = await res.json();
    if (data.success) { toast(data.message); loadUsers(); }
    else toast(data.message, true);
  }

  async function deleteUser(id, name) {
    if (!confirm(`هل أنت متأكد من حذف حساب "${name}"؟`)) return;
    const res = await fetch('../api/users.php', {
      method : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) { toast(data.message); loadUsers(); }
    else toast(data.message, true);
  }

  /* ══════════════════════════════════════════════════════════════════
     10. BACKUP & RESTORE SYSTEM
  ══════════════════════════════════════════════════════════════════ */
  async function loadBackups() {
    try {
      const res  = await fetch('../api/backup.php?mode=list');
      const data = await res.json();
      if (!data.success) return;
      const box = document.getElementById('backupsListBox');
      if (!data.backups.length) {
        box.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);">لا توجد نسخ احتياطية محفوظة على الخادم بعد.</div>`;
        return;
      }
      box.innerHTML = data.backups.map(b => `
        <div class="file-card" style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <div>
              <div class="file-title" style="direction:ltr">${escapeHtml(b.name)}</div>
              <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px;">🕒 ${escapeHtml(b.created_at)} • ${formatSize(b.size)}</div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="f-btn primary" onclick="AdminApp.restoreServerSnapshot('${escapeHtml(b.name)}')">♻️ استرجاع</button>
              <button class="f-btn" style="color:#f87171;" onclick="AdminApp.deleteServerSnapshot('${escapeHtml(b.name)}')">🗑️ حذف</button>
            </div>
          </div>
        </div>
      `).join('');
    } catch {}
  }

  async function createServerSnapshot() {
    const res = await fetch('../api/backup.php', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ action: 'create_snapshot' })
    });
    const data = await res.json();
    if (data.success) { toast(data.message); loadBackups(); }
    else toast(data.message || 'خطأ', true);
  }

  async function restoreServerSnapshot(name) {
    if (!confirm(`هل أنت متأكد من استرجاع النسخة الاحتياطية "${name}"؟`)) return;
    const res = await fetch('../api/backup.php', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ action: 'restore', snapshot_name: name })
    });
    const data = await res.json();
    if (data.success) { toast(data.message); loadStats(); }
    else toast(data.message || 'خطأ', true);
  }

  async function deleteServerSnapshot(name) {
    if (!confirm(`حذف النسخة الاحتياطية "${name}"؟`)) return;
    const res = await fetch('../api/backup.php', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ action: 'delete_snapshot', name })
    });
    const data = await res.json();
    if (data.success) { toast(data.message); loadBackups(); }
    else toast(data.message || 'خطأ', true);
  }

  /* ── Form Bindings ── */
  function bindForms() {
    /* SPARK Random / Bulk Codes Form */
    document.getElementById('generateSparkCodesForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const prefix = document.getElementById('scPrefix').value.trim();
      const count  = Number(document.getElementById('scCount').value || 1);
      const res = await fetch('../api/spark.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ action: 'generate', prefix, count })
      });
      const data = await res.json();
      if (data.success) {
        toast(data.message);
        document.getElementById('newlyGeneratedBox').style.display = 'block';
        document.getElementById('newlyGeneratedText').value = (data.codes || []).join('\n');
        loadSparkCodes();
      } else toast(data.message || 'خطأ', true);
    });

    /* SPARK Custom Code Form */
    document.getElementById('customSparkCodeForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const custom_code = document.getElementById('scCustomInp').value.trim();
      if (!custom_code) return;
      const res = await fetch('../api/spark.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ action: 'generate', custom_code })
      });
      const data = await res.json();
      if (data.success) {
        toast(data.message);
        document.getElementById('scCustomInp').value = '';
        document.getElementById('newlyGeneratedBox').style.display = 'block';
        document.getElementById('newlyGeneratedText').value = (data.codes || []).join('\n');
        loadSparkCodes();
      } else toast(data.message || 'خطأ', true);
    });

    /* Post Form */
    document.getElementById('adminPostForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const fd   = new FormData(form);
      if (!document.getElementById('postPinChk').checked) fd.delete('is_pinned');
      if (!document.getElementById('postNotifyChk').checked) fd.delete('notify_all');

      try {
        const res  = await fetch('../api/posts.php', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) {
          toast(data.message);
          resetPostForm();
          loadPosts();
        } else {
          toast(data.message || 'خطأ في الحفظ', true);
        }
      } catch {
        toast('خطأ في الاتصال بالخادم', true);
      }
    });

    /* Broadcast @All Notification Form */
    document.getElementById('broadcastForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const payload = {
        action   : 'broadcast',
        title    : document.getElementById('bcTitle').value.trim(),
        message  : document.getElementById('bcMessage').value.trim(),
        link_url : document.getElementById('bcLink').value.trim(),
      };
      const res  = await fetch('../api/notifications.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        toast(data.message);
        e.target.reset();
        loadNotifications();
      } else {
        toast(data.message || 'خطأ', true);
      }
    });

    /* Create Folder Form */
    document.getElementById('createFolderForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const name = document.getElementById('newFolderName').value.trim();
      if (!name) return;
      const res = await fetch('../api/files.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          action    : 'create_folder',
          section   : currentSection,
          subject   : currentSubject,
          parent_id : currentFolder,
          name
        })
      });
      const data = await res.json();
      if (data.success) {
        toast(data.message);
        document.getElementById('newFolderName').value = '';
        loadFmData();
      } else {
        toast(data.message || 'خطأ', true);
      }
    });

    /* Upload Files Form with Progress Bar */
    document.getElementById('uploadFilesForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const form = e.target;
      const fd   = new FormData(form);
      fd.append('action', 'upload_files');
      fd.append('section', currentSection);
      fd.append('subject', currentSubject);
      if (currentFolder) fd.append('folder_id', currentFolder);

      const progWrap = document.getElementById('admUploadProgWrap');
      const progFill = document.getElementById('admUploadProgFill');
      const progText = document.getElementById('admUploadProgText');
      const btn      = document.getElementById('admUploadBtn');

      progWrap.classList.add('show');
      progFill.style.width = '0%';
      progText.textContent = 'جاري الرفع... 0%';
      btn.disabled = true;

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '../api/files.php', true);

      xhr.upload.onprogress = ev => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          progFill.style.width = pct + '%';
          progText.textContent = `جاري الرفع... ${pct}%`;
        }
      };

      xhr.onload = () => {
        btn.disabled = false;
        progWrap.classList.remove('show');
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.success) {
            toast(data.message);
            form.reset();
            loadFmData();
          } else {
            toast(data.message || 'فشل الرفع', true);
          }
        } catch {
          toast('حدث خطأ أثناء معالجة الملفات', true);
        }
      };

      xhr.onerror = () => {
        btn.disabled = false;
        progWrap.classList.remove('show');
        toast('تعذّر الاتصال بالخادم', true);
      };

      xhr.send(fd);
    });

    /* Add Link Form */
    document.getElementById('addLinkForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const res = await fetch('../api/files.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          action       : 'add_link',
          section      : currentSection,
          subject      : currentSubject,
          folder_id    : currentFolder,
          title        : document.getElementById('linkTitleInp').value.trim(),
          external_url : document.getElementById('linkUrlInp').value.trim(),
          description  : document.getElementById('linkDescInp').value.trim(),
        })
      });
      const data = await res.json();
      if (data.success) {
        toast(data.message);
        e.target.reset();
        loadFmData();
      } else {
        toast(data.message || 'خطأ', true);
      }
    });

    /* Edit / Move File Form */
    document.getElementById('editFileForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const folderVal = document.getElementById('efFolderSelect').value;
      const res = await fetch('../api/files.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          action       : 'update_file',
          id           : document.getElementById('efId').value,
          title        : document.getElementById('efTitle').value.trim(),
          description  : document.getElementById('efDesc').value.trim(),
          external_url : document.getElementById('efUrl').value.trim(),
          folder_id    : folderVal === '' ? null : Number(folderVal),
          sort_order   : Number(document.getElementById('efSortOrder').value || 0),
        })
      });
      const data = await res.json();
      if (data.success) {
        toast(data.message);
        document.getElementById('editFileModal').classList.remove('open');
        loadFmData();
      } else {
        toast(data.message || 'خطأ', true);
      }
    });

    /* Schedule Entry Form */
    document.getElementById('scheduleEntryForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const res = await fetch('../api/schedule.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          action     : 'save_entry',
          day_name   : document.getElementById('schedDay').value,
          start_time : document.getElementById('schedStart').value.trim(),
          end_time   : document.getElementById('schedEnd').value.trim(),
          subject    : document.getElementById('schedSubj').value.trim(),
          room       : document.getElementById('schedRoom').value.trim(),
          instructor : document.getElementById('schedInst').value.trim(),
          notes      : document.getElementById('schedNotes').value.trim(),
        })
      });
      const data = await res.json();
      if (data.success) {
        toast(data.message);
        e.target.reset();
        loadSchedule();
      } else {
        toast(data.message || 'خطأ', true);
      }
    });

    /* Schedule Image/PDF Upload Form */
    document.getElementById('scheduleFileUploadForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      fd.append('action', 'upload_files');
      fd.append('section', 'schedule');
      const res  = await fetch('../api/files.php', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        toast(data.message);
        e.target.reset();
        loadSchedule();
      } else {
        toast(data.message || 'خطأ', true);
      }
    });

    /* Edit User Form */
    document.getElementById('editUserForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const res = await fetch('../api/users.php', {
        method : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          id         : document.getElementById('euId').value,
          first_name : document.getElementById('euFirst').value.trim(),
          last_name  : document.getElementById('euLast').value.trim(),
          email      : document.getElementById('euEmail').value.trim(),
          phone      : document.getElementById('euPhone').value.trim(),
          password   : document.getElementById('euPass').value,
          is_active  : Number(document.getElementById('euActive').value),
          role       : document.getElementById('euRole').value,
        })
      });
      const data = await res.json();
      if (data.success) {
        toast(data.message);
        document.getElementById('editUserModal').classList.remove('open');
        loadUsers();
      } else {
        toast(data.message || 'خطأ', true);
      }
    });

    /* Restore Backup Upload Form */
    document.getElementById('restoreUploadForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      if (!confirm('هل أنت متأكد من استرجاع البيانات من هذا الملف؟')) return;
      const fd = new FormData(e.target);
      fd.append('action', 'restore');
      const res  = await fetch('../api/backup.php', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        toast(data.message);
        e.target.reset();
        loadStats();
      } else toast(data.message || 'خطأ', true);
    });
  }

  async function logout() {
    try {
      const fd = new FormData();
      fd.append('action', 'logout');
      await fetch('../api/session.php', { method: 'POST', body: fd });
    } catch {}
    sessionStorage.removeItem('auth');
    location.href = 'index.html';
  }

  /* ── Init ── */
  async function init() {
    const ok = await verifyAdminSession();
    if (!ok) return;
    bindForms();
    if (location.hash === '#spark-codes') {
      switchTab('spark-codes');
    } else {
      loadStats();
    }
  }

  return {
    init,
    switchTab,
    selectSubject,
    openFolder,
    filterFm,
    renameFolder,
    deleteFolder,
    openEditFileModal,
    deleteFile,
    editPost,
    resetPostForm,
    togglePinPost,
    deletePost,
    deleteAttachment,
    deleteNotification,
    deleteScheduleEntry,
    filterUsers,
    openEditUser,
    quickToggleActive,
    deleteUser,
    filterSparkCodes,
    copyCode,
    copyGeneratedCodes,
    copyAllAvailableCodes,
    toggleSparkCodeStatus,
    deleteSparkCode,
    createServerSnapshot,
    restoreServerSnapshot,
    deleteServerSnapshot,
    logout
  };
})();

document.addEventListener('DOMContentLoaded', AdminApp.init);

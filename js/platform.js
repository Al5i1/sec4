/* ═══════════════════════════════════════════════════════════════════
   js/platform.js — SEC4 Student, Inline Admin & SPARK Security Engine
   ═══════════════════════════════════════════════════════════════════ */

const Platform = (() => {
  let currentUser     = null;
  let currentView     = 'home';
  let currentSection  = 'exams';
  let currentSubject  = 'ENG11';
  let currentFolder   = null;
  let sparkFolder     = null;
  let activeModalSec  = null;

  let cachedFolders   = [];
  let cachedFiles     = [];
  let sparkFolders    = [];
  let sparkFiles      = [];

  let wmObserver      = null;

  const sectionMeta = {
    projects   : { title: '🚀 قسم المشاريع الدراسية',          hasSubjects: true,  defaultSubj: 'ENG11' },
    exams      : { title: '📝 قسم الاختبارات ونماذج الأسئلة', hasSubjects: true,  defaultSubj: 'ENG11' },
    handouts   : { title: '📚 قسم الملازم والمواد الدراسية',  hasSubjects: true,  defaultSubj: 'ENG11' },
    blackboard : { title: '🎓 قسم روابط ومواد البلاكبورد',    hasSubjects: true,  defaultSubj: 'ENG11' },
    resources  : { title: '🗂️ قسم الملفات والموارد العامة',   hasSubjects: false, defaultSubj: ''      },
  };

  /* ── Helpers ── */
  function toast(msg, isErr = false) {
    let el = document.getElementById('pToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pToast';
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

  function formatSize(bytes) {
    const b = Number(bytes) || 0;
    if (b <= 0) return '';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  }

  function getFileIcon(ext, itemType) {
    if (itemType === 'link') return '🔗';
    const e = (ext || '').toLowerCase();
    if (e === 'pdf') return '📕';
    if (['doc','docx'].includes(e)) return '📘';
    if (['ppt','pptx'].includes(e)) return '📙';
    if (['xls','xlsx','csv'].includes(e)) return '📗';
    if (['zip','rar','7z'].includes(e)) return '🗜️';
    if (['jpg','jpeg','png','gif','webp','svg'].includes(e)) return '🖼️';
    if (['mp4','webm'].includes(e)) return '🎬';
    if (['txt','md'].includes(e)) return '📄';
    return '📎';
  }

  function canPreview(ext, mime) {
    const e = (ext || '').toLowerCase();
    const m = (mime || '').toLowerCase();
    return ['pdf','jpg','jpeg','png','gif','webp','svg','mp4','webm','txt'].includes(e)
        || m.includes('pdf') || m.startsWith('image/') || m.startsWith('video/');
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isAdmin() {
    return currentUser && currentUser.role === 'admin';
  }

  function closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
  }

  /* ── 1. Verify Server Session ── */
  async function checkSession() {
    try {
      const res = await fetch('../api/session.php');
      if (res.status === 401 || res.status === 403) {
        sessionStorage.removeItem('auth');
        location.href = 'index.html';
        return false;
      }
      const data = await res.json();
      if (!data.success || !data.user) {
        location.href = 'index.html';
        return false;
      }
      currentUser = data.user;
      sessionStorage.setItem('auth', JSON.stringify(currentUser));
      renderUserHeader();
      return true;
    } catch {
      location.href = 'index.html';
      return false;
    }
  }

  function renderUserHeader() {
    if (!currentUser) return;
    document.getElementById('headerUserName').textContent = currentUser.name;
    document.getElementById('welcomeHeading').textContent = `👋 أهلاً بك يا ${currentUser.first_name} في منصة SEC4`;

    const avEl   = document.getElementById('headerAvatar');
    const profAv = document.getElementById('profileAvatarPreview');
    if (currentUser.avatar) {
      avEl.innerHTML   = `<img src="../${escapeHtml(currentUser.avatar)}" alt="avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;"/>`;
      profAv.innerHTML = `<img src="../${escapeHtml(currentUser.avatar)}" alt="avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;"/>`;
    } else {
      const initial = (currentUser.first_name || 'S').charAt(0).toUpperCase();
      avEl.textContent   = initial;
      profAv.textContent = initial;
    }

    document.getElementById('profFirst').value = currentUser.first_name || '';
    document.getElementById('profLast').value  = currentUser.last_name  || '';
    document.getElementById('profEmail').value = currentUser.email      || '';
    document.getElementById('profPhone').value = currentUser.phone      || '';

    /* Toggle Admin-only UI elements strictly based on verified DB role */
    const adm = isAdmin();
    document.getElementById('adminSidebarLink').style.display = adm ? 'flex' : 'none';
    document.getElementById('inlineAdminBar')?.classList.toggle('show', adm);
    document.getElementById('sparkAdminBar')?.classList.toggle('show', adm);
    document.getElementById('scheduleAdminBar')?.classList.toggle('show', adm);
    document.querySelectorAll('.admin-only-el').forEach(el => {
      el.style.display = adm ? 'inline-flex' : 'none';
    });
  }

  /* ── 2. Load Home Page ── */
  async function loadHomeData() {
    fetch('../api/search.php?mode=stats')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.stats) {
          document.getElementById('homeStatPosts').textContent   = d.stats.total_posts;
          document.getElementById('homeStatFiles').textContent   = d.stats.total_files;
          document.getElementById('homeStatFolders').textContent = d.stats.total_folders;
        }
      }).catch(() => {});

    try {
      const res  = await fetch('../api/posts.php?section=general');
      const data = await res.json();
      if (data.success) {
        const pinned = data.posts.filter(p => Number(p.is_pinned) === 1);
        const normal = data.posts;

        const pinWrap = document.getElementById('pinnedSectionWrap');
        const pinList = document.getElementById('pinnedPostsList');
        if (pinned.length > 0) {
          pinWrap.style.display = 'block';
          pinList.innerHTML = pinned.map(p => renderPostCard(p, false)).join('');
        } else {
          pinWrap.style.display = 'none';
        }

        const latestList = document.getElementById('latestPostsList');
        if (normal.length > 0) {
          latestList.innerHTML = normal.map(p => renderPostCard(p, false)).join('');
        } else {
          latestList.innerHTML = `<div class="fm-box" style="text-align:center;color:var(--text-muted);">لا توجد منشورات أو إعلانات حالياً.</div>`;
        }
      }
    } catch {}

    try {
      const res  = await fetch('../api/files.php?mode=recent&limit=8');
      const data = await res.json();
      const grid = document.getElementById('recentFilesGrid');
      if (data.success && data.files.length > 0) {
        grid.innerHTML = data.files.map(f => renderFileCard(f, false)).join('');
      } else {
        grid.innerHTML = `<div class="fm-box" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">لا توجد ملفات مضافة بعد.</div>`;
      }
    } catch {}
  }

  function renderPostCard(p, isSpark = false) {
    const dt = new Date(p.created_at).toLocaleString('ar-BH', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const atts = (p.files || []).map(f => {
      const ext    = (f.original_name || '').split('.').pop();
      const isPrev = canPreview(ext, f.mime_type);
      const url    = f.stream_url || ('../' + f.file_path);
      const dlUrl  = f.download_url || (isSpark ? (url + '&download=1') : url);
      return `
        <div style="display:inline-flex;gap:6px;align-items:center;">
          ${isPrev ? `<button class="att-chip" onclick="Platform.openPreview('${escapeHtml(url)}', '${escapeHtml(f.original_name)}', '${escapeHtml(ext)}', ${isSpark})">👁️ معاينة: ${escapeHtml(f.original_name)}</button>` : ''}
          <a class="att-chip" href="${escapeHtml(dlUrl)}" download="${escapeHtml(f.original_name)}">
            📎 ${escapeHtml(f.original_name)} <span style="opacity:0.6;font-size:11px;">(${formatSize(f.file_size)})</span>
          </a>
        </div>
      `;
    }).join('');

    const adminBtns = isAdmin() ? `
      <div style="margin-top:12px;display:flex;gap:8px;">
        <button class="f-btn" style="color:#f87171;" onclick="Platform.deletePostInline(${p.id}, ${isSpark})">🗑️ حذف المنشور</button>
      </div>
    ` : '';

    return `
      <article class="post-card ${Number(p.is_pinned) === 1 ? 'pinned' : ''}" id="post-${p.id}">
        <div class="post-top">
          <div class="post-title">
            <span>${escapeHtml(p.title)}</span>
            ${Number(p.is_pinned) === 1 ? '<span class="pin-badge">📌 مثبت</span>' : ''}
            ${Number(p.notify_all) === 1 ? '<span class="sc-tag">@الكل</span>' : ''}
          </div>
          <div class="post-meta">🕒 ${dt}</div>
        </div>
        <div class="post-body">${escapeHtml(p.content)}</div>
        ${atts ? `<div class="post-attachments">${atts}</div>` : ''}
        ${adminBtns}
      </article>
    `;
  }

  async function deletePostInline(id, isSpark) {
    if (!confirm('هل تريد حذف هذا المنشور ومرفقاته؟')) return;
    const fd = new FormData();
    fd.append('action', 'delete');
    fd.append('id', id);
    const res  = await fetch('../api/posts.php', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
      toast(data.message);
      if (isSpark) loadSparkPosts();
      else loadHomeData();
    }
  }

  /* ── 3. Notifications System ── */
  async function loadNotifications() {
    try {
      const res  = await fetch('../api/notifications.php');
      const data = await res.json();
      if (!data.success) return;

      const badge = document.getElementById('notifBadge');
      if (data.unread_count > 0) {
        badge.textContent = data.unread_count;
        badge.classList.add('show');
      } else {
        badge.classList.remove('show');
      }

      const listEl = document.getElementById('notifList');
      if (!data.notifications.length) {
        listEl.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">لا توجد إشعارات حالياً</div>`;
        return;
      }

      listEl.innerHTML = data.notifications.map(n => {
        const dt = new Date(n.created_at).toLocaleString('ar-BH', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        return `
          <div class="notif-item ${Number(n.is_read) === 0 ? 'unread' : ''}"
               onclick="Platform.openNotification(${n.id}, ${n.post_id || 'null'}, '${escapeHtml(n.link_url || '')}')">
            <div class="n-title">${escapeHtml(n.title)}</div>
            <div class="n-msg">${escapeHtml(n.message)}</div>
            <div class="n-time">🕒 ${dt}</div>
          </div>
        `;
      }).join('');
    } catch {}
  }

  async function openNotification(notifId, postId, linkUrl) {
    try {
      await fetch('../api/notifications.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ action: 'mark_read', notification_id: notifId })
      });
      loadNotifications();
    } catch {}

    document.getElementById('notifPanel').classList.remove('open');

    if (linkUrl && linkUrl.includes('#spark')) {
      switchView('spark');
      return;
    }
    if (postId) {
      switchView('home');
      setTimeout(() => {
        const el = document.getElementById('post-' + postId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.outline = '2px solid #667eea';
          setTimeout(() => el.style.outline = '', 2500);
        }
      }, 200);
    } else if (linkUrl) {
      if (linkUrl.startsWith('http')) window.open(linkUrl, '_blank');
      else location.href = linkUrl;
    }
  }

  async function markAllNotificationsRead() {
    try {
      await fetch('../api/notifications.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ action: 'mark_read', notification_id: 0 })
      });
      loadNotifications();
      toast('تم تحديد جميع الإشعارات كمقروءة');
    } catch {}
  }

  /* ── 4. Switch Views & File Manager Sections ── */
  function toggleMobileSidebar(forceOpen = null) {
    const sb   = document.getElementById('pSidebar');
    const back = document.getElementById('sidebarBackdrop');
    if (!sb) return;
    const isOpen = forceOpen !== null ? forceOpen : !sb.classList.contains('open');
    sb.classList.toggle('open', isOpen);
    back?.classList.toggle('open', isOpen);
  }

  function switchView(viewName, subj = null, folderId = null) {
    currentView = viewName;
    document.querySelectorAll('.p-sidebar .nav-btn[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });
    document.querySelectorAll('.mob-nav-item[data-mob-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mobView === viewName);
    });
    toggleMobileSidebar(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelectorAll('.p-view').forEach(s => s.style.display = 'none');

    /* Activate / Deactivate SPARK Protection Mode */
    if (viewName === 'spark') {
      document.getElementById('view-spark').style.display = 'block';
      initSparkView();
      return;
    } else {
      deactivateSparkProtection();
    }

    if (['projects', 'exams', 'handouts', 'blackboard', 'resources'].includes(viewName)) {
      currentSection = viewName;
      const meta     = sectionMeta[viewName];
      document.getElementById('view-browser').style.display = 'block';
      document.getElementById('browserTitle').textContent   = meta.title;

      const subjBar = document.getElementById('subjectTabsBar');
      if (meta.hasSubjects) {
        subjBar.style.display = 'flex';
        currentSubject = subj || currentSubject || meta.defaultSubj;
        document.querySelectorAll('.subject-tab').forEach(t => {
          t.classList.toggle('active', t.dataset.subj === currentSubject);
        });
      } else {
        subjBar.style.display = 'none';
        currentSubject = '';
      }

      currentFolder = folderId;
      loadSectionContent();
      return;
    }

    const target = document.getElementById('view-' + viewName);
    if (target) target.style.display = 'block';

    if (viewName === 'home')      loadHomeData();
    if (viewName === 'schedule')  loadSchedule();
    if (viewName === 'favorites') loadFavorites();
  }

  function selectSubject(subj) {
    currentSubject = subj;
    currentFolder  = null;
    document.querySelectorAll('.subject-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.subj === subj);
    });
    loadSectionContent();
  }

  function openFolder(folderId, inSpark = false) {
    if (inSpark) {
      sparkFolder = folderId;
      loadSparkFiles();
    } else {
      currentFolder = folderId;
      loadSectionContent();
    }
  }

  async function loadSectionContent() {
    const sort = document.getElementById('fmSortSelect')?.value || 'date_desc';
    const url  = `../api/files.php?mode=browse&section=${encodeURIComponent(currentSection)}&subject=${encodeURIComponent(currentSubject)}&folder_id=${currentFolder ?? ''}&sort=${encodeURIComponent(sort)}`;

    try {
      const res  = await fetch(url);
      const data = await res.json();
      if (!data.success) return;

      cachedFolders = data.folders || [];
      cachedFiles   = data.files   || [];

      renderBreadcrumbs(data.breadcrumbs || [], 'fmBreadcrumbs', currentSubject ? `📂 ${currentSubject}` : '📂 المجلد الرئيسي', false);
      renderFolderAndFileGrids(cachedFolders, cachedFiles, 'fmFoldersWrap', 'fmFoldersGrid', 'fmFilesGrid', false);
    } catch {}
  }

  function renderBreadcrumbs(crumbs, targetId, rootLabel, inSpark) {
    const bc = document.getElementById(targetId);
    let html = `<span class="bc-item" onclick="Platform.openFolder(null, ${inSpark})">${escapeHtml(rootLabel)}</span>`;
    crumbs.forEach(c => {
      html += `<span class="bc-sep">/</span><span class="bc-item" onclick="Platform.openFolder(${c.id}, ${inSpark})">${escapeHtml(c.name)}</span>`;
    });
    bc.innerHTML = html;
  }

  function renderFolderAndFileGrids(folders, files, wrapId, fGridId, flGridId, inSpark) {
    const fWrap  = document.getElementById(wrapId);
    const fGrid  = document.getElementById(fGridId);
    const flGrid = document.getElementById(flGridId);
    const adm    = isAdmin();

    if (folders.length > 0) {
      fWrap.style.display = 'block';
      fGrid.innerHTML = folders.map(f => `
        <div class="folder-item" style="cursor:default;">
          <div class="folder-info" style="cursor:pointer;flex:1;" onclick="Platform.openFolder(${f.id}, ${inSpark})">
            <span class="f-ic">📁</span>
            <span class="f-name">${escapeHtml(f.name)}</span>
          </div>
          ${adm ? `
            <div style="display:flex;gap:4px;">
              <button class="f-btn" style="padding:3px 7px;" onclick="Platform.renameFolderInline(${f.id}, '${escapeHtml(f.name)}', ${inSpark})" title="إعادة تسمية المجلد">✏️</button>
              <button class="f-btn" style="padding:3px 7px;color:#f87171;" onclick="Platform.deleteFolderInline(${f.id}, '${escapeHtml(f.name)}', ${inSpark})" title="حذف المجلد">🗑️</button>
            </div>
          ` : `<span style="color:var(--text-faint);font-size:12px;cursor:pointer;" onclick="Platform.openFolder(${f.id}, ${inSpark})">⬅</span>`}
        </div>
      `).join('');
    } else {
      fWrap.style.display = 'none';
      fGrid.innerHTML = '';
    }

    if (files.length > 0) {
      flGrid.innerHTML = files.map(f => renderFileCard(f, inSpark)).join('');
    } else {
      flGrid.innerHTML = `<div style="grid-column:1/-1;padding:30px;text-align:center;color:var(--text-muted);">لا توجد ملفات أو روابط في هذا المجلد حالياً.</div>`;
    }
  }

  function filterCurrentView() {
    const q = (document.getElementById('fmLocalSearch')?.value || '').toLowerCase().trim();
    if (!q) {
      renderFolderAndFileGrids(cachedFolders, cachedFiles, 'fmFoldersWrap', 'fmFoldersGrid', 'fmFilesGrid', false);
      return;
    }
    renderFolderAndFileGrids(
      cachedFolders.filter(f => (f.name || '').toLowerCase().includes(q)),
      cachedFiles.filter(f => `${f.title} ${f.description || ''} ${f.original_name || ''}`.toLowerCase().includes(q)),
      'fmFoldersWrap', 'fmFoldersGrid', 'fmFilesGrid', false
    );
  }

  function renderFileCard(f, inSpark = false) {
    const ext       = (f.extension || '').toLowerCase();
    const icon      = getFileIcon(ext, f.item_type);
    const dt        = new Date(f.created_at).toLocaleDateString('ar-BH');
    const isLink    = f.item_type === 'link';
    const isImg     = ['png','jpg','jpeg','gif','webp','svg'].includes(ext);
    const isTxt     = ext === 'txt';
    const isPrev    = !isLink && canPreview(ext, f.mime_type);
    const favCls    = Number(f.is_favorite) === 1 ? 'fav-active' : '';
    const badge     = f.subject ? `<span class="sc-tag">${escapeHtml(f.subject)}</span>` : '';
    const adm       = isAdmin();
    const streamUrl = f.stream_url || ('../' + f.file_path);
    const dlUrl     = f.download_url || ('../' + f.file_path);

    /* Special visual rendering inside SPARK for text notes & exercise solution images */
    if (inSpark && isTxt) {
      return `
        <div class="spark-note-banner">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <h4>📌 ملاحظة هامة: ${escapeHtml(f.title)}</h4>
            ${adm ? `
              <div style="display:flex;gap:6px;">
                <button class="f-btn" onclick="Platform.openEditFileInline(${f.id}, true)">✏️</button>
                <button class="f-btn" style="color:#f87171;" onclick="Platform.deleteFileInline(${f.id}, true)">🗑️</button>
              </div>
            ` : ''}
          </div>
          ${f.description ? `<p>${escapeHtml(f.description)}</p>` : ''}
        </div>
      `;
    }

    if (inSpark && isImg) {
      return `
        <div class="spark-img-card">
          <div class="spark-img-head">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="sc-tag" style="background:rgba(245,158,11,0.2);color:#fbbf24;">⚡ صفحة ${escapeHtml(f.title)}</span>
              ${f.description ? `<span style="font-size:12.5px;color:var(--text-muted);">${escapeHtml(f.description)}</span>` : ''}
            </div>
            <div style="display:flex;gap:6px;">
              <button class="f-btn" onclick="Platform.openPreview('${escapeHtml(streamUrl)}', '${escapeHtml(f.title)}', '${escapeHtml(ext)}', true)">🔍 تكبير الشاشة</button>
              ${adm ? `
                <button class="f-btn" onclick="Platform.openEditFileInline(${f.id}, true)" title="تعديل / نقل">✏️</button>
                <button class="f-btn" style="color:#f87171;" onclick="Platform.deleteFileInline(${f.id}, true)" title="حذف">🗑️</button>
              ` : ''}
            </div>
          </div>
          <div class="spark-img-wrap">
            <img src="${escapeHtml(streamUrl)}" alt="${escapeHtml(f.title)}" loading="lazy"/>
          </div>
        </div>
      `;
    }

    return `
      <div class="file-card">
        <div>
          <div class="file-head">
            <div style="display:flex;gap:10px;align-items:flex-start;">
              <div class="file-type-ic">${icon}</div>
              <div>
                <div class="file-title">${escapeHtml(f.title)}</div>
                ${badge}
              </div>
            </div>
            <button class="f-btn ${favCls}" onclick="Platform.toggleFavorite(${f.id}, this)" title="إضافة للمفضلة">
              ${Number(f.is_favorite) === 1 ? '⭐' : '☆'}
            </button>
          </div>
          ${f.description ? `<div class="file-desc">${escapeHtml(f.description)}</div>` : ''}
        </div>

        <div>
          <div class="file-meta">
            <span>📅 ${dt}</span>
            <span>${isLink ? 'رابط خارجي' : formatSize(f.file_size)}</span>
          </div>
          <div class="file-actions" style="margin-top:10px;">
            ${isLink ? `
              <a class="f-btn primary" href="${escapeHtml(f.external_url)}" target="_blank" rel="noopener">
                🔗 فتح الرابط
              </a>
            ` : `
              ${isPrev ? `
                <button class="f-btn" onclick="Platform.openPreview('${escapeHtml(streamUrl)}', '${escapeHtml(f.title)}', '${escapeHtml(f.extension)}', ${inSpark || f.section === 'spark'})">
                  👁️ معاينة
                </button>
              ` : ''}
              <a class="f-btn primary" href="${escapeHtml(dlUrl)}"
                 download="${escapeHtml(f.original_name || f.title)}"
                 onclick="Platform.trackDownload(${f.id})">
                ⬇️ تحميل
              </a>
            `}
            ${adm ? `
              <button class="f-btn" onclick="Platform.openEditFileInline(${f.id}, ${inSpark})" title="تعديل / نقل">✏️</button>
              <button class="f-btn" style="color:#f87171;" onclick="Platform.deleteFileInline(${f.id}, ${inSpark})" title="حذف">🗑️</button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  /* ══════════════════════════════════════════════════════════════════
     5. INLINE ADMIN OPERATIONS (Direct Upload, Folder, Edit, Delete)
  ══════════════════════════════════════════════════════════════════ */
  async function openUploadModal(overrideSection = null) {
    if (!isAdmin()) return;
    activeModalSec = overrideSection || currentSection;
    const subj     = (activeModalSec === 'spark' || activeModalSec === 'schedule' || activeModalSec === 'resources') ? '' : currentSubject;
    const activeFl = (activeModalSec === 'spark') ? sparkFolder : currentFolder;

    document.getElementById('inlineUploadForm').reset();
    document.getElementById('iuProgressWrap').classList.remove('show');
    document.getElementById('iuSubmitBtn').disabled = false;

    const sel = document.getElementById('iuFolderSelect');
    sel.innerHTML = `<option value="">📂 المجلد الرئيسي للقسم ${subj ? '(' + escapeHtml(subj) + ')' : ''}</option>`;

    if (activeModalSec !== 'schedule') {
      try {
        const res  = await fetch(`../api/files.php?mode=all_folders&section=${encodeURIComponent(activeModalSec)}&subject=${encodeURIComponent(subj)}`);
        const data = await res.json();
        if (data.success) {
          data.folders.forEach(fl => {
            const selected = (activeFl && Number(activeFl) === Number(fl.id)) ? 'selected' : '';
            sel.innerHTML += `<option value="${fl.id}" ${selected}>📁 ${escapeHtml(fl.name)}</option>`;
          });
        }
      } catch {}
    }

    document.getElementById('inlineUploadModal').classList.add('open');
  }

  function openCreateFolderModal(overrideSection = null) {
    if (!isAdmin()) return;
    activeModalSec = overrideSection || currentSection;
    document.getElementById('inlineFolderForm').reset();
    document.getElementById('inlineFolderModal').classList.add('open');
  }

  function openAddLinkModal(overrideSection = null) {
    if (!isAdmin()) return;
    activeModalSec = overrideSection || currentSection;
    document.getElementById('inlineLinkForm').reset();
    document.getElementById('inlineLinkModal').classList.add('open');
  }

  function openSparkPostModal() {
    if (!isAdmin()) return;
    document.getElementById('sparkPostForm').reset();
    document.getElementById('sparkPostModal').classList.add('open');
  }

  async function renameFolderInline(id, oldName, inSpark = false) {
    if (!isAdmin()) return;
    const newName = prompt('أدخل الاسم الجديد للمجلد:', oldName);
    if (!newName || newName.trim() === '') return;
    try {
      const res = await fetch('../api/files.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ action: 'update_folder', id, name: newName.trim(), sort_order: 0 })
      });
      const data = await res.json();
      if (data.success) {
        toast(data.message);
        if (inSpark) loadSparkFiles();
        else loadSectionContent();
      } else toast(data.message || 'خطأ', true);
    } catch { toast('خطأ في الاتصال', true); }
  }

  async function deleteFolderInline(id, name, inSpark = false) {
    if (!isAdmin()) return;
    if (!confirm(`هل أنت متأكد من حذف المجلد "${name}" وجميع المجلدات الفرعية والملفات بداخله؟`)) return;
    try {
      const res = await fetch('../api/files.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ action: 'delete_folder', id })
      });
      const data = await res.json();
      if (data.success) {
        toast(data.message);
        if (inSpark) loadSparkFiles();
        else loadSectionContent();
      } else toast(data.message || 'خطأ', true);
    } catch { toast('خطأ في الاتصال', true); }
  }

  async function openEditFileInline(fileId, inSpark = false) {
    if (!isAdmin()) return;
    activeModalSec = inSpark ? 'spark' : currentSection;
    const list     = inSpark ? sparkFiles : cachedFiles;
    const f        = list.find(x => Number(x.id) === Number(fileId));
    if (!f) return;

    document.getElementById('iefId').value    = f.id;
    document.getElementById('iefTitle').value = f.title || '';
    document.getElementById('iefDesc').value  = f.description || '';
    document.getElementById('iefSort').value  = f.sort_order || 0;

    const urlGrp = document.getElementById('iefUrlGroup');
    if (f.item_type === 'link') {
      urlGrp.style.display = 'block';
      document.getElementById('iefUrl').value = f.external_url || '';
    } else {
      urlGrp.style.display = 'none';
      document.getElementById('iefUrl').value = '';
    }

    const subj = inSpark ? '' : (f.subject || currentSubject || '');
    const sel  = document.getElementById('iefFolderSelect');
    sel.innerHTML = `<option value="">📂 المجلد الرئيسي للقسم</option>`;
    try {
      const res  = await fetch(`../api/files.php?mode=all_folders&section=${encodeURIComponent(activeModalSec)}&subject=${encodeURIComponent(subj)}`);
      const data = await res.json();
      if (data.success) {
        data.folders.forEach(fl => {
          const selected = Number(f.folder_id) === Number(fl.id) ? 'selected' : '';
          sel.innerHTML += `<option value="${fl.id}" ${selected}>📁 ${escapeHtml(fl.name)}</option>`;
        });
      }
    } catch {}

    document.getElementById('inlineEditFileModal').classList.add('open');
  }

  async function deleteFileInline(fileId, inSpark = false) {
    if (!isAdmin()) return;
    if (!confirm('هل تريد حذف هذا الملف/الرابط نهائياً؟')) return;
    try {
      const res = await fetch('../api/files.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ action: 'delete_file', id: fileId })
      });
      const data = await res.json();
      if (data.success) {
        toast(data.message);
        if (inSpark) loadSparkFiles();
        else if (currentView === 'schedule') loadSchedule();
        else loadSectionContent();
      } else toast(data.message || 'خطأ', true);
    } catch { toast('خطأ في الاتصال', true); }
  }

  function bindInlineAdminForms() {
    /* 1. Upload File(s) with XHR Progress Bar */
    document.getElementById('inlineUploadForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const form   = e.target;
      const fd     = new FormData(form);
      const sec    = activeModalSec || currentSection;
      const subj   = (sec === 'spark' || sec === 'schedule' || sec === 'resources') ? '' : currentSubject;

      fd.append('action', 'upload_files');
      fd.append('section', sec);
      fd.append('subject', subj);

      const progWrap = document.getElementById('iuProgressWrap');
      const progFill = document.getElementById('iuProgressFill');
      const progText = document.getElementById('iuProgressText');
      const btn      = document.getElementById('iuSubmitBtn');

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
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.success) {
            toast(data.message);
            closeModal('inlineUploadModal');
            if (sec === 'spark') loadSparkFiles();
            else if (sec === 'schedule') loadSchedule();
            else loadSectionContent();
          } else {
            toast(data.message || 'فشل الرفع', true);
          }
        } catch {
          toast('حدث خطأ أثناء معالجة الملفات المرفوعة', true);
        }
      };

      xhr.onerror = () => {
        btn.disabled = false;
        toast('تعذّر الاتصال بالخادم أثناء الرفع', true);
      };

      xhr.send(fd);
    });

    /* 2. Create Folder Form */
    document.getElementById('inlineFolderForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const sec    = activeModalSec || currentSection;
      const subj   = (sec === 'spark' || sec === 'resources') ? '' : currentSubject;
      const parent = (sec === 'spark') ? sparkFolder : currentFolder;
      const name   = document.getElementById('ifName').value.trim();
      if (!name) return;

      const res = await fetch('../api/files.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          action    : 'create_folder',
          section   : sec,
          subject   : subj,
          parent_id : parent,
          name
        })
      });
      const data = await res.json();
      if (data.success) {
        toast(data.message);
        closeModal('inlineFolderModal');
        if (sec === 'spark') loadSparkFiles();
        else loadSectionContent();
      } else toast(data.message || 'خطأ', true);
    });

    /* 3. Add Link Form */
    document.getElementById('inlineLinkForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const sec    = activeModalSec || currentSection;
      const subj   = (sec === 'spark' || sec === 'resources') ? '' : currentSubject;
      const parent = (sec === 'spark') ? sparkFolder : currentFolder;

      const res = await fetch('../api/files.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          action       : 'add_link',
          section      : sec,
          subject      : subj,
          folder_id    : parent,
          title        : document.getElementById('ilTitle').value.trim(),
          external_url : document.getElementById('ilUrl').value.trim(),
          description  : document.getElementById('ilDesc').value.trim(),
        })
      });
      const data = await res.json();
      if (data.success) {
        toast(data.message);
        closeModal('inlineLinkModal');
        if (sec === 'spark') loadSparkFiles();
        else loadSectionContent();
      } else toast(data.message || 'خطأ', true);
    });

    /* 4. Edit / Move File Form */
    document.getElementById('inlineEditFileForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const flVal = document.getElementById('iefFolderSelect').value;
      const res = await fetch('../api/files.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          action       : 'update_file',
          id           : document.getElementById('iefId').value,
          title        : document.getElementById('iefTitle').value.trim(),
          description  : document.getElementById('iefDesc').value.trim(),
          external_url : document.getElementById('iefUrl').value.trim(),
          folder_id    : flVal === '' ? null : Number(flVal),
          sort_order   : Number(document.getElementById('iefSort').value || 0),
        })
      });
      const data = await res.json();
      if (data.success) {
        toast(data.message);
        closeModal('inlineEditFileModal');
        if (activeModalSec === 'spark') loadSparkFiles();
        else loadSectionContent();
      } else toast(data.message || 'خطأ', true);
    });

    /* 5. SPARK Post Form */
    document.getElementById('sparkPostForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd  = new FormData(e.target);
      const res = await fetch('../api/posts.php', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        toast(data.message);
        closeModal('sparkPostModal');
        loadSparkPosts();
      } else toast(data.message || 'خطأ', true);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     6. SPARK SUBSCRIPTION, CONTENT & ANTI-CAPTURE / WATERMARK ENGINE
  ══════════════════════════════════════════════════════════════════ */
  async function initSparkView() {
    try {
      const res  = await fetch('../api/spark.php?mode=status');
      const data = await res.json();
      if (!data.success) return;

      const gateEl    = document.getElementById('sparkGateContainer');
      const contentEl = document.getElementById('sparkContentContainer');

      if (!data.subscribed) {
        deactivateSparkProtection();
        gateEl.style.display    = 'block';
        contentEl.style.display = 'none';
      } else {
        gateEl.style.display    = 'none';
        contentEl.style.display = 'block';
        if (data.subscription && data.subscription.code) {
          document.getElementById('sparkSubBadgeInfo').textContent = `🔑 الكود المفعّل: ${data.subscription.code}`;
        } else if (isAdmin()) {
          document.getElementById('sparkSubBadgeInfo').textContent = `🛡️ صلاحية الإدارة الكاملة`;
        }
        activateSparkProtection(data.watermark || `${currentUser.name} • ID#${currentUser.id}`);
        loadSparkPosts();
        loadSparkFiles();
      }
    } catch {
      toast('تعذّر التحقق من حالة اشتراك SPARK', true);
    }
  }

  function bindSparkRedeemForm() {
    document.getElementById('sparkRedeemForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const inp = document.getElementById('sparkCodeInput');
      const btn = document.getElementById('sparkRedeemBtn');
      const msg = document.getElementById('sparkGateMsg');
      const code = inp.value.trim();
      if (!code) return;

      btn.disabled = true;
      msg.textContent = '⏳ جاري التحقق من الكود وتفعيل الاشتراك...';
      msg.style.color = 'var(--text-muted)';

      try {
        const res = await fetch('../api/spark.php', {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({ action: 'redeem', code })
        });
        const data = await res.json();
        btn.disabled = false;

        if (data.success && data.subscribed) {
          msg.style.color = '#4ade80';
          msg.textContent = data.message;
          toast(data.message);
          currentUser.spark_subscribed = true;
          inp.value = '';
          setTimeout(() => initSparkView(), 500);
        } else {
          msg.style.color = '#f87171';
          msg.textContent = data.message || 'كود غير صالح.';
          toast(data.message || 'كود غير صالح', true);
        }
      } catch {
        btn.disabled = false;
        msg.style.color = '#f87171';
        msg.textContent = 'تعذّر الاتصال بالخادم.';
      }
    });
  }

  async function loadSparkPosts() {
    try {
      const res  = await fetch('../api/posts.php?section=spark');
      const data = await res.json();
      const box  = document.getElementById('sparkPostsList');
      if (data.success && data.posts.length > 0) {
        box.innerHTML = data.posts.map(p => renderPostCard(p, true)).join('');
      } else {
        box.innerHTML = `<div class="fm-box" style="text-align:center;color:var(--text-muted);">لا توجد منشورات في SPARK حالياً.</div>`;
      }
    } catch {}
  }

  async function loadSparkFiles() {
    const sort = document.getElementById('sparkSortSelect')?.value || 'date_desc';
    const url  = `../api/files.php?mode=browse&section=spark&folder_id=${sparkFolder ?? ''}&sort=${encodeURIComponent(sort)}`;
    try {
      const res  = await fetch(url);
      const data = await res.json();
      if (!data.success) return;

      sparkFolders = data.folders || [];
      sparkFiles   = data.files   || [];

      renderBreadcrumbs(data.breadcrumbs || [], 'sparkBreadcrumbs', '⚡ SPARK الرئيسي', true);
      renderFolderAndFileGrids(sparkFolders, sparkFiles, 'sparkFoldersWrap', 'sparkFoldersGrid', 'sparkFilesGrid', true);
    } catch {}
  }

  function filterSparkView() {
    const q = (document.getElementById('sparkLocalSearch')?.value || '').toLowerCase().trim();
    if (!q) {
      renderFolderAndFileGrids(sparkFolders, sparkFiles, 'sparkFoldersWrap', 'sparkFoldersGrid', 'sparkFilesGrid', true);
      return;
    }
    renderFolderAndFileGrids(
      sparkFolders.filter(f => (f.name || '').toLowerCase().includes(q)),
      sparkFiles.filter(f => `${f.title} ${f.description || ''}`.toLowerCase().includes(q)),
      'sparkFoldersWrap', 'sparkFoldersGrid', 'sparkFilesGrid', true
    );
  }

  /* ── SPARK Watermark & Anti-Screenshot Protection ── */
  function buildWatermarkDom(text) {
    const layer = document.getElementById('sparkWatermarkLayer');
    const grid  = document.getElementById('sparkWatermarkGrid');
    if (!layer || !grid) return;

    layer.classList.add('active');
    let itemsHtml = '';
    for (let i = 0; i < 85; i++) {
      itemsHtml += `<span class="spark-wm-item">🔒 SPARK • ${escapeHtml(text)}</span>`;
    }
    grid.innerHTML = itemsHtml;
  }

  function activateSparkProtection(watermarkText) {
    document.body.classList.add('spark-active-mode');
    buildWatermarkDom(watermarkText);

    /* MutationObserver so watermark cannot be deleted via DevTools */
    if (wmObserver) wmObserver.disconnect();
    wmObserver = new MutationObserver(() => {
      if (currentView !== 'spark') return;
      const layer = document.getElementById('sparkWatermarkLayer');
      const grid  = document.getElementById('sparkWatermarkGrid');
      if (!layer || !layer.classList.contains('active') || !grid || grid.children.length < 30 || layer.style.display === 'none' || layer.style.opacity === '0') {
        if (layer) {
          layer.removeAttribute('style');
          buildWatermarkDom(watermarkText);
        }
      }
    });
    wmObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
  }

  function deactivateSparkProtection() {
    document.body.classList.remove('spark-active-mode');
    if (wmObserver) {
      wmObserver.disconnect();
      wmObserver = null;
    }
    document.getElementById('sparkWatermarkLayer')?.classList.remove('active');
    document.getElementById('sparkPrivacyShield')?.classList.remove('active');
  }

  function triggerSparkShield(reason) {
    if (currentView !== 'spark' && !document.getElementById('previewModal')?.classList.contains('spark-preview')) return;
    const shield = document.getElementById('sparkPrivacyShield');
    const rEl    = document.getElementById('sparkShieldReason');
    if (rEl && reason) rEl.textContent = reason;
    if (shield) shield.classList.add('active');
  }

  function resumeSparkView() {
    document.getElementById('sparkPrivacyShield')?.classList.remove('active');
  }

  function initSparkAntiCaptureListeners() {
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    /* 1. Hide content immediately when tab is hidden or app is switched */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        triggerSparkShield('تم إخفاء محتوى SPARK لأنك انتقلت إلى تبويب أو تطبيق آخر.');
      } else {
        resumeSparkView();
      }
    });

    /* On desktop, blur also guards against Snipping Tool focus loss */
    if (!isTouchDevice) {
      window.addEventListener('blur', () => {
        triggerSparkShield('تم إخفاء محتوى SPARK مؤقتاً عند خروج المؤشر من النافذة لمنع أدوات قص الشاشة.');
      });
      window.addEventListener('focus', () => {
        resumeSparkView();
      });
    }

    /* 2. Disable right-click context menu inside SPARK */
    document.addEventListener('contextmenu', e => {
      if (currentView === 'spark' || document.getElementById('previewModal')?.classList.contains('spark-preview')) {
        e.preventDefault();
      }
    });

    /* 3. Intercept Screenshot & Print/Save shortcuts */
    window.addEventListener('keyup', e => {
      if (currentView !== 'spark' && !document.getElementById('previewModal')?.classList.contains('spark-preview')) return;
      if (e.key === 'PrintScreen' || e.keyCode === 44) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('Protected SPARK Content - ' + (currentUser?.name || '')).catch(() => {});
        }
        triggerSparkShield('🚫 تنبيه أمني: تم اكتشاف محاولة تصوير الشاشة (PrintScreen). المحتوى محمي بعلامة مائية باسم حسابك.');
        toast('🚫 تصوير الشاشة غير مسموح في قسم SPARK!', true);
      }
    });

    window.addEventListener('keydown', e => {
      if (currentView !== 'spark' && !document.getElementById('previewModal')?.classList.contains('spark-preview')) return;
      const isPrint = (e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 's');
      const isSnip  = e.metaKey && e.shiftKey && ['s', '3', '4', '5'].includes(e.key.toLowerCase());
      if (isPrint || isSnip || e.key === 'PrintScreen') {
        e.preventDefault();
        triggerSparkShield('🚫 تنبيه أمني: تم رصد اختصار تصوير أو حفظ الشاشة.');
      }
    });

    /* 4. Screen Recording / Display Capture Detection Guard */
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      const origDisplay = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getDisplayMedia = async function (...args) {
        triggerSparkShield('🚫 تم اكتشاف محاولة تسجيل الشاشة! لا يُسمح بتسجيل محتوى SPARK.');
        toast('🚫 تسجيل الشاشة ممنوع داخل قسم SPARK!', true);
        throw new Error('Screen recording blocked on SPARK');
      };
    }
  }

  /* ── 7. Schedule Section ── */
  async function loadSchedule() {
    try {
      const res  = await fetch('../api/schedule.php');
      const data = await res.json();
      if (!data.success) return;

      const tbody = document.getElementById('scheduleTableBody');
      if (data.entries.length > 0) {
        tbody.innerHTML = data.entries.map(e => `
          <tr>
            <td><strong>${escapeHtml(e.day_name)}</strong></td>
            <td style="direction:ltr">${escapeHtml(e.start_time)} - ${escapeHtml(e.end_time)}</td>
            <td><span class="sc-tag">${escapeHtml(e.subject)}</span></td>
            <td>${escapeHtml(e.room || '—')}</td>
            <td>${escapeHtml(e.instructor || '—')}</td>
            <td>${escapeHtml(e.notes || '—')}</td>
          </tr>
        `).join('');
      } else {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:26px;color:var(--text-muted);">لم يتم إدراج حصص في الجدول التفاعلي بعد.</td></tr>`;
      }

      const fGrid = document.getElementById('scheduleFilesGrid');
      if (data.files.length > 0) {
        fGrid.innerHTML = data.files.map(f => renderFileCard(f, false)).join('');
      } else {
        fGrid.innerHTML = `<div class="fm-box" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">لا توجد صور أو ملفات PDF مرفوعة للجدول حالياً.</div>`;
      }
    } catch {}
  }

  /* ── 8. Favorites ── */
  async function loadFavorites() {
    try {
      const res  = await fetch('../api/files.php?mode=favorites');
      const data = await res.json();
      const grid = document.getElementById('favoritesGrid');
      if (data.success && data.files.length > 0) {
        grid.innerHTML = data.files.map(f => renderFileCard(f, f.section === 'spark')).join('');
      } else {
        grid.innerHTML = `<div class="fm-box" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">قائمة المفضلة فارغة. اضغط على النجمة ☆ بجانب أي ملف لحفظه هنا!</div>`;
      }
    } catch {}
  }

  async function toggleFavorite(fileId, btnEl) {
    try {
      const res  = await fetch('../api/files.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ action: 'toggle_favorite', file_id: fileId })
      });
      const data = await res.json();
      if (data.success) {
        if (btnEl) {
          btnEl.classList.toggle('fav-active', data.is_favorite === 1);
          btnEl.textContent = data.is_favorite === 1 ? '⭐' : '☆';
        }
        toast(data.message);
        if (currentView === 'favorites') loadFavorites();
      }
    } catch {}
  }

  function trackDownload(fileId) {
    fetch('../api/files.php', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ action: 'track_download', file_id: fileId })
    }).catch(() => {});
  }

  /* ── 9. Preview Modal (PDF, Images, Video — with Watermark in SPARK) ── */
  function openPreview(url, title, ext, isSparkProtected = false) {
    const modal = document.getElementById('previewModal');
    const body  = document.getElementById('previewBody');
    const dlBtn = document.getElementById('previewDownloadBtn');

    document.getElementById('previewTitle').textContent = title;
    modal.classList.toggle('spark-preview', !!isSparkProtected);

    if (isSparkProtected && !isAdmin()) {
      dlBtn.style.display = 'none';
    } else {
      dlBtn.style.display = 'inline-flex';
      dlBtn.href = url;
    }

    const e = (ext || '').toLowerCase();
    let contentHtml = '';
    if (e === 'pdf') {
      const pdfSrc = isSparkProtected ? `${escapeHtml(url)}#toolbar=0&navpanes=0` : escapeHtml(url);
      contentHtml = `<iframe src="${pdfSrc}"></iframe>`;
    } else if (['mp4','webm'].includes(e)) {
      contentHtml = `<video src="${escapeHtml(url)}" controls controlsList="nodownload" style="max-width:100%;max-height:100%;"></video>`;
    } else {
      contentHtml = `<img src="${escapeHtml(url)}" alt="${escapeHtml(title)}"/>`;
    }

    body.innerHTML = contentHtml;
    modal.classList.add('open');
  }

  function closePreview() {
    const modal = document.getElementById('previewModal');
    modal.classList.remove('open', 'spark-preview');
    document.getElementById('previewBody').innerHTML = '';
  }

  /* ── 10. Global Search ── */
  let searchTimer = null;
  function initGlobalSearch() {
    const inp  = document.getElementById('globalSearchInput');
    const drop = document.getElementById('searchDropdown');
    if (!inp || !drop) return;

    inp.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const q = inp.value.trim();
      if (!q) {
        drop.classList.remove('open');
        return;
      }
      searchTimer = setTimeout(async () => {
        try {
          const res  = await fetch('../api/search.php?q=' + encodeURIComponent(q));
          const data = await res.json();
          if (!data.success) return;

          let html = '';
          if (data.posts.length) {
            html += `<div class="search-group-title">📢 الإعلانات والمنشورات</div>`;
            html += data.posts.map(p => `
              <div class="search-item" onclick="Platform.goToPost(${p.id}, '${escapeHtml(p.section || 'general')}')">
                <span>${escapeHtml(p.title)}</span>
                <span class="meta">${p.section === 'spark' ? '⚡ SPARK' : 'منشور'}</span>
              </div>
            `).join('');
          }
          if (data.folders.length) {
            html += `<div class="search-group-title">📁 المجلدات</div>`;
            html += data.folders.map(f => `
              <div class="search-item" onclick="Platform.goToFolder('${escapeHtml(f.section)}', '${escapeHtml(f.subject || '')}', ${f.id})">
                <span>📁 ${escapeHtml(f.name)}</span>
                <span class="meta">${escapeHtml(f.section)} ${escapeHtml(f.subject || '')}</span>
              </div>
            `).join('');
          }
          if (data.files.length) {
            html += `<div class="search-group-title">📄 الملفات والمشاريع والاختبارات والروابط</div>`;
            html += data.files.map(f => `
              <div class="search-item" onclick="Platform.goToFolder('${escapeHtml(f.section)}', '${escapeHtml(f.subject || '')}', ${f.folder_id || 'null'})">
                <span>${getFileIcon(f.extension, f.item_type)} ${escapeHtml(f.title)}</span>
                <span class="meta">${escapeHtml(f.section)} ${escapeHtml(f.subject || '')}</span>
              </div>
            `).join('');
          }

          if (!html) {
            html = `<div style="padding:18px;text-align:center;color:var(--text-muted);font-size:13px;">لا توجد نتائج مطابقة لـ "${escapeHtml(q)}"</div>`;
          }
          drop.innerHTML = html;
          drop.classList.add('open');
        } catch {}
      }, 220);
    });

    document.addEventListener('click', e => {
      const wrap = document.getElementById('globalSearchWrap');
      if (wrap && !wrap.contains(e.target)) drop.classList.remove('open');
    });
  }

  function goToPost(postId, section = 'general') {
    document.getElementById('searchDropdown').classList.remove('open');
    if (section === 'spark') {
      switchView('spark');
      return;
    }
    switchView('home');
    setTimeout(() => {
      const el = document.getElementById('post-' + postId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  }

  function goToFolder(section, subject, folderId) {
    document.getElementById('searchDropdown').classList.remove('open');
    if (section === 'schedule') {
      switchView('schedule');
    } else if (section === 'spark') {
      sparkFolder = folderId;
      switchView('spark');
    } else {
      switchView(section, subject || null, folderId);
    }
  }

  /* ── 11. Profile Form & Logout ── */
  function initProfileForm() {
    const form = document.getElementById('profileForm');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        const res  = await fetch('../api/session.php', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) {
          currentUser = data.user;
          sessionStorage.setItem('auth', JSON.stringify(currentUser));
          renderUserHeader();
          toast('✅ ' + data.message);
          form.querySelector('input[name="new_password"]').value = '';
        } else {
          toast(data.message || 'خطأ في التحديث', true);
        }
      } catch {
        toast('تعذّر الاتصال بالخادم', true);
      }
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
    const ok = await checkSession();
    if (!ok) return;

    loadHomeData();
    loadNotifications();
    initGlobalSearch();
    initProfileForm();
    bindInlineAdminForms();
    bindSparkRedeemForm();
    initSparkAntiCaptureListeners();

    const bellBtn = document.getElementById('notifBellBtn');
    const panel   = document.getElementById('notifPanel');
    if (bellBtn && panel) {
      bellBtn.addEventListener('click', e => {
        e.stopPropagation();
        panel.classList.toggle('open');
      });
      document.addEventListener('click', e => {
        const wrap = document.getElementById('notifWrap');
        if (wrap && !wrap.contains(e.target)) panel.classList.remove('open');
      });
    }

    if (location.hash === '#spark') {
      switchView('spark');
    } else if (location.hash && location.hash.startsWith('#post-')) {
      setTimeout(() => {
        const el = document.querySelector(location.hash);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 450);
    }
  }

  return {
    init,
    toggleMobileSidebar,
    switchView,
    selectSubject,
    openFolder,
    loadSectionContent,
    filterCurrentView,
    toggleFavorite,
    trackDownload,
    openPreview,
    closePreview,
    openNotification,
    markAllNotificationsRead,
    goToPost,
    goToFolder,
    openUploadModal,
    openCreateFolderModal,
    openAddLinkModal,
    openSparkPostModal,
    closeModal,
    renameFolderInline,
    deleteFolderInline,
    openEditFileInline,
    deleteFileInline,
    deletePostInline,
    loadSparkFiles,
    filterSparkView,
    resumeSparkView,
    logout
  };
})();

document.addEventListener('DOMContentLoaded', Platform.init);

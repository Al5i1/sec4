/* ─── app.js — Theme & Language Logic ─── */

const App = (() => {

  /* ── State ── */
  let currentLang  = localStorage.getItem('lang')  || 'ar';
  let currentTheme = localStorage.getItem('theme') || 'dark';

  /* ── Apply theme ── */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.body?.setAttribute('data-theme', theme);
    currentTheme = theme;
    localStorage.setItem('theme', theme);

    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    btn.title       = theme === 'dark' ? 'الوضع الفاتح / Light mode' : 'الوضع الداكن / Dark mode';
  }

  function toggleTheme() {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }

  /* ── Apply language ── */
  function applyLang(lang) {
    if (typeof T === 'undefined' || !T[lang]) return;
    const dict = T[lang];

    currentLang = lang;
    localStorage.setItem('lang', lang);

    /* Direction */
    document.documentElement.setAttribute('dir', dict.dir);
    document.documentElement.setAttribute('lang', lang);

    /* Text nodes */
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (dict[key] !== undefined) el.textContent = dict[key];
    });

    /* Placeholders */
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const key = el.getAttribute('data-i18n-ph');
      if (dict[key] !== undefined) el.placeholder = dict[key];
    });

    /* Update active pill in selector */
    document.querySelectorAll('.lang-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.lang === lang);
    });

    /* Update button label */
    const label = document.getElementById('langLabel');
    if (label) label.textContent = lang === 'ar' ? 'العربية' : 'English';
  }

  /* ── Toggle language panel ── */
  function togglePanel() {
    const panel = document.getElementById('langPanel');
    if (!panel) return;
    const open = panel.classList.toggle('open');
    const arrow = document.getElementById('langArrow');
    if (arrow) arrow.textContent = open ? '▴' : '▾';
  }

  /* ── Close panel on outside click ── */
  document.addEventListener('click', e => {
    const wrap = document.getElementById('langWrap');
    if (wrap && !wrap.contains(e.target)) {
      const panel = document.getElementById('langPanel');
      if (panel) {
        panel.classList.remove('open');
        const arrow = document.getElementById('langArrow');
        if (arrow) arrow.textContent = '▾';
      }
    }
  });

  /* ── Init ── */
  function init() {
    applyTheme(currentTheme);
    applyLang(currentLang);

    /* Theme button */
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
      themeBtn.onclick = toggleTheme;
    }

    /* Lang toggle button */
    const langBtn = document.getElementById('langToggleBtn');
    if (langBtn) {
      langBtn.onclick = e => { e.stopPropagation(); togglePanel(); };
    }

    /* Lang pills */
    document.querySelectorAll('.lang-pill').forEach(pill => {
      pill.onclick = () => {
        applyLang(pill.dataset.lang);
        togglePanel();
      };
    });
  }

  return { init, applyLang, applyTheme, toggleTheme };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', App.init);
} else {
  App.init();
}

/* ═══════════════════════════════════════
   js/auth.js  —  Login & Register API calls
   ═══════════════════════════════════════ */

/* ── Toast helper ── */
function showToast(msg, isErr = false) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    Object.assign(toast.style, {
      position: 'fixed', bottom: '24px', right: '24px',
      padding: '12px 20px', borderRadius: '12px',
      fontFamily: "'Cairo', sans-serif", fontSize: '14px', fontWeight: '700',
      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      transform: 'translateY(80px)', opacity: '0',
      transition: 'transform 0.3s, opacity 0.3s', zIndex: '999'
    });
    document.body.appendChild(toast);
  }
  toast.textContent  = msg;
  toast.style.background = isErr ? '#f87171' : '#4ade80';
  toast.style.color      = isErr ? '#fff'     : '#052e16';
  toast.style.transform  = 'translateY(0)';
  toast.style.opacity    = '1';
  setTimeout(() => { toast.style.transform = 'translateY(80px)'; toast.style.opacity = '0'; }, 3000);
}

/* ─────────────────────────────────────
   LOGIN FORM
───────────────────────────────────── */
const forgotBtn   = document.getElementById('forgotPasswordBtn');
const forgotModal = document.getElementById('forgotModal');
const closeForgot = document.getElementById('closeForgotBtn');
const verifyForm  = document.getElementById('forgotVerifyForm');
const resetForm   = document.getElementById('forgotResetForm');

if (forgotBtn && forgotModal) {
  forgotBtn.addEventListener('click', e => {
    e.preventDefault();
    verifyForm.style.display = 'block';
    resetForm.style.display  = 'none';
    verifyForm.reset();
    resetForm.reset();
    forgotModal.style.display = 'flex';
  });

  closeForgot?.addEventListener('click', () => {
    forgotModal.style.display = 'none';
  });

  verifyForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('fpEmail').value.trim();
    const phone = document.getElementById('fpPhone').value.trim();
    try {
      const res  = await fetch('../api/forgot_password.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ step: 'verify', email, phone })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        document.getElementById('fpVerifiedBanner').textContent = `👤 مرحباً ${data.user_name} — أدخل كلمة المرور الجديدة`;
        verifyForm.style.display = 'none';
        resetForm.style.display  = 'block';
      } else {
        showToast(data.message || 'تعذّر التحقق من البيانات', true);
      }
    } catch {
      showToast('تعذّر الاتصال بالخادم', true);
    }
  });

  resetForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const new_password     = document.getElementById('fpNewPass').value;
    const confirm_password = document.getElementById('fpConfirmPass').value;
    try {
      const res  = await fetch('../api/forgot_password.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ step: 'reset', new_password, confirm_password })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        forgotModal.style.display = 'none';
      } else {
        showToast(data.message || 'خطأ في تحديث كلمة المرور', true);
      }
    } catch {
      showToast('تعذّر الاتصال بالخادم', true);
    }
  });
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = loginForm.querySelector('button[type=submit]');
    btn.disabled = true;

    let identifier = loginForm.querySelector('[data-field=identifier]').value.trim();
    const password = loginForm.querySelector('[data-field=password]').value;
    const countrySelect = document.getElementById('loginCountryCode');

    /* If user entered a phone number without +, prepend selected country code */
    if (identifier && !identifier.includes('@') && !identifier.startsWith('+') && countrySelect) {
      identifier = countrySelect.value + identifier.replace(/^0+/, '');
    }

    try {
      const res  = await fetch('../api/login.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ identifier, password })
      });
      const data = await res.json();

      if (data.success) {
        sessionStorage.setItem('auth', JSON.stringify(data.user));
        showToast('✅ ' + (data.message || 'تم تسجيل الدخول'));
        setTimeout(() => location.href = data.redirect, 900);
      } else {
        showToast(data.message || 'خطأ في تسجيل الدخول', true);
        btn.disabled = false;
      }
    } catch (err) {
      if (location.protocol === 'file:') {
        showToast('⚠️ افتح الصفحة عبر http://localhost/sec4/html/index.html وليس كملف!', true);
      } else {
        showToast('تعذّر الاتصال بالخادم', true);
      }
      btn.disabled = false;
    }
  });
}

/* ─────────────────────────────────────
   REGISTER FORM
───────────────────────────────────── */
const registerForm = document.getElementById('registerForm');
if (registerForm) {

  const latinOnly = /^[A-Za-z\s'\-]+$/;

  /* Password strength */
  const passInput = document.getElementById('password');
  const fillEl    = document.getElementById('strengthFill');
  if (passInput && fillEl) {
    passInput.addEventListener('input', () => {
      const v = passInput.value;
      let score = 0;
      if (v.length >= 8)          score++;
      if (/[A-Z]/.test(v))        score++;
      if (/[0-9]/.test(v))        score++;
      if (/[^A-Za-z0-9]/.test(v)) score++;
      fillEl.style.width      = (score * 25) + '%';
      fillEl.style.background = ['', '#f87171', '#fb923c', '#facc15', '#4ade80'][score] || '';
    });
  }

  /* Live error clear */
  registerForm.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', () => {
      inp.classList.remove('err');
      const hintId = inp.dataset.hint;
      if (hintId) document.getElementById(hintId)?.classList.remove('show');
    });
  });

  /* Submit */
  registerForm.addEventListener('submit', async e => {
    e.preventDefault();

    const lang = localStorage.getItem('lang') || 'ar';
    const d    = T[lang];

    /* Client-side validation */
    const fName   = document.getElementById('firstName');
    const lName   = document.getElementById('lastName');
    const email   = document.getElementById('email');
    const phone   = document.getElementById('phone');
    const cCode   = document.getElementById('countryCode');
    const pass    = document.getElementById('password');
    const confirm = document.getElementById('confirmPassword');

    const fields = [
      { el: fName,   hint: 'hintFirst',   ok: v => v.trim() !== '' && latinOnly.test(v),              msg: 'reg.errName'    },
      { el: lName,   hint: 'hintLast',    ok: v => v.trim() !== '' && latinOnly.test(v),              msg: 'reg.errName'    },
      { el: email,   hint: 'hintEmail',   ok: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),             msg: 'reg.errEmail'   },
      { el: phone,   hint: 'hintPhone',   ok: v => /^[0-9\s()\-]{6,15}$/.test(v),                    msg: 'reg.errPhone'   },
      { el: pass,    hint: 'hintPass',    ok: v => v.length >= 8,                                     msg: 'reg.errPass'    },
      { el: confirm, hint: 'hintConfirm', ok: v => v !== '' && v === pass.value,                      msg: 'reg.errConfirm' },
    ];

    let valid = true;
    fields.forEach(f => {
      const hintEl = document.getElementById(f.hint);
      if (!f.ok(f.el.value)) {
        f.el.classList.add('err');
        if (hintEl) { hintEl.textContent = d[f.msg] || ''; hintEl.classList.add('show'); }
        valid = false;
      }
    });
    if (!valid) return;

    const fullPhone = (cCode ? cCode.value : '+973') + phone.value.trim().replace(/^0+/, '');

    /* API call */
    const btn = registerForm.querySelector('button[type=submit]');
    btn.disabled = true;

    try {
      const res  = await fetch('../api/register.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          first_name       : fName.value.trim(),
          last_name        : lName.value.trim(),
          email            : email.value.trim(),
          phone            : fullPhone,
          password         : pass.value,
          confirm_password : confirm.value
        })
      });
      const data = await res.json();

      if (data.success) {
        showToast(d['reg.success'] || '✅ تم إنشاء الحساب!');
        setTimeout(() => location.href = 'index.html', 1200);
      } else {
        const msg = data.errors ? data.errors.join(' | ') : (data.message || 'خطأ');
        showToast(msg, true);
        btn.disabled = false;
      }
    } catch (err) {
      if (location.protocol === 'file:') {
        showToast('⚠️ افتح الصفحة عبر http://localhost/sec4/html/index.html وليس كملف!', true);
      } else {
        showToast('تعذّر الاتصال بالخادم', true);
      }
      btn.disabled = false;
    }
  });
}

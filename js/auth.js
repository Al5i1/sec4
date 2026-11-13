/* ═══════════════════════════════════════════════════════════════════
   js/auth.js — Login, Register (with Email OTP), & Forgot Password (with Email OTP)
   ═══════════════════════════════════════════════════════════════════ */

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
      transition: 'transform 0.3s, opacity 0.3s', zIndex: '9999'
    });
    document.body.appendChild(toast);
  }
  toast.textContent      = msg;
  toast.style.background = isErr ? '#f87171' : '#4ade80';
  toast.style.color      = isErr ? '#fff'     : '#052e16';
  toast.style.transform  = 'translateY(0)';
  toast.style.opacity    = '1';
  setTimeout(() => { toast.style.transform = 'translateY(80px)'; toast.style.opacity = '0'; }, 3500);
}

/* ── Countdown helper for Resend OTP buttons ── */
function startResendCooldown(btn, seconds = 45) {
  if (!btn) return;
  let rem = seconds;
  btn.disabled = true;
  btn.style.opacity = '0.5';
  const origText = '🔄 إعادة إرسال الكود';
  const timer = setInterval(() => {
    rem--;
    if (rem <= 0) {
      clearInterval(timer);
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.textContent = origText;
    } else {
      btn.textContent = `🔄 إعادة الإرسال (${rem} ث)`;
    }
  }, 1000);
}

/* ═══════════════════════════════════════════════════════════════════
   1. FORGOT PASSWORD (WITH EMAIL OTP VERIFICATION)
   ═══════════════════════════════════════════════════════════════════ */
const forgotBtn     = document.getElementById('forgotPasswordBtn');
const forgotModal   = document.getElementById('forgotModal');
const closeForgot   = document.getElementById('closeForgotBtn');
const verifyForm    = document.getElementById('forgotVerifyForm');
const resetForm     = document.getElementById('forgotResetForm');
const resendFpBtn   = document.getElementById('resendFpOtpBtn');
const backFpEmail   = document.getElementById('backFpEmailBtn');

let currentFpEmail = '';

if (forgotBtn && forgotModal) {
  forgotBtn.addEventListener('click', e => {
    e.preventDefault();
    verifyForm.style.display = 'block';
    resetForm.style.display  = 'none';
    verifyForm.reset();
    resetForm.reset();
    const fb = document.getElementById('fpOtpFallbackHint');
    if (fb) fb.style.display = 'none';
    forgotModal.style.display = 'flex';
  });

  closeForgot?.addEventListener('click', () => {
    forgotModal.style.display = 'none';
  });

  backFpEmail?.addEventListener('click', () => {
    resetForm.style.display  = 'none';
    verifyForm.style.display = 'block';
  });

  async function requestForgotPasswordOtp(email) {
    const sendBtn = document.getElementById('fpSendOtpBtn');
    if (sendBtn) sendBtn.disabled = true;
    try {
      const res  = await fetch('../api/forgot_password.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ step: 'send_otp', email })
      });
      const data = await res.json();
      if (sendBtn) sendBtn.disabled = false;

      if (data.success) {
        currentFpEmail = email;
        showToast(data.message || '📨 تم إرسال كود التحقق إلى بريدك الإلكتروني');
        document.getElementById('fpVerifiedBanner').textContent =
          `📧 تم إرسال كود التحقق (6 أرقام) إلى: ${email}`;

        const fb = document.getElementById('fpOtpFallbackHint');
        if (fb) {
          if (data.fallback_notice) {
            fb.innerHTML = data.fallback_notice;
            fb.style.display = 'block';
          } else {
            fb.style.display = 'none';
          }
        }

        verifyForm.style.display = 'none';
        resetForm.style.display  = 'block';
        document.getElementById('fpOtpCode')?.focus();
        startResendCooldown(resendFpBtn, 45);
      } else {
        showToast(data.message || 'تعذّر إرسال كود التحقق', true);
      }
    } catch {
      if (sendBtn) sendBtn.disabled = false;
      showToast('تعذّر الاتصال بالخادم', true);
    }
  }

  verifyForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('fpEmail').value.trim();
    if (!email) {
      showToast('يرجى إدخال البريد الإلكتروني المسجل', true);
      return;
    }
    await requestForgotPasswordOtp(email);
  });

  resendFpBtn?.addEventListener('click', async () => {
    if (!currentFpEmail) return;
    await requestForgotPasswordOtp(currentFpEmail);
  });

  resetForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const otp_code         = (document.getElementById('fpOtpCode')?.value || '').trim();
    const new_password     = document.getElementById('fpNewPass').value;
    const confirm_password = document.getElementById('fpConfirmPass').value;

    if (!/^[0-9]{6}$/.test(otp_code)) {
      showToast('يرجى إدخال كود التحقق المكون من 6 أرقام بشكل صحيح', true);
      return;
    }
    if (new_password.length < 8) {
      showToast('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل', true);
      return;
    }
    if (new_password !== confirm_password) {
      showToast('كلمتا المرور غير متطابقتين', true);
      return;
    }

    const submitBtn = document.getElementById('fpResetSubmitBtn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res  = await fetch('../api/forgot_password.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          step: 'reset',
          email: currentFpEmail,
          otp_code,
          new_password,
          confirm_password
        })
      });
      const data = await res.json();
      if (submitBtn) submitBtn.disabled = false;

      if (data.success) {
        showToast(data.message || '✅ تم تغيير كلمة المرور بنجاح!');
        forgotModal.style.display = 'none';
      } else {
        showToast(data.message || 'كود التحقق غير صحيح أو منتهي الصلاحية', true);
      }
    } catch {
      if (submitBtn) submitBtn.disabled = false;
      showToast('تعذّر الاتصال بالخادم', true);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
   2. LOGIN FORM
   ═══════════════════════════════════════════════════════════════════ */
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
        setTimeout(() => location.href = data.redirect || 'home.html', 900);
      } else {
        showToast(data.message || 'خطأ في تسجيل الدخول', true);
        btn.disabled = false;
      }
    } catch {
      showToast('تعذّر الاتصال بالخادم', true);
      btn.disabled = false;
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
   3. REGISTER FORM (WITH EMAIL OTP VERIFICATION)
   ═══════════════════════════════════════════════════════════════════ */
const registerForm    = document.getElementById('registerForm');
const regOtpModal     = document.getElementById('registerOtpModal');
const regOtpForm      = document.getElementById('registerOtpForm');
const closeRegOtpBtn  = document.getElementById('closeRegOtpBtn');
const changeRegEmail  = document.getElementById('changeRegEmailBtn');
const resendRegOtpBtn = document.getElementById('resendRegOtpBtn');

let pendingRegPayload = null;

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

  async function sendRegisterOtp(payload) {
    const btn = registerForm.querySelector('button[type=submit]');
    if (btn) btn.disabled = true;

    try {
      const res  = await fetch('../api/register.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ ...payload, step: 'send_otp' })
      });
      const data = await res.json();
      if (btn) btn.disabled = false;

      if (data.success) {
        pendingRegPayload = payload;
        showToast(data.message || '📨 تم إرسال كود التحقق إلى بريدك الإلكتروني');
        const emailDisp = document.getElementById('regOtpEmailDisplay');
        if (emailDisp) emailDisp.textContent = payload.email;

        const fb = document.getElementById('regOtpFallbackHint');
        if (fb) {
          if (data.fallback_notice) {
            fb.innerHTML = data.fallback_notice;
            fb.style.display = 'block';
          } else {
            fb.style.display = 'none';
          }
        }

        if (regOtpModal) {
          regOtpModal.style.display = 'flex';
          const otpInp = document.getElementById('regOtpInput');
          if (otpInp) {
            otpInp.value = '';
            otpInp.focus();
          }
          startResendCooldown(resendRegOtpBtn, 45);
        }
      } else {
        const msg = data.errors ? data.errors.join(' | ') : (data.message || 'خطأ في البيانات المدخلة');
        showToast(msg, true);
      }
    } catch {
      if (btn) btn.disabled = false;
      showToast('تعذّر الاتصال بالخادم', true);
    }
  }

  /* Step 1: Validate fields & Send OTP to Email */
  registerForm.addEventListener('submit', async e => {
    e.preventDefault();

    const lang = localStorage.getItem('lang') || 'ar';
    const d    = (window.T && T[lang]) ? T[lang] : {};

    const fName   = document.getElementById('firstName');
    const lName   = document.getElementById('lastName');
    const email   = document.getElementById('email');
    const phone   = document.getElementById('phone');
    const cCode   = document.getElementById('countryCode');
    const pass    = document.getElementById('password');
    const confirm = document.getElementById('confirmPassword');

    const fields = [
      { el: fName,   hint: 'hintFirst',   ok: v => v.trim() !== '' && latinOnly.test(v),  msg: 'reg.errName'    },
      { el: lName,   hint: 'hintLast',    ok: v => v.trim() !== '' && latinOnly.test(v),  msg: 'reg.errName'    },
      { el: email,   hint: 'hintEmail',   ok: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), msg: 'reg.errEmail'   },
      { el: phone,   hint: 'hintPhone',   ok: v => /^[0-9\s()\-]{6,15}$/.test(v),        msg: 'reg.errPhone'   },
      { el: pass,    hint: 'hintPass',    ok: v => v.length >= 8,                         msg: 'reg.errPass'    },
      { el: confirm, hint: 'hintConfirm', ok: v => v !== '' && v === pass.value,          msg: 'reg.errConfirm' },
    ];

    let valid = true;
    fields.forEach(f => {
      const hintEl = document.getElementById(f.hint);
      if (!f.ok(f.el.value)) {
        f.el.classList.add('err');
        if (hintEl) {
          if (d[f.msg]) hintEl.textContent = d[f.msg];
          hintEl.classList.add('show');
        }
        valid = false;
      }
    });
    if (!valid) return;

    const fullPhone = (cCode ? cCode.value : '+973') + phone.value.trim().replace(/^0+/, '');

    await sendRegisterOtp({
      first_name       : fName.value.trim(),
      last_name        : lName.value.trim(),
      email            : email.value.trim(),
      phone            : fullPhone,
      password         : pass.value,
      confirm_password : confirm.value
    });
  });

  /* Step 2: Verify OTP & Complete Account Creation */
  regOtpForm?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!pendingRegPayload) return;

    const otpCode = (document.getElementById('regOtpInput')?.value || '').trim();
    if (!/^[0-9]{6}$/.test(otpCode)) {
      showToast('يرجى إدخال كود التحقق المكون من 6 أرقام', true);
      return;
    }

    const verifyBtn = document.getElementById('regVerifyOtpBtn');
    if (verifyBtn) verifyBtn.disabled = true;

    try {
      const res  = await fetch('../api/register.php', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          ...pendingRegPayload,
          step     : 'verify_otp',
          otp_code : otpCode
        })
      });
      const data = await res.json();
      if (verifyBtn) verifyBtn.disabled = false;

      if (data.success) {
        if (data.user) {
          sessionStorage.setItem('auth', JSON.stringify(data.user));
        }
        showToast(data.message || '🎉 تم تأكيد البريد الإلكتروني وإنشاء الحساب بنجاح!');
        setTimeout(() => location.href = data.redirect || 'home.html', 900);
      } else {
        showToast(data.message || '❌ كود التحقق غير صحيح، يرجى المحاولة مرة أخرى', true);
      }
    } catch {
      if (verifyBtn) verifyBtn.disabled = false;
      showToast('تعذّر الاتصال بالخادم', true);
    }
  });

  resendRegOtpBtn?.addEventListener('click', async () => {
    if (!pendingRegPayload) return;
    await sendRegisterOtp(pendingRegPayload);
  });

  closeRegOtpBtn?.addEventListener('click', () => {
    if (regOtpModal) regOtpModal.style.display = 'none';
  });

  changeRegEmail?.addEventListener('click', () => {
    if (regOtpModal) regOtpModal.style.display = 'none';
    document.getElementById('email')?.focus();
  });
}

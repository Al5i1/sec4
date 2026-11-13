/* ═══════════════════════════════════════════════════════════════════
   js/ai_assistant.js — المساعد الذكي المجاني لمنصة SEC4 (AI Assistant)
   - يجيب الطلاب عن كل ما يخص المنصة، الأقسام، الملفات، المراجعات، والاختبارات
   - يشرح قسم SPARK وطريقة الاشتراك (بدينارين فقط 2 BD) عبر واتساب 36886544
   - يدعم المحادثة الذكية المجانية ومساعدة الطلاب في مقررات الإنجليزي (ENG11-14)
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  const WHATSAPP_NUMBER = '97336886544';
  const WHATSAPP_DISPLAY = '36886544';
  const WHATSAPP_SPARK_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('السلام عليكم، أبي أشترك في قسم SPARK (بدينارين) في منصة SEC4')}`;
  const WHATSAPP_HELP_URL  = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('السلام عليكم، محتاج مساعدة في منصة SEC4')}`;

  function getUserName() {
    try {
      const auth = JSON.parse(sessionStorage.getItem('auth') || 'null');
      if (auth && auth.first_name) return auth.first_name;
    } catch {}
    return 'طالب SEC4';
  }

  function injectStyles() {
    if (document.getElementById('sec4AiStyles')) return;
    const style = document.createElement('style');
    style.id = 'sec4AiStyles';
    style.textContent = `
      .sec4-ai-fab {
        position: fixed;
        bottom: 24px;
        left: 24px;
        z-index: 9990;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 18px;
        border-radius: 999px;
        background: linear-gradient(135deg, #6366f1, #8b5cf6, #ec4899);
        color: #fff;
        font-family: 'Cairo', sans-serif;
        font-size: 14px;
        font-weight: 800;
        border: 1.5px solid rgba(255,255,255,0.28);
        box-shadow: 0 10px 28px rgba(99, 102, 241, 0.45);
        cursor: pointer;
        transition: transform 0.22s ease, box-shadow 0.22s ease;
      }
      .sec4-ai-fab:hover {
        transform: translateY(-3px) scale(1.02);
        box-shadow: 0 14px 34px rgba(139, 92, 246, 0.6);
      }
      .sec4-ai-fab .ai-pulse {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #4ade80;
        box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7);
        animation: sec4AiPulse 2s infinite;
      }
      @keyframes sec4AiPulse {
        0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7); }
        70% { box-shadow: 0 0 0 9px rgba(74, 222, 128, 0); }
        100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
      }

      .sec4-ai-window {
        position: fixed;
        bottom: 86px;
        left: 24px;
        width: 370px;
        max-width: calc(100vw - 28px);
        height: 530px;
        max-height: calc(100vh - 140px);
        background: var(--card-bg, #11132b);
        border: 1.5px solid rgba(139, 92, 246, 0.4);
        border-radius: 22px;
        box-shadow: 0 22px 60px rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(20px);
        z-index: 9995;
        display: none;
        flex-direction: column;
        overflow: hidden;
        font-family: 'Cairo', sans-serif;
        direction: rtl;
      }
      .sec4-ai-window.open {
        display: flex;
        animation: sec4AiSlideUp 0.22s ease-out;
      }
      @keyframes sec4AiSlideUp {
        from { opacity: 0; transform: translateY(16px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }

      .sec4-ai-head {
        padding: 14px 16px;
        background: linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.22));
        border-bottom: 1px solid rgba(255,255,255,0.1);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .sec4-ai-head-info {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .sec4-ai-avatar {
        width: 38px;
        height: 38px;
        border-radius: 12px;
        background: linear-gradient(135deg, #6366f1, #ec4899);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
      }
      .sec4-ai-title {
        font-size: 14.5px;
        font-weight: 800;
        color: var(--text, #eef0ff);
      }
      .sec4-ai-sub {
        font-size: 11px;
        color: #4ade80;
        font-weight: 700;
      }
      .sec4-ai-close {
        background: rgba(255,255,255,0.08);
        border: none;
        color: var(--text, #eef0ff);
        width: 32px;
        height: 32px;
        border-radius: 9px;
        cursor: pointer;
        font-size: 15px;
      }

      .sec4-ai-messages {
        flex: 1;
        overflow-y: auto;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .sec4-ai-msg {
        max-width: 88%;
        padding: 11px 14px;
        border-radius: 16px;
        font-size: 13px;
        line-height: 1.65;
        word-wrap: break-word;
      }
      .sec4-ai-msg.bot {
        align-self: flex-start;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        color: var(--text, #eef0ff);
        border-top-right-radius: 4px;
      }
      .sec4-ai-msg.user {
        align-self: flex-end;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: #fff;
        border-top-left-radius: 4px;
        font-weight: 600;
      }
      .sec4-ai-wa-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        margin-top: 8px;
        padding: 9px 14px;
        border-radius: 10px;
        background: linear-gradient(135deg, #22c55e, #16a34a);
        color: #fff !important;
        text-decoration: none;
        font-weight: 800;
        font-size: 12.5px;
        width: 100%;
        box-shadow: 0 4px 14px rgba(34,197,94,0.3);
      }
      .sec4-ai-nav-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        margin-top: 6px;
        padding: 7px 12px;
        border-radius: 9px;
        background: rgba(139, 92, 246, 0.2);
        border: 1px solid rgba(139, 92, 246, 0.45);
        color: var(--text, #eef0ff);
        font-family: 'Cairo', sans-serif;
        font-weight: 700;
        font-size: 12px;
        cursor: pointer;
        width: 100%;
      }

      .sec4-ai-chips {
        padding: 8px 12px;
        display: flex;
        gap: 6px;
        overflow-x: auto;
        border-top: 1px solid rgba(255,255,255,0.07);
        scrollbar-width: none;
      }
      .sec4-ai-chips::-webkit-scrollbar { display: none; }
      .sec4-ai-chip {
        white-space: nowrap;
        padding: 6px 11px;
        border-radius: 999px;
        background: rgba(99, 102, 241, 0.14);
        border: 1px solid rgba(99, 102, 241, 0.35);
        color: var(--text, #eef0ff);
        font-family: 'Cairo', sans-serif;
        font-size: 11.5px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s;
      }
      .sec4-ai-chip:hover {
        background: rgba(99, 102, 241, 0.3);
      }

      .sec4-ai-input-bar {
        padding: 10px 12px;
        border-top: 1px solid rgba(255,255,255,0.1);
        display: flex;
        gap: 8px;
        background: rgba(0,0,0,0.18);
      }
      .sec4-ai-input {
        flex: 1;
        padding: 9px 13px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.15);
        background: var(--input-bg, rgba(255,255,255,0.06));
        color: var(--text, #eef0ff);
        font-family: 'Cairo', sans-serif;
        font-size: 13px;
        outline: none;
      }
      .sec4-ai-send {
        padding: 0 15px;
        border-radius: 12px;
        border: none;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: #fff;
        font-family: 'Cairo', sans-serif;
        font-weight: 800;
        cursor: pointer;
      }

      @media (max-width: 768px) {
        .sec4-ai-fab {
          bottom: 78px;
          left: 14px;
          padding: 10px 14px;
          font-size: 12.5px;
        }
        .sec4-ai-window {
          bottom: 134px;
          left: 14px;
          width: calc(100vw - 28px);
          height: 68vh;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createWidget() {
    if (document.getElementById('sec4AiFab')) return;
    injectStyles();

    const fab = document.createElement('button');
    fab.id = 'sec4AiFab';
    fab.className = 'sec4-ai-fab';
    fab.innerHTML = `<span class="ai-pulse"></span><span>🤖 مساعد SEC4 الذكي</span>`;

    const win = document.createElement('div');
    win.id = 'sec4AiWindow';
    win.className = 'sec4-ai-window';
    win.innerHTML = `
      <div class="sec4-ai-head">
        <div class="sec4-ai-head-info">
          <div class="sec4-ai-avatar">🤖</div>
          <div>
            <div class="sec4-ai-title">مساعد SEC4 الذكي (AI)</div>
            <div class="sec4-ai-sub">● متصل الآن — إجابات فورية ومجانية</div>
          </div>
        </div>
        <button class="sec4-ai-close" id="sec4AiClose" title="إغلاق">✕</button>
      </div>

      <div class="sec4-ai-messages" id="sec4AiMessages"></div>

      <div class="sec4-ai-chips">
        <button class="sec4-ai-chip" data-q="شنو هو قسم SPARK وكم سعره؟">⚡ شنو هو SPARK وبكم؟</button>
        <button class="sec4-ai-chip" data-q="أبي أشترك في SPARK">💬 الاشتراك في SPARK</button>
        <button class="sec4-ai-chip" data-q="شنو الملفات والمراجعات المتوفرة؟">📚 الملفات والمراجعات</button>
        <button class="sec4-ai-chip" data-q="اشرح لي أقسام المنصة">🧭 أقسام المنصة</button>
        <button class="sec4-ai-chip" data-q="نسيت كلمة المرور أو عندي مشكلة">🔑 مساعدة بالحساب</button>
      </div>

      <form class="sec4-ai-input-bar" id="sec4AiForm">
        <input type="text" class="sec4-ai-input" id="sec4AiInput" placeholder="اسألني عن SPARK أو المواد أو الإنجليزي..." autocomplete="off"/>
        <button type="submit" class="sec4-ai-send">إرسال</button>
      </form>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(win);

    const msgsEl = document.getElementById('sec4AiMessages');

    function addMessage(html, sender = 'bot') {
      const div = document.createElement('div');
      div.className = `sec4-ai-msg ${sender}`;
      div.innerHTML = html;
      msgsEl.appendChild(div);
      msgsEl.scrollTop = msgsEl.scrollHeight;
      return div;
    }

    // Initial welcome message
    addMessage(`
      أهلاً بك يا <strong>${getUserName()}</strong> في منصة <strong>SEC4</strong> الأكاديمية! 🎓✨<br/>
      أنا مساعدك الذكي، أقدر أساعدك في:<br/>
      • معرفة كل شيء عن قسم <strong>⚡ SPARK</strong> (حلول جميع الوحدات بـ <strong>دينارين فقط</strong>).<br/>
      • البحث عن الملفات، المراجعات، الملازم، والاختبارات.<br/>
      • شرح قواعد ومفردات الإنجليزي (ENG11 - ENG14).<br/>
      <a class="sec4-ai-wa-btn" href="${WHATSAPP_SPARK_URL}" target="_blank" rel="noopener">
        💬 اشترك في SPARK (دينارين) — واتساب ${WHATSAPP_DISPLAY}
      </a>
    `, 'bot');

    fab.addEventListener('click', () => {
      win.classList.toggle('open');
      if (win.classList.contains('open')) {
        setTimeout(() => document.getElementById('sec4AiInput')?.focus(), 150);
      }
    });

    document.getElementById('sec4AiClose').addEventListener('click', () => {
      win.classList.remove('open');
    });

    win.querySelectorAll('.sec4-ai-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const q = chip.getAttribute('data-q');
        handleUserQuestion(q);
      });
    });

    document.getElementById('sec4AiForm').addEventListener('submit', e => {
      e.preventDefault();
      const inp = document.getElementById('sec4AiInput');
      const q = inp.value.trim();
      if (!q) return;
      inp.value = '';
      handleUserQuestion(q);
    });

    async function handleUserQuestion(text) {
      addMessage(escapeHtml(text), 'user');
      const loadingEl = addMessage('⏳ جاري التفكير...', 'bot');

      try {
        const replyHtml = await generateSmartReply(text);
        loadingEl.innerHTML = replyHtml;
      } catch {
        loadingEl.innerHTML = `
          يمكنك التواصل مباشرة مع مدير المنصة (علي) عبر الواتساب على الرقم <strong>${WHATSAPP_DISPLAY}</strong>:
          <a class="sec4-ai-wa-btn" href="${WHATSAPP_HELP_URL}" target="_blank" rel="noopener">
            💬 تواصل عبر الواتساب (${WHATSAPP_DISPLAY})
          </a>
        `;
      }
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function generateSmartReply(q) {
    const t = q.toLowerCase().trim();

    /* 1. SPARK / Price / Subscription / Code / WhatsApp questions */
    if (/(spark|سبارك|اشتراك|أشترك|اشترك|كود|سعر|بكم|دينار|حلول|تمارين|واتس|رقم|تواصل)/i.test(t)) {
      return `
        <strong>⚡ قسم SPARK الحصري في منصة SEC4:</strong><br/>
        • يحتوي على <strong>جميع حلول وإجابات تمارين الوحدات</strong> لمقررات (<strong>ENG 11</strong> و <strong>ENG 12</strong> و <strong>ENG 13</strong>) مرتبة حسب كل وحدة وكل تمرين.<br/>
        • 💰 <strong>سعر الاشتراك:</strong> <strong>دينارين فقط (2 BD)</strong> يتفعل بشكل دائم على حسابك طوال الفصل!<br/>
        • 📱 <strong>طريقة الاشتراك واستلام الكود:</strong><br/>
        كلّم الأدمن في خاص الواتساب على الرقم <strong>${WHATSAPP_DISPLAY}</strong> وبيعطيك كود التفعيل فوراً:<br/>
        <a class="sec4-ai-wa-btn" href="${WHATSAPP_SPARK_URL}" target="_blank" rel="noopener">
          💬 كلمني واتساب (${WHATSAPP_DISPLAY}) لشراء كود SPARK
        </a>
        ${window.Platform ? `<button class="sec4-ai-nav-btn" onclick="Platform.switchView('spark')">⚡ الذهاب إلى قسم SPARK الآن</button>` : ''}
      `;
    }

    /* 2. Platform Sections Explanation */
    if (/(أقسام|اقسام|شرح الموقع|كيف استخدم|شنو في الموقع|مكونات)/i.test(t)) {
      return `
        <strong>🧭 أقسام منصة SEC4 الأكاديمية:</strong><br/>
        1️⃣ <strong>المشاريع:</strong> ملفات ونماذج المشاريع لمواد (ENG11 - ENG14 & SSO).<br/>
        2️⃣ <strong>الاختبارات:</strong> نماذج الاختبارات السابقة ومراجعات المنتصف والنهائي.<br/>
        3️⃣ <strong>الجدول:</strong> جدول المحاضرات والأوقات والقاعات.<br/>
        4️⃣ <strong>⚡ SPARK:</strong> حلول جميع تمارين الوحدات (الاشتراك بدينارين فقط عبر واتساب <strong>${WHATSAPP_DISPLAY}</strong>).<br/>
        5️⃣ <strong>الملازم & البلاكبورد:</strong> ملازم الشرح ومراجعات البلاكبورد والروابط المباشرة.<br/>
        <a class="sec4-ai-wa-btn" href="${WHATSAPP_SPARK_URL}" target="_blank" rel="noopener">
          💬 اشترك في SPARK (دينارين) — واتساب ${WHATSAPP_DISPLAY}
        </a>
      `;
    }

    /* 3. Password / Account Help */
    if (/(نسيت|باسورد|كلمة السر|كلمه السر|كلمة المرور|حسابي|تعديل حساب)/i.test(t)) {
      return `
        <strong>🔑 مساعدة الحساب وكلمة المرور:</strong><br/>
        • إذا نسيت كلمة المرور، اضغط على زر <strong>«نسيت كلمة المرور؟»</strong> في صفحة تسجيل الدخول وأدخل بريدك ورقم هاتفك لتعيين كلمة مرور جديدة فوراً.<br/>
        • أو تواصل مباشرة في خاص الواتساب على الرقم <strong>${WHATSAPP_DISPLAY}</strong> لتعديل بيانات حسابك:<br/>
        <a class="sec4-ai-wa-btn" href="${WHATSAPP_HELP_URL}" target="_blank" rel="noopener">
          💬 تواصل مع الإدارة واتساب (${WHATSAPP_DISPLAY})
        </a>
      `;
    }

    /* 4. Files / Revisions / Mid / Subjects Search */
    if (/(ملف|ملفات|مراجع|مد|mid|ملازم|بلاكبورد|اختبار|eng11|eng12|eng13|eng14|sso)/i.test(t)) {
      try {
        const res = await fetch('../api/files.php?mode=recent');
        const data = await res.json();
        const files = (data.files || []).filter(f => f.section !== 'spark').slice(0, 6);
        let listHtml = '';
        if (files.length > 0) {
          listHtml = '<div style="margin-top:6px;"><strong>📂 أحدث الملفات والمراجعات المرفوعة:</strong><ul style="padding-right:16px;margin:4px 0;">' +
            files.map(f => `<li>${escapeHtml(f.title)} ${f.subject ? `(${escapeHtml(f.subject)})` : ''}</li>`).join('') +
            '</ul></div>';
        }
        return `
          <strong>📚 الملفات والمراجعات في المنصة:</strong><br/>
          تجد المراجعات والملفات مقسمة حسب المقرر (<strong>ENG11, ENG12, ENG13, ENG14, SSO</strong>) داخل أقسام <strong>البلاكبورد</strong> و<strong>الاختبارات</strong> و<strong>الملازم</strong>.
          ${listHtml}
          ${window.Platform ? `
            <button class="sec4-ai-nav-btn" onclick="Platform.switchSection('blackboard')">🎓 فتح قسم البلاكبورد والمراجعات</button>
            <button class="sec4-ai-nav-btn" onclick="Platform.switchSection('exams')">📝 فتح قسم الاختبارات</button>
          ` : ''}
        `;
      } catch {}
    }

    /* 5. Free Cloud AI (Pollinations Open AI) for general & English study questions */
    try {
      const sysPrompt = `أنت المساعد الذكي الرسمي لمنصة SEC4 الأكاديمية لطلاب شعبة SEC4 في البحرين. أجب باللغة العربية بأسلوب ودود ومختصر ومفيد. معلومات هامة يجب ذكرها إذا سأل الطالب: قسم SPARK يحتوي على حلول جميع تمارين الوحدات لمقررات ENG11 و ENG12 و ENG13، وسعر الاشتراك في SPARK هو دينارين فقط (2 BD)، وللاشتراك والحصول على الكود يجب التواصل في خاص الواتساب على الرقم 36886544. إذا سأل الطالب سؤالاً دراسياً في اللغة الإنجليزية (قواعد، كلمات، تعبير)، اشرحه له بوضوح.`;
      const resp = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: sysPrompt },
            { role: 'user', content: q }
          ],
          model: 'openai'
        })
      });
      if (resp.ok) {
        const aiText = (await resp.text()).trim();
        if (aiText && aiText.length > 2) {
          return `${escapeHtml(aiText).replace(/\n/g, '<br/>')}
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);font-size:11.5px;color:var(--text-muted);">
              💡 للاشتراك في <strong>SPARK (بدينارين فقط)</strong> تواصل واتساب: <a href="${WHATSAPP_SPARK_URL}" target="_blank" style="color:#4ade80;font-weight:800;">${WHATSAPP_DISPLAY}</a>
            </div>`;
        }
      }
    } catch {}

    /* 6. Instant Fallback */
    return `
      شكراً لسؤالك! 🌟<br/>
      • لتصفح الملازم، الاختبارات، والمراجعات اختر القسم من القائمة الجانبية.<br/>
      • وللاشتراك في قسم <strong>⚡ SPARK</strong> (شامل جميع حلول التمارين بـ <strong>دينارين فقط 2 BD</strong>)، تواصل مباشرة عبر خاص الواتساب على الرقم <strong>${WHATSAPP_DISPLAY}</strong>:<br/>
      <a class="sec4-ai-wa-btn" href="${WHATSAPP_SPARK_URL}" target="_blank" rel="noopener">
        💬 تواصل واتساب (${WHATSAPP_DISPLAY}) للاشتراك أو الاستفسار
      </a>
    `;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
})();

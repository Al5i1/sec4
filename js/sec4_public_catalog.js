
(() => {
  'use strict';

  const API = 'https://sec4-sync-free.ali3mk84888.workers.dev/api/public-feed';
  const container = document.getElementById('sec4PublicCatalog');
  const status = document.getElementById('sec4PublicStatus');
  const items = document.getElementById('sec4PublicItems');
  const section = document.getElementById('view-browser');

  if (!container || !status || !items || !section) {
    console.warn('[SEC4] Public catalog elements or Blackboard section not found');
    return;
  }

  let loading = false;
  let loaded = false;

  function text(tag, value) {
    const element = document.createElement(tag);
    element.textContent = String(value ?? '');
    return element;
  }

  async function load() {
    if (loaded || loading) return;
    loading = true;
    status.textContent = 'جاري تحميل المواد المنشورة...';

    try {
      const records = [];
      let offset = 0;
      const seenOffsets = new Set();

      for (let page = 0; page < 30; page++) {
        if (seenOffsets.has(offset)) {
          throw new Error('تكرار صفحة النتائج');
        }
        seenOffsets.add(offset);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        let data;

        try {
          const response = await fetch(
            API + '?offset=' + encodeURIComponent(offset),
            {
              signal: controller.signal,
              headers: { Accept: 'application/json' }
            }
          );

          if (!response.ok) {
            throw new Error('HTTP ' + response.status);
          }

          data = await response.json();
        } finally {
          clearTimeout(timer);
        }

        if (!data || !Array.isArray(data.records)) {
          throw new Error('استجابة غير صحيحة من الخادم');
        }

        records.push(...data.records);

        if (data.next_offset == null) break;

        const next = Number(data.next_offset);
        if (!Number.isSafeInteger(next) || next < 0) {
          throw new Error('رقم صفحة غير صحيح');
        }
        offset = next;
      }

      items.replaceChildren();

      for (const record of records) {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.style.cssText =
          'padding:12px;border:1px solid #8885;' +
          'border-radius:10px;min-width:170px';

        card.append(
          text('strong', record.title || 'بدون عنوان')
        );

        const meta = text('div', record.course || '');
        meta.style.cssText =
          'font-size:12px;opacity:.8;margin-top:8px';

        card.append(meta);
        items.append(card);
      }

      status.textContent = records.length
        ? 'المواد المنشورة: ' + records.length
        : 'لا توجد مواد مصرح بنشرها حالياً';

      loaded = true;
    } catch (error) {
      status.textContent =
        'تعذر تحميل المواد المنشورة: ' +
        (error?.message || 'خطأ غير معروف');

      console.error('[SEC4] Public catalog:', error);
    } finally {
      loading = false;
    }
  }

  function updateVisibility() {
    const visible =
      getComputedStyle(section).display !== 'none';

    container.style.display = visible ? 'block' : 'none';

    if (visible) {
      void load();
    }
  }

  // نراقب قسم Blackboard فقط لتجنب حلقة التحديث المتكررة
  const observer = new MutationObserver(updateVisibility);

  observer.observe(section, {
    attributes: true,
    attributeFilter: ['style', 'class']
  });

  updateVisibility();
})();

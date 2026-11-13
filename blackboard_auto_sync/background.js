/* ═══════════════════════════════════════════════════════════════════
   background.js — مؤقت المزامنة التلقائية كل 12 ساعة لبلاكبورد UOB
   ═══════════════════════════════════════════════════════════════════ */

chrome.runtime.onInstalled.addListener(() => {
  // فحص تلقائي كل 12 ساعة (720 دقيقة)
  chrome.alarms.create('sec4_bb_sync_12h', { periodInMinutes: 720 });
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== 'sec4_bb_sync_12h') return;
  try {
    const tabs = await chrome.tabs.query({ url: 'https://blackboard.uob.edu.bh/*' });
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'RUN_AUTO_SYNC' });
    } else {
      // فتح تبويب بلاكبورد في الخلفية لإجراء المزامنة التلقائية
      chrome.tabs.create({ url: 'https://blackboard.uob.edu.bh/ultra/course?sec4_autosync=1', active: false });
    }
  } catch (e) {
    console.error('SEC4 AutoSync Alarm Error:', e);
  }
});

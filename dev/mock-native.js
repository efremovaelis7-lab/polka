// Имитация Android-оболочки для проверки в браузере (подключается только в тестах).
(() => {
  const get = (u) => fetch(u).then(r => r.text());
  window.__mockLog = [];
  window.PolkaNative = {
    platform: () => 'android', sdk: () => 34, version: () => '1.0-dev',
    hasStorageAccess: () => window.__access !== false,
    requestStorageAccess() { window.__mockLog.push('requestStorageAccess'); },
    scan(cb) { get('/dev/scan').then(t => setTimeout(() => window.__polkaCb(cb, t), 50)); },
    pickBooks(cb) { get('/dev/pick?names=' + encodeURIComponent(window.__pickNames || '')).then(t => window.__polkaCb(cb, t)); },
    pickFont(cb) { get('/dev/pick?sub=fonts&names=' + encodeURIComponent(window.__pickFont || '')).then(t => window.__polkaCb(cb, t)); },
    takePendingOpen: () => { const s = window.__pendingOpen || ''; window.__pendingOpen = ''; return s; },
    fileExists: () => true,
    deleteOwnFile(p) { const x = new XMLHttpRequest(); x.open('GET', '/dev/delete?p=' + encodeURIComponent(p), false); x.send(); return x.responseText === 'true'; },
    setVolumeKeys(v) { window.__mockLog.push('vol:' + v); }, setKeepScreenOn() {}, setBrightness() {},
    setSystemBars(c, l, f) { window.__mockLog.push(`bars:${c}:${l}:${f}`); },
    toast(t) { window.__mockLog.push('toast:' + t); },
    setCustomSelection(v) { window.__mockLog.push('customSel:' + v); },
    copyText(t) { window.__mockLog.push('copy:' + t); },
    shareText(t) { window.__mockLog.push('share:' + t); },
  };
})();

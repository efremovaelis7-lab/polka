// Мост к Android-оболочке. В обычном браузере работает запасной режим.

const N = window.PolkaNative || null;
export const isNative = !!N;

let seq = 0;
const pending = new Map();
window.__polkaCb = (id, json) => {
  const fn = pending.get(id);
  pending.delete(id);
  if (fn) {
    let v = null;
    try { v = json ? JSON.parse(json) : null; } catch (e) { v = null; }
    fn(v);
  }
};

const listeners = new Map();
window.__polkaEvent = (name, data) => {
  for (const fn of listeners.get(name) || []) {
    try { fn(data); } catch (e) { console.error(e); }
  }
};

function call(method, ...args) {
  return new Promise(resolve => {
    const id = 'cb' + (++seq);
    pending.set(id, resolve);
    N[method](id, ...args);
  });
}

export const native = {
  on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(fn);
  },
  hasStorageAccess: () => (N ? !!N.hasStorageAccess() : false),
  requestStorageAccess: () => N && N.requestStorageAccess(),
  scan: () => (N ? call('scan') : Promise.resolve([])),
  pickBooks: () => (N ? call('pickBooks') : Promise.resolve(null)),
  pickFont: () => (N ? call('pickFont') : Promise.resolve(null)),
  takePendingOpen() {
    if (!N) return null;
    const s = N.takePendingOpen();
    try { return s ? JSON.parse(s) : null; } catch (e) { return null; }
  },
  deleteOwnFile: p => (N ? !!N.deleteOwnFile(p) : false),
  fileExists: p => (N ? !!N.fileExists(p) : true),
  setVolumeKeys: on => N && N.setVolumeKeys(!!on),
  setKeepScreenOn: on => N && N.setKeepScreenOn(!!on),
  setBrightness: v => N && N.setBrightness(v),
  setSystemBars: (color, light, full) => N && N.setSystemBars(color, !!light, !!full),
  toast: t => N && N.toast(t),
  version: () => (N && N.version ? N.version() : 'web'),
  fileUrl: p => '/file?p=' + encodeURIComponent(p),
};

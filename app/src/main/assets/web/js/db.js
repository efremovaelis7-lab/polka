// IndexedDB: книги, обложки, файлы (в браузерном режиме), свои шрифты.

let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open('polka', 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('covers')) db.createObjectStore('covers');
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('notes')) {
        const s = db.createObjectStore('notes', { keyPath: 'id' });
        s.createIndex('book', 'book');
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    const req = fn(s);
    if (req) req.onsuccess = () => { out = req.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const db = {
  allBooks: () => tx('books', 'readonly', s => s.getAll()),
  getBook: id => tx('books', 'readonly', s => s.get(id)),
  putBook: b => tx('books', 'readwrite', s => s.put(b)),
  delBook: id => tx('books', 'readwrite', s => s.delete(id)),
  getCover: id => tx('covers', 'readonly', s => s.get(id)),
  putCover: (id, blob) => tx('covers', 'readwrite', s => s.put(blob, id)),
  delCover: id => tx('covers', 'readwrite', s => s.delete(id)),
  getFile: id => tx('files', 'readonly', s => s.get(id)),
  putFile: (id, blob) => tx('files', 'readwrite', s => s.put(blob, id)),
  delFile: id => tx('files', 'readwrite', s => s.delete(id)),
  notesFor: book => tx('notes', 'readonly', s => s.index('book').getAll(book)),
  allNotes: () => tx('notes', 'readonly', s => s.getAll()),
  putNote: n => tx('notes', 'readwrite', s => s.put(n)),
  delNote: id => tx('notes', 'readwrite', s => s.delete(id)),
  get: k => tx('kv', 'readonly', s => s.get(k)),
  set: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)),
};

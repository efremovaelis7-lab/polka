// Библиотека: записи о книгах, обложки, добавление, поиск на устройстве.
import { db } from './db.js';
import { native, isNative } from './native.js';
import { openBook } from './book.js';
import { hashStr } from './ui.js';
import { statusOf } from './tracker.js';

const coverUrls = new Map();
const subs = new Set();

async function makeThumb(blob) {
  if (!blob) return null;
  try {
    const bmp = await createImageBitmap(blob);
    const w = 320, hgt = Math.round(bmp.height * w / bmp.width);
    if (!hgt || hgt > w * 3) { bmp.close && bmp.close(); return null; }
    const c = document.createElement('canvas');
    c.width = w; c.height = hgt;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, hgt);
    bmp.close && bmp.close();
    return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
  } catch (e) {
    return null;
  }
}

function cleanName(name) {
  return name.replace(/\.(fb2\.zip|fb2|epub|zip)$/i, '').replace(/[_]+/g, ' ').trim();
}

export const library = {
  books: [],

  async init() {
    this.books = (await db.allBooks()) || [];
    this.ignored = new Set((await db.get('ignored')) || []);
  },

  on(fn) { subs.add(fn); },
  emit() { for (const fn of subs) fn(); },

  byPath(p) { return this.books.find(b => b.path === p); },

  async coverUrl(rec) {
    if (!rec.hasCover) return null;
    if (coverUrls.has(rec.id)) return coverUrls.get(rec.id);
    const blob = await db.getCover(rec.id);
    const url = blob ? URL.createObjectURL(blob) : null;
    coverUrls.set(rec.id, url);
    return url;
  },

  async readBuffer(rec) {
    if (rec.source === 'blob') {
      const blob = await db.getFile(rec.fileKey);
      if (!blob) throw new Error('Файл книги не найден');
      return blob.arrayBuffer();
    }
    const r = await fetch(native.fileUrl(rec.path));
    if (r.status === 404) throw Object.assign(new Error('Файл не найден — возможно, его удалили или переместили'), { missing: true });
    if (r.status === 403) throw Object.assign(new Error('Нет доступа к файлу. Разрешите «Доступ ко всем файлам»'), { denied: true });
    if (!r.ok) throw new Error('Не удалось прочитать файл');
    return r.arrayBuffer();
  },

  async open(rec) {
    const buf = await this.readBuffer(rec);
    return openBook(buf);
  },

  async _record(buf, base) {
    const book = await openBook(buf, { metaOnly: true });
    const m = book.meta;
    const rec = {
      ...base,
      title: m.title || cleanName(base.name || 'Без названия'),
      authors: m.authors || [],
      series: m.series || '',
      seriesIndex: m.seriesIndex || '',
      annotation: (m.annotation || '').slice(0, 1500),
      lang: m.lang || '',
      format: book.format,
      addedAt: Date.now(),
      lastOpened: 0,
      progress: 0,
      pos: null,
      finished: false,
      hasCover: false,
    };
    try {
      const thumb = await makeThumb(await book.cover());
      if (thumb) { await db.putCover(rec.id, thumb); rec.hasCover = true; }
    } catch (e) { /* без обложки */ }
    if (book.destroy) book.destroy();
    return rec;
  },

  /** files: [{path,name,size,mtime}] — добавить книги, лежащие на устройстве. */
  async addFiles(files, { onProgress, force = false } = {}) {
    const added = [];
    const failed = [];
    const todo = files.filter(f => f && f.path && (force || (!this.byPath(f.path) && !this.ignored.has(f.path))))
      .filter(f => force || !this.books.some(b => b.name === f.name && b.size === f.size));
    let i = 0;
    for (const f of todo) {
      i++;
      onProgress && onProgress(i, todo.length, f.name);
      const existing = this.byPath(f.path);
      if (existing) { added.push(existing); continue; }
      try {
        const r = await fetch(native.fileUrl(f.path));
        if (!r.ok) throw new Error('read ' + r.status);
        const buf = await r.arrayBuffer();
        const rec = await this._record(buf, { id: 'p:' + hashStr(f.path), source: 'path', path: f.path, name: f.name, size: f.size, mtime: f.mtime });
        await db.putBook(rec);
        this.books.push(rec);
        added.push(rec);
      } catch (e) {
        console.warn('Не удалось добавить', f.path, e);
        failed.push(f);
      }
    }
    if (failed.length) {
      for (const f of failed) this.ignored.add(f.path);
      await db.set('ignored', [...this.ignored]);
    }
    if (added.length) this.emit();
    return { added, failed };
  },

  /** Браузерный режим: файлы из <input type=file>. */
  async addBlobs(fileList, { onProgress } = {}) {
    const added = [];
    const failed = [];
    let i = 0;
    for (const file of fileList) {
      i++;
      onProgress && onProgress(i, fileList.length, file.name);
      const key = 'book:' + hashStr(file.name + ':' + file.size);
      const id = 'b:' + hashStr(file.name + ':' + file.size);
      const ex = this.books.find(b => b.id === id);
      if (ex) { added.push(ex); continue; }
      try {
        const buf = await file.arrayBuffer();
        const rec = await this._record(buf, { id, source: 'blob', fileKey: key, name: file.name, size: file.size, mtime: file.lastModified });
        await db.putFile(key, file);
        await db.putBook(rec);
        this.books.push(rec);
        added.push(rec);
      } catch (e) {
        console.warn('Не удалось добавить', file.name, e);
        failed.push(file);
      }
    }
    if (added.length) this.emit();
    return { added, failed };
  },

  async setStatus(rec, status) {
    rec.status = status;
    if (status === 'done') {
      rec.finished = true;
      rec.finishedAt = rec.finishedAt || Date.now();
    } else {
      rec.finished = false;
      rec.finishedAt = null;
    }
    await this.update(rec);
    this.emit();
  },

  count(status) {
    return status === 'all' ? this.books.length : this.books.filter(b => statusOf(b) === status).length;
  },

  async update(rec) {
    const i = this.books.findIndex(b => b.id === rec.id);
    if (i >= 0) this.books[i] = rec;
    await db.putBook(rec);
  },

  async remove(rec) {
    this.books = this.books.filter(b => b.id !== rec.id);
    await db.delBook(rec.id);
    await db.delCover(rec.id);
    if (coverUrls.has(rec.id)) { const u = coverUrls.get(rec.id); if (u) URL.revokeObjectURL(u); coverUrls.delete(rec.id); }
    if (rec.source === 'blob') await db.delFile(rec.fileKey);
    else if (rec.path) {
      if (!native.deleteOwnFile(rec.path)) {
        // книга из памяти телефона — не трогаем файл, просто больше не добавляем при поиске
        this.ignored.add(rec.path);
        await db.set('ignored', [...this.ignored]);
      }
    }
    this.emit();
  },

  async scan(opts = {}) {
    if (!isNative) return { added: [], failed: [], found: 0 };
    const found = (await native.scan()) || [];
    const res = await this.addFiles(found.filter(Boolean), opts);
    return { ...res, found: found.length };
  },

  async forgetIgnored() {
    this.ignored = new Set();
    await db.set('ignored', []);
  },

  sorted(sort, query, tab = 'all') {
    let list = tab === 'all' ? [...this.books] : this.books.filter(b => statusOf(b) === tab);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(b => (b.title + ' ' + (b.authors || []).join(' ') + ' ' + (b.series || '')).toLowerCase().includes(q));
    }
    const author = b => ((b.authors && b.authors[0]) || '').split(' ').reverse().join(' ');
    const cmp = (a, b) => a.localeCompare(b, 'ru');
    if (sort === 'title') list.sort((a, b) => cmp(a.title, b.title));
    else if (sort === 'author') list.sort((a, b) => cmp(author(a), author(b)) || cmp(a.series || '', b.series || '') || (+a.seriesIndex || 0) - (+b.seriesIndex || 0) || cmp(a.title, b.title));
    else if (sort === 'added') list.sort((a, b) => b.addedAt - a.addedAt);
    else if (tab === 'done') list.sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
    else list.sort((a, b) => (b.lastOpened || b.addedAt / 1e3) - (a.lastOpened || a.addedAt / 1e3));
    return list;
  },
};

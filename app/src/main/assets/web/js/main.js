import { settings } from './settings.js';
import { fonts } from './fonts.js';
import { library } from './library.js';
import { Shelf } from './shelf.js';
import { Reader } from './reader.js';
import { native, isNative } from './native.js';
import { toast, confirmDialog, plural, h } from './ui.js';

const app = {
  library,
  settings,
  async openBook(rec, coverEl) {
    if (this.opening) return;
    this.opening = true;
    const fly = coverEl ? flyCover(coverEl) : null;
    try {
      const book = await library.open(rec);
      await this.reader.open(rec, book);
      rec.lastOpened = Date.now();
      library.update(rec);
    } catch (e) {
      console.error(e);
      if (e.missing) {
        const ok = await confirmDialog({ title: 'Файл не найден', text: 'Похоже, книгу удалили или переместили. Убрать её с полки?', ok: 'Убрать', danger: true });
        if (ok) await library.remove(rec);
      } else if (e.denied && isNative) {
        this.askStorage();
      } else {
        toast('Не получилось открыть книгу: ' + (e.message || e), 4000);
      }
    } finally {
      if (fly) fly.finish();
      this.opening = false;
    }
  },

  onReaderClosed() {
    this.shelf.render();
  },

  async importFiles() {
    if (isNative) {
      const files = await native.pickBooks();
      if (!files || !files.length) return;
      const res = await library.addFiles(files, { force: true, onProgress: (i, n, name) => this.shelf.setBanner(`Добавляю ${i} из ${n}: ${name}`, i / n) });
      this.shelf.setBanner(null);
      this.reportAdded(res, files.length);
      if (res.added.length === 1 && files.length === 1) this.openBook(res.added[0]);
      return;
    }
    const inp = h('input', { type: 'file', multiple: true, accept: '.epub,.fb2,.zip,application/epub+zip' });
    inp.onchange = async () => {
      const list = [...inp.files];
      if (!list.length) return;
      const res = await library.addBlobs(list, { onProgress: (i, n, name) => this.shelf.setBanner(`Добавляю ${i} из ${n}: ${name}`, i / n) });
      this.shelf.setBanner(null);
      this.reportAdded(res, list.length);
    };
    inp.click();
  },

  reportAdded(res, total) {
    const a = res.added.length, f = res.failed.length;
    if (a && !f) toast(`Добавлено: ${a} ${plural(a, 'книга', 'книги', 'книг')}`);
    else if (a && f) toast(`Добавлено ${a}, не удалось открыть ${f}`);
    else if (f) toast('Не удалось открыть файл — это точно EPUB или FB2?', 3500);
    else if (total) toast('Эти книги уже на полке');
  },

  askStorage() {
    confirmDialog({
      title: 'Доступ к книгам',
      text: 'Чтобы найти все книги EPUB и FB2 на телефоне, «Полке» нужен доступ ко всем файлам. Откроются настройки — включи переключатель и вернись назад.',
      ok: 'Открыть настройки', cancel: 'Не сейчас',
    }).then(ok => {
      if (!ok) return;
      this.waitingPermission = true;
      native.requestStorageAccess();
    });
  },

  async scan(manual) {
    if (!isNative) return;
    if (!native.hasStorageAccess()) { if (manual) this.askStorage(); return; }
    if (this.scanning) return;
    this.scanning = true;
    if (manual) this.shelf.setBanner('Ищу книги на телефоне…');
    try {
      const res = await library.scan({ onProgress: (i, n, name) => this.shelf.setBanner(`Новые книги: добавляю ${i} из ${n}`, i / n) });
      this.shelf.setBanner(null);
      const a = res.added.length;
      if (a) toast(`На полку добавлено: ${a} ${plural(a, 'книга', 'книги', 'книг')}`);
      else if (manual) toast(res.found ? 'Новых книг не нашлось — всё уже на полке' : 'Книг EPUB и FB2 на телефоне не нашлось');
    } catch (e) {
      this.shelf.setBanner(null);
      if (manual) toast('Ошибка поиска: ' + e.message);
    } finally {
      this.scanning = false;
    }
  },

  async handleIncoming() {
    const f = native.takePendingOpen();
    if (!f) return;
    const res = await library.addFiles([f], { force: true });
    const rec = res.added[0] || library.byPath(f.path);
    if (rec) {
      if (!this.reader.hidden) this.reader.close();
      setTimeout(() => this.openBook(rec), 50);
    } else toast('Не получилось открыть файл — это точно EPUB или FB2?', 3500);
  },
};

function flyCover(el) {
  const r = el.getBoundingClientRect();
  if (!r.width) return null;
  const clone = el.cloneNode(true);
  clone.classList.add('fly');
  Object.assign(clone.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  document.body.appendChild(clone);
  const W = window.innerWidth, H = window.innerHeight;
  const sx = W / r.width, sy = H / r.height;
  const anim = clone.animate([
    { transform: 'translate(0,0) scale(1,1)', opacity: 1 },
    { transform: `translate(${-r.left}px,${-r.top}px) scale(${sx},${sy})`, opacity: 1, offset: 0.85 },
    { transform: `translate(${-r.left}px,${-r.top}px) scale(${sx},${sy})`, opacity: 0.9 },
  ], { duration: 420, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
  clone.style.transformOrigin = '0 0';
  return {
    finish() {
      const done = () => {
        clone.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).onfinish = () => clone.remove();
      };
      if (anim.playState === 'finished') done(); else anim.onfinish = done;
    },
  };
}

async function boot() {
  await fonts.init();
  await library.init();
  app.shelf = new Shelf(app);
  app.reader = new Reader(app);
  await app.shelf.render();
  document.body.classList.add('ready');

  native.on('open', () => app.handleIncoming());
  native.on('resume', () => {
    if (app.waitingPermission && native.hasStorageAccess()) {
      app.waitingPermission = false;
      app.scan(true);
    }
  });
  native.on('storage', st => { if (st === 'granted') { app.waitingPermission = false; app.scan(true); } });
  await app.handleIncoming();
  if (isNative && settings.get('autoScan') && native.hasStorageAccess()) setTimeout(() => app.scan(false), 600);
  window.__polka = app;
}

boot().catch(e => {
  console.error(e);
  document.body.innerHTML = `<div style="padding:24px;font:16px sans-serif;color:#fff">Ошибка запуска: ${e && e.message}</div>`;
});

// Деревянные полки в духе старого iBooks.
import { settings, SHELVES } from './settings.js';
import { library } from './library.js';
import { h, icon, esc, sheet, confirmDialog, toast, back, plural, hashStr } from './ui.js';
import { isNative, native } from './native.js';

const CLOTH = [
  ['#6d1f2a', '#e9c77b'], ['#1f3a5f', '#e6d3a3'], ['#2f4f3a', '#e8d9a8'], ['#5b3a1e', '#f0d9a6'],
  ['#4a2a4f', '#e8cfe0'], ['#1e4a4f', '#f1dfb0'], ['#3a3a3a', '#d9c08a'], ['#7a4a1c', '#f6e7c5'],
  ['#8a2f3c', '#f3e3c3'], ['#26324a', '#c9d6e8'],
];

export class Shelf {
  constructor(app) {
    this.app = app;
    this.query = '';
    this.root = h('div', { class: 'shelf-view' });
    this.searchInput = h('input', { type: 'search', placeholder: 'Название, автор или серия', class: 'search-input' });
    this.searchInput.addEventListener('input', () => { this.query = this.searchInput.value.trim(); this.render(); });
    this.searchBar = h('div', { class: 'search-bar' }, h('span', { html: icon('search') }), this.searchInput,
      h('button', { class: 'icon-btn sm', html: icon('close'), 'aria-label': 'Закрыть поиск', onclick: () => this.closeSearch() }));
    this.top = h('header', { class: 'shelf-top' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-t', text: 'Полка' }), this.countEl = h('span', { class: 'brand-c' })),
      h('button', { class: 'icon-btn', 'aria-label': 'Поиск', html: icon('search'), onclick: () => this.openSearch() }),
      h('button', { class: 'icon-btn', 'aria-label': 'Добавить книги', html: icon('plus'), onclick: () => this.app.importFiles() }),
      h('button', { class: 'icon-btn', 'aria-label': 'Меню', html: icon('more'), onclick: () => this.openMenu() }));
    this.banner = h('div', { class: 'banner' });
    this.list = h('div', { class: 'shelves' });
    this.scroller = h('div', { class: 'shelf-scroll' }, this.banner, this.list);
    this.root.append(this.top, this.searchBar, this.scroller);
    document.body.appendChild(this.root);
    window.addEventListener('resize', () => { clearTimeout(this._rt); this._rt = setTimeout(() => this.render(), 150); });
    library.on(() => this.render());
    settings.on(ch => { if ('shelfTheme' in ch || 'shelfView' in ch || 'sort' in ch) this.render(); });
  }

  applyTheme() {
    const sh = settings.shelf();
    this.root.dataset.shelf = sh.id;
    document.body.dataset.ui = sh.dark ? 'dark' : 'light';
    if (!this.app.reader || this.app.reader.hidden) native.setSystemBars(sh.id === 'dark' ? '#121214' : '#2A1B12', false, false);
  }

  openSearch() {
    this.root.classList.add('searching');
    setTimeout(() => this.searchInput.focus(), 50);
    this.searchToken = back.push(() => this.closeSearch(true));
  }

  closeSearch(fromBack) {
    this.root.classList.remove('searching');
    this.searchInput.value = '';
    this.query = '';
    this.searchInput.blur();
    if (this.searchToken && !fromBack) back.remove(this.searchToken);
    this.searchToken = null;
    this.render();
  }

  setBanner(text, progress) {
    if (!text) { this.banner.classList.remove('show'); return; }
    this.banner.classList.add('show');
    this.banner.innerHTML = `<div class="banner-t">${esc(text)}</div>` + (progress != null ? `<div class="banner-bar"><i style="width:${Math.round(progress * 100)}%"></i></div>` : '');
  }

  async render() {
    this.applyTheme();
    const books = library.sorted(settings.get('sort'), this.query);
    const n = library.books.length;
    this.countEl.textContent = n ? `${n} ${plural(n, 'книга', 'книги', 'книг')}` : '';
    const view = settings.get('shelfView');
    this.root.classList.toggle('as-list', view === 'list');
    const token = (this._renderToken = (this._renderToken || 0) + 1);
    if (!n) { this.list.replaceChildren(this.emptyState()); return; }
    if (!books.length) { this.list.replaceChildren(h('div', { class: 'nothing', text: 'Ничего не нашлось' })); return; }
    const nodes = view === 'list' ? this.renderList(books) : this.renderShelves(books);
    if (token !== this._renderToken) return;
    this.list.replaceChildren(...nodes);
    // обложки подгружаем следом
    for (const el of this.list.querySelectorAll('[data-cover]')) {
      const rec = library.books.find(b => b.id === el.dataset.cover);
      if (!rec) continue;
      library.coverUrl(rec).then(url => {
        if (!url || token !== this._renderToken) return;
        const img = new Image();
        img.className = 'cover-img';
        img.alt = '';
        img.onload = () => { el.classList.add('has-img'); el.prepend(img); };
        img.src = url;
      });
    }
  }

  perRow() {
    const W = this.root.clientWidth || window.innerWidth;
    return Math.max(3, Math.min(9, Math.floor((W - 16) / 118)));
  }

  renderShelves(books) {
    const per = this.perRow();
    const rows = [];
    const H = this.scroller.clientHeight || window.innerHeight;
    const W = this.root.clientWidth || window.innerWidth;
    const slot = (W - 28 - (per - 1) * 14) / per;
    const rowH = Math.round(slot * 1.5 + 34);
    this.root.style.setProperty('--slot', slot + 'px');
    this.root.style.setProperty('--row-h', rowH + 'px');
    const minRows = Math.ceil((H - 20) / (rowH + 24));
    const count = Math.max(minRows, Math.ceil(books.length / per));
    for (let r = 0; r < count; r++) {
      const items = books.slice(r * per, r * per + per).map(b => this.bookEl(b));
      rows.push(h('div', { class: 'shelf-row' }, h('div', { class: 'shelf-books' }, ...items), h('div', { class: 'plank' })));
    }
    return rows;
  }

  coverBox(b, cls = 'cover') {
    const [bg, fg] = CLOTH[parseInt(hashStr(b.title + (b.authors || []).join()), 36) % CLOTH.length];
    const author = (b.authors || []).join(', ');
    const gen = h('div', { class: 'gen-cover', style: { background: bg, color: fg } },
      h('div', { class: 'gen-line' }),
      h('div', { class: 'gen-title', text: b.title }),
      author ? h('div', { class: 'gen-author', text: author }) : null,
      h('div', { class: 'gen-line bottom' }));
    const box = h('div', { class: cls, 'data-cover': b.hasCover ? b.id : null }, gen);
    return box;
  }

  bookEl(b) {
    const box = this.coverBox(b);
    const el = h('div', { class: 'book', 'data-id': b.id }, box);
    if (!b.lastOpened && !b.finished) box.appendChild(h('div', { class: 'ribbon', text: 'новая' }));
    if (b.finished) box.appendChild(h('div', { class: 'done-badge', html: icon('check') }));
    else if (b.progress > 0.005) box.appendChild(h('div', { class: 'prog' }, h('i', { style: { width: Math.round(b.progress * 100) + '%' } })));
    this.bindPress(el, b);
    return el;
  }

  renderList(books) {
    return books.map(b => {
      const box = this.coverBox(b, 'cover mini');
      const pct = Math.round((b.progress || 0) * 100);
      const meta = [(b.authors || []).join(', '), b.series ? `${b.series}${b.seriesIndex ? ' #' + b.seriesIndex : ''}` : ''].filter(Boolean).join(' · ');
      const el = h('div', { class: 'list-item', 'data-id': b.id }, box,
        h('div', { class: 'li-text' },
          h('div', { class: 'li-title', text: b.title }),
          meta ? h('div', { class: 'li-meta', text: meta }) : null,
          h('div', { class: 'li-prog' }, h('div', { class: 'li-bar' }, h('i', { style: { width: pct + '%' } })),
            h('span', { text: b.finished ? 'прочитана' : !b.lastOpened ? 'новая' : pct + '%' }))));
      this.bindPress(el, b);
      return el;
    });
  }

  bindPress(el, b) {
    let timer = 0, long = false, start = null;
    el.addEventListener('pointerdown', e => {
      long = false;
      start = [e.clientX, e.clientY];
      el.classList.add('pressed');
      timer = setTimeout(() => { long = true; el.classList.remove('pressed'); if (navigator.vibrate) navigator.vibrate(12); this.bookMenu(b); }, 520);
    });
    const cancel = () => { clearTimeout(timer); el.classList.remove('pressed'); };
    el.addEventListener('pointermove', e => { if (start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 10) cancel(); });
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointerup', () => { cancel(); });
    el.addEventListener('click', () => { if (!long) this.app.openBook(b, el.querySelector('.cover')); });
    el.addEventListener('contextmenu', e => { e.preventDefault(); });
  }

  emptyState() {
    return h('div', { class: 'empty' },
      h('div', { class: 'empty-art', html: icon('book') }),
      h('div', { class: 'empty-t', text: 'Полка пока пустая' }),
      h('div', { class: 'empty-s', text: isNative ? 'Найду все книги EPUB и FB2 в памяти телефона или добавь файлы вручную.' : 'Добавь книги EPUB или FB2.' }),
      isNative ? h('button', { class: 'btn primary', html: icon('scan') + '<span>Найти книги на телефоне</span>', onclick: () => this.app.scan(true) }) : null,
      h('button', { class: 'btn ghost', html: icon('file') + '<span>Выбрать файлы</span>', onclick: () => this.app.importFiles() }));
  }

  async bookMenu(b) {
    const url = await library.coverUrl(b);
    const box = this.coverBox(b, 'cover menu-cover');
    if (url) { box.classList.add('has-img'); box.prepend(h('img', { class: 'cover-img', src: url, alt: '' })); }
    const author = (b.authors || []).join(', ');
    const series = b.series ? `${b.series}${b.seriesIndex ? ', книга ' + b.seriesIndex : ''}` : '';
    const size = b.size ? (b.size > 1048576 ? (b.size / 1048576).toFixed(1) + ' МБ' : Math.round(b.size / 1024) + ' КБ') : '';
    const content = h('div', { class: 'book-menu' },
      h('div', { class: 'bm-head' }, box,
        h('div', { class: 'bm-info' },
          h('div', { class: 'bm-title', text: b.title }),
          author ? h('div', { class: 'bm-author', text: author }) : null,
          series ? h('div', { class: 'bm-series', text: series }) : null,
          h('div', { class: 'bm-file', text: [b.format ? b.format.toUpperCase() : '', size, b.progress ? Math.round(b.progress * 100) + '% прочитано' : ''].filter(Boolean).join(' · ') }))),
      b.annotation ? h('div', { class: 'bm-annot', text: b.annotation }) : null,
      h('div', { class: 'bm-actions' },
        h('button', { class: 'btn primary', html: icon('book') + '<span>' + (b.lastOpened ? 'Продолжить' : 'Читать') + '</span>', onclick: () => { sh.close(); this.app.openBook(b); } }),
        h('button', { class: 'btn ghost', html: icon('check') + '<span>' + (b.finished ? 'Снять отметку «прочитана»' : 'Отметить прочитанной') + '</span>', onclick: async () => {
          b.finished = !b.finished;
          if (b.finished) b.progress = 1;
          await library.update(b);
          sh.close();
          this.render();
        } }),
        h('button', { class: 'btn ghost danger-text', html: icon('trash') + '<span>Убрать с полки</span>', onclick: async () => {
          const own = b.source === 'blob' || (b.path && /\/files\/books\//.test(b.path));
          const ok = await confirmDialog({ title: 'Убрать книгу с полки?', text: own ? 'Копия файла в приложении будет удалена.' : 'Сам файл останется в памяти телефона, просто исчезнет с полки.', ok: 'Убрать', danger: true });
          if (!ok) return;
          sh.close();
          await library.remove(b);
          toast('Книга убрана');
        } })),
      b.path ? h('div', { class: 'bm-path', text: b.path }) : null);
    const sh = sheet({ content, cls: 'book-sheet' });
  }

  openMenu() {
    const seg = (key, opts) => {
      const w = h('div', { class: 'seg' });
      const r = () => w.replaceChildren(...opts.map(([v, t]) => h('button', { class: 'seg-b' + (settings.get(key) === v ? ' on' : ''), text: t, onclick: () => { settings.set({ [key]: v }); r(); } })));
      r();
      return w;
    };
    const auto = h('button', { class: 'switch' + (settings.get('autoScan') ? ' on' : '') });
    const content = h('div', { class: 'panel shelf-menu' },
      h('div', { class: 'menu-actions' },
        isNative ? h('button', { class: 'menu-btn', html: icon('scan') + '<span>Найти книги на телефоне</span>', onclick: () => { sh.close(); this.app.scan(true); } }) : null,
        h('button', { class: 'menu-btn', html: icon('file') + '<span>Добавить файлы</span>', onclick: () => { sh.close(); this.app.importFiles(); } })),
      h('div', { class: 'p-sec' },
        h('div', { class: 'p-h', text: 'Вид' }), seg('shelfView', [['shelf', 'Полки'], ['list', 'Список']]),
        h('div', { class: 'p-h', text: 'Полки' }),
        h('div', { class: 'shelf-swatches' }, ...SHELVES.map(s => h('button', {
          class: 'shelf-sw sw-' + s.id + (settings.get('shelfTheme') === s.id ? ' on' : ''),
          onclick: e => { settings.set({ shelfTheme: s.id }); content.querySelectorAll('.shelf-sw').forEach(x => x.classList.remove('on')); e.currentTarget.classList.add('on'); },
        }, h('span', { text: s.name })))),
        h('div', { class: 'p-h', text: 'Сортировка' }), seg('sort', [['recent', 'Недавние'], ['title', 'Название'], ['author', 'Автор'], ['added', 'Новые']])),
      isNative ? h('div', { class: 'p-sec' },
        h('div', { class: 'p-toggle', onclick: () => { settings.set({ autoScan: !settings.get('autoScan') }); auto.classList.toggle('on', settings.get('autoScan')); } },
          h('div', { class: 'p-tt' }, h('div', { text: 'Искать новые книги при запуске' }), h('div', { class: 'p-hint', text: 'Книги, скачанные в Telegram или браузере, сами появятся на полке' })), auto),
        library.ignored && library.ignored.size ? h('button', { class: 'btn ghost small', text: `Вернуть убранные книги (${library.ignored.size})`, onclick: async () => { await library.forgetIgnored(); sh.close(); this.app.scan(true); } }) : null) : null,
      h('div', { class: 'about', text: `Полка ${native.version()} · EPUB, FB2, FB2.ZIP` }));
    const sh = sheet({ title: 'Настройки полки', content, cls: 'menu-sheet' });
  }
}

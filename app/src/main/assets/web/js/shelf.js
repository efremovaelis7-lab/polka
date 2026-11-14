// Деревянные полки в духе старого iBooks.
import { settings, SHELVES } from './settings.js';
import { library } from './library.js';
import { h, icon, esc, sheet, confirmDialog, toast, back, plural, hashStr } from './ui.js';
import { isNative, native } from './native.js';
import { statusOf } from './tracker.js';
import { openTracker } from './tracker-ui.js';
import { db } from './db.js';
import { quoteText } from './annotations.js';

export const TABS = [['all', 'Все'], ['reading', 'Читаю'], ['want', 'Хочу прочесть'], ['done', 'Прочитано'], ['quotes', 'Цитаты']];

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
      h('button', { class: 'icon-btn', 'aria-label': 'Трекер чтения', html: icon('target'), onclick: () => openTracker(this.app) }),
      h('button', { class: 'icon-btn', 'aria-label': 'Поиск', html: icon('search'), onclick: () => this.openSearch() }),
      h('button', { class: 'icon-btn', 'aria-label': 'Добавить книги', html: icon('plus'), onclick: () => this.app.importFiles() }),
      h('button', { class: 'icon-btn', 'aria-label': 'Меню', html: icon('more'), onclick: () => this.openMenu() }));
    this.tabs = h('div', { class: 'shelf-tabs' });
    this.banner = h('div', { class: 'banner' });
    this.list = h('div', { class: 'shelves' });
    this.scroller = h('div', { class: 'shelf-scroll' }, this.banner, this.list);
    this.root.append(this.top, this.searchBar, this.tabs, this.scroller);
    document.body.appendChild(this.root);
    window.addEventListener('resize', () => { clearTimeout(this._rt); this._rt = setTimeout(() => this.render(), 150); });
    library.on(() => this.render());
    settings.on(ch => { if ('shelfTheme' in ch || 'shelfView' in ch || 'sort' in ch || 'shelfTab' in ch) this.render(); });
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
    const tab = settings.get('shelfTab') || 'all';
    try { this.quoteCount = ((await db.allNotes()) || []).filter(x => x.type === 'hl').length; } catch (e) { this.quoteCount = 0; }
    const books = library.sorted(settings.get('sort'), this.query, tab);
    const n = library.books.length;
    this.renderTabs(tab);
    this.root.classList.toggle('as-quotes', tab === 'quotes');
    if (tab === 'quotes') { await this.renderQuotes(); return; }
    this.countEl.textContent = n ? `${n} ${plural(n, 'книга', 'книги', 'книг')}` : '';
    const view = settings.get('shelfView');
    this.root.classList.toggle('as-list', view === 'list');
    const token = (this._renderToken = (this._renderToken || 0) + 1);
    if (!n) { this.list.replaceChildren(this.emptyState()); return; }
    if (!books.length) {
      const msg = this.query ? 'Ничего не нашлось' : {
        reading: 'Сейчас ничего не читается. Открой любую книгу — она появится здесь.',
        want: 'Сюда попадают книги с отметкой «Хочу прочесть». Задержи палец на обложке и выбери эту отметку.',
        done: 'Прочитанные книги появятся здесь, когда дочитаешь до конца или отметишь вручную.',
      }[tab] || 'Ничего не нашлось';
      this.list.replaceChildren(h('div', { class: 'nothing', text: msg }));
      return;
    }
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

  renderTabs(tab) {
    this.tabs.replaceChildren(...TABS.map(([k, t]) => {
      const c = k === 'quotes' ? this.quoteCount : library.count(k);
      return h('button', { class: 'tab' + (tab === k ? ' on' : ''), onclick: () => settings.set({ shelfTab: k }) },
        h('span', { text: t }), c ? h('span', { class: 'tab-c', text: c }) : null);
    }));
    const on = this.tabs.querySelector('.tab.on');
    if (on && (on.offsetLeft + on.offsetWidth > this.tabs.scrollLeft + this.tabs.clientWidth || on.offsetLeft < this.tabs.scrollLeft)) {
      this.tabs.scrollLeft = on.offsetLeft - 12;
    }
  }

  async renderQuotes() {
    const token = (this._renderToken = (this._renderToken || 0) + 1);
    let all = ((await db.allNotes()) || []).filter(x => x.type === 'hl');
    if (token !== this._renderToken) return;
    const q = (this.query || '').toLowerCase();
    const recOf = id => library.books.find(b => b.id === id);
    if (q) all = all.filter(n => (n.text + ' ' + (n.note || '') + ' ' + ((recOf(n.book) || {}).title || '')).toLowerCase().includes(q));
    if (!all.length) {
      this.list.replaceChildren(h('div', { class: 'nothing', text: q ? 'Ничего не нашлось' : 'Здесь соберутся цитаты из всех книг. Во время чтения задержи палец на тексте, выдели нужный кусок и выбери цвет маркера.' }));
      return;
    }
    const groups = new Map();
    for (const n of all.sort((a, b) => b.created - a.created)) {
      if (!groups.has(n.book)) groups.set(n.book, []);
      groups.get(n.book).push(n);
    }
    const out = [];
    for (const [bookId, notes] of groups) {
      const rec = recOf(bookId);
      const meta = rec ? { title: rec.title, authors: rec.authors || [] } : { title: 'Книга убрана с полки', authors: [] };
      notes.sort((a, b) => a.ch - b.ch || a.s.i - b.s.i || a.s.off - b.s.off);
      const cover = rec ? this.coverBox(rec, 'cover mini') : null;
      out.push(h('div', { class: 'qgroup' },
        h('div', { class: 'qg-head' }, cover,
          h('div', { class: 'qg-t' }, h('div', { class: 'qg-title', text: meta.title }),
            h('div', { class: 'qg-sub', text: [(meta.authors || []).join(', '), `${notes.length} ${plural(notes.length, 'цитата', 'цитаты', 'цитат')}`].filter(Boolean).join(' · ') })),
          h('button', { class: 'icon-btn sm', 'aria-label': 'Поделиться цитатами книги', html: icon('share'), onclick: () => {
            const text = `${meta.title}${meta.authors.length ? ' — ' + meta.authors.join(', ') : ''}\n\n` + notes.map(n => `«${n.text}»` + (n.note ? `\n✎ ${n.note}` : '')).join('\n\n');
            native.shareText(text);
          } })),
        ...notes.map(n => h('div', { class: 'qcard' },
          h('button', { class: 'qc-main', onclick: () => { if (rec) this.app.openBook(rec, null, { ch: n.ch, i: n.s.i }); } },
            h('div', { class: 'qc-quote qb-' + (n.color || 'yellow'), text: n.text }),
            n.note ? h('div', { class: 'qc-note', text: n.note }) : null,
            h('div', { class: 'qc-date', text: new Date(n.created).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) })),
          h('div', { class: 'qc-acts' },
            h('button', { class: 'icon-btn sm', 'aria-label': 'Копировать', html: icon('copy'), onclick: async () => {
              await native.copyText(quoteText(n.text, meta) + (n.note ? `\n\nМоя заметка: ${n.note}` : ''));
              toast('Скопировано', 1300);
            } }),
            h('button', { class: 'icon-btn sm', 'aria-label': 'Удалить', html: icon('trash'), onclick: async () => {
              if (await confirmDialog({ title: 'Удалить цитату?', ok: 'Удалить', danger: true })) { await db.delNote(n.id); this.render(); }
            } }))))));
      if (cover && rec.hasCover) library.coverUrl(rec).then(u => { if (u) { cover.classList.add('has-img'); cover.prepend(h('img', { class: 'cover-img', src: u, alt: '' })); } });
    }
    if (token !== this._renderToken) return;
    this.list.replaceChildren(...out);
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
    const st = statusOf(b);
    if (st === 'new') box.appendChild(h('div', { class: 'ribbon', text: 'новая' }));
    else if (st === 'want') box.appendChild(h('div', { class: 'ribbon want', text: 'хочу' }));
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
            h('span', { text: { done: 'прочитана', new: 'новая', want: 'хочу прочесть' }[statusOf(b)] || pct + '%' }))));
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
    const statusSeg = h('div', { class: 'seg status-seg' });
    const renderStatus = () => statusSeg.replaceChildren(...[['reading', 'Читаю'], ['want', 'Хочу прочесть'], ['done', 'Прочитано']].map(([k, t]) =>
      h('button', { class: 'seg-b' + (statusOf(b) === k ? ' on' : ''), text: t, onclick: async () => {
        await library.setStatus(b, statusOf(b) === k ? (b.lastOpened ? 'reading' : null) : k);
        if (k === 'done' && b.status === 'done') b.progress = Math.max(b.progress || 0, 1);
        renderStatus();
        toast({ reading: 'Отмечено: читаю', want: 'Добавлено в «Хочу прочесть»', done: 'Отмечено как прочитанное' }[b.status] || 'Отметка снята', 1500);
      } })));
    renderStatus();
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
        statusSeg,
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
        h('button', { class: 'menu-btn', html: icon('file') + '<span>Добавить файлы</span>', onclick: () => { sh.close(); this.app.importFiles(); } }),
        h('button', { class: 'menu-btn', html: icon('target') + '<span>Трекер чтения и цели</span>', onclick: () => { sh.close(); openTracker(this.app); } })),
      h('div', { class: 'p-sec' },
        h('div', { class: 'p-h', text: 'Подборки' }),
        h('div', { class: 'collections' }, ...TABS.map(([k, t]) => h('button', {
          class: 'coll' + ((settings.get('shelfTab') || 'all') === k ? ' on' : ''),
          onclick: () => { settings.set({ shelfTab: k }); sh.close(); },
        }, h('span', { text: t }), h('span', { class: 'coll-c', text: k === 'quotes' ? (this.quoteCount || 0) : library.count(k) }))))),
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

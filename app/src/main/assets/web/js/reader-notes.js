// Выделения, заметки и закладки внутри читалки.
import { h, icon, sheet, toast, confirmDialog, debounce, esc, plural } from './ui.js';
import { db } from './db.js';
import { native } from './native.js';
import { COLORS, newId, toAnchor, applyHighlights, removeMarks, updateMarks, quoteText, rangeText } from './annotations.js';

function btn(ic, label, fn, cls = '') {
  return h('button', { class: 'sb-btn ' + cls, onclick: fn }, h('span', { html: icon(ic) }), h('span', { class: 'sb-l', text: label }));
}

export function installNotes(Reader) {
  const P = Reader.prototype;

  P.initNotes = function () {
    this.notes = [];
    this.lastColor = localStorage.getItem('polka.hlColor') || 'yellow';
    const dots = COLORS.map(([c, name]) => h('button', { class: 'sb-dot hl-' + c, 'aria-label': name, onclick: () => this.highlight(c) }));
    this.selBar = h('div', { class: 'sel-bar' },
      h('div', { class: 'sb-dots' }, ...dots),
      h('div', { class: 'sb-row' },
        btn('notes', 'Заметка', () => this.highlight(this.lastColor, true)),
        btn('copy', 'Копировать', () => this.selCopy()),
        btn('share', 'Поделиться', () => this.selShare())));
    // не даём кнопкам сбросить выделение (мышь)
    this.selBar.addEventListener('mousedown', e => e.preventDefault());
    this.root.appendChild(this.selBar);
    this.ribbon = h('div', { class: 'rd-ribbon' });
    this.root.appendChild(this.ribbon);
    document.addEventListener('selectionchange', debounce(() => this.onSelection(), 120));
  };

  // ------------------------------------------------------------ выделение текста

  P.liveRoot = function () {
    return this.mode === 'scroll' ? this.scrollContent : this.front.content;
  };

  P.readSelection = function () {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !this.book) return null;
    const r = sel.getRangeAt(0);
    const root = this.liveRoot();
    if (!root.contains(r.commonAncestorContainer)) return null;
    const text = rangeText(r);
    if (!text) return null;
    const a = toAnchor(root, r.startContainer, r.startOffset);
    const b = toAnchor(root, r.endContainer, r.endOffset);
    if (!a || !b) return null;
    return { root, a, b, text, rect: r.getBoundingClientRect(), ch: this.ch };
  };

  P.hasSelection = function () { return !!this.readSelection(); };

  P.onSelection = function () {
    if (this.hidden) return;
    const s = this.readSelection();
    if (s) {
      clearTimeout(this._selHide);
      this.selInfo = s;
      this.selBar.classList.toggle('top', s.rect.bottom > this.H * 0.6);
      this.selBar.classList.add('show');
      this.root.classList.add('selecting');
    } else if (this.selInfo) {
      clearTimeout(this._selHide);
      this._selHide = setTimeout(() => { if (!this.readSelection()) this.hideSelBar(); }, 350);
    }
  };

  P.hideSelBar = function () {
    this.selBar.classList.remove('show');
    this.root.classList.remove('selecting');
    this.selInfo = null;
  };

  P.clearSelection = function () {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) sel.removeAllRanges();
    this.hideSelBar();
  };

  P.highlight = async function (color, withNote = false) {
    const s = this.readSelection() || this.selInfo;
    if (!s) return;
    const n = { id: newId(), book: this.rec.id, type: 'hl', ch: s.ch, s: s.a, e: s.b, text: s.text.slice(0, 4000), color, note: '', created: Date.now() };
    this.clearSelection();
    this.lastColor = color;
    localStorage.setItem('polka.hlColor', color);
    this.notes.push(n);
    await db.putNote(n);
    if (s.ch === this.ch) applyHighlights(s.root, [n]);
    this.invalidateChapter(n.ch);
    if (withNote) this.editNote(n);
  };

  P.selCopy = async function () {
    const s = this.readSelection() || this.selInfo;
    if (!s) return;
    this.clearSelection();
    await native.copyText(quoteText(s.text, this.book.meta));
    toast('Цитата скопирована', 1600);
  };

  P.selShare = async function () {
    const s = this.readSelection() || this.selInfo;
    if (!s) return;
    this.clearSelection();
    await native.shareText(quoteText(s.text, this.book.meta));
  };

  /** Глава изменилась (новое выделение) — остальные копии перерисуются в фоне. */
  P.invalidateChapter = function (ch) {
    this.tpls.delete(ch);
    for (const s of this.sheets) {
      if (s.ch !== ch) continue;
      if (this.mode === 'pages' && s === this.front) continue;
      s.ver = -1;
    }
    this.preload();
  };

  P.refreshMarks = function (n) {
    if (n.ch === this.ch) updateMarks(this.liveRoot(), n);
    this.invalidateChapter(n.ch);
  };

  P.recolor = async function (n, c) {
    n.color = c;
    n.updated = Date.now();
    this.lastColor = c;
    localStorage.setItem('polka.hlColor', c);
    await db.putNote(n);
    this.refreshMarks(n);
  };

  P.deleteNote = async function (n) {
    this.notes = this.notes.filter(x => x.id !== n.id);
    await db.delNote(n.id);
    if (n.type === 'hl') {
      if (n.ch === this.ch) removeMarks(this.liveRoot(), n.id);
      this.invalidateChapter(n.ch);
    }
    this.updateRibbon();
  };

  // ------------------------------------------------------------ карточка выделения

  P.openNote = function (id) {
    const n = this.notes.find(x => x.id === id);
    if (!n) return;
    const content = h('div', { class: 'an' });
    let sh;
    const render = () => {
      content.replaceChildren(...[
        h('blockquote', { class: 'an-quote qb-' + n.color, text: n.text }),
        n.note ? h('div', { class: 'an-note', text: n.note }) : null,
        h('div', { class: 'an-colors' }, ...COLORS.map(([c, name]) => h('button', {
          class: 'sb-dot hl-' + c + (n.color === c ? ' on' : ''), 'aria-label': name,
          onclick: () => this.recolor(n, c).then(render),
        }))),
        h('div', { class: 'an-actions' },
          btn('notes', n.note ? 'Изменить заметку' : 'Добавить заметку', () => { sh.close(); this.editNote(n); }),
          btn('copy', 'Копировать', async () => {
            await native.copyText(quoteText(n.text, this.book.meta) + (n.note ? `\n\nМоя заметка: ${n.note}` : ''));
            toast('Скопировано', 1400);
          }),
          btn('share', 'Поделиться', () => native.shareText(quoteText(n.text, this.book.meta) + (n.note ? `\n\nМоя заметка: ${n.note}` : ''))),
          btn('trash', 'Удалить', async () => { sh.close(); await this.deleteNote(n); toast('Выделение удалено', 1400); }, 'danger'))].filter(Boolean));
    };
    render();
    sh = sheet({ title: 'Цитата', content, cls: 'an-sheet' });
  };

  P.editNote = function (n) {
    const ta = h('textarea', { class: 'an-text', placeholder: 'Что ты об этом думаешь?', rows: 5 });
    ta.value = n.note || '';
    let sh;
    const save = async () => {
      n.note = ta.value.trim();
      n.updated = Date.now();
      await db.putNote(n);
      this.refreshMarks(n);
      sh.close();
      toast(n.note ? 'Заметка сохранена' : 'Заметка очищена', 1400);
    };
    const content = h('div', { class: 'an' },
      h('blockquote', { class: 'an-quote qb-' + n.color, text: n.text }),
      ta,
      h('div', { class: 'dialog-btns' },
        h('button', { class: 'btn ghost', text: 'Отмена', onclick: () => sh.close() }),
        h('button', { class: 'btn primary', text: 'Сохранить', onclick: save })));
    sh = sheet({ title: 'Заметка', content, cls: 'an-sheet' });
    setTimeout(() => ta.focus(), 380);
  };

  // ------------------------------------------------------------ закладки

  P.visibleBlocks = function () {
    if (this.mode === 'scroll') {
      const el = this.scrollEl;
      const bl = [...this.scrollContent.querySelectorAll('[data-i]')];
      const top = el.scrollTop, bottom = top + el.clientHeight;
      const vis = bl.filter(b => b.offsetTop + b.offsetHeight > top && b.offsetTop < bottom);
      return vis.length ? [+vis[0].dataset.i, +vis[vis.length - 1].dataset.i + 1] : [0, 0];
    }
    const s = this.front;
    const a0 = s.anchorAt(this.page);
    const next = this.page + this.step;
    const a1 = next < s.pages ? s.anchorAt(next) : Infinity;
    return [a0, Math.max(a1, a0 + 1)];
  };

  P.bookmarksHere = function () {
    if (!this.book) return [];
    const [a0, a1] = this.visibleBlocks();
    return this.notes.filter(n => n.type === 'bm' && n.ch === this.ch && n.s.i >= a0 && n.s.i < a1);
  };

  P.updateRibbon = function () {
    const on = this.bookmarksHere().length > 0;
    this.root.classList.toggle('bookmarked', on);
    if (this.bmBtn) this.bmBtn.innerHTML = icon(on ? 'bookmarkOn' : 'bookmark');
  };

  P.toggleBookmark = async function () {
    const here = this.bookmarksHere();
    if (here.length) {
      for (const b of here) await this.deleteNote(b);
      toast('Закладка убрана', 1300);
    } else {
      const [a0] = this.visibleBlocks();
      const root = this.liveRoot();
      const el = root.querySelector(`[data-i="${a0}"]`);
      const text = el ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
      const n = { id: newId(), book: this.rec.id, type: 'bm', ch: this.ch, s: { i: a0, off: 0 }, e: { i: a0, off: 0 }, text, created: Date.now() };
      this.notes.push(n);
      await db.putNote(n);
      toast('Закладка добавлена', 1300);
    }
    this.updateRibbon();
  };

  // ------------------------------------------------------------ список заметок

  P.openNotesList = function (tab = 'hl') {
    const tabs = h('div', { class: 'seg nl-tabs' });
    const list = h('div', { class: 'nl-list' });
    const exportBtn = h('button', { class: 'btn ghost small nl-export', html: icon('share') + '<span>Поделиться всеми цитатами</span>', onclick: () => this.exportNotes() });
    let sh;
    const sorted = type => this.notes.filter(n => n.type === type).sort((a, b) => a.ch - b.ch || a.s.i - b.s.i || a.s.off - b.s.off);
    const render = () => {
      const hl = sorted('hl').length, bm = sorted('bm').length;
      tabs.replaceChildren(
        h('button', { class: 'seg-b' + (tab === 'hl' ? ' on' : ''), text: `Цитаты · ${hl}`, onclick: () => { tab = 'hl'; render(); } }),
        h('button', { class: 'seg-b' + (tab === 'bm' ? ' on' : ''), text: `Закладки · ${bm}`, onclick: () => { tab = 'bm'; render(); } }));
      const items = sorted(tab);
      exportBtn.style.display = tab === 'hl' && items.length ? '' : 'none';
      if (!items.length) {
        list.replaceChildren(h('div', { class: 'nl-empty' },
          h('div', { html: icon(tab === 'hl' ? 'quote' : 'bookmark') }),
          h('div', { text: tab === 'hl' ? 'Задержи палец на слове, выдели нужный кусок и выбери цвет маркера — цитата сохранится здесь. К любой цитате можно написать заметку.' : 'Нажми на значок закладки сверху или коснись правого верхнего угла страницы.' })));
      } else list.replaceChildren(...items.map(n => this.noteItem(n, () => sh.close(), render)));
    };
    render();
    sh = sheet({ title: 'Заметки', content: h('div', { class: 'nl' }, tabs, list, exportBtn), cls: 'nl-sheet', full: true });
  };

  P.noteItem = function (n, close, rerender) {
    const ch = this.book.chapters[n.ch];
    const where = [ch && ch.title, Math.round(this.cum[n.ch] / this.total * 100) + '%'].filter(Boolean).join(' · ');
    const date = new Date(n.created).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return h('div', { class: 'nl-item' },
      h('button', { class: 'nl-main', onclick: () => { close(); this.hideChrome(); this.goTo({ ch: n.ch, i: n.s.i }); } },
        h('div', { class: 'nl-where', text: `${where} · ${date}` }),
        h('div', { class: 'nl-quote' + (n.type === 'hl' ? ' qb-' + n.color : ' bm'), text: n.text || '…' }),
        n.note ? h('div', { class: 'nl-note', text: n.note }) : null),
      h('div', { class: 'nl-acts' },
        n.type === 'hl' ? h('button', { class: 'icon-btn sm', 'aria-label': 'Копировать', html: icon('copy'), onclick: async () => {
          await native.copyText(quoteText(n.text, this.book.meta) + (n.note ? `\n\nМоя заметка: ${n.note}` : ''));
          toast('Скопировано', 1300);
        } }) : null,
        h('button', { class: 'icon-btn sm', 'aria-label': 'Удалить', html: icon('trash'), onclick: async () => {
          if (await confirmDialog({ title: n.type === 'hl' ? 'Удалить цитату?' : 'Удалить закладку?', ok: 'Удалить', danger: true })) {
            await this.deleteNote(n);
            rerender();
          }
        } })));
  };

  P.exportNotes = async function () {
    const items = this.notes.filter(n => n.type === 'hl').sort((a, b) => a.ch - b.ch || a.s.i - b.s.i || a.s.off - b.s.off);
    if (!items.length) return;
    const m = this.book.meta;
    const head = `${m.title || ''}${m.authors && m.authors.length ? ' — ' + m.authors.join(', ') : ''}\n${items.length} ${plural(items.length, 'цитата', 'цитаты', 'цитат')}\n\n`;
    const body = items.map(n => `«${n.text}»` + (n.note ? `\n✎ ${n.note}` : '')).join('\n\n');
    await native.shareText(head + body);
  };
}

export function escHtml(s) { return esc(s); }

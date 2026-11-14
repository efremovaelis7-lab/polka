// Движок чтения: колонки CSS как страницы, листы-копии главы для анимации,
// загиб страницы / сдвиг / затухание, разворот на две страницы, режим прокрутки.
import { settings, mix } from './settings.js';
import { fonts } from './fonts.js';
import { bionicify } from './bionic.js';
import { Curl, arcPoint } from './curl.js';
import { h, icon, back, sheet, toast, debounce } from './ui.js';
import { native } from './native.js';
import { openSettingsPanel } from './panel.js';
import { cssEsc } from './epub.js';
import { db } from './db.js';
import { tracker, statusOf } from './tracker.js';
import { applyHighlights } from './annotations.js';
import { installNotes } from './reader-notes.js';

const BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,dt,dd,pre,table,.imgp,.empty-line,figure,hr';
const LAYOUT_KEYS = ['font', 'fontSize', 'lineHeight', 'margin', 'align', 'hyphens', 'indent', 'paraSpace', 'weight', 'bionicWeight', 'spread', 'mode', 'letterSpacing', 'wordSpacing'];
const RENDER_KEYS = ['bionic', 'bionicStrength'];

function waitImages(root) {
  const imgs = [...root.querySelectorAll('img')].filter(i => !i.complete);
  if (!imgs.length) return Promise.resolve();
  return Promise.race([
    Promise.all(imgs.map(i => new Promise(r => { i.onload = i.onerror = r; }))),
    new Promise(r => setTimeout(r, 1500)),
  ]);
}

const idle = fn => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 120));

class Sheet {
  constructor(r, paper = false) {
    this.r = r;
    this.sw = h('div', { class: 'sw' });
    this.sc = h('div', { class: 'sc' });
    this.si = h('div', { class: 'si' });
    this.el = h('div', { class: 'pg' + (paper ? ' paper' : '') });
    this.content = h('div', { class: 'rd-content' });
    this.footL = h('div', { class: 'foot foot-l' });
    this.footR = h('div', { class: 'foot foot-r' });
    this.el.append(h('div', { class: 'pg-grain' }), this.content, h('div', { class: 'pg-gutter' }), this.footL, this.footR);
    this.shade = h('div', { class: 'shade' });
    this.si.append(this.el, this.shade);
    this.sc.append(this.si);
    this.sw.append(this.sc);
    this.ch = -1; this.ver = -1; this.page = 0; this.pages = 1; this.blocks = null;
  }

  load(ch) {
    const r = this.r;
    if (this.ch === ch && this.ver === r.ver && !this.loading) return Promise.resolve();
    if (this.loading && this.loadingKey === ch + ':' + r.ver) return this.loading;
    this.loadingKey = ch + ':' + r.ver;
    this.loading = this._load(ch).finally(() => { this.loading = null; });
    return this.loading;
  }

  async _load(ch) {
    const r = this.r;
    const tpl = await r.template(ch);
    this.content.replaceChildren(tpl.cloneNode(true));
    this.ch = ch; this.ver = r.ver; this.blocks = null;
    await waitImages(this.content);
    this.measure();
  }

  measure() {
    const end = this.content.querySelector('.rd-end');
    const pw = this.r.pageW;
    this.pages = end ? Math.max(1, Math.floor((end.offsetLeft + 1) / pw) + 1) : 1;
    this.blocks = null;
  }

  show(page) {
    this.page = page;
    this.content.style.transform = `translate3d(${-page * this.r.pageW}px,0,0)`;
    this.foot();
  }

  foot() {
    const r = this.r;
    if (!r.book || this.ch < 0) return;
    const title = r.book.chapters[this.ch] ? r.book.chapters[this.ch].title || '' : '';
    const pct = Math.round(r.percentAt(this.ch, this.page, this.pages) * 100);
    if (r.spread) {
      this.footL.textContent = `${this.page + 1}  ·  ${title}`;
      this.footR.textContent = this.page + 2 <= this.pages ? `${pct}%  ·  ${this.page + 2}` : `${pct}%`;
    } else {
      this.footL.textContent = title;
      this.footR.textContent = `${this.page + 1} / ${this.pages}  ·  ${pct}%`;
    }
  }

  blockList() {
    if (!this.blocks) this.blocks = [...this.content.querySelectorAll('[data-i]')];
    return this.blocks;
  }

  /** Номер блока, с которого начинается текущая страница. */
  anchorAt(page) {
    const bl = this.blockList();
    if (!bl.length) return 0;
    const pw = this.r.pageW, start = page * pw;
    let lo = 0, hi = bl.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (bl[mid].offsetLeft >= start) hi = mid; else lo = mid + 1; }
    let i = Math.min(lo, bl.length - 1);
    if (bl[i].offsetLeft >= start + pw * this.r.step || bl[i].offsetLeft < start) i = Math.max(0, lo - 1);
    return +bl[i].getAttribute('data-i');
  }

  pageOf(el) {
    if (!el) return null;
    let p = Math.floor((el.offsetLeft + 1) / this.r.pageW);
    p = Math.max(0, Math.min(this.pages - 1, p));
    return p - (p % this.r.step);
  }
}

export class Reader {
  constructor(app) {
    this.app = app;
    this.ver = 0;
    this.tpls = new Map();
    this.step = 1;
    this.root = h('div', { class: 'rd', style: { display: 'none' } });
    this.stage = h('div', { class: 'rd-stage' });
    this.sheets = [new Sheet(this), new Sheet(this), new Sheet(this)];
    this.paper = new Sheet(this, true);
    for (const s of [...this.sheets, this.paper]) this.stage.appendChild(s.sw);
    this.curl = new Curl(this.stage);
    this.scrollEl = h('div', { class: 'rd-scroll' });
    this.scrollContent = h('div', { class: 'rd-scroll-content' });
    this.scrollEl.appendChild(this.scrollContent);
    this.buildChrome();
    this.root.append(this.stage, this.scrollEl, this.top, this.bottom,
      h('div', { class: 'rd-warm' }), h('div', { class: 'rd-dim' }));
    document.body.appendChild(this.root);
    this.initNotes();

    settings.on(ch => this.onSettings(ch));
    window.addEventListener('resize', debounce(() => { if (this.book) this.relayout(); }, 180));
    this.bindGestures();
    native.on('key', k => { if (this.book && !this.hidden) (k === 'next' ? this.next() : this.prev()); });
    document.addEventListener('keydown', e => {
      if (!this.book || this.hidden) return;
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); this.next(); }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); this.prev(); }
    });
    this.save = debounce(() => this._save(), 700);
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.book) this.save.flush(); });
    native.on('pause', () => { if (this.book) this.save.flush(); });
    this.hidden = true;
  }

  // ---------------------------------------------------------------- открыть / закрыть

  async open(rec, book, posOverride = null) {
    this.rec = rec;
    this.book = book;
    this.tpls.clear();
    this.ver++;
    for (const s of [...this.sheets, this.paper]) { s.ch = -1; s.content.replaceChildren(); }
    const sizes = book.chapters.map(c => Math.max(1, c.size || 1));
    this.cum = [0];
    for (const s of sizes) this.cum.push(this.cum[this.cum.length - 1] + s);
    this.total = this.cum[this.cum.length - 1];
    this.title.textContent = book.meta.title || rec.title || '';
    this.applyStyle();
    await fonts.ready(settings.get('font'));
    this.hidden = false;
    clearTimeout(this.hideTimer);
    this.root.style.display = '';
    document.body.dataset.ui = settings.theme().light ? 'light' : 'dark';
    this.root.classList.add('open');
    this.hideChrome();
    this.backToken = back.push(() => this.close());
    this.applyDevice();
    this.notes = (await db.notesFor(rec.id)) || [];
    if (statusOf(rec) !== 'done') rec.status = 'reading';
    native.setCustomSelection(true);
    tracker.activity(0);
    this.eyeSec = 0;
    this.eyeLast = 0;
    const pos = posOverride || rec.pos || { ch: 0, i: 0 };
    if (pos.ch >= book.chapters.length) pos.ch = 0;
    await this.goTo(pos);
  }

  close() {
    if (this.hidden) return;
    this.save.flush();
    this.clearSelection();
    native.setCustomSelection(false);
    tracker.pause();
    if (this.backToken) { back.remove(this.backToken); this.backToken = null; }
    this.hidden = true;
    this.root.classList.remove('open');
    native.setVolumeKeys(false);
    native.setKeepScreenOn(false);
    document.body.style.removeProperty('--ui-accent');
    document.body.style.removeProperty('--ui-accent-fg');
    native.setBrightness(-1);
    this.hideChrome(true);
    const book = this.book;
    this.hideTimer = setTimeout(() => { if (this.hidden) this.root.style.display = 'none'; }, 320);
    setTimeout(() => {
      if (!this.hidden) return;
      for (const s of [...this.sheets, this.paper]) { s.content.replaceChildren(); s.ch = -1; }
      this.scrollContent.replaceChildren();
      this.tpls.clear();
      if (book && book.destroy) book.destroy();
      if (this.book === book) this.book = null;
    }, 400);
    this.app.onReaderClosed(this.rec);
  }

  applyDevice() {
    native.setVolumeKeys(settings.get('volumeKeys'));
    native.setKeepScreenOn(settings.get('keepScreenOn'));
    native.setBrightness(settings.get('brightness'));
    const t = settings.theme();
    native.setSystemBars(t.bg, t.light, settings.get('fullscreen'));
  }

  // ---------------------------------------------------------------- стиль и раскладка

  applyStyle() {
    const s = settings.all();
    const t = settings.theme();
    const st = this.root.style;
    st.setProperty('--bg', t.bg);
    st.setProperty('--text', t.text);
    st.setProperty('--muted', t.muted);
    st.setProperty('--accent', t.accent);
    st.setProperty('--back', t.back);
    st.setProperty('--rest', s.bionic ? mix(t.text, t.bg, s.bionicFade) : t.text);
    st.setProperty('--font', fonts.family(s.font));
    st.setProperty('--fs', s.fontSize + 'px');
    st.setProperty('--lh', s.lineHeight);
    st.setProperty('--m', s.margin + 'px');
    st.setProperty('--align', s.align);
    st.setProperty('--hyph', s.hyphens ? 'auto' : 'manual');
    st.setProperty('--indent', s.indent ? '1.5em' : '0');
    st.setProperty('--pspace', s.paraSpace + 'em');
    st.setProperty('--weight', s.weight);
    st.setProperty('--bw', s.bionicWeight);
    st.setProperty('--grain', s.grain ? (t.grain || 0) : 0);
    st.setProperty('--ls', (s.letterSpacing || 0) + 'em');
    st.setProperty('--ws', (s.wordSpacing || 0) + 'em');
    st.setProperty('--stroke', (s.stroke || 0) + 'px');
    st.setProperty('--dim', s.dim || 0);
    st.setProperty('--warm', s.warm || 0);
    this.root.classList.toggle('dark', !t.light);
    this.root.classList.toggle('glow', !!t.glow);
    if (!this.hidden) {
      document.body.style.setProperty('--ui-accent', t.accent);
      document.body.style.setProperty('--ui-accent-fg', t.light ? '#fff' : t.bg);
    }
    this.root.classList.toggle('bionic', !!s.bionic);
    this.root.classList.toggle('no-indent', !s.indent);
    this.root.dataset.theme = t.id;
    if (!this.hidden) document.body.dataset.ui = t.light ? 'light' : 'dark';
  }

  geometry() {
    const W = this.root.clientWidth || window.innerWidth;
    const H = this.root.clientHeight || window.innerHeight;
    const sp = settings.get('spread');
    this.W = W; this.H = H;
    this.mode = settings.get('mode');
    this.spread = this.mode === 'pages' && (sp === 'two' || (sp === 'auto' && W > H && W >= 820));
    this.step = this.spread ? 2 : 1;
    this.pageW = this.spread ? W / 2 : W;
    const st = this.root.style;
    st.setProperty('--W', W + 'px');
    st.setProperty('--H', H + 'px');
    st.setProperty('--pw', this.pageW + 'px');
    this.root.classList.toggle('spread', this.spread);
    this.root.classList.toggle('mode-scroll', this.mode === 'scroll');
  }

  async template(ch) {
    const c = this.tpls.get(ch);
    if (c && c.ver === this.ver) return c.el;
    const frag = await this.book.fragment(ch);
    const wrap = document.createElement('div');
    wrap.className = 'rd-chapter';
    wrap.appendChild(frag);
    wrap.querySelectorAll(BLOCKS).forEach((el, i) => el.setAttribute('data-i', i));
    const hls = (this.notes || []).filter(n => n.type === 'hl' && n.ch === ch);
    if (hls.length) applyHighlights(wrap, hls);
    if (settings.get('bionic')) bionicify(wrap, settings.get('bionicStrength'));
    const end = document.createElement('div');
    end.className = 'rd-end';
    wrap.appendChild(end);
    this.tpls.set(ch, { el: wrap, ver: this.ver });
    if (this.tpls.size > 5) {
      for (const k of this.tpls.keys()) { if (Math.abs(k - ch) > 2) { this.tpls.delete(k); break; } }
    }
    return wrap;
  }

  percentAt(ch, page, pages) {
    if (!this.total) return 0;
    const size = this.cum[ch + 1] - this.cum[ch];
    const f = pages > 1 ? Math.min(1, (page + this.step) / pages) : 1;
    return Math.min(1, (this.cum[ch] + size * f) / this.total);
  }

  get front() { return this._front || this.sheets[0]; }

  setFront(s) {
    this._front = s;
    for (const x of [...this.sheets, this.paper]) {
      x.sw.style.visibility = x === s ? 'visible' : 'hidden';
      x.sw.style.zIndex = x === s ? 1 : 0;
      x.sw.style.transform = '';
      x.sw.style.opacity = '';
    }
  }

  lastStart(s) {
    const p = s.pages - 1;
    return p - (p % this.step);
  }

  // ---------------------------------------------------------------- переходы

  /** pos: {ch, i?, anchor?, frac?, last?} */
  async goTo(pos, { keepLinkBack = false } = {}) {
    const token = (this.navToken = (this.navToken || 0) + 1);
    this.finishAnimation();
    this.geometry();
    if (!keepLinkBack) this.hideLinkBack();
    const ch = Math.max(0, Math.min(this.book.chapters.length - 1, pos.ch || 0));
    if (this.mode === 'scroll') return this.goToScroll(ch, pos, token);
    const s = this.front;
    await s.load(ch);
    if (token !== this.navToken) return;
    let page = 0;
    if (pos.anchor) {
      const el = s.content.querySelector(`[data-id="${cssEsc(pos.anchor)}"]`);
      page = s.pageOf(el) ?? 0;
    } else if (pos.i != null && pos.i > 0) {
      page = s.pageOf(s.content.querySelector(`[data-i="${pos.i}"]`)) ?? 0;
    } else if (pos.frac != null) {
      page = Math.round(pos.frac * (s.pages - 1));
    } else if (pos.last) {
      page = s.pages - 1;
    }
    page = Math.max(0, Math.min(s.pages - 1, page));
    page -= page % this.step;
    s.show(page);
    this.setFront(s);
    this.ch = ch;
    this.page = page;
    this.afterMove();
    this.preload();
  }

  preload() {
    const ch = this.ch, ver = this.ver;
    idle(async () => {
      if (!this.book || this.hidden || this.ch !== ch || this.ver !== ver) return;
      for (const s of this.sheets) {
        if (s === this.front || (s.ch === ch && s.ver === ver)) continue;
        if (this.busy) return;
        await s.load(ch);
        if (this.busy || this.ch !== ch) return;
        s.show(this.page);
      }
      if (this.spread && this.paper.ch !== -2) { this.paper.ch = -2; }
    });
  }

  afterMove(pages = 0) {
    this.updateChrome();
    this.updateRibbon();
    if (pages) { tracker.activity(pages); this.eyeTick(); }
    this.save();
  }

  // напоминание «20-20-20»: каждые 20 минут чтения посмотреть вдаль 20 секунд
  eyeTick() {
    const now = Date.now();
    if (this.eyeLast && now - this.eyeLast < 5 * 60 * 1000) this.eyeSec += Math.min(now - this.eyeLast, 3 * 60 * 1000) / 1000;
    this.eyeLast = now;
    if (settings.get('eyeBreaks') && this.eyeSec >= 20 * 60) {
      this.eyeSec = 0;
      this.eyeBreak();
    }
  }

  eyeBreak() {
    let left = 20;
    const num = h('b', { text: '20' });
    const card = h('div', { class: 'eye-card' },
      h('div', { class: 'eye-t', text: 'Глазам пора отдохнуть' }),
      h('div', { class: 'eye-s', text: 'Посмотри вдаль, на что-нибудь в 5–6 метрах, и поморгай.' }),
      h('div', { class: 'eye-n' }, num, h('span', { text: 'сек' })),
      h('button', { class: 'btn ghost small', text: 'Пропустить', onclick: () => done() }));
    const wrap = h('div', { class: 'eye-wrap' }, card);
    this.root.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('show'));
    const bt = back.push(() => done(true));
    const timer = setInterval(() => {
      left--;
      num.textContent = String(left);
      if (left <= 0) { card.querySelector('.eye-t').textContent = 'Можно читать дальше'; setTimeout(() => done(), 900); clearInterval(timer); }
    }, 1000);
    const done = fromBack => {
      clearInterval(timer);
      if (!fromBack) back.remove(bt);
      wrap.classList.remove('show');
      setTimeout(() => wrap.remove(), 300);
    };
  }

  anchorNow() {
    if (this.mode === 'scroll') return this.scrollAnchor();
    const s = this.front;
    return { ch: this.ch, i: s.anchorAt(this.page), frac: s.pages > 1 ? this.page / (s.pages - 1) : 0 };
  }

  _save() {
    if (!this.book || !this.rec) return;
    const a = this.anchorNow();
    const pct = this.progressNow();
    this.rec.pos = a;
    this.rec.progress = pct;
    this.rec.lastOpened = Date.now();
    if (pct >= 0.995 && this.rec.status !== 'done') {
      this.rec.status = 'done';
      this.rec.finished = true;
      this.rec.finishedAt = Date.now();
      toast('Книга прочитана! Она переехала на полку «Прочитано»', 3200);
    }
    this.app.library.update(this.rec);
  }

  progressNow() {
    if (this.mode === 'scroll') {
      const el = this.scrollEl;
      const f = el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 1;
      const size = this.cum[this.ch + 1] - this.cum[this.ch];
      return Math.min(1, (this.cum[this.ch] + size * f) / this.total);
    }
    return this.percentAt(this.ch, this.page, this.front.pages);
  }

  async relayout({ rerender = false } = {}) {
    if (!this.book || this.hidden) return;
    const a = this.anchorNow();
    if (rerender) this.ver++;
    this.applyStyle();
    await fonts.ready(settings.get('font'));
    this.geometry();
    for (const s of this.sheets) if (s !== this.front) s.ver = -1;
    if (!rerender && this.mode === 'pages' && this.front.ch === this.ch) {
      this.front.measure();
      this.front.blocks = null;
    }
    this.front.ver = rerender ? -1 : this.front.ver;
    await this.goTo(a);
  }

  onSettings(changed) {
    if (!this.book || this.hidden) return;
    const keys = Object.keys(changed);
    if (keys.some(k => RENDER_KEYS.includes(k))) return this.relayout({ rerender: true });
    if (keys.some(k => LAYOUT_KEYS.includes(k))) return this.relayout();
    if (keys.some(k => ['theme', 'bionicFade', 'grain', 'stroke', 'dim', 'warm'].includes(k))) { this.applyStyle(); this.applyDevice(); }
    if (keys.some(k => ['volumeKeys', 'keepScreenOn', 'brightness', 'fullscreen'].includes(k))) this.applyDevice();
  }

  async targetFor(dir) {
    const s = this.front;
    if (dir > 0) {
      if (this.page + this.step < s.pages) return { ch: this.ch, page: this.page + this.step };
      if (this.ch + 1 < this.book.chapters.length) return { ch: this.ch + 1, page: 0 };
      return null;
    }
    if (this.page - this.step >= 0) return { ch: this.ch, page: this.page - this.step };
    if (this.ch > 0) return { ch: this.ch - 1, page: 'last' };
    return null;
  }

  async startTurn(dir, cy) {
    const tgt = await this.targetFor(dir);
    if (!tgt) return null;
    const front = this.front;
    const spares = this.sheets.filter(s => s !== front);
    spares.sort((a, b) => (b.ch === tgt.ch && b.ver === this.ver) - (a.ch === tgt.ch && a.ver === this.ver));
    const [T, B] = spares;
    await T.load(tgt.ch);
    const page = tgt.page === 'last' ? this.lastStart(T) : tgt.page;
    T.show(page);
    const anim = settings.get('anim');
    const st = { dir, T, front, tgt: { ch: tgt.ch, page }, anim, cy, p: 0 };
    if (anim === 'curl') {
      let backS;
      const upper = dir > 0 ? front : T, under = dir > 0 ? T : front;
      if (this.spread) {
        if (dir > 0) { await B.load(tgt.ch); B.show(page); } else { await B.load(this.ch); B.show(this.page); }
        backS = B;
      } else if (B.ch === upper.ch && B.ver === this.ver) {
        // оборот листа: та же страница, просвечивающая зеркально
        B.show(upper.page);
        B.sw.classList.add('see-through');
        backS = B;
      } else backS = this.paper;
      this.curl.begin({ upper, under, back: backS, spread: this.spread, W: this.W, H: this.H, cy, backIsPaper: !this.spread });
      st.C = this.curl.C; st.F1 = this.curl.F1;
      st.F = dir > 0 ? { x: st.C.x - 0.5, y: cy } : { ...st.F1 };
      this.curl.update(st.F);
    } else if (anim === 'slide') {
      T.sw.style.visibility = 'visible';
      T.sw.style.zIndex = 2;
      front.sw.style.zIndex = 1;
      T.sw.style.transform = `translate3d(${dir * this.W}px,0,0)`;
    } else if (anim === 'fade') {
      T.sw.style.visibility = 'visible';
      T.sw.style.zIndex = 2;
      T.sw.style.opacity = '0';
    }
    return st;
  }

  setProgress(st, p) {
    st.p = Math.max(0, Math.min(1, p));
    if (st.anim === 'slide') {
      st.front.sw.style.transform = `translate3d(${-st.dir * this.W * st.p}px,0,0)`;
      st.T.sw.style.transform = `translate3d(${st.dir * this.W * (1 - st.p)}px,0,0)`;
    } else if (st.anim === 'fade') {
      st.T.sw.style.opacity = String(st.p);
    }
  }

  curlProgress(st) {
    const span = st.C.x - st.F1.x;
    return st.dir > 0 ? (st.C.x - st.F.x) / span : (st.F.x - st.F1.x) / span;
  }

  animateTurn(st, commit, { arc = false, ms } = {}) {
    return new Promise(resolve => {
      const t0 = performance.now();
      let dur;
      let from, to;
      if (st.anim === 'curl') {
        from = { ...st.F };
        const done = st.dir > 0 ? st.F1 : st.C;
        const undo = st.dir > 0 ? st.C : st.F1;
        to = commit ? { ...done } : { ...undo };
        const dist = Math.abs(to.x - from.x) / Math.max(1, st.C.x - st.F1.x);
        dur = ms || Math.max(160, 620 * dist);
      } else if (st.anim === 'slide' || st.anim === 'fade') {
        from = st.p; to = commit ? 1 : 0;
        dur = ms || Math.max(120, (st.anim === 'fade' ? 300 : 330) * Math.abs(to - from));
      } else {
        dur = 0;
      }
      const tick = now => {
        let t = dur ? Math.min(1, (now - t0) / dur) : 1;
        if (this.hurry) t = 1;
        if (st.anim === 'curl') {
          if (arc) st.F = arcPoint(from, to, t, this.H, st.cy);
          else {
            const e = 1 - Math.pow(1 - t, 3);
            st.F = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
          }
          this.curl.update(st.F);
        } else if (st.anim === 'slide' || st.anim === 'fade') {
          const e = 1 - Math.pow(1 - t, 3);
          this.setProgress(st, from + (to - from) * e);
        }
        if (t < 1) requestAnimationFrame(tick);
        else { this.finishTurn(st, commit); resolve(commit); }
      };
      requestAnimationFrame(tick);
    });
  }

  finishTurn(st, commit) {
    if (st.anim === 'curl') this.curl.end();
    for (const x of this.sheets) x.sw.classList.remove('see-through');
    if (commit) {
      this.setFront(st.T);
      this.ch = st.tgt.ch;
      this.page = st.tgt.page;
      this.hideLinkBack();
      this.afterMove(this.step);
      this.preload();
    } else {
      this.setFront(st.front);
    }
    this.busy = false;
    this.hurry = false;
    const q = this.queued;
    this.queued = 0;
    if (q) setTimeout(() => this.turn(q), 0);
  }

  finishAnimation() {
    if (this.busy) this.hurry = true;
  }

  async turn(dir) {
    if (!this.book || this.hidden) return;
    if (this.mode === 'scroll') return this.scrollBy(dir);
    if (this.busy) { this.queued = dir; this.hurry = true; return; }
    this.busy = true;
    const st = await this.startTurn(dir, this.H);
    if (!st) {
      this.busy = false;
      toast(dir > 0 ? 'Это последняя страница' : 'Это начало книги', 1400);
      return;
    }
    if (st.anim === 'none') return this.finishTurn(st, true);
    await this.animateTurn(st, true, { arc: true });
  }

  next() { return this.turn(1); }
  prev() { return this.turn(-1); }

  // ---------------------------------------------------------------- жесты

  bindGestures() {
    const stage = this.stage;
    let ptr = null;
    const pos = e => ({ x: e.clientX - this.root.getBoundingClientRect().left, y: e.clientY - this.root.getBoundingClientRect().top });

    stage.addEventListener('pointerdown', e => {
      if (!this.book || e.button > 0) return;
      const p = pos(e);
      ptr = { id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y, t0: performance.now(), hist: [[p.x, performance.now()]], drag: false, target: e.target };
    });
    stage.addEventListener('pointermove', e => {
      if (!ptr || e.pointerId !== ptr.id) return;
      const p = pos(e);
      ptr.x = p.x; ptr.y = p.y;
      ptr.hist.push([p.x, performance.now()]);
      if (ptr.hist.length > 6) ptr.hist.shift();
      const dx = p.x - ptr.x0, dy = p.y - ptr.y0;
      if (!ptr.drag && !ptr.vertical && Math.hypot(dx, dy) > 10) {
        const slow = performance.now() - ptr.t0 > 350; // долгое нажатие и протяжка — это выделение текста
        if (!slow && Math.abs(dx) > Math.abs(dy) * 1.1 && !this.busy && this.chromeHidden && !this.hasSelection()) {
          ptr.drag = true;
          try { stage.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
          const dir = dx < 0 ? 1 : -1;
          const cy = ptr.y0 > this.H / 2 ? this.H : 0;
          this.busy = true;
          const my = ptr;
          this.startTurn(dir, cy).then(st => {
            if (!st) {
              this.busy = false;
              my.dead = true;
              toast(dir > 0 ? 'Это последняя страница' : 'Это начало книги', 1400);
              return;
            }
            my.st = st;
            if (st.anim === 'none') { this.finishTurn(st, true); my.done = true; return; }
            this.dragTo(my);
            if (my.up) this.release(my);
          });
        } else ptr.vertical = true;
      }
      if (ptr.drag && ptr.st && !ptr.done) this.dragTo(ptr);
    });
    const up = e => {
      if (!ptr || e.pointerId !== ptr.id) return;
      const p = ptr;
      ptr = null;
      p.up = true;
      if (p.drag) { if (p.st && !p.done) this.release(p); return; }
      if (p.vertical) return;
      const dt = performance.now() - p.t0;
      if (dt < 600 && Math.hypot(p.x - p.x0, p.y - p.y0) < 10) this.tap(p.x, p.y, p.target);
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', e => { if (ptr && ptr.drag && ptr.st && !ptr.done) { ptr.up = true; this.release(ptr, true); } ptr = null; });

    let wheelT = 0;
    stage.addEventListener('wheel', e => {
      const now = performance.now();
      if (now - wheelT < 350) return;
      wheelT = now;
      if (e.deltaY > 0 || e.deltaX > 0) this.next(); else this.prev();
    }, { passive: true });

    // режим прокрутки
    this.scrollEl.addEventListener('click', e => {
      if (this.selInfo || this.hasSelection()) { this.clearSelection(); return; }
      const mk = e.target.closest('mark.hl');
      if (mk) { this.openNote(mk.dataset.a); return; }
      const a = e.target.closest('a.lnk');
      if (a) { e.preventDefault(); this.followLink(a); return; }
      const nav = e.target.closest('[data-goto]');
      if (nav) { this.goTo({ ch: +nav.dataset.goto, i: 0 }); return; }
      this.toggleChrome();
    });
    this.scrollEl.addEventListener('scroll', debounce(() => {
      if (this.mode !== 'scroll' || !this.book) return;
      const el = this.scrollEl;
      const d = Math.abs(el.scrollTop - (this._lastScroll || 0)) / Math.max(1, el.clientHeight);
      this._lastScroll = el.scrollTop;
      this.afterMove(Math.round(d));
      if (!d) tracker.activity(0);
    }, 250), { passive: true });
  }

  dragTo(p) {
    const st = p.st;
    const dx = p.x - p.x0, dy = p.y - p.y0;
    if (st.anim === 'curl') {
      const k = 1.5;
      let F;
      if (st.dir > 0) F = { x: st.C.x + dx * k, y: st.cy + dy * 0.6 };
      else F = { x: st.F1.x + dx * k, y: st.cy + dy * 0.6 };
      F.x = Math.max(st.F1.x, Math.min(st.C.x - 0.5, F.x));
      st.F = this.curl.update(F) || F;
      st.p = this.curlProgress(st);
    } else {
      this.setProgress(st, -st.dir * dx / this.W);
    }
  }

  release(p, cancel = false) {
    const st = p.st;
    p.done = true;
    const h2 = p.hist;
    let v = 0;
    if (h2.length > 1) {
      const [x1, t1] = h2[0], [x2, t2] = h2[h2.length - 1];
      v = (x2 - x1) / Math.max(1, t2 - t1);
    }
    const along = -st.dir * v;
    const commit = !cancel && (st.p > 0.28 || along > 0.35) && !(along < -0.3);
    this.animateTurn(st, commit);
  }

  tap(x, y, target) {
    if (this.selInfo || this.hasSelection()) { this.clearSelection(); return; }
    const mk = target && target.closest && target.closest('mark.hl');
    if (mk && this.chromeHidden) { this.openNote(mk.dataset.a); return; }
    if (this.chromeHidden && x > this.W * 0.86 && y < Math.min(90, this.H * 0.1)) { this.toggleBookmark(); return; }
    const a = target && target.closest && target.closest('a.lnk');
    if (a && this.chromeHidden) { this.followLink(a); return; }
    if (!this.chromeHidden) { this.hideChrome(); return; }
    const W = this.W;
    if (x < W * 0.3) this.prev();
    else if (x > W * 0.7) this.next();
    else this.showChrome();
  }

  // ---------------------------------------------------------------- ссылки и сноски

  async followLink(a) {
    if (a.dataset.ext) { window.open(a.dataset.ext, '_blank'); return; }
    const ref = { ch: a.dataset.ch != null ? +a.dataset.ch : null, anchor: a.dataset.anchor || null, note: a.dataset.note || null };
    if (a.classList.contains('noteref') || ref.note) {
      const note = await this.book.note(ref);
      if (note) { this.showNote(note, ref); return; }
    }
    if (ref.ch == null) return;
    const here = this.anchorNow();
    await this.goTo({ ch: ref.ch, anchor: ref.anchor }, { keepLinkBack: true });
    this.showLinkBack(here);
  }

  showNote(note, ref) {
    note.classList.add('note-body');
    const wrap = h('div', { class: 'note-wrap' }, note);
    const sh = sheet({ title: 'Сноска', content: wrap, cls: 'note-sheet' });
    sh.el.style.setProperty('--font', fonts.family(settings.get('font')));
    if (ref.ch != null) {
      sh.body.appendChild(h('button', { class: 'btn ghost small', text: 'Перейти к сноске в тексте', onclick: async () => {
        sh.close();
        const here = this.anchorNow();
        await this.goTo({ ch: ref.ch, anchor: ref.anchor || ref.note }, { keepLinkBack: true });
        this.showLinkBack(here);
      } }));
    }
  }

  showLinkBack(pos) {
    this.linkBack = pos;
    this.linkBackBtn.classList.add('show');
  }

  hideLinkBack() {
    this.linkBack = null;
    if (this.linkBackBtn) this.linkBackBtn.classList.remove('show');
  }

  // ---------------------------------------------------------------- прокрутка

  async goToScroll(ch, pos, token) {
    this.setFront(this.front);
    for (const s of [...this.sheets, this.paper]) s.sw.style.visibility = 'hidden';
    const tpl = await this.template(ch);
    if (token !== this.navToken) return;
    const n = this.book.chapters.length;
    const prevBtn = ch > 0 ? h('button', { class: 'scroll-nav', 'data-goto': ch - 1, text: '← ' + (this.book.chapters[ch - 1].title || 'Предыдущая глава') }) : null;
    const nextBtn = ch + 1 < n ? h('button', { class: 'scroll-nav next', 'data-goto': ch + 1, text: (this.book.chapters[ch + 1].title || 'Следующая глава') + ' →' }) : h('div', { class: 'scroll-end', text: 'Конец книги' });
    this.scrollContent.replaceChildren(...[prevBtn, tpl.cloneNode(true), nextBtn].filter(Boolean));
    await waitImages(this.scrollContent);
    this.ch = ch;
    this.page = 0;
    const el = this.scrollEl;
    let y = 0;
    if (pos.anchor) { const t = this.scrollContent.querySelector(`[data-id="${cssEsc(pos.anchor)}"]`); if (t) y = t.offsetTop - 20; }
    else if (pos.i > 0) { const t = this.scrollContent.querySelector(`[data-i="${pos.i}"]`); if (t) y = t.offsetTop - 20; }
    else if (pos.frac != null) y = pos.frac * (el.scrollHeight - el.clientHeight);
    else if (pos.last) y = el.scrollHeight;
    el.scrollTop = Math.max(0, y);
    this.afterMove();
  }

  scrollAnchor() {
    const el = this.scrollEl;
    const bl = this.scrollContent.querySelectorAll('[data-i]');
    const top = el.scrollTop;
    let lo = 0, hi = bl.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (bl[mid].offsetTop + bl[mid].offsetHeight > top) hi = mid; else lo = mid + 1; }
    const i = bl.length ? +bl[Math.min(lo, bl.length - 1)].getAttribute('data-i') : 0;
    const f = el.scrollHeight > el.clientHeight ? top / (el.scrollHeight - el.clientHeight) : 0;
    return { ch: this.ch, i, frac: f };
  }

  scrollBy(dir) {
    const el = this.scrollEl;
    const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    const atTop = el.scrollTop <= 0;
    if (dir > 0 && atEnd) { if (this.ch + 1 < this.book.chapters.length) this.goTo({ ch: this.ch + 1, i: 0 }); return; }
    if (dir < 0 && atTop) { if (this.ch > 0) this.goTo({ ch: this.ch - 1, last: true }); return; }
    el.scrollBy({ top: dir * el.clientHeight * 0.88, behavior: 'smooth' });
  }

  // ---------------------------------------------------------------- панели

  buildChrome() {
    this.title = h('div', { class: 'rd-title' });
    this.top = h('div', { class: 'rd-top' },
      h('button', { class: 'icon-btn', 'aria-label': 'На полку', html: icon('back'), onclick: () => this.close() }),
      this.title,
      this.bmBtn = h('button', { class: 'icon-btn', 'aria-label': 'Закладка', html: icon('bookmark'), onclick: () => this.toggleBookmark() }),
      h('button', { class: 'icon-btn', 'aria-label': 'Заметки', html: icon('notes'), onclick: () => this.openNotesList() }),
      h('button', { class: 'icon-btn', 'aria-label': 'Оглавление', html: icon('toc'), onclick: () => this.openToc() }),
      h('button', { class: 'icon-btn', 'aria-label': 'Оформление', html: icon('type'), onclick: () => this.openSettings() }));
    this.chLabel = h('div', { class: 'rd-ch' });
    this.pct = h('div', { class: 'rd-pct' });
    this.slider = h('input', { type: 'range', min: 0, max: 1000, value: 0, class: 'rd-slider' });
    this.slider.addEventListener('input', () => {
      const f = this.slider.value / 1000;
      const ch = this.chapterAtFraction(f);
      this.chLabel.textContent = this.book.chapters[ch].title || '';
      this.pct.textContent = Math.round(f * 100) + '%';
    });
    this.slider.addEventListener('change', () => this.goToFraction(this.slider.value / 1000));
    this.bottom = h('div', { class: 'rd-bottom' },
      h('div', { class: 'rd-row' }, this.chLabel, this.pct),
      h('div', { class: 'rd-row' },
        h('button', { class: 'icon-btn sm', 'aria-label': 'Предыдущая глава', html: icon('back'), onclick: () => this.chapterJump(-1) }),
        this.slider,
        h('button', { class: 'icon-btn sm flip', 'aria-label': 'Следующая глава', html: icon('back'), onclick: () => this.chapterJump(1) })));
    this.linkBackBtn = h('button', { class: 'link-back', html: icon('back') + '<span>Вернуться</span>', onclick: () => {
      const p = this.linkBack;
      this.hideLinkBack();
      if (p) this.goTo(p);
    } });
    this.root.appendChild(this.linkBackBtn);
    this.chromeHidden = true;
  }

  chapterAtFraction(f) {
    const x = f * this.total;
    let ch = 0;
    while (ch + 1 < this.book.chapters.length && this.cum[ch + 1] <= x) ch++;
    return ch;
  }

  goToFraction(f) {
    const ch = this.chapterAtFraction(f);
    const size = this.cum[ch + 1] - this.cum[ch];
    const within = Math.max(0, Math.min(1, (f * this.total - this.cum[ch]) / size));
    this.goTo({ ch, frac: within });
  }

  chapterJump(d) {
    const ch = this.ch + d;
    if (ch < 0 || ch >= this.book.chapters.length) return;
    this.goTo({ ch, i: 0 });
  }

  updateChrome() {
    if (!this.book) return;
    const pct = this.progressNow();
    this.chLabel.textContent = this.book.chapters[this.ch] ? this.book.chapters[this.ch].title || '' : '';
    this.pct.textContent = Math.round(pct * 100) + '%';
    if (document.activeElement !== this.slider) this.slider.value = Math.round(pct * 1000);
  }

  showChrome() {
    this.chromeHidden = false;
    this.root.classList.add('chrome');
    this.updateChrome();
    this.chromeToken = back.push(() => this.hideChrome(true));
  }

  hideChrome(fromBack) {
    this.chromeHidden = true;
    this.root.classList.remove('chrome');
    if (this.chromeToken && !fromBack) back.remove(this.chromeToken);
    this.chromeToken = null;
  }

  toggleChrome() { if (this.chromeHidden) this.showChrome(); else this.hideChrome(); }

  openToc() {
    const list = h('div', { class: 'toc' });
    let cur = null;
    const toc = this.book.toc;
    // текущий пункт — последний, который начинается не позже текущей главы
    let curIdx = -1;
    toc.forEach((t, i) => { if (t.ch <= this.ch) curIdx = i; });
    toc.forEach((t, i) => {
      const item = h('button', { class: 'toc-item' + (i === curIdx ? ' current' : ''), style: { paddingLeft: (18 + t.level * 18) + 'px' },
        onclick: () => { sh.close(); this.hideChrome(); this.goTo({ ch: t.ch, anchor: t.anchor, i: 0 }); } },
      h('span', { class: 'toc-t', text: t.title }),
      h('span', { class: 'toc-p', text: Math.round(this.cum[t.ch] / this.total * 100) + '%' }));
      if (i === curIdx) cur = item;
      list.appendChild(item);
    });
    const sh = sheet({ title: 'Оглавление', content: list, cls: 'toc-sheet', full: true });
    if (cur) setTimeout(() => cur.scrollIntoView({ block: 'center' }), 60);
  }

  openSettings() {
    this.hideChrome();
    openSettingsPanel({ reader: true });
  }
}

installNotes(Reader);

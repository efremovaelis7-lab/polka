import { resolvePath, guessType } from './zip.js';
import { parseXml, byTag, childEls, local, textOf, sanitize, parseCssFlags, hideInlineNotes, OPS } from './content.js';

export class EpubBook {
  constructor(zip) {
    this.zip = zip;
    this.format = 'epub';
    this.urls = new Map();     // путь в архиве -> blob: URL
    this.cssCache = new Map(); // путь css -> Map флагов
    this.cache = new Map();    // глава -> DocumentFragment
  }

  static async open(zip, { metaOnly = false } = {}) {
    const b = new EpubBook(zip);
    await b._init(metaOnly);
    return b;
  }

  async _init(metaOnly) {
    const zip = this.zip;
    let opfPath = null;
    if (zip.has('META-INF/container.xml')) {
      const c = parseXml(await zip.text('META-INF/container.xml'));
      const rf = byTag(c, 'rootfile')[0];
      opfPath = rf && rf.getAttribute('full-path');
    }
    if (!opfPath || !zip.has(opfPath)) opfPath = zip.names().find(n => n.toLowerCase().endsWith('.opf'));
    if (!opfPath) throw new Error('Не найдено описание книги (OPF)');
    this.opfPath = opfPath;
    const opf = parseXml(await zip.text(opfPath));

    // --- метаданные
    const md = byTag(opf, 'metadata')[0] || opf;
    const dc = n => byTag(md, n);
    const meta = { title: '', authors: [], series: '', seriesIndex: '', lang: '', annotation: '' };
    meta.title = textOf(dc('title')[0]);
    let creators = dc('creator');
    const auth = creators.filter(c => {
      const role = c.getAttribute('opf:role') || c.getAttribute('role') || '';
      return !role || role === 'aut';
    });
    if (auth.length) creators = auth;
    meta.authors = creators.map(textOf).filter(Boolean);
    meta.lang = textOf(dc('language')[0]);
    const desc = dc('description')[0];
    if (desc) {
      const tmp = document.createElement('div');
      tmp.innerHTML = desc.textContent || '';
      meta.annotation = textOf(tmp);
    }
    const metas = byTag(md, 'meta');
    for (const m of metas) {
      const name = m.getAttribute('name');
      if (name === 'calibre:series') meta.series = m.getAttribute('content') || '';
      if (name === 'calibre:series_index') meta.seriesIndex = m.getAttribute('content') || '';
      if (m.getAttribute('property') === 'belongs-to-collection' && !meta.series) {
        meta.series = textOf(m);
        const id = m.getAttribute('id');
        const pos = id && metas.find(x => x.getAttribute('refines') === '#' + id && x.getAttribute('property') === 'group-position');
        if (pos) meta.seriesIndex = textOf(pos);
      }
    }
    this.meta = meta;

    // --- манифест
    const manifest = new Map();
    for (const it of byTag(opf, 'item')) {
      manifest.set(it.getAttribute('id'), {
        id: it.getAttribute('id'),
        href: resolvePath(opfPath, it.getAttribute('href') || ''),
        type: (it.getAttribute('media-type') || '').toLowerCase(),
        props: it.getAttribute('properties') || '',
      });
    }
    this.manifest = manifest;

    // --- обложка
    let cover = [...manifest.values()].find(i => /\bcover-image\b/.test(i.props));
    if (!cover) {
      const m = metas.find(x => x.getAttribute('name') === 'cover');
      const c = m && manifest.get(m.getAttribute('content'));
      if (c && (c.type.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(c.href))) cover = c;
    }
    if (!cover) cover = [...manifest.values()].find(i => i.type.startsWith('image/') && /cover/i.test(i.id + ' ' + i.href));
    this.coverPath = cover ? cover.href : null;

    // --- spine
    const spineEl = byTag(opf, 'spine')[0];
    const spine = [];
    if (spineEl) {
      for (const ir of childEls(spineEl, 'itemref')) {
        const it = manifest.get(ir.getAttribute('idref'));
        if (!it || !this.zip.has(it.href)) continue;
        if (!/html|xml/.test(it.type) && !/\.x?html?$/i.test(it.href)) continue;
        const e = this.zip.find(it.href);
        spine.push({ href: it.href, linear: ir.getAttribute('linear') !== 'no', size: e ? e.usize : 1000, title: '' });
      }
    }
    if (!spine.length) throw new Error('В книге нет глав');
    this.chapters = spine;
    this.byPath = new Map(spine.map((s, i) => [s.href, i]));
    this.byPathLower = new Map(spine.map((s, i) => [s.href.toLowerCase(), i]));

    if (metaOnly) return;

    // --- оглавление
    this.toc = [];
    const navItem = [...manifest.values()].find(i => /\bnav\b/.test(i.props));
    if (navItem && this.zip.has(navItem.href)) {
      try { this._parseNav(parseXml(await zip.text(navItem.href), 'application/xhtml+xml'), navItem.href); } catch (e) { console.warn(e); }
    }
    if (!this.toc.length) {
      const ncxId = spineEl && spineEl.getAttribute('toc');
      let ncx = ncxId && manifest.get(ncxId);
      if (!ncx) ncx = [...manifest.values()].find(i => i.type === 'application/x-dtbncx+xml' || /\.ncx$/i.test(i.href));
      if (ncx && this.zip.has(ncx.href)) {
        try { this._parseNcx(parseXml(await zip.text(ncx.href)), ncx.href); } catch (e) { console.warn(e); }
      }
    }
    if (!this.toc.length) {
      this.toc = spine.map((s, i) => ({ title: 'Раздел ' + (i + 1), level: 0, ch: i, anchor: null }));
    }
    for (const t of this.toc) if (t.ch >= 0 && !this.chapters[t.ch].title) this.chapters[t.ch].title = t.title;
    // главы без собственного пункта оглавления наследуют предыдущий
    let last = this.meta.title;
    for (const c of this.chapters) { if (c.title) last = c.title; else c.title = last; }
  }

  locate(base, href) {
    if (!href) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { ext: href };
    const [p, anchor] = href.split('#');
    const path = p ? resolvePath(base, p) : base;
    let ch = this.byPath.get(path);
    if (ch === undefined) ch = this.byPathLower.get(path.toLowerCase());
    if (ch === undefined) return null;
    return { ch, anchor: anchor ? safeDecode(anchor) : null };
  }

  _parseNav(doc, base) {
    const navs = byTag(doc, 'nav');
    let nav = navs.find(n => /toc/.test(n.getAttributeNS(OPS, 'type') || n.getAttribute('epub:type') || '')) || navs[0];
    if (!nav) return;
    const ol = childEls(nav).find(c => local(c) === 'ol' || local(c) === 'ul') || byTag(nav, 'ol')[0];
    const walk = (list, level) => {
      if (!list) return;
      for (const li of childEls(list, 'li')) {
        const a = childEls(li).find(c => local(c) === 'a') || byTag(li, 'a')[0];
        const span = childEls(li).find(c => local(c) === 'span');
        const title = textOf(a || span);
        const loc = a ? this.locate(base, a.getAttribute('href')) : null;
        if (title) this.toc.push({ title, level, ch: loc && !loc.ext ? loc.ch : -1, anchor: loc ? loc.anchor : null });
        walk(childEls(li).find(c => local(c) === 'ol' || local(c) === 'ul'), level + 1);
      }
    };
    walk(ol, 0);
    this.toc = this.toc.filter(t => t.ch >= 0);
  }

  _parseNcx(doc, base) {
    const map = byTag(doc, 'navMap')[0] || byTag(doc, 'navmap')[0];
    const walk = (el, level) => {
      for (const np of childEls(el, 'navpoint')) {
        const label = byTag(np, 'text')[0];
        const content = childEls(np, 'content')[0];
        const loc = content ? this.locate(base, content.getAttribute('src')) : null;
        const title = textOf(label);
        if (title && loc && !loc.ext) this.toc.push({ title, level, ch: loc.ch, anchor: loc.anchor });
        walk(np, level + 1);
      }
    };
    if (map) walk(map, 0);
  }

  async cover() {
    let path = this.coverPath;
    if (!path) {
      // первая картинка первых глав
      for (const ch of this.chapters.slice(0, 2)) {
        try {
          const doc = parseXml(await this.zip.text(ch.href), 'application/xhtml+xml');
          const im = byTag(doc, 'img')[0] || byTag(doc, 'image')[0];
          if (im) {
            const s = im.getAttribute('src') || im.getAttribute('xlink:href') || im.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
            if (s) { path = resolvePath(ch.href, s); break; }
          }
        } catch (e) { /* ignore */ }
      }
    }
    if (!path || !this.zip.has(path)) return null;
    return this.zip.blob(path, guessType(path));
  }

  async _url(path) {
    if (this.urls.has(path)) return this.urls.get(path);
    let url = null;
    if (this.zip.has(path)) {
      try { url = URL.createObjectURL(await this.zip.blob(path)); } catch (e) { url = null; }
    }
    this.urls.set(path, url);
    return url;
  }

  async _css(path) {
    if (this.cssCache.has(path)) return this.cssCache.get(path);
    let map = new Map();
    try { map = parseCssFlags(await this.zip.text(path)); } catch (e) { /* ignore */ }
    this.cssCache.set(path, map);
    return map;
  }

  /** Возвращает новый DocumentFragment с очищенным содержимым главы. */
  async fragment(i) {
    if (!this.cache.has(i)) {
      const ch = this.chapters[i];
      const doc = parseXml(await this.zip.text(ch.href), 'application/xhtml+xml');
      // классы из css
      const cls = new Map();
      for (const l of byTag(doc, 'link')) {
        if (!/stylesheet/i.test(l.getAttribute('rel') || '')) continue;
        const m = await this._css(resolvePath(ch.href, l.getAttribute('href') || ''));
        for (const [k, v] of m) cls.set(k, (cls.get(k) || '') + v);
      }
      for (const s of byTag(doc, 'style')) parseCssFlags(s.textContent, cls);
      // картинки — заранее превращаем в blob: URL
      const body = doc.body || byTag(doc, 'body')[0] || doc.documentElement;
      const imgPaths = new Map();
      for (const im of [...byTag(body, 'img'), ...byTag(body, 'image')]) {
        const s = im.getAttribute('src') || im.getAttribute('xlink:href') || im.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || im.getAttribute('href');
        if (s && !imgPaths.has(s)) imgPaths.set(s, await this._url(resolvePath(ch.href, s)));
      }
      const frag = sanitize(body, {
        cls,
        img: s => imgPaths.get(s) || null,
        link: href => this.locate(ch.href, href),
      });
      hideInlineNotes(frag);
      this.cache.set(i, frag);
      if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value);
    }
    return this.cache.get(i).cloneNode(true);
  }

  async note(ref) {
    if (!ref || ref.ch == null || !ref.anchor) return null;
    const frag = await this.fragment(ref.ch);
    const el = frag.querySelector(`[data-id="${cssEsc(ref.anchor)}"]`);
    return pickNote(el);
  }

  destroy() {
    for (const u of this.urls.values()) if (u) URL.revokeObjectURL(u);
    this.urls.clear();
    this.cache.clear();
  }
}

export function pickNote(el) {
  if (!el) return null;
  let box = el;
  const inline = /^(a|span|sup|sub|em|i|b|strong)$/;
  while (box && inline.test(box.localName) && box.parentElement) box = box.parentElement;
  if (!box) return null;
  // если якорь — пустой маркер перед текстом сноски, берём абзац целиком
  const text = (box.textContent || '').trim();
  if (!text || text.length > 4000) return null;
  const out = document.createElement('div');
  out.appendChild(box.cloneNode(true));
  // убираем обратные ссылки «↩»
  out.querySelectorAll('a.lnk').forEach(a => { if (/^[↩↑^]|^назад$|^back$/i.test((a.textContent || '').trim())) a.remove(); });
  return out;
}

export function cssEsc(s) {
  return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

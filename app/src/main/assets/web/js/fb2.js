import { parseXml, byTag, childEls, local, textOf, XLINK } from './content.js';
import { pickNote, cssEsc } from './epub.js';

const ENT = {
  nbsp: 160, mdash: 8212, ndash: 8211, laquo: 171, raquo: 187, hellip: 8230, copy: 169, reg: 174, trade: 8482,
  bdquo: 8222, ldquo: 8220, rdquo: 8221, lsquo: 8216, rsquo: 8217, sbquo: 8218, shy: 173, middot: 183, bull: 8226,
  deg: 176, times: 215, minus: 8722, euro: 8364, sect: 167, para: 182, frac12: 189, frac14: 188, frac34: 190,
  iexcl: 161, iquest: 191, prime: 8242, Prime: 8243, larr: 8592, rarr: 8594, uarr: 8593, darr: 8595, thinsp: 8201,
  ensp: 8194, emsp: 8195, zwnj: 8204, zwj: 8205, dagger: 8224, Dagger: 8225, permil: 8240, numero: 8470,
  acute: 180, cedil: 184, uml: 168, macr: 175, plusmn: 177, sup1: 185, sup2: 178, sup3: 179, micro: 181,
  eacute: 233, egrave: 232, agrave: 224, aacute: 225, ouml: 246, uuml: 252, auml: 228, szlig: 223, ccedil: 231,
};

function fixEntities(text) {
  return text.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, n) => {
    if (n === 'amp' || n === 'lt' || n === 'gt' || n === 'quot' || n === 'apos') return m;
    const c = ENT[n] || ENT[n.toLowerCase()];
    return c ? '&#' + c + ';' : '';
  }).replace(/&(?![a-zA-Z][a-zA-Z0-9]*;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
}

function parseFb2(text) {
  const p = new DOMParser();
  let doc = p.parseFromString(text, 'application/xml');
  if (!doc.getElementsByTagName('parsererror').length) return doc;
  doc = p.parseFromString(fixEntities(text), 'application/xml');
  if (!doc.getElementsByTagName('parsererror').length) return doc;
  // крайний случай — нестрогий HTML-разбор (переименовываем теги, которые HTML понимает по-своему)
  const t = fixEntities(text)
    .replace(/<\?xml[^>]*\?>/, '')
    .replace(/<(\/?)(title|image|style|table|body|description|binary|a)\b/gi, '<$1fb-$2');
  doc = p.parseFromString(t, 'text/html');
  doc.__html = true;
  return doc;
}

const name = el => local(el).replace(/^fb-/, '');
const kids = (el, n) => [...el.children].filter(c => !n || name(c) === n);
const href = el => el.getAttributeNS(XLINK, 'href') || el.getAttribute('l:href') || el.getAttribute('xlink:href') || el.getAttribute('href') || '';

export class Fb2Book {
  constructor() {
    this.format = 'fb2';
    this.urls = new Map();
  }

  static open(text, { metaOnly = false } = {}) {
    const b = new Fb2Book();
    b._init(text, metaOnly);
    return b;
  }

  _init(text, metaOnly) {
    const doc = parseFb2(text);
    const root = doc.documentElement && name(doc.documentElement) === 'fictionbook'
      ? doc.documentElement : ([...doc.getElementsByTagName('*')].find(e => name(e) === 'fictionbook') || doc.documentElement);
    this.root = root;

    // --- описание
    const all = n => [...root.getElementsByTagName('*')].filter(e => name(e) === n);
    const ti = all('title-info')[0] || root;
    const first = (el, n) => el && kids(el, n)[0];
    const meta = { title: '', authors: [], series: '', seriesIndex: '', lang: '', annotation: '' };
    meta.title = textOf(first(ti, 'book-title'));
    meta.authors = kids(ti, 'author').map(a => {
      const parts = ['first-name', 'middle-name', 'last-name'].map(n => textOf(first(a, n))).filter(Boolean);
      return parts.length ? [parts[0], parts[2] || parts[1]].filter(Boolean).join(' ') : textOf(first(a, 'nickname'));
    }).filter(Boolean);
    meta.lang = textOf(first(ti, 'lang'));
    meta.annotation = textOf(first(ti, 'annotation'));
    const seq = first(ti, 'sequence');
    if (seq) { meta.series = seq.getAttribute('name') || ''; meta.seriesIndex = seq.getAttribute('number') || ''; }
    this.meta = meta;
    const cp = first(ti, 'coverpage');
    const cimg = cp && [...cp.getElementsByTagName('*')].find(e => name(e) === 'image');
    this.coverId = cimg ? href(cimg).replace(/^#/, '') : null;

    // --- бинарные данные
    this.binaries = new Map();
    for (const b of kids(root, 'binary')) {
      this.binaries.set(b.getAttribute('id'), { type: b.getAttribute('content-type') || '', data: b.textContent });
    }
    if (metaOnly) { this.chapters = []; this.toc = []; return; }

    // --- тела книги
    const bodies = kids(root, 'body');
    const main = bodies.find(b => !b.getAttribute('name')) || bodies[0];
    const notesBodies = bodies.filter(b => b !== main);
    this.notes = new Map();
    for (const nb of notesBodies) {
      for (const s of nb.getElementsByTagName('*')) {
        const id = s.getAttribute('id');
        if (id && name(s) === 'section') this.notes.set(id, s);
      }
    }
    // все id основного текста
    this.ids = new Map();

    // --- разбивка на главы
    const chapters = [];
    const toc = [];
    let secN = 0;
    const secAnchor = new Map();
    const titleText = sec => {
      const t = kids(sec, 'title')[0];
      if (!t) return '';
      const ps = kids(t, 'p').map(textOf).filter(Boolean);
      return ps.length ? ps.join('. ').replace(/\.\.+/g, '.') : textOf(t);
    };
    const anchorFor = sec => {
      if (!secAnchor.has(sec)) secAnchor.set(sec, sec.getAttribute('id') || 'fbs-' + (++secN));
      return secAnchor.get(sec);
    };
    const textLen = el => (el.textContent || '').length;
    const push = (nodes, title, sec) => {
      if (!nodes.length) return;
      const size = nodes.reduce((a, n) => a + textLen(n), 0);
      chapters.push({ nodes, title, size: Math.max(size, 50), sec });
    };
    const collect = (sec, depth) => {
      const subs = kids(sec, 'section');
      const big = textLen(sec) > 120000;
      if (subs.length && (depth <= 1 || big)) {
        let pending = [];
        for (const c of sec.children) {
          if (name(c) === 'section') {
            push(pending, titleText(sec), sec);
            pending = [];
            collect(c, depth + 1);
          } else pending.push(c);
        }
        push(pending, titleText(sec), sec);
      } else if (big) {
        // огромная глава без подглав — режем на части по абзацам
        let part = [], len = 0;
        for (const c of sec.children) {
          part.push(c);
          len += textLen(c);
          if (len > 80000) { push(part, titleText(sec), sec); part = []; len = 0; }
        }
        push(part, titleText(sec), sec);
      } else {
        push([sec], titleText(sec), sec);
      }
    };
    if (main) {
      let pending = [];
      for (const c of main.children) {
        if (name(c) === 'section') {
          push(pending, meta.title, null);
          pending = [];
          collect(c, 1);
        } else pending.push(c);
      }
      push(pending, meta.title, null);
    }
    // примечания — отдельной главой в конце
    for (const nb of notesBodies) {
      const t = textOf(kids(nb, 'title')[0]) || (nb.getAttribute('name') === 'comments' ? 'Комментарии' : 'Примечания');
      push([...nb.children], t, null);
      chapters[chapters.length - 1].notes = true;
    }
    if (!chapters.length) throw new Error('В книге нет текста');

    // оглавление: для каждой главы находим секции с заголовками
    const seen = new Set();
    chapters.forEach((ch, i) => {
      const addSec = (sec, level) => {
        if (seen.has(sec)) return;
        seen.add(sec);
        const t = titleText(sec);
        if (t && level <= 3) toc.push({ title: t, level: Math.max(0, level), ch: i, anchor: anchorFor(sec) });
      };
      // секция, чья «голова» стала этой главой
      if (ch.sec && ch.nodes[0] && ch.nodes[0].parentElement === ch.sec && !ch.nodes.includes(ch.sec)) {
        addSec(ch.sec, depthOf(ch.sec) - 1);
      }
      if (ch.notes) { toc.push({ title: ch.title, level: 0, ch: i, anchor: null }); return; }
      for (const n of ch.nodes) {
        if (name(n) === 'section') addSec(n, depthOf(n) - 1);
        for (const s of n.getElementsByTagName('*')) if (name(s) === 'section') addSec(s, depthOf(s) - 1);
      }
    });
    function depthOf(sec) {
      let d = 0, p = sec;
      while (p && name(p) !== 'body') { if (name(p) === 'section') d++; p = p.parentElement; }
      return d;
    }
    this.secAnchor = secAnchor;
    // карта id -> глава
    chapters.forEach((ch, i) => {
      for (const n of ch.nodes) {
        const id = n.getAttribute && n.getAttribute('id');
        if (id) this.ids.set(id, i);
        for (const e of n.getElementsByTagName('*')) {
          const eid = e.getAttribute('id');
          if (eid && !this.ids.has(eid)) this.ids.set(eid, i);
        }
      }
    });
    this.chapters = chapters;
    this.toc = toc.length ? toc : chapters.map((c, i) => ({ title: c.title || 'Раздел ' + (i + 1), level: 0, ch: i, anchor: null }));
  }

  _blob(id) {
    const b = this.binaries.get(id);
    if (!b) return null;
    try {
      const bin = atob(b.data.replace(/\s+/g, ''));
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      let type = b.type;
      if (!type || type === 'application/octet-stream') type = /png$/i.test(id) ? 'image/png' : 'image/jpeg';
      return new Blob([u], { type });
    } catch (e) { return null; }
  }

  _url(id) {
    if (!this.urls.has(id)) {
      const b = this._blob(id);
      this.urls.set(id, b ? URL.createObjectURL(b) : null);
    }
    return this.urls.get(id);
  }

  async cover() {
    if (this.coverId) return this._blob(this.coverId);
    return null;
  }

  async fragment(i) {
    const ch = this.chapters[i];
    const frag = document.createDocumentFragment();
    for (const n of ch.nodes) frag.appendChild(this._conv(n, 1));
    return frag;
  }

  _conv(node, level) {
    if (node.nodeType === 3 || node.nodeType === 4) return document.createTextNode(node.nodeValue);
    if (node.nodeType !== 1) return document.createTextNode('');
    const n = name(node);
    let el;
    const kidsInto = (target, lvl = level) => { for (const c of node.childNodes) target.appendChild(this._conv(c, lvl)); return target; };
    switch (n) {
      case 'section': {
        el = document.createElement('div');
        el.className = 'section';
        const a = this.secAnchor.get(node) || node.getAttribute('id');
        if (a) el.setAttribute('data-id', a);
        let d = 0, p = node;
        while (p && name(p) !== 'body') { if (name(p) === 'section') d++; p = p.parentElement; }
        for (const c of node.childNodes) el.appendChild(this._conv(c, d));
        return el;
      }
      case 'title': {
        const h = document.createElement('h' + Math.min(6, Math.max(1, level + 1)));
        h.className = 'title';
        const ps = kids(node, 'p');
        if (ps.length) {
          ps.forEach((p, k) => {
            if (k) h.appendChild(document.createElement('br'));
            const sp = document.createElement('span');
            for (const c of p.childNodes) sp.appendChild(this._conv(c, level));
            h.appendChild(sp);
          });
        } else kidsInto(h);
        return h;
      }
      case 'p': el = document.createElement('p'); break;
      case 'subtitle': el = document.createElement('p'); el.className = 'subtitle'; break;
      case 'text-author': el = document.createElement('p'); el.className = 'text-author'; break;
      case 'epigraph': el = document.createElement('blockquote'); el.className = 'epigraph'; break;
      case 'cite': el = document.createElement('blockquote'); el.className = 'cite'; break;
      case 'annotation': el = document.createElement('div'); el.className = 'annotation'; break;
      case 'poem': el = document.createElement('div'); el.className = 'poem'; break;
      case 'stanza': el = document.createElement('div'); el.className = 'stanza'; break;
      case 'v': el = document.createElement('p'); el.className = 'v'; break;
      case 'date': el = document.createElement('p'); el.className = 'date'; break;
      case 'empty-line': el = document.createElement('div'); el.className = 'empty-line'; return el;
      case 'emphasis': el = document.createElement('em'); break;
      case 'strong': el = document.createElement('strong'); break;
      case 'strikethrough': el = document.createElement('s'); break;
      case 'sub': el = document.createElement('sub'); break;
      case 'sup': el = document.createElement('sup'); break;
      case 'code': el = document.createElement('code'); break;
      case 'style': el = document.createElement('span'); break;
      case 'table': el = document.createElement('table'); break;
      case 'tr': el = document.createElement('tr'); break;
      case 'td': case 'th': {
        el = document.createElement(n);
        for (const a of ['colspan', 'rowspan']) if (node.getAttribute(a)) el.setAttribute(a, node.getAttribute(a));
        break;
      }
      case 'image': {
        const id = href(node).replace(/^#/, '');
        const url = this._url(id);
        if (!url) return document.createTextNode('');
        const img = document.createElement('img');
        img.src = url;
        const alt = node.getAttribute('alt') || node.getAttribute('title');
        if (alt) img.alt = alt;
        const parent = node.parentElement && name(node.parentElement);
        if (parent === 'p' || parent === 'v' || parent === 'subtitle' || parent === 'td') return img;
        const w = document.createElement('div');
        w.className = 'imgp';
        w.appendChild(img);
        return w;
      }
      case 'a': {
        el = document.createElement('a');
        const h = href(node);
        el.className = 'lnk';
        if (h.startsWith('#')) {
          const id = h.slice(1);
          if (this.notes.has(id) || node.getAttribute('type') === 'note') {
            el.classList.add('noteref');
            el.setAttribute('data-note', id);
            if (this.ids.has(id)) el.setAttribute('data-ch', this.ids.get(id));
            el.setAttribute('data-anchor', id);
          } else if (this.ids.has(id)) {
            el.setAttribute('data-ch', this.ids.get(id));
            el.setAttribute('data-anchor', id);
          }
        } else if (h) {
          el.setAttribute('data-ext', h);
        }
        break;
      }
      default:
        el = document.createElement('span');
    }
    const id = node.getAttribute('id');
    if (id && !el.hasAttribute('data-id')) el.setAttribute('data-id', id);
    return kidsInto(el);
  }

  async note(ref) {
    const id = ref && (ref.note || ref.anchor);
    if (!id) return null;
    const sec = this.notes.get(id);
    if (sec) {
      const out = document.createElement('div');
      for (const c of sec.children) {
        if (name(c) === 'title') continue;
        out.appendChild(this._conv(c, 3));
      }
      return out.textContent.trim() ? out : null;
    }
    if (ref.ch != null) {
      const frag = await this.fragment(ref.ch);
      return pickNote(frag.querySelector(`[data-id="${cssEsc(id)}"]`));
    }
    return null;
  }

  destroy() {
    for (const u of this.urls.values()) if (u) URL.revokeObjectURL(u);
    this.urls.clear();
  }
}

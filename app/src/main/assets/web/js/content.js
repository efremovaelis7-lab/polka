// Очистка HTML глав: оставляем структуру текста, выкидываем скрипты/стили издателя,
// переводим курсив/жирный/выравнивание из CSS-классов в наши классы.

const DROP = new Set(['script', 'style', 'link', 'meta', 'title', 'head', 'iframe', 'object', 'embed', 'form',
  'input', 'button', 'select', 'textarea', 'audio', 'video', 'noscript', 'template', 'canvas', 'math', 'map', 'area']);

const KEEP = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'pre', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'figure', 'figcaption', 'hr', 'br',
  'span', 'a', 'em', 'i', 'strong', 'b', 'u', 's', 'del', 'ins', 'sub', 'sup', 'small', 'code', 'kbd', 'var',
  'abbr', 'mark', 'ruby', 'rt', 'rp', 'img', 'q', 'cite']);

const RENAME = {
  section: 'div', article: 'div', aside: 'div', nav: 'div', header: 'div', footer: 'div', main: 'div',
  center: 'div', big: 'span', font: 'span', tt: 'code', strike: 's', body: 'div', html: 'div', hgroup: 'div',
};

export const XLINK = 'http://www.w3.org/1999/xlink';
export const OPS = 'http://www.idpf.org/2007/ops';

export function parseXml(text, mime = 'application/xml') {
  const p = new DOMParser();
  let doc = p.parseFromString(text, mime);
  if (doc.getElementsByTagName('parsererror').length) {
    doc = p.parseFromString(text, 'text/html');
    doc.__html = true;
  }
  return doc;
}

export function local(el) {
  const n = (el.localName || el.nodeName || '').toLowerCase();
  const i = n.indexOf(':');
  return i >= 0 ? n.slice(i + 1) : n;
}

export function byTag(root, name) {
  const a = [...root.getElementsByTagNameNS('*', name)];
  if (a.length) return a;
  return [...root.getElementsByTagName(name)].concat(
    [...root.getElementsByTagName('*')].filter(e => local(e) === name && !a.includes(e)));
}

export function childEls(el, name) {
  return [...el.children].filter(c => !name || local(c) === name);
}

export function textOf(el) {
  return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
}

// ---------------------------------------------------------------- CSS → флаги

export function parseCssFlags(css, map = new Map()) {
  if (!css) return map;
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const decl = m[2].toLowerCase();
    let f = '';
    if (/font-style\s*:\s*(italic|oblique)/.test(decl)) f += 'i';
    if (/font-weight\s*:\s*(bold|bolder|[6-9]00)/.test(decl)) f += 'b';
    if (/text-align\s*:\s*center/.test(decl)) f += 'c';
    if (/text-align\s*:\s*right/.test(decl)) f += 'r';
    if (/text-indent\s*:\s*0(?![.\d])/.test(decl)) f += 'n';
    if (/font-variant\s*:\s*small-caps/.test(decl)) f += 'k';
    if (/display\s*:\s*none/.test(decl)) f += 'h';
    if (!f) continue;
    for (let sel of m[1].split(',')) {
      sel = sel.trim();
      const last = sel.split(/[\s>+~]+/).pop();
      const mm = last.match(/^(?:[a-z][\w-]*)?\.([\w-]+)$/i);
      if (!mm) continue;
      if (/\b(hover|before|after)\b/.test(sel)) continue;
      map.set(mm[1], (map.get(mm[1]) || '') + f);
    }
  }
  return map;
}

function styleFlags(style) {
  if (!style) return '';
  const s = style.toLowerCase();
  let f = '';
  if (/font-style\s*:\s*(italic|oblique)/.test(s)) f += 'i';
  if (/font-weight\s*:\s*(bold|bolder|[6-9]00)/.test(s)) f += 'b';
  if (/text-align\s*:\s*center/.test(s)) f += 'c';
  if (/text-align\s*:\s*right/.test(s)) f += 'r';
  if (/display\s*:\s*none/.test(s)) f += 'h';
  return f;
}

const FLAG_CLASS = { i: 'x-i', b: 'x-b', c: 'x-c', r: 'x-r', n: 'x-n', k: 'x-k' };

// ---------------------------------------------------------------- sanitize

/**
 * @param {Element} src — элемент исходного документа (body главы)
 * @param {object} ctx — { img(src)->url|null, link(href)->{ch,anchor}|{ext}|null, cls: Map }
 */
export function sanitize(src, ctx) {
  const frag = document.createDocumentFragment();
  for (const c of src.childNodes) walk(c, frag, ctx, 0);
  return frag;
}

function walk(node, out, ctx, depth) {
  if (depth > 60) return;
  if (node.nodeType === 3 || node.nodeType === 4) { // текст / CDATA
    out.appendChild(document.createTextNode(node.nodeValue));
    return;
  }
  if (node.nodeType !== 1) return;
  const name = local(node);
  if (DROP.has(name)) return;

  if (name === 'svg') { // обложки вида <svg><image xlink:href=…/></svg>
    const im = byTag(node, 'image')[0];
    if (im) {
      const href = im.getAttributeNS(XLINK, 'href') || im.getAttribute('xlink:href') || im.getAttribute('href');
      const url = href && ctx.img(href);
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'x-cover';
        const wrap = document.createElement('div');
        wrap.className = 'imgp';
        wrap.appendChild(img);
        out.appendChild(wrap);
      }
    }
    return;
  }

  // флаги из классов и style
  let flags = styleFlags(node.getAttribute && node.getAttribute('style'));
  const cls = node.getAttribute && node.getAttribute('class');
  if (cls && ctx.cls) for (const c of cls.split(/\s+/)) { const f = ctx.cls.get(c); if (f) flags += f; }
  if (flags.includes('h')) return;

  const epubType = (node.getAttributeNS && node.getAttributeNS(OPS, 'type')) || (node.getAttribute && node.getAttribute('epub:type')) || '';

  let tag = RENAME[name] || name;
  if (name === 'image') tag = 'img';
  if (!KEEP.has(tag)) {
    // неизвестный тег — разворачиваем
    for (const c of node.childNodes) walk(c, out, ctx, depth + 1);
    return;
  }

  const el = document.createElement(tag);
  const id = node.getAttribute('id') || (tag === 'a' && node.getAttribute('name'));
  if (id) el.setAttribute('data-id', id);
  for (const ch of flags) if (FLAG_CLASS[ch] && !el.classList.contains(FLAG_CLASS[ch])) el.classList.add(FLAG_CLASS[ch]);
  if (name === 'center') el.classList.add('x-c');
  if (name === 'cite') { el.classList.add('x-i'); }
  if (/footnote|endnote|rearnote|note\b/.test(epubType) && name !== 'a') el.classList.add('fn');
  if (cls && /\b(title|chapter|head)/i.test(cls) && /^(p|div)$/.test(tag)) el.classList.add('x-title');
  if (tag === 'td' || tag === 'th') {
    for (const a of ['colspan', 'rowspan']) if (node.getAttribute(a)) el.setAttribute(a, node.getAttribute(a));
  }

  if (tag === 'img') {
    const s = node.getAttribute('src') || node.getAttributeNS(XLINK, 'href') || node.getAttribute('xlink:href') || node.getAttribute('href');
    const url = s && ctx.img(s);
    if (!url) return;
    el.src = url;
    const alt = node.getAttribute('alt');
    if (alt) el.alt = alt;
    out.appendChild(el);
    return;
  }

  if (tag === 'a') {
    const href = node.getAttribute('href') || node.getAttributeNS(XLINK, 'href') || node.getAttribute('xlink:href');
    if (href) {
      const t = ctx.link(href);
      if (t && t.ext) el.setAttribute('data-ext', t.ext);
      else if (t) {
        el.setAttribute('data-ch', t.ch);
        if (t.anchor) el.setAttribute('data-anchor', t.anchor);
      }
      const txt = textOf(node);
      if (/noteref/.test(epubType) || /^[\[(]?(\d{1,4}|\*{1,3}|[a-zа-я])[\])]?$/i.test(txt) ||
          (node.parentNode && local(node.parentNode) === 'sup') || byTag(node, 'sup').length) {
        el.classList.add('noteref');
      }
      el.classList.add('lnk');
    }
  }

  for (const c of node.childNodes) walk(c, el, ctx, depth + 1);

  // абзац, где только картинка
  if (tag === 'p' || tag === 'div') {
    if (el.querySelector('img') && !textOf(el)) el.classList.add('imgp');
  }
  out.appendChild(el);
}

/** Прячет встроенные сноски (aside epub:type=footnote), если глава — не сами сноски. */
export function hideInlineNotes(frag) {
  const notes = frag.querySelectorAll('.fn');
  if (!notes.length) return;
  let noteLen = 0;
  notes.forEach(n => { noteLen += (n.textContent || '').length; });
  const total = (frag.textContent || '').length;
  if (noteLen < total * 0.5) notes.forEach(n => n.classList.add('fn-hidden'));
}

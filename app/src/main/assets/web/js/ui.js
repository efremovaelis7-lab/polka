// Общие элементы интерфейса: иконки, всплывашки, листы снизу, диалоги, кнопка «назад».

const P = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  toc: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>',
  type: '<path d="M3 19l5-13 5 13M4.8 14.5h6.4"/><path d="M15 12.5c.5-1.3 1.6-2 3-2 2 0 3 1.1 3 3V19M21 15.5c-.9-.4-1.9-.5-2.9-.4-1.7.2-2.8 1-2.8 2.2 0 1.1.9 1.9 2.2 1.9 1.6 0 2.9-.9 3.5-2.2"/>',
  scan: '<path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3"/><path d="M8 8.5h5.5a2 2 0 012 2V16H10a2 2 0 01-2-2z"/>',
  shelf: '<path d="M3 20h18M5 20V7h3v13M9 20V4h3.5v16M14 20l2.2-12 3 .6L17 20"/>',
  list: '<rect x="3" y="4" width="5" height="6" rx="1"/><rect x="3" y="14" width="5" height="6" rx="1"/><path d="M11 6h10M11 9h6M11 16h10M11 19h6"/>',
  sort: '<path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 015.5 4H19v14H5.5A1.5 1.5 0 004 19.5zM4 19.5A1.5 1.5 0 005.5 21H19v-3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  bolt: '<path d="M13 2.5L4.5 13.5H11L10 21.5l8.5-11H12z"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  file: '<path d="M6 3h8l5 5v12a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v5h5"/>',
  font: '<path d="M5 20L11 4h2l6 16M7.5 14h9"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------- назад

const stack = [];
export const back = {
  push(fn) { const t = { fn }; stack.push(t); return t; },
  remove(t) { const i = stack.indexOf(t); if (i >= 0) stack.splice(i, 1); },
  handle() {
    const t = stack.pop();
    if (!t) return false;
    t.fn();
    return true;
  },
};
window.__polkaBack = () => back.handle();

// ---------------------------------------------------------------- тосты

let toastEl = null, toastTimer = 0;
export function toast(msg, ms = 2600) {
  if (!toastEl) {
    toastEl = h('div', { class: 'toast' });
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// ---------------------------------------------------------------- лист снизу

export function sheet({ title, content, cls = '', onClose, full = false } = {}) {
  const scrim = h('div', { class: `scrim ${cls}` });
  const panel = h('div', { class: `sheet ${cls} ${full ? 'full' : ''}` },
    h('div', { class: 'sheet-grip' }),
    title ? h('div', { class: 'sheet-title' }, h('span', { text: title }),
      h('button', { class: 'icon-btn sheet-x', 'aria-label': 'Закрыть', html: icon('close'), onclick: () => close() })) : null,
    h('div', { class: 'sheet-body' }, content));
  document.body.append(scrim, panel);
  requestAnimationFrame(() => { scrim.classList.add('show'); panel.classList.add('show'); });
  let closed = false;
  const bt = back.push(() => close(true));
  function close(fromBack) {
    if (closed) return;
    closed = true;
    if (!fromBack) back.remove(bt);
    scrim.classList.remove('show');
    panel.classList.remove('show');
    setTimeout(() => { scrim.remove(); panel.remove(); }, 320);
    onClose && onClose();
  }
  scrim.addEventListener('click', () => close());
  // свайп вниз по ручке/заголовку
  let y0 = null;
  const head = panel.querySelector('.sheet-grip');
  const titleEl = panel.querySelector('.sheet-title');
  for (const el of [head, titleEl]) {
    if (!el) continue;
    el.addEventListener('pointerdown', e => { y0 = e.clientY; panel.style.transition = 'none'; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => { if (y0 != null) panel.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
    el.addEventListener('pointerup', e => {
      if (y0 == null) return;
      const dy = e.clientY - y0; y0 = null;
      panel.style.transition = ''; panel.style.transform = '';
      if (dy > 80) close();
    });
  }
  return { el: panel, body: panel.querySelector('.sheet-body'), close };
}

export function confirmDialog({ title, text, ok = 'Да', cancel = 'Отмена', danger = false }) {
  return new Promise(resolve => {
    const scrim = h('div', { class: 'scrim show dialog-scrim' });
    const box = h('div', { class: 'dialog' },
      title ? h('div', { class: 'dialog-title', text: title }) : null,
      text ? h('div', { class: 'dialog-text', text }) : null,
      h('div', { class: 'dialog-btns' },
        cancel ? h('button', { class: 'btn ghost', text: cancel, onclick: () => done(false) }) : null,
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, text: ok, onclick: () => done(true) })));
    document.body.append(scrim, box);
    requestAnimationFrame(() => box.classList.add('show'));
    const bt = back.push(() => done(false, true));
    scrim.addEventListener('click', () => done(false));
    function done(v, fromBack) {
      if (!fromBack) back.remove(bt);
      box.classList.remove('show');
      scrim.remove();
      setTimeout(() => box.remove(), 200);
      resolve(v);
    }
  });
}

export function debounce(fn, ms) {
  let t = 0;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

export function hashStr(s) {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h1 ^= s.charCodeAt(i); h1 = Math.imul(h1, 0x01000193); }
  return (h1 >>> 0).toString(36);
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

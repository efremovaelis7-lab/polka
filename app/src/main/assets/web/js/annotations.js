// Выделения цитат, заметки и закладки.
// Место в тексте хранится как (номер блока data-i, смещение в символах) — не зависит от шрифта и размера.

export const COLORS = [
  ['yellow', 'Жёлтый'], ['green', 'Зелёный'], ['blue', 'Голубой'], ['pink', 'Розовый'], ['purple', 'Сиреневый'],
];

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** (узел, смещение) → {i, off} относительно блока с data-i */
export function toAnchor(root, node, offset) {
  const el = node.nodeType === 1 ? node : node.parentElement;
  if (!el) return null;
  let block = el.closest('[data-i]');
  if (!block && node.nodeType === 1 && node.childNodes[offset]) {
    const c = node.childNodes[offset];
    block = c.nodeType === 1 ? (c.matches('[data-i]') ? c : c.querySelector('[data-i]')) : null;
    if (block) return { i: +block.dataset.i, off: 0 };
  }
  if (!block || !root.contains(block)) return null;
  const r = document.createRange();
  r.setStart(block, 0);
  try { r.setEnd(node, offset); } catch (e) { return { i: +block.dataset.i, off: 0 }; }
  return { i: +block.dataset.i, off: r.toString().length };
}

/** {i, off} → (текстовый узел, смещение) */
export function fromAnchor(root, a) {
  const block = root.querySelector(`[data-i="${a.i}"]`);
  if (!block) return null;
  const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let left = a.off, last = null;
  while (w.nextNode()) {
    const t = w.currentNode;
    const len = t.nodeValue.length;
    if (left <= len) return { node: t, offset: left };
    left -= len;
    last = t;
  }
  return last ? { node: last, offset: last.nodeValue.length } : { node: block, offset: block.childNodes.length };
}

function rangeFor(root, n) {
  const s = fromAnchor(root, n.s), e = fromAnchor(root, n.e);
  if (!s || !e) return null;
  const r = document.createRange();
  try {
    r.setStart(s.node, s.offset);
    r.setEnd(e.node, e.offset);
  } catch (er) { return null; }
  return r.collapsed ? null : r;
}

/** Оборачивает текст диапазона в <mark>. */
export function wrapRange(range, n) {
  const root = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentNode;
  const nodes = [];
  if (range.startContainer === range.endContainer && range.startContainer.nodeType === 3) nodes.push(range.startContainer);
  else {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) if (range.intersectsNode(w.currentNode)) nodes.push(w.currentNode);
  }
  const marks = [];
  for (const t of nodes) {
    let start = t === range.startContainer ? range.startOffset : 0;
    let end = t === range.endContainer ? range.endOffset : t.nodeValue.length;
    if (end <= start) continue;
    let target = t;
    if (start > 0) target = target.splitText(start);
    if (end - start < target.nodeValue.length) target.splitText(end - start);
    if (!target.nodeValue.trim() && marks.length === 0 && nodes.length > 1) { /* пробел на краю */ }
    const m = document.createElement('mark');
    m.className = markClass(n);
    m.dataset.a = n.id;
    target.parentNode.insertBefore(m, target);
    m.appendChild(target);
    marks.push(m);
  }
  return marks;
}

export function markClass(n) {
  return `hl hl-${n.color || 'yellow'}${n.note ? ' has-note' : ''}`;
}

export function applyHighlights(root, list) {
  const sorted = [...list].sort((a, b) => a.s.i - b.s.i || a.s.off - b.s.off);
  for (const n of sorted) {
    const r = rangeFor(root, n);
    if (r) wrapRange(r, n);
  }
}

export function removeMarks(root, id) {
  root.querySelectorAll(`mark[data-a="${id}"]`).forEach(m => {
    const p = m.parentNode;
    while (m.firstChild) p.insertBefore(m.firstChild, m);
    p.removeChild(m);
    p.normalize();
  });
}

export function updateMarks(root, n) {
  root.querySelectorAll(`mark[data-a="${n.id}"]`).forEach(m => { m.className = markClass(n); });
}

export function quoteText(text, meta) {
  const t = text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  const who = [(meta.authors || []).join(', '), meta.title ? `«${meta.title}»` : ''].filter(Boolean).join(', ');
  return `«${t}»` + (who ? `\n\n— ${who}` : '');
}

/** Текст выделения с переносами между абзацами и без номеров сносок. */
export function rangeText(range) {
  const root = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentNode;
  const nodes = [];
  if (range.startContainer === range.endContainer && range.startContainer.nodeType === 3) nodes.push(range.startContainer);
  else {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) if (range.intersectsNode(w.currentNode)) nodes.push(w.currentNode);
  }
  let out = '', lastBlock = null;
  for (const t of nodes) {
    const p = t.parentElement;
    if (p && p.closest('a.noteref, .rd-end')) continue;
    const block = p && p.closest('[data-i]');
    let v = t.nodeValue;
    if (t === range.endContainer) v = v.slice(0, range.endOffset);
    if (t === range.startContainer) v = v.slice(range.startOffset);
    if (lastBlock && block !== lastBlock) out = out.replace(/\s+$/, '') + '\n';
    out += v;
    lastBlock = block;
  }
  return out.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

// Бионическое чтение: начало каждого слова выделяется жирным, глаз «цепляется» за опоры.

const WORD = /[\p{L}\p{M}\p{N}]+/gu;
const HAS_LETTER = /\p{L}/u;
const SKIP = 'h1,h2,h3,h4,h5,h6,b,strong,code,pre,.title,.bn,sup,sub,.subtitle,.x-b';

export function fixLength(n, strength) {
  if (n <= 1) return 1;
  return Math.min(n, Math.max(1, Math.round(n * strength)));
}

export function bionicify(root, strength = 0.45) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (p.closest(SKIP)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const t of nodes) {
    const s = t.nodeValue;
    WORD.lastIndex = 0;
    let m, last = 0, frag = null;
    while ((m = WORD.exec(s))) {
      const w = m[0];
      if (!HAS_LETTER.test(w)) continue;
      const k = fixLength(w.length, strength);
      if (!frag) frag = document.createDocumentFragment();
      if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      const b = document.createElement('b');
      b.className = 'bn';
      b.textContent = w.slice(0, k);
      frag.appendChild(b);
      if (k < w.length) frag.appendChild(document.createTextNode(w.slice(k)));
      last = m.index + w.length;
    }
    if (frag) {
      if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
      t.parentNode.replaceChild(frag, t);
    }
  }
}

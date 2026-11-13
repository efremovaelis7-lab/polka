import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
const OUT = '/home/claude/polka/dev/out';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2 });
await ctx.addInitScript({ path: '/home/claude/polka/dev/mock-native.js' });
const p = await ctx.newPage();
const errs = [];
p.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('404')) errs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', e => errs.push('pageerror: ' + e.message + '\n' + e.stack));
const shot = async (n, w = 350) => { await p.waitForTimeout(w); await p.screenshot({ path: `${OUT}/n-${n}.png` }); console.log('shot', n); };
await p.goto('http://localhost:8765/web/index.html');
await p.waitForTimeout(2200);
// fake stats for tracker
await p.evaluate(() => new Promise(res => {
  const r = indexedDB.open('polka', 2);
  r.onsuccess = () => {
    const db = r.result; const t = db.transaction('kv', 'readwrite');
    const days = {}; const z = n => String(n).padStart(2, '0');
    [35, 12, 0, 22, 41, 18].forEach((m, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); days[`${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`] = { sec: m * 60, pages: m * 2 }; });
    t.objectStore('kv').put({ days, yearGoal: 12, dayGoal: 20 }, 'stats'); t.oncomplete = res;
  };
}));
await p.reload(); await p.waitForTimeout(1800);
await p.evaluate(async () => {
  const L = window.__polka.library;
  const bs = L.books;
  await L.setStatus(bs.find(x => x.title.includes('Сжатая')), 'want');
  const d = bs.find(x => x.title.includes('1251')); await L.setStatus(d, 'done');
});
await p.waitForTimeout(500);
await shot('shelf-tabs');
// open the book
await p.evaluate(() => { window.__polka.settings.set({ theme: 'sepia', bionic: false }); const b = window.__polka.library.books.find(x => x.title.includes('Счастливые')); window.__polka.openBook(b); });
await p.waitForTimeout(1500);
await p.evaluate(() => window.__polka.reader.goTo({ ch: 1, i: 0 }));
await p.waitForTimeout(500);
const select = (i1, o1, i2, o2) => p.evaluate(([i1, o1, i2, o2]) => {
  const root = window.__polka.reader.front.content;
  const tn = (i, off) => { const el = root.querySelector(`[data-i="${i}"]`); const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let left = off; while (w.nextNode()) { const l = w.currentNode.nodeValue.length; if (left <= l) return [w.currentNode, left]; left -= l; } };
  const [a, ao] = tn(i1, o1), [bb, bo] = tn(i2, o2);
  const r = document.createRange(); r.setStart(a, ao); r.setEnd(bb, bo);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}, [i1, o1, i2, o2]);
await select(1, 0, 1, 50);
await shot('selbar', 500);
await p.click('.sel-bar .sb-dot.hl-yellow');
await p.waitForTimeout(300);
await select(4, 10, 5, 40);
await p.waitForTimeout(400);
await p.click('.sel-bar .sb-dot.hl-pink');
await p.waitForTimeout(300);
await select(6, 0, 6, 60);
await p.waitForTimeout(400);
await p.click('.sel-bar .sb-btn >> nth=0');
await p.waitForTimeout(600);
await p.fill('.an-text', 'Важная мысль для моей новой книги!');
await shot('note-edit', 200);
await p.click('.an-sheet .btn.primary');
await p.waitForTimeout(500);
await shot('highlights', 300);
console.log('marks on page', await p.evaluate(() => window.__polka.reader.front.content.querySelectorAll('mark.hl').length), 'notes', await p.evaluate(() => window.__polka.reader.notes.length));
// tap on the pink highlight
const mk = await p.locator('.rd mark.hl-pink').first().boundingBox();
await p.mouse.click(mk.x + 10, mk.y + 8);
await shot('note-card', 500);
await p.evaluate(() => window.__polkaBack()); await p.waitForTimeout(400);
// turn pages forward and back — highlights persist
await p.mouse.click(400, 430); await p.waitForTimeout(900);
await p.mouse.click(10, 430); await p.waitForTimeout(900);
console.log('marks after turn', await p.evaluate(() => window.__polka.reader.front.content.querySelectorAll('mark.hl').length));
// bookmark via corner tap
await p.mouse.click(395, 30); await p.waitForTimeout(400);
await shot('bookmark', 300);
// close & reopen
await p.evaluate(() => window.__polkaBack()); await p.waitForTimeout(800);
await p.evaluate(() => { const b = window.__polka.library.books.find(x => x.title.includes('Счастливые')); window.__polka.openBook(b); });
await p.waitForTimeout(1500);
console.log('after reopen marks', await p.evaluate(() => window.__polka.reader.front.content.querySelectorAll('mark.hl').length), 'ribbon', await p.evaluate(() => document.querySelector('.rd').classList.contains('bookmarked')));
// notes list
await p.mouse.click(206, 430); await p.waitForTimeout(300);
await p.click('[aria-label="Заметки"]');
await shot('notes-list', 600);
await p.evaluate(() => window.__polkaBack()); await p.waitForTimeout(400);
// themes
await p.evaluate(() => window.__polka.settings.set({ theme: 'matrix' }));
await shot('matrix', 500);
await p.evaluate(() => window.__polka.settings.set({ theme: 'black', bionic: true }));
await shot('black-bionic', 600);
await p.evaluate(() => window.__polka.settings.set({ theme: 'sepia', bionic: false }));
await p.evaluate(() => { while (!window.__polka.reader.hidden && window.__polkaBack()); }); await p.waitForTimeout(800);
// tracker
await p.click('[aria-label="Трекер чтения"]');
await shot('tracker', 700);
await p.evaluate(() => document.querySelector('.tracker-sheet .sheet-body').scrollTop = 600);
await shot('tracker2', 300);
await p.evaluate(() => window.__polkaBack()); await p.waitForTimeout(400);
await p.evaluate(() => window.__polka.settings.set({ shelfTab: 'done' }));
await shot('tab-done', 500);
await p.evaluate(() => window.__polka.settings.set({ shelfTab: 'all' }));
console.log(errs.join('\n'));
console.log((await p.evaluate(() => window.__mockLog)).filter(x => !x.startsWith('bars')).join(' | '));
await b.close();

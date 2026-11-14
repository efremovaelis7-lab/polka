import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
const OUT = '/home/claude/polka/dev/out';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2 });
await ctx.addInitScript({ path: '/home/claude/polka/dev/mock-native.js' });
const p = await ctx.newPage();
const errs = [];
p.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('404')) errs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', e => errs.push('pageerror: ' + e.message + '\n' + e.stack));
const shot = async (n, w = 350) => { await p.waitForTimeout(w); await p.screenshot({ path: `${OUT}/g-${n}.png` }); console.log('shot', n); };
await p.goto('http://localhost:8765/web/index.html');
await p.waitForTimeout(2200);
await p.evaluate(() => { const b = window.__polka.library.books.find(x => x.title.includes('Счастливые')); window.__polka.openBook(b); });
await p.waitForTimeout(1500);
await p.evaluate(() => window.__polka.reader.goTo({ ch: 1, i: 0 }));
await p.waitForTimeout(400);
// highlights for quotes tab
const select = (i1, o1, i2, o2) => p.evaluate(([i1, o1, i2, o2]) => {
  const root = window.__polka.reader.front.content;
  const tn = (i, off) => { const el = root.querySelector(`[data-i="${i}"]`); const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let left = off; while (w.nextNode()) { const l = w.currentNode.nodeValue.length; if (left <= l) return [w.currentNode, left]; left -= l; } };
  const [a, ao] = tn(i1, o1), [bb, bo] = tn(i2, o2);
  const r = document.createRange(); r.setStart(a, ao); r.setEnd(bb, bo);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}, [i1, o1, i2, o2]);
await select(1, 0, 1, 70); await p.waitForTimeout(400); await p.click('.sel-bar .sb-dot.hl-yellow'); await p.waitForTimeout(300);
await select(5, 0, 5, 80); await p.waitForTimeout(400); await p.click('.sel-bar .sb-dot.hl-green'); await p.waitForTimeout(300);
// settings panel
await p.mouse.click(206, 430); await p.waitForTimeout(300);
await p.click('[aria-label="Оформление"]');
await shot('panel-top', 600);
await p.click('.style-chip[data-style="gentle-day"]');
await p.waitForTimeout(800);
await shot('panel-after-style', 300);
await p.evaluate(() => window.__polkaBack()); await p.waitForTimeout(500);
await shot('gentle-day-page', 500);
console.log('settings', await p.evaluate(() => { const s = window.__polka.settings.all(); return [s.theme, s.font, s.fontSize, s.align, s.bionic, s.stroke, s.letterSpacing]; }));
await p.evaluate(() => window.__polka.settings.set({ theme: 'softnight', dim: 0.15, warm: 0.3, stroke: 0 }));
await shot('soft-night', 600);
await p.evaluate(() => window.__polka.reader.eyeBreak());
await shot('eye-break', 600);
await p.evaluate(() => window.__polkaBack()); await p.waitForTimeout(400);
// save my style via panel
await p.mouse.click(206, 430); await p.waitForTimeout(300);
await p.click('[aria-label="Оформление"]'); await p.waitForTimeout(500);
await p.click('.style-chip.add'); await p.waitForTimeout(300);
await p.fill('.dialog-input', 'Вечер у окна');
await p.click('.dialog .btn.primary'); await p.waitForTimeout(600);
await p.evaluate(() => document.querySelector('.settings-sheet .sheet-body').scrollTop = 0);
await shot('my-style', 400);
await p.evaluate(() => document.querySelector('.settings-sheet .sheet-body').scrollTop = 900);
await shot('panel-clarity', 400);
await p.evaluate(() => document.querySelector('.settings-sheet .sheet-body').scrollTop = 99999);
await shot('panel-screen', 400);
console.log('styles', await p.evaluate(() => JSON.stringify(window.__polka.settings.get('styles').map(s => s.name))));
await p.evaluate(() => { while (!window.__polka.reader.hidden && window.__polkaBack()); }); await p.waitForTimeout(800);
// quotes tab
await p.evaluate(() => window.__polka.settings.set({ shelfTab: 'quotes' }));
await shot('quotes-tab', 700);
// open from quote
await p.click('.qc-main >> nth=1'); await p.waitForTimeout(1500);
console.log('opened at quote', await p.evaluate(() => { const r = window.__polka.reader; return { hidden: r.hidden, ch: r.ch, page: r.page, marks: r.front.content.querySelectorAll('mark.hl').length }; }));
await p.evaluate(() => { while (!window.__polka.reader.hidden && window.__polkaBack()); }); await p.waitForTimeout(800);
await p.evaluate(() => window.__polka.settings.set({ shelfTab: 'all' }));
for (const sh of ['white', 'birch', 'ash', 'wenge']) {
  await p.evaluate(s => window.__polka.settings.set({ shelfTheme: s }), sh);
  await shot('shelf-' + sh, 500);
}
await p.click('[aria-label="Меню"]'); await shot('shelf-menu', 500);
console.log(errs.join('\n'));
await b.close();

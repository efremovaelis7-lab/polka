import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
const OUT = '/home/claude/polka/dev/out';
const b = await chromium.launch();
const errs = [];
async function page(W, H) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5 });
  await ctx.addInitScript({ path: '/home/claude/polka/dev/mock-native.js' });
  const p = await ctx.newPage();
  p.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('404')) errs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message + '\n' + e.stack));
  await p.goto('http://localhost:8765/web/index.html');
  await p.waitForTimeout(2200);
  return p;
}
const shot = async (p, n, wait = 350) => { await p.waitForTimeout(wait); await p.screenshot({ path: `${OUT}/s-${n}.png` }); console.log('shot', n); };
const st = p => p.evaluate(() => { const r = window.__polka.reader; return { ch: r.ch, page: r.page, pages: r.front.pages, spread: r.spread }; });

let p = await page(1280, 800);
await shot(p, 'shelf-wide');
await p.evaluate(() => { const b = window.__polka.library.books.find(x => x.title.includes('Зимнее')); window.__polka.openBook(b); });
await p.waitForTimeout(1500);
await p.evaluate(() => window.__polka.reader.goTo({ ch: 2, i: 0 }));
await p.waitForTimeout(500);
console.log(await st(p));
await shot(p, 'spread');
await p.evaluate(async () => {
  const r = window.__polka.reader; r.busy = true;
  window.__st = await r.startTurn(1, r.H);
  r.curl.update({ x: r.W * 0.55, y: r.H * 0.8 });
});
await shot(p, 'spread-curl', 200);
await p.evaluate(() => { const r = window.__polka.reader; r.curl.update({ x: r.W * 0.18, y: r.H * 0.9 }); });
await shot(p, 'spread-curl2', 200);
await p.evaluate(() => { const r = window.__polka.reader; r.finishTurn(window.__st, false); });
await p.mouse.click(1200, 400);
await p.waitForTimeout(900);
console.log('after tap', await st(p));
// footnote
await p.evaluate(() => window.__polka.reader.goTo({ ch: 2, i: 0 }));
await p.waitForTimeout(500);
const has = await p.evaluate(() => !!window.__polka.reader.front.content.querySelector('a.noteref'));
console.log('noteref present', has);
await p.evaluate(() => { const a = window.__polka.reader.front.content.querySelector('a.noteref'); window.__polka.reader.followLink(a); });
await shot(p, 'note', 600);
await p.evaluate(() => window.__polkaBack());
// phone scroll mode
const q = await page(412, 860);
await q.evaluate(() => { window.__polka.settings.set({ mode: 'scroll' }); const b = window.__polka.library.books.find(x => x.title.includes('Зимнее')); window.__polka.openBook(b); });
await q.waitForTimeout(1500);
await q.evaluate(() => window.__polka.reader.goTo({ ch: 2, i: 0 }));
await shot(q, 'scroll', 500);
await q.evaluate(() => window.__polka.settings.set({ mode: 'pages', anim: 'slide' }));
await q.waitForTimeout(600);
console.log('pages again', await st(q));
await q.mouse.move(350, 500); await q.mouse.down();
for (let i = 1; i <= 8; i++) { await q.mouse.move(350 - i * 18, 500); await q.waitForTimeout(16); }
await shot(q, 'slide-mid', 100);
await q.mouse.up();
await q.waitForTimeout(700);
console.log('after slide', await st(q));
await q.evaluate(() => window.__polka.settings.set({ anim: 'curl' }));
// back to shelf to see progress
await q.evaluate(() => window.__polkaBack());
await q.waitForTimeout(900);
await shot(q, 'shelf-after', 300);
console.log(errs.join('\n'));
await b.close();

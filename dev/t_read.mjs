import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
const OUT = '/home/claude/polka/dev/out';
const W = +(process.env.W || 412), H = +(process.env.H || 860);
const pref = process.env.PREF || 'r';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: false });
await ctx.addInitScript({ path: '/home/claude/polka/dev/mock-native.js' });
const p = await ctx.newPage();
const errs = [];
p.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('404')) errs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', e => errs.push('pageerror: ' + e.message + '\n' + e.stack));
const shot = async (n, wait = 350) => { await p.waitForTimeout(wait); await p.screenshot({ path: `${OUT}/${pref}-${n}.png` }); console.log('shot', n); };
await p.goto('http://localhost:8765/web/index.html');
await p.waitForTimeout(2200);
const book = process.env.BOOK || 'Счастливые';
await p.evaluate((t) => { const b = window.__polka.library.books.find(x => x.title.includes(t)); window.__polka.openBook(b); }, book);
await p.waitForTimeout(1500);
await p.evaluate(() => window.__polka.reader.goTo({ ch: +(new URLSearchParams('').get('x') || 1), i: 0 }));
await p.waitForTimeout(500);
const state = () => p.evaluate(() => { const r = window.__polka.reader; return { ch: r.ch, page: r.page, pages: r.front.pages, spread: r.spread }; });
console.log('state', await state());
// 1. tap right
await p.mouse.click(W * 0.9, H * 0.5);
await p.waitForTimeout(900);
console.log('after tap', await state());
// 2. mid-curl (programmatic)
await p.evaluate(async ([fx, fy]) => {
  const r = window.__polka.reader; r.busy = true;
  window.__st = await r.startTurn(1, r.H);
  r.curl.update({ x: r.W * fx, y: r.H * fy });
}, [0.42, 0.74]);
await shot('curl-mid', 200);
await p.evaluate(() => { const r = window.__polka.reader; r.finishTurn(window.__st, false); });
// 3. real drag with mouse (pointer events)
await p.mouse.move(W * 0.85, H * 0.8);
await p.mouse.down();
for (let i = 1; i <= 12; i++) { await p.mouse.move(W * 0.85 - i * W * 0.04, H * 0.8 - i * 4); await p.waitForTimeout(16); }
await shot('drag-mid', 120);
await p.mouse.up();
await p.waitForTimeout(900);
console.log('after drag', await state());
// 4. backwards tap
await p.mouse.click(W * 0.1, H * 0.5);
await p.waitForTimeout(900);
console.log('after back tap', await state());
// chrome + settings
await p.mouse.click(W * 0.5, H * 0.5);
await shot('chrome');
await p.click('[aria-label="Оформление"]');
await shot('settings', 600);
await p.evaluate(() => document.querySelector('.settings-sheet .sheet-body').scrollTop = 520);
await shot('settings2', 300);
await p.evaluate(() => window.__polka.settings.set({ bionic: true }));
await p.waitForTimeout(400);
await p.evaluate(() => document.querySelector('.settings-sheet .sheet-body').scrollTop = 520);
await shot('settings-bionic', 400);
await p.evaluate(() => window.__polka.reader.app && window.__polka.reader.app);
await p.keyboard.press('Escape');
await p.evaluate(() => window.__polkaBack());
await p.waitForTimeout(400);
await shot('bionic-page', 500);
await p.evaluate(() => window.__polka.settings.set({ theme: 'night' }));
await shot('bionic-night', 500);
await p.evaluate(() => window.__polka.settings.set({ bionic: false, theme: 'black' }));
await shot('black', 500);
await p.evaluate(() => window.__polka.settings.set({ theme: 'sepia' }));
// toc
await p.mouse.click(W * 0.5, H * 0.5);
await p.waitForTimeout(300);
await p.click('[aria-label="Оглавление"]');
await shot('toc', 600);
await p.evaluate(() => window.__polkaBack());
await p.waitForTimeout(400);
console.log(errs.join('\n'));
await b.close();

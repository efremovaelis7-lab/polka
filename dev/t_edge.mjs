import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
const OUT = '/home/claude/polka/dev/out';
const b = await chromium.launch();
const errs = [];
const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 1 });
await ctx.addInitScript({ path: '/home/claude/polka/dev/mock-native.js' });
const p = await ctx.newPage();
p.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('404')) errs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', e => errs.push('pageerror: ' + e.message + '\n' + e.stack));
await p.goto('http://localhost:8765/web/index.html');
await p.waitForTimeout(2200);
const st = () => p.evaluate(() => { const r = window.__polka.reader; return { ch: r.ch, page: r.page, pages: r.front.pages }; });
await p.evaluate(() => { window.__polka.settings.set({ mode: 'pages', anim: 'curl', bionic: false }); const b = window.__polka.library.books.find(x => x.title.includes('Счастливые')); window.__polka.openBook(b); });
await p.waitForTimeout(1500);
await p.evaluate(() => window.__polka.reader.goTo({ ch: 1, last: true }));
await p.waitForTimeout(400);
console.log('at end of ch1', await st());
await p.mouse.click(400, 400); await p.waitForTimeout(900);
console.log('next -> ch2 p0', await st());
await p.mouse.click(10, 400); await p.waitForTimeout(900);
console.log('prev -> ch1 last', await st());
// fast taps
for (let i = 0; i < 5; i++) { await p.mouse.click(400, 400); await p.waitForTimeout(60); }
await p.waitForTimeout(1500);
console.log('after 5 fast taps', await st());
// keyboard
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(800);
console.log('after key', await st());
const before = await st();
// close and reopen: position restore
await p.evaluate(() => window.__polkaBack()); await p.waitForTimeout(800);
const saved = await p.evaluate(() => window.__polka.library.books.find(x => x.title.includes('Счастливые')).pos);
console.log('saved pos', saved);
await p.evaluate(() => { const b = window.__polka.library.books.find(x => x.title.includes('Счастливые')); window.__polka.openBook(b); });
await p.waitForTimeout(1500);
console.log('restored', await st(), 'expected', before);
// font size change keeps position
const a1 = await p.evaluate(() => window.__polka.reader.anchorNow());
await p.evaluate(() => window.__polka.settings.set({ fontSize: 24 }));
await p.waitForTimeout(800);
const a2 = await p.evaluate(() => window.__polka.reader.anchorNow());
console.log('anchor before/after font change', a1.i, a2.i, await st());
await p.evaluate(() => window.__polka.settings.set({ fontSize: 19 }));
await p.waitForTimeout(500);
// internal link to ch3#mid
await p.evaluate(() => window.__polka.reader.goTo({ ch: 1, i: 0 }));
await p.waitForTimeout(400);
await p.evaluate(() => { const a = [...window.__polka.reader.front.content.querySelectorAll('a.lnk')].find(a => a.dataset.anchor === 'mid'); window.__polka.reader.followLink(a); });
await p.waitForTimeout(700);
const vis = await p.evaluate(() => { const r = window.__polka.reader; const el = r.front.content.querySelector('[data-id="mid"]'); return { ch: r.ch, page: r.page, elPage: r.front.pageOf(el), linkBack: r.linkBackBtn.classList.contains('show') }; });
console.log('after link', vis);
await p.click('.link-back'); await p.waitForTimeout(600);
console.log('back from link', await st());
await p.evaluate(() => window.__polkaBack()); await p.waitForTimeout(600);
// import via picker
await p.evaluate(() => { window.__pickNames = 'zimnee.fb2'; });
await p.click('[aria-label="Добавить книги"]');
await p.waitForTimeout(2000);
console.log('reader open after import?', await p.evaluate(() => !window.__polka.reader.hidden), 'books', await p.evaluate(() => window.__polka.library.books.length));
await p.evaluate(() => window.__polkaBack()); await p.waitForTimeout(600);
// long press menu on first book -> remove
const box = await p.locator('.book').first().boundingBox();
await p.mouse.move(box.x + 20, box.y + 40); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up();
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/e-menu.png` });
await p.click('text=Убрать с полки'); await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/e-confirm.png` });
await p.click('.dialog .btn.danger'); await p.waitForTimeout(600);
console.log('books after remove', await p.evaluate(() => window.__polka.library.books.length), 'ignored', await p.evaluate(() => window.__polka.library.ignored.size));
// list view & dark shelf
await p.evaluate(() => window.__polka.settings.set({ shelfView: 'list', shelfTheme: 'dark' }));
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/e-list-dark.png` });
await p.evaluate(() => window.__polka.settings.set({ shelfView: 'shelf', shelfTheme: 'dark' }));
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/e-shelf-dark.png` });
await p.evaluate(() => window.__polka.settings.set({ shelfView: 'shelf', shelfTheme: 'walnut' }));
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/e-shelf-walnut.png` });
await p.click('[aria-label="Меню"]'); await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/e-shelf-menu.png` });
console.log(errs.join('\n'));
await b.close();

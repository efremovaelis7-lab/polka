// Экран «Трекер чтения»: цель на год, минуты в день, серия, неделя, прочитанное.
import { tracker, fmtDuration, statusOf, dayKey } from './tracker.js';
import { library } from './library.js';
import { h, icon, sheet, plural } from './ui.js';

const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function ring(value, max, big, small, cls = '') {
  const r = 46, c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, max ? value / max : 0));
  return h('div', {
    class: 'ring ' + cls,
    html: `<svg viewBox="0 0 110 110"><circle cx="55" cy="55" r="${r}" class="ring-bg"/>` +
      `<circle cx="55" cy="55" r="${r}" class="ring-fg" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - f)).toFixed(1)}" transform="rotate(-90 55 55)"/></svg>` +
      `<div class="ring-in"><b>${big}</b><span>${small}</span></div>`,
  });
}

function stepper(label, get, set, step, fmt) {
  const val = h('span', { class: 'st-v', text: fmt(get()) });
  const ch = d => { set(get() + d * step); val.textContent = fmt(get()); };
  return h('div', { class: 'stepper' },
    h('span', { class: 'st-l', text: label }),
    h('div', { class: 'st-c' },
      h('button', { class: 'st-b', html: icon('minus'), 'aria-label': 'Меньше', onclick: () => ch(-1) }),
      val,
      h('button', { class: 'st-b', html: icon('plus'), 'aria-label': 'Больше', onclick: () => ch(1) })));
}

function books(n) { return `${n} ${plural(n, 'книга', 'книги', 'книг')}`; }

export function openTracker(app) {
  const body = h('div', { class: 'tracker' });
  const render = () => {
    const now = new Date();
    const year = now.getFullYear();
    const all = library.books;
    const doneAll = all.filter(b => statusOf(b) === 'done');
    const doneYear = doneAll.filter(b => b.finishedAt && new Date(b.finishedAt).getFullYear() === year)
      .sort((a, b) => b.finishedAt - a.finishedAt);
    const reading = all.filter(b => statusOf(b) === 'reading').sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
    const want = all.filter(b => statusOf(b) === 'want');
    const goal = tracker.yearGoal;
    const start = new Date(year, 0, 1), end = new Date(year + 1, 0, 1);
    const expected = goal * (now - start) / (end - start);
    const diff = doneYear.length - expected;
    const left = Math.max(0, goal - doneYear.length);
    const monthsLeft = Math.max(1, 12 - now.getMonth() - (now.getDate() > 20 ? 1 : 0));
    let pace;
    if (doneYear.length >= goal) pace = 'Цель года выполнена! Можно поднять планку.';
    else if (diff >= 1) pace = `Опережаешь план на ${books(Math.floor(diff))}.`;
    else if (diff > -1) pace = 'Идёшь точно по плану.';
    else pace = `Чтобы успеть, осталось ${books(left)} — примерно ${Math.ceil(left / monthsLeft)} в месяц.`;

    const today = tracker.day();
    const todayMin = Math.floor((today.sec || 0) / 60);
    const dayGoal = tracker.dayGoal;
    const streak = tracker.streak();
    const week = tracker.week();
    const maxMin = Math.max(dayGoal, ...week.map(d => (d.sec || 0) / 60));
    const tot = tracker.totals();
    const todayKey = dayKey();

    body.replaceChildren(...[
      h('div', { class: 'tr-card' },
        h('div', { class: 'tr-h', text: `Мой ${year} год` }),
        h('div', { class: 'tr-row' },
          ring(doneYear.length, goal, `${doneYear.length}<small>/${goal}</small>`, plural(goal, 'книга', 'книги', 'книг'), 'big'),
          h('div', { class: 'tr-side' },
            h('div', { class: 'tr-pace', text: pace }),
            stepper('Цель на год', () => tracker.yearGoal, v => { tracker.setGoals({ yearGoal: v }); render(); }, 1, v => books(v))))),
      h('div', { class: 'tr-card' },
        h('div', { class: 'tr-h', text: 'Сегодня' }),
        h('div', { class: 'tr-row' },
          ring(todayMin, dayGoal, `${todayMin}<small> мин</small>`, `из ${dayGoal}`),
          h('div', { class: 'tr-side' },
            h('div', { class: 'tr-streak', html: icon('flame') + `<b>${streak}</b><span>${plural(streak, 'день', 'дня', 'дней')} подряд</span>` }),
            h('div', { class: 'tr-small', text: today.pages ? `Перелистано страниц: ${today.pages}` : 'Сегодня ещё не читала' }),
            stepper('Цель в день', () => tracker.dayGoal, v => { tracker.setGoals({ dayGoal: v }); render(); }, 5, v => `${v} мин`))),
        h('div', { class: 'week' }, ...week.map(d => {
          const m = (d.sec || 0) / 60;
          return h('div', { class: 'wk' + (d.key === todayKey ? ' today' : '') + (m >= dayGoal ? ' hit' : '') },
            h('div', { class: 'wk-v', text: m >= 1 ? Math.round(m) : '' }),
            h('div', { class: 'wk-bar' }, h('i', { style: { height: Math.max(m ? 4 : 0, Math.round(m / maxMin * 100)) + '%' } })),
            h('div', { class: 'wk-d', text: WD[d.date.getDay()] }));
        }))),
      h('div', { class: 'tr-grid' },
        stat(doneAll.length, 'прочитано всего'),
        stat(reading.length, 'читаю сейчас'),
        stat(want.length, 'хочу прочесть'),
        stat(fmtDuration(tot.sec), 'время за книгами'),
        stat(tot.monthPages, 'страниц за месяц'),
        stat(fmtDuration(tot.monthSec), 'чтения в этом месяце')),
      reading.length ? h('div', { class: 'tr-card' },
        h('div', { class: 'tr-h', text: 'Читаю сейчас' }),
        ...reading.slice(0, 6).map(b => h('button', { class: 'tr-book', onclick: () => { sh.close(); app.openBook(b); } },
          h('span', { class: 'trb-t', text: b.title }),
          h('span', { class: 'trb-bar' }, h('i', { style: { width: Math.round((b.progress || 0) * 100) + '%' } })),
          h('span', { class: 'trb-p', text: Math.round((b.progress || 0) * 100) + '%' })))) : null,
      h('div', { class: 'tr-card' },
        h('div', { class: 'tr-h', text: `Прочитано в ${year}` }),
        doneYear.length ? h('div', { class: 'tr-done' }, ...doneYear.map(b => {
          const box = app.shelf.coverBox(b, 'cover tiny');
          library.coverUrl(b).then(u => { if (u) { box.classList.add('has-img'); box.prepend(h('img', { class: 'cover-img', src: u, alt: '' })); } });
          return h('div', { class: 'td-item' }, box,
            h('div', { class: 'td-date', text: new Date(b.finishedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) }));
        })) : h('div', { class: 'tr-small pad', text: 'Пока пусто. Дочитанные книги будут собираться здесь.' })),
    ].filter(Boolean));
  };
  const stat = (v, t) => h('div', { class: 'tr-stat' }, h('b', { text: String(v) }), h('span', { text: t }));
  render();
  const sh = sheet({ title: 'Трекер чтения', content: body, cls: 'tracker-sheet', full: true });
}

// Трекер чтения: время и страницы по дням, цели на год и на день, серия дней.
import { db } from './db.js';

const KEY = 'stats';
const IDLE = 5 * 60 * 1000;     // перерыв дольше 5 минут — уже не чтение
const MAX_STEP = 3 * 60 * 1000; // одна страница засчитывается максимум за 3 минуты

let stats = null;
let last = 0;
let saveTimer = 0;
const subs = new Set();

export function dayKey(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export const tracker = {
  async init() {
    stats = (await db.get(KEY)) || {};
    stats.days = stats.days || {};
    stats.yearGoal = stats.yearGoal || 24;
    stats.dayGoal = stats.dayGoal || 20;
  },
  on(fn) { subs.add(fn); return () => subs.delete(fn); },
  save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => db.set(KEY, stats), 1500);
  },
  get yearGoal() { return stats.yearGoal; },
  get dayGoal() { return stats.dayGoal; },
  setGoals({ yearGoal, dayGoal }) {
    if (yearGoal != null) stats.yearGoal = Math.max(1, Math.min(365, yearGoal));
    if (dayGoal != null) stats.dayGoal = Math.max(5, Math.min(600, dayGoal));
    this.save();
  },
  day(key = dayKey()) { return stats.days[key] || { sec: 0, pages: 0 }; },

  /** вызывается при каждом перелистывании / прокрутке */
  activity(pages = 0) {
    const now = Date.now();
    const k = dayKey();
    const d = stats.days[k] || (stats.days[k] = { sec: 0, pages: 0 });
    const before = d.sec;
    if (last && now - last < IDLE) d.sec += Math.min(now - last, MAX_STEP) / 1000;
    d.pages += pages;
    last = now;
    this.save();
    const goal = stats.dayGoal * 60;
    if (before < goal && d.sec >= goal) for (const fn of subs) fn('goal');
  },
  pause() { last = 0; db.set(KEY, stats); },

  week() {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = dayKey(d);
      out.push({ key: k, date: d, ...this.day(k) });
    }
    return out;
  },

  streak() {
    let n = 0;
    const d = new Date();
    if ((this.day(dayKey(d)).sec || 0) < 60) d.setDate(d.getDate() - 1); // сегодня ещё можно успеть
    for (;;) {
      const v = this.day(dayKey(d));
      if ((v.sec || 0) < 60) break;
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  },

  totals() {
    let sec = 0, pages = 0, monthPages = 0, monthSec = 0;
    const m = dayKey().slice(0, 7);
    for (const [k, v] of Object.entries(stats.days)) {
      sec += v.sec || 0; pages += v.pages || 0;
      if (k.startsWith(m)) { monthPages += v.pages || 0; monthSec += v.sec || 0; }
    }
    return { sec, pages, monthPages, monthSec };
  },
};

export function fmtDuration(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm ? `${h} ч ${mm} мин` : `${h} ч`;
}

export function statusOf(b) {
  if (b.status) return b.status;
  if (b.finished) return 'done';
  if (b.lastOpened) return 'reading';
  return 'new';
}

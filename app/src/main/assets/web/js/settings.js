// Настройки читалки и полки (хранятся в localStorage).

export const THEMES = [
  { id: 'day', name: 'Белая', bg: '#FFFFFF', text: '#1F1F1F', muted: '#8C8C8C', accent: '#2F62B0', back: '#EFEFEF', light: true },
  { id: 'paper', name: 'Бумага', bg: '#FAF6EE', text: '#2A251F', muted: '#9A8F80', accent: '#9A5A2A', back: '#EFE8DA', light: true, grain: 0.35 },
  { id: 'sepia', name: 'Сепия', bg: '#F2E5CB', text: '#4B3826', muted: '#9C8366', accent: '#A0522D', back: '#E6D6B6', light: true, grain: 0.55 },
  { id: 'sage', name: 'Шалфей', bg: '#E1E9D9', text: '#28352A', muted: '#7D8C78', accent: '#3F7350', back: '#D3DDC9', light: true, grain: 0.25 },
  { id: 'lavender', name: 'Лаванда', bg: '#ECE6F3', text: '#342B44', muted: '#8F86A0', accent: '#7A4FB0', back: '#DFD7EA', light: true, grain: 0.2 },
  { id: 'dusk', name: 'Сумерки', bg: '#2B3038', text: '#F1EEE8', muted: '#9AA1AC', accent: '#8FB4E8', back: '#23272E', light: false },
  { id: 'night', name: 'Ночь', bg: '#1A1714', text: '#F5ECDD', muted: '#8E8170', accent: '#E8B06A', back: '#13110F', light: false, grain: 0.12 },
  { id: 'black', name: 'Чёрная', bg: '#000000', text: '#FFFFFF', muted: '#7C7C7C', accent: '#D9B27A', back: '#0E0E0E', light: false },
  { id: 'matrix', name: 'Матрица', bg: '#000000', text: '#3DFF7A', muted: '#1F9A45', accent: '#9DFFB8', back: '#021A0A', light: false, glow: true },
];

export const SHELVES = [
  { id: 'oak', name: 'Дуб', dark: false },
  { id: 'cherry', name: 'Вишня', dark: false },
  { id: 'walnut', name: 'Орех', dark: true },
  { id: 'dark', name: 'Тёмная', dark: true },
];

const DEFAULTS = {
  theme: 'sepia',
  font: 'lora',
  fontSize: 19,
  lineHeight: 1.55,
  margin: 22,
  align: 'justify',
  hyphens: true,
  indent: true,
  paraSpace: 0,
  weight: 400,
  bionic: false,
  bionicStrength: 0.45,
  bionicWeight: 700,
  bionicFade: 0.25,
  mode: 'pages',     // pages | scroll
  anim: 'curl',      // curl | slide | fade | none
  spread: 'auto',    // auto | one | two
  volumeKeys: true,
  keepScreenOn: true,
  fullscreen: true,
  brightness: -1,
  grain: true,
  shelfTheme: 'oak',
  shelfView: 'shelf',
  sort: 'recent',
  shelfTab: 'all',
  autoScan: true,
  customFonts: [],
};

const KEY = 'polka.settings';
let data = { ...DEFAULTS };
try { Object.assign(data, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* ignore */ }

const subs = new Set();

export const settings = {
  get: k => data[k],
  all: () => ({ ...data }),
  set(patch) {
    const changed = {};
    for (const [k, v] of Object.entries(patch)) {
      if (JSON.stringify(data[k]) !== JSON.stringify(v)) { data[k] = v; changed[k] = v; }
    }
    if (!Object.keys(changed).length) return;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
    for (const fn of subs) fn(changed);
  },
  on(fn) { subs.add(fn); return () => subs.delete(fn); },
  theme() { return THEMES.find(t => t.id === data.theme) || THEMES[2]; },
  shelf() { return SHELVES.find(s => s.id === data.shelfTheme) || SHELVES[0]; },
};

// смешивание цветов (для приглушённых окончаний в бионическом режиме)
export function mix(c1, c2, t) {
  const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

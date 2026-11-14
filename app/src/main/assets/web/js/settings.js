// Настройки читалки и полки (хранятся в localStorage).

export const THEMES = [
  // бережные для глаз: мягкий контраст, тёплый или тонированный фон
  { id: 'cream', name: 'Крем', group: 'soft', bg: '#F5EDDC', text: '#3A3128', muted: '#9A8C78', accent: '#9C5B2E', back: '#E9DEC8', light: true },
  { id: 'peach', name: 'Персик', group: 'soft', bg: '#F6E2D2', text: '#3E2F27', muted: '#A08676', accent: '#B0603A', back: '#EBD3C0', light: true },
  { id: 'rose', name: 'Роза', group: 'soft', bg: '#F1DDDB', text: '#3D2B2C', muted: '#A08487', accent: '#A9485A', back: '#E6CDCB', light: true },
  { id: 'sage', name: 'Шалфей', group: 'soft', bg: '#E1E9D9', text: '#24332A', muted: '#7D8C78', accent: '#3F7350', back: '#D3DDC9', light: true, grain: 0.25 },
  { id: 'softgray', name: 'Серая', group: 'soft', bg: '#E3E2DE', text: '#2F2F2D', muted: '#8C8B86', accent: '#5A6E8C', back: '#D6D5D0', light: true },
  { id: 'softnight', name: 'Мягкая ночь', group: 'soft', bg: '#2A2826', text: '#D6D0C6', muted: '#8C857B', accent: '#D6A866', back: '#22201E', light: false },
  // классические
  { id: 'day', name: 'Белая', group: 'classic', bg: '#FFFFFF', text: '#1F1F1F', muted: '#8C8C8C', accent: '#2F62B0', back: '#EFEFEF', light: true },
  { id: 'paper', name: 'Бумага', group: 'classic', bg: '#FAF6EE', text: '#2A251F', muted: '#9A8F80', accent: '#9A5A2A', back: '#EFE8DA', light: true, grain: 0.35 },
  { id: 'sepia', name: 'Сепия', group: 'classic', bg: '#F2E5CB', text: '#4B3826', muted: '#9C8366', accent: '#A0522D', back: '#E6D6B6', light: true, grain: 0.55 },
  { id: 'lavender', name: 'Лаванда', group: 'classic', bg: '#ECE6F3', text: '#342B44', muted: '#8F86A0', accent: '#7A4FB0', back: '#DFD7EA', light: true, grain: 0.2 },
  // тёмные
  { id: 'dusk', name: 'Сумерки', group: 'dark', bg: '#2B3038', text: '#F1EEE8', muted: '#9AA1AC', accent: '#8FB4E8', back: '#23272E', light: false },
  { id: 'night', name: 'Ночь', group: 'dark', bg: '#1A1714', text: '#F5ECDD', muted: '#8E8170', accent: '#E8B06A', back: '#13110F', light: false, grain: 0.12 },
  { id: 'black', name: 'Чёрная', group: 'dark', bg: '#000000', text: '#FFFFFF', muted: '#7C7C7C', accent: '#D9B27A', back: '#0E0E0E', light: false },
  { id: 'matrix', name: 'Матрица', group: 'dark', bg: '#000000', text: '#3DFF7A', muted: '#1F9A45', accent: '#9DFFB8', back: '#021A0A', light: false, glow: true },
];

export const THEME_GROUPS = [['soft', 'Бережные для глаз'], ['classic', 'Классические'], ['dark', 'Тёмные']];

export const SHELVES = [
  { id: 'oak', name: 'Дуб', dark: false },
  { id: 'cherry', name: 'Вишня', dark: false },
  { id: 'walnut', name: 'Орех', dark: true },
  { id: 'dark', name: 'Тёмная', dark: true },
  { id: 'white', name: 'Белое дерево', dark: false, light: true },
  { id: 'birch', name: 'Берёза', dark: false, light: true },
  { id: 'ash', name: 'Серый ясень', dark: false },
  { id: 'wenge', name: 'Венге', dark: true },
];

// что входит в «стиль» оформления
export const STYLE_KEYS = ['theme', 'font', 'fontSize', 'lineHeight', 'margin', 'align', 'hyphens', 'indent', 'paraSpace', 'weight',
  'letterSpacing', 'wordSpacing', 'stroke', 'bionic', 'bionicStrength', 'bionicWeight', 'bionicFade', 'grain', 'dim', 'warm', 'anim'];

// готовые бережные стили (по рекомендациям для астигматизма и мигрени)
export const BUILTIN_STYLES = [
  { id: 'gentle-day', name: 'Бережный день', builtin: true, values: {
    theme: 'cream', font: 'literata', fontSize: 21, lineHeight: 1.75, margin: 26, align: 'left', hyphens: true, indent: true,
    paraSpace: 0.3, weight: 450, letterSpacing: 0.02, wordSpacing: 0.08, stroke: 0.15,
    bionic: true, bionicStrength: 0.4, bionicWeight: 600, bionicFade: 0, grain: false, dim: 0, warm: 0, anim: 'fade' } },
  { id: 'gentle-evening', name: 'Тёплый вечер', builtin: true, values: {
    theme: 'peach', font: 'literata', fontSize: 21, lineHeight: 1.75, margin: 26, align: 'left', hyphens: true, indent: true,
    paraSpace: 0.3, weight: 450, letterSpacing: 0.02, wordSpacing: 0.08, stroke: 0.15,
    bionic: true, bionicStrength: 0.4, bionicWeight: 600, bionicFade: 0, grain: false, dim: 0.12, warm: 0.25, anim: 'fade' } },
  { id: 'gentle-night', name: 'Мягкая ночь', builtin: true, values: {
    theme: 'softnight', font: 'literata', fontSize: 21, lineHeight: 1.8, margin: 26, align: 'left', hyphens: true, indent: true,
    paraSpace: 0.3, weight: 420, letterSpacing: 0.03, wordSpacing: 0.1, stroke: 0,
    bionic: true, bionicStrength: 0.4, bionicWeight: 600, bionicFade: 0, grain: false, dim: 0.15, warm: 0.3, anim: 'fade' } },
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
  letterSpacing: 0,
  wordSpacing: 0,
  stroke: 0,
  dim: 0,
  warm: 0,
  eyeBreaks: false,
  styles: [],
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
  theme() { return THEMES.find(t => t.id === data.theme) || THEMES.find(t => t.id === 'sepia'); },
  snapshot() { const o = {}; for (const k of STYLE_KEYS) o[k] = data[k]; return o; },
  styles() { return [...BUILTIN_STYLES, ...(data.styles || [])]; },
  matches(style, resolve = v => v) {
    const v = resolve({ ...style.values });
    return STYLE_KEYS.every(k => !(k in v) || JSON.stringify(v[k]) === JSON.stringify(data[k]));
  },
  shelf() { return SHELVES.find(s => s.id === data.shelfTheme) || SHELVES[0]; },
};

// смешивание цветов (для приглушённых окончаний в бионическом режиме)
export function mix(c1, c2, t) {
  const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

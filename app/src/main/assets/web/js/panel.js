// Панель «Оформление»: темы, шрифты, размер, бионика, листание, экран.
import { settings, THEMES } from './settings.js';
import { fonts } from './fonts.js';
import { h, icon, sheet, toast, confirmDialog } from './ui.js';
import { bionicify } from './bionic.js';
import { isNative } from './native.js';

function row(label, ...ctl) {
  return h('div', { class: 'p-row' }, h('div', { class: 'p-label', text: label }), ...ctl);
}

function seg(key, options, onPick) {
  const wrap = h('div', { class: 'seg' });
  const render = () => {
    wrap.replaceChildren(...options.map(([v, t]) => h('button', {
      class: 'seg-b' + (settings.get(key) === v ? ' on' : ''), text: t,
      onclick: () => { settings.set({ [key]: v }); render(); onPick && onPick(v); },
    })));
  };
  render();
  return wrap;
}

function toggle(key, label, hint) {
  const sw = h('button', { class: 'switch' + (settings.get(key) ? ' on' : ''), role: 'switch', 'aria-label': label, 'data-key': key });
  const el = h('div', { class: 'p-toggle', onclick: () => { settings.set({ [key]: !settings.get(key) }); sw.classList.toggle('on', !!settings.get(key)); } },
    h('div', { class: 'p-tt' }, h('div', { text: label }), hint ? h('div', { class: 'p-hint', text: hint }) : null), sw);
  return el;
}

function slider(key, min, max, step, fmt, live = true) {
  const val = h('span', { class: 'p-val', text: fmt(settings.get(key)) });
  const inp = h('input', { type: 'range', min, max, step, value: settings.get(key), class: 'p-slider' });
  const apply = () => { const v = +inp.value; val.textContent = fmt(v); settings.set({ [key]: v }); };
  if (live) inp.addEventListener('input', apply);
  inp.addEventListener('change', apply);
  return h('div', { class: 'p-sl' }, inp, val);
}

export function openSettingsPanel() {
  const body = h('div', { class: 'panel' });

  // --- темы
  const themes = h('div', { class: 'themes' });
  const renderThemes = () => {
    themes.replaceChildren(...THEMES.map(t => h('button', {
      class: 'theme-dot t-' + t.id + (settings.get('theme') === t.id ? ' on' : ''),
      style: { background: t.bg, color: t.text },
      onclick: () => { settings.set({ theme: t.id }); renderThemes(); syncPanel(); },
    }, h('span', { class: 'td-aa', text: 'Аа' }), h('span', { class: 'td-name', text: t.name }))));
  };
  renderThemes();

  // --- шрифты
  const fontRow = h('div', { class: 'fonts' });
  const renderFonts = () => {
    const items = fonts.list.map(f => {
      const b = h('button', {
        class: 'font-chip' + (settings.get('font') === f.id ? ' on' : ''),
        style: { fontFamily: fonts.family(f.id) },
        onclick: async () => { await fonts.ready(f.id); settings.set({ font: f.id }); renderFonts(); syncPreview(); },
      }, h('span', { class: 'fc-a', text: 'Аа' }), h('span', { class: 'fc-n', text: f.name }));
      if (f.custom) {
        b.appendChild(h('span', { class: 'fc-x', html: icon('close'), onclick: async e => {
          e.stopPropagation();
          if (await confirmDialog({ title: 'Удалить шрифт?', text: f.name, ok: 'Удалить', danger: true })) { await fonts.removeCustom(f.id); renderFonts(); }
        } }));
      }
      return b;
    });
    items.push(h('button', { class: 'font-chip add', onclick: async () => {
      const r = await fonts.addCustom();
      if (r && r.error) toast(r.error);
      else if (r) { settings.set({ font: r.id }); renderFonts(); toast('Шрифт добавлен'); }
    } }, h('span', { class: 'fc-a', html: icon('plus') }), h('span', { class: 'fc-n', text: 'Свой' })));
    fontRow.replaceChildren(...items);
    const on = fontRow.querySelector('.on');
    if (on) setTimeout(() => { fontRow.scrollLeft = on.offsetLeft - fontRow.clientWidth / 2 + on.offsetWidth / 2; }, 30);
  };
  renderFonts();

  // --- размер
  const sizeVal = h('span', { class: 'size-val', text: settings.get('fontSize') });
  const setSize = d => {
    const v = Math.max(11, Math.min(40, settings.get('fontSize') + d));
    settings.set({ fontSize: v });
    sizeVal.textContent = v;
  };
  const sizeRow = h('div', { class: 'size' },
    h('button', { class: 'size-b small', text: 'А−', onclick: () => setSize(-1) }),
    sizeVal,
    h('button', { class: 'size-b big', text: 'А+', onclick: () => setSize(1) }));

  // --- бионика: превью
  const preview = h('div', { class: 'bionic-preview' });
  const syncPreview = () => {
    const t = settings.theme();
    preview.style.background = t.bg;
    preview.style.color = t.text;
    preview.style.fontFamily = fonts.family(settings.get('font'));
    preview.style.setProperty('--bw', settings.get('bionicWeight'));
    const rest = settings.get('bionic') ? mixc(t.text, t.bg, settings.get('bionicFade')) : t.text;
    preview.style.setProperty('--rest', rest);
    preview.style.setProperty('--text', t.text);
    preview.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = 'Бионическое чтение выделяет начало каждого слова, и глаз быстрее скользит по строке, не теряя смысла.';
    if (settings.get('bionic')) bionicify(p, settings.get('bionicStrength'));
    preview.classList.toggle('on', !!settings.get('bionic'));
    preview.appendChild(p);
  };
  syncPreview();
  const bionicBox = h('div', { class: 'bionic-box' });
  const bionicToggle = toggle('bionic', 'Бионический шрифт', 'Жирное начало слов — читать быстрее и легче');
  const FMT = {
    bionicStrength: v => Math.round(v * 100) + '%',
    bionicWeight: v => ({ 500: 'средне', 600: 'полужирно', 700: 'жирно', 800: 'очень', 900: 'максимум' }[v] || v),
    bionicFade: v => (v ? Math.round(v * 100) + '%' : 'нет'),
  };
  const bs = slider('bionicStrength', 0.25, 0.7, 0.05, FMT.bionicStrength, false);
  const bw = slider('bionicWeight', 500, 900, 100, FMT.bionicWeight, false);
  const bf = slider('bionicFade', 0, 0.6, 0.05, FMT.bionicFade, false);
  // превью меняется сразу при движении, а текст книги — когда отпустишь ползунок
  for (const [k, s] of [['bionicStrength', bs], ['bionicWeight', bw], ['bionicFade', bf]]) {
    const inp = s.querySelector('input');
    inp.addEventListener('input', () => {
      const tmp = settings.all();
      tmp[k] = +inp.value;
      s.querySelector('.p-val').textContent = FMT[k](+inp.value);
      previewWith(tmp);
    });
  }
  function previewWith(tmp) {
    const t = settings.theme();
    preview.style.setProperty('--bw', tmp.bionicWeight);
    preview.style.setProperty('--rest', mixc(t.text, t.bg, tmp.bionicFade));
    preview.classList.add('on');
    const p = document.createElement('p');
    p.textContent = 'Бионическое чтение выделяет начало каждого слова, и глаз быстрее скользит по строке, не теряя смысла.';
    bionicify(p, tmp.bionicStrength);
    preview.replaceChildren(p);
  }
  bionicBox.append(row('Выделять начало слова', bs), row('Насыщенность выделения', bw), row('Приглушить окончания', bf));
  bionicBox.classList.toggle('dim', !settings.get('bionic'));

  // --- яркость
  const brightBox = h('div', { class: 'p-sl' });
  const bInp = h('input', { type: 'range', min: 0.02, max: 1, step: 0.01, value: settings.get('brightness') < 0 ? 0.5 : settings.get('brightness'), class: 'p-slider' });
  const bSys = h('button', { class: 'chip' + (settings.get('brightness') < 0 ? ' on' : ''), text: 'Авто', onclick: () => {
    const sys = settings.get('brightness') >= 0;
    settings.set({ brightness: sys ? -1 : +bInp.value });
    bSys.classList.toggle('on', sys);
  } });
  bInp.addEventListener('input', () => { settings.set({ brightness: +bInp.value }); bSys.classList.remove('on'); });
  brightBox.append(bInp, bSys);

  body.append(
    h('div', { class: 'p-sec' }, themes),
    h('div', { class: 'p-sec bionic-sec' },
      h('div', { class: 'p-h', html: icon('bolt') + ' Бионическое чтение' }), preview, bionicToggle, bionicBox),
    h('div', { class: 'p-sec' }, h('div', { class: 'p-h', text: 'Шрифт' }), fontRow, sizeRow),
    h('div', { class: 'p-sec' },
      row('Межстрочный интервал', slider('lineHeight', 1.1, 2.2, 0.05, v => (+v).toFixed(2).replace(/0$/, ''), false)),
      row('Поля', slider('margin', 4, 64, 2, v => v + ' px', false)),
      row('Насыщенность текста', slider('weight', 300, 600, 50, v => ({ 300: 'тонкий', 350: 'светлый', 400: 'обычный', 450: 'плотнее', 500: 'средний', 550: 'густой', 600: 'жирный' }[v] || v), false)),
      row('Отбивка абзацев', slider('paraSpace', 0, 1.2, 0.1, v => (v ? (+v).toFixed(1) : 'нет'), false)),
      row('Выравнивание', seg('align', [['justify', 'По ширине'], ['left', 'По левому краю']])),
      toggle('hyphens', 'Переносы слов'),
      toggle('indent', 'Красная строка')),
    h('div', { class: 'p-sec' },
      h('div', { class: 'p-h', text: 'Листание' }),
      row('Анимация', seg('anim', [['curl', 'Загиб'], ['slide', 'Сдвиг'], ['fade', 'Затухание'], ['none', 'Нет']])),
      row('Режим', seg('mode', [['pages', 'Страницы'], ['scroll', 'Прокрутка']])),
      row('Разворот книги', seg('spread', [['auto', 'Авто'], ['one', 'Одна стр.'], ['two', 'Две стр.']])),
      h('div', { class: 'p-hint pad', text: '«Авто» — две страницы, когда экран повёрнут горизонтально (планшет, компьютер).' }),
      isNative ? toggle('volumeKeys', 'Листать кнопками громкости') : null),
    h('div', { class: 'p-sec' },
      h('div', { class: 'p-h', text: 'Экран' }),
      isNative ? row('Яркость', brightBox) : null,
      isNative ? toggle('fullscreen', 'Полноэкранный режим', 'Прятать строку состояния при чтении') : null,
      isNative ? toggle('keepScreenOn', 'Не гасить экран') : null,
      toggle('grain', 'Текстура бумаги')),
  );

  function syncPanel() { syncPreview(); }
  const off = settings.on(ch => {
    body.querySelectorAll('.switch[data-key]').forEach(sw => sw.classList.toggle('on', !!settings.get(sw.dataset.key)));
    if ('bionic' in ch) bionicBox.classList.toggle('dim', !settings.get('bionic'));
    if ('theme' in ch) renderThemes();
    if (['bionic', 'bionicStrength', 'bionicWeight', 'bionicFade', 'theme', 'font'].some(k => k in ch)) syncPreview();
  });
  const sh = sheet({ title: 'Оформление', content: body, cls: 'settings-sheet live', onClose: off });
  return sh;
}

function mixc(c1, c2, t) {
  const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

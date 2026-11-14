// Панель «Оформление»: стили, темы, бионика, шрифты, чёткость, листание, экран.
import { settings, THEMES, THEME_GROUPS, STYLE_KEYS } from './settings.js';
import { fonts } from './fonts.js';
import { h, icon, sheet, toast, confirmDialog, promptDialog } from './ui.js';
import { bionicify } from './bionic.js';
import { isNative } from './native.js';

const SAMPLE = 'Бионическое чтение выделяет начало каждого слова, и глаз быстрее скользит по строке, не теряя смысла.';

function row(label, ...ctl) {
  return h('div', { class: 'p-row' }, h('div', { class: 'p-label', text: label }), ...ctl);
}

function seg(key, options) {
  const wrap = h('div', { class: 'seg' });
  const render = () => {
    wrap.replaceChildren(...options.map(([v, t]) => h('button', {
      class: 'seg-b' + (settings.get(key) === v ? ' on' : ''), text: t,
      onclick: () => { settings.set({ [key]: v }); render(); },
    })));
  };
  render();
  return wrap;
}

function toggle(key, label, hint) {
  const sw = h('button', { class: 'switch' + (settings.get(key) ? ' on' : ''), role: 'switch', 'aria-label': label, 'data-key': key });
  return h('div', { class: 'p-toggle', onclick: () => { settings.set({ [key]: !settings.get(key) }); } },
    h('div', { class: 'p-tt' }, h('div', { text: label }), hint ? h('div', { class: 'p-hint', text: hint }) : null), sw);
}

/** Ползунок: превью меняется сразу, а книга перестраивается, когда отпустишь (если live=false). */
function slider(key, min, max, step, fmt, { live = false, onInput } = {}) {
  const val = h('span', { class: 'p-val', text: fmt(settings.get(key) ?? 0) });
  const inp = h('input', { type: 'range', min, max, step, value: settings.get(key) ?? 0, class: 'p-slider' });
  inp.addEventListener('input', () => {
    val.textContent = fmt(+inp.value);
    if (live) settings.set({ [key]: +inp.value });
    if (onInput) onInput(+inp.value);
  });
  inp.addEventListener('change', () => settings.set({ [key]: +inp.value }));
  return h('div', { class: 'p-sl' }, inp, val);
}

function mixc(c1, c2, t) {
  const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

const resolveFont = v => { if (v.font && !fonts.list.some(f => f.id === v.font)) v.font = 'lora'; return v; };
const isOn = st => settings.matches(st, resolveFont);

export function applyStyle(style) {
  settings.set(resolveFont({ ...style.values }));
}

const themeOf = id => THEMES.find(t => t.id === id) || {};

export function openSettingsPanel() {
  const body = h('div', { class: 'panel' });
  let undo = null;
  let preview = null, bionicBox = null, sh = null;

  // ------------------------------------------------------------ превью бионики
  const syncPreview = (over = {}) => {
    if (!preview) return;
    const s = { ...settings.all(), ...over };
    const t = settings.theme();
    preview.style.background = t.bg;
    preview.style.color = t.text;
    preview.style.fontFamily = fonts.family(s.font);
    preview.style.fontWeight = s.weight;
    preview.style.letterSpacing = (s.letterSpacing || 0) + 'em';
    preview.style.wordSpacing = (s.wordSpacing || 0) + 'em';
    preview.style.webkitTextStroke = (s.stroke || 0) + 'px currentColor';
    preview.style.setProperty('--bw', s.bionicWeight);
    preview.style.setProperty('--text', t.text);
    preview.style.setProperty('--rest', s.bionic ? mixc(t.text, t.bg, s.bionicFade) : t.text);
    preview.classList.toggle('on', !!s.bionic);
    const p = document.createElement('p');
    p.textContent = SAMPLE;
    if (s.bionic) bionicify(p, s.bionicStrength);
    preview.replaceChildren(p);
  };

  // ------------------------------------------------------------ сборка панели
  const build = () => {
    const scroll = sh ? sh.body.scrollTop : 0;

    // мои стили
    const styles = h('div', { class: 'styles' });
    if (undo) {
      styles.appendChild(h('button', { class: 'style-chip undo', onclick: () => { settings.set(undo); undo = null; build(); toast('Прежние настройки возвращены', 1400); } },
        h('span', { text: '↶ Как было' })));
    }
    for (const st of settings.styles()) {
      const on = isOn(st);
      const th = themeOf(st.values.theme);
      styles.appendChild(h('button', {
        class: 'style-chip' + (on ? ' on' : '') + (st.builtin ? ' builtin' : ''), 'data-style': st.id,
        onclick: () => {
          if (on && !st.builtin) { styleMenu(st); return; }
          undo = settings.snapshot();
          applyStyle(st);
          build();
          toast(`Стиль «${st.name}»`, 1300);
        },
      },
      h('span', { class: 'sc-dot', style: { background: th.bg, color: th.text }, text: 'А' }),
      h('span', { text: st.name }),
      !st.builtin ? h('span', { class: 'sc-edit', html: icon('more'), onclick: e => { e.stopPropagation(); styleMenu(st); } }) : null));
    }
    styles.appendChild(h('button', { class: 'style-chip add', onclick: async () => {
      const name = await promptDialog({ title: 'Сохранить мой стиль', placeholder: 'Например: «Вечер с мигренью»' });
      if (!name) return;
      const list = [...(settings.get('styles') || [])];
      list.push({ id: 's' + Date.now().toString(36), name, values: settings.snapshot() });
      settings.set({ styles: list });
      build();
      toast('Стиль сохранён — переключай одним касанием', 2000);
    } }, h('span', { html: icon('plus') }), h('span', { text: 'Сохранить мой' })));

    // темы по группам
    const themes = h('div', { class: 'theme-groups' }, ...THEME_GROUPS.map(([g, title]) => h('div', { class: 'tg' },
      h('div', { class: 'tg-h', text: title }),
      h('div', { class: 'themes' }, ...THEMES.filter(t => t.group === g).map(t => h('button', {
        class: 'theme-dot t-' + t.id + (settings.get('theme') === t.id ? ' on' : ''),
        style: { background: t.bg, color: t.text },
        onclick: () => { settings.set({ theme: t.id }); build(); },
      }, h('span', { class: 'td-aa', text: 'Аа' }), h('span', { class: 'td-name', text: t.name })))))));

    // шрифты
    const fontRow = h('div', { class: 'fonts' }, ...fonts.list.map(f => {
      const b = h('button', {
        class: 'font-chip' + (settings.get('font') === f.id ? ' on' : ''),
        style: { fontFamily: fonts.family(f.id) },
        onclick: async () => { await fonts.ready(f.id); settings.set({ font: f.id }); build(); },
      }, h('span', { class: 'fc-a', text: 'Аа' }), h('span', { class: 'fc-n', text: f.name }));
      if (f.custom) {
        b.appendChild(h('span', { class: 'fc-x', html: icon('close'), onclick: async e => {
          e.stopPropagation();
          if (await confirmDialog({ title: 'Удалить шрифт?', text: f.name, ok: 'Удалить', danger: true })) { await fonts.removeCustom(f.id); build(); }
        } }));
      }
      return b;
    }), h('button', { class: 'font-chip add', onclick: async () => {
      const r = await fonts.addCustom();
      if (r && r.error) toast(r.error);
      else if (r) { settings.set({ font: r.id }); build(); toast('Шрифт добавлен'); }
    } }, h('span', { class: 'fc-a', html: icon('plus') }), h('span', { class: 'fc-n', text: 'Свой' })));

    const sizeVal = h('span', { class: 'size-val', text: settings.get('fontSize') });
    const setSize = d => { const v = Math.max(11, Math.min(40, settings.get('fontSize') + d)); settings.set({ fontSize: v }); sizeVal.textContent = v; };
    const sizeRow = h('div', { class: 'size' },
      h('button', { class: 'size-b small', text: 'А−', onclick: () => setSize(-1) }), sizeVal,
      h('button', { class: 'size-b big', text: 'А+', onclick: () => setSize(1) }));

    // бионика
    preview = h('div', { class: 'bionic-preview' });
    const FMT = {
      bionicStrength: v => Math.round(v * 100) + '%',
      bionicWeight: v => ({ 500: 'мягко', 600: 'полужирно', 700: 'жирно', 800: 'очень', 900: 'максимум' }[v] || v),
      bionicFade: v => (v ? Math.round(v * 100) + '%' : 'нет'),
    };
    bionicBox = h('div', { class: 'bionic-box' + (settings.get('bionic') ? '' : ' dim') },
      row('Выделять начало слова', slider('bionicStrength', 0.25, 0.7, 0.05, FMT.bionicStrength, { onInput: v => syncPreview({ bionicStrength: v }) })),
      row('Насыщенность выделения', slider('bionicWeight', 500, 900, 100, FMT.bionicWeight, { onInput: v => syncPreview({ bionicWeight: v }) })),
      row('Приглушить окончания', slider('bionicFade', 0, 0.6, 0.05, FMT.bionicFade, { onInput: v => syncPreview({ bionicFade: v }) })),
      h('div', { class: 'p-hint pad', text: 'Для чёткости при астигматизме лучше без приглушения: тогда окончания слов не теряют контраст.' }));

    // яркость (подсветка телефона)
    const brightBox = h('div', { class: 'p-sl' });
    const bInp = h('input', { type: 'range', min: 0.02, max: 1, step: 0.01, value: settings.get('brightness') < 0 ? 0.5 : settings.get('brightness'), class: 'p-slider' });
    const bSys = h('button', { class: 'chip' + (settings.get('brightness') < 0 ? ' on' : ''), text: 'Авто', onclick: () => {
      const sys = settings.get('brightness') >= 0;
      settings.set({ brightness: sys ? -1 : +bInp.value });
      bSys.classList.toggle('on', sys);
    } });
    bInp.addEventListener('input', () => { settings.set({ brightness: +bInp.value }); bSys.classList.remove('on'); });
    brightBox.append(bInp, bSys);

    body.replaceChildren(...[
      h('div', { class: 'p-sec' },
        h('div', { class: 'p-h', text: 'Мои стили' }), styles,
        h('div', { class: 'p-hint pad', text: 'Стиль запоминает всё оформление сразу. Настрой как удобно и нажми «Сохранить мой» — потом переключай по настроению. Свой стиль можно обновить или переименовать через ⋯.' })),
      h('div', { class: 'p-sec' }, themes),
      h('div', { class: 'p-sec bionic-sec' },
        h('div', { class: 'p-h', html: icon('bolt') + ' Бионическое чтение' }), preview,
        toggle('bionic', 'Бионический шрифт', 'Жирное начало слов — опоры для глаза'), bionicBox),
      h('div', { class: 'p-sec' }, h('div', { class: 'p-h', text: 'Шрифт' }), fontRow, sizeRow),
      h('div', { class: 'p-sec' },
        h('div', { class: 'p-h', text: 'Чёткость и воздух' }),
        row('Утолщение букв', slider('stroke', 0, 0.6, 0.05, v => (v ? '+' + (+v).toFixed(2) : 'нет'), { live: true, onInput: v => syncPreview({ stroke: v }) })),
        row('Насыщенность текста', slider('weight', 300, 600, 50, v => ({ 300: 'тонкий', 350: 'светлый', 400: 'обычный', 450: 'плотнее', 500: 'средний', 550: 'густой', 600: 'жирный' }[v] || v), { onInput: v => syncPreview({ weight: v }) })),
        row('Между буквами', slider('letterSpacing', 0, 0.12, 0.01, v => (v ? '+' + Math.round(v * 100) + '%' : 'обычно'), { onInput: v => syncPreview({ letterSpacing: v }) })),
        row('Между словами', slider('wordSpacing', 0, 0.4, 0.02, v => (v ? '+' + Math.round(v * 100) + '%' : 'обычно'), { onInput: v => syncPreview({ wordSpacing: v }) })),
        row('Межстрочный интервал', slider('lineHeight', 1.1, 2.4, 0.05, v => (+v).toFixed(2).replace(/0$/, ''))),
        row('Поля', slider('margin', 4, 64, 2, v => v + ' px')),
        row('Отбивка абзацев', slider('paraSpace', 0, 1.2, 0.1, v => (v ? (+v).toFixed(1) : 'нет'))),
        row('Выравнивание', seg('align', [['left', 'По левому краю'], ['justify', 'По ширине']])),
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
        h('div', { class: 'p-h', text: 'Экран и глаза' }),
        row('Затемнение без мерцания', slider('dim', 0, 0.7, 0.05, v => (v ? Math.round(v * 100) + '%' : 'нет'), { live: true })),
        h('div', { class: 'p-hint pad', text: 'Яркость телефона лучше держать повыше и приглушать здесь: на низкой яркости многие экраны мерцают (ШИМ), а мерцание — частый триггер мигрени.' }),
        row('Тёплый фильтр', slider('warm', 0, 0.8, 0.05, v => (v ? Math.round(v * 100) + '%' : 'нет'), { live: true })),
        isNative ? row('Яркость телефона', brightBox) : null,
        toggle('eyeBreaks', 'Напоминать дать глазам отдых', 'Каждые 20 минут чтения — посмотреть вдаль 20 секунд'),
        isNative ? toggle('fullscreen', 'Полноэкранный режим', 'Прятать строку состояния при чтении') : null,
        isNative ? toggle('keepScreenOn', 'Не гасить экран') : null,
        toggle('grain', 'Текстура бумаги', 'Зернистость фона; при мигрени лучше выключить')),
    ].filter(Boolean));
    syncPreview();
    const on = fontRow.querySelector('.on');
    if (on) setTimeout(() => { fontRow.scrollLeft = on.offsetLeft - fontRow.clientWidth / 2 + on.offsetWidth / 2; }, 30);
    if (sh) sh.body.scrollTop = scroll;
  };

  function styleMenu(st) {
    const list = settings.get('styles') || [];
    let m;
    const content = h('div', { class: 'menu-actions' },
      h('button', { class: 'menu-btn', html: icon('check') + '<span>Обновить текущим оформлением</span>', onclick: () => {
        settings.set({ styles: list.map(x => (x.id === st.id ? { ...x, values: settings.snapshot() } : x)) });
        m.close(); build(); toast('Стиль обновлён', 1300);
      } }),
      h('button', { class: 'menu-btn', html: icon('notes') + '<span>Переименовать</span>', onclick: async () => {
        m.close();
        const name = await promptDialog({ title: 'Название стиля', value: st.name });
        if (!name) return;
        settings.set({ styles: list.map(x => (x.id === st.id ? { ...x, name } : x)) });
        build();
      } }),
      h('button', { class: 'menu-btn danger-text', html: icon('trash') + '<span>Удалить стиль</span>', onclick: async () => {
        m.close();
        if (await confirmDialog({ title: `Удалить стиль «${st.name}»?`, text: 'Текущее оформление книги не изменится.', ok: 'Удалить', danger: true })) {
          settings.set({ styles: list.filter(x => x.id !== st.id) });
          build();
        }
      } }));
    m = sheet({ title: st.name, content, cls: 'menu-sheet' });
  }

  build();
  const off = settings.on(ch => {
    body.querySelectorAll('.switch[data-key]').forEach(sw => sw.classList.toggle('on', !!settings.get(sw.dataset.key)));
    if ('bionic' in ch && bionicBox) bionicBox.classList.toggle('dim', !settings.get('bionic'));
    if (STYLE_KEYS.some(k => k in ch)) {
      syncPreview();
      body.querySelectorAll('.style-chip[data-style]').forEach(chip => {
        const st = settings.styles().find(x => x.id === chip.dataset.style);
        if (st) chip.classList.toggle('on', isOn(st));
      });
    }
  });
  sh = sheet({ title: 'Оформление', content: body, cls: 'settings-sheet live', onClose: off });
  return sh;
}

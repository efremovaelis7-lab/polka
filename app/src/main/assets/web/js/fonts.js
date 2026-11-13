// Шрифты: встроенные, докачанные при сборке, системные и свои (.ttf/.otf).
import { settings } from './settings.js';
import { native, isNative } from './native.js';
import { db } from './db.js';

const BUILTIN = [
  { id: 'lora', name: 'Lora', files: [['fonts/Lora.ttf', '400 700'], ['fonts/Lora-Italic.ttf', '400 700', 'italic']] },
  { id: 'times', name: 'Классика', files: [['fonts/LiberationSerif-Regular.ttf', '400'], ['fonts/LiberationSerif-Bold.ttf', '700'],
    ['fonts/LiberationSerif-Italic.ttf', '400', 'italic'], ['fonts/LiberationSerif-BoldItalic.ttf', '700', 'italic']] },
  { id: 'inter', name: 'Inter', files: [['fonts/Inter-Regular.otf', '400'], ['fonts/Inter-Bold.otf', '700'], ['fonts/Inter-Italic.otf', '400', 'italic']] },
];

const EXTRA = [
  { id: 'literata', name: 'Literata', files: [['Literata.ttf', '200 900'], ['Literata-Italic.ttf', '200 900', 'italic']] },
  { id: 'ptserif', name: 'PT Serif', files: [['PTSerif-Regular.ttf', '400'], ['PTSerif-Bold.ttf', '700'], ['PTSerif-Italic.ttf', '400', 'italic'], ['PTSerif-BoldItalic.ttf', '700', 'italic']] },
  { id: 'ebgaramond', name: 'EB Garamond', files: [['EBGaramond.ttf', '400 800'], ['EBGaramond-Italic.ttf', '400 800', 'italic']] },
  { id: 'alegreya', name: 'Alegreya', files: [['Alegreya.ttf', '400 900'], ['Alegreya-Italic.ttf', '400 900', 'italic']] },
  { id: 'sourceserif', name: 'Source Serif', files: [['SourceSerif4.ttf', '200 900'], ['SourceSerif4-Italic.ttf', '200 900', 'italic']] },
  { id: 'cormorant', name: 'Cormorant', files: [['CormorantGaramond.ttf', '300 700'], ['CormorantGaramond-Italic.ttf', '300 700', 'italic']] },
  { id: 'ptsans', name: 'PT Sans', files: [['PTSans-Regular.ttf', '400'], ['PTSans-Bold.ttf', '700'], ['PTSans-Italic.ttf', '400', 'italic'], ['PTSans-BoldItalic.ttf', '700', 'italic']] },
  { id: 'montserrat', name: 'Montserrat', files: [['Montserrat.ttf', '100 900'], ['Montserrat-Italic.ttf', '100 900', 'italic']] },
  { id: 'comfortaa', name: 'Comfortaa', files: [['Comfortaa.ttf', '300 700']] },
  { id: 'robotoslab', name: 'Roboto Slab', files: [['RobotoSlab.ttf', '100 900']] },
  { id: 'jetbrains', name: 'JetBrains Mono', files: [['JetBrainsMono.ttf', '100 800'], ['JetBrainsMono-Italic.ttf', '100 800', 'italic']] },
  { id: 'ptmono', name: 'PT Mono', files: [['PTMono.ttf', '400']] },
];

const SYSTEM = [
  { id: 'serif', name: 'Системный', family: 'serif' },
  { id: 'sans', name: 'Без засечек', family: 'sans-serif' },
  { id: 'mono', name: 'Машинка', family: 'monospace' },
];

export const fonts = {
  list: [],
  async init() {
    let extra = [];
    try {
      const r = await fetch('fonts/extra/manifest.json', { cache: 'no-store' });
      if (r.ok) extra = await r.json();
    } catch (e) { /* нет доп. шрифтов */ }
    const have = new Set(extra);
    const ex = EXTRA.filter(f => have.has(f.files[0][0]))
      .map(f => ({ ...f, files: f.files.filter(x => have.has(x[0])).map(x => ['fonts/extra/' + x[0], x[1], x[2]]) }));
    const custom = [];
    for (const c of settings.get('customFonts') || []) {
      let url = null;
      if (c.path) url = native.fileUrl(c.path);
      else if (c.key) { const blob = await db.getFile(c.key); if (blob) url = URL.createObjectURL(blob); }
      if (url) custom.push({ id: c.id, name: c.name, custom: true, files: [[url, '100 900']] });
    }
    this.list = [...BUILTIN, ...ex, ...SYSTEM, ...custom];
    let css = '';
    for (const f of this.list) {
      if (!f.files) continue;
      for (const [url, w, st] of f.files) {
        css += `@font-face{font-family:"PF-${f.id}";src:url("${url}");font-weight:${w};font-style:${st || 'normal'};font-display:block}\n`;
      }
    }
    let style = document.getElementById('font-faces');
    if (!style) { style = document.createElement('style'); style.id = 'font-faces'; document.head.appendChild(style); }
    style.textContent = css;
  },
  family(id) {
    const f = this.list.find(x => x.id === id) || this.list[0];
    if (!f) return 'serif';
    if (f.family) return f.family;
    return `"PF-${f.id}", serif`;
  },
  async ready(id) {
    const f = this.list.find(x => x.id === id);
    if (!f || f.family) return;
    try {
      await Promise.all([document.fonts.load(`400 20px "PF-${f.id}"`), document.fonts.load(`700 20px "PF-${f.id}"`),
        document.fonts.load(`italic 400 20px "PF-${f.id}"`)]);
    } catch (e) { /* ignore */ }
  },
  async addCustom() {
    if (isNative) {
      const res = await native.pickFont();
      if (!res || !res.length) return null;
      const f = res[0];
      if (!/\.(ttf|otf|woff2?)$/i.test(f.name)) return { error: 'Нужен файл шрифта .ttf или .otf' };
      const id = 'c' + Date.now().toString(36);
      const name = f.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ');
      settings.set({ customFonts: [...(settings.get('customFonts') || []), { id, name, path: f.path }] });
      await this.init();
      return { id };
    }
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.ttf,.otf,.woff,.woff2';
      inp.onchange = async () => {
        const file = inp.files[0];
        if (!file) return resolve(null);
        const id = 'c' + Date.now().toString(36);
        await db.putFile('font:' + id, file);
        const name = file.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ');
        settings.set({ customFonts: [...(settings.get('customFonts') || []), { id, name, key: 'font:' + id }] });
        await this.init();
        resolve({ id });
      };
      inp.click();
    });
  },
  async removeCustom(id) {
    const list = settings.get('customFonts') || [];
    const c = list.find(x => x.id === id);
    if (c && c.path) native.deleteOwnFile(c.path);
    if (c && c.key) await db.delFile(c.key);
    settings.set({ customFonts: list.filter(x => x.id !== id) });
    if (settings.get('font') === id) settings.set({ font: 'lora' });
    await this.init();
  },
};

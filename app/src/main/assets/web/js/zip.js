// Минимальное чтение ZIP-архивов (EPUB, FB2.ZIP) без сторонних библиотек.
// Распаковка — встроенным DecompressionStream('deflate-raw').

const utf8 = new TextDecoder('utf-8');

export class Zip {
  constructor(buf, entries) {
    this.buf = buf;
    this.u8 = new Uint8Array(buf);
    this.entries = entries; // Map(name -> entry)
    this.lower = new Map();
    for (const name of entries.keys()) this.lower.set(name.toLowerCase(), name);
  }

  static isZip(buf) {
    const u = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    return u.length === 4 && u[0] === 0x50 && u[1] === 0x4b && u[2] === 0x03 && u[3] === 0x04;
  }

  static open(buf) {
    const dv = new DataView(buf);
    const len = buf.byteLength;
    let eocd = -1;
    for (let i = len - 22; i >= Math.max(0, len - 65558); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Файл повреждён (не ZIP)');
    const count = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    const entries = new Map();
    const u8 = new Uint8Array(buf);
    for (let i = 0; i < count; i++) {
      if (off + 46 > len || dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true);
      const csize = dv.getUint32(off + 20, true);
      const usize = dv.getUint32(off + 24, true);
      const nlen = dv.getUint16(off + 28, true);
      const xlen = dv.getUint16(off + 30, true);
      const clen = dv.getUint16(off + 32, true);
      const local = dv.getUint32(off + 42, true);
      const name = utf8.decode(u8.subarray(off + 46, off + 46 + nlen));
      if (!name.endsWith('/')) entries.set(name, { name, method, csize, usize, local });
      off += 46 + nlen + xlen + clen;
    }
    return new Zip(buf, entries);
  }

  find(name) {
    if (!name) return null;
    if (this.entries.has(name)) return this.entries.get(name);
    let n = name;
    try { n = decodeURIComponent(name); } catch (e) { /* ignore */ }
    if (this.entries.has(n)) return this.entries.get(n);
    const real = this.lower.get(n.toLowerCase());
    return real ? this.entries.get(real) : null;
  }

  has(name) { return !!this.find(name); }

  names() { return [...this.entries.keys()]; }

  async bytes(name) {
    const e = typeof name === 'string' ? this.find(name) : name;
    if (!e) throw new Error('Нет файла в архиве: ' + name);
    const dv = new DataView(this.buf);
    const nlen = dv.getUint16(e.local + 26, true);
    const xlen = dv.getUint16(e.local + 28, true);
    const start = e.local + 30 + nlen + xlen;
    const data = this.u8.subarray(start, start + e.csize);
    if (e.method === 0) return data.slice();
    if (e.method !== 8) throw new Error('Неизвестный метод сжатия ' + e.method);
    return inflateRaw(data);
  }

  async text(name) {
    const b = await this.bytes(name);
    return decodeText(b);
  }

  async blob(name, type) {
    const b = await this.bytes(name);
    return new Blob([b], { type: type || guessType(name) });
  }
}

export async function inflateRaw(data) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Обновите «Android System WebView» в Play Маркете — нужна новая версия для чтения EPUB');
  }
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

// Декодирование текста XML/HTML с учётом BOM и объявленной кодировки.
export function decodeText(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf) return utf8.decode(u.subarray(3));
  if (u[0] === 0xff && u[1] === 0xfe) return new TextDecoder('utf-16le').decode(u.subarray(2));
  if (u[0] === 0xfe && u[1] === 0xff) return new TextDecoder('utf-16be').decode(u.subarray(2));
  const head = String.fromCharCode.apply(null, u.subarray(0, Math.min(300, u.length)));
  const m = head.match(/encoding\s*=\s*["']([\w.:-]+)["']/i) || head.match(/charset\s*=\s*["']?([\w.:-]+)/i);
  let enc = m ? m[1].toLowerCase() : 'utf-8';
  if (enc === 'cp1251' || enc === 'win-1251') enc = 'windows-1251';
  try {
    return new TextDecoder(enc).decode(u);
  } catch (e) {
    return utf8.decode(u);
  }
}

export function guessType(name) {
  const n = String(name).toLowerCase();
  if (/\.jpe?g$/.test(n)) return 'image/jpeg';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.gif')) return 'image/gif';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.svg')) return 'image/svg+xml';
  if (n.endsWith('.css')) return 'text/css';
  return 'application/octet-stream';
}

// Разрешение относительного пути внутри архива.
export function resolvePath(base, href) {
  if (!href) return base;
  href = href.split('#')[0];
  try { href = decodeURIComponent(href); } catch (e) { /* ignore */ }
  if (href.startsWith('/')) return href.slice(1);
  const parts = base.split('/');
  parts.pop();
  for (const seg of href.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return parts.join('/');
}

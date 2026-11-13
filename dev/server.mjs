// Дев-сервер: имитирует WebView-оболочку (assets + /file?p=) для проверки в браузере.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'app/src/main/assets');
const BOOKS = process.env.BOOKS || '/home/claude/testbooks';
const FILES = process.env.FILESDIR || '/home/claude/devfiles';
const PORT = +process.env.PORT || 8765;
fs.mkdirSync(path.join(FILES, 'books'), { recursive: true });
fs.mkdirSync(path.join(FILES, 'fonts'), { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.epub': 'application/epub+zip', '.fb2': 'text/xml', '.zip': 'application/zip' };

function info(p) {
  const st = fs.statSync(p);
  return { path: p, name: path.basename(p), size: st.size, mtime: st.mtimeMs };
}
function walk(dir, out = []) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(epub|fb2|fb2\.zip)$/i.test(n)) out.push(info(p));
  }
  return out;
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname.startsWith('/web/')) {
      const p = path.join(ROOT, decodeURIComponent(u.pathname));
      if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      return fs.createReadStream(p).pipe(res);
    }
    if (u.pathname === '/file') {
      const p = u.searchParams.get('p');
      if (!p || !(p.startsWith(BOOKS) || p.startsWith(FILES)) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      return fs.createReadStream(p).pipe(res);
    }
    if (u.pathname === '/dev/scan') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(walk(BOOKS)));
    }
    if (u.pathname === '/dev/pick') { // «выбор» файлов: копируем в личную папку
      const names = (u.searchParams.get('names') || '').split('|').filter(Boolean);
      const sub = u.searchParams.get('sub') || 'books';
      fs.mkdirSync(path.join(FILES, sub), { recursive: true });
      const out = names.map(n => {
        const src = n.startsWith('/') ? n : path.join(BOOKS, n);
        const dst = path.join(FILES, sub, path.basename(src));
        fs.copyFileSync(src, dst);
        return info(dst);
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(out));
    }
    if (u.pathname === '/dev/delete') {
      const p = u.searchParams.get('p');
      let ok = false;
      if (p && p.startsWith(FILES) && fs.existsSync(p)) { fs.unlinkSync(p); ok = true; }
      res.writeHead(200); return res.end(String(ok));
    }
    res.writeHead(302, { Location: '/web/index.html' });
    res.end();
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(PORT, () => console.log('dev server on', PORT));

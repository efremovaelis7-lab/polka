import { Zip, decodeText } from './zip.js';
import { EpubBook } from './epub.js';
import { Fb2Book } from './fb2.js';

/** Открывает книгу из ArrayBuffer: EPUB, FB2 или FB2.ZIP. */
export async function openBook(buf, { metaOnly = false } = {}) {
  if (Zip.isZip(buf)) {
    const zip = Zip.open(buf);
    if (zip.has('META-INF/container.xml') || zip.names().some(n => n.toLowerCase().endsWith('.opf'))) {
      return EpubBook.open(zip, { metaOnly });
    }
    const fb = zip.names().find(n => n.toLowerCase().endsWith('.fb2'));
    if (fb) return Fb2Book.open(decodeText(await zip.bytes(fb)), { metaOnly });
    const ep = zip.names().find(n => n.toLowerCase().endsWith('.epub'));
    if (ep) return openBook((await zip.bytes(ep)).buffer, { metaOnly });
    throw new Error('В архиве нет книги');
  }
  const text = decodeText(new Uint8Array(buf));
  if (/<FictionBook|<fictionbook/i.test(text.slice(0, 3000))) return Fb2Book.open(text, { metaOnly });
  throw new Error('Неизвестный формат файла');
}

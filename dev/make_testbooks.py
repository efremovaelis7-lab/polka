"""Генерирует тестовые книги для проверки читалки (epub3, epub2, fb2 utf-8, fb2 cp1251, fb2.zip)."""
import base64, io, os, random, sys, zipfile
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/testbooks"
os.makedirs(OUT, exist_ok=True)
random.seed(7)

WORDS = ("утро солнце дорога сад окно ветер тишина письмо сердце время город река свет тень "
         "улыбка вечер дом мысль голос мечта книга память лето зима дождь небо море берег "
         "дверь рука взгляд шаг слово ночь звезда огонь чай комната история надежда").split()
VERBS = "шёл смотрел думал говорил ждал слушал молчал улыбался вспоминал писал читал знал".split()
ADJ = "тихий тёплый старый новый светлый долгий странный нежный холодный далёкий".split()
NAMES = ["Анна", "Алексей", "Мария", "Константин", "Вера", "Дмитрий"]


def sentence():
    n = random.randint(6, 16)
    w = []
    for i in range(n):
        r = random.random()
        w.append(random.choice(VERBS if r < .2 else ADJ if r < .45 else NAMES if r < .5 else WORDS))
    s = " ".join(w)
    if random.random() < .3:
        s = s.replace(" ", ", ", 1)
    if random.random() < .15:
        s += " — " + random.choice(WORDS)
    return s[0].upper() + s[1:] + random.choice([".", ".", ".", "!", "?", "…"])


def para(k=None):
    return " ".join(sentence() for _ in range(k or random.randint(2, 7)))


def cover(title, author, color, w=600, h=900):
    img = Image.new("RGB", (w, h), color)
    d = ImageDraw.Draw(img)
    try:
        f1 = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", 56)
        f2 = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf", 34)
    except Exception:
        f1 = f2 = ImageFont.load_default()
    d.rectangle([30, 30, w - 30, h - 30], outline=(240, 220, 180), width=4)
    y = 300
    for line in title.split("\n"):
        d.text((w / 2, y), line, font=f1, fill=(250, 240, 220), anchor="mm")
        y += 70
    d.text((w / 2, h - 140), author, font=f2, fill=(240, 220, 180), anchor="mm")
    for i in range(12):
        d.ellipse([w / 2 - 6 + (i - 6) * 22, 520, w / 2 + 6 + (i - 6) * 22, 532], fill=(240, 220, 180))
    b = io.BytesIO()
    img.save(b, "JPEG", quality=85)
    return b.getvalue()


def illus():
    img = Image.new("RGB", (500, 300), (200, 210, 230))
    d = ImageDraw.Draw(img)
    for i in range(0, 500, 25):
        d.line([(i, 300), (250, 120)], fill=(120, 140, 180), width=2)
    d.ellipse([200, 40, 300, 140], fill=(250, 210, 120))
    b = io.BytesIO()
    img.save(b, "PNG")
    return b.getvalue()


# ----------------------------------------------------------------------- EPUB 3
def epub3(path):
    chapters = []
    first = ("Все счастливые семьи похожи друг на друга, каждая несчастливая семья несчастлива по-своему. "
             "Всё смешалось в доме Облонских.")
    for i in range(1, 7):
        body = [f'<h2 class="chtitle">Глава {i}</h2>']
        if i == 1:
            body.append(f'<p class="calibre3">{first}<a epub:type="noteref" href="notes.xhtml#n1" id="r1"><sup>1</sup></a></p>')
            body.append('<p class="calibre5">Этот абзац написан курсивом через CSS-класс, как в книгах после Calibre.</p>')
            body.append('<p class="center"><img src="../images/pic.png" alt="рисунок"/></p>')
            body.append('<p>Ссылка на <a href="ch3.xhtml#mid">середину третьей главы</a> и сноска<a epub:type="noteref" href="notes.xhtml#n2"><sup>2</sup></a>.</p>')
        for k in range(18 + i * 4):
            if i == 3 and k == 10:
                body.append(f'<p id="mid"><b>Середина главы 3.</b> {para()}</p>')
            elif k % 9 == 4:
                body.append(f'<p>— {sentence()} — <em>сказал</em> {random.choice(NAMES)}.</p>')
            else:
                body.append(f"<p>{para()}</p>")
        if i == 2:
            body.append('<h3 id="sub">Подраздел второй главы</h3>')
            body += [f"<p>{para()}</p>" for _ in range(6)]
        chapters.append(body)
    css = (".calibre3{text-indent:1.5em}\n.calibre5 { font-style: italic; margin: 0 }\n"
           ".center{text-align:center}\n.chtitle{font-size:1.6em;text-align:center}\n"
           "body{font-family:'Times New Roman';color:#333}\n")

    def xhtml(title, body):
        return ('<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
                '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ru">'
                f'<head><title>{title}</title><link rel="stylesheet" type="text/css" href="../css/style.css"/>'
                '<style>.x{color:red}</style><script>alert(1)</script></head>'
                f'<body>{"".join(body)}</body></html>')

    z = zipfile.ZipFile(path, "w")
    z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
    z.writestr("META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>', compress_type=zipfile.ZIP_DEFLATED)
    man = ['<item id="nav" href="text/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
           '<item id="css" href="css/style.css" media-type="text/css"/>',
           '<item id="cover" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>',
           '<item id="pic" href="images/pic.png" media-type="image/png"/>',
           '<item id="coverpage" href="text/cover.xhtml" media-type="application/xhtml+xml"/>',
           '<item id="notes" href="text/notes.xhtml" media-type="application/xhtml+xml"/>']
    spine = ['<itemref idref="coverpage"/>']
    for i in range(1, 7):
        man.append(f'<item id="ch{i}" href="text/ch{i}.xhtml" media-type="application/xhtml+xml"/>')
        spine.append(f'<itemref idref="ch{i}"/>')
    spine.append('<itemref idref="notes" linear="no"/>')
    opf = ('<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">'
           '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">test-1</dc:identifier>'
           '<dc:title>Счастливые семьи</dc:title><dc:creator>Лев Толстой</dc:creator><dc:language>ru</dc:language>'
           '<dc:description>Тестовая книга: сноски, картинки, курсив через CSS.</dc:description>'
           '<meta property="belongs-to-collection" id="c1">Тестовая серия</meta><meta refines="#c1" property="group-position">2</meta>'
           f'</metadata><manifest>{"".join(man)}</manifest><spine>{"".join(spine)}</spine></package>')
    z.writestr("OEBPS/content.opf", opf, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr("OEBPS/css/style.css", css, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr("OEBPS/images/cover.jpg", cover("Счастливые\nсемьи", "Лев Толстой", (110, 40, 50)))
    z.writestr("OEBPS/images/pic.png", illus())
    z.writestr("OEBPS/text/cover.xhtml", '<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink"><head><title>Обложка</title></head><body><svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 600 900"><image width="600" height="900" xlink:href="../images/cover.jpg"/></svg></body></html>', compress_type=zipfile.ZIP_DEFLATED)
    for i, body in enumerate(chapters, 1):
        z.writestr(f"OEBPS/text/ch{i}.xhtml", xhtml(f"Глава {i}", body), compress_type=zipfile.ZIP_DEFLATED)
    z.writestr("OEBPS/text/notes.xhtml", xhtml("Примечания", [
        '<h2>Примечания</h2>',
        '<aside epub:type="footnote" id="n1"><p>Первая фраза романа «Анна Каренина» (1877).</p></aside>',
        '<aside epub:type="footnote" id="n2"><p>Вторая сноска — <i>с курсивом</i>.</p></aside>']), compress_type=zipfile.ZIP_DEFLATED)
    toc = ['<li><a href="cover.xhtml">Обложка</a></li>']
    for i in range(1, 7):
        sub = '<ol><li><a href="ch2.xhtml#sub">Подраздел второй главы</a></li></ol>' if i == 2 else ""
        toc.append(f'<li><a href="ch{i}.xhtml">Глава {i}</a>{sub}</li>')
    z.writestr("OEBPS/text/nav.xhtml", '<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Оглавление</title></head><body>'
               f'<nav epub:type="toc"><h1>Оглавление</h1><ol>{"".join(toc)}</ol></nav></body></html>', compress_type=zipfile.ZIP_DEFLATED)
    z.close()


# ----------------------------------------------------------------------- EPUB 2 (ncx, без обложки)
def epub2(path):
    z = zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED)
    z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
    z.writestr("META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
    man, spine, nav = [], [], []
    for i in range(1, 4):
        man.append(f'<item id="c{i}" href="Text/part%20{i}.html" media-type="application/xhtml+xml"/>')
        spine.append(f'<itemref idref="c{i}"/>')
        nav.append(f'<navPoint id="np{i}" playOrder="{i}"><navLabel><text>Часть {i}. {random.choice(ADJ).capitalize()} {random.choice(WORDS)}</text></navLabel><content src="Text/part%20{i}.html"/></navPoint>')
        z.writestr(f"Text/part {i}.html", '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title></head><body>'
                   f'<h1>Часть {i}</h1>' + "".join(f"<p>{para()}</p>" for _ in range(30)) + '</body></html>')
    man.append('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>')
    z.writestr("content.opf", '<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">'
               '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf"><dc:title>Без обложки: долгое название книги про лето</dc:title>'
               '<dc:creator opf:role="aut" opf:file-as="Иванова, Мария">Мария Иванова</dc:creator><dc:language>ru</dc:language>'
               '<meta name="calibre:series" content="Летние истории"/><meta name="calibre:series_index" content="1"/></metadata>'
               f'<manifest>{"".join(man)}</manifest><spine toc="ncx">{"".join(spine)}</spine></package>')
    z.writestr("toc.ncx", '<?xml version="1.0" encoding="utf-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head/><docTitle><text>x</text></docTitle>'
               f'<navMap>{"".join(nav)}</navMap></ncx>')
    z.close()


# ----------------------------------------------------------------------- FB2
def fb2_text(title, author_first, author_last, with_cover=True):
    cov = base64.b64encode(cover(title, f"{author_first} {author_last}", (40, 70, 90))).decode()
    pic = base64.b64encode(illus()).decode()
    parts = []
    for p in range(1, 3):
        secs = []
        for c in range(1, 4):
            n = (p - 1) * 3 + c
            body = [f'<title><p>Глава {n}</p><p>{random.choice(ADJ).capitalize()} {random.choice(WORDS)}</p></title>']
            if n == 1:
                body.append('<epigraph><p>Я помню чудное мгновенье…</p><text-author>А. С. Пушкин</text-author></epigraph>')
                body.append(f'<p>Начало истории<a l:href="#n1" type="note">[1]</a>. <emphasis>Курсив</emphasis>, <strong>жирный</strong>, H<sub>2</sub>O и x<sup>2</sup>.</p>')
                body.append('<image l:href="#pic.png"/>')
                body.append('<poem><title><p>Стихи</p></title><stanza><v>Мороз и солнце; день чудесный!</v><v>Ещё ты дремлешь, друг прелестный —</v></stanza></poem>')
                body.append('<subtitle>* * *</subtitle>')
                body.append('<cite><p>Цитата в отдельном блоке.</p></cite>')
                body.append('<empty-line/>')
            for k in range(25):
                body.append(f"<p>{'— ' if k % 6 == 2 else ''}{para()}</p>")
            if n == 4:
                body.append(f'<p>Вторая сноска<a l:href="#n2" type="note">[2]</a> &amp; амперсанд.</p>')
            secs.append(f'<section>{"".join(body)}</section>')
        parts.append(f'<section><title><p>Часть {"первая" if p == 1 else "вторая"}</p></title>{"".join(secs)}</section>')
    cover_tag = '<coverpage><image l:href="#cover.jpg"/></coverpage>' if with_cover else ""
    return ('<?xml version="1.0" encoding="{ENC}"?>\n'
            '<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">'
            f'<description><title-info><genre>prose</genre><author><first-name>{author_first}</first-name><last-name>{author_last}</last-name></author>'
            f'<book-title>{title}</book-title><annotation><p>Аннотация книги «{title}». Тестовый текст.</p></annotation>'
            f'{cover_tag}<lang>ru</lang><sequence name="Серия FB2" number="3"/></title-info></description>'
            f'<body><title><p>{author_first} {author_last}</p><p>{title}</p></title>{"".join(parts)}</body>'
            '<body name="notes"><title><p>Примечания</p></title>'
            '<section id="n1"><title><p>1</p></title><p>Это первая сноска из FB2.</p></section>'
            '<section id="n2"><title><p>2</p></title><p>Вторая сноска, <emphasis>с курсивом</emphasis>.</p></section></body>'
            f'<binary id="cover.jpg" content-type="image/jpeg">{cov}</binary>'
            f'<binary id="pic.png" content-type="image/png">{pic}</binary>'
            '</FictionBook>')


epub3(os.path.join(OUT, "Толстой - Счастливые семьи.epub"))
epub2(os.path.join(OUT, "no_cover.epub"))
t = fb2_text("Зимнее утро", "Вера", "Снегирёва").replace("{ENC}", "utf-8")
open(os.path.join(OUT, "zimnee.fb2"), "w", encoding="utf-8").write(t)
t = fb2_text("Книга в кодировке 1251", "Пётр", "Старинов", with_cover=False).replace("{ENC}", "windows-1251")
open(os.path.join(OUT, "cp1251.fb2"), "w", encoding="cp1251").write(t)
t = fb2_text("Сжатая книга", "Ольга", "Архивова").replace("{ENC}", "utf-8")
with zipfile.ZipFile(os.path.join(OUT, "archived.fb2.zip"), "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("archived.fb2", t)
# книга с html-сущностями (частая ошибка в fb2)
t = fb2_text("Сущности&nbsp;и&mdash;тире", "Анна", "Ошибкина", with_cover=False).replace("{ENC}", "utf-8")
open(os.path.join(OUT, "entities.fb2"), "w", encoding="utf-8").write(t)
print("\n".join(sorted(os.listdir(OUT))))

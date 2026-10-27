"""Document model + renderers (docx, pdf, md, txt, xlsx, csv, scanned pdf/jpg, handwritten jpg)."""
import io, csv, random, textwrap
from pathlib import Path
from xml.sax.saxutils import escape
import numpy as np
import fitz
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from docx import Document as DocxDocument
from docx.shared import Pt
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter


class Doc:
    """Format-neutral document: blocks are tuples ('title'|'h'|'p'|'bullet'|'kv'|'table'|'pagebreak'|'sp', ...)."""

    def __init__(self, title, org=None):
        self.title, self.org, self.blocks = title, org, []
        self.np = 0   # paragraph counter (locators use "paragraph N" for p/bullet blocks)
        self.nt = 0

    def h(self, t): self.blocks.append(('h', t))
    def sp(self): self.blocks.append(('sp',))
    def pagebreak(self): self.blocks.append(('pagebreak',))
    def kv(self, pairs): self.blocks.append(('kv', pairs))

    def p(self, t):
        self.np += 1; self.blocks.append(('p', t)); return self.np

    def bullet(self, t):
        self.np += 1; self.blocks.append(('bullet', t)); return self.np

    def table(self, header, rows, widths=None):
        self.nt += 1; self.blocks.append(('table', header, rows, widths)); return self.nt


# ---------------------------------------------------------------- text formats
def render_txt(doc, path):
    L = []
    if doc.org: L.append(doc.org.upper())
    L += [doc.title, '=' * len(doc.title), '']
    for b in doc.blocks:
        k = b[0]
        if k == 'h': L += ['', b[1].upper(), '-' * len(b[1])]
        elif k == 'p': L += [textwrap.fill(b[1], 100), '']
        elif k == 'bullet': L += [textwrap.fill('- ' + b[1], 100, subsequent_indent='  ')]
        elif k == 'kv': L += [f'{a}: {v}' for a, v in b[1]] + ['']
        elif k == 'table':
            L.append(' | '.join(b[1]))
            L += [' | '.join(str(c) for c in r) for r in b[2]] + ['']
        elif k in ('sp', 'pagebreak'): L.append('')
    Path(path).write_text('\n'.join(L), encoding='utf-8')


def render_md(doc, path):
    L = []
    if doc.org: L.append(f'*{doc.org}*\n')
    L += [f'# {doc.title}', '']
    for b in doc.blocks:
        k = b[0]
        if k == 'h': L += ['', f'## {b[1]}', '']
        elif k == 'p': L += [b[1], '']
        elif k == 'bullet': L += ['- ' + b[1]]
        elif k == 'kv': L += [f'- **{a}:** {v}' for a, v in b[1]] + ['']
        elif k == 'table':
            L += ['| ' + ' | '.join(b[1]) + ' |', '|' + '---|' * len(b[1])]
            L += ['| ' + ' | '.join(str(c) for c in r) + ' |' for r in b[2]] + ['']
    Path(path).write_text('\n'.join(L), encoding='utf-8')


def render_docx(doc, path):
    d = DocxDocument()
    d.styles['Normal'].font.name = 'Calibri'; d.styles['Normal'].font.size = Pt(11)
    if doc.org:
        p = d.add_paragraph(doc.org); p.runs[0].bold = True
    d.add_heading(doc.title, level=1)
    for b in doc.blocks:
        k = b[0]
        if k == 'h': d.add_heading(b[1], level=2)
        elif k == 'p': d.add_paragraph(b[1])
        elif k == 'bullet': d.add_paragraph(b[1], style='List Bullet')
        elif k == 'kv':
            t = d.add_table(rows=0, cols=2)
            for a, v in b[1]:
                c = t.add_row().cells; c[0].text = a; c[1].text = str(v); c[0].paragraphs[0].runs[0].bold = True
        elif k == 'table':
            t = d.add_table(rows=1, cols=len(b[1])); t.style = 'Table Grid'
            for i, hd in enumerate(b[1]):
                t.rows[0].cells[i].text = hd; t.rows[0].cells[i].paragraphs[0].runs[0].bold = True
            for r in b[2]:
                c = t.add_row().cells
                for i, v in enumerate(r): c[i].text = str(v)
            d.add_paragraph('')
        elif k == 'pagebreak': d.add_page_break()
        elif k == 'sp': d.add_paragraph('')
    d.save(str(path))


def render_pdf(doc, path, rows_per_page=14):
    ss = getSampleStyleSheet()
    base = ParagraphStyle('b', parent=ss['Normal'], fontName='Helvetica', fontSize=10.5, leading=15, spaceAfter=7)
    cell = ParagraphStyle('c', parent=base, fontSize=8.5, leading=10.5, spaceAfter=0)
    cellb = ParagraphStyle('cb', parent=cell, fontName='Helvetica-Bold')
    ttl = ParagraphStyle('t', parent=ss['Title'], fontSize=16, leading=20, alignment=0, spaceAfter=8)
    h2 = ParagraphStyle('h', parent=ss['Heading2'], fontSize=12, spaceBefore=8, spaceAfter=5)
    org = ParagraphStyle('o', parent=base, fontName='Helvetica-Bold', fontSize=9, textColor=colors.HexColor('#444444'))
    story = []
    if doc.org: story.append(Paragraph(escape(doc.org), org))
    story.append(Paragraph(escape(doc.title), ttl))
    for b in doc.blocks:
        k = b[0]
        if k == 'h': story.append(Paragraph(escape(b[1]), h2))
        elif k == 'p': story.append(Paragraph(escape(b[1]), base))
        elif k == 'bullet': story.append(Paragraph('&bull; ' + escape(b[1]), ParagraphStyle('bl', parent=base, leftIndent=12, firstLineIndent=-8)))
        elif k == 'sp': story.append(Spacer(1, 8))
        elif k == 'pagebreak': story.append(PageBreak())
        elif k == 'kv':
            t = Table([[Paragraph(escape(a), cellb), Paragraph(escape(str(v)), cell)] for a, v in b[1]], colWidths=[40 * mm, 130 * mm])
            t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('BOTTOMPADDING', (0, 0), (-1, -1), 2)]))
            story += [t, Spacer(1, 8)]
        elif k == 'table':
            hdr, rows, widths = b[1], b[2], b[3]
            ncol = len(hdr)
            cw = [w * mm for w in widths] if widths else [170 * mm / ncol] * ncol
            for start in range(0, max(len(rows), 1), rows_per_page):
                chunk = rows[start:start + rows_per_page]
                data = [[Paragraph(escape(str(x)), cellb) for x in hdr]] + [[Paragraph(escape(str(x)), cell) for x in r] for r in chunk]
                t = Table(data, colWidths=cw, repeatRows=1)
                t.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.5, colors.grey), ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8e8e8')),
                                       ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
                story.append(t)
                if start + rows_per_page < len(rows):
                    story.append(PageBreak())
            story.append(Spacer(1, 8))

    def footer(c, d):
        c.setFont('Helvetica', 8); c.setFillColor(colors.grey)
        c.drawString(18 * mm, 10 * mm, doc.title[:90]); c.drawRightString(192 * mm, 10 * mm, f'Page {d.page}')
    SimpleDocTemplate(str(path), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                      title=doc.title).build(story, onFirstPage=footer, onLaterPages=footer)


# ---------------------------------------------------------------- scans
def scan_effect(img, seed, strength=1.0):
    rng = np.random.default_rng(seed)
    img = img.convert('L')
    ang = float(rng.uniform(-1.4, 1.4)) * strength
    img = img.rotate(ang, resample=Image.BICUBIC, expand=True, fillcolor=238)
    arr = np.asarray(img).astype(np.float32)
    h, w = arr.shape
    arr = arr * rng.uniform(0.88, 0.97) + 8
    arr -= np.linspace(rng.uniform(0, 14), rng.uniform(10, 32), w)[None, :] * strength     # uneven lighting
    arr -= np.linspace(0, rng.uniform(0, 10), h)[:, None]
    arr += rng.normal(0, 5.5 * strength, arr.shape)
    for _ in range(int(60 * strength)):                                                        # dust specks
        y, x = rng.integers(0, h), rng.integers(0, w); r = rng.integers(1, 3)
        arr[max(0, y - r):y + r, max(0, x - r):x + r] -= rng.uniform(40, 110)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.65))
    out = Image.new('L', (w + 40, h + 40), 70)                                                 # scanner bed edge
    out.paste(img, (20, 20))
    return out.convert('RGB')


def pdf_to_images(pdf_path, dpi=150):
    d = fitz.open(str(pdf_path)); out = []
    for pg in d:
        pix = pg.get_pixmap(dpi=dpi)
        out.append(Image.frombytes('RGB', (pix.width, pix.height), pix.samples))
    d.close(); return out


def save_scanned(doc, path, fmt, seed, tmp):
    """Render doc -> pdf -> raster -> scan degradation -> image-only PDF or JPG (page 1)."""
    tmp = Path(tmp) / f'_tmp_{seed}.pdf'
    render_pdf(doc, tmp)
    pages = [scan_effect(im, seed + i) for i, im in enumerate(pdf_to_images(tmp))]
    tmp.unlink()
    if fmt == 'jpg':
        pages[0].save(str(path), 'JPEG', quality=62, dpi=(150, 150))
    else:
        pages[0].save(str(path), 'PDF', save_all=True, append_images=pages[1:], resolution=150, quality=62)
    return len(pages)


FONT_HAND = r'C:\Windows\Fonts\Inkfree.ttf'


def save_handwritten(title, lines, path, seed):
    """lines: list of strings (each a paragraph). Draws blue-ink handwriting on ruled paper, then scan-degrades."""
    rng = random.Random(seed)
    W, H = 1240, 1754
    bg = Image.new('RGB', (W, H), (252, 249, 238)); dr = ImageDraw.Draw(bg)
    for y in range(150, H - 60, 52): dr.line([(0, y), (W, y)], fill=(176, 196, 222), width=2)
    dr.line([(110, 0), (110, H)], fill=(222, 130, 130), width=2)
    f = ImageFont.truetype(FONT_HAND, 36); fh = ImageFont.truetype(FONT_HAND, 44)
    ink = (28, 40, 120)
    y = 106
    dr.text((130, y - 30), title, font=fh, fill=ink)
    y = 150 + 52 - 12
    for para in lines:
        for ln in textwrap.wrap(para, 52) or ['']:
            layer = Image.new('RGBA', (W, 80), (0, 0, 0, 0)); ld = ImageDraw.Draw(layer)
            x = 130
            for ch in ln:
                ld.text((x, 14 + rng.randint(-2, 2)), ch, font=f, fill=ink + (235,))
                x += f.getlength(ch) + rng.uniform(-0.4, 0.6)
            layer = layer.rotate(rng.uniform(-0.7, 0.7), resample=Image.BICUBIC)
            bg.paste(layer, (0, y - 36), layer)
            y += 52
            if y > H - 90: break
        y += 20
    scan_effect(bg, seed, 0.9).save(str(path), 'JPEG', quality=60, dpi=(150, 150))


# ---------------------------------------------------------------- tabular
def save_xlsx(path, sheets):
    """sheets: list of dict(name, meta=[(k,v)], header=[...], rows=[[...]], widths=[...]). Returns {sheet: first data row}."""
    wb = openpyxl.Workbook(); wb.remove(wb.active); starts = {}
    thin = Side(style='thin', color='999999')
    for sh in sheets:
        ws = wb.create_sheet(sh['name'][:31]); r = 1
        for k, v in sh.get('meta', []):
            ws.cell(r, 1, k).font = Font(bold=True); ws.cell(r, 2, v); r += 1
        if sh.get('meta'): r += 1
        for i, hd in enumerate(sh['header'], 1):
            c = ws.cell(r, i, hd); c.font = Font(bold=True); c.fill = PatternFill('solid', fgColor='DDE6F0')
            c.alignment = Alignment(wrap_text=True, vertical='top'); c.border = Border(top=thin, bottom=thin, left=thin, right=thin)
        r += 1; starts[sh['name']] = r
        for row in sh['rows']:
            for i, v in enumerate(row, 1):
                c = ws.cell(r, i, v); c.border = Border(top=thin, bottom=thin, left=thin, right=thin)
                c.alignment = Alignment(wrap_text=True, vertical='top')
            r += 1
        for i, w in enumerate(sh.get('widths') or [16] * len(sh['header']), 1):
            ws.column_dimensions[get_column_letter(i)].width = w
        ws.freeze_panes = ws.cell(starts[sh['name']], 1)
    wb.save(str(path)); return starts


def save_csv(path, header, rows):
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)

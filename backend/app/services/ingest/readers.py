"""Free readers: turn any uploaded file into text and tables with plain Python (no AI, no cost).

Only when a file is a scan, a photo or a recording does the pipeline need AI or speech-to-text; see importer.py.
"""
import csv, io, re
from dataclasses import dataclass, field

EXT_FORMAT = {'xlsx': 'xlsx', 'xlsm': 'xlsx', 'csv': 'csv', 'docx': 'docx', 'pdf': 'pdf', 'txt': 'txt', 'md': 'md',
              'jpg': 'jpg', 'jpeg': 'jpg', 'png': 'png', 'webp': 'webp', 'mp3': 'mp3', 'wav': 'wav', 'm4a': 'm4a', 'ogg': 'ogg', 'webm': 'webm', 'aac': 'aac', 'opus': 'opus'}
AUDIO = {'mp3', 'wav', 'm4a', 'ogg', 'webm', 'aac', 'opus'}
IMAGE = {'jpg', 'png', 'webp'}
MIME = {'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'csv': 'text/csv', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'pdf': 'application/pdf', 'txt': 'text/plain', 'md': 'text/markdown', 'jpg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp',
        'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'm4a': 'audio/mp4', 'ogg': 'audio/ogg', 'webm': 'audio/webm', 'aac': 'audio/aac', 'opus': 'audio/ogg'}


@dataclass
class ReadResult:
    fmt: str
    kind: str                       # tabular | narrative | form | scanned | handwritten | audio | image | other
    text: str = ''
    tables: list = field(default_factory=list)   # [{'name': sheet, 'rows': [[cell, ...], ...]}]
    pages: int | None = None
    scanned: bool = False
    duration: float | None = None
    note: str = ''


def format_of(filename: str):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    return EXT_FORMAT.get(ext)


def _cell(v):
    if v is None: return ''
    if hasattr(v, 'strftime'): return v.strftime('%Y-%m-%d')
    if isinstance(v, float) and v.is_integer(): return str(int(v))
    return str(v).strip()


def _tables_text(tables):
    out = []
    for t in tables:
        out.append(f"## Sheet: {t['name']}")
        for i, r in enumerate(t['rows'], 1):
            if any(r): out.append(f"row {i}: " + ' | '.join(r))
    return '\n'.join(out)


def read(data: bytes, filename: str) -> ReadResult:
    fmt = format_of(filename)
    if fmt is None:
        return ReadResult('other', 'other', note='Unsupported file type')
    if fmt == 'xlsx':
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True, read_only=True)
        tables = [dict(name=ws.title, rows=[[_cell(c) for c in row] for row in ws.iter_rows(values_only=True)][:2000]) for ws in wb]
        return ReadResult(fmt, 'tabular', _tables_text(tables), tables)
    if fmt == 'csv':
        txt = data.decode('utf-8-sig', errors='replace')
        rows = [[c.strip() for c in r] for r in csv.reader(io.StringIO(txt))][:5000]
        tables = [dict(name='CSV', rows=rows)]
        return ReadResult(fmt, 'tabular', _tables_text(tables), tables)
    if fmt == 'docx':
        from docx import Document
        d = Document(io.BytesIO(data))
        paras = [f"paragraph {i}: {p.text.strip()}" for i, p in enumerate([p for p in d.paragraphs if p.text.strip()], 1)]
        tables = [dict(name=f'table {i}', rows=[[c.text.strip() for c in r.cells] for r in t.rows]) for i, t in enumerate(d.tables, 1)]
        kind = 'form' if tables and len(paras) < 8 else 'narrative'
        return ReadResult(fmt, kind, '\n'.join(paras) + ('\n' + _tables_text(tables) if tables else ''), tables)
    if fmt in ('txt', 'md'):
        txt = data.decode('utf-8-sig', errors='replace')
        lines = [l for l in txt.splitlines()]
        return ReadResult(fmt, 'narrative', '\n'.join(f'line {i}: {l}' for i, l in enumerate(lines, 1) if l.strip()))
    if fmt == 'pdf':
        import pymupdf
        doc = pymupdf.open(stream=data, filetype='pdf')
        pages = [p.get_text('text') for p in doc]
        chars = sum(len(p.strip()) for p in pages)
        if chars < 40 * max(1, len(pages)):    # almost no text layer: it is a scan
            return ReadResult(fmt, 'scanned', '', pages=len(pages), scanned=True, note='Scanned PDF: needs AI reading')
        text = '\n'.join(f"## page {i}\n{t.strip()}" for i, t in enumerate(pages, 1))
        tabs = []
        try:
            for i, p in enumerate(doc, 1):
                for j, tb in enumerate(p.find_tables().tables, 1):
                    rows = [[_cell(c) for c in r] for r in tb.extract()]
                    if len(rows) > 1: tabs.append(dict(name=f'page {i} table {j}', rows=rows))
        except Exception:
            pass
        low = text.lower()
        kind = 'tabular' if tabs and ('below' in low or 'attendance' in low) else 'form' if ('form' in low[:400] or tabs) else 'narrative'
        return ReadResult(fmt, kind, text, tabs, pages=len(pages))
    if fmt in IMAGE:
        return ReadResult(fmt, 'handwritten', '', scanned=True, note='Photo or scan: needs AI reading')
    if fmt in AUDIO:
        dur = None
        try:
            import mutagen
            m = mutagen.File(io.BytesIO(data)); dur = round(m.info.length, 1) if m and m.info else None
        except Exception:
            pass
        return ReadResult(fmt, 'audio', '', duration=dur, note='Recording: needs speech-to-text')
    return ReadResult(fmt, 'other')


# ---------------------------------------------------------------- dates found in names and text
MONTHS = {m: i for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], 1)}


def parse_date(s):
    import datetime as dt
    if s is None: return None
    if hasattr(s, 'year'): return s
    s = str(s).strip()
    m = re.search(r'(20\d\d)[-_./](\d{1,2})[-_./](\d{1,2})', s)
    if m:
        try: return dt.date(int(m[1]), int(m[2]), int(m[3]))
        except ValueError: pass
    m = re.search(r'\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d\d)\b', s)
    if m:
        try: return dt.date(int(m[3]), int(m[2]), int(m[1]))       # Indian style: day first
        except ValueError: pass
    m = re.search(r'\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(20\d\d)\b', s)
    if m and m[2][:3].lower() in MONTHS:
        try: return dt.date(int(m[3]), MONTHS[m[2][:3].lower()], int(m[1]))
        except ValueError: pass
    m = re.search(r'\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d\d)\b', s)
    if m and m[1][:3].lower() in MONTHS:
        try: return dt.date(int(m[3]), MONTHS[m[1][:3].lower()], int(m[2]))
        except ValueError: pass
    return None

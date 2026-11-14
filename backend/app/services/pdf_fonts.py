"""Indian-script words (names, schools, chapters) in the PDF reports.

The reports are written in English, but data stays as written, so a Marathi chapter name or a Tamil teacher name can appear in them. The report
font (DejaVu) has no glyphs for those scripts and reportlab cannot shape them (letters must be joined and re-ordered), so each word in such a
script is shaped with HarfBuzz (`uharfbuzz`), drawn from a Noto font (files in app/assets/fonts, SIL Open Font Licence, see OFL.txt there) with
matplotlib, and put into the text as a small picture. `Paragraph` here is reportlab's Paragraph that does this by itself: use it instead of the
original. Without `uharfbuzz` it changes nothing (those words then show as boxes, as before).
"""
import hashlib, io, os, re, tempfile
from reportlab.platypus import Paragraph as _Paragraph

try:
    import uharfbuzz as hb
    from fontTools.ttLib import TTFont as _FT
    from fontTools.pens.basePen import BasePen
    from matplotlib.backends.backend_agg import FigureCanvasAgg
    from matplotlib.figure import Figure
    from matplotlib.patches import PathPatch
    from matplotlib.path import Path
    OK = True
except Exception:          # the package is optional
    OK = False

_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'fonts')
_SCRIPTS = [  # (file, first, last code point)
    ('notosansdevanagari.ttf', 0x0900, 0x097F), ('notosansbengali.ttf', 0x0980, 0x09FF), ('notosansgujarati.ttf', 0x0A80, 0x0AFF),
    ('notosansoriya.ttf', 0x0B00, 0x0B7F), ('notosanstamil.ttf', 0x0B80, 0x0BFF), ('notosanstelugu.ttf', 0x0C00, 0x0C7F),
    ('notosanskannada.ttf', 0x0C80, 0x0CFF), ('notosansmalayalam.ttf', 0x0D00, 0x0D7F), ('notonaskharabic.ttf', 0x0600, 0x06FF),
]
_CHARS = ''.join(f'\\u{a:04x}-\\u{b:04x}' for _, a, b in _SCRIPTS)
_WORD = re.compile(f'[{_CHARS}\\u200c\\u200d]+(?:[\\u0964\\u0965]|[{_CHARS}\\u200c\\u200d])*')
_cache_fonts, _cache_img = {}, {}
_TMP = os.path.join(tempfile.gettempdir(), 'crp_pdf_words')      # small pictures of shaped words, reused between reports


def _file_for(ch):
    o = ord(ch)
    for f, a, b in _SCRIPTS:
        if a <= o <= b:
            return f
    return None


def _font(file):
    if file not in _cache_fonts:
        path = os.path.join(_DIR, file)
        blob = hb.Blob.from_file_path(path); face = hb.Face(blob)
        tt = _FT(path)
        _cache_fonts[file] = (hb.Font(face), tt, tt.getGlyphSet(), tt.getGlyphOrder(), face.upem, tt['hhea'].ascent, tt['hhea'].descent)
    return _cache_fonts[file]


if OK:
    class _Pen(BasePen):
        def __init__(self, gs):
            super().__init__(gs); self.v, self.c, self.dx, self.dy = [], [], 0, 0
        def _moveTo(self, p): self.v.append((p[0] + self.dx, p[1] + self.dy)); self.c.append(Path.MOVETO)
        def _lineTo(self, p): self.v.append((p[0] + self.dx, p[1] + self.dy)); self.c.append(Path.LINETO)
        def _curveToOne(self, a, b, c): self.v += [(a[0] + self.dx, a[1] + self.dy), (b[0] + self.dx, b[1] + self.dy), (c[0] + self.dx, c[1] + self.dy)]; self.c += [Path.CURVE4] * 3
        def _qCurveToOne(self, a, b): self.v += [(a[0] + self.dx, a[1] + self.dy), (b[0] + self.dx, b[1] + self.dy)]; self.c += [Path.CURVE3] * 2
        def _closePath(self): self.v.append((0, 0)); self.c.append(Path.CLOSEPOLY)


def _picture(word, size, color):
    """(data URI, width pt, height pt, drop below the baseline pt) for one word, or None if it cannot be drawn."""
    key = (word, round(size, 1), color)
    if key in _cache_img:
        return _cache_img[key]
    try:
        f = _file_for(word[0]) or _file_for(next(ch for ch in word if _file_for(ch)))
        font, tt, gs, order, upem, asc, desc = _font(f)
        buf = hb.Buffer(); buf.add_str(word); buf.guess_segment_properties(); hb.shape(font, buf, {})
        pen, x = _Pen(gs), 0
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            pen.dx, pen.dy = x + pos.x_offset, pos.y_offset
            gs[order[info.codepoint]].draw(pen)
            x += pos.x_advance
        w_units = max(x, 1); h_units = asc - desc
        s = size / upem
        w_pt, h_pt = w_units * s, h_units * s
        dpi = 300
        fig = Figure(figsize=(w_pt / 72, h_pt / 72), dpi=dpi); FigureCanvasAgg(fig)
        ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, w_units); ax.set_ylim(desc, asc); ax.axis('off')
        if pen.v:
            ax.add_patch(PathPatch(Path(pen.v, pen.c), facecolor=color, edgecolor='none', lw=0))
        os.makedirs(_TMP, exist_ok=True)
        path = os.path.join(_TMP, hashlib.md5(repr(key).encode('utf8')).hexdigest() + '.png')
        fig.savefig(path, format='png', transparent=True, dpi=dpi)
        res = (path.replace(chr(92), '/'), w_pt, h_pt, -desc * s)
    except Exception:
        res = None
    _cache_img[key] = res
    return res


def wrap(text, style=None):
    """Replaces every Indian-script word of `text` (reportlab paragraph markup) with a small picture of the shaped word."""
    if not OK or not isinstance(text, str) or not _WORD.search(text):
        return text
    size = float(getattr(style, 'fontSize', 10) or 10)
    try:
        color = style.textColor.hexval().replace('0x', '#')
    except Exception:
        color = '#000000'
    out = []
    for m in re.finditer(r'<[^>]*>|[^<]+', text):          # leave the markup tags alone
        part = m.group(0)
        if part.startswith('<'):
            out.append(part); continue
        def one(mm):
            p = _picture(mm.group(0), size, color)
            return f'<img src="{p[0]}" width="{p[1]:.2f}" height="{p[2]:.2f}" valign="{-p[3]:.2f}"/>' if p else mm.group(0)
        out.append(_WORD.sub(one, part))
    return ''.join(out)


class Paragraph(_Paragraph):
    def __init__(self, text, style=None, *a, **k):
        super().__init__(wrap(text, style), style, *a, **k)

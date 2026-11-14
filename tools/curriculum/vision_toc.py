"""Reads a printed table of contents from page pictures (for PDFs whose contents page has no usable text: Hindi / Marathi books, scans).

Claude looks at the last pages of the front matter of the book and copies the chapter titles exactly as printed, in order.
Used for NCERT Hindi books and for the Balbharati textbooks of classes 1-4. The picture check is weaker than the text check in ncert.py,
so these lists are marked `read_from: "page image"` in the data.
"""
import base64, json, re

import pymupdf


def candidate_pages(doc, tail=9):
    """The contents list sits at the end of the front matter: look at the last pages of a prelims PDF (or the first pages of a full book)."""
    n = len(doc)
    return list(range(max(2, n - tail), n)) if n <= 40 else list(range(2, 12))


def page_images(path, pages, dpi=70):
    doc = pymupdf.open(path)
    pages = pages or candidate_pages(doc)
    imgs = []
    for i in pages:
        if i >= len(doc): continue
        pix = doc[i].get_pixmap(dpi=dpi)
        imgs.append((i, base64.standard_b64encode(pix.tobytes('jpeg', jpg_quality=70)).decode()))
    return imgs


def ask(client, imgs, book, language_hint, model='claude-sonnet-5-5'):
    content = []
    for i, b64 in imgs:
        content.append({'type': 'text', 'text': f'Page {i}:'})
        content.append({'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': b64}})
    content.append({'type': 'text', 'text': (
        f'These are front pages of the school textbook "{book}" ({language_hint}). Find the TABLE OF CONTENTS page(s) '
        '(headings such as Contents, अनुक्रम, अनुक्रमणिका, विषय सूची, ਵਿਸ਼ਾ ਸੂਚੀ) and copy the chapter / lesson titles EXACTLY as printed, in the same script, in order. '
        'Only main entries (lessons, chapters, poems, stories). Not sub-sections, not the foreword, preface, about the book, page numbers or exercise lists. '
        'If the pages shown do not contain the contents list, return {"found": false, "chapters": []}. Never guess or add a title that is not printed. '
        'Return JSON only: {"found": true, "chapters": ["title", ...]}')})
    msg = client.messages.create(model=model, max_tokens=3500, messages=[{'role': 'user', 'content': content}])
    raw = ''.join(b.text for b in msg.content if getattr(b, 'type', '') == 'text')
    m = re.search(r'\{.*\}', raw, re.S)
    j = json.loads(m.group(0)) if m else {'found': False, 'chapters': []}
    return [re.sub(r'\s+', ' ', c).strip() for c in j.get('chapters', []) if isinstance(c, str) and c.strip()] if j.get('found') else []

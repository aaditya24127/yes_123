"""Pictures for the visit report: 3D bar chart, 3D pie, flat comparison bars and a chalkboard plan. Drawn with matplotlib (no AI, no downloads).
Every function returns PNG bytes, or None when there is nothing to draw."""
import functools, io, textwrap, threading

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.transforms as mt
import numpy as np
from matplotlib.patches import FancyBboxPatch, Patch, Rectangle, Wedge

BRAND, TEAL, LEAF, SAND, AMBER, CORAL, INK, MUTED, BEFORE = '#235347', '#2f8f7a', '#7fb685', '#efe9da', '#e3a73b', '#d8674f', '#1f2a27', '#6b7a74', '#b4c6bd'


_lock = threading.Lock()                       # matplotlib's drawing is not safe to run from two requests at once


def _safe(fn):
    @functools.wraps(fn)
    def run(*a, **k):
        with _lock: return fn(*a, **k)
    return run


def _png(fig, dpi=150) -> bytes:
    buf = io.BytesIO(); fig.savefig(buf, format='png', dpi=dpi, bbox_inches='tight', facecolor='white', pad_inches=0.12); plt.close(fig)
    return buf.getvalue()


def _trim(png, pad=14):
    """Cut the empty white border off a picture (3D axes leave a lot of it)."""
    from PIL import Image as _I
    im = _I.open(io.BytesIO(png)).convert('RGB'); a = np.asarray(im).astype(int)
    ys, xs = np.where((a < 248).any(axis=2))
    if not len(xs): return png
    box = (max(0, xs.min() - pad), max(0, ys.min() - pad), min(im.width, xs.max() + pad), min(im.height, ys.max() + pad))
    out = io.BytesIO(); im.crop(box).save(out, format='PNG'); return out.getvalue()


def _shade(hex_color, k):
    c = np.array(matplotlib.colors.to_rgb(hex_color)); return tuple(np.clip(c * k, 0, 1))


@_safe
def bars3d(labels, now, before=None, top=5, title=None):
    """Grouped 3D bars, side by side: last visit (grey-green) and this visit (green). Heights are scores out of `top`."""
    if not labels: return None
    fig = plt.figure(figsize=(9.2, 4.4)); ax = fig.add_subplot(111, projection='3d'); fig.subplots_adjust(left=0, right=1, bottom=0, top=1)
    n = len(labels); x = np.arange(n, dtype=float)
    series = ([('Last visit', before, BEFORE, -0.2 if before else 0)] if before else []) + [('This visit', now, BRAND, 0.2 if before else 0)]
    for name, vals, col, off in series:
        v = np.array([0 if q is None else q for q in vals], dtype=float)
        ax.bar3d(x + off - 0.16, np.zeros(n), np.zeros(n), 0.32, 0.5, v, color=col, shade=True, edgecolor=_shade(col, 0.7), linewidth=0.4)
        for xi, q in zip(x, vals):
            if q is not None: ax.text(xi + off, 0.25, q + 0.15, f'{q:g}', ha='center', va='bottom', fontsize=9, color=INK, fontweight='bold', zorder=10, bbox=dict(boxstyle='round,pad=0.15', fc='white', ec='none', alpha=0.85))
    ax.set_xticks(x); ax.set_xticklabels([str(i + 1) for i in range(n)], fontsize=10, color=INK, fontweight='bold')
    ax.set_yticks([]); ax.set_zlim(0, top + 0.4); ax.set_zticks(range(0, top + 1)); ax.tick_params(axis='z', labelsize=8.5, colors=MUTED); ax.set_ylim(0, 0.55)
    for pane in (ax.xaxis, ax.yaxis, ax.zaxis): pane.pane.set_facecolor((0.96, 0.95, 0.91, 0.65)); pane.pane.set_edgecolor('#d9d3c0')
    ax.grid(True, color='#d9d3c0', linewidth=0.5); ax.view_init(elev=24, azim=-88); ax.set_box_aspect((3.6, 0.8, 1.5), zoom=1.22)
    ax.legend(handles=[Patch(color=c, label=nm) for nm, _, c, _ in series], loc='upper left', fontsize=10, frameon=False)
    if title: ax.set_title(title, fontsize=11, color=BRAND, pad=0, fontweight='bold')
    return _png(fig)


@_safe
def pie3d(values, labels, colors, center=None, size=(6.4, 4.3)):
    """A thick 3D pie (flat top and a visible edge). Zero slices are left out. `center` is not used (a pie has no hole)."""
    items = [(v, l, c) for v, l, c in zip(values, labels, colors) if v and v > 0]
    if not items: return None
    tot = sum(v for v, _, _ in items); squash, depth = 0.52, 0.2
    fig, ax = plt.subplots(figsize=size); ax.set_aspect('equal'); ax.axis('off'); ax.set_xlim(-1.25, 1.25); ax.set_ylim(-0.95, 0.72)
    ang, wedges = 90.0, []
    for v, l, c in items:
        th = 360.0 * v / tot; wedges.append((ang - th, ang, c, v)); ang -= th
    tr = mt.Affine2D().scale(1, squash) + ax.transData
    layers = 14
    for k in range(layers, 0, -1):                                   # the side wall: the same pie, pushed down a little at a time
        for a1, a2, c, _ in wedges:
            w = Wedge((0, -depth * k / layers), 1, a1, a2, fc=_shade(c, 0.66), ec=_shade(c, 0.66), lw=0.2); w.set_transform(tr); ax.add_patch(w)
    for a1, a2, c, v in wedges:                                      # the top
        w = Wedge((0, 0), 1, a1, a2, fc=c, ec='white', lw=2.2); w.set_transform(tr); ax.add_patch(w)
        mid = np.deg2rad((a1 + a2) / 2); r = 0.62 if len(wedges) > 1 else 0
        ax.text(r * np.cos(mid), r * np.sin(mid) * squash, f'{v:g}', ha='center', va='center', fontsize=15, fontweight='bold', color='white')
    ax.legend(handles=[Patch(color=c, label=f'{l}  ({v:g})') for v, l, c in items], loc='lower center', ncol=min(3, len(items)), fontsize=9.5, frameon=False, bbox_to_anchor=(0.5, -0.08))
    return _png(fig)


@_safe
def compare_bars(labels, before, now, unit='', lower_is_better=False):
    """Flat horizontal bars: last time and now side by side, with the numbers written on them."""
    if not labels: return None
    n = len(labels); fig, ax = plt.subplots(figsize=(8.2, 0.9 + 0.78 * n)); y = np.arange(n)[::-1]
    hb = ax.barh(y + 0.19, [0 if b is None else b for b in before], height=0.34, color=BEFORE, label='Last time') if any(b is not None for b in before) else None
    ax.barh(y - 0.19, [0 if v is None else v for v in now], height=0.34, color=BRAND, label='Now')
    mx = max([v for v in list(before) + list(now) if v is not None] + [1]) * 1.18
    for yi, b, v in zip(y, before, now):
        if b is not None: ax.text(b + mx * 0.012, yi + 0.19, f'{b:g}{unit}', va='center', fontsize=9, color=MUTED)
        if v is not None: ax.text(v + mx * 0.012, yi - 0.19, f'{v:g}{unit}', va='center', fontsize=9.5, color=BRAND, fontweight='bold')
    ax.set_yticks(y); ax.set_yticklabels(['\n'.join(textwrap.wrap(l, 26)) for l in labels], fontsize=9, color=INK); ax.set_xlim(0, mx)
    for sp in ('top', 'right', 'bottom'): ax.spines[sp].set_visible(False)
    ax.spines['left'].set_color('#d9d3c0'); ax.set_xticks([]); ax.legend(loc='lower right', fontsize=9, frameon=False, ncol=2)
    return _png(fig)


@_safe
def chalkboard(topic, columns):
    """A picture of a blackboard split in three: what to write where. `columns` = [(heading, [lines]), ...]."""
    fig, ax = plt.subplots(figsize=(8.6, 5.0)); ax.set_xlim(0, 100); ax.set_ylim(0, 60); ax.axis('off')
    ax.add_patch(FancyBboxPatch((1, 6), 98, 52, boxstyle='round,pad=0,rounding_size=1.2', fc='#8a5a33', ec='#5e3b1f', lw=2))          # wooden frame
    ax.add_patch(Rectangle((3.2, 8.2), 93.6, 47.6, fc='#1f3a33', ec='#14271f', lw=1.5))                                                  # board
    ax.add_patch(Rectangle((3.2, 8.2), 93.6, 47.6, fc='none', ec='#2c5247', lw=0.5))
    for i in range(1, 12): ax.plot([4 + i * 7.5, 4 + i * 7.5 + 12], [10, 52], color='white', alpha=0.012, lw=9)                          # chalk dust
    ax.add_patch(Rectangle((1, 3.6), 98, 2.4, fc='#6e4524', ec='#4b2d15', lw=1))                                                          # chalk tray
    ax.add_patch(Rectangle((12, 6), 9, 1.8, fc='#f5f1e6', ec='#d8d2c0', lw=0.6)); ax.add_patch(Rectangle((24, 6), 6, 1.3, fc='#f5d76e', ec='#d8b94c', lw=0.6))   # chalk pieces
    ax.add_patch(Rectangle((78, 6), 14, 2.6, fc='#c9a76b', ec='#8f7544', lw=0.8)); ax.add_patch(Rectangle((78, 8.6), 14, 1.2, fc='#3d3d3d', ec='#222', lw=0.6))   # duster
    ax.text(50, 51.5, f"Today: {topic}", ha='center', va='center', fontsize=15, color='#f5f1e6', fontweight='bold', family='DejaVu Sans')
    ax.plot([8, 92], [47.6, 47.6], color='#f5f1e6', lw=1.4, alpha=0.9)
    w = 93.6 / len(columns)
    for i, (head, lines) in enumerate(columns):
        x0 = 3.2 + i * w
        if i: ax.plot([x0, x0], [10, 46], color='#f5f1e6', lw=1.1, alpha=0.6, ls=(0, (6, 4)))
        ax.text(x0 + w / 2, 43.4, head, ha='center', va='center', fontsize=11.5, color='#f5d76e', fontweight='bold')
        yy = 38.2
        for ln in lines:
            for part in textwrap.wrap(ln, 24) or ['']:
                ax.text(x0 + 2.6, yy, part, ha='left', va='center', fontsize=9.6, color='#f5f1e6'); yy -= 3.6
            yy -= 1.6
    return _png(fig, 150)


@_safe
def score_ring(value, top=5, label='out of 5'):
    """The big number on the first page: a ring that fills up to the score."""
    if value is None: return None
    fig, ax = plt.subplots(figsize=(3.0, 3.0)); ax.set_aspect('equal'); ax.axis('off')
    col = BRAND if value >= 4 else AMBER if value >= 3 else CORAL
    ax.add_patch(Wedge((0, 0), 1, 0, 360, width=0.22, fc='#e5e0d0', ec='none'))
    ax.add_patch(Wedge((0, 0), 1, 90 - 360 * value / top, 90, width=0.22, fc=col, ec='none'))
    ax.text(0, 0.07, f'{value:.1f}', ha='center', va='center', fontsize=34, fontweight='bold', color=INK)
    ax.text(0, -0.33, label, ha='center', va='center', fontsize=10.5, color=MUTED); ax.set_xlim(-1.1, 1.1); ax.set_ylim(-1.1, 1.1)
    return _png(fig, 150)


# ---------------------------------------------------------------------------------------------- pictures for the teacher assessment report
@_safe
def radar(labels, values, top=100, size=(4.6, 4.2)):
    """A flat radar chart: one spoke per label, filled up to the value (0 to `top`)."""
    if len(labels) < 3: return None
    n = len(labels); ang = np.linspace(0, 2 * np.pi, n, endpoint=False)
    fig = plt.figure(figsize=size); ax = fig.add_subplot(111, polar=True)
    v = [max(0, min(top, x)) for x in values]
    ax.plot(np.r_[ang, ang[:1]], np.r_[v, v[:1]], color=BRAND, lw=2.2); ax.fill(np.r_[ang, ang[:1]], np.r_[v, v[:1]], color=TEAL, alpha=0.28)
    ax.scatter(ang, v, s=36, color=BRAND, zorder=5)
    ax.set_xticks(ang); ax.set_xticklabels(['\n'.join(textwrap.wrap(l, 13)) for l in labels], fontsize=9.5, color=INK)
    ax.set_ylim(0, top); ax.set_yticks([25, 50, 75, 100]); ax.set_yticklabels(['25', '50', '75', '100'], fontsize=7.5, color=MUTED)
    ax.grid(color='#d9d3c0', lw=0.8); ax.spines['polar'].set_color('#d9d3c0'); ax.set_facecolor('#fbfaf5')
    for a_, x in zip(ang, v): ax.text(a_, min(top, x) + 9, f'{x:g}', ha='center', va='center', fontsize=8.5, color=BRAND, fontweight='bold')
    return _png(fig, 150)


@_safe
def bars_flat(labels, values, kinds, top=100):
    """Flat horizontal bars, one per question: knowledge in teal, teaching in amber, the score written at the end of each bar."""
    if not labels: return None
    n = len(labels); fig, ax = plt.subplots(figsize=(4.9, 0.9 + 0.42 * n)); y = np.arange(n)[::-1]
    cols = [TEAL if k == 'knowledge' else AMBER for k in kinds]
    ax.barh(y, [top] * n, color='#efe9da', height=0.62, zorder=0); ax.barh(y, values, color=cols, height=0.62, edgecolor='none')
    for yi, v in zip(y, values):
        inside = v >= top - 12
        ax.text(v - 3 if inside else v + 2, yi, f'{v:g}', va='center', ha='right' if inside else 'left', fontsize=9.5, fontweight='bold', color='white' if inside else INK)
    ax.set_yticks(y); ax.set_yticklabels(labels, fontsize=9.5, color=INK); ax.set_xlim(0, top); ax.set_xticks([0, 25, 50, 75, 100]); ax.tick_params(axis='x', labelsize=8, colors=MUTED)
    for sp in ('top', 'right', 'left'): ax.spines[sp].set_visible(False)
    ax.spines['bottom'].set_color('#d9d3c0')
    ax.legend(handles=[Patch(color=TEAL, label='Topic knowledge'), Patch(color=AMBER, label='Teaching method')], loc='lower right', fontsize=8.5, frameon=False, bbox_to_anchor=(1, 1.0), ncol=2)
    return _png(fig, 150)


@_safe
def summary3d(items, top=100):
    """A 3D bar chart of the headline scores (summary picture only): items = [(label, value, colour)]."""
    items = [(l, v, c) for l, v, c in items if v is not None]
    if not items: return None
    from mpl_toolkits.mplot3d import proj3d
    fig = plt.figure(figsize=(8.0, 3.5)); ax = fig.add_subplot(111, projection='3d'); fig.subplots_adjust(left=0, right=1, bottom=0, top=1)
    n = len(items); x = np.arange(n, dtype=float)
    for xi, (l, v, c) in zip(x, items):
        ax.bar3d(xi - 0.3, 0, 0, 0.6, 0.6, v, color=c, shade=True, edgecolor=_shade(c, 0.7), linewidth=0.4)
    ax.set_xticks(x); ax.set_xticklabels(['\n'.join(textwrap.wrap(l, 12)) for l, _, _ in items], fontsize=9.5, color=INK, fontweight='bold'); ax.set_yticks([]); ax.set_zlim(0, top + 8); ax.set_zticks([0, 25, 50, 75, 100])
    ax.tick_params(axis='z', labelsize=8.5, colors=MUTED); ax.set_ylim(0, 0.6)
    for pane in (ax.xaxis, ax.yaxis, ax.zaxis): pane.pane.set_facecolor((0.96, 0.95, 0.91, 0.65)); pane.pane.set_edgecolor('#d9d3c0')
    ax.grid(True, color='#d9d3c0', linewidth=0.5); ax.view_init(elev=20, azim=-88); ax.set_box_aspect((2.8, 0.6, 1.0), zoom=1.05)
    fig.canvas.draw(); proj = ax.get_proj()                      # the numbers are drawn flat on top, so a bar can never hide them
    for xi, (l, v, c) in zip(x, items):
        px, py, _ = proj3d.proj_transform(xi, 0.3, v, proj)
        ax.annotate(f'{v:g}', (px, py), xytext=(0, 9), textcoords='offset points', ha='center', va='bottom', fontsize=13, fontweight='bold', color=INK,
                    bbox=dict(boxstyle='round,pad=0.18', fc='white', ec='none', alpha=0.9), zorder=20)
    return _trim(_png(fig, 150))


@_safe
def logo(size=2.0):
    """The app's mark: a rounded Evergreen square with a white C."""
    fig, ax = plt.subplots(figsize=(size, size)); ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis('off')
    g = np.linspace(0, 1, 256)[:, None] * np.ones((1, 256))
    im = ax.imshow(g, extent=(4, 96, 4, 96), cmap=matplotlib.colors.LinearSegmentedColormap.from_list('g', ['#2f6a5a', '#163832']), origin='upper', zorder=1)
    clip = FancyBboxPatch((4, 4), 92, 92, boxstyle='round,pad=0,rounding_size=22', transform=ax.transData, fc='none', ec='none'); ax.add_patch(clip); im.set_clip_path(clip)
    ax.text(50, 47, 'C', ha='center', va='center', fontsize=size * 30, color='white', fontweight='bold', family='DejaVu Serif', zorder=3)
    buf = io.BytesIO(); fig.savefig(buf, format='png', dpi=200, transparent=True, bbox_inches='tight', pad_inches=0.02); plt.close(fig)
    return buf.getvalue()


@_safe
def orb(size=2.2, dark='#0b2b26', mid='#3a7260', light='#bcdcc4'):
    """The glowing circle (idle state) in the app's colours, for the report cover."""
    n = 360; yy, xx = np.mgrid[1.35:-1.35:complex(n), -1.35:1.35:complex(n)]; r = np.sqrt(xx ** 2 + yy ** 2)     # y runs up the picture
    c_dark, c_mid, c_light = (np.array(matplotlib.colors.to_rgb(h)) for h in (dark, mid, light))
    img = np.ones((n, n, 4)); img[..., 3] = 0
    glow = np.clip(1 - (r - 1.0) / 0.35, 0, 1) ** 2.2 * (r > 1.0)
    for k in range(3): img[..., k] = np.where(r > 1.0, c_mid[k], img[..., k])
    img[..., 3] = np.where(r > 1.0, glow * 0.55, img[..., 3])
    inside = r <= 1.0
    wave = -0.35 + 0.12 * np.sin(xx * 3.2) + 0.05 * np.sin(xx * 6.1 + 1.0)
    liquid = (yy < wave) & inside; t = np.clip((wave - yy) / 1.0, 0, 1)
    for k in range(3):
        body = c_dark[k] + (c_mid[k] - c_dark[k]) * np.clip(1 - r, 0, 1) * 0.55
        flow = c_mid[k] + (c_light[k] - c_mid[k]) * (1 - t) ** 3
        img[..., k] = np.where(inside, np.where(liquid, flow, body), img[..., k])
    rim = np.exp(-((r - 0.985) / 0.03) ** 2) * inside
    img[..., :3] = np.clip(img[..., :3] + rim[..., None] * 0.25, 0, 1)
    img[..., 3] = np.where(inside, 1.0, img[..., 3])
    fig = plt.figure(figsize=(size, size)); ax = fig.add_axes([0, 0, 1, 1]); ax.imshow(img, interpolation='bilinear'); ax.axis('off')
    buf = io.BytesIO(); fig.savefig(buf, format='png', dpi=150, transparent=True); plt.close(fig)
    return buf.getvalue()

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


def _png(fig, dpi=200) -> bytes:
    buf = io.BytesIO(); fig.savefig(buf, format='png', dpi=dpi, bbox_inches='tight', facecolor='white', pad_inches=0.12); plt.close(fig)
    return buf.getvalue()


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
    layers = 28
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
    return _png(fig, 190)


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
    return _png(fig, 200)

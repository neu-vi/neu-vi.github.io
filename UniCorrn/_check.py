import json, os, sys, math
from pathlib import Path

ROOT = Path('assets/examples')

def shape(v):
    if isinstance(v, list):
        if v and isinstance(v[0], list):
            return f"[{len(v)}x{len(v[0])}]"
        return f"[{len(v)}]"
    return type(v).__name__

def first(v, n=1):
    if isinstance(v, list) and v:
        return v[0]
    return v

def load(p):
    return json.load(open(p, 'r', encoding='utf-8'))

def bbox(pts):
    pts = list(pts)
    if not pts: return None
    mn = [min(p[i] for p in pts) for i in range(len(pts[0]))]
    mx = [max(p[i] for p in pts) for i in range(len(pts[0]))]
    return mn, mx

def fmt_bbox(b):
    if b is None: return 'empty'
    mn, mx = b
    return ' '.join(f"{ax}[{mn[i]:+.3f}..{mx[i]:+.3f}]" for i, ax in enumerate('xyz'[:len(mn)]))

def avg_nn(query, ref, k=5):
    q = list(query)[:k]
    if not q: return 0.0
    total = 0.0
    for qp in q:
        best = float('inf')
        for rp in ref:
            d2 = sum((rp[i]-qp[i])**2 for i in range(len(qp)))
            if d2 < best: best = d2
        total += math.sqrt(best)
    return total / len(q)

print('=== INTEGRITY CHECK ===')
for p in sorted(ROOT.rglob('*.json')):
    print(f'\n--- {p.as_posix()} ---')
    try:
        d = load(p)
    except Exception as e:
        print(f'  PARSE ERROR: {e}')
        continue
    for k, v in d.items():
        s = shape(v)
        f = first(v)
        if isinstance(f, list):
            f_str = '[' + ','.join(f"{x:.4g}" if isinstance(x,float) else str(x) for x in f) + ']'
        else:
            f_str = repr(f)
        print(f'  {k:18s} {s:14s} first={f_str}')

    # length consistency for paired arrays
    pairs = [
        ('kpts1', 'kpts2'),
        ('kpts1', 'kpts_cmap'),
        ('kpts1', 'line_cmap'),
        ('pcd', 'cmap'),
        ('pcd', 'cmap_redblue'),
        ('pcd', 'cmap_blues_r'),
        ('pcd1', 'cmap1'),
        ('pcd1', 'cmap1_redblue'),
        ('pcd2', 'cmap2'),
        ('pcd2', 'cmap2_redblue'),
    ]
    for a, b in pairs:
        if a in d and b in d:
            la, lb = len(d[a]), len(d[b])
            mark = 'OK ' if la == lb else 'MISMATCH'
            print(f'  [{mark}] len({a})={la}, len({b})={lb}')

print('\n=== KPT-vs-PCD ALIGNMENT (avg nearest-neighbor distance over 5 samples) ===')

# 2D-3D
corr = load(ROOT / '2d3d/corr_0.json')
pcd = load(ROOT / '2d3d/pcd/pcd_0.json')
kpts = load(ROOT / '2d3d/kpts/kpts_0.json')
print('\n[2d3d]')
print(f'  pcd     bbox: {fmt_bbox(bbox(pcd["pcd"]))}')
print(f'  kpts2   bbox: {fmt_bbox(bbox(kpts["kpts2"]))}')
print(f'  avg kpts2 -> pcd nearest: {avg_nn(kpts["kpts2"], pcd["pcd"], 5):.4f}')

# 3D-3D
corr = load(ROOT / '3d3d/corr_0.json')
pcd = load(ROOT / '3d3d/pcd/pcd_0.json')
kpts = load(ROOT / '3d3d/kpts/kpts_0.json')
print('\n[3d3d]')
print(f'  pcd1    bbox: {fmt_bbox(bbox(pcd["pcd1"]))}')
print(f'  pcd2    bbox: {fmt_bbox(bbox(pcd["pcd2"]))}')
print(f'  kpts1   bbox: {fmt_bbox(bbox(kpts["kpts1"]))}')
print(f'  kpts2   bbox: {fmt_bbox(bbox(kpts["kpts2"]))}')
print(f'  avg kpts1 -> pcd1 nearest: {avg_nn(kpts["kpts1"], pcd["pcd1"], 5):.4f}')
print(f'  avg kpts1 -> pcd2 nearest: {avg_nn(kpts["kpts1"], pcd["pcd2"], 5):.4f}')
print(f'  avg kpts2 -> pcd1 nearest: {avg_nn(kpts["kpts2"], pcd["pcd1"], 5):.4f}')
print(f'  avg kpts2 -> pcd2 nearest: {avg_nn(kpts["kpts2"], pcd["pcd2"], 5):.4f}')

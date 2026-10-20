#!/usr/bin/env python3
"""Slice a 4x4 painted icon sheet (black gutters) into public/art/<folder>/<id>.webp (256 px).
Usage: python3 scripts/slice_sheet.py art/raw/A2_skills_2.webp skills ID1 ID2 ... ID16"""
import sys, os
import numpy as np
from PIL import Image
src, folder, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
im = Image.open(src).convert('RGB'); a = np.asarray(im).astype(float).mean(axis=2)
def spans(prof, size):
    out, s = [], None
    for i, v in enumerate(prof):
        if v >= 25 and s is None: s = i
        if v < 25 and s is not None: out.append((s, i)); s = None
    if s is not None: out.append((s, len(prof)))
    return [sp for sp in out if sp[1] - sp[0] > size * 0.1]
cols, rows = spans(a.mean(axis=0), im.width), spans(a.mean(axis=1), im.height)
assert len(cols) * len(rows) == len(ids), (cols, rows, len(ids))
os.makedirs(f'public/art/{folder}', exist_ok=True)
k = 0
for r0, r1 in rows:
    for c0, c1 in cols:
        im.crop((c0 + 3, r0 + 3, c1 - 3, r1 - 3)).resize((256, 256), Image.LANCZOS).save(f'public/art/{folder}/{ids[k]}.webp', quality=86)
        k += 1
print('sliced', k, 'tiles ->', f'public/art/{folder}/')

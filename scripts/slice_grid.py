#!/usr/bin/env python3
"""Slice a C x R painted cut-out sheet (any grid, per-cell background colour) into public/art/<folder>/<id>.webp (256 px).
Usage: python3 scripts/slice_grid.py art/raw/SHEET.webp <folder> <cols>x<rows> ID1 ID2 ... (row by row; '-' skips a cell)
Each cell's background is estimated from its border pixels (sheets from some generators use slightly different
magenta per cell), keyed out by colour distance, soft shadows of that hue become a neutral soft shadow, and slivers
of neighbouring objects touching the cell edge are dropped."""
import sys, os
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

src, folder, grid, ids = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
C, R = (int(v) for v in grid.lower().split('x'))
assert len(ids) == C * R, (len(ids), C * R)
os.makedirs(f'public/art/{folder}', exist_ok=True)
im = Image.open(src).convert('RGB'); W, H = im.size
done = 0
for k, name in enumerate(ids):
    if name == '-': continue
    col, row = k % C, k // C
    box = (col * W // C, row * H // R, (col + 1) * W // C, (row + 1) * H // R)
    a = np.asarray(im.crop(box)).astype(np.float32)
    h, w = a.shape[:2]
    border = np.concatenate([a[:3].reshape(-1, 3), a[-3:].reshape(-1, 3), a[:, :3].reshape(-1, 3), a[:, -3:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    d = np.sqrt(((a - bg) ** 2).sum(axis=2))
    alpha = np.clip((d - 38) / 50, 0, 1)
    # shadow: same hue as the background, only darker -> soft neutral shadow
    lb, la = bg.sum() + 1, a.sum(axis=2) + 1
    ratio = a / la[..., None] - bg / lb
    same_hue = np.sqrt((ratio ** 2).sum(axis=2)) < 0.06
    darker = la < lb * 0.97
    shade = same_hue & darker & (alpha > 0)
    alpha = np.where(shade, np.minimum(alpha, (1 - la / lb) * 1.6 * 0.55), alpha)
    rgb = a.copy(); rgb[shade] = 18
    # de-spill toward the background colour on soft edges
    m = (1 - alpha)[..., None]
    rgb = np.where(shade[..., None], rgb, np.clip((rgb - bg * m * 0.6) / np.maximum(1 - m * 0.6, 0.2), 0, 255))
    cell = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')
    al = cell.getchannel('A').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6)); cell.putalpha(al)
    mask = cell.getchannel('A').point(lambda v: 255 if v > 40 else 0)
    total = int(np.count_nonzero(np.asarray(mask)))
    seeds = [(x, y) for x in range(0, w, 2) for y in (0, h - 1)] + [(x, y) for y in range(0, h, 2) for x in (0, w - 1)]
    for sd in seeds:
        if mask.getpixel(sd) != 255: continue
        m2 = mask.copy(); ImageDraw.floodfill(m2, sd, 128)
        part = int(np.count_nonzero(np.asarray(m2) == 128))
        sel = m2.point(lambda v: 255 if v == 128 else 0)
        if part < 0.25 * total:
            al = cell.getchannel('A'); al.paste(0, mask=sel); cell.putalpha(al)
            mask = m2.point(lambda v: 0 if v == 128 else v)
        else:
            mask = m2.point(lambda v: 255 if v == 128 else v)
    bb = cell.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox() or (0, 0, w, h)
    obj = cell.crop(bb); s = max(obj.width, obj.height) / 0.88
    canvas = Image.new('RGBA', (int(s), int(s)), (0, 0, 0, 0)); canvas.paste(obj, ((int(s) - obj.width) // 2, (int(s) - obj.height) // 2))
    canvas.resize((256, 256), Image.LANCZOS).save(f'public/art/{folder}/{name}.webp', quality=90); done += 1
print('sliced', done, 'tiles ->', f'public/art/{folder}/')

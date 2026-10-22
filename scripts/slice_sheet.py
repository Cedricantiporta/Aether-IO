#!/usr/bin/env python3
"""Slice a 4x4 painted sheet into public/art/<folder>/<id>.webp (256 px).
Usage: python3 scripts/slice_sheet.py [--cutout] art/raw/SHEET.png <folder> ID1 ... ID16
  default : cells separated by black gutters (skills / cards)
  --cutout: flat magenta (#FF00FF) background, equal 4x4 cells; magenta is keyed out to transparency (items / pets)"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
args = sys.argv[1:]
cut = args[0] == '--cutout'
if cut: args = args[1:]
src, folder, ids = args[0], args[1], args[2:]
os.makedirs(f'public/art/{folder}', exist_ok=True)
im = Image.open(src).convert('RGB')
if cut:
    n = int(round(len(ids) ** 0.5)); W, H = im.size
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # magenta-ness: high R and B, low G
    # distance from pure magenta: only near-#FF00FF pixels become transparent (purple / pink objects survive)
    dist = np.sqrt((255 - r) ** 2 + g ** 2 + (255 - b) ** 2)
    alpha = np.clip((dist - 45) / 55, 0, 1) * 255
    m = 1 - alpha / 255
    # de-spill: pull magenta fringe toward neutral
    spill = (m * np.clip((np.minimum(r, b) - g) / 255, 0, 1))[..., None]
    a2 = a.copy(); a2[..., 0] -= spill[..., 0] * (r - g) * 0.8; a2[..., 2] -= spill[..., 0] * (b - g) * 0.8
    # magenta-tinted contact shadows (dark magenta: r ~ b >> g) -> soft neutral dark shadow instead of a purple smear
    shade = (np.abs(r - b) < 45) & (np.minimum(r, b) - g > 70) & (alpha > 0)
    lum = np.minimum(r, b) / 255
    alpha = np.where(shade, np.minimum(alpha, (1 - lum) * 150 + 10), alpha)
    a2[shade] = a2[shade] * 0 + 18
    rgba = Image.fromarray(np.dstack([np.clip(a2, 0, 255), alpha]).astype(np.uint8), 'RGBA')
    rgba.putalpha(rgba.getchannel('A').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6)))
    k = 0
    for row in range(n):
        for col in range(n):
            cell = rgba.crop((col * W // n, row * H // n, (col + 1) * W // n, (row + 1) * H // n))
            # drop slivers of the neighbouring cell's object that poke in from the cell edge
            mask = cell.getchannel('A').point(lambda v: 255 if v > 24 else 0)
            total = sum(1 for v in mask.getdata() if v)
            seeds = [(x, y) for x in range(0, mask.width, 2) for y in (0, mask.height - 1)] + [(x, y) for y in range(0, mask.height, 2) for x in (0, mask.width - 1)]
            for sd in seeds:
                if mask.getpixel(sd) != 255: continue
                m2 = mask.copy(); ImageDraw.floodfill(m2, sd, 128)
                part = sum(1 for v in m2.getdata() if v == 128)
                if part < 0.25 * total:
                    mask = m2.point(lambda v: 0 if v == 128 else v)
                    al = cell.getchannel('A'); al.paste(0, mask=m2.point(lambda v: 255 if v == 128 else 0)); cell.putalpha(al)
                else: mask = m2.point(lambda v: 255 if v == 128 else v)
            bb = cell.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox() or (0, 0, cell.width, cell.height)
            obj = cell.crop(bb); s = max(obj.width, obj.height) / 0.88
            canvas = Image.new('RGBA', (int(s), int(s)), (0, 0, 0, 0)); canvas.paste(obj, ((int(s) - obj.width) // 2, (int(s) - obj.height) // 2))
            canvas.resize((256, 256), Image.LANCZOS).save(f'public/art/{folder}/{ids[k]}.webp', quality=90); k += 1
    print('sliced (cutout)', k, 'tiles ->', f'public/art/{folder}/'); sys.exit()
a = np.asarray(im).astype(float).mean(axis=2)
def spans(prof, size):
    out, s = [], None
    for i, v in enumerate(prof):
        if v >= 25 and s is None: s = i
        if v < 25 and s is not None: out.append((s, i)); s = None
    if s is not None: out.append((s, len(prof)))
    return [sp for sp in out if sp[1] - sp[0] > size * 0.1]
cols, rows = spans(a.mean(axis=0), im.width), spans(a.mean(axis=1), im.height)
assert len(cols) * len(rows) == len(ids), (cols, rows, len(ids))
k = 0
for r0, r1 in rows:
    for c0, c1 in cols:
        im.crop((c0 + 3, r0 + 3, c1 - 3, r1 - 3)).resize((256, 256), Image.LANCZOS).save(f'public/art/{folder}/{ids[k]}.webp', quality=86)
        k += 1
print('sliced', k, 'tiles ->', f'public/art/{folder}/')

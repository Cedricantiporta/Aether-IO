"""Bakes public/art/ground/flagstone.webp: a SEAMLESS tileable (torus Voronoi) pale cream-peach flagstone paving, ~1.2 m stones when one tile = 9.6 m (owner mock tiles_mock.png).
Each stone is puffy / rounded: soft highlight top-left, soft shade bottom-right, thin warm darker grout. Run: python3 art/bake_flagstone.py"""
import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import gaussian_filter
N, G = 1024, 8
rng = np.random.default_rng(11)
cs = N / G
pts = np.array([[(gx + 0.5 + rng.uniform(-0.38, 0.38)) * cs, (gy + 0.5 + rng.uniform(-0.38, 0.38)) * cs] for gy in range(G) for gx in range(G)], np.float32)
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
F1 = np.full((N, N), 1e9, np.float32); F2 = np.full((N, N), 1e9, np.float32); ID = np.zeros((N, N), np.int32)
for k, (px, py) in enumerate(pts):
    dx = np.abs(xx - px); dx = np.minimum(dx, N - dx); dy = np.abs(yy - py); dy = np.minimum(dy, N - dy)
    d = np.sqrt(dx * dx * 0.92 + dy * dy * 1.12)
    m = d < F1; F2 = np.where(m, F1, np.minimum(F2, d)); ID = np.where(m, k, ID); F1 = np.where(m, d, F1)
edge = F2 - F1
s = N / 9.6   # px per metre
h = np.clip(edge / (0.24 * s), 0, 1) ** 0.7
h = gaussian_filter(h, 2.2, mode='wrap')
gy, gx = np.gradient(h); gy2 = np.gradient(h, axis=0); gx2 = np.gradient(h, axis=1)
# periodic gradient (wrap) so the seams stay invisible
def pgrad(a):
    return (np.roll(a, -1, 1) - np.roll(a, 1, 1)) / 2, (np.roll(a, -1, 0) - np.roll(a, 1, 0)) / 2
gx, gy = pgrad(h)
light = np.clip(1.0 - (gx + gy) * 7.0, 0.86, 1.07) * (0.94 + 0.06 * h)
base = np.array([248, 232, 216], np.float32)
tint = rng.uniform(0.965, 1.02, len(pts))[ID][..., None]
warm = rng.uniform(-5, 5, len(pts))[ID][..., None] * np.array([1, 0, -1.5], np.float32)
col = (base + warm) * tint * light[..., None]
grout = np.array([208, 182, 160], np.float32)
t = np.clip((edge - 0.035 * s) / (0.05 * s), 0, 1)[..., None]; t = t * t * (3 - 2 * t)
col = grout + (col - grout) * t
img = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
img.save('public/art/ground/flagstone.webp', quality=86, method=6)
print('ok')

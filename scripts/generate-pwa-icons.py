#!/usr/bin/env python3
"""
Derives the PWA icon files from the APPROVED Monitriq app icon (the pack's
1024px original). Nothing is redrawn: the artwork is only resized. Run from
the repo root:  python3 scripts/generate-pwa-icons.py

- apple-touch-icon-180.png : the approved icon, downscaled (iOS applies its own rounding).
- monitriq-app-icon-maskable-512.png : the approved artwork scaled into the maskable safe zone
  (mark kept inside the central 80% circle) on a background rebuilt from the icon's own four
  corner colours (bilinear), with a feathered edge so no seam shows.
"""
from PIL import Image, ImageFilter, ImageDraw

SRC = "docs/reference/monitriq brand/monitriq-app-icon-1024.png"
OUT = "public/brand"

src = Image.open(SRC).convert("RGBA")
src.resize((180, 180), Image.LANCZOS).save(f"{OUT}/apple-touch-icon-180.png", optimize=True)

SIZE = 512
S = 0.84  # mark scale: the arrow tip (~43% from centre) lands at ~36% < 40% safe radius
w, h = src.size
def corner(x, y):
    px = src.crop((x, y, x + 12, y + 12)).resize((1, 1), Image.BOX).getpixel((0, 0))
    return px[:3]
tl, tr, bl, br = corner(0, 0), corner(w - 12, 0), corner(0, h - 12), corner(w - 12, h - 12)

bg = Image.new("RGB", (SIZE, SIZE))
px = bg.load()
for y in range(SIZE):
    fy = y / (SIZE - 1)
    for x in range(SIZE):
        fx = x / (SIZE - 1)
        top = tuple(tl[i] * (1 - fx) + tr[i] * fx for i in range(3))
        bot = tuple(bl[i] * (1 - fx) + br[i] * fx for i in range(3))
        px[x, y] = tuple(int(round(top[i] * (1 - fy) + bot[i] * fy)) for i in range(3))
bg = bg.convert("RGBA")

inner = int(SIZE * S)
art = src.resize((inner, inner), Image.LANCZOS)
mask = Image.new("L", (inner, inner), 0)
ImageDraw.Draw(mask).rectangle((6, 6, inner - 7, inner - 7), fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(4))
off = (SIZE - inner) // 2
bg.paste(art, (off, off), mask)
bg.convert("RGB").save(f"{OUT}/monitriq-app-icon-maskable-512.png", optimize=True)
print("wrote", f"{OUT}/apple-touch-icon-180.png", f"{OUT}/monitriq-app-icon-maskable-512.png")

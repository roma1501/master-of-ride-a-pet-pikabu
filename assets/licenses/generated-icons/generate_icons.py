"""Procedural UI glyph icons for "Master of Riding a Pet".

ORIGINAL work drawn by this script with Pillow (not taken from any pack, not AI-generated art).
Released under CC0 1.0 (public domain dedication) together with the game.

Draws white flat glyphs (alpha masks, 96x96) in the spirit of Kenney's Game Icons for the symbols that the
Kenney libraries do not have: paw, egg, egg-cracked, bolt, gift, wheel, snowflake, leaf, pin, radar, backpack,
sun, moon, storm, clover, play, tag (price tag), banknote. Also contains `colorize` (gradient fill + dark outline) used for the
colored icon set.

Library use:  from generate_icons import PROCEDURAL, colorize
Command line: python generate_icons.py <output_dir>   (writes the white glyphs as lossless WebP)
"""
import math
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

OUT = 96          # final icon size
S = 4             # supersampling
W = OUT * S


def canvas():
    return Image.new('L', (W, W), 0), None


def new():
    im = Image.new('L', (W, W), 0)
    return im, ImageDraw.Draw(im)


def px(v):
    return v * S


def ell(d, cx, cy, rx, ry, rot=0.0, fill=255, n=72):
    pts = []
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    for i in range(n):
        t = 2 * math.pi * i / n
        x, y = rx * math.cos(t), ry * math.sin(t)
        pts.append((px(cx + x * c - y * s), px(cy + x * s + y * c)))
    d.polygon(pts, fill=fill)


def circ(d, cx, cy, r, fill=255):
    d.ellipse([px(cx - r), px(cy - r), px(cx + r), px(cy + r)], fill=fill)


def line(d, pts, width, fill=255):
    p = [(px(x), px(y)) for x, y in pts]
    d.line(p, fill=fill, width=int(px(width)), joint='curve')
    for x, y in p:
        r = px(width) / 2
        d.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def poly(d, pts, fill=255):
    d.polygon([(px(x), px(y)) for x, y in pts], fill=fill)


def rrect(d, x0, y0, x1, y1, r, fill=255, outline=None, width=0):
    d.rounded_rectangle([px(x0), px(y0), px(x1), px(y1)], radius=px(r), fill=fill, outline=outline, width=int(px(width)))


def done(im):
    return im.resize((OUT, OUT), Image.LANCZOS)


def paw():
    im, d = new()
    ell(d, 48, 66, 20, 15)
    circ(d, 31, 58, 9)
    circ(d, 65, 58, 9)
    ell(d, 21, 41, 7, 10, -28)
    ell(d, 37, 25, 7.5, 10.5, -8)
    ell(d, 59, 25, 7.5, 10.5, 8)
    ell(d, 75, 41, 7, 10, 28)
    return done(im)


def egg_shape(d, cx, cy, a, b, fill=255):
    pts = []
    for i in range(120):
        t = 2 * math.pi * i / 120
        k = 1 - 0.2 * math.sin(t)
        pts.append((px(cx + a * math.cos(t) * k), px(cy - b * math.sin(t))))
    d.polygon(pts, fill=fill)


def egg():
    im, d = new()
    egg_shape(d, 48, 52, 28, 38)
    for (x, y, rx, ry, rot) in ((38, 40, 4.5, 3.2, -25), (58, 54, 5, 3.4, 20), (40, 66, 4, 3, 10), (54, 32, 3, 2.4, 0)):
        ell(d, x, y, rx, ry, rot, fill=0)
    return done(im)


def egg_cracked():
    im, d = new()
    egg_shape(d, 48, 52, 28, 38)
    zig = [(14, 50), (28, 42), (38, 56), (50, 40), (60, 56), (72, 44), (82, 52)]
    line(d, zig, 4.2, fill=0)
    return done(im)


def bolt():
    im, d = new()
    poly(d, [(60, 4), (22, 54), (45, 54), (34, 92), (76, 38), (53, 38), (70, 4)])
    return done(im)


def gift():
    im, d = new()
    rrect(d, 16, 46, 80, 90, 5)
    rrect(d, 10, 32, 86, 50, 5)
    for x in (41, 52):
        d.rectangle([px(x), px(32), px(x + 3), px(90)], fill=0)
    rrect(d, 44, 32, 52, 90, 0)
    # bow: two loops
    for cx, rot in ((35, -30), (61, 30)):
        ell(d, cx, 21, 15, 9, rot)
        ell(d, cx, 21, 8, 4.2, rot, fill=0)
    circ(d, 48, 28, 7)
    return done(im)


def wheel():
    im, d = new()
    cx, cy, r = 48, 54, 38
    circ(d, cx, cy, r)
    circ(d, cx, cy, r - 6, fill=0)
    for k in range(8):
        a = math.radians(k * 45 + 22.5)
        line(d, [(cx, cy), (cx + (r - 5) * math.cos(a), cy + (r - 5) * math.sin(a))], 4.5)
    circ(d, cx, cy, 9)
    circ(d, cx, cy, 3.6, fill=0)
    for k in range(8):
        a = math.radians(k * 45)
        circ(d, cx + (r - 3) * math.cos(a), cy + (r - 3) * math.sin(a), 3.4)
    poly(d, [(38, 4), (58, 4), (48, 24)])
    return done(im)


def snowflake():
    im, d = new()
    cx, cy = 48, 48
    for k in range(6):
        a = math.radians(k * 60 - 90)
        ex, ey = cx + 40 * math.cos(a), cy + 40 * math.sin(a)
        line(d, [(cx, cy), (ex, ey)], 5.5)
        for f, ln in ((0.5, 15), (0.76, 10)):
            bx, by = cx + 40 * f * math.cos(a), cy + 40 * f * math.sin(a)
            for da in (-48, 48):
                b = a + math.radians(da)
                line(d, [(bx, by), (bx + ln * math.cos(b), by + ln * math.sin(b))], 4.6)
    circ(d, cx, cy, 8)
    circ(d, cx, cy, 3.5, fill=0)
    return done(im)


def leaf():
    im, d = new()
    ell(d, 52, 44, 42, 23, -42)
    line(d, [(24, 72), (12, 88)], 6)
    line(d, [(28, 68), (74, 22)], 3.4, fill=0)
    for (x, y, dx, dy) in ((42, 54, 8, 10), (52, 44, 8, 10), (62, 34, 7, 9)):
        line(d, [(x, y), (x - dy * 0.4 + dx * 0.0, y + dx * 0.9)], 2.6, fill=0)
        line(d, [(x, y), (x + dx * 0.9, y - dy * 0.4)], 2.6, fill=0)
    return done(im)


def pin():
    im, d = new()
    circ(d, 48, 36, 29)
    poly(d, [(20.5, 46), (48, 92), (75.5, 46)])
    circ(d, 48, 36, 11, fill=0)
    return done(im)


def radar():
    im, d = new()
    cx, cy = 48, 48
    circ(d, cx, cy, 43)
    circ(d, cx, cy, 37, fill=0)
    circ(d, cx, cy, 27)
    circ(d, cx, cy, 22, fill=0)
    # sweep wedge
    pts = [(px(cx), px(cy))]
    for i in range(0, 41):
        a = math.radians(-100 + i)
        pts.append((px(cx + 34 * math.cos(a)), px(cy + 34 * math.sin(a))))
    d.polygon(pts, fill=255)
    line(d, [(cx, cy), (cx + 36 * math.cos(math.radians(-60)), cy + 36 * math.sin(math.radians(-60)))], 3.6)
    circ(d, cx, cy, 5)
    circ(d, 68, 62, 4.5)
    circ(d, 30, 66, 3.5)
    return done(im)


def backpack():
    im, d = new()
    ell(d, 48, 20, 15, 13)
    ell(d, 48, 21, 9, 7.5, fill=0)
    rrect(d, 20, 30, 76, 90, 16)
    rrect(d, 11, 52, 23, 80, 5)
    rrect(d, 73, 52, 85, 80, 5)
    # flap and pocket cut lines
    line(d, [(24, 50), (48, 56), (72, 50)], 3, fill=0)
    rrect(d, 31, 64, 65, 83, 7, fill=0)
    rrect(d, 34.5, 67.5, 61.5, 79.5, 5, fill=255)
    line(d, [(42, 36), (54, 36)], 3, fill=0)
    return done(im)


def sun():
    im, d = new()
    circ(d, 48, 48, 21)
    for k in range(8):
        a = math.radians(k * 45)
        line(d, [(48 + 30 * math.cos(a), 48 + 30 * math.sin(a)), (48 + 42 * math.cos(a), 48 + 42 * math.sin(a))], 7)
    return done(im)


def moon():
    im, d = new()
    circ(d, 46, 50, 36)
    circ(d, 62, 38, 30, fill=0)
    return done(im)


def cloud_shape(d, ox=0, oy=0, scale=1.0):
    def t(x, y):
        return ox + (x - 48) * scale + 48, oy + (y - 48) * scale + 48
    rrect(d, *t(14, 40), *t(84, 60), 10 * scale)
    for (cx, cy, r) in ((32, 42, 15), (50, 34, 20), (68, 42, 14)):
        x, y = t(cx, cy)
        circ(d, x, y, r * scale)


def storm():
    im, d = new()
    cloud_shape(d, 0, -12, 1.0)
    bolt_pts = [(54, 40), (34, 68), (47, 68), (40, 92), (64, 60), (51, 60), (60, 40)]
    # gap around the bolt, then the bolt itself
    gap = Image.new('L', (W, W), 0)
    gd = ImageDraw.Draw(gap)
    poly(gd, bolt_pts)
    gap = gap.filter(ImageFilter.MaxFilter(S * 4 + 1))
    im = ImageChops.multiply(im, ImageChops.invert(gap))
    d = ImageDraw.Draw(im)
    poly(d, bolt_pts)
    return done(im)


def heart_pts(cx, cy, size, rot):
    pts = []
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    for i in range(90):
        t = 2 * math.pi * i / 90
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        x, y = x * size / 32, y * size / 32
        pts.append((px(cx + x * c - y * s), px(cy + x * s + y * c)))
    return pts


def clover():
    im, d = new()
    for k in range(4):
        phi = 45 + 90 * k
        r = 15.0
        cx = 48 + r * math.cos(math.radians(phi))
        cy = 46 + r * math.sin(math.radians(phi))
        # the heart tip (+y) must point to the centre of the clover
        d.polygon(heart_pts(cx, cy, 34, phi + 90), fill=255)
    line(d, [(48, 52), (52, 70), (46, 90)], 5)
    circ(d, 48, 46, 3.6, fill=0)
    return done(im)


def play():
    im, d = new()
    poly(d, [(26, 12), (26, 84), (84, 48)])
    line(d, [(26, 12), (26, 84), (84, 48), (26, 12)], 8)
    return done(im)


def tag():
    im, d = new()
    layer = Image.new('L', (W, W), 0)
    ld = ImageDraw.Draw(layer)
    rrect(ld, 34, 26, 86, 70, 7)
    poly(ld, [(36, 26), (6, 48), (36, 70)])
    circ(ld, 22, 48, 5.5, fill=0)
    layer = layer.rotate(35, resample=Image.BICUBIC, center=(px(48), px(48)))
    return done(layer)


def banknote():
    im, d = new()
    rrect(d, 6, 24, 90, 72, 9)
    circ(d, 48, 48, 17, fill=0)
    circ(d, 48, 48, 12.5)
    circ(d, 48, 48, 5, fill=0)
    for (x, y) in ((17, 35), (79, 35), (17, 61), (79, 61)):
        circ(d, x, y, 4, fill=0)
    return done(im)


PROCEDURAL = {
    'paw': paw, 'egg': egg, 'egg-cracked': egg_cracked, 'bolt': bolt, 'gift': gift, 'wheel': wheel,
    'snowflake': snowflake, 'leaf': leaf, 'pin': pin, 'radar': radar, 'backpack': backpack, 'sun': sun,
    'moon': moon, 'storm': storm, 'clover': clover, 'play': play, 'tag': tag, 'banknote': banknote,
}


def to_white(mask):
    out = Image.new('RGBA', mask.size, (255, 255, 255, 0))
    out.putalpha(mask)
    return out


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def colorize(mask, top, bottom, outline='#3b1d08', border=3, inner=84):
    """White-glyph mask (L, 96x96) -> colored icon with a dark outline and a vertical gradient fill."""
    size = mask.size[0]
    glyph = mask.resize((inner, inner), Image.LANCZOS)
    pad = (size - inner) // 2
    base = Image.new('L', (size, size), 0)
    base.paste(glyph, (pad, pad))
    big = base.resize((size * 2, size * 2), Image.LANCZOS)
    k = border * 2 * 2 + 1
    grown = big.filter(ImageFilter.MaxFilter(k if k % 2 else k + 1)).filter(ImageFilter.GaussianBlur(1.0))
    grown = grown.point(lambda v: 255 if v > 90 else int(v * 255 / 90))
    t, b = hexrgb(top), hexrgb(bottom)
    grad = Image.new('RGBA', big.size)
    gp = grad.load()
    ys, ye = int(big.size[1] * 0.1), int(big.size[1] * 0.9)
    for y in range(big.size[1]):
        f = min(1.0, max(0.0, (y - ys) / (ye - ys)))
        col = tuple(int(t[i] + (b[i] - t[i]) * f) for i in range(3)) + (255,)
        for x in range(big.size[0]):
            gp[x, y] = col
    out = Image.new('RGBA', big.size, hexrgb(outline) + (0,))
    out.putalpha(grown)
    fill = grad.copy()
    fill.putalpha(big)
    out = Image.alpha_composite(out, fill)
    return out.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    out_dir = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(out_dir, exist_ok=True)
    for name, fn in PROCEDURAL.items():
        to_white(fn()).save(os.path.join(out_dir, name + '.webp'), 'WEBP', lossless=True, quality=100, method=6)
        print(name)

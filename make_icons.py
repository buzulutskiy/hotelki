#!/usr/bin/env python3
"""Иконки для «Хотелки»: тёплый градиент + белое сердце-звезда."""
from PIL import Image, ImageDraw
import math, os

OUT = os.path.dirname(os.path.abspath(__file__))

def lerp(a, b, t): return tuple(round(a[i] + (b[i]-a[i])*t) for i in range(3))

def rounded_mask(size, rad):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size-1, size-1], radius=rad, fill=255)
    return m

def heart_points(cx, cy, s):
    pts = []
    for i in range(721):
        t = math.radians(i * 0.5)
        x = 16 * math.sin(t)**3
        y = 13*math.cos(t) - 5*math.cos(2*t) - 2*math.cos(3*t) - math.cos(4*t)
        pts.append((cx + x*s, cy - y*s))
    return pts

def make(size):
    ss = 4
    S = size * ss
    img = Image.new("RGB", (S, S), (0, 0, 0))
    top = (0x5B, 0x4B, 0xC4)   # индиго
    bot = (0xC2, 0x50, 0x9A)   # тёпло-розовый
    px = img.load()
    for y in range(S):
        t = y / (S-1)
        c = lerp(top, bot, t)
        for x in range(S):
            px[x, y] = c
    d = ImageDraw.Draw(img)
    # мягкая диагональная подсветка
    hl = Image.new("L", (S, S), 0)
    hd = ImageDraw.Draw(hl)
    hd.ellipse([-S*0.3, -S*0.4, S*0.7, S*0.5], fill=60)
    img = Image.composite(Image.new("RGB", (S, S), (255, 255, 255)), img, hl.point(lambda v: v//2))
    d = ImageDraw.Draw(img)
    # сердце
    heart = heart_points(S*0.5, S*0.46, S*0.020)
    d.polygon(heart, fill=(255, 255, 255))
    # маленькая «звёздочка-искра» сверху справа
    def sparkle(cx, cy, r):
        pts = []
        for k in range(8):
            ang = math.pi/2 + k*math.pi/4
            rr = r if k % 2 == 0 else r*0.36
            pts.append((cx + rr*math.cos(ang), cy - rr*math.sin(ang)))
        d.polygon(pts, fill=(255, 255, 255))
    sparkle(S*0.72, S*0.30, S*0.052)
    img = img.resize((size, size), Image.LANCZOS)
    rad = round(size * 0.225)
    mask = rounded_mask(size, rad)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out

for sz, name in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "icon-180.png"), (32, "favicon-32.png")]:
    make(sz).save(os.path.join(OUT, name))
    print("wrote", name)
print("done")

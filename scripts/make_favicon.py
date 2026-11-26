"""Build site/public/favicon.ico (16, 32, 48 px) and favicon.svg from the Extremes logo.

Standard library only: the logo is drawn with a small supersampling rasteriser and
each size is stored as a PNG inside the .ico. Rerun after changing the logo in
site/src/components/Logo.astro.
"""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "site" / "public"
SIZES = (16, 32, 48)
SS = 4  # samples per pixel along each axis


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def inside(poly, x, y):
    hit = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def quad(p0, p1, p2, n=12):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1])
            for t in (k / n for k in range(1, n + 1))]


# Shapes in the logo's 64 x 64 viewBox
MOUNTAIN = [(6, 36), (24, 10), (34, 24), (40, 16), (58, 36)]
SEA = [(6, 36), (58, 36), (58, 42)] + quad((58, 42), (50, 50), (32, 50)) + quad((32, 50), (14, 50), (6, 42))
BG = hex_rgb("#13283a")
RIM = (255 * .2 + 0x13 * .8, 255 * .2 + 0x28 * .8, 255 * .2 + 0x3a * .8)
M_TOP, M_BOT = hex_rgb("#ffd27a"), hex_rgb("#ff6f61")
S_TOP, S_BOT = hex_rgb("#4aa3e8"), hex_rgb("#0d2a40")


def sample(x, y):
    """Colour and alpha of one point in viewBox units, or None if outside the badge."""
    r2 = (x - 32) ** 2 + (y - 32) ** 2
    if r2 > 31 ** 2:
        return None
    if inside(MOUNTAIN, x, y):
        return lerp(M_TOP, M_BOT, (y - 10) / 26)
    if inside(SEA, x, y):
        return lerp(S_TOP, S_BOT, (y - 36) / 14)
    return RIM if r2 > 29.5 ** 2 else BG


def render(size):
    rows = []
    n = SS * SS
    for py in range(size):
        row = bytearray([0])  # PNG filter byte
        for px in range(size):
            acc = [0.0, 0.0, 0.0]
            hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    c = sample((px + (sx + .5) / SS) * 64 / size, (py + (sy + .5) / SS) * 64 / size)
                    if c:
                        hits += 1
                        for k in range(3):
                            acc[k] += c[k]
            if hits:
                row += bytes(round(v / hits) for v in acc) + bytes([round(255 * hits / n)])
            else:
                row += b"\0\0\0\0"
        rows.append(bytes(row))
    return png(size, b"".join(rows))


def png(size, raw):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def ico(images):
    head = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries, blobs = b"", b""
    for size, data in images:
        entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
        blobs += data
    return head + entries + blobs


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#ff6f61"/></linearGradient><linearGradient id="lg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4aa3e8"/><stop offset="1" stop-color="#0d2a40"/></linearGradient></defs><circle cx="32" cy="32" r="30" fill="#13283a" stroke="rgba(255,255,255,.2)"/><path d="M6 36 L24 10 L34 24 L40 16 L58 36Z" fill="url(#lg1)"/><path d="M6 36 H58 V42 Q50 50 32 50 Q14 50 6 42Z" fill="url(#lg2)"/><path d="M14 46 q4 -3 8 0 t8 0 t8 0 t8 0" fill="none" stroke="#bfe3ff" stroke-width="1.6" stroke-linecap="round"/></svg>
"""

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "favicon.ico").write_bytes(ico([(s, render(s)) for s in SIZES]))
    (OUT / "favicon.svg").write_text(SVG, encoding="utf-8")
    (OUT / "apple-touch-icon.png").write_bytes(render(180))
    print("wrote", ", ".join(p.name for p in sorted(OUT.iterdir())))

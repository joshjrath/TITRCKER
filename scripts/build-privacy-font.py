"""Builds src/fonts/privacy-dots.woff2: a tiny font whose digits 0-9 are all drawn as one centred dot.

Privacy mode (the eye toggle) puts this font first for amounts, so every digit shows as a dot while letters,
currency codes and punctuation fall through to Inter. Its digits have Inter's tabular width and vertical metrics,
so amounts keep their size and line height.

Run: python3 scripts/build-privacy-font.py   (needs fontTools and brotli: pip install fonttools brotli)
"""

from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

UPM = 2048  # Inter's units per em
ADVANCE = 1328  # Inter's tabular digit width
ASCENT, DESCENT = 1984, -494  # Inter's ascender/descender, so line height is unchanged
CENTER_X, CENTER_Y = ADVANCE / 2, 600  # the height of Inter's own bullet (•)
RADIUS = 210  # between Inter's period (135) and bullet (320)
KAPPA = 0.5523  # cubic Bézier circle constant


def dot_glyph():
    pen = TTGlyphPen(None)
    cubic = Cu2QuPen(pen, max_err=1, reverse_direction=False)
    cx, cy, r, k = CENTER_X, CENTER_Y, RADIUS, RADIUS * KAPPA
    # Clockwise (TrueType outer contour): top → right → bottom → left.
    cubic.moveTo((cx, cy + r))
    cubic.curveTo((cx + k, cy + r), (cx + r, cy + k), (cx + r, cy))
    cubic.curveTo((cx + r, cy - k), (cx + k, cy - r), (cx, cy - r))
    cubic.curveTo((cx - k, cy - r), (cx - r, cy - k), (cx - r, cy))
    cubic.curveTo((cx - r, cy + k), (cx - k, cy + r), (cx, cy + r))
    cubic.closePath()
    return pen.glyph()


def main():
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder([".notdef", "dot"])
    fb.setupCharacterMap({cp: "dot" for cp in range(0x30, 0x3A)})
    fb.setupGlyf({".notdef": TTGlyphPen(None).glyph(), "dot": dot_glyph()})
    fb.setupHorizontalMetrics({".notdef": (ADVANCE, 0), "dot": (ADVANCE, round(CENTER_X - RADIUS))})
    fb.setupHorizontalHeader(ascent=ASCENT, descent=DESCENT, lineGap=0)
    fb.setupNameTable({"familyName": "Tenth Privacy", "styleName": "Regular"})
    fb.setupOS2(
        version=4,
        sTypoAscender=ASCENT,
        sTypoDescender=DESCENT,
        sTypoLineGap=0,
        usWinAscent=2269,
        usWinDescent=660,
        sxHeight=1118,
        sCapHeight=1490,
        fsSelection=0x40 | 0x80,  # REGULAR | USE_TYPO_METRICS, like Inter
        achVendID="TNTH",
    )
    fb.setupPost()
    fb.font.flavor = "woff2"
    out = Path(__file__).resolve().parent.parent / "src" / "fonts" / "privacy-dots.woff2"
    fb.save(str(out))
    print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()

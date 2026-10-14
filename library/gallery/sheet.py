"""Contact sheets from gallery/previews.mjs output.

usage: python gallery/sheet.py <previews_dir> <sheets_dir> [--thumb 240] [--strips]

Writes <sheets_dir>/<category>.jpg: one row per effect (id + title on the left, its preview frames in order),
so an agent or a person can pick an effect by looking at one image per category.
--strips also writes <previews_dir>/<id>/strip.jpg (frames 3 x 2 at full preview size) for close review.
"""
import argparse
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ORDER = ['transitions', 'text', 'camera', 'fx', 'shapes', 'timing']


def font(size, bold=False):
    names = ['arialbd.ttf', 'Arial Bold.ttf', 'DejaVuSans-Bold.ttf'] if bold else ['arial.ttf', 'Arial.ttf', 'DejaVuSans.ttf']
    for n in names:
        for d in ('', 'C:/Windows/Fonts/', '/usr/share/fonts/truetype/dejavu/', '/Library/Fonts/', '/System/Library/Fonts/Supplemental/'):
            try:
                return ImageFont.truetype(d + n, size)
            except OSError:
                pass
    return ImageFont.load_default()


def wrap(draw, text, f, width):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=f) <= width:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('previews')
    ap.add_argument('sheets')
    ap.add_argument('--thumb', type=int, default=240)
    ap.add_argument('--strips', action='store_true')
    a = ap.parse_args()
    idx_path = os.path.join(a.previews, 'index.json')
    if not os.path.exists(idx_path):
        sys.exit(f'not found: {idx_path} (run gallery/previews.mjs first)')
    index = json.load(open(idx_path, encoding='utf-8-sig'))
    os.makedirs(a.sheets, exist_ok=True)
    tw, th = a.thumb, a.thumb * 9 // 16
    label_w, pad = 300, 8
    f_id, f_title = font(18, True), font(14)
    by_cat = {}
    for eid, e in index.items():
        by_cat.setdefault(e['meta'].get('category', 'other'), []).append((eid, e))
    for cat in [c for c in ORDER if c in by_cat] + [c for c in by_cat if c not in ORDER]:
        rows = sorted(by_cat[cat], key=lambda x: x[0])
        n = max(len(e['files']) for _, e in rows)
        W, H = label_w + n * (tw + pad) + pad, len(rows) * (th + pad) + pad
        sheet = Image.new('RGB', (W, H), (18, 18, 22))
        d = ImageDraw.Draw(sheet)
        for r, (eid, e) in enumerate(rows):
            y = pad + r * (th + pad)
            d.text((12, y + 6), eid, fill=(255, 210, 63), font=f_id)
            for k, line in enumerate(wrap(d, e['meta'].get('title', ''), f_title, label_w - 24)[:4]):
                d.text((12, y + 34 + 18 * k), line, fill=(230, 230, 230), font=f_title)
            for i, rel in enumerate(e['files']):
                im = Image.open(os.path.join(a.previews, rel)).convert('RGB').resize((tw, th), Image.LANCZOS)
                sheet.paste(im, (label_w + i * (tw + pad), y))
        out = os.path.join(a.sheets, f'{cat}.jpg')
        sheet.save(out, quality=80, optimize=True)
        print(f'{out}: {len(rows)} effect(s)')
        if a.strips:
            for eid, e in rows:
                ims = [Image.open(os.path.join(a.previews, rel)).convert('RGB') for rel in e['files']]
                w, h = ims[0].size
                cols = 3
                strip = Image.new('RGB', (cols * w, ((len(ims) + cols - 1) // cols) * h), (0, 0, 0))
                ds = ImageDraw.Draw(strip)
                for i, im in enumerate(ims):
                    x, y = (i % cols) * w, (i // cols) * h
                    strip.paste(im, (x, y))
                    ds.rectangle([x, y, x + 70, y + 22], fill=(0, 0, 0))
                    ds.text((x + 4, y + 3), f'f{e["frames"][i]}', fill=(255, 210, 63), font=f_title)
                strip.save(os.path.join(a.previews, eid, 'strip.jpg'), quality=85)


if __name__ == '__main__':
    main()

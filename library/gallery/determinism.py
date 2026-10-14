"""Quantify the determinism check of gallery/previews.mjs --check.

usage: python gallery/determinism.py <previews_dir> [--tol 6] [--max-share 0.0005]

For every effect, compares the two full-size renders of the same frame (another frame was rendered in between) and reports
the share of pixels that differ by more than --tol levels (of 255) in any channel, and the largest difference.
GPU rasteriser noise is a few levels on a handful of pixels; code that depends on anything but the frame (leftover state,
render order, wall clock, Math.random) changes whole regions. An effect FAILS when more than --max-share of its pixels
differ by more than --tol. Exit code 1 if any effect fails.
"""
import argparse
import json
import os
import sys

from PIL import Image, ImageChops


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('previews')
    ap.add_argument('--tol', type=int, default=6)
    ap.add_argument('--max-share', type=float, default=0.0005)
    a = ap.parse_args()
    index = json.load(open(os.path.join(a.previews, 'index.json'), encoding='utf-8-sig'))
    rows, bad = [], []
    for eid, e in sorted(index.items()):
        chk = e.get('check')
        if not chk:
            continue
        i1 = Image.open(os.path.join(a.previews, chk['a1'])).convert('RGBA')
        i2 = Image.open(os.path.join(a.previews, chk['a2'])).convert('RGBA')
        d = ImageChops.difference(i1, i2)
        mx = max(b[1] for b in d.getextrema())
        if mx == 0:
            rows.append((eid, 0.0, 0, 'identical'))
            continue
        # per-pixel max over channels, then count the ones above the tolerance
        lum = ImageChops.lighter(ImageChops.lighter(d.getchannel(0), d.getchannel(1)), ImageChops.lighter(d.getchannel(2), d.getchannel(3)))
        hist = lum.histogram()
        over = sum(hist[a.tol + 1:])
        share = over / (lum.width * lum.height)
        status = 'FAIL' if share > a.max_share else 'noise'
        rows.append((eid, share, mx, status))
        if status == 'FAIL':
            bad.append(eid)
    for eid, share, mx, status in rows:
        if status != 'identical':
            print(f'{status:5} {eid:24} {share * 100:7.4f}% of pixels differ by > {a.tol}, max diff {mx}')
    print(f'{sum(r[3] == "identical" for r in rows)} identical, {sum(r[3] == "noise" for r in rows)} within noise, {len(bad)} FAIL of {len(rows)}')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()

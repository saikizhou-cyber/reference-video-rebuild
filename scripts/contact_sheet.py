"""Contact sheet of one film, no reference video needed (the review tool for create mode).

usage: python contact_sheet.py <video> [-o out/sheet.png] [--every N | --frames f1,f2,... | --beats beats.json | --shots]
                               [--cols 6] [--thumb 320] [--root .]

Samples frames from the film and tiles them with frame numbers (and shot ids when src/core/timeline.ts is found):
  default / --shots   the middle frame of every shot in src/core/timeline.ts; without a timeline, every 15 frames
  --every N           every N-th frame
  --frames a,b,c      exactly these frames
  --beats beats.json  one frame per beat of `beat_check.py grid --json` (is the hit on screen on the beat?)
  --cuts              the last frame of each shot and the first of the next, side by side (what does each cut change?)
Several sheets are written when there are more than 48 tiles (sheet_1.png, sheet_2.png ...).
grid.py / shotsheet.py / strip.py compare with a reference video; this one is for films that have none.
"""
import argparse
import json
import math
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _shots import FPS, load_shots, project_root  # noqa: E402


def font(size):
    for n in ('arialbd.ttf', 'Arial Bold.ttf', 'DejaVuSans-Bold.ttf'):
        for d in ('', 'C:/Windows/Fonts/', '/usr/share/fonts/truetype/dejavu/', '/Library/Fonts/', '/System/Library/Fonts/Supplemental/'):
            try:
                return ImageFont.truetype(d + n, size)
            except OSError:
                pass
    return ImageFont.load_default()


def probe(video):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames,r_frame_rate',
                        '-of', 'json', video], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f'ffprobe failed on {video}: {r.stderr.strip()[-200:]}')
    s = json.loads(r.stdout)['streams'][0]
    num, den = s['r_frame_rate'].split('/')
    return int(s['width']), int(s['height']), int(s['nb_read_frames']), float(num) / float(den)


def grab(video, frames, thumb_w, d):
    """Extract exactly these frame numbers (sorted, unique) as PNGs; returns {frame: path}."""
    want = sorted(set(frames))
    expr = '+'.join(f'eq(n\\,{f})' for f in want)
    pat = os.path.join(d, 'f_%05d.png')
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-vf', f"select='{expr}',scale={thumb_w}:-2", '-vsync', '0', pat], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f'ffmpeg failed: {r.stderr.strip()[-300:]}')
    return {f: os.path.join(d, f'f_{i + 1:05d}.png') for i, f in enumerate(want)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('video')
    ap.add_argument('-o', '--out', default='out/sheet.png')
    ap.add_argument('--every', type=int)
    ap.add_argument('--frames')
    ap.add_argument('--beats')
    ap.add_argument('--shots', action='store_true')
    ap.add_argument('--cuts', action='store_true')
    ap.add_argument('--cols', type=int, default=6)
    ap.add_argument('--thumb', type=int, default=320, help='tile width in px')
    ap.add_argument('--root')
    a = ap.parse_args()
    if not os.path.exists(a.video):
        sys.exit(f'not found: {a.video}')
    w, h, n, fps = probe(a.video)
    root = project_root(a.root)
    shots = None
    if a.shots or a.cuts or not (a.every or a.frames or a.beats):
        try:
            shots = load_shots(root, fps)
        except SystemExit:
            shots = None
    tiles = []  # (label, [frames])
    if a.frames:
        tiles = [(f'f{int(f)}', [int(f)]) for f in a.frames.split(',')]
    elif a.beats:
        b = json.load(open(a.beats, encoding='utf-8-sig'))['beat_frames']
        tiles = [(f'beat f{f}', [f]) for f in b if f < n]
    elif a.every:
        tiles = [(f'f{f}', [f]) for f in range(0, n, a.every)]
    elif shots and a.cuts:
        for (i0, f0, l0), (i1, f1, _) in zip(shots, shots[1:]):
            tiles.append((f'{i0}>{i1}  f{l0}|f{f1}', [min(l0, n - 1), min(f1, n - 1)]))
    elif shots:
        tiles = [(f'{i} f{(f0 + l) // 2}', [min((f0 + l) // 2, n - 1)]) for i, f0, l in shots]
    else:
        tiles = [(f'f{f}', [f]) for f in range(0, n, 15)]
    tiles = [(lab, [min(max(f, 0), n - 1) for f in fr]) for lab, fr in tiles]
    tw = a.thumb
    th = round(tw * h / w)
    per_tile_w = tw * max(len(fr) for _, fr in tiles)
    per_sheet = 48 if len(tiles[0][1]) == 1 else 24
    cols = a.cols if len(tiles[0][1]) == 1 else max(1, a.cols // 2)
    f_lab = font(max(12, tw // 22))
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    sheets = math.ceil(len(tiles) / per_sheet)
    written = []
    with tempfile.TemporaryDirectory() as d:
        paths = grab(a.video, [f for _, fr in tiles for f in fr], tw, d)
        for s in range(sheets):
            chunk = tiles[s * per_sheet:(s + 1) * per_sheet]
            rows = math.ceil(len(chunk) / cols)
            pad = 6
            sheet = Image.new('RGB', (cols * (per_tile_w + pad) + pad, rows * (th + pad) + pad), (18, 18, 22))
            dr = ImageDraw.Draw(sheet)
            for i, (lab, fr) in enumerate(chunk):
                x, y = pad + (i % cols) * (per_tile_w + pad), pad + (i // cols) * (th + pad)
                for k, f in enumerate(fr):
                    im = Image.open(paths[f]).convert('RGB')
                    sheet.paste(im, (x + k * tw, y))
                bw = int(dr.textlength(lab, font=f_lab)) + 8
                dr.rectangle([x, y, x + bw, y + f_lab.size + 6], fill=(0, 0, 0))
                dr.text((x + 4, y + 2), lab, fill=(255, 210, 63), font=f_lab)
            out = a.out if sheets == 1 else a.out.replace('.png', f'_{s + 1}.png')
            sheet.save(out)
            written.append(out)
    print(f'{os.path.basename(a.video)}: {n} frames, {w}x{h}, {fps:g} fps; {len(tiles)} tile(s) -> ' + ', '.join(written))


if __name__ == '__main__':
    main()

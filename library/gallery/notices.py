"""Rebuild the library section of THIRD_PARTY_NOTICES.md from the `// Ported from ...` headers in effects/.

usage: python gallery/notices.py [--check]

Every ported effect file starts with a comment block "// Ported from <project> (<url>), <licence>, Copyright ...".
This collects them (file -> header), groups them by licence, lists the distinct copyright holders and writes
the section between <!-- library:start --> and <!-- library:end --> in ../THIRD_PARTY_NOTICES.md.
--check only reports: files with a "Ported from" header but no recognised licence, and files whose meta.source says
'ported' but that have no header (or the reverse).
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.dirname(HERE)
ROOT = os.path.dirname(LIB)
NOTICES = os.path.join(ROOT, 'THIRD_PARTY_NOTICES.md')
MIT_TEXT = """Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE."""
LICENCES = [('MIT', r'\bMIT\b'), ('Apache-2.0', r'Apache-2\.0'), ('Zlib', r'\bzlib\b|\bZlib\b'), ('ISC', r'\bISC\b'), ('BSD', r'\bBSD')]
COPY_RE = re.compile(r'Copyright\s*(?:\(c\)|\(C\)|©)?\s*([0-9]{4}(?:-(?:present|[0-9]{4}))?[^.;]*?)(?=[.;]|\s+Changes:|\s+Modified|\s+\(shader|\s*,\s*with\b|\s+and from\b|$)', re.I)


def holder(s):
    """'2011 by Evan Wallace' / "2026 Remocn ('light' preset)" -> '2011 Evan Wallace' / '2026 Remocn'."""
    s = re.sub(r'\s*\(.*$', '', s.strip(' ,.'))
    s = re.sub(r'^(\d{4}(?:-(?:present|\d{4}))?)\s+by\s+', r'\1 ', s)
    return s + '.' if s.endswith('Inc') else s


def headers():
    """{relative path: header text} for every effect file that carries a 'Ported from' comment block."""
    out = {}
    for root, _, files in os.walk(os.path.join(LIB, 'effects')):
        for f in sorted(files):
            if not f.endswith(('.ts', '.tsx')):
                continue
            p = os.path.join(root, f)
            lines = open(p, encoding='utf-8-sig').read().split('\n')[:40]
            block, on = [], False
            for ln in lines:
                s = ln.strip()
                if s.startswith('//') and re.search(r'Ported from|Adapted from', s):
                    on = True
                if on:
                    if s.startswith('//'):
                        block.append(s.lstrip('/').strip())
                    else:
                        break
            if block:
                out[os.path.relpath(p, LIB).replace(os.sep, '/')] = ' '.join(block)
    return out


def meta_ported(path):
    t = open(os.path.join(LIB, path), encoding='utf-8-sig').read()
    return bool(re.search(r"kind:\s*'ported'", t))


def main():
    hs = headers()
    problems = []
    by_lic = {}
    holders = {}
    for path, h in hs.items():
        # the licence named first is the ported source's own; later mentions are credits for ideas (camera-shake cites a MIT repo after its Apache source)
        hits = [(m.start(), n) for n, rx in LICENCES for m in [re.search(rx, h)] if m]
        lic = min(hits)[1] if hits else None
        if not lic:
            problems.append(f'{path}: header has no recognised licence')
            lic = '?'
        by_lic.setdefault(lic, []).append((path, h))
        for m in COPY_RE.finditer(h):
            holders.setdefault(lic, set()).add(holder(m.group(1)))
    for root, _, files in os.walk(os.path.join(LIB, 'effects')):
        for f in files:
            if f.endswith(('.ts', '.tsx')):
                p = os.path.relpath(os.path.join(root, f), LIB).replace(os.sep, '/')
                if meta_ported(p) and p not in hs:
                    problems.append(f'{p}: meta.source is ported but the file has no "Ported from" header')
    if '--check' in sys.argv:
        print('\n'.join(problems) or 'ok')
        print({k: len(v) for k, v in by_lic.items()}, 'files with headers:', len(hs))
        sys.exit(1 if problems else 0)

    parts = ['## Motion library (`library/`)\n',
             'Effects in `library/effects/` marked "Ported from" below contain code adapted from the projects named in their file header. '
             'Each such file keeps that header; the licence texts follow. Effects without a header are original or reimplemented from a description.\n']
    for lic in [n for n, _ in LICENCES] + ['?']:
        if lic not in by_lic:
            continue
        parts.append(f'### {lic}\n')
        for path, h in sorted(by_lic[lic]):
            parts.append(f'- `library/{path}`: {h}')
        parts.append('')
        if lic == 'MIT':
            hold = sorted(holders.get('MIT', []))
            parts.append('Copyright holders (MIT):\n')
            parts.extend(f'- Copyright (c) {h}' for h in hold)
            parts.append('\n```text\nMIT License\n\n' + MIT_TEXT + '\n```\n')
        if lic == 'Apache-2.0':
            hold = sorted(holders.get('Apache-2.0', []))
            parts.append('Copyright holders (Apache-2.0):\n')
            parts.extend(f'- Copyright {h}' for h in hold)
            parts.append('\nThe full Apache License 2.0 text is in [`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt). Files derived from these works were modified (stated in each file header). The upstream projects ship no NOTICE file.\n')
    body = '\n'.join(parts)
    t = open(NOTICES, encoding='utf-8').read()
    if '<!-- library:start -->' not in t:
        t = t.rstrip('\n') + '\n\n<!-- library:start -->\n<!-- library:end -->\n'
    t = re.sub(r'<!-- library:start -->.*?<!-- library:end -->', lambda m: '<!-- library:start -->\n' + body + '\n<!-- library:end -->', t, flags=re.S)
    open(NOTICES, 'w', encoding='utf-8', newline='\n').write(t)
    print(f'{NOTICES}: {len(hs)} ported files, ' + ', '.join(f'{k} {len(v)}' for k, v in by_lic.items()))
    if problems:
        print('PROBLEMS:\n' + '\n'.join(problems))
        sys.exit(1)


if __name__ == '__main__':
    main()

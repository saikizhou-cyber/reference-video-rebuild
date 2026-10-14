"""Static rules for library effects (run before adding an effect, and in CI).

usage: python gallery/lint.py

Checks every file in effects/:
  1. deterministic: no Math.random (incl. GSAP random staggers / RoughEase / ScrambleText), no bare gsap.to (tweens go on the
     paused timeline of core/gsap.ts), no Date, performance.now, setTimeout/setInterval, requestAnimationFrame,
     CSS animation / transition / @keyframes
  2. imports: react, remotion, any @remotion/* package, relative files, and any package declared in ../package.json
     (dependencies / optionalDependencies / peerDependencies). Other libraries (three, gsap, anime.js, d3...) are welcome when they
     earn it: declare them there and in meta.deps. The hard rules are 1 (frame-pure) and licence (copying code), not the framework.
  3. every effect file (not _helpers, not group files) declares `meta` with id / title / category / looks / use / exportName /
     durationInFrames / source, the id is unique and equals the file name, the category equals the folder,
     and exportName is exported from the file
  4. ported source: meta.source.kind 'ported' <=> the file starts with a "// Ported from" header (see notices.py)
  5. every effect is registered in its group file, and every group file is imported by its category index
Exit code 1 when anything is reported.
"""
import json
import os
import re
import sys

LIB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EFFECTS = os.path.join(LIB, 'effects')
CATEGORIES = ['transitions', 'text', 'camera', 'fx', 'shapes', 'timing']
BASE_ALLOWED = ('react', 'remotion')


def declared_packages():
    """Packages the library declares in package.json (beyond react / remotion / @remotion/*)."""
    try:
        pj = json.load(open(os.path.join(LIB, 'package.json'), encoding='utf-8-sig'))
    except OSError:
        return set()
    return {k for sec in ('dependencies', 'optionalDependencies', 'peerDependencies') for k in pj.get(sec, {})}
FORBIDDEN = [
    (r'\bMath\.random\b', 'Math.random'),
    (r'\bDate\.now\b|\bnew Date\b|\bDate\(', 'Date'),
    (r'\bperformance\.now\b', 'performance.now'),
    (r'\bsetTimeout\b|\bsetInterval\b', 'timers'),
    (r'\brequestAnimationFrame\b', 'requestAnimationFrame'),
    (r'@keyframes', '@keyframes'),
    (r'\banimation\s*:|\banimationName\b|\banimationDuration\b', 'CSS animation'),
    (r'\btransition\s*:\s*[\'"`]', 'CSS transition'),
    # GSAP features that call Math.random: every render tab would differ
    (r'from\s*:\s*[\'"]random[\'"]', 'GSAP stagger from random'),
    (r'[\'"`]random\(', 'GSAP random() string value'),
    (r'\bgsap\.utils\.random\b|\butils\.random\(', 'gsap.utils.random'),
    (r'\bRoughEase\b|[\'"]rough\(', 'GSAP RoughEase'),
    (r'\bScrambleTextPlugin\b|\bscrambleText\s*:', 'GSAP ScrambleText'),
    (r'type\s*:\s*[\'"]random[\'"]', 'GSAP CustomWiggle random'),
    # a GSAP tween outside a paused timeline plays on GSAP's own clock
    (r'\bgsap\.(?:to|from|fromTo)\s*\(', 'bare gsap.to/from (put tweens on the paused timeline from useGsapTimeline)'),
]


def strip_comments(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return re.sub(r'(^|[^:])//[^\n]*', r'\1', t)


def main():
    problems = []
    seen = {}
    extra = declared_packages()
    for cat in CATEGORIES:
        folder = os.path.join(EFFECTS, cat)
        files = sorted(f for f in os.listdir(folder) if f.endswith(('.ts', '.tsx')))
        groups = {}
        index = open(os.path.join(folder, 'index.ts'), encoding='utf-8-sig').read() if 'index.ts' in files else ''
        for f in files:
            p = os.path.join(folder, f)
            raw = open(p, encoding='utf-8-sig').read()
            code = strip_comments(raw)
            rel = f'{cat}/{f}'
            for rx, name in FORBIDDEN:
                m = re.search(rx, code)
                if m:
                    ln = code[:m.start()].count('\n') + 1
                    problems.append(f'{rel}: forbidden {name} (about line {ln})')
            for m in re.finditer(r'''(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]''', code):
                mod = m.group(1)
                if mod.startswith('.'):
                    continue
                pkg = '/'.join(mod.split('/')[:2]) if mod.startswith('@') else mod.split('/')[0]
                if pkg in BASE_ALLOWED or pkg.startswith('@remotion/') or pkg in extra:
                    continue
                problems.append(f'{rel}: package {pkg!r} is not declared in package.json (add it there, and to meta.deps, if the effect needs it)')
            if f.startswith('_') or f == 'index.ts':
                continue
            if not f.endswith('.tsx') and not f.endswith('.ts'):
                continue
            if re.fullmatch(r'[a-z]+\.ts', f) and 'Group' in raw and 'LibraryEntry[]' in raw:
                groups[f[:-3]] = raw
                continue
            # an effect file
            ids = re.findall(r"""meta:\s*\{\s*id:\s*'([^']+)'""", raw)
            if not ids:
                problems.append(f'{rel}: no `meta: {{ id: ... }}` (LibraryEntry) found')
                continue
            for eid in ids:
                if eid in seen:
                    problems.append(f'{rel}: duplicate id {eid!r} (also in {seen[eid]})')
                seen[eid] = rel
            stem = f.rsplit('.', 1)[0]
            if stem not in ids:
                problems.append(f'{rel}: no meta id equals the file name {stem!r} (ids: {ids})')
            for field in ('title', 'looks', 'use', 'exportName', 'durationInFrames', 'source'):
                if not re.search(rf'\b{field}\s*:', raw):
                    problems.append(f'{rel}: meta lacks {field}')
            cm = re.findall(r"category:\s*'([a-z]+)'", raw)
            if not cm or any(c != cat for c in cm):
                problems.append(f'{rel}: category {cm} does not match folder {cat!r}')
            for en in re.findall(r"exportName:\s*'([^']+)'", raw):
                if not re.search(rf'export\s+(?:const|function|class)\s+{re.escape(en)}\b|export\s*\{{[^}}]*\b{re.escape(en)}\b', raw):
                    problems.append(f'{rel}: exportName {en!r} is not exported')
            ported = bool(re.search(r"kind:\s*'ported'", raw))
            header = bool(re.search(r'^\s*//\s*(Ported|Adapted) from', '\n'.join(raw.split('\n')[:40]), re.M))
            if ported != header:
                problems.append(f'{rel}: meta.source ported={ported} but "Ported from" header={header}')
            # registered?
            registered = any(re.search(rf'\b{re.escape(stem)}\b', g) or re.search(rf"from\s+'\./{re.escape(stem)}'", g) for g in groups.values()) if groups else None
            entry_names = re.findall(r'export\s+const\s+(\w+Entry|\w+)\s*:\s*LibraryEntry\b', raw)
            if not entry_names:
                problems.append(f'{rel}: no exported LibraryEntry')
        # registration is checked after the folder is read (group files may sort after effects)
        for f in files:
            if f.startswith('_') or f == 'index.ts' or f in [g + '.ts' for g in groups]:
                continue
            raw = open(os.path.join(folder, f), encoding='utf-8-sig').read()
            if not re.search(r'LibraryEntry\b', raw):
                continue
            stem = f.rsplit('.', 1)[0]
            names = re.findall(r'export\s+const\s+(\w+)\s*:\s*LibraryEntry\b', raw)
            for n in names:
                if not any(re.search(rf'\b{re.escape(n)}\b', g) for g in groups.values()):
                    problems.append(f'{cat}/{f}: {n} is not registered in any group file of {cat}')
        for g in groups:
            if not re.search(rf"from\s+'\./{re.escape(g)}'", index):
                problems.append(f'{cat}/index.ts does not import group {g!r}')
    n = len(seen)
    print(f'{n} effects checked')
    print('\n'.join(problems) if problems else 'ok')
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()

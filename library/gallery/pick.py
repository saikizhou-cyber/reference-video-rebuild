"""Copy only the effects you use (plus what they import) into your project.

usage: python gallery/pick.py <id,id,...> --to <dir> [--lib <library dir>] [--dry]

  python $SKILL/library/gallery/pick.py slam-text,impact-cut,glow,place,beats --to src/s17

Ids are effect file names (effects/<category>/<id>.tsx) or core helpers that no effect imports: place (<Place>), beats (transitionPlan).
Copies each effect file, every local file it imports (core/ parts, the _*-utils helpers of its folder), keeps the library layout
under <dir> (so core/ and effects/<category>/ stay side by side and the relative imports keep working) and prints the npm
packages the picked files need beyond react / remotion. Group files and index.ts (the library's own registry) are not copied,
so a project never pulls in effects it does not use, and `gsap` is only needed when a picked effect imports it.
"""
import argparse
import os
import re
import shutil
import sys

LIB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMPORT = re.compile(r"""(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]""")
EXTS = ('.ts', '.tsx', '/index.ts', '/index.tsx')


def resolve(base_file, spec):
    base = os.path.normpath(os.path.join(os.path.dirname(base_file), spec))
    for e in ('',) + EXTS:
        p = base + e
        if os.path.isfile(p):
            return p
    return None


def find_effect(lib, eid):
    for root, _, files in os.walk(os.path.join(lib, 'effects')):
        if eid + '.tsx' in files:
            return os.path.join(root, eid + '.tsx')
    # core-only helpers no effect imports (core/place.tsx, core/beats.ts, ...) can be named too: `place`, `beats`, `core/beats`
    name = eid[5:] if eid.startswith('core/') else eid
    for ext in ('.tsx', '.ts'):
        if os.path.isfile(os.path.join(lib, 'core', name + ext)):
            return os.path.join(lib, 'core', name + ext)
    sys.exit(f'no effect with id {eid!r} (ids are the file names in effects/<category>/; core helpers: place, beats, ...)')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('ids')
    ap.add_argument('--to', required=True)
    ap.add_argument('--lib', default=LIB)
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()
    lib = os.path.abspath(a.lib)
    todo = [find_effect(lib, i.strip()) for i in a.ids.split(',') if i.strip()]
    seen, packages = set(), set()
    while todo:
        f = todo.pop()
        if f in seen:
            continue
        seen.add(f)
        src = open(f, encoding='utf-8-sig').read()
        for m in IMPORT.finditer(src):
            spec = m.group(1) or m.group(2)
            if spec.startswith('.'):
                r = resolve(f, spec)
                if not r:
                    sys.exit(f'{os.path.relpath(f, lib)}: cannot resolve {spec!r}')
                todo.append(r)
            elif spec not in ('react', 'remotion') and not spec.startswith('react/'):
                packages.add('/'.join(spec.split('/')[:2]) if spec.startswith('@') else spec.split('/')[0])
    for f in sorted(seen):
        rel = os.path.relpath(f, lib)
        print(('would copy ' if a.dry else 'copy ') + rel)
        if not a.dry:
            dst = os.path.join(a.to, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(f, dst)
    try:
        import json
        declared = json.load(open(os.path.join(lib, 'package.json'), encoding='utf-8-sig'))
        versions = {**declared.get('devDependencies', {}), **declared.get('dependencies', {}), **declared.get('optionalDependencies', {})}
    except OSError:
        versions = {}
    if packages:
        print('needs npm packages: ' + ' '.join(f'{p}@{versions[p]}' if p in versions else p for p in sorted(packages)))
    else:
        print('needs nothing beyond react and remotion')
    print(f'{len(seen)} file(s) -> {a.to}')


if __name__ == '__main__':
    main()

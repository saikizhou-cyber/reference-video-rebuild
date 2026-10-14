"""Rewrite the catalog of library/README.md from gallery/previews.mjs output.

usage: python gallery/catalog.py <previews_dir> [README.md] [--zh translations.json]

Writes catalog/<category>.md next to the README (the category's contact sheet previews/<category>.jpg and a table: id,
what you see, when to use [+ traps], export and props, source), and replaces everything between <!-- catalog:start -->
and <!-- catalog:end --> in the README with a short index that links to them, so a reader opens only the category it needs.
--zh renders the Chinese version: translations.json maps effect id -> {"title", "looks", "use"[, "notes"]} (see the Chinese package).
"""
import argparse
import json
import os
import re
import sys

ORDER = ['transitions', 'text', 'camera', 'fx', 'shapes', 'timing']
TITLES = {
    'en': {
        'transitions': 'Transitions',
        'text': 'Kinetic type',
        'camera': 'Camera',
        'fx': 'Post FX and hits',
        'shapes': 'Shapes and HUD',
        'timing': 'Edit timing',
    },
    'zh': {
        'transitions': '转场',
        'text': '动态字',
        'camera': '镜头',
        'fx': '后期与打击',
        'shapes': '图形与 HUD',
        'timing': '剪辑节奏',
    },
}
TEXT = {
    'en': {
        'intro': "{n} effects in {c} categories. Open a category file for what each effect looks like, when to use it, its props, its traps and its source, under the category's contact sheet (each row shows six frames of the effect's gallery demo). An effect's id is its file name in `effects/<category>/`.\n",
        'index_header': ('category file', 'effects (id and name)'),
        'back': 'Back to the [library README](../README.md).\n',
        'colon': ':',
        'header': ('id', 'what you see', 'when to use', 'export and props', 'source'),
        'original': 'original',
        'ported': 'ported ({license})',
        'inspired': 'own code, idea only',
        'needs': 'needs',
        'watch': 'watch out',
    },
    'zh': {
        'intro': '共 {n} 个特效，分 {c} 类。打开分类文件可以看到每个特效的画面、用法、参数、注意事项和来源，文件开头是该类的总览图（每行是一个特效演示的六帧）。特效的 id 就是 `effects/<分类>/` 里的文件名。\n',
        'index_header': ('分类文件', '特效（id 和名称）'),
        'back': '回到[特效库说明](../README.md)。\n',
        'colon': '：',
        'header': ('id', '画面上发生什么', '什么时候用', '导出名和参数', '来源'),
        'original': '原创',
        'ported': '移植（{license}）',
        'inspired': '自写，只借思路',
        'needs': '另需',
        'watch': '注意',
    },
}


LIB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIELD = re.compile(r'^\t([A-Za-z_]\w*)(\??):', re.M)


def props_of(eid, export_name, limit=14):
    """Field names of the effect's exported Props type, optional ones marked with ?  ('' when it has none)."""
    path = next((os.path.join(r, eid + '.tsx') for r, _, f in os.walk(os.path.join(LIB, 'effects')) if eid + '.tsx' in f), None)
    if not path:
        return ''
    src = open(path, encoding='utf-8-sig').read()
    want = export_name[:1].upper() + export_name[1:] + 'Props'
    m = re.search(r'export type ' + re.escape(want) + r'\s*=\s*\{', src) or re.search(r'export type \w+Props\s*=\s*\{', src)
    if not m:
        return ''
    body = src[m.end():]
    end = body.find('\n};')
    body = body[:end] if end >= 0 else body
    names = [n + q for n, q in FIELD.findall(body) if n not in ('children', 'style')]
    return ', '.join(names[:limit]) + (', ...' if len(names) > limit else '')


def cell(s):
    return str(s).replace('|', '\\|').replace('\n', ' ').strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('previews')
    ap.add_argument('readme', nargs='?', default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'README.md'))
    ap.add_argument('--zh', help='translations.json (id -> title/looks/use); renders the Chinese catalog')
    a = ap.parse_args()
    lang = 'zh' if a.zh else 'en'
    tr = json.load(open(a.zh, encoding='utf-8-sig')) if a.zh else {}
    t = TEXT[lang]
    index = json.load(open(os.path.join(a.previews, 'index.json'), encoding='utf-8-sig'))
    by = {}
    for eid, e in index.items():
        m = dict(e['meta'])
        if a.zh:
            if eid not in tr:
                sys.exit(f'no translation for {eid}')
            m.update({k: tr[eid][k] for k in ('title', 'looks', 'use')})
            if m.get('notes'):
                if 'notes' not in tr[eid]:
                    sys.exit(f'no translation for notes of {eid}')
                m['notes'] = tr[eid]['notes']
        by.setdefault(m.get('category', 'other'), []).append(m)

    def source(src):
        k = src.get('kind')
        if k == 'ported':
            return t['ported'].format(name=cell(src['name']), url=src['url'], license=cell(src['license']))
        if k == 'inspired':
            return t['inspired'].format(name=cell(src['name']), url=src['url'])
        return t['original']

    total = sum(len(v) for v in by.values())
    cats = [c for c in ORDER if c in by]
    cat_dir = os.path.join(os.path.dirname(os.path.abspath(a.readme)), 'catalog')
    os.makedirs(cat_dir, exist_ok=True)
    index_rows = []
    for cat in cats:
        rows = sorted(by[cat], key=lambda m: m['id'])
        head = f'{TITLES[lang].get(cat, cat)}（{len(rows)}）' if lang == 'zh' else f'{TITLES[lang].get(cat, cat)} ({len(rows)})'
        parts = [f'# {head}\n', t['back'], f'![{cat}](../previews/{cat}.jpg)\n']
        h = t['header']
        parts.append(f'| {h[0]} | {h[1]} | {h[2]} | {h[3]} | {h[4]} |')
        parts.append('|---|---|---|---|---|')
        for m in rows:
            title = f'**{cell(m["title"])}**：' if a.zh else ''
            needs = ''.join(f'<br>{t["needs"]} `{d}`' for d in m.get('deps', []))
            watch = f'<br>**{t["watch"]}{t["colon"]}** {cell(m["notes"])}' if m.get('notes') else ''
            props = props_of(m['id'], m.get('exportName', ''))
            props = f'<br><sub>{cell(props)}</sub>' if props else ''
            parts.append(f'| `{m["id"]}` | {title}{cell(m.get("looks", ""))} | {cell(m.get("use", ""))}{watch} | `{m.get("exportName", "")}`{props}{needs} | {source(m.get("source", {}))} |')
        open(os.path.join(cat_dir, cat + '.md'), 'w', encoding='utf-8', newline='\n').write('\n'.join(parts) + '\n')
        names = ' · '.join(f'`{m["id"]}` {cell(m["title"])}' for m in rows)
        index_rows.append(f'| [{head}](catalog/{cat}.md) | {names} |')
    ih = t['index_header']
    body = '\n'.join([t['intro'].format(n=total, c=len(cats)), f'| {ih[0]} | {ih[1]} |', '|---|---|'] + index_rows + [''])
    text = open(a.readme, encoding='utf-8').read()
    new, n = re.subn(r'<!-- catalog:start -->.*?<!-- catalog:end -->', lambda mo: '<!-- catalog:start -->\n' + body + '\n<!-- catalog:end -->', text, flags=re.S)
    if not n:
        sys.exit(f'{a.readme}: catalog markers not found')
    open(a.readme, 'w', encoding='utf-8', newline='\n').write(new)
    print(f'{a.readme}: index of {total} effects; {len(cats)} files in {cat_dir} ({lang})')


if __name__ == '__main__':
    main()

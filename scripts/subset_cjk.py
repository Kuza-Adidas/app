"""Собирает компактные WOFF2 с китайскими шрифтами только из тех иероглифов, что есть на сайте.

Исходники — пакеты @fontsource/ma-shan-zheng и @fontsource/zcool-qingke-huangyou
(разбиты на сотни кусков по unicode-range). Запуск:
  npm i --no-save @fontsource/ma-shan-zheng @fontsource/zcool-qingke-huangyou
  pip install fonttools brotli
  python3 scripts/subset_cjk.py
"""
import glob, os, re, sys
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.merge import Merger

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = ['src', 'scripts', 'data']
CJK = re.compile(r'[　-〿一-鿿＀-￯]')

chars = set()
for base in SOURCES:
    for path in glob.glob(os.path.join(ROOT, base, '**', '*'), recursive=True):
        if os.path.isfile(path) and path.endswith(('.js', '.mjs', '.json', '.css', '.html', '.py')):
            chars |= set(CJK.findall(open(path, encoding='utf-8').read()))
chars |= set('好吃辣甜面零食饮料')
print('иероглифов:', len(chars), ''.join(sorted(chars)))

def build(pkg, prefix, out):
    files = sorted(glob.glob(os.path.join(ROOT, 'node_modules', '@fontsource', pkg, 'files', f'{prefix}-*-400-normal.woff2')))
    if not files:
        sys.exit(f'нет пакета @fontsource/{pkg}')
    parts = []
    need = {ord(c) for c in chars}
    for i, f in enumerate(files):
        font = TTFont(f)
        have = need & set(font.getBestCmap().keys())
        if not have:
            continue
        opts = subset.Options(); opts.flavor = None; opts.layout_features = []; opts.hinting = False
        opts.notdef_outline = True; opts.name_IDs = ['*']; opts.glyph_names = False
        sub = subset.Subsetter(opts); sub.populate(unicodes=have); sub.subset(font)
        tmp = os.path.join('/tmp', f'cjk-part-{pkg}-{i}.ttf'); font.save(tmp); parts.append(tmp)
        need -= have
    merged = Merger().merge(parts) if len(parts) > 1 else TTFont(parts[0])
    merged.flavor = 'woff2'
    merged.save(os.path.join(ROOT, 'src/assets/fonts', out))
    print(out, os.path.getsize(os.path.join(ROOT, 'src/assets/fonts', out)), 'байт; не найдено:', ''.join(chr(c) for c in need))

build('ma-shan-zheng', 'ma-shan-zheng', 'ma-shan-zheng-subset.woff2')
build('zcool-qingke-huangyou', 'zcool-qingke-huangyou', 'zcool-qingke-subset.woff2')

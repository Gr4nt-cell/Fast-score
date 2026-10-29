"""Builds data/leagues.json: every competition Flashscore covers, per sport and country.

Flashscore's left menu lists countries by slug; each country's competitions come from
/x/req/m_{sport}_{countryId}. Country ids aren't on the sport page, so the usual ids (1-400) are
tried directly and any country still missing is looked up on its own page.
"""
import json, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
WEB = 'https://www.flashscore.com'
SPORTS = {  # our key: (flashscore sport id, url path)
    'soccer': (1, 'football'), 'tennis': (2, 'tennis'), 'basketball': (3, 'basketball'), 'hockey': (4, 'hockey'),
    'football': (5, 'american-football'), 'baseball': (6, 'baseball'), 'rugby': (8, 'rugby-union'), 'volleyball': (12, 'volleyball'),
}

def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'x-fsign': 'SW9D1eZo', 'Referer': WEB + '/'})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode('utf8', 'ignore')
        except Exception:
            time.sleep(1 + i)
    return ''

def parse_menu(text):
    recs = [dict(f.split('÷', 1) for f in r.split('¬') if '÷' in f) for r in text.split('~')]
    head = recs[0] if recs else {}
    leagues = [{'name': r['MN'], 'slug': r.get('MU', ''), 'tpl': r.get('MTI') or r.get('MT', '').split('_')[-1]} for r in recs if r.get('MN')]
    return head.get('MC'), head.get('ML'), leagues

out = {'generated': int(time.time()), 'sports': {}}
for key, (sid, path) in SPORTS.items():
    page = get(f'{WEB}/{path}/')
    names = {}
    for slug, name in re.findall(r'<a href="/%s/([a-z0-9\-]+)/">([^<]+)</a>' % re.escape(path), page):
        names.setdefault(slug, name.strip())
    top = re.search(r'cjs\.defaultTopLeagues\s*=\s*(\[[^\]]*\])', page)
    top = [x for x in (json.loads(top.group(1)) if top else []) if x.startswith(f'{sid}_')]
    countries = {}
    def probe(cid):
        t = get(f'{WEB}/x/req/m_{sid}_{cid}', tries=2)
        if '÷' not in t:
            return None
        c, slug, leagues = parse_menu(t)
        return (int(c or cid), slug, leagues) if leagues else None
    with ThreadPoolExecutor(8) as ex:
        for res in ex.map(probe, range(1, 401)):
            if res:
                cid, slug, leagues = res
                countries[slug] = {'id': cid, 'slug': slug, 'name': names.get(slug) or slug.replace('-', ' ').title(), 'leagues': leagues}
    # countries/categories the id sweep didn't reach (e.g. tennis tours): read their page
    missing = [s for s in names if s not in countries]
    def by_page(slug):
        h = get(f'{WEB}/{path}/{slug}/')
        m = re.search(r'country_id\s*=\s*"?(\d+)', h)
        if not m:
            return None
        r = probe(m.group(1))
        return (slug, r) if r else None
    with ThreadPoolExecutor(6) as ex:
        for res in ex.map(by_page, missing):
            if res:
                slug, (cid, s2, leagues) = res
                countries[slug] = {'id': cid, 'slug': slug, 'name': names.get(slug, slug), 'leagues': leagues}
    lst = sorted(countries.values(), key=lambda c: c['name'].lower())
    out['sports'][key] = {'path': path, 'sid': sid, 'top': top, 'countries': lst}
    print(key, len(lst), 'countries', sum(len(c['leagues']) for c in lst), 'competitions', 'missing', len([s for s in names if s not in countries]), file=sys.stderr)

json.dump(out, open(sys.argv[1] if len(sys.argv) > 1 else 'leagues.json', 'w'), separators=(',', ':'), ensure_ascii=False)

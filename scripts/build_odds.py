"""Builds odds.json: MSport Ghana's prices for every upcoming match, compacted for the app.

MSport's website lists matches 50 at a time per request (with a lastEventId to continue), so
collecting a whole sport takes ~25 requests: too slow for the phone, so it runs here every few
minutes and the app downloads one small file.
"""
import json, sys, time, urllib.request

UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
MS = 'https://www.msport.com/api/gh/facts-center/query/frontend'
SPORTS = {'soccer': 1, 'basketball': 2, 'tennis': 5, 'hockey': 4, 'football': 16, 'baseball': 3, 'rugby': 12, 'volleyball': 23}
KEEP = {1, 10, 18, 29, 11, 219, 186, 406, 251, 340, 202}  # 1X2, double chance, O/U, GG/NG, DNB, winners

def req(path, body=None):
    for i in range(3):
        try:
            r = urllib.request.Request(MS + path, data=json.dumps(body).encode() if body is not None else None,
                                       headers={'User-Agent': UA, 'operId': '3', 'Accept': 'application/json', 'Content-Type': 'application/json'},
                                       method='POST' if body is not None else 'GET')
            j = json.loads(urllib.request.urlopen(r, timeout=40).read())
            if j.get('bizCode') == 10000:
                return j.get('data')
        except Exception as e:
            print('retry', path[:80], e, file=sys.stderr)
        time.sleep(1 + i)
    return None

def collect(d, out):
    if isinstance(d, dict):
        if d.get('eventId') and d.get('homeTeam'):
            out[d['eventId']] = d
        else:
            for v in d.values():
                if isinstance(v, (dict, list)): collect(v, out)
    elif isinstance(d, list):
        for v in d: collect(v, out)
    return out

def tournament_ids(d):
    ids = []
    def walk(x):
        if isinstance(x, dict):
            if x.get('tournamentId'): ids.append(x['tournamentId'])
            for v in x.values(): walk(v)
        elif isinstance(x, list):
            for v in x: walk(v)
    walk(d)
    return list(dict.fromkeys(ids))

def compact(e):
    mks = []
    for m in e.get('markets') or []:
        if m.get('id') not in KEEP and m.get('id') != 18: continue
        spec = m.get('specifiers') or ''
        if m.get('id') == 18 and not any(f'total={x}' in spec for x in ('1.5', '2.5', '3.5')): continue
        outs = [[o.get('description'), float(o['odds'])] for o in m.get('outcomes') or [] if o.get('isActive') != 0 and o.get('odds')]
        if not outs: continue
        name = '1X2' if m.get('name') == '1x2' else m.get('name')
        if 'total=' in spec: name += ' ' + spec.split('total=')[1].split('|')[0]
        mks.append([m.get('id'), name, outs])
    if not mks: return None
    return [e['eventId'], e['homeTeam'], e['awayTeam'], e.get('startTime'), e.get('category') or '', e.get('tournament') or '', 1 if e.get('status') == 1 else 0, mks]

out = {'t': int(time.time() * 1000), 'sports': {}}
for sport, sid in SPORTS.items():
    s = f'sr:sport:{sid}'
    ev = {}
    for p in (f'/all-matches/today?sportId={s}', f'/all-matches/top-league?sportId={s}', f'/live-matches/list?sportId={s}'):
        collect(req(p), ev)
    ids = tournament_ids(req(f'/all-matches/countries?sportId={s}'))
    pages = 0
    for i in range(0, len(ids), 120):
        chunk, last, seen_last = ids[i:i + 120], None, set()
        for _ in range(40):
            q = f'/sports-matches-list?sportId={s}' + (f'&lastEventId={last}' if last else '')
            d = req(q, chunk)
            pages += 1
            if not d: break
            before = len(ev)
            collect(d.get('events'), ev); collect(d.get('tournaments'), ev)
            last = d.get('lastEventId')
            if not last or last in seen_last or len(ev) == before: break
            seen_last.add(last)
    rows = [c for c in (compact(e) for e in ev.values()) if c]
    out['sports'][sport] = rows
    print(sport, 'tournaments', len(ids), 'pages', pages, 'events', len(ev), 'with odds', len(rows), file=sys.stderr)

json.dump(out, open(sys.argv[1] if len(sys.argv) > 1 else 'odds.json', 'w'), separators=(',', ':'), ensure_ascii=False)

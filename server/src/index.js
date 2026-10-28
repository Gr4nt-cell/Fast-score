// Fast Score API — runs on Cloudflare Workers (free plan) with a D1 database.
//
// Every minute a timer copies ESPN's scoreboards into D1: competitions with games in play are
// refreshed every run, the rest in rotation. Only what changed is written, which keeps the
// free plan's daily write allowance intact. Finished games stay in the database, so history
// builds up for the prediction model.
//
// Endpoints (all JSON, open CORS):
//   GET /v1/day?sport=soccer&date=YYYYMMDD&tz=<minutes, as Date#getTimezoneOffset>
//       every event of a sport on the caller's local day, grouped by competition,
//       in ESPN's own event format
//   GET /v1/results?sport=soccer&league=eng.1&days=60   finished games, compact
//   GET /v1/status                                       what the database holds
//   GET /apis/v2/sports/{sport}/{league}/standings       stored table (refreshed every few hours)
//   GET /apis/...                                         any other ESPN path, cached at the edge
import { SPORTS } from '../../src/sports.js';

const HOSTS = ['https://site.web.api.espn.com', 'https://site.api.espn.com'];
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const LEAGUES = SPORTS.flatMap((s) => s.leagues.map((l) => ({ sport: s.key, league: l.slug, name: l.name, multiDay: !!s.multiDay })));

// ---------- helpers ----------

const ymd = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
};

async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function espnText(env, path) {
  const hosts = env.ESPN_BASE ? [env.ESPN_BASE] : path.startsWith('/apis/common') ? [HOSTS[0]] : HOSTS;
  let last;
  for (const h of hosts) {
    try {
      const res = await fetch(h + path, { headers: { Accept: 'application/json', 'User-Agent': 'FastScore/1.0' } });
      if (res.ok) return await res.text();
      last = new Error(`ESPN ${res.status}`);
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error('ESPN unreachable');
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

function json(body, maxAge = 0, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store', ...cors },
  });
}

// drop the bulky parts of an ESPN event the app never reads
function trim(e) {
  delete e.links;
  delete e.weather;
  (e.competitions || []).forEach((c) => {
    delete c.headlines;
    delete c.leaders;
    delete c.geoBroadcasts;
    delete c.tickets;
    (c.competitors || []).forEach((x) => {
      if (x.team) delete x.team.links;
      if (x.athlete) delete x.athlete.links;
      delete x.leaders;
    });
  });
  return e;
}

function eventState(e) {
  const s = (e.status && e.status.type) || (e.competitions && e.competitions[0] && e.competitions[0].status && e.competitions[0].status.type) || {};
  // tennis/golf: one event holds many matches; it's live if any of them is
  if (e.groupings) {
    for (const g of e.groupings) for (const c of g.competitions || []) if (c.status && c.status.type && c.status.type.state === 'in') return 'in';
  }
  return s.state || 'pre';
}

// ---------- sync (cron) ----------

async function syncBoard(env, job, now) {
  const { sport, league, day } = job;
  const text = await espnText(env, `/apis/site/v2/sports/${sport}/${league}/scoreboard?dates=${day}&limit=300`);
  const key = `${sport}/${league}/${day}`;
  const h = await sha(text);
  if (job.hash === h) {
    // unchanged: note the check only now and then, to save writes
    if (!job.checked_at || now - job.checked_at > 10 * MIN || job.live) {
      await env.DB.prepare('UPDATE boards SET checked_at=? WHERE key=?').bind(now, key).run();
    }
    return { key, changed: 0 };
  }
  const data = JSON.parse(text);
  const lg = (data.leagues && data.leagues[0]) || {};
  const events = data.events || [];
  let live = 0;
  let pending = 0;
  let nextKo = null;
  const rows = [];
  for (const e of events) {
    const state = eventState(e);
    const start = Date.parse(e.date) || now;
    const end = e.endDate ? Date.parse(e.endDate) : null;
    if (state === 'in') live++;
    if (state !== 'post') pending++;
    if (state === 'pre' && start > now - 3 * HOUR && (nextKo == null || start < nextKo)) nextKo = start;
    const body = JSON.stringify(trim(e));
    rows.push({ id: `${sport}/${league}/${e.id}`, start, end, state, body, hash: await sha(body) });
  }
  // only write events that actually changed
  const existing = new Map();
  for (let i = 0; i < rows.length; i += 90) {
    const ids = rows.slice(i, i + 90).map((r) => r.id);
    const q = await env.DB.prepare(`SELECT id, hash FROM events WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    (q.results || []).forEach((r) => existing.set(r.id, r.hash));
  }
  const stmts = rows
    .filter((r) => existing.get(r.id) !== r.hash)
    .map((r) =>
      env.DB.prepare(
        `INSERT INTO events (id, sport, league, start_ts, end_ts, state, hash, updated, data) VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET start_ts=excluded.start_ts, end_ts=excluded.end_ts, state=excluded.state, hash=excluded.hash, updated=excluded.updated, data=excluded.data`
      ).bind(r.id, sport, league, r.start, r.end, r.state, r.hash, now, r.body)
    );
  stmts.push(
    env.DB.prepare(
      `INSERT INTO boards (key, sport, league, day, hash, checked_at, changed_at, live, next_ko, pending, league_name, league_logo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(key) DO UPDATE SET hash=excluded.hash, checked_at=excluded.checked_at, changed_at=excluded.changed_at, live=excluded.live, next_ko=excluded.next_ko, pending=excluded.pending,
       league_name=COALESCE(excluded.league_name, boards.league_name), league_logo=COALESCE(excluded.league_logo, boards.league_logo)`
    ).bind(key, sport, league, day, h, now, now, live, nextKo, pending, lg.name || lg.shortName || null, (lg.logos && lg.logos[0] && lg.logos[0].href) || null)
  );
  await env.DB.batch(stmts);
  return { key, changed: stmts.length - 1, live };
}

async function syncStandings(env, sport, league, now) {
  const text = await espnText(env, `/apis/v2/sports/${sport}/${league}/standings`);
  await env.DB.prepare('INSERT INTO standings (key, updated, data) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET updated=excluded.updated, data=excluded.data')
    .bind(`${sport}/${league}`, now, text)
    .run();
}

/** Decide what to fetch this minute, most urgent first, within the download budget. */
async function plan(env, now) {
  const today = ymd(now);
  const days = [
    { day: today, every: 20 * MIN, rank: 2 },
    { day: ymd(now + 24 * HOUR), every: 2 * HOUR, rank: 3 },
    { day: ymd(now - 24 * HOUR), every: 2 * HOUR, rank: 3 },
    { day: ymd(now + 48 * HOUR), every: 12 * HOUR, rank: 4 },
    { day: ymd(now + 72 * HOUR), every: 12 * HOUR, rank: 4 },
    { day: ymd(now - 48 * HOUR), every: 24 * HOUR, rank: 5 },
  ];
  const known = await env.DB.prepare(`SELECT key, hash, checked_at, live, next_ko, pending FROM boards WHERE day IN (${days.map(() => '?').join(',')})`)
    .bind(...days.map((d) => d.day))
    .all();
  const byKey = new Map((known.results || []).map((r) => [r.key, r]));
  const jobs = [];
  for (const l of LEAGUES) {
    for (const d of l.multiDay ? days.slice(0, 1) : days) {
      const key = `${l.sport}/${l.league}/${d.day}`;
      const b = byKey.get(key) || {};
      const hot = b.live > 0 || (b.pending > 0 && b.next_ko != null && b.next_ko <= now + 10 * MIN && b.next_ko > now - 4 * HOUR);
      const due = !b.checked_at || now - b.checked_at >= (hot ? 0 : d.every);
      if (!due) continue;
      jobs.push({ sport: l.sport, league: l.league, day: d.day, hash: b.hash, checked_at: b.checked_at, live: b.live, rank: hot ? 0 : b.checked_at ? d.rank : 1, age: b.checked_at || 0 });
    }
  }
  jobs.sort((a, b) => a.rank - b.rank || a.age - b.age);
  return jobs;
}

async function runSync(env) {
  const now = Date.now();
  const budget = Number(env.MAX_FETCH || 14);
  const jobs = await plan(env, now);
  const take = jobs.slice(0, Math.max(1, budget - 1));
  const out = [];
  for (const j of take) {
    try {
      out.push(await syncBoard(env, j, now));
    } catch (e) {
      out.push({ key: `${j.sport}/${j.league}/${j.day}`, error: String(e.message || e) });
    }
  }
  // one table per run: the stalest, sooner for competitions whose games just finished
  try {
    const st = await env.DB.prepare('SELECT key, updated FROM standings').all();
    const seen = new Map((st.results || []).map((r) => [r.key, r.updated]));
    const changed = await env.DB.prepare('SELECT sport, league, MAX(changed_at) AS c FROM boards WHERE changed_at > ? GROUP BY sport, league').bind(now - 6 * HOUR).all();
    const recent = new Map((changed.results || []).map((r) => [`${r.sport}/${r.league}`, r.c]));
    let pick = null;
    let best = -1;
    for (const l of LEAGUES) {
      const k = `${l.sport}/${l.league}`;
      const u = seen.get(k) || 0;
      const stale = now - u;
      const score = !u ? 1e15 : (recent.get(k) || 0) > u && stale > 30 * MIN ? 1e12 + stale : stale > 6 * HOUR ? stale : -1;
      if (score > best) {
        best = score;
        pick = l;
      }
    }
    if (pick && best > 0) await syncStandings(env, pick.sport, pick.league, now);
  } catch (e) {
    out.push({ standings: String(e.message || e) });
  }
  return { at: new Date(now).toISOString(), pending: jobs.length, done: out };
}

// ---------- API ----------

async function dayEndpoint(env, url) {
  const sport = url.searchParams.get('sport') || 'soccer';
  const date = url.searchParams.get('date') || ymd(Date.now());
  const tz = Number(url.searchParams.get('tz') || 0); // minutes, like Date#getTimezoneOffset
  const start = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8))) + tz * MIN;
  const end = start + 24 * HOUR;
  const now = Date.now();
  const sp = SPORTS.find((s) => s.key === sport);
  if (!sp) return json({ error: 'unknown sport' }, 0, 400);
  const q = sp.multiDay
    ? env.DB.prepare(
        `SELECT league, data FROM events WHERE sport=? AND start_ts < ? AND (COALESCE(end_ts, start_ts + 86400000) >= ? OR (state='in' AND start_ts > ?)) ORDER BY start_ts`
      ).bind(sport, end, start, now - 7 * 24 * HOUR)
    : env.DB.prepare(`SELECT league, data FROM events WHERE sport=? AND ((start_ts >= ? AND start_ts < ?) OR (state='in' AND start_ts > ? AND ? > ?)) ORDER BY start_ts`).bind(
        sport,
        start,
        end,
        now - 6 * HOUR,
        end,
        now
      );
  const [rows, meta, fresh] = await Promise.all([
    q.all(),
    env.DB.prepare('SELECT league, MAX(league_name) AS name, MAX(league_logo) AS logo FROM boards WHERE sport=? AND league_name IS NOT NULL GROUP BY league').bind(sport).all(),
    env.DB.prepare(`SELECT MIN(checked_at) AS oldest, MAX(checked_at) AS newest FROM boards WHERE sport=? AND day=?`).bind(sport, date).first(),
  ]);
  const info = new Map((meta.results || []).map((r) => [r.league, r]));
  const groups = new Map();
  for (const r of rows.results || []) {
    if (!groups.has(r.league)) groups.set(r.league, []);
    groups.get(r.league).push(r.data); // raw JSON text: no parsing, keeps CPU low
  }
  const order = sp.leagues.map((l) => l.slug);
  const parts = [...groups.keys()]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((slug) => {
      const m = info.get(slug) || {};
      const league = JSON.stringify({ slug, name: m.name || null, logo: m.logo || null });
      return `{"league":${league},"events":[${groups.get(slug).join(',')}]}`;
    });
  const body = `{"source":"fastscore","sport":${JSON.stringify(sport)},"date":${JSON.stringify(date)},"checked":${JSON.stringify(fresh || {})},"groups":[${parts.join(',')}]}`;
  return json(body, 15);
}

async function resultsEndpoint(env, url) {
  const sport = url.searchParams.get('sport') || 'soccer';
  const league = url.searchParams.get('league');
  const days = Math.min(Number(url.searchParams.get('days') || 60), 400);
  if (!league) return json({ error: 'league required' }, 0, 400);
  const rows = await env.DB.prepare(`SELECT data FROM events WHERE sport=? AND league=? AND state='post' AND start_ts > ? ORDER BY start_ts DESC LIMIT 150`)
    .bind(sport, league, Date.now() - days * 24 * HOUR)
    .all();
  const out = [];
  for (const r of rows.results || []) {
    const e = JSON.parse(r.data);
    const c = (e.competitions || [])[0] || {};
    const side = (ha) => {
      const x = (c.competitors || []).find((k) => k.homeAway === ha) || {};
      const t = x.team || {};
      return { id: t.id, name: t.displayName, score: x.score };
    };
    out.push({ id: e.id, date: e.date, home: side('home'), away: side('away') });
  }
  return json({ sport, league, results: out }, 300);
}

async function standingsEndpoint(env, sport, league, ctx) {
  const key = `${sport}/${league}`;
  const row = await env.DB.prepare('SELECT updated, data FROM standings WHERE key=?').bind(key).first();
  if (row && Date.now() - row.updated < 12 * HOUR) return json(row.data, 300);
  try {
    const text = await espnText(env, `/apis/v2/sports/${sport}/${league}/standings`);
    ctx.waitUntil(env.DB.prepare('INSERT INTO standings (key, updated, data) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET updated=excluded.updated, data=excluded.data').bind(key, Date.now(), text).run());
    return json(text, 300);
  } catch (e) {
    if (row) return json(row.data, 60);
    return json({ error: String(e.message || e) }, 0, 502);
  }
}

// any other ESPN path, cached at Cloudflare's edge so many phones share one download
async function proxy(env, url, ctx) {
  const path = url.pathname + url.search;
  const ttl = /\/summary/.test(path) ? 15 : /scoreboard/.test(path) ? 20 : /\/news/.test(path) ? 300 : /\/teams|athletes|roster|search/.test(path) ? 1800 : 60;
  const cache = caches.default;
  const key = new Request(`https://cache.fastscore/${path}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const text = await espnText(env, path);
    const res = json(text, ttl);
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    return json({ error: String(e.message || e) }, 0, 502);
  }
}

async function statusEndpoint(env) {
  const [ev, live, boards, st] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n, MIN(start_ts) AS first FROM events').first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM events WHERE state='in' AND start_ts > ?`).bind(Date.now() - 6 * HOUR).first(),
    env.DB.prepare('SELECT COUNT(*) AS n, MAX(checked_at) AS last FROM boards').first(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM standings').first(),
  ]);
  return json({
    ok: true,
    events: ev.n,
    history_since: ev.first ? new Date(ev.first).toISOString() : null,
    live_now: live.n,
    boards: boards.n,
    last_sync: boards.last ? new Date(boards.last).toISOString() : null,
    tables: st.n,
    competitions: LEAGUES.length,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    try {
      if (url.pathname === '/' || url.pathname === '/v1/status') return await statusEndpoint(env);
      if (url.pathname === '/v1/day') {
        const cache = caches.default;
        const key = new Request(url.toString());
        const hit = await cache.match(key);
        if (hit) return hit;
        const res = await dayEndpoint(env, url);
        ctx.waitUntil(cache.put(key, res.clone()));
        return res;
      }
      if (url.pathname === '/v1/results') return await resultsEndpoint(env, url);
      if (url.pathname === '/v1/sync' && env.SYNC_KEY && url.searchParams.get('key') === env.SYNC_KEY) return json(await runSync(env));
      const m = url.pathname.match(/^\/apis\/v2\/sports\/([^/]+)\/([^/]+)\/standings$/);
      if (m) return await standingsEndpoint(env, m[1], m[2], ctx);
      if (url.pathname.startsWith('/apis/')) return await proxy(env, url, ctx);
      return json({ error: 'not found' }, 0, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, 0, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSync(env).then((r) => console.log(JSON.stringify({ synced: r.done.length, pending: r.pending }))));
  },
};

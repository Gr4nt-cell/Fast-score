// Fast Score's prediction model. It runs on the phone, so it needs no API key and costs nothing.
// Every prediction is built from each team's last 10 finished matches:
//  - football: a Poisson goals model from the goals each side scored and conceded in those
//    games (recent games count a little more, games at the same venue as this one a little more),
//    plus home advantage;
//  - other team sports: win rate and points difference over the last 10 (log5), plus home advantage.
// Bookmaker odds, when ESPN has them, are blended in at 25% as a sanity check.
// Every day the five most confident calls become the "AI Picks" and are saved, so the next day the
// app can show how they did.
import { americanToProb, load, save } from './store';
import { SPORTS, sportByKey } from './sports';
import { addDays, dayBoard, pool, scoreboard, teamSchedule, ymd } from './api/espn';

export const LAST_N = 10;
const MARKET_WEIGHT = 0.25;
const RECENCY = 0.92; // each older game counts 8% less than the one after it
const HOME_ADV = { soccer: [1.12, 0.9], rugby: 0.06, basketball: 0.06, football: 0.05, hockey: 0.04, baseball: 0.03, volleyball: 0.04 };
const PD_SCALE = { basketball: 11, football: 13, hockey: 1.4, baseball: 2.2, rugby: 12, volleyball: 0.6 };
const AVG_GOALS = 1.35; // a typical football side's goals per game, used to steady small samples

// ---------- last 10 matches ----------

const recentCache = new Map();

/** A team's last 10 finished games before `before`, newest first. */
export async function lastMatches(sport, league, teamId, before = new Date()) {
  const k = `${sport}/${league}/${teamId}`;
  if (!recentCache.has(k)) recentCache.set(k, teamSchedule(sport, league, teamId).catch(() => []));
  const games = await recentCache.get(k);
  const cutoff = new Date(before).getTime();
  return games
    .filter((g) => g.state === 'post' && new Date(g.date).getTime() < cutoff && g.home && g.away)
    .map((g) => {
      const home = String(g.home.id) === String(teamId);
      const me = home ? g.home : g.away;
      const op = home ? g.away : g.home;
      const gf = Number(me.score);
      const ga = Number(op.score);
      if (!Number.isFinite(gf) || !Number.isFinite(ga)) return null;
      return { date: g.date, home, gf, ga, opponent: op.name, opLogo: op.logo, result: gf > ga ? 'W' : gf < ga ? 'L' : 'D', key: g.key };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, LAST_N);
}

/** Weighted summary of a run of games. `atHome`: weight games at the same venue a bit more. */
function summarise(games, atHome) {
  let w = 0;
  let gf = 0;
  let ga = 0;
  let pts = 0;
  const rec = { W: 0, D: 0, L: 0 };
  const venue = { W: 0, D: 0, L: 0, n: 0 };
  games.forEach((g, i) => {
    const wt = Math.pow(RECENCY, i) * (atHome == null ? 1 : g.home === atHome ? 1.25 : 1);
    w += wt;
    gf += g.gf * wt;
    ga += g.ga * wt;
    pts += (g.result === 'W' ? 1 : g.result === 'D' ? 0.5 : 0) * wt;
    rec[g.result]++;
    if (atHome != null && g.home === atHome) {
      venue[g.result]++;
      venue.n++;
    }
  });
  return { n: games.length, gf: w ? gf / w : 0, ga: w ? ga / w : 0, win: w ? pts / w : 0.5, rec, venue, form: games.map((g) => g.result).reverse().join('') };
}

// ---------- models ----------

function poisson(k, l) {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return (Math.exp(-l) * Math.pow(l, k)) / f;
}

function soccerModel(m, H, A) {
  // league scoring level from both teams' recent games, steadied towards a typical value
  const sample = H.n + A.n;
  const avg = sample ? (((H.gf + H.ga) * H.n + (A.gf + A.ga) * A.n) / (2 * sample)) * (sample / (sample + 6)) + AVG_GOALS * (6 / (sample + 6)) : AVG_GOALS;
  const steady = (v, n) => (v * n + avg * 3) / (n + 3);
  const attH = steady(H.gf, H.n) / avg;
  const defH = steady(H.ga, H.n) / avg;
  const attA = steady(A.gf, A.n) / avg;
  const defA = steady(A.ga, A.n) / avg;
  const [ha, aa] = m.neutral ? [1, 1] : HOME_ADV.soccer;
  const lh = Math.min(Math.max(avg * attH * defA * ha, 0.15), 4.5);
  const la = Math.min(Math.max(avg * attA * defH * aa, 0.15), 4.5);
  let ph = 0;
  let pd = 0;
  let pa = 0;
  let over = 0;
  let btts = 0;
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const p = poisson(i, lh) * poisson(j, la);
      if (i > j) ph += p;
      else if (i === j) pd += p;
      else pa += p;
      if (i + j >= 3) over += p;
      if (i > 0 && j > 0) btts += p;
    }
  }
  const s = ph + pd + pa;
  return { home: ph / s, draw: pd / s, away: pa / s, over, btts, xg: { home: lh, away: la } };
}

function genericModel(m, H, A, sport) {
  const wr = (x) => (x.win * x.n + 1) / (x.n + 2);
  const a = wr(H);
  const b = wr(A);
  let p = (a - a * b) / (a + b - 2 * a * b || 1);
  const k = PD_SCALE[sport] || 10;
  const q = 1 / (1 + Math.exp(-((H.gf - H.ga) - (A.gf - A.ga)) / k));
  p = (p + q) / 2;
  if (!m.neutral) p += HOME_ADV[sport] || 0.04;
  p = Math.min(Math.max(p, 0.03), 0.97);
  return { home: p, away: 1 - p, draw: 0 };
}

function marketProbs(odds, draws) {
  if (!odds) return null;
  const h = americanToProb(odds.home);
  const a = americanToProb(odds.away);
  const d = draws ? americanToProb(odds.draw) : 0;
  if (h == null || a == null || (draws && d == null)) return null;
  const sum = h + a + (d || 0);
  return { home: h / sum, away: a / sum, draw: (d || 0) / sum };
}

const pct = (p) => `${Math.round(p * 100)}%`;
const recText = (r) => `${r.W}W ${r.D}D ${r.L}L`;

/** Prediction for one match, or null when there isn't enough to go on. */
export async function predictMatch(m) {
  if (!m || m.kind !== 'match' || sportByKey(m.sport).individual) return null;
  const sp = sportByKey(m.sport);
  const [hg, ag] = await Promise.all([lastMatches(m.sport, m.league, m.home.id, m.date), lastMatches(m.sport, m.league, m.away.id, m.date)]);
  const H = summarise(hg, true);
  const A = summarise(ag, false);
  const market = marketProbs(m.odds, sp.draws);
  // need at least 3 recent games for each side
  const model = H.n >= 3 && A.n >= 3 ? (m.sport === 'soccer' ? soccerModel(m, H, A) : genericModel(m, H, A, m.sport)) : null;
  if (!model) return null;
  const blend = (k) => (market ? (1 - MARKET_WEIGHT) * model[k] + MARKET_WEIGHT * market[k] : model[k]);
  const probs = { home: blend('home'), draw: sp.draws ? blend('draw') : 0, away: blend('away') };
  const n = probs.home + probs.draw + probs.away;
  probs.home /= n;
  probs.draw /= n;
  probs.away /= n;

  const hn = m.home.short || m.home.name;
  const an = m.away.short || m.away.name;
  const cands = [
    { market: '1X2', label: `${hn} to win`, short: '1', prob: probs.home, side: 'home' },
    { market: '1X2', label: `${an} to win`, short: '2', prob: probs.away, side: 'away' },
  ];
  if (sp.draws) cands.push({ market: '1X2', label: 'Draw', short: 'X', prob: probs.draw, side: 'draw' });
  if (model.over != null) {
    cands.push({ market: 'Goals', label: 'Over 2.5 goals', short: 'O2.5', prob: model.over, side: 'over' });
    cands.push({ market: 'Goals', label: 'Under 2.5 goals', short: 'U2.5', prob: 1 - model.over, side: 'under' });
    cands.push({ market: 'BTTS', label: 'Both teams to score', short: 'GG', prob: model.btts, side: 'btts' });
  }
  // a goals tip has to clear the result tip by a margin to be preferred
  cands.forEach((c) => (c.score = c.prob - (c.market === '1X2' ? 0 : 0.04)));
  const tip = cands.sort((x, y) => y.score - x.score)[0];

  const unit = m.sport === 'soccer' ? '' : ' pts';
  const reasons = [
    `${hn} last ${H.n}: ${recText(H.rec)} · ${H.gf.toFixed(1)}${unit} scored, ${H.ga.toFixed(1)} conceded a game`,
    `${an} last ${A.n}: ${recText(A.rec)} · ${A.gf.toFixed(1)}${unit} scored, ${A.ga.toFixed(1)} conceded a game`,
  ];
  if (H.venue.n >= 2) reasons.push(`${hn} at home in that run: ${recText(H.venue)}`);
  if (A.venue.n === 0 && A.n >= 3) {
    const away = ag.filter((g) => !g.home);
    if (away.length >= 2) reasons.push(`${an} away in that run: ${recText(summarise(away, null).rec)}`);
  }
  if (model.xg) reasons.push(`Expected goals ${model.xg.home.toFixed(1)} – ${model.xg.away.toFixed(1)}`);
  if (market) {
    const mk = tip.side === 'home' || tip.side === 'away' || tip.side === 'draw' ? market[tip.side] : null;
    if (mk != null) reasons.push(`Bookmakers imply ${pct(mk)} for this outcome (counted at 25%)`);
  }

  const quality = H.n >= 8 && A.n >= 8 ? (market ? 'high' : 'medium') : 'low';
  return {
    probs,
    tip,
    reasons,
    xg: model.xg,
    over: model.over,
    btts: model.btts,
    quality,
    market,
    last: { home: hg, away: ag, homeForm: H.form, awayForm: A.form },
  };
}

// ---------- daily top 5 ----------

const PICK_SPORTS = [
  { sport: 'soccer' },
  { sport: 'basketball', leagues: ['nba'] },
  { sport: 'hockey', leagues: ['nhl'] },
  { sport: 'football', leagues: ['nfl', 'college-football'] },
  { sport: 'baseball', leagues: ['mlb'] },
  { sport: 'rugby' },
];

function slim(m, p) {
  return {
    key: m.key,
    id: m.id,
    eventId: m.eventId,
    sport: m.sport,
    league: m.league,
    leagueName: m.leagueName,
    date: m.date,
    home: { id: m.home.id, name: m.home.name, short: m.home.short, logo: m.home.logo },
    away: { id: m.away.id, name: m.away.name, short: m.away.short, logo: m.away.logo },
    tip: { market: p.tip.market, label: p.tip.label, short: p.tip.short, side: p.tip.side, prob: p.tip.prob },
    probs: p.probs,
    xg: p.xg,
    reasons: p.reasons,
    quality: p.quality,
    homeForm: p.last && p.last.homeForm,
    awayForm: p.last && p.last.awayForm,
  };
}

export async function generatePicks(date = new Date(), onProgress) {
  const boards = [];
  for (const ps of PICK_SPORTS) {
    const sp = sportByKey(ps.sport);
    const leagues = ps.leagues ? sp.leagues.filter((l) => ps.leagues.includes(l.slug)) : sp.leagues;
    onProgress && onProgress(`Scanning ${sp.name.toLowerCase()}…`);
    try {
      const gs = await dayBoard(ps.sport, date, { leagues, ttl: 120000 });
      gs.forEach((g) => g.items.forEach((m) => m.state === 'pre' && !m.postponed && boards.push(m)));
    } catch {}
  }
  // TheSportsDB allows ~30 calls a minute, so model its 12 busiest competitions only
  const tsdbCounts = {};
  boards.forEach((m) => m.source === 'tsdb' && (tsdbCounts[m.league] = (tsdbCounts[m.league] || 0) + 1));
  const keepTsdb = new Set(Object.keys(tsdbCounts).sort((a, b) => tsdbCounts[b] - tsdbCounts[a]).slice(0, 12));
  for (let i = boards.length - 1; i >= 0; i--) if (boards[i].source === 'tsdb' && !keepTsdb.has(boards[i].league)) boards.splice(i, 1);
  onProgress && onProgress(`Modelling ${boards.length} matches…`);
  const preds = await pool(boards, 6, async (m) => {
    const p = await predictMatch(m);
    return p ? { m, p } : null;
  });
  const ranked = preds
    .filter(Boolean)
    .filter((x) => x.p.quality !== 'low' || x.p.tip.prob > 0.7)
    .map((x) => {
      const top = !!(sportByKey(x.m.sport).leagues.find((l) => l.slug === x.m.league) || {}).top;
      return { ...x, rank: x.p.tip.prob + (x.p.quality === 'high' ? 0.02 : 0) + (top ? 0.015 : 0) };
    })
    .sort((a, b) => b.rank - a.rank);
  const perLeague = {};
  const picks = [];
  for (const x of ranked) {
    const k = x.m.sport + x.m.league;
    if ((perLeague[k] || 0) >= 2) continue;
    perLeague[k] = (perLeague[k] || 0) + 1;
    picks.push(slim(x.m, x.p));
    if (picks.length === 5) break;
  }
  return { date: ymd(date), generatedAt: Date.now(), scanned: boards.length, modelled: preds.filter(Boolean).length, picks };
}

export async function getDailyPicks({ force = false, onProgress } = {}) {
  const today = new Date();
  const key = 'picks:' + ymd(today);
  const saved = await load(key, null);
  if (saved && !force) return saved;
  // once a pick has kicked off, the day's list is locked so the track record stays honest
  if (saved && force && saved.picks.some((p) => new Date(p.date) < new Date())) return saved;
  const fresh = await generatePicks(today, onProgress);
  save(key, fresh);
  const idx = await load('picks:index', []);
  if (!idx.includes(fresh.date)) save('picks:index', [...idx, fresh.date].slice(-30));
  return fresh;
}

function judge(p, m) {
  const hs = Number(m.home.score);
  const as = Number(m.away.score);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) return null;
  switch (p.tip.side) {
    case 'home':
      return hs > as;
    case 'away':
      return as > hs;
    case 'draw':
      return hs === as;
    case 'over':
      return hs + as >= 3;
    case 'under':
      return hs + as < 3;
    case 'btts':
      return hs > 0 && as > 0;
    default:
      return null;
  }
}

/** Fill in the results of past picks; returns [{ date, picks }] newest first */
export async function pickHistory(days = 14) {
  const idx = await load('picks:index', []);
  const today = ymd(new Date());
  const out = [];
  for (const d of idx.slice(-days).reverse()) {
    if (d === today) continue;
    const key = 'picks:' + d;
    const day = await load(key, null);
    if (!day) continue;
    let changed = false;
    const date = new Date(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)));
    await pool(day.picks, 4, async (p) => {
      if (p.result != null) return;
      const dates = [new Date(p.date), addDays(new Date(p.date), -1), date];
      for (const dt of dates) {
        try {
          const sb = await scoreboard(p.sport, p.league, dt, 10 * 60 * 1000);
          const m = sb.items.find((x) => x.key === p.key || x.eventId === p.eventId);
          if (m && m.state === 'post') {
            const r = judge(p, m);
            if (r != null) {
              p.result = r;
              p.final = `${m.home.score}-${m.away.score}`;
              changed = true;
            }
            break;
          }
          if (m && m.postponed) {
            p.result = 'void';
            changed = true;
            break;
          }
        } catch {}
      }
    });
    if (changed) save(key, day);
    out.push(day);
  }
  return out;
}

export { SPORTS };

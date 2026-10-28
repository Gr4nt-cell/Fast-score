// Fast Score's prediction model. It runs on the phone, so it needs no API key and costs nothing:
//  - football: a Poisson goals model built from each side's scoring and conceding rates in the
//    current table, adjusted for home advantage and recent form;
//  - other team sports: log5 on win rates blended with points difference and home advantage;
//  - both are blended 50/50 with the bookmakers' implied probabilities whenever ESPN carries odds.
// Every day the five most confident calls become the "AI Picks" and are saved, so the next day the
// app can show how they did.
import { americanToProb, load, save } from './store';
import { SPORTS, sportByKey } from './sports';
import { addDays, dayBoard, pool, scoreboard, standings, ymd } from './api/espn';

const HOME_ADV = { soccer: [1.12, 0.9], rugby: 0.06, basketball: 0.06, football: 0.05, hockey: 0.04, baseball: 0.03, volleyball: 0.04 };
const PD_SCALE = { basketball: 11, football: 13, hockey: 1.4, baseball: 2.2, rugby: 12, volleyball: 0.6 };

const standingsCache = new Map();
async function tableFor(sport, league) {
  const k = sport + '/' + league;
  if (!standingsCache.has(k)) standingsCache.set(k, standings(sport, league).catch(() => []));
  return standingsCache.get(k);
}

function findRow(groups, teamId, name) {
  for (const g of groups) {
    for (const r of g.rows) {
      if ((teamId && r.teamId === String(teamId)) || (name && r.name === name)) return { row: r, group: g };
    }
  }
  return null;
}

function poisson(k, l) {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return (Math.exp(-l) * Math.pow(l, k)) / f;
}

function formScore(form) {
  if (!form) return 0;
  const s = String(form).toUpperCase().replace(/[^WDL]/g, '').slice(-5);
  if (!s.length) return 0;
  let p = 0;
  for (const c of s) p += c === 'W' ? 1 : c === 'D' ? 0.4 : 0;
  return p / s.length - 0.45; // about -0.45 .. +0.55
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
const ord = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

function soccerModel(m, H, A, groups) {
  const all = groups.flatMap((g) => g.rows).filter((r) => r.gp > 0 && r.gf != null);
  if (all.length < 4) return null;
  const avg = all.reduce((s, r) => s + r.gf / r.gp, 0) / all.length || 1.35;
  const rate = (r, k) => {
    const raw = r[k] / r.gp / avg;
    const w = r.gp / (r.gp + 6);
    return 1 + w * (raw - 1);
  };
  const [ha, aa] = m.neutral ? [1, 1] : HOME_ADV.soccer;
  const fh = formScore(m.home.form);
  const fa = formScore(m.away.form);
  let lh = avg * rate(H, 'gf') * rate(A, 'ga') * ha * (1 + 0.1 * (fh - fa));
  let la = avg * rate(A, 'gf') * rate(H, 'ga') * aa * (1 + 0.1 * (fa - fh));
  lh = Math.min(Math.max(lh, 0.15), 4.5);
  la = Math.min(Math.max(la, 0.15), 4.5);
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
  const wr = (r) => ((r.w || 0) + 2) / ((r.w || 0) + (r.l || 0) + (r.d || 0) + 4);
  const a = wr(H);
  const b = wr(A);
  let p = (a - a * b) / (a + b - 2 * a * b || 1);
  if (H.gp && A.gp && H.gf != null && H.ga != null && A.gf != null && A.ga != null) {
    const pdH = (H.gf - H.ga) / H.gp;
    const pdA = (A.gf - A.ga) / A.gp;
    const k = PD_SCALE[sport] || 10;
    const q = 1 / (1 + Math.exp(-(pdH - pdA) / k));
    p = (p + q) / 2;
  }
  if (!m.neutral) p += HOME_ADV[sport] || 0.04;
  p = Math.min(Math.max(p, 0.03), 0.97);
  return { home: p, away: 1 - p, draw: 0 };
}

/** Prediction for one match, or null when there isn't enough to go on. */
export async function predictMatch(m) {
  if (!m || m.kind !== 'match' || sportByKey(m.sport).individual) return null;
  const sp = sportByKey(m.sport);
  const groups = await tableFor(m.sport, m.league);
  const h = findRow(groups, m.home.id, m.home.name);
  const a = findRow(groups, m.away.id, m.away.name);
  const market = marketProbs(m.odds, sp.draws);
  let model = null;
  if (h && a && h.row.gp >= 2 && a.row.gp >= 2) {
    model = m.sport === 'soccer' ? soccerModel(m, h.row, a.row, groups) : genericModel(m, h.row, a.row, m.sport);
  }
  if (!model && !market) return null;
  const blend = (k) => (model && market ? 0.5 * model[k] + 0.5 * market[k] : model ? model[k] : market[k]);
  const probs = { home: blend('home'), draw: sp.draws ? blend('draw') : 0, away: blend('away') };
  const n = probs.home + probs.draw + probs.away;
  probs.home /= n;
  probs.draw /= n;
  probs.away /= n;

  const cands = [
    { market: '1X2', label: `${m.home.short || m.home.name} to win`, short: '1', prob: probs.home, side: 'home' },
    { market: '1X2', label: `${m.away.short || m.away.name} to win`, short: '2', prob: probs.away, side: 'away' },
  ];
  if (sp.draws) cands.push({ market: '1X2', label: 'Draw', short: 'X', prob: probs.draw, side: 'draw' });
  if (model && model.over != null) {
    cands.push({ market: 'Goals', label: 'Over 2.5 goals', short: 'O2.5', prob: model.over, side: 'over' });
    cands.push({ market: 'Goals', label: 'Under 2.5 goals', short: 'U2.5', prob: 1 - model.over, side: 'under' });
    cands.push({ market: 'BTTS', label: 'Both teams to score', short: 'GG', prob: model.btts, side: 'btts' });
  }
  // a goals tip has to clear the result tip by a margin to be preferred
  cands.forEach((c) => (c.score = c.prob - (c.market === '1X2' ? 0 : 0.04)));
  const tip = cands.sort((x, y) => y.score - x.score)[0];

  const reasons = [];
  if (h && a) {
    const hr = h.row;
    const ar = a.row;
    if (hr.rank && ar.rank && h.group === a.group) {
      reasons.push(`${m.home.short || m.home.name} are ${ord(hr.rank)}${hr.pts != null ? ` (${hr.pts} pts)` : ''}, ${m.away.short || m.away.name} ${ord(ar.rank)}${ar.pts != null ? ` (${ar.pts} pts)` : ''}`);
    } else if (hr.w != null && ar.w != null) {
      reasons.push(`Records: ${m.home.short || m.home.name} ${hr.w}-${hr.l}${hr.d ? '-' + hr.d : ''}, ${m.away.short || m.away.name} ${ar.w}-${ar.l}${ar.d ? '-' + ar.d : ''}`);
    }
    if (m.sport === 'soccer' && hr.gp && ar.gp && hr.gf != null) {
      reasons.push(`${m.home.short || m.home.name} score ${(hr.gf / hr.gp).toFixed(1)} and concede ${(hr.ga / hr.gp).toFixed(1)} a game; ${m.away.short || m.away.name} ${(ar.gf / ar.gp).toFixed(1)} and ${(ar.ga / ar.gp).toFixed(1)}`);
    }
  }
  if (m.home.form || m.away.form) reasons.push(`Form: ${m.home.form || '–'} vs ${m.away.form || '–'}`);
  if (model && model.xg) reasons.push(`Expected goals ${model.xg.home.toFixed(1)} – ${model.xg.away.toFixed(1)}`);
  if (market) {
    const mk = tip.side === 'home' || tip.side === 'away' || tip.side === 'draw' ? market[tip.side] : null;
    if (mk != null) reasons.push(`Bookmakers imply ${pct(mk)} for this outcome`);
  }
  if (!m.neutral && sp.key !== 'tennis') reasons.push(`Home advantage factored in for ${m.home.short || m.home.name}`);

  const quality = model && market ? 'high' : model ? 'medium' : 'market';
  return { probs, tip, reasons, xg: model && model.xg, over: model && model.over, btts: model && model.btts, quality, market };
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
  onProgress && onProgress(`Modelling ${boards.length} matches…`);
  const preds = await pool(boards, 6, async (m) => {
    const p = await predictMatch(m);
    return p ? { m, p } : null;
  });
  const ranked = preds
    .filter(Boolean)
    .filter((x) => x.p.quality !== 'market' || x.p.tip.prob > 0.7)
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

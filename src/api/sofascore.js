// SofaScore's own data API (the JSON the sofascore.com website loads), called straight from the
// phone. It isn't a public API: SofaScore can refuse or change it at any time, so every call here
// is allowed to fail and the app then falls back to ESPN.
// Everything is converted into the same shapes the ESPN layer produces, so screens don't change.

const HOSTS = ['https://api.sofascore.com/api/v1', 'https://www.sofascore.com/api/v1'];
const IMG = 'https://api.sofascore.app/api/v1';
const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-GB,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  Referer: 'https://www.sofascore.com/',
  Origin: 'https://www.sofascore.com',
};

// our sport keys -> SofaScore's
export const SS_SPORT = {
  soccer: 'football',
  basketball: 'basketball',
  tennis: 'tennis',
  football: 'american-football',
  baseball: 'baseball',
  hockey: 'ice-hockey',
  mma: 'mma',
  rugby: 'rugby',
  volleyball: 'volleyball',
};
export const supports = (sport) => !!SS_SPORT[sport];
export const isSs = (league) => String(league || '').startsWith('ss:');

const INDIVIDUAL = new Set(['tennis', 'mma']);
const mem = new Map();
const inflight = new Map();
let preferred = 0;
let blockedUntil = 0;

export const ssBlocked = () => Date.now() < blockedUntil;

async function get(path, ttl = 30000) {
  const hit = mem.get(path);
  if (hit && Date.now() - hit.t < ttl) return hit.data;
  if (inflight.has(path)) return inflight.get(path);
  const pr = (async () => {
    let last;
    for (const i of [preferred, 1 - preferred]) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetch(HOSTS[i] + path, { headers: HEADERS, signal: ctrl.signal });
        clearTimeout(timer);
        if (res.status === 404) {
          // SofaScore answers 404 for "nothing here" (no lineups yet, no odds...)
          const data = {};
          mem.set(path, { t: Date.now(), data });
          return data;
        }
        if (res.status === 403 || res.status === 429) {
          last = new Error(`SofaScore refused (${res.status})`);
          continue;
        }
        if (!res.ok) throw new Error(`SofaScore HTTP ${res.status}`);
        const data = await res.json();
        preferred = i;
        mem.set(path, { t: Date.now(), data });
        return data;
      } catch (e) {
        clearTimeout(timer);
        last = e;
      }
    }
    if (last && /refused/.test(last.message)) blockedUntil = Date.now() + 10 * 60 * 1000;
    const old = mem.get(path);
    if (old) return old.data;
    throw last || new Error('SofaScore unreachable');
  })().finally(() => inflight.delete(path));
  inflight.set(path, pr);
  return pr;
}

const dash = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sameLocalDay = (ms, d) => {
  const x = new Date(ms);
  return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate();
};

// fractional "4/5" -> American moneyline
function fracToMl(f) {
  if (!f) return null;
  const [a, b] = String(f).split('/').map(Number);
  if (!a || !b) return null;
  const dec = 1 + a / b;
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
}

// ---------- normalising ----------

function stateOf(st = {}) {
  const t = st.type;
  if (t === 'inprogress') return 'in';
  if (t === 'finished') return 'post';
  return 'pre';
}

function clockOf(e, sport) {
  const st = e.status || {};
  if (st.type !== 'inprogress') return null;
  const desc = st.description || '';
  if (/halftime|half time|break/i.test(desc)) return 'HT';
  if (sport === 'soccer' && e.time && e.time.currentPeriodStartTimestamp) {
    const init = e.time.initial || (/2nd/i.test(desc) ? 2700 : /1st extra/i.test(desc) ? 5400 : /2nd extra/i.test(desc) ? 6300 : 0);
    const max = e.time.max || init + 2700;
    const secs = init + (Date.now() / 1000 - e.time.currentPeriodStartTimestamp);
    const min = Math.floor(secs / 60) + 1;
    const cap = Math.floor(max / 60);
    return min > cap ? `${cap}+${min - cap}'` : `${Math.max(1, min)}'`;
  }
  return desc.replace(/quarter/i, 'Q').replace(/period/i, 'P') || 'Live';
}

function side(e, which, sport) {
  const team = (which === 'home' ? e.homeTeam : e.awayTeam) || {};
  const sc = (which === 'home' ? e.homeScore : e.awayScore) || {};
  const ls = [];
  for (let i = 1; i <= 7; i++) if (sc['period' + i] != null) ls.push(String(sc['period' + i]));
  const tb = [];
  for (let i = 1; i <= ls.length; i++) tb.push(sc['period' + i + 'TieBreak'] != null ? String(sc['period' + i + 'TieBreak']) : null);
  const individual = INDIVIDUAL.has(sport);
  const flag = team.country && team.country.alpha2 ? `https://flagcdn.com/w40/${team.country.alpha2.toLowerCase()}.png` : null;
  return {
    id: String(team.id || team.name || which),
    name: team.name || 'TBD',
    short: team.shortName || team.name || 'TBD',
    abbr: team.nameCode || (team.name || '').slice(0, 3).toUpperCase(),
    logo: team.id ? `${IMG}/team/${team.id}/image` : null,
    flag,
    color: team.teamColors && team.teamColors.primary && team.teamColors.primary !== '#ffffff' ? team.teamColors.primary : null,
    score: sc.display != null ? String(sc.display) : sc.current != null ? String(sc.current) : null,
    winner: e.winnerCode === (which === 'home' ? 1 : 2),
    homeAway: which,
    form: null,
    record: null,
    rank: team.ranking || null,
    linescores: sport === 'soccer' || sport === 'football' ? [] : ls,
    tiebreaks: tb,
    position: null,
    isAthlete: individual,
    athleteId: individual && team.id ? String(team.id) : null,
    teamId: team.id ? String(team.id) : null,
    stats: [],
  };
}

export function normalize(e, sport) {
  const tour = e.tournament || {};
  const ut = tour.uniqueTournament || {};
  const cat = tour.category || {};
  const state = stateOf(e.status);
  const st = e.status || {};
  const date = new Date((e.startTimestamp || 0) * 1000);
  const postponed = /postponed|canceled|cancelled|suspended|interrupted|abandoned|delayed/i.test(st.type || '') || /postponed|canceled/i.test(st.description || '');
  let short;
  if (state === 'in') short = clockOf(e, sport);
  else if (state === 'post') short = /AET|extra/i.test(st.description || '') ? 'AET' : /pen/i.test(st.description || '') ? 'PEN' : 'FT';
  else short = postponed ? (/postponed/i.test(st.description || st.type) ? 'PPD' : st.description || 'Off') : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const leagueId = ut.id || tour.id;
  const home = side(e, 'home', sport);
  const away = side(e, 'away', sport);
  const details = [];
  for (let i = 0; i < (e.homeRedCards || 0); i++) details.push({ teamId: home.id, red: true });
  for (let i = 0; i < (e.awayRedCards || 0); i++) details.push({ teamId: away.id, red: true });
  return {
    source: 'sofascore',
    sport,
    league: 'ss:' + leagueId,
    leagueName: ut.name || tour.name || 'Other',
    leagueLogo: ut.id ? `${IMG}/unique-tournament/${ut.id}/image` : null,
    country: cat.name || '',
    priority: (ut.userCount || 0) / 1e6 + (tour.priority || 0) + (cat.priority || 0) / 100,
    utid: ut.id || null,
    seasonId: e.season && e.season.id,
    customId: e.customId,
    eventId: String(e.id),
    eventName: `${home.name} vs ${away.name}`,
    key: `${sport}:ss:${e.id}`,
    id: String(e.id),
    compId: String(e.id),
    kind: 'match',
    group: INDIVIDUAL.has(sport) && tour.name && tour.name !== ut.name ? tour.name : '',
    date: date.toISOString(),
    state,
    completed: state === 'post',
    name: st.type || '',
    detail: st.description || '',
    short,
    clock: short,
    period: 0,
    status: { name: st.description || st.type || '' },
    postponed,
    home,
    away,
    individual: INDIVIDUAL.has(sport),
    neutral: !!(e.venue && e.venue.neutral),
    venue: e.venue && e.venue.stadium ? [e.venue.stadium.name, e.venue.city && e.venue.city.name].filter(Boolean).join(', ') : '',
    odds: null,
    details,
    note: '',
    broadcast: '',
    round: e.roundInfo ? (e.roundInfo.name || (e.roundInfo.round ? `Round ${e.roundInfo.round}` : '')) : '',
  };
}

function group(items) {
  const by = new Map();
  items.forEach((m) => {
    const g = by.get(m.league) || { league: { slug: m.league, sport: m.sport, name: m.leagueName, logo: m.leagueLogo, priority: m.priority }, items: [] };
    g.items.push(m);
    by.set(m.league, g);
  });
  const out = [...by.values()];
  out.forEach((g) => g.items.sort((a, b) => new Date(a.date) - new Date(b.date)));
  out.sort((a, b) => (b.league.priority || 0) - (a.league.priority || 0));
  return out;
}

// ---------- endpoints ----------

/** Every event of a sport on a local day (SofaScore groups by UTC day, so neighbours are fetched too). */
export async function dayBoard(sport, date, ttl = 30000) {
  const s = SS_SPORT[sport];
  const prev = new Date(date);
  prev.setDate(prev.getDate() - 1);
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  const offset = date.getTimezoneOffset();
  const days = offset > 0 ? [date, next] : offset < 0 ? [prev, date] : [date];
  const [main, ...rest] = await Promise.all(days.map((d, i) => (i === 0 ? get(`/sport/${s}/scheduled-events/${dash(d)}`, ttl) : get(`/sport/${s}/scheduled-events/${dash(d)}`, ttl).catch(() => ({})))));
  const events = [...(main.events || []), ...rest.flatMap((r) => r.events || [])];
  const seen = new Set();
  const items = [];
  events.forEach((e) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    const m = normalize(e, sport);
    if (!sameLocalDay(e.startTimestamp * 1000, date) && m.state !== 'in') return;
    items.push(m);
  });
  const out = group(items);
  out.source = 'sofascore';
  return out;
}

export async function liveBoard(sport) {
  const j = await get(`/sport/${SS_SPORT[sport]}/events/live`, 15000);
  const out = group((j.events || []).map((e) => normalize(e, sport)));
  out.source = 'sofascore';
  return out;
}

export async function leagueDay(sport, slug, date) {
  const all = await dayBoard(sport, date);
  const g = all.find((x) => x.league.slug === slug);
  return { league: g ? g.league : { slug, sport, name: 'Competition', logo: `${IMG}/unique-tournament/${slug.slice(3)}/image` }, items: g ? g.items : [] };
}

async function currentSeason(utid) {
  const j = await get(`/unique-tournament/${utid}/seasons`, 6 * 3600 * 1000);
  return j.seasons && j.seasons[0] && j.seasons[0].id;
}

const NOTE_COLORS = [
  [/champions league|promotion(?! play)|title/i, '1A7BE6'],
  [/europa league|playoff|play-off|qualif/i, 'F08B1C'],
  [/conference/i, '2FB869'],
  [/relegation/i, 'D11A1A'],
];

export async function standings(slug, seasonId) {
  const utid = slug.slice(3);
  const sid = seasonId || (await currentSeason(utid));
  if (!sid) return [];
  const j = await get(`/unique-tournament/${utid}/season/${sid}/standings/total`, 10 * 60 * 1000);
  return (j.standings || []).map((st) => ({
    name: st.name || '',
    rows: (st.rows || []).map((r) => {
      const text = r.promotion && r.promotion.text;
      const color = text ? (NOTE_COLORS.find(([re]) => re.test(text)) || [null, '8A8A8E'])[1] : null;
      return {
        teamId: String(r.team.id),
        name: r.team.name,
        short: r.team.shortName || r.team.name,
        logo: `${IMG}/team/${r.team.id}/image`,
        note: text ? { color, text } : null,
        gp: r.matches,
        w: r.wins,
        d: r.draws,
        l: r.losses,
        gf: r.scoresFor,
        ga: r.scoresAgainst,
        gd: r.scoresFor != null && r.scoresAgainst != null ? r.scoresFor - r.scoresAgainst : null,
        pts: r.points,
        rank: r.position,
        pct: r.percentage != null ? r.percentage : null,
        raw: r,
      };
    }),
  }));
}

/** Match details in the shape the match screen reads from ESPN's summary. */
export async function summary(sport, eventId) {
  const [ev, inc, stats, lu, odds, form] = await Promise.all([
    get(`/event/${eventId}`, 10000),
    get(`/event/${eventId}/incidents`, 15000).catch(() => ({})),
    get(`/event/${eventId}/statistics`, 20000).catch(() => ({})),
    get(`/event/${eventId}/lineups`, 5 * 60000).catch(() => ({})),
    get(`/event/${eventId}/odds/1/featured`, 5 * 60000).catch(() => ({})),
    get(`/event/${eventId}/pregame-form`, 30 * 60000).catch(() => ({})),
  ]);
  const e = ev.event;
  const match = e ? normalize(e, sport) : null;
  const hid = match ? match.home.id : '';
  const aid = match ? match.away.id : '';
  if (match && form.homeTeam) {
    match.home.form = (form.homeTeam.form || []).join('');
    match.away.form = ((form.awayTeam && form.awayTeam.form) || []).join('');
  }

  // incidents -> ESPN keyEvents (SofaScore lists newest first)
  const keyEvents = [...(inc.incidents || [])]
    .reverse()
    .filter((x) => ['goal', 'card', 'substitution', 'varDecision', 'penaltyShootout'].includes(x.incidentType))
    .map((x) => {
      const t = x.incidentType;
      const cls = x.incidentClass || '';
      let text = 'Goal';
      if (t === 'goal') text = cls === 'penalty' ? 'Penalty - Scored' : cls === 'ownGoal' ? 'Own Goal' : 'Goal';
      else if (t === 'card') text = cls === 'yellowRed' ? 'Second Yellow Card' : cls === 'red' ? 'Red Card' : 'Yellow Card';
      else if (t === 'substitution') text = 'Substitution';
      else if (t === 'varDecision') text = 'VAR';
      else if (t === 'penaltyShootout') text = cls === 'scored' ? 'Shoot-out: scored' : 'Shoot-out: missed';
      const people = t === 'substitution' ? [x.playerIn, x.playerOut] : [x.player, x.assist1];
      return {
        type: { text: cls === 'yellowRed' ? 'Red Card' : text, type: t === 'card' ? (cls === 'yellow' ? 'yellow-card' : 'red-card') : t },
        clock: { displayValue: x.time != null ? `${x.time}${x.addedTime ? '+' + x.addedTime : ''}'` : '' },
        team: { id: x.isHome ? hid : aid },
        participants: people.filter(Boolean).map((p) => ({ athlete: { displayName: p.name || p.shortName } })),
        scoringPlay: t === 'goal' || (t === 'penaltyShootout' && cls === 'scored'),
        text,
      };
    });

  // statistics -> boxscore.teams
  const all = (stats.statistics || []).find((p) => p.period === 'ALL') || (stats.statistics || [])[0];
  const items = all ? (all.groups || []).flatMap((g) => g.statisticsItems || []) : [];
  const clean = (v) => (v == null ? '' : String(v).replace('%', ''));
  const boxscore = items.length
    ? {
        teams: [
          { homeAway: 'home', team: { id: hid }, statistics: items.map((s) => ({ name: s.key || s.name, label: s.name, displayValue: clean(s.home) })) },
          { homeAway: 'away', team: { id: aid }, statistics: items.map((s) => ({ name: s.key || s.name, label: s.name, displayValue: clean(s.away) })) },
        ],
      }
    : undefined;

  // lineups -> rosters
  const roster = (side, ha) =>
    side && side.players && side.players.length
      ? {
          homeAway: ha,
          team: { id: ha === 'home' ? hid : aid, displayName: match ? match[ha].name : '' },
          formation: side.formation || null,
          roster: side.players.map((p, i) => ({
            starter: !p.substitute,
            jersey: p.shirtNumber != null ? String(p.shirtNumber) : p.jerseyNumber,
            athlete: { id: p.player && String(p.player.id), displayName: p.player && p.player.name, lastName: p.player && (p.player.shortName || p.player.name || '').split(' ').pop() },
            position: { abbreviation: p.position || (p.player && p.player.position) || '', displayName: p.position },
            formationPlace: i + 1,
            subbedIn: false,
            subbedOut: false,
          })),
        }
      : null;
  const rosters = [roster(lu.home, 'home'), roster(lu.away, 'away')].filter(Boolean);

  // featured odds -> pickcenter
  const choices = odds.featured && odds.featured.default && odds.featured.default.choices;
  let pickcenter;
  if (choices && choices.length) {
    const c = (n) => fracToMl((choices.find((x) => x.name === n) || {}).fractionalValue);
    pickcenter = [{ provider: { name: 'SofaScore' }, homeTeamOdds: { moneyLine: c('1') }, awayTeamOdds: { moneyLine: c('2') }, drawOdds: { moneyLine: c('X') } }];
  }

  // head to head
  let headToHeadGames;
  if (e && e.customId) {
    const h = await get(`/event/${e.customId}/h2h/events`, 6 * 3600 * 1000).catch(() => ({}));
    const evs = (h.events || []).filter((x) => x.id !== e.id && x.status && x.status.type === 'finished').slice(0, 10);
    if (evs.length) {
      headToHeadGames = [
        {
          team: { id: hid },
          events: evs.map((x) => {
            const homeIsUs = String(x.homeTeam.id) === hid;
            const us = homeIsUs ? x.homeScore.current : x.awayScore.current;
            const them = homeIsUs ? x.awayScore.current : x.homeScore.current;
            return {
              id: String(x.id),
              gameDate: new Date(x.startTimestamp * 1000).toISOString(),
              score: `${x.homeScore.current}-${x.awayScore.current}`,
              gameResult: us > them ? 'W' : us < them ? 'L' : 'D',
              atVs: homeIsUs ? 'vs' : '@',
              opponent: { displayName: homeIsUs ? x.awayTeam.name : x.homeTeam.name },
            };
          }),
        },
      ];
    }
  }

  return {
    __match: match,
    keyEvents,
    boxscore,
    rosters: rosters.length ? rosters : undefined,
    pickcenter,
    headToHeadGames,
    gameInfo: e
      ? {
          venue: e.venue && e.venue.stadium ? { fullName: e.venue.stadium.name, address: { city: e.venue.city && e.venue.city.name } } : null,
          attendance: e.attendance,
          officials: e.referee ? [{ displayName: e.referee.name }] : [],
        }
      : {},
  };
}

export async function team(id) {
  const j = await get(`/team/${id}`, 3600 * 1000);
  const t = j.team || {};
  return {
    id: t.id,
    displayName: t.name,
    logos: t.id ? [{ href: `${IMG}/team/${t.id}/image` }] : [],
    venue: t.venue && t.venue.stadium ? { fullName: t.venue.stadium.name } : null,
    standingSummary: t.primaryUniqueTournament ? t.primaryUniqueTournament.name : t.category && t.category.name,
  };
}

export async function teamSchedule(sport, id) {
  const pages = await Promise.all([
    get(`/team/${id}/events/last/0`, 5 * 60000).catch(() => ({})),
    get(`/team/${id}/events/last/1`, 30 * 60000).catch(() => ({})),
    get(`/team/${id}/events/next/0`, 5 * 60000).catch(() => ({})),
  ]);
  const seen = new Set();
  return pages
    .flatMap((p) => p.events || [])
    .filter((e) => (seen.has(e.id) ? false : seen.add(e.id)))
    .map((e) => normalize(e, sport))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export async function roster(id) {
  const j = await get(`/team/${id}/players`, 6 * 3600 * 1000).catch(() => ({}));
  const names = { G: 'Goalkeepers', D: 'Defenders', M: 'Midfielders', F: 'Forwards' };
  const by = {};
  (j.players || []).forEach(({ player: p }) => {
    if (!p) return;
    const k = names[p.position] || 'Players';
    (by[k] = by[k] || []).push({
      id: String(p.id),
      name: p.name,
      jersey: p.jerseyNumber || p.shirtNumber,
      pos: p.position,
      posAbbr: p.position,
      age: p.dateOfBirthTimestamp ? Math.floor((Date.now() / 1000 - p.dateOfBirthTimestamp) / 31557600) : null,
      country: p.country && p.country.name,
      flag: p.country && p.country.alpha2 ? `https://flagcdn.com/w40/${p.country.alpha2.toLowerCase()}.png` : null,
      headshot: `${IMG}/player/${p.id}/image`,
    });
  });
  const order = ['Goalkeepers', 'Defenders', 'Midfielders', 'Forwards', 'Players'];
  return { groups: order.filter((k) => by[k]).map((k) => ({ name: k, players: by[k] })), coach: '' };
}

export async function player(id) {
  let p = (await get(`/player/${id}`, 3600 * 1000).catch(() => ({}))).player;
  if (!p) p = (await get(`/team/${id}`, 3600 * 1000).catch(() => ({}))).team; // tennis / MMA athletes are "teams"
  p = p || {};
  const isPlayer = !!p.position || !!p.jerseyNumber;
  return {
    athlete: {
      displayName: p.name,
      headshot: { href: `${IMG}/${isPlayer ? 'player' : 'team'}/${id}/image` },
      position: p.position ? { displayName: { G: 'Goalkeeper', D: 'Defender', M: 'Midfielder', F: 'Forward' }[p.position] || p.position } : null,
      jersey: p.jerseyNumber || p.shirtNumber,
      citizenship: p.country && p.country.name,
      displayDOB: p.dateOfBirthTimestamp ? new Date(p.dateOfBirthTimestamp * 1000).toLocaleDateString() : null,
      displayHeight: p.height ? `${p.height} cm` : null,
      team: p.team ? { displayName: p.team.name, id: p.team.id } : null,
    },
    overview: null,
    gamelog: null,
  };
}

const SPORT_FROM_SS = Object.fromEntries(Object.entries(SS_SPORT).map(([k, v]) => [v, k]));

export async function search(q) {
  const j = await get(`/search/all?q=${encodeURIComponent(q)}&page=0`, 60000).catch(() => ({}));
  const out = [];
  (j.results || []).forEach((r) => {
    const en = r.entity || {};
    const sport = SPORT_FROM_SS[en.sport && en.sport.slug] || (en.team && en.team.sport && SPORT_FROM_SS[en.team.sport.slug]);
    if (!sport) return;
    if (r.type === 'team') out.push({ type: 'team', id: String(en.id), name: en.name, sub: en.category && en.category.name, image: `${IMG}/team/${en.id}/image`, sport, league: 'ss:team' });
    else if (r.type === 'player') out.push({ type: 'player', id: String(en.id), name: en.name, sub: en.team && en.team.name, image: `${IMG}/player/${en.id}/image`, sport, league: 'ss:player' });
  });
  return out;
}

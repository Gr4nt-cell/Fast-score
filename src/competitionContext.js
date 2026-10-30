// Conservative, transparent model priors, not official rankings or calibrated ratings.
// Unknown leagues stay unknown: never infer a division from a country's reputation.
const LEAGUES = [
  ['England', /^(premier league|eng\.1)$/i, 1, 1],
  ['England', /^(championship|eng\.2)$/i, 2, 0.78],
  ['England', /^(league one|eng\.3)$/i, 3, 0.61],
  ['England', /^(league two|eng\.4)$/i, 4, 0.48],
  ['Spain', /^(laliga|la liga|primera division|esp\.1)$/i, 1, 0.96],
  ['Spain', /^(laliga2|segunda division|esp\.2)$/i, 2, 0.74],
  ['Germany', /^(bundesliga|ger\.1)$/i, 1, 0.94],
  ['Germany', /^(2\. bundesliga|ger\.2)$/i, 2, 0.73],
  ['Italy', /^(serie a|ita\.1)$/i, 1, 0.94],
  ['Italy', /^(serie b|ita\.2)$/i, 2, 0.72],
  ['France', /^(ligue 1|fra\.1)$/i, 1, 0.88],
  ['France', /^(ligue 2|fra\.2)$/i, 2, 0.68],
  ['Netherlands', /^(eredivisie|ned\.1)$/i, 1, 0.81],
  ['Portugal', /^(liga portugal|primeira liga|por\.1)$/i, 1, 0.81],
];
export function leagueProfile(league, name, country) {
  const label = String(name || '').replace(/^.*?:\s*/, '').trim();
  const c = String(country || '').toLowerCase();
  // Only exact provider slugs or country-qualified names identify a competition.
  const item = LEAGUES.find(([nation, re]) =>
    re.test(String(league || '')) || (c === nation.toLowerCase() && re.test(label)));
  return item ? { country: item[0], name: label || league, division: item[2], strength: item[3], league } : null;
}

export function domesticProfile(match, side, games) {
  const own = match[side];
  const explicit = leagueProfile(own.league, own.leagueName, own.country || match.country);
  if (explicit) return explicit;
  const current = leagueProfile(match.league, match.leagueName, match.country);
  if (current) return current;
  // Cup fixtures must use each team's domestic competition, not the cup as a division.
  const candidates = new Map();
  for (const g of games) {
    const profile = leagueProfile(g.league, g.leagueName, g.country);
    if (!profile) continue;
    const key = `${profile.country}/${profile.division}`;
    const entry = candidates.get(key) || { profile, count: 0 };
    entry.count++;
    candidates.set(key, entry);
  }
  return [...candidates.values()].sort((a, b) => b.count - a.count)[0]?.profile || null;
}

export function tableContext(groups, teamId) {
  for (const group of groups || []) {
    const rows = group.rows || [];
    const row = rows.find((r) => String(r.teamId) === String(teamId));
    if (!row) continue;
    const rank = Number(row.rank);
    const played = Number(row.gp);
    if (!Number.isFinite(rank) || rank < 1 || rank > rows.length ||
        !Number.isFinite(played) || played < 3 || rows.length < 2) return null;
    return {
      rank, total: rows.length, played,
      // Shrink early-season tables and group-sized tables towards neutral.
      value: (0.5 - (rank - 1) / (rows.length - 1)) *
        Math.min(1, played / 12) * Math.min(1, rows.length / 10),
    };
  }
  return null;
}

export function contextAdjustment(home, away, homeTable, awayTable) {
  const both = home && away;
  const strength = both ? Math.log(home.strength / away.strength) * 0.45 : 0;
  // Division has a small separate contribution; league strength already includes some gap.
  const division = both && home.country === away.country
    ? Math.max(-3, Math.min(3, away.division - home.division)) * 0.04 : 0;
  const standing = homeTable && awayTable ? (homeTable.value - awayTable.value) * 0.22 : 0;
  return Math.max(-0.3, Math.min(0.3, strength + division + standing));
}

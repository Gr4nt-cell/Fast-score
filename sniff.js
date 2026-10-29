const fs = require('fs');
(async () => {
  const api = 'https://www.msport.com/api/gh/facts-center/query/frontend';
  const H = { operId: '3', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36' };
  const j = await (await fetch(`${api}/live-matches/list?sportId=sr:sport:1`, { headers: H })).json();
  const evs = j.data.tournaments.flatMap((t) => t.events);
  const out = [];
  for (const e of evs.slice(0, 3)) {
    const d = (await (await fetch(`${api}/match/detail?eventId=${e.eventId}`, { headers: H })).json()).data;
    out.push({ id: e.eventId, home: d.homeTeam, away: d.awayTeam, played: d.playedTime, score: d.scoreOfWholeMatch, corners: d.soccerCornerScore, book: d.soccerBookingsScore, red: d.soccerRedCardScore, period: d.eventMatchPeriod, st: d.eventMatchStatus,
      markets: d.markets.map((m) => `${m.id} | ${m.name} | ${m.description} | ${m.specifiers} | ${m.status} | ` + (m.outcomes || []).map((o) => `${o.description}:${o.odds}:${o.probability}:${o.isActive}`).join(' ')) });
  }
  fs.writeFileSync('out/ms_detail.json', JSON.stringify(out, null, 1));
  // flashscore h2h sample
  const FH = { 'x-fsign': 'SW9D1eZo', Referer: 'https://www.flashscore.com/' };
  const day = await (await fetch('https://global.flashscore.ninja/2/x/feed/f_1_0_0_en_1', { headers: FH })).text();
  const ids = [...day.matchAll(/~AA÷([A-Za-z0-9]+)/g)].map((m) => m[1]).slice(0, 2);
  fs.writeFileSync('out/day_head.txt', day.slice(0, 3000));
  for (const id of ids) { const t = await (await fetch(`https://global.flashscore.ninja/2/x/feed/df_hh_1_${id}`, { headers: FH })).text(); fs.writeFileSync(`out/hh_${id}.txt`, t.slice(0, 20000)); }
})();

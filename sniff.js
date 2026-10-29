const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  const urls = ['https://static.msport.com/gh/main/js/live-widgets.bbfb33a5.js', 'https://static.msport.com/gh/main/js/widgets-cpt.f24416f3.js', 'https://static.msport.com/gh/main/js/stat-widgets.6f7ee643.js', 'https://static.msport.com/gh/main/js/match-detail.336002c8.js', 'https://static.msport.com/gh/main/js/index.7a2d9df5.js'];
  for (const u of urls) { try { const t = await (await p.request.get(u)).text(); fs.writeFileSync('out/' + u.split('/').pop(), t); } catch (e) {} }
  const api = 'https://www.msport.com/api/gh/facts-center/query/frontend';
  const j = await (await p.request.get(`${api}/live-matches/list?sportId=sr:sport:1`, { headers: { operId: '3' } })).json();
  const e = j.data.tournaments.flatMap((t) => t.events)[0];
  fs.writeFileSync('out/id.txt', e.eventId);
  const tries = ['match/detail', 'match/timeline', 'match/events', 'match/statistics', 'match/stats', 'event/timeline', 'live-event/timeline', 'match/incidents', 'match/live-data'];
  for (const t of tries) { const r = await p.request.get(`${api}/${t}?eventId=${e.eventId}`, { headers: { operId: '3' } }); fs.appendFileSync('out/tries.txt', `${r.status()} ${t} ${(await r.text()).slice(0, 300)}\n`); }
  await b.close();
})();

const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', viewport: { width: 412, height: 900 } });
  const p = await ctx.newPage();
  const log = [];
  let n = 0;
  p.on('request', (q) => { if (/api\/gh|sportradar|gismo|widget/i.test(q.url())) log.push({ req: q.url(), m: q.method(), h: q.headers(), post: q.postData() && q.postData().slice(0, 600) }); });
  p.on('response', async (r) => {
    const u = r.url();
    if (/google|doubleclick|facebook|\.png|\.svg|\.webp|\.jpg|\.woff|\.css/.test(u)) return;
    let buf = null;
    try { buf = await r.body(); } catch {}
    const txt = buf ? buf.toString() : '';
    log.push({ n: ++n, u, s: r.status(), t: r.request().resourceType(), len: buf ? buf.length : 0 });
    if (/api\/gh|sportradar|gismo|stat-widgets|match-detail|lmt/i.test(u)) fs.writeFileSync(`out/h${n}.txt`, u + '\n\n' + txt.slice(0, 600000));
  });
  p.on('websocket', (ws) => { log.push({ ws: ws.url() }); let k = 0; ws.on('framereceived', (f) => { if (k++ < 200) fs.appendFileSync('out/ws.txt', '<- ' + String(f.payload).slice(0, 3000) + '\n'); }); ws.on('framesent', (f) => fs.appendFileSync('out/ws.txt', '-> ' + String(f.payload).slice(0, 1000) + '\n')); });
  // pick a live soccer match from the API
  const api = 'https://www.msport.com/api/gh/facts-center/query/frontend';
  let url = null;
  try {
    const j = await (await p.request.get(`${api}/live-matches/list?sportId=sr:sport:1`, { headers: { operId: '3' } })).json();
    const evs = j.data.tournaments.flatMap((t) => t.events.map((e) => ({ ...e, tn: t.name, cat: t.category })));
    const e = evs.find((x) => x.hasLiveWidget) || evs[0];
    const slug = (s) => String(s).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    url = `https://www.msport.com/gh/sports/Soccer/live/${slug(e.cat + ' ' + (e.tn || e.tournament || ''))}/${slug(e.homeTeam)}_vs_${slug(e.awayTeam)}/${e.eventId}`;
    log.push({ pick: e.eventId, home: e.homeTeam, away: e.awayTeam, keys: Object.keys(e) });
  } catch (e) { log.push({ err: String(e) }); }
  log.push({ url });
  await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => log.push({ err: String(e) }));
  await p.waitForTimeout(25000);
  await p.screenshot({ path: 'out/match.png' });
  fs.writeFileSync('out/match.html', await p.content());
  const frames = p.frames().map((f) => f.url());
  log.push({ frames });
  await p.mouse.wheel(0, 600); await p.waitForTimeout(3000); await p.screenshot({ path: 'out/match2.png' });
  fs.writeFileSync('out/log.json', JSON.stringify(log, null, 1));
  await b.close();
})();

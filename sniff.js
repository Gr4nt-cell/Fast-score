const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const api = 'https://www.msport.com/api/gh/facts-center/query/frontend';
  const b = await chromium.launch();
  const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', viewport: { width: 412, height: 900 } });
  const p = await ctx.newPage();
  const log = [];
  let n = 0;
  p.on('response', async (r) => {
    const t = r.request().resourceType();
    if (!['xhr', 'fetch', 'websocket', 'other', 'document', 'script'].includes(t)) return;
    const u = r.url();
    if (t === 'script' && !/msport|tracker|lmt|sportradar|betradar|widget|anim/i.test(u)) return;
    let len = 0;
    try { const buf = await r.body(); len = buf.length; if (t !== 'script' || /tracker|lmt|sportradar|betradar|anim|live/i.test(u)) fs.writeFileSync(`out/r${++n}.txt`, u + '\n\n' + buf.slice(0, 200000).toString()); } catch {}
    log.push({ n, u, s: r.status(), t, len });
  });
  p.on('websocket', (ws) => { log.push({ ws: ws.url() }); let k = 0; ws.on('framereceived', (f) => { if (k++ < 40) fs.appendFileSync('out/ws.txt', ws.url() + ' <- ' + String(f.payload).slice(0, 1500) + '\n'); }); ws.on('framesent', (f) => fs.appendFileSync('out/ws.txt', ws.url() + ' -> ' + String(f.payload).slice(0, 800) + '\n')); });
  // a live football match
  const lr = await p.request.get(`${api}/live-matches/list?sportId=sr:sport:1`, { headers: { operId: '3' } }).catch(() => null);
  let ev = null;
  try { const j = await lr.json(); fs.writeFileSync('out/live.json', JSON.stringify(j).slice(0, 300000)); const ts = j.data.tournaments || j.data; for (const t of ts) { for (const e of (t.events || [])) { ev = ev || e; } } } catch (e) { log.push({ err: String(e) }); }
  log.push({ ev: ev && { id: ev.eventId, home: ev.homeTeam, away: ev.awayTeam } });
  if (ev) {
    const url = `https://www.msport.com/gh/sports/football/live/${encodeURIComponent(ev.eventId)}`;
    log.push({ open: url });
    await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => log.push({ err: String(e) }));
    await p.waitForTimeout(15000);
    await p.screenshot({ path: 'out/match.png', fullPage: true });
    fs.writeFileSync('out/match.html', await p.content());
  }
  fs.writeFileSync('out/log.json', JSON.stringify(log, null, 1));
  await b.close();
})();

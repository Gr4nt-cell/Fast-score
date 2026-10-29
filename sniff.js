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
  for (const lu of ['https://www.msport.com/gh/live', 'https://www.msport.com/gh/sports/football/live', 'https://www.msport.com/gh/sports/live']) {
    await p.goto(lu, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => log.push({ err: String(e) }));
    await p.waitForTimeout(4000);
    const links = await p.evaluate(() => [...document.querySelectorAll('a')].map((a) => a.href).filter((h) => /match/.test(h)).slice(0, 10));
    log.push({ lu, status: p.url(), links });
    if (links.length) { await p.goto(links[0], { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {}); break; }
    // try clicking an event row
    const el = await p.$('[class*=event], [class*=match]');
    if (el) { await el.click().catch(() => {}); await p.waitForTimeout(5000); log.push({ clicked: p.url() }); if (/sr:match|sr%3Amatch|match/.test(p.url())) break; }
  }
  await p.waitForTimeout(15000);
  log.push({ final: p.url() });
  await p.screenshot({ path: 'out/match.png', fullPage: false });
  fs.writeFileSync('out/match.html', await p.content());
  // the live widget may be in a tab
  for (const txt of ['Tracker', 'Live', 'Match Tracker', 'Stats']) { const el = await p.$(`text=${txt}`); if (el) { await el.click().catch(() => {}); await p.waitForTimeout(6000); } }
  await p.screenshot({ path: 'out/match2.png', fullPage: false });
  // sportradar gismo feeds
  if (ev) {
    const id = String(ev.eventId).replace(/\D/g, '');
    for (const f of ['match_timeline', 'match_info', 'match_detailsextended', 'match_timelinedelta']) {
      for (const c of ['common', 'msport', 'sportybet']) {
        const u = `https://lmt.fn.sportradar.com/${c}/en/Etc:UTC/gismo/${f}/${id}`;
        const r = await p.request.get(u).catch(() => null);
        const t = r ? await r.text() : '';
        log.push({ gismo: u, s: r && r.status(), len: t.length });
        if (r && r.status() === 200) fs.writeFileSync(`out/g_${c}_${f}.json`, t.slice(0, 300000));
      }
    }
  }
  fs.writeFileSync('out/log.json', JSON.stringify(log, null, 1));
  await b.close();
})();

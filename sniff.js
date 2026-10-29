const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const CID = '2bf1d295f2fa7b2716d4520cf5db47d5';
  const api = 'https://www.msport.com/api/gh/facts-center/query/frontend';
  const b = await chromium.launch();
  const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', viewport: { width: 412, height: 900 } });
  const p = await ctx.newPage();
  const log = [];
  let n = 0;
  p.on('requestfailed', (q) => log.push({ failed: q.url(), why: q.failure() && q.failure().errorText }));
  p.on('response', async (r) => {
    const u = r.url();
    if (!/sportradar/.test(u)) return;
    let buf = null; try { buf = await r.body(); } catch {}
    log.push({ n: ++n, u, s: r.status(), len: buf ? buf.length : 0, h: r.request().headers() });
    if (buf && /gismo|feed|\.json/.test(u)) fs.writeFileSync(`out/s${n}.json`, u + '\n\n' + buf.toString().slice(0, 200000));
  });
  const j = await (await p.request.get(`${api}/live-matches/list?sportId=sr:sport:1`, { headers: { operId: '3' } })).json();
  const evs = j.data.tournaments.flatMap((t) => t.events);
  const e = evs.find((x) => x.hasLiveWidget) || evs[0];
  const id = e.eventId.replace(/\D/g, '');
  log.push({ id, home: e.homeTeam, away: e.awayTeam });
  // 1) our own page, pretending to be msport (as an app WebView with baseUrl would)
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#111">
<div id="lmt" style="width:100%"></div>
<script>(function(a,b,c,d,e,f,g,h,i){a[e]||(i=a[e]=function(){(a[e].q=a[e].q||[]).push(arguments)},i.l=1*new Date,i.o=f,
g=b.createElement(c),h=b.getElementsByTagName(c)[0],g.async=1,g.src=d,g.setAttribute("n",e),h.parentNode.insertBefore(g,h)
)})(window,document,"script","https://widgets.sir.sportradar.com/${CID}/widgetloader","SIR",{theme:false,language:"en"});
SIR("addWidget","#lmt","match.lmtPlus",{layout:"single",matchId:${id},scoreboard:"disable",detailedScoreboard:"disable",tabsPosition:"disable",collapseTo:"disable",momentum:"bottom"});</script></body></html>`;
  await p.route('https://www.msport.com/fs-widget-test', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await p.goto('https://www.msport.com/fs-widget-test', { waitUntil: 'networkidle', timeout: 60000 }).catch((er) => log.push({ err: String(er) }));
  await p.waitForTimeout(20000);
  await p.screenshot({ path: 'out/w_msport.png' });
  // 2) same page from another origin
  await p.route('https://example.com/fs-widget-test', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  log.push({ mark: 'OTHER ORIGIN' });
  await p.goto('https://example.com/fs-widget-test', { waitUntil: 'networkidle', timeout: 60000 }).catch((er) => log.push({ err: String(er) }));
  await p.waitForTimeout(20000);
  await p.screenshot({ path: 'out/w_other.png' });
  fs.writeFileSync('out/log.json', JSON.stringify(log, null, 1));
  await b.close();
})();

const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', viewport: { width: 412, height: 900 } });
  const p = await ctx.newPage();
  const log = [];
  let n = 0;
  p.on('response', async (r) => {
    const req = r.request();
    const t = req.resourceType();
    if (!['xhr', 'fetch', 'websocket', 'other'].includes(t)) return;
    let body = '';
    try { const buf = await r.body(); body = buf.slice(0, 1500).toString('base64'); fs.writeFileSync(`out/r${++n}.bin`, buf); } catch {}
    log.push({ n, url: r.url(), status: r.status(), method: req.method(), type: t, ct: r.headers()['content-type'], reqHeaders: req.headers(), post: req.postData() && req.postData().slice(0, 500) });
  });
  p.on('websocket', (ws) => { log.push({ ws: ws.url() }); ws.on('framereceived', (f) => { if (log.filter((x) => x.frame).length < 20) log.push({ frame: String(f.payload).slice(0, 300) }); }); });
  await p.goto('https://m.aiscore.com/en', { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => log.push({ err: String(e) }));
  await p.waitForTimeout(8000);
  fs.writeFileSync('out/page.html', await p.content());
  await p.screenshot({ path: 'out/home.png' });
  // open first match
  const href = await p.evaluate(() => { const a = [...document.querySelectorAll('a')].find((x) => /match/.test(x.href)); return a && a.href; });
  log.push({ firstMatch: href });
  if (href) { await p.goto(href, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(6000); await p.screenshot({ path: 'out/match.png' }); fs.writeFileSync('out/match.html', await p.content()); }
  fs.writeFileSync('out/log.json', JSON.stringify(log, null, 1));
  await b.close();
})();

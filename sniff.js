const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', viewport: { width: 412, height: 900 } });
  const p = await ctx.newPage();
  const log = [];
  let n = 0;
  p.on('response', async (r) => {
    const u = r.url();
    if (/google|doubleclick|facebook|\.png|\.svg|\.webp|\.jpg|\.woff/.test(u)) return;
    let buf = null;
    try { buf = await r.body(); } catch {}
    const txt = buf ? buf.toString() : '';
    const hit = /sportradar|gismo|lmt|widgetloader|sir\./i.test(u + txt.slice(0, 400000));
    log.push({ n: ++n, u, s: r.status(), t: r.request().resourceType(), len: buf ? buf.length : 0, hit });
    if (hit || /sportradar|gismo/.test(u)) fs.writeFileSync(`out/h${n}.txt`, u + '\n\n' + txt.slice(0, 400000));
  });
  p.on('websocket', (ws) => log.push({ ws: ws.url() }));
  await p.goto('https://www.msport.com/gh/sports/football', { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => log.push({ err: String(e) }));
  await p.waitForTimeout(5000);
  const links = await p.evaluate(() => [...new Set([...document.querySelectorAll('a')].map((a) => a.href))]);
  fs.writeFileSync('out/links.txt', links.join('\n'));
  const live = links.filter((h) => /live/i.test(h)).slice(0, 5);
  log.push({ live });
  const liveUrl = links.find((h) => /\/live\/?$|live-betting|inplay/i.test(h)) || live[0];
  if (liveUrl) {
    await p.goto(liveUrl, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(5000);
    const l2 = await p.evaluate(() => [...new Set([...document.querySelectorAll('a')].map((a) => a.href))]);
    fs.writeFileSync('out/links_live.txt', l2.join('\n'));
    const ev = l2.find((h) => /sr(:|%3A)match/i.test(h)) || l2.find((h) => /\/\d{6,}/.test(h));
    log.push({ liveUrl, ev });
    if (ev) {
      await p.goto(ev, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
      await p.waitForTimeout(20000);
      await p.screenshot({ path: 'out/match.png' });
      fs.writeFileSync('out/match.html', await p.content());
    }
  }
  fs.writeFileSync('out/log.json', JSON.stringify(log, null, 1));
  await b.close();
})();

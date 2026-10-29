// Public pages for the store listing: privacy policy and child safety standards.
// Served by the Worker at /privacy and /child-safety.

const UPDATED = '29 October 2026';
const CONTACT = 'gstephen116@gmail.com';
const DEV = 'Gr4nt';

const page = (title, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Fast Score</title>
<style>
:root{--bg:#f5f5f7;--card:#fff;--text:#1d1d1f;--muted:#6e6e73;--line:#e5e5ea;--accent:#0a84ff}
@media (prefers-color-scheme:dark){:root{--bg:#000;--card:#1c1c1e;--text:#f5f5f7;--muted:#a1a1a6;--line:#2c2c2e;--accent:#0a84ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 16px 64px}
.card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:24px 22px;margin:16px 0}
h1{font-size:30px;line-height:1.2;margin:8px 0 4px;letter-spacing:-.4px}h2{font-size:19px;margin:0 0 8px}
p,li{color:var(--text)}.muted{color:var(--muted);font-size:14px}ul{padding-left:20px;margin:6px 0}li{margin:4px 0}
a{color:var(--accent)}nav{display:flex;gap:16px;font-size:14px}
table{width:100%;border-collapse:collapse;font-size:14.5px}td,th{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}
</style></head><body><main>
<nav><a href="/privacy">Privacy policy</a><a href="/child-safety">Child safety</a></nav>
<h1>${title}</h1><p class="muted">Fast Score · by ${DEV} · Last updated ${UPDATED}</p>
${body}
</main></body></html>`;

export const PRIVACY = page(
  'Privacy policy',
  `
<div class="card"><h2>In short</h2>
<ul>
<li>Fast Score has <strong>no accounts</strong> and asks for <strong>no personal information</strong> (no name, email, phone number, contacts, photos or location).</li>
<li>Your favourites, settings, AI Picks history and recent searches are stored <strong>only on your phone</strong>.</li>
<li>There are <strong>no ads, no analytics and no tracking</strong>. We do not sell or share personal data.</li>
</ul></div>

<div class="card"><h2>Who we are</h2>
<p>Fast Score is a free live-score app made by ${DEV} ("we"). Questions about this policy: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p></div>

<div class="card"><h2>What is stored on your device</h2>
<p>To work, the app keeps the following on your phone, in the app's private storage. It never leaves the device and is deleted when you uninstall the app or clear its data:</p>
<ul>
<li>Teams, matches, players and competitions you follow or pin; your settings (theme, sport, odds format, notifications).</li>
<li>Your recent searches, and the AI Picks made on your phone with their results.</li>
<li>Copies of sports data (fixtures, scores, tables, odds) so screens load quickly and work offline.</li>
</ul></div>

<div class="card"><h2>Where the app gets sports data</h2>
<p>To show scores, tables and odds, the app requests public sports data from these services. These requests contain <strong>no personal information</strong>, only what is needed to fetch the data (for example a match or competition id). Like any website, these services receive your device's IP address and basic technical information as part of the internet connection; their own privacy policies apply.</p>
<table><tr><th>Service</th><th>Used for</th></tr>
<tr><td>Live sports data providers</td><td>Fixtures, live scores, match events, statistics, line-ups, tables, momentum</td></tr>
<tr><td>MSport Ghana (msport.com)</td><td>Bookmaker odds</td></tr>
<tr><td>ESPN public APIs, TheSportsDB</td><td>Back-up sports data and news</td></tr>
<tr><td>SofaScore (only if chosen as a data source)</td><td>Sports data, opened in a hidden in-app browser page, which may store that site's cookies on your device</td></tr>
<tr><td>GitHub (raw.githubusercontent.com)</td><td>The app's lists of competitions and odds</td></tr>
<tr><td>Fast Score server (Cloudflare Workers)</td><td>A shared cache of sports data. Cloudflare processes IP addresses to deliver and protect the service; we keep no logs that identify you</td></tr>
</table></div>

<div class="card"><h2>Notifications</h2>
<p>If you allow notifications, alerts for matches you follow are created <strong>on your phone</strong>: the app (and its live-score service while a followed match is on) checks the score and shows the alert locally. No push token or identifier is sent to us or anyone else. You can turn alerts off in the app's Settings or in your phone's settings at any time.</p></div>

<div class="card"><h2>Permissions</h2>
<ul>
<li><strong>Internet / network state</strong>: to load sports data.</li>
<li><strong>Notifications</strong>: to alert you about matches you follow (optional).</li>
<li><strong>Foreground service, exact alarms, run at start-up, wake lock</strong>: so live alerts start at kick-off and keep running while a followed match is on, even with the app closed. The service shows a visible notification while it runs and stops when the match ends.</li>
<li><strong>Vibration</strong>: for alert vibration.</li>
</ul>
<p>The app does not use your location, camera, microphone, contacts, photos or files.</p></div>

<div class="card"><h2>Odds and AI Picks</h2>
<p>Bookmaker odds are shown for information only. Fast Score does not take bets, process payments or link your betting accounts. AI Picks are statistical estimates made on your phone, not betting advice. Gambling is for adults (18+) only; please bet responsibly.</p></div>

<div class="card"><h2>Children</h2>
<p>Fast Score is intended for users aged 18 and over because it shows betting odds. We do not knowingly collect any personal information from anyone, including children. See our <a href="/child-safety">child safety standards</a>.</p></div>

<div class="card"><h2>Your choices and rights</h2>
<p>Because we hold no personal data about you, there is nothing for us to access, correct or delete on our side. You can delete everything the app stores at any time with <em>Settings → Clear cached data</em>, by clearing the app's storage in your phone's settings, or by uninstalling the app. For any question or request, contact <a href="mailto:${CONTACT}">${CONTACT}</a>. This applies wherever you live, including under the GDPR, the UK GDPR, Ghana's Data Protection Act 2012 (Act 843) and US state privacy laws.</p></div>

<div class="card"><h2>Security</h2>
<p>All data is fetched over encrypted connections (HTTPS). Data stored on your phone is kept in the app's private storage, which other apps cannot read.</p></div>

<div class="card"><h2>Changes</h2>
<p>If this policy changes, the new version will be posted on this page with a new "Last updated" date.</p></div>
`
);

export const CHILD_SAFETY = page(
  'Child safety standards',
  `
<div class="card"><h2>Our standards</h2>
<p>${DEV}, the developer of Fast Score, has zero tolerance for child sexual abuse and exploitation (CSAE) and child sexual abuse material (CSAM). We prohibit any use of Fast Score that endangers children.</p></div>

<div class="card"><h2>About the app</h2>
<ul>
<li>Fast Score shows sports scores, statistics and bookmaker odds. It is intended for adults aged <strong>18 and over</strong> and is not designed for or directed at children.</li>
<li>The app has <strong>no user accounts, chat, messaging, comments, profiles, photo or video sharing</strong>, or any other way for users to contact each other or publish content. All content comes from sports data providers.</li>
</ul></div>

<div class="card"><h2>Reporting</h2>
<p>If you see anything in Fast Score that could put a child at risk, or have any child safety concern, contact us at <a href="mailto:${CONTACT}">${CONTACT}</a>. We review every report promptly, remove offending content where we are able to, and cooperate with law enforcement.</p>
<p>We comply with applicable child safety laws and report apparent child sexual abuse material to the relevant authorities, including the National Center for Missing &amp; Exploited Children (NCMEC) and national law enforcement, such as the Ghana Police Service.</p></div>

<div class="card"><h2>Contact for child safety</h2>
<p>${DEV} · <a href="mailto:${CONTACT}">${CONTACT}</a></p></div>
`
);

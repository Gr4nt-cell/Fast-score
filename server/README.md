# Fast Score server

Cloudflare Worker + D1 database, free plan. Live at https://fast-score.gstephen116.workers.dev

- Deployed by Cloudflare's GitHub integration on every push (config: `/wrangler.toml`).
- A timer runs every minute: competitions with games in play are refreshed every run, the rest in
  rotation; only changes are written. Finished games are kept as history.
- The app finds the server through `server/url.json`.

| Endpoint | What it returns |
|---|---|
| `/v1/status` | games stored, live now, last timer run and its result |
| `/v1/day?sport=soccer&date=YYYYMMDD&tz=0` | a sport's whole day, grouped by competition |
| `/v1/results?sport=soccer&league=eng.1&days=60` | finished games, compact |
| `/v1/sync` | runs one sync now (at most once a minute) |
| `/apis/...` | any ESPN API path, cached at Cloudflare's edge |

The **Check server** workflow (Actions tab) reports the status after each server change and every 6 hours.

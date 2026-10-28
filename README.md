# Fast Score

A SofaScore-style live score app for Android with the Liquid Glass look of the iDialer app: a floating glass dock, glass panels and the same month-and-day calendar strip.

## Features

- **Live scores** for football, basketball, tennis, American football, baseball, ice hockey, MMA, motorsport, golf, rugby and volleyball — 70+ competitions, auto-refreshing while games are live
- **Calendar navigation** (Sept · Oct · Nov over a scrolling row of days), a Live filter and a sport switcher
- **Match pages**: score header with scorers, match events timeline, lineups on a pitch with formations, substitutes, box scores, team statistics with possession, live commentary / play-by-play, standings with both teams highlighted, head-to-head and form, odds, ESPN win probability, venue, referee, attendance, news
- **Competition pages**: fixtures by day, tables (zones coloured), news, teams
- **Team pages**: next match, results, fixtures, squad, table position, form
- **Player pages**: profile, season stats, recent games
- **AI Picks**: a daily top 5 built on the phone from a Poisson goals model (football) or log5 + points difference (other sports), blended with bookmaker odds. Picks lock at the first kick-off and are scored afterwards, so the app shows an honest 14-day track record. Every match page also gets its own prediction (1X2, expected goals, over 2.5, both teams to score).
- **Favourites**: follow matches, teams, players and pin competitions to the top; in-app banner + buzz on goals, kick-off and full time
- **Search** across teams, players and competitions
- Light / dark / system theme, Liquid Glass on/off, decimal / fractional / American odds

## Data

Two free sources, no keys or sign-up:

1. **ESPN's public sports API** (`site.api.espn.com` / `site.web.api.espn.com`) — the main source: live clock, lineups, stats, commentary, odds, news.
2. **TheSportsDB** (free key `123`) — used automatically if ESPN can't be reached (the app says "via TheSportsDB" under the title). It has scores, tables, lineups, match events and stats, but no odds or news, and its free tier allows ~30 calls a minute, so the app spaces its requests.

Settings → Data source lets you force either one.

## Building with Codemagic

1. Sign in at [codemagic.io](https://codemagic.io) with GitHub → **Add application** → pick `Gr4nt-cell/Fast-score` → choose **codemagic.yaml**.
2. **Start new build** → workflow **Fast Score APK**, branch `main`.
3. The APK (`fast-score.apk`) appears under the build's Artifacts and is emailed to you. Every later push to `main` builds by itself.

If Codemagic says the `linux_x2` machine isn't on your plan, change `instance_type` to `mac_mini_m2` in `codemagic.yaml`.

For the Play Store, add a keystore in Codemagic (Teams → Code signing identities → Android keystores, reference name `fastscore`) and run **Fast Score App Bundle**.

A GitHub Actions workflow is also included but only runs when started by hand (Actions → Build APK → Run workflow), since Actions needs billing on private repos.

Local development: `npm install`, then `npx expo run:android`.

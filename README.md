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

ESPN's public sports API (`site.api.espn.com` / `site.web.api.espn.com`): free, no key, no sign-up. Nothing to configure.

## Building

Every push to `main` builds a release APK on GitHub Actions (`.github/workflows/build-apk.yml`) and attaches it to the **latest** release of this repo as `fast-score.apk` (also kept as a workflow artifact). You can also run it from the Actions tab with *Run workflow*.

Local development: `npm install`, then `npx expo run:android`.

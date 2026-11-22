# Fast Score

Android live scores with the dialer’s liquid glass material, Pearl Mist background and AMOLED dark mode. Sports data comes from Flashscore; MSport supplies prices only.

## AI Picks v5

The on-device statistical engine uses up to 20 verified prior results, date/venue weights, conservative sample shrinkage, a normalized football score distribution and uncertainty adjustments. Football selections cover 1X2, double chance, draw-no-bet, total goals from 0.5 to 4.5, both teams to score, team totals and win-to-nil; all probabilities come from the same score grid. Other supported team sports use regularized form and scoring margins for their supported result markets.

Daily selection prioritizes uncertainty-adjusted probability, checks real MSport prices when available, and saves up to five eligible matches with at most two per competition and no repeated teams. It may abstain or return fewer than five when evidence or prices are unsuitable. These are uncalibrated estimates, not guarantees of a winning rate; improved accuracy has not yet been established against an independent chronological dataset.

Genuine forecasts are saved before kickoff with their original model version. The v5 track record includes only settled v5 forecasts and reports a Brier probability score. Legacy simulations and older model versions are excluded. Historical dates with no saved forecast stay empty.

## Live updates and connection handling

An open live match refreshes its lightweight score feed every 3 seconds while the app is in the foreground, with slower detail updates, overlap protection, stale-response protection and immediate resume checks. A failed refresh keeps the last valid score visible and reports the interruption. Statistics, lineups and other match sections retain previously loaded data during temporary failures and distinguish provider-empty responses from request errors. Scoreboards use less frequent bounded refreshes because they download entire match lists.

## Notifications and smoothness

Four bounded native request workers process score responses as they arrive, with incident details fetched separately. Active/near-kickoff rounds target 8 seconds; foreground checks target 5 seconds. Requests have timeouts, fair rotating batches and a round deadline. Source publication, network conditions, followed-list size and Android/OEM policy still determine delivery latency. A server push pipeline is not configured.

Static Pearl Mist artwork and sheen replace animated background/per-card scroll effects. Blur, shadows and list batching adapt to device capability.

## Validation and builds

Run `npm ci`, `node scripts/check-syntax.cjs`, `node --test tests/*.test.js` (Node 24), or `node --experimental-default-type=module --test tests/*.test.js` (Node 22). `npx expo export --platform android --no-bytecode` checks the bundle. PR validation compiles/tests the native module and runs strict Android lint.

Main builds signed APK/AAB files through GitHub Actions using the repository’s existing signing secrets. See `design/forecast-glass-alerts-audit.md` for the audit scope and device-testing limits.

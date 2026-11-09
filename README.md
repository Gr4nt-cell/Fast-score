# Fast Score

Android live scores with the dialer’s liquid glass material, Pearl Mist background and AMOLED dark mode. Sports data comes from Flashscore; MSport supplies prices only.

## AI Picks v3

A new on-device statistical engine uses up to 20 verified prior results, date/venue weights, conservative sample shrinkage, a normalized football score distribution and uncertainty adjustments. Other supported team sports use regularized form and scoring margins. It may abstain or return fewer than five picks when evidence is weak. These are uncalibrated estimates; improved accuracy has not yet been established against an independent chronological dataset.

Genuine forecasts are saved before kickoff with their original model version. The v3 track record includes only settled v3 forecasts and reports a Brier probability score. Legacy simulations are labelled and excluded. Historical dates with no saved forecast stay empty.

## Notifications and smoothness

Four bounded native request workers process score responses as they arrive, with incident details fetched separately. Active/near-kickoff rounds target 8 seconds; foreground checks target 5 seconds. Requests have timeouts, fair rotating batches and a round deadline. Source publication, network conditions, followed-list size and Android/OEM policy still determine delivery latency. A server push pipeline is not configured.

Static Pearl Mist artwork and sheen replace animated background/per-card scroll effects. Blur, shadows and list batching adapt to device capability.

## Validation and builds

Run `npm ci`, `node scripts/check-syntax.cjs`, `node --test tests/*.test.js` (Node 24), or `node --experimental-default-type=module --test tests/*.test.js` (Node 22). `npx expo export --platform android --no-bytecode` checks the bundle. PR validation compiles/tests the native module and runs strict Android lint.

Main builds signed APK/AAB files through GitHub Actions using the repository’s existing signing secrets. See `design/forecast-glass-alerts-audit.md` for the audit scope and device-testing limits.

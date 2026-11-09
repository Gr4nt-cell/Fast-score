# Fast Score rebuild and source audit

Baseline main: 8688e7eac30aa2da2df8f338f4f8bbc1d3875c3f.

## Forecast engine v3

Replaces the previous inference implementation with a deterministic, independently testable statistical core. Up to 20 verified prior games are deduplicated, time-cut off, and weighted by actual age and venue. Missing scores are not zeroes. Sparse samples are regularized; neutral matches do not receive home advantage. Football probabilities come from one normalized score grid with a conservative low-score adjustment and parameter-uncertainty mixture. Other supported team sports use shrunk form and scoring margins. Competition priors remain bounded and are not described as official ratings or learned ratings. Prices remain a separate MSport display feature, preserving the Flashscore-only sports-data policy.

Daily selection models a bounded candidate set (100) with three workers, at most two picks per competition and no repeated teams. It may return fewer than five picks. This limits network/UI work and does not claim an exhaustive optimum across all fixtures.

Forecasts are saved before kickoff and remain immutable, with model version and evidence recorded. New historical dates are never fabricated into a track record. Legacy historical simulations remain labelled and excluded. The v3 record scores genuine v3 forecasts only, using settled counts and Brier scores. Regulation-time markets with only an extra-time/penalty final remain unresolved rather than misgraded. The engine is uncalibrated; accuracy superiority has not been established without an independent, chronological evaluation dataset.

## Glass and performance

Ports the dialer's glass material and its exact compact Pearl Mist artwork. Dark mode remains AMOLED black. One static background texture and static sheen replace animated full-screen and per-card scroll highlights. Blur remains bounded to opted-in surfaces and disabled on low-end hardware. Device capability now actually controls the automatic renderer instead of forcing every phone into one profile. Touch feedback uses short native timing animations without spring overshoot. List batching remains bounded. Root storage types and saved favorite arrays are checked before use.

## Notification path

The previous native loop waited for each match and its incident feed, then delayed another 15 seconds. The new loop uses four bounded request workers, processes ready score responses immediately, and fetches details separately. Network timeouts, a 7.5-second round budget, cancellation, and rotating 12-match batches prevent a slow source or a long followed list from monopolizing a round. Active/near-kickoff cadence targets 8 seconds from round start; quiet pre-match cadence is 30 seconds. Very large watch lists need multiple rounds. Foreground checks target 5 seconds. These are scheduling targets, not delivery guarantees.

Repeated service starts no longer multiply polling loops. Failed foreground startup does not claim monitoring is active. Fallback suppression checks recent native polling health. Notification kinds use separate stable tags, preventing a goal and final notification in the same second from overwriting each other. Identical immediate native alerts are deduplicated. Score reversals are corrections; a 0–0 kickoff is not a goal; the final score and final whistle can both be retained.

This app has no configured server push pipeline. Provider publication times, network/rate limits and Android/OEM background policy still bound real-world latency. No unsupported promise of instant or universally fastest delivery is made.

## Validation

JavaScript parse, export and regression tests; deterministic probability/coherence, cutoff, missing-data, symmetry, archive/Brier, watcher-event and native scheduling tests. Native compilation, unit tests and strict lint run in the PR workflow. Real device rendering/cadence and event-to-notification latency still require testing on the target phone.

Model background: Dixon & Coles (1997), doi:10.1111/1467-9876.00065. The low-score correction here is a conservative prior, not a claim that that paper's full regression has been fitted to this application's data.

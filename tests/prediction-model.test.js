import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPrediction,
  choosePick,
  forecastMetrics,
  goalDistribution,
  isForecastArchive,
  judgeScore,
  marketPrice,
  MODEL_VERSION,
  PICK_RULES,
  PICK_RULES_RELAXED,
  summarizeHistory,
  validScore,
} from '../src/prediction/model.js';

const kickoff = Date.UTC(2026, 10, 10), day = 86400000;
const match = { sport: 'soccer', kind: 'match', home: { id: 'h', name: 'Home' }, away: { id: 'a', name: 'Away' }, date: new Date(kickoff).toISOString(), neutral: true };
const games = (gf = 2, ga = 1, n = 20) => Array.from({ length: n }, (_, i) => ({ key: String(i), date: new Date(kickoff - (i + 1) * day).toISOString(), gf, ga, home: i % 2 === 0, opponent: 'op' + i }));

test('a missing score is never interpreted as a clean sheet or 0–0 result', () => {
  for (const value of [null, undefined, '', false, NaN, Infinity, -1, 1.5]) assert.equal(validScore(value), null);
  assert.equal(validScore('0'), 0);
  assert.equal(validScore(3), 3);
});

test('future, duplicate, invalid and year-old matches do not enter model evidence', () => {
  const rows = games();
  rows.push(rows[0], { ...rows[0], key: 'future', date: new Date(kickoff + day).toISOString() },
    { ...rows[0], key: 'old', date: new Date(kickoff - 400 * day).toISOString() }, { ...rows[0], key: 'missing', gf: null });
  const summary = summarizeHistory(rows, null, kickoff);
  assert.equal(summary.n, 20);
  assert(summary.eff > 15 && summary.eff <= 20);
});

test('normalized score grids produce coherent result, totals, team totals and BTTS probabilities', () => {
  const complementary = [
    ['over05', 'under05'], ['over15', 'under15'], ['over', 'under'], ['over35', 'under35'], ['over45', 'under45'],
    ['btts', 'bttsNo'], ['homeOver05', 'homeUnder05'], ['homeOver15', 'homeUnder15'],
    ['awayOver05', 'awayUnder05'], ['awayOver15', 'awayUnder15'],
  ];
  for (const h of [.2, .8, 1.35, 2.5, 4]) for (const a of [.2, 1, 3, 4]) {
    const p = goalDistribution(h, a);
    assert(Math.abs(p.home + p.draw + p.away - 1) < 1e-10);
    for (const value of Object.values(p)) assert(Number.isFinite(value) && value >= 0 && value <= 1 + 1e-12);
    for (const [over, under] of complementary) assert(Math.abs(p[over] + p[under] - 1) < 1e-10, `${over}/${under}`);
    assert(p.over15 >= p.over);
    assert(p.over35 >= p.over45);
    assert(p.under35 >= p.under);
    assert(p.homeWinToNil <= p.home);
    assert(p.awayWinToNil <= p.away);
    const swapped = goalDistribution(a, h);
    assert(Math.abs(p.home - swapped.away) < 1e-10);
    assert(Math.abs(p.homeOver15 - swapped.awayOver15) < 1e-10);
  }
});

test('football exposes every supported score-derived selection from one model', () => {
  const prediction = buildPrediction(match, games(), games(), { asOf: kickoff });
  const expected = [
    'home', 'draw', 'away', 'dc1x', 'dc12', 'dcx2', 'dnbHome', 'dnbAway',
    'over05', 'under05', 'over15', 'under15', 'over', 'under', 'over35', 'under35', 'over45', 'under45',
    'btts', 'bttsNo', 'homeOver05', 'homeUnder05', 'homeOver15', 'homeUnder15',
    'awayOver05', 'awayUnder05', 'awayOver15', 'awayUnder15', 'homeWinToNil', 'awayWinToNil',
  ];
  assert.equal(prediction.modelVersion, MODEL_VERSION);
  assert.deepEqual(new Set(prediction.candidates.map(c => c.side)), new Set(expected));
  assert.equal(prediction.candidates.length, expected.length);
  const dnbHome = prediction.candidates.find(c => c.side === 'dnbHome');
  const dnbAway = prediction.candidates.find(c => c.side === 'dnbAway');
  assert(Math.abs(dnbHome.prob + dnbAway.prob - 1) < 1e-10);
});

test('neutral identical teams are symmetric; stronger scoring form moves the estimate', () => {
  const equal = buildPrediction(match, games(), games(), { asOf: kickoff });
  assert(equal);
  assert(Math.abs(equal.probs.home - equal.probs.away) < 1e-10);
  const strong = buildPrediction(match, games(3, 0), games(0, 3), { asOf: kickoff });
  assert(strong.probs.home > equal.probs.home);
  assert.equal(strong.calibration, 'unvalidated');
});

test('sparse and stale data abstain; a future kickoff cannot admit results after asOf', () => {
  assert.equal(buildPrediction(match, games(1, 1, 3), games(), { asOf: kickoff }), null);
  assert.equal(buildPrediction(match, games().map(g => ({ ...g, date: new Date(kickoff - 200 * day).toISOString() })), games(), { asOf: kickoff }), null);
  assert.equal(buildPrediction({ ...match, date: new Date(kickoff + 30 * day) }, games(), games(), { asOf: kickoff - 25 * day }), null);
});

test('track record excludes hindsight simulations, invalid archives, voids and older models', () => {
  const pick = { date: new Date(kickoff).toISOString(), tip: { prob: .8 }, result: true, modelVersion: MODEL_VERSION };
  const archive = { generatedAt: kickoff - day, modelVersion: MODEL_VERSION, picks: [pick] };
  assert(isForecastArchive(archive));
  assert(!isForecastArchive({ ...archive, generatedAt: kickoff + 1 }));
  assert(!isForecastArchive({ ...archive, picks: {} }));
  const oldVersion = MODEL_VERSION - 1;
  const result = forecastMetrics([archive, { ...archive, provenance: 'simulation' }, { ...archive, picks: [{ ...pick, result: 'void' }] },
    { ...archive, modelVersion: oldVersion, picks: [{ ...pick, modelVersion: oldVersion }] }]);
  assert.equal(result.count, 1);
  assert.equal(result.hits, 1);
  assert(Math.abs(result.brier - .04) < 1e-12);
});

test('daily picks prioritize uncertainty-adjusted probability rather than longer odds', () => {
  const pred = { quality: 'high', support: .8, candidates: [
    { side: 'over15', label: 'Over 1.5 goals', prob: .86 },
    { side: 'home', label: 'Home to win', prob: .66 },
    { side: 'btts', label: 'Both teams to score', prob: .58 },
    { side: 'away', label: 'Away to win', prob: .12 },
  ] };
  const tip = choosePick(pred, null);
  assert(tip);
  assert.equal(tip.side, 'over15');
  assert(tip.prob >= PICK_RULES.minProb);
  assert(tip.price >= PICK_RULES.minPrice && tip.price <= PICK_RULES.maxPrice);
  assert.equal(tip.adjustedProb, tip.prob - .12 * (1 - pred.support));
  // A real price far below the model's fair price is rejected.
  const short = choosePick({ ...pred, candidates: [{ side: 'home', label: 'Home', prob: .66 }] }, { dec: { home: 1.3, away: 9 } });
  assert.equal(short, null);
  // A real price with value is used and labelled.
  const priced = choosePick({ ...pred, candidates: [{ side: 'home', label: 'Home', prob: .66 }] }, { dec: { home: 1.72, away: 5 } });
  assert.equal(priced.priceSource, 'MSport');
  assert.equal(priced.price, 1.72);
  assert.equal(choosePick({ ...pred, quality: 'low' }, null), null);
});

test('relaxed rules accept a thin-evidence match only with enough recent results', () => {
  const pred = { quality: 'low', support: .45, sample: { home: 12, away: 9 }, candidates: [{ side: 'home', label: 'Home', prob: .6 }] };
  assert.equal(choosePick(pred, null), null);
  assert(choosePick(pred, null, PICK_RULES_RELAXED));
  assert.equal(choosePick({ ...pred, sample: { home: 12, away: 6 } }, null, PICK_RULES_RELAXED), null);
});

test('MSport prices map to totals, BTTS, double chance, draw-no-bet, team totals and win-to-nil', () => {
  const odds = {
    dec: { home: 2, draw: 3.2, away: 3 },
    markets: [
      ...[['05', '0.5'], ['15', '1.5'], ['', '2.5'], ['35', '3.5'], ['45', '4.5']].map(([suffix, line]) => ({
        name: `Over/Under ${line}`, outcomes: [{ label: 'Over', odds: 2.1 }, { label: 'Under', odds: 1.7 }],
      })),
      { name: 'Both Teams To Score', outcomes: [{ label: 'Yes', odds: 1.8 }, { label: 'No', odds: 1.9 }] },
      { name: 'Double Chance', outcomes: [{ label: '1X', odds: 1.2 }, { label: '12', odds: 1.25 }, { label: 'X2', odds: 1.3 }] },
      { name: 'Draw No Bet', outcomes: [{ label: 'Home', odds: 1.5 }, { label: 'Away', odds: 2.4 }] },
      { name: 'Home Team Total', outcomes: [{ label: 'Over 0.5', odds: 1.1 }, { label: 'Under 1.5', odds: 1.65 }] },
      { name: 'Away Team Total', outcomes: [{ label: 'Over 0.5', odds: 1.15 }, { label: 'Under 1.5', odds: 1.7 }] },
      { name: 'Win To Nil', outcomes: [{ label: 'Home Yes', odds: 2.8 }, { label: 'Away Yes', odds: 3.4 }] },
    ],
  };
  for (const side of ['over05', 'under05', 'over15', 'under15', 'over', 'under', 'over35', 'under35', 'over45', 'under45']) {
    assert.equal(marketPrice({ side }, odds), side.startsWith('over') ? 2.1 : 1.7, side);
  }
  const expected = { btts: 1.8, bttsNo: 1.9, dc1x: 1.2, dc12: 1.25, dcx2: 1.3, dnbHome: 1.5, dnbAway: 2.4,
    homeOver05: 1.1, homeUnder15: 1.65, awayOver05: 1.15, awayUnder15: 1.7, homeWinToNil: 2.8, awayWinToNil: 3.4 };
  for (const [side, price] of Object.entries(expected)) assert.equal(marketPrice({ side }, odds), price, side);
});

test('all supported selections settle correctly, including draw-no-bet voids', () => {
  const cases = [
    ['home', 2, 1, true], ['away', 2, 1, false], ['draw', 1, 1, true],
    ['over05', 1, 0, true], ['under05', 0, 0, true], ['over15', 1, 1, true], ['under15', 1, 0, true],
    ['over', 2, 1, true], ['under', 1, 1, true], ['over35', 2, 2, true], ['under35', 2, 1, true],
    ['over45', 3, 2, true], ['under45', 2, 2, true], ['btts', 1, 1, true], ['bttsNo', 1, 0, true],
    ['dc1x', 1, 1, true], ['dc12', 1, 1, false], ['dcx2', 1, 1, true],
    ['dnbHome', 1, 1, 'void'], ['dnbAway', 1, 1, 'void'], ['dnbHome', 2, 1, true], ['dnbAway', 2, 1, false],
    ['homeOver05', 1, 0, true], ['homeUnder05', 0, 2, true], ['homeOver15', 2, 0, true], ['homeUnder15', 1, 0, true],
    ['awayOver05', 0, 1, true], ['awayUnder05', 2, 0, true], ['awayOver15', 0, 2, true], ['awayUnder15', 0, 1, true],
    ['homeWinToNil', 2, 0, true], ['homeWinToNil', 2, 1, false], ['awayWinToNil', 0, 2, true], ['awayWinToNil', 1, 2, false],
  ];
  for (const [side, h, a, expected] of cases) assert.equal(judgeScore(side, h, a), expected, `${side} ${h}-${a}`);
  assert.equal(judgeScore('unknown', 1, 0), null);
  assert.equal(judgeScore('home', null, 0), null);
});

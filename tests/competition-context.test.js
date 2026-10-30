import test from 'node:test';
import assert from 'node:assert/strict';
import { leagueProfile, domesticProfile, tableContext, contextAdjustment } from '../src/competitionContext.js';

test('unknown and ambiguous league names are not guessed', () => {
  assert.equal(leagueProfile('unknown', 'Premier League', ''), null);
  assert.equal(leagueProfile('unknown', 'Serie A', 'Brazil'), null);
  assert.equal(leagueProfile('eng.1', '', '').division, 1);
  assert.equal(leagueProfile('fs:team', 'England: Premier League').division, 1);
  assert.equal(leagueProfile('fs:team', 'England: League One').division, 3);
});
test('cup match resolves separate domestic divisions from recent fixtures', () => {
  const m = { home: {}, away: {}, league: 'cup', leagueName: 'FA Cup', country: 'England' };
  const h = domesticProfile(m, 'home', [{ league: 'eng.1' }]);
  const a = domesticProfile(m, 'away', [{ league: 'eng.3' }]);
  assert.equal(h.division, 1);
  assert.equal(a.division, 3);
  assert.ok(contextAdjustment(h, a, null, null) > 0);
  assert.ok(Math.abs(contextAdjustment(h, a, null, null)) <= 0.3);
});
test('table ranks are normalized by table size and early-season evidence', () => {
  const groups = [{ rows: Array.from({ length: 20 }, (_, i) => ({ teamId: String(i), rank: i + 1, gp: 12 })) }];
  const top = tableContext(groups, '0');
  const bottom = tableContext(groups, '19');
  assert.ok(contextAdjustment(null, null, top, bottom) > 0);
  assert.equal(tableContext(groups, 'missing'), null);
  groups[0].rows[0].gp = 1;
  assert.equal(tableContext(groups, '0'), null);
});
test('neutral or missing information does not invent an advantage', () => {
  assert.equal(contextAdjustment(null, null, null, null), 0);
  const p = leagueProfile('eng.1', '', '');
  assert.equal(contextAdjustment(p, p, null, null), 0);
  assert.equal(contextAdjustment(p, null, null, null), 0);
});

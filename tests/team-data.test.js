import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSquad, teamCompetition } from '../src/api/flashscoreTeamPage.js';

test('reads the overall squad once and separates the coach from the players', () => {
  const row = (name, id) => `<div class="lineupTable__row">
    <div class="lineupTable__cell lineupTable__cell--jersey"> 50 </div>
    <div class="lineupTable__cell--flag flag fl_98" title="Italy"></div>
    <a class="lineupTable__cell--name" href="/player/example/${id}/">${name}</a>
    <div class="lineupTable__cell lineupTable__cell--age">18</div>
  </div>`;
  const section = (name, body) => `<div class="lineupTable lineupTable--soccer">
    <div class="lineupTable__title">${name}</div>${body}</div>`;
  const html = `<div id="overall-all-table" class="squad-table profileTable">
    ${section('Goalkeepers', row('D&#39;Angelo Luca', 'G2RvZU19'))}
    ${section('Coach', row('Juric Ivan', '4IdjsvY2'))}
  </div><div class="squad-table profileTable">
    ${section('Goalkeepers', row('Other player', '8dpkul1C'))}
  </div>`;
  assert.deepEqual(parseSquad(html), {
    groups: [{
      name: 'Goalkeepers',
      players: [{ id: 'G2RvZU19', name: "D'Angelo Luca", jersey: '50', age: 18, country: 'Italy' }],
    }],
    coach: 'Juric Ivan',
  });
});

test('reads the current standings stage from a team page without route league context', () => {
  assert.equal(
    teamCompetition('{"stats2_config":{"tournament":"WdNk9YwP","tournamentStage":"CfujcOgK"}}'),
    'fs:WdNk9YwP_CfujcOgK',
  );
  assert.equal(teamCompetition('{"stats2_config":{"tournament":"","tournamentStage":""}}'), null);
});

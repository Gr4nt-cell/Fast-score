import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMatchLineups } from '../src/api/flashscoreLineups.js';

test('normalizes confirmed players in pitch order and keeps reserves off the pitch', () => {
  const data = { findEventById: { eventParticipants: [{
    id: 'participant',
    name: 'Celta Vigo',
    type: { side: 'HOME' },
    lineup: {
      formation: { name: '3-4-3', lines: [{ rows: [
        { sortKey: 1, playerIds: ['defender'] },
        { sortKey: 0, playerIds: ['keeper'] },
      ] }] },
      groups: [
        { groupType: 'STARTERS', playerIds: ['defender', 'keeper'] },
        { groupType: 'SUBSTITUTES', playerIds: ['reserve', 'keeper'] },
        { groupType: 'MISSING_PLAYERS', playerIds: ['injured'] },
      ],
      players: ['keeper', 'defender', 'reserve', 'injured'].map((id) => ({
        id,
        participantId: `player-${id}`,
        listName: id,
      })),
    },
  }, { type: { side: 'AWAY' }, lineup: null }] } };
  const [home] = parseMatchLineups(data, { home: { id: 'team' } });
  assert.equal(home.homeAway, 'home');
  assert.equal(home.team.id, 'team');
  assert.equal(home.formation, '3-4-3');
  assert.deepEqual(home.roster.map((p) => [p.athlete.id, p.starter, p.position.abbreviation]), [
    ['player-keeper', true, 'G'],
    ['player-defender', true, ''],
    ['player-reserve', false, ''],
  ]);
  assert.equal(parseMatchLineups(data).length, 1);
  assert.deepEqual(parseMatchLineups({ findEventById: null }), []);
});

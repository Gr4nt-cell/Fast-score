export function parseMatchLineups(data, match) {
  const teams = data?.findEventById?.eventParticipants || [];
  return teams.flatMap((team) => {
    const homeAway = { HOME: 'home', AWAY: 'away' }[team.type?.side];
    const lineup = team.lineup;
    if (!homeAway || !lineup?.players?.length) return [];

    const groups = lineup.groups || [];
    const idsIn = (type) => groups.filter((group) => group.groupType === type).flatMap((group) => group.playerIds || []);
    const rows = [...(lineup.formation?.lines?.[0]?.rows || [])].sort((a, b) => a.sortKey - b.sortKey);
    const formationIds = rows.flatMap((row) => row.playerIds || []);
    const starters = [...new Set([...formationIds, ...idsIn('STARTERS')])];
    const starterIds = new Set(starters);
    const bench = [...new Set(idsIn('SUBSTITUTES'))].filter((id) => !starterIds.has(id));
    const players = new Map(lineup.players.map((player) => [player.id || player.participantId, player]));
    const roster = [...starters, ...bench].flatMap((id, index) => {
      const player = players.get(id);
      const displayName = player?.listName || player?.fieldName;
      if (!displayName) return [];
      const starter = starterIds.has(id);
      const roles = player.playerRoles || [];
      const goalkeeper = roles.find((role) => role.suffix === '(G)');
      return [{
        starter,
        jersey: player.number || '',
        athlete: { id: player.participantId || id, displayName, lastName: player.fieldName || displayName },
        position: { abbreviation: goalkeeper || (starter && formationIds[0] === id && rows[0]?.playerIds?.length === 1) ? 'G' : '', displayName: goalkeeper?.title || '' },
        formationPlace: index + 1,
      }];
    });

    return roster.some((player) => player.starter) ? [{
      homeAway,
      team: { id: match?.[homeAway]?.id || team.id, displayName: team.name || match?.[homeAway]?.name || '' },
      formation: lineup.formation?.name || null,
      roster,
    }] : [];
  });
}

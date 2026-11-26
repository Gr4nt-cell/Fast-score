const ENTITIES = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: ' ' };

function plainText(value = '') {
  return value.replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, key) => {
    if (key[0] !== '#') return ENTITIES[key] ?? entity;
    const hex = key[1].toLowerCase() === 'x';
    const code = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  }).trim();
}

export function parseSquad(html) {
  const profiles = html.split(/<div\b[^>]*\bclass="squad-table\b[^"]*"[^>]*>/i);
  const profile = profiles[1]?.split('</section>')[0] || '';
  const groups = [];
  const seen = new Set();
  let coach = '';
  for (const section of profile.split(/<div class="lineupTable(?: [^"]*)?">/).slice(1)) {
    const name = plainText(section.match(/class="lineupTable__title">([^<]*)/i)?.[1]) || 'Players';
    const players = [];
    for (const row of section.split('<div class="lineupTable__row">').slice(1)) {
      const link = row.match(/href="\/player\/[^/"]+\/([a-z\d]+)\/"[^>]*>([\s\S]*?)<\/a>/i);
      if (!link) continue;
      const [, id, label] = link;
      const playerName = plainText(label);
      if (!playerName) continue;
      if (/^(?:head )?coach(?:es)?$/i.test(name)) {
        if (!coach) coach = playerName;
        continue;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      players.push({
        id,
        name: playerName,
        jersey: plainText(row.match(/class="[^"]*lineupTable__cell--jersey[^"]*"[^>]*>([^<]*)/i)?.[1]),
        age: Number(row.match(/class="[^"]*lineupTable__cell--age[^"]*"[^>]*>\s*(\d+)/i)?.[1]) || null,
        country: plainText(row.match(/class="[^"]*lineupTable__cell--flag[^"]*"[^>]*title="([^"]*)"/i)?.[1]),
      });
    }
    if (players.length) groups.push({ name, players });
  }
  return { groups, coach };
}

export function teamCompetition(html) {
  const match = html.match(/"stats2_config"\s*:\s*\{\s*"tournament"\s*:\s*"([a-z\d]+)"\s*,\s*"tournamentStage"\s*:\s*"([a-z\d]+)"/i);
  return match ? `fs:${match[1]}_${match[2]}` : null;
}

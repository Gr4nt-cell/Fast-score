// The sports and competitions the app follows. Slugs are ESPN's public API paths:
//   https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard
// `am: true` marks competitions played in the Americas, whose late kick-offs fall on the next
// day in GMT, so the day before is fetched as well.

export const SPORTS = [
  {
    key: 'soccer',
    name: 'Football',
    icon: 'soccer',
    draws: true,
    leagues: [
      { slug: 'eng.1', name: 'Premier League', country: 'England', top: true },
      { slug: 'esp.1', name: 'LaLiga', country: 'Spain', top: true },
      { slug: 'ita.1', name: 'Serie A', country: 'Italy', top: true },
      { slug: 'ger.1', name: 'Bundesliga', country: 'Germany', top: true },
      { slug: 'fra.1', name: 'Ligue 1', country: 'France', top: true },
      { slug: 'uefa.champions', name: 'Champions League', country: 'Europe', top: true },
      { slug: 'uefa.europa', name: 'Europa League', country: 'Europe', top: true },
      { slug: 'uefa.europa.conf', name: 'Conference League', country: 'Europe' },
      { slug: 'fifa.world', name: 'FIFA World Cup', country: 'World' },
      { slug: 'fifa.worldq.caf', name: 'WC Qualifying CAF', country: 'Africa' },
      { slug: 'fifa.worldq.uefa', name: 'WC Qualifying UEFA', country: 'Europe' },
      { slug: 'caf.nations', name: 'Africa Cup of Nations', country: 'Africa' },
      { slug: 'caf.champions', name: 'CAF Champions League', country: 'Africa' },
      { slug: 'uefa.nations', name: 'UEFA Nations League', country: 'Europe' },
      { slug: 'fifa.friendly', name: 'International Friendly', country: 'World' },
      { slug: 'eng.2', name: 'Championship', country: 'England' },
      { slug: 'eng.fa', name: 'FA Cup', country: 'England' },
      { slug: 'eng.league_cup', name: 'Carabao Cup', country: 'England' },
      { slug: 'esp.copa_del_rey', name: 'Copa del Rey', country: 'Spain' },
      { slug: 'ita.coppa_italia', name: 'Coppa Italia', country: 'Italy' },
      { slug: 'ger.dfb_pokal', name: 'DFB-Pokal', country: 'Germany' },
      { slug: 'fra.coupe_de_france', name: 'Coupe de France', country: 'France' },
      { slug: 'ned.1', name: 'Eredivisie', country: 'Netherlands' },
      { slug: 'por.1', name: 'Liga Portugal', country: 'Portugal' },
      { slug: 'tur.1', name: 'Süper Lig', country: 'Türkiye' },
      { slug: 'sco.1', name: 'Premiership', country: 'Scotland' },
      { slug: 'bel.1', name: 'Pro League', country: 'Belgium' },
      { slug: 'ksa.1', name: 'Saudi Pro League', country: 'Saudi Arabia' },
      { slug: 'gha.1', name: 'Premier League', country: 'Ghana' },
      { slug: 'rsa.1', name: 'Premiership', country: 'South Africa' },
      { slug: 'usa.1', name: 'MLS', country: 'USA', am: true },
      { slug: 'mex.1', name: 'Liga MX', country: 'Mexico', am: true },
      { slug: 'bra.1', name: 'Brasileirão', country: 'Brazil', am: true },
      { slug: 'arg.1', name: 'Liga Profesional', country: 'Argentina', am: true },
      { slug: 'conmebol.libertadores', name: 'Copa Libertadores', country: 'South America', am: true },
      { slug: 'eng.w.1', name: "Women's Super League", country: 'England' },
      { slug: 'uefa.wchampions', name: "Women's Champions League", country: 'Europe' },
    ],
  },
  {
    key: 'basketball',
    name: 'Basketball',
    icon: 'basketball',
    leagues: [
      { slug: 'nba', name: 'NBA', country: 'USA', am: true, top: true },
      { slug: 'wnba', name: 'WNBA', country: 'USA', am: true },
      { slug: 'mens-college-basketball', name: 'NCAA Men', country: 'USA', am: true },
      { slug: 'womens-college-basketball', name: 'NCAA Women', country: 'USA', am: true },
    ],
  },
  {
    key: 'tennis',
    name: 'Tennis',
    icon: 'tennis',
    individual: true,
    multiDay: true,
    leagues: [
      { slug: 'atp', name: 'ATP', country: 'World', top: true },
      { slug: 'wta', name: 'WTA', country: 'World', top: true },
    ],
  },
  {
    key: 'football',
    name: 'Am. Football',
    icon: 'football',
    leagues: [
      { slug: 'nfl', name: 'NFL', country: 'USA', am: true, top: true },
      { slug: 'college-football', name: 'NCAA Football', country: 'USA', am: true },
    ],
  },
  {
    key: 'baseball',
    name: 'Baseball',
    icon: 'baseball',
    leagues: [
      { slug: 'mlb', name: 'MLB', country: 'USA', am: true, top: true },
      { slug: 'college-baseball', name: 'NCAA Baseball', country: 'USA', am: true },
    ],
  },
  {
    key: 'hockey',
    name: 'Ice Hockey',
    icon: 'hockey-puck',
    leagues: [{ slug: 'nhl', name: 'NHL', country: 'USA', am: true, top: true }],
  },
  {
    key: 'mma',
    name: 'MMA',
    icon: 'boxing-glove',
    individual: true,
    multiDay: true,
    leagues: [
      { slug: 'ufc', name: 'UFC', country: 'World', top: true },
      { slug: 'pfl', name: 'PFL', country: 'World' },
    ],
  },
  {
    key: 'racing',
    name: 'Motorsport',
    icon: 'flag-checkered',
    individual: true,
    field: true,
    multiDay: true,
    leagues: [
      { slug: 'f1', name: 'Formula 1', country: 'World', top: true },
      { slug: 'irl', name: 'IndyCar', country: 'USA' },
      { slug: 'nascar-premier', name: 'NASCAR Cup', country: 'USA' },
    ],
  },
  {
    key: 'golf',
    name: 'Golf',
    icon: 'golf',
    individual: true,
    field: true,
    multiDay: true,
    leagues: [
      { slug: 'pga', name: 'PGA Tour', country: 'World', top: true },
      { slug: 'lpga', name: 'LPGA', country: 'World' },
      { slug: 'eur', name: 'DP World Tour', country: 'World' },
    ],
  },
  {
    key: 'rugby',
    name: 'Rugby',
    icon: 'rugby',
    draws: true,
    leagues: [
      { slug: '180659', name: 'Six Nations', country: 'Europe', top: true },
      { slug: '244293', name: 'The Rugby Championship', country: 'World' },
      { slug: '267979', name: 'Premiership', country: 'England' },
      { slug: '270557', name: 'United Rugby Championship', country: 'Europe' },
      { slug: '271937', name: 'Champions Cup', country: 'Europe' },
      { slug: '242041', name: 'Super Rugby', country: 'World' },
      { slug: '164205', name: 'Rugby World Cup', country: 'World' },
    ],
  },
  {
    key: 'volleyball',
    name: 'Volleyball',
    icon: 'volleyball',
    leagues: [
      { slug: 'womens-college-volleyball', name: 'NCAA Women', country: 'USA', am: true, top: true },
      { slug: 'mens-college-volleyball', name: 'NCAA Men', country: 'USA', am: true },
    ],
  },
];

export const sportByKey = (key) => SPORTS.find((s) => s.key === key) || SPORTS[0];

const title = (x) => String(x || '').split('-').map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');

export function leagueMeta(sport, slug) {
  const s = sportByKey(sport);
  const known = s.leagues.find((l) => l.slug === slug);
  if (known) return known;
  // a competition from the full index: "fs:t:<country id>:<template>:<country>~<league>"
  if (String(slug).startsWith('fs:t:')) {
    const [country, league] = String(slug).split(':').slice(4).join(':').split('~');
    return { slug, name: title(league), country: title(country) };
  }
  return { slug, name: slug, country: '' };
}

export const leagueKey = (sport, slug) => `${sport}/${slug}`;

// The full list of competitions (built weekly from Flashscore by a GitHub workflow, published on
// the repo's "data" branch). Kept on the phone for 3 days; the last copy is used when offline.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tplSlug } from './flashscore';

const URL = 'https://raw.githubusercontent.com/Gr4nt-cell/Fast-score/data/leagues.json';
const KEY = 'fs:leaguesIndex';
let cached = null;
let loading = null;

export async function leaguesIndex() {
  if (cached && Date.now() - cached.t < 3 * 86400000) return cached.data;
  if (loading) return loading;
  loading = (async () => {
    let stored = null;
    try {
      stored = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null');
    } catch {}
    if (stored && Date.now() - stored.t < 3 * 86400000) {
      cached = stored;
      return stored.data;
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(URL + '?d=' + Math.floor(Date.now() / 86400000), { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      cached = { t: Date.now(), data };
      AsyncStorage.setItem(KEY, JSON.stringify(cached)).catch(() => {});
      return data;
    } catch (e) {
      if (stored) {
        cached = stored;
        return stored.data;
      }
      throw e;
    }
  })().finally(() => {
    loading = null;
  });
  return loading;
}

/** { countries: [{ id, slug, name, leagues: [{ name, slug, tpl, key }] }], top: [...], total } for a sport. */
export async function sportLeagues(sport) {
  const idx = await leaguesIndex();
  const s = idx && idx.sports && idx.sports[sport];
  if (!s) return { countries: [], top: [], total: 0 };
  const byTpl = new Map();
  const countries = s.countries.map((c) => ({
    ...c,
    leagues: c.leagues.map((l) => {
      const x = { ...l, country: c.name, key: tplSlug(sport, c, l) };
      byTpl.set(`${c.id}_${l.tpl}`, x);
      return x;
    }),
  }));
  // "1_198_dYlOSQOD" = sport_country_template
  const top = (s.top || []).map((k) => byTpl.get(k.split('_').slice(1).join('_'))).filter(Boolean);
  return { countries, top, total: countries.reduce((n, c) => n + c.leagues.length, 0) };
}

/** Name and country of an indexed competition slug, for pinned lists (null if unknown). */
export async function leagueInfo(sport, slug) {
  try {
    const { countries } = await sportLeagues(sport);
    for (const c of countries) for (const l of c.leagues) if (l.key === slug) return l;
  } catch {}
  return null;
}

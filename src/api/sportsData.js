// The app uses Flashscore as its only sports-data provider.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as flashscore from './flashscore';

export const ymd = (date) =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

export const sameDay = (a, b) => ymd(new Date(a)) === ymd(new Date(b));

export function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export async function pool(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        try {
          results[index] = await fn(items[index], index);
        } catch {
          results[index] = null;
        }
      }
    }),
  );
  return results;
}

export async function dayBoard(sport, date, { ttl = 30000, leagues } = {}) {
  const groups = await flashscore.dayBoard(sport, date, ttl);
  if (!Array.isArray(leagues) || !groups.length) return groups;
  const ordered = [...groups].sort(
    (a, b) => Number(b.league?.priority || 0) - Number(a.league?.priority || 0),
  );
  const highPriority = ordered.filter((group) => Number(group.league?.priority) >= 74).slice(0, 15);
  const shortlist = highPriority.length ? highPriority : ordered.slice(0, 15);
  shortlist.source = groups.source || 'flashscore';
  return shortlist;
}

export function scoreboard(sport, league, date, ttl = 30000) {
  return flashscore.leagueDay(sport, league, date, ttl);
}

export function summary(sport, _league, eventId) {
  return flashscore.summary(sport, eventId);
}

export function standings(sport, league) {
  return flashscore.standings(league, sport);
}

export function teams(sport, league) {
  return flashscore.teams(sport, league);
}

export function team(_sport, _league, id) {
  return flashscore.team(id);
}

export function recentGames(sport, _league, id) {
  return flashscore.recentGames(sport, id);
}

export function teamSchedule(sport, _league, id) {
  return flashscore.teamSchedule(sport, id);
}

export function roster() {
  return flashscore.roster();
}

export function athlete(_sport, _league, id) {
  return flashscore.player(id);
}

export function search(query) {
  return flashscore.search(query);
}

export async function clearCache() {
  await flashscore.clearCache();
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((key) => key.startsWith('c:')));
  } catch (error) {
    console.warn('[Fast Score] Could not clear legacy sports cache', error);
  }
}

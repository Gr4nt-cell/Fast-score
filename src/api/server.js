// Fast Score's own server (Cloudflare Worker, see /server). Its address is published by the
// deploy workflow in server/url.json in the GitHub repo, so the app finds it without a rebuild.
// If the server is missing or down, the app simply talks to ESPN directly as before.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const DISCOVERY = 'https://raw.githubusercontent.com/Gr4nt-cell/Fast-score/main/server/url.json';
let url = null;
let override = null;
let checkedAt = 0;
let downUntil = 0;
let loading = null;

export function setServerOverride(u) {
  override = u ? String(u).trim().replace(/\/+$/, '') : null;
  downUntil = 0;
}

async function discover() {
  const fromConfig = Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.apiUrl;
  if (fromConfig) return fromConfig;
  try {
    const cached = JSON.parse((await AsyncStorage.getItem('serverUrl')) || 'null');
    if (cached && Date.now() - cached.t < 6 * 3600 * 1000) return cached.url;
  } catch {}
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(DISCOVERY + '?t=' + Math.floor(Date.now() / 3600000), { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const j = await res.json();
      const u = j && j.url ? String(j.url).replace(/\/+$/, '') : null;
      AsyncStorage.setItem('serverUrl', JSON.stringify({ url: u, t: Date.now() })).catch(() => {});
      return u;
    }
  } catch {}
  return null;
}

/** The server's base URL, or null when there isn't one (or it's resting after a failure). */
export async function serverUrl() {
  if (Date.now() < downUntil) return null;
  if (override) return override;
  if (url && Date.now() - checkedAt < 6 * 3600 * 1000) return url;
  if (!loading) {
    loading = discover().then((u) => {
      url = u;
      checkedAt = Date.now();
      loading = null;
      return u;
    });
  }
  return loading;
}

export function markServerDown() {
  downUntil = Date.now() + 2 * 60 * 1000;
}

export async function serverJson(path, timeout = 8000) {
  const base = await serverUrl();
  if (!base) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(base + path, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Server ${res.status}`);
    return await res.json();
  } catch (e) {
    markServerDown();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function serverStatus() {
  try {
    const base = await serverUrl();
    if (!base) return { connected: false };
    const j = await serverJson('/v1/status', 6000);
    return { connected: true, url: base, ...j };
  } catch (e) {
    return { connected: false, error: String(e.message || e) };
  }
}

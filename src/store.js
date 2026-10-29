import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setSourceMode } from './api/espn';

export async function load(key, fallback) {
  try {
    const s = await AsyncStorage.getItem(key);
    return s == null ? fallback : JSON.parse(s);
  } catch {
    return fallback;
  }
}
export function save(key, value) {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
}

const DEFAULT_SETTINGS = {
  theme: 'system', // system | light | dark
  glass: true,
  sport: 'soccer',
  oddsFormat: 'decimal', // decimal | fractional | american
  showOdds: true,
  goalAlerts: true,
  source: 'auto', // auto | espn | tsdb
};

const EMPTY_FAVS = { teams: [], leagues: [], matches: [], players: [] };

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [favs, setFavs] = useState(EMPTY_FAVS);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    Promise.all([load('settings', DEFAULT_SETTINGS), load('favs', EMPTY_FAVS)]).then(([s, f]) => {
      // the source picker is gone from Settings: everyone is on Auto
      setSourceMode('auto');
      setSettings({ ...DEFAULT_SETTINGS, ...s, source: 'auto' });
      setFavs({ ...EMPTY_FAVS, ...f });
      setReady(true);
    });
  }, []);

  useEffect(() => {
    try {
      Appearance.setColorScheme(settings.theme === 'system' ? 'unspecified' : settings.theme);
    } catch {}
  }, [settings.theme]);

  const setSetting = useCallback((k, v) => {
    setSettings((s) => {
      const n = { ...s, [k]: v };
      if (k === 'source') setSourceMode(v);
      save('settings', n);
      return n;
    });
  }, []);

  const toggle = useCallback((kind, item) => {
    setFavs((f) => {
      const list = f[kind] || [];
      const id = typeof item === 'string' ? item : item.key || item.id;
      const has = list.some((x) => (typeof x === 'string' ? x : x.key || x.id) === id);
      const n = { ...f, [kind]: has ? list.filter((x) => (typeof x === 'string' ? x : x.key || x.id) !== id) : [...list, item] };
      save('favs', n);
      return n;
    });
  }, []);

  const isFav = useCallback(
    (kind, id) => (favs[kind] || []).some((x) => (typeof x === 'string' ? x : x.key || x.id) === id),
    [favs]
  );

  const showToast = useCallback((t) => {
    setToast({ ...t, ts: Date.now() });
  }, []);

  const value = useMemo(
    () => ({ settings, setSetting, favs, toggle, isFav, ready, toast, showToast, clearToast: () => setToast(null) }),
    [settings, setSetting, favs, toggle, isFav, ready, toast, showToast]
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);

// ---------- odds ----------

export function americanToProb(ml) {
  if (ml == null || !Number.isFinite(ml) || ml === 0) return null;
  return ml > 0 ? 100 / (ml + 100) : -ml / (-ml + 100);
}

function gcd(a, b) {
  return b ? gcd(b, a % b) : a;
}

export function formatOdds(ml, format) {
  if (ml == null) return '–';
  const dec = ml > 0 ? 1 + ml / 100 : 1 + 100 / -ml;
  if (format === 'american') return ml > 0 ? `+${ml}` : String(ml);
  if (format === 'fractional') {
    const n = Math.round((dec - 1) * 100);
    const g = gcd(n, 100);
    return `${n / g}/${100 / g}`;
  }
  return dec.toFixed(2);
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Modal, View } from 'react-native';
import { Text } from './src/components/Text';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavContext } from './src/nav';
import { useTheme } from './src/theme';
import { StoreProvider, useStore, load, save } from './src/store';
import { sportByKey } from './src/sports';
import { pool, scoreboard } from './src/api/espn';
import { success } from './src/haptics';
import TabBar, { TABS } from './src/components/TabBar';
import { BlurTargetView, FlatBackdropContext, Glass, GlassModeContext, GlassTargetContext } from './src/components/Glass';
import { Pressable } from './src/components/Touch';
import { Logo } from './src/components/ui';
import Boundary from './src/components/Boundary';
import MatchesScreen from './src/screens/MatchesScreen';
import LeaguesScreen from './src/screens/LeaguesScreen';
import PicksScreen from './src/screens/PicksScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import SearchScreen from './src/screens/SearchScreen';
import MatchScreen from './src/screens/MatchScreen';
import LeagueScreen from './src/screens/LeagueScreen';
import TeamScreen from './src/screens/TeamScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const ROUTES = {
  match: MatchScreen,
  league: LeagueScreen,
  team: TeamScreen,
  player: PlayerScreen,
  settings: SettingsScreen,
};

// Watches followed matches and teams while the app is open and raises a banner when they score.
function useScoreWatcher() {
  const { favs, settings, showToast } = useStore();
  const last = useRef(new Map());
  useEffect(() => {
    if (!settings.goalAlerts) return undefined;
    const check = async () => {
      const today = new Date();
      const followed = new Set(favs.matches.map((m) => m.key));
      const teamIds = new Set(favs.teams.map((tm) => `${tm.sport}:${tm.teamId}`));
      const leagues = new Map();
      favs.matches.forEach((m) => {
        if (Math.abs(new Date(m.date) - today) < 36 * 3600 * 1000 && !sportByKey(m.sport).field) leagues.set(`${m.sport}|${m.league}`, 1);
      });
      favs.teams.forEach((tm) => leagues.set(`${tm.sport}|${tm.league}`, 1));
      if (!leagues.size) return;
      const res = await pool([...leagues.keys()], 4, (k) => {
        const [s, l] = k.split('|');
        return scoreboard(s, l, today, 20000);
      });
      res.forEach((r) =>
        (r ? r.items : []).forEach((m) => {
          if (m.kind !== 'match') return;
          const mine = followed.has(m.key) || teamIds.has(`${m.sport}:${m.home.id}`) || teamIds.has(`${m.sport}:${m.away.id}`);
          if (!mine) return;
          const sig = `${m.state}|${m.home.score}-${m.away.score}`;
          const prev = last.current.get(m.key);
          last.current.set(m.key, sig);
          if (!prev || prev === sig) return;
          const [pState, pScore] = prev.split('|');
          if (m.state === 'in' && pScore !== `${m.home.score}-${m.away.score}`) {
            const [ph, pa] = pScore.split('-').map(Number);
            const scorer = Number(m.home.score) > ph ? m.home : Number(m.away.score) > pa ? m.away : null;
            showToast({ kind: 'score', title: m.sport === 'soccer' ? 'GOAL!' : 'Score update', scorer, match: m });
          } else if (pState === 'pre' && m.state === 'in') {
            showToast({ kind: 'start', title: 'Kick-off', match: m });
          } else if (pState === 'in' && m.state === 'post') {
            showToast({ kind: 'end', title: 'Full time', match: m });
          }
        })
      );
    };
    check();
    const iv = setInterval(check, 30000);
    return () => clearInterval(iv);
  }, [favs.matches, favs.teams, settings.goalAlerts, showToast]);
}

function Toast({ onOpen }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { toast, clearToast } = useStore();
  const y = useRef(new Animated.Value(-160)).current;
  useEffect(() => {
    if (!toast) return undefined;
    success();
    Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 8 }).start();
    const id = setTimeout(() => Animated.timing(y, { toValue: -160, duration: 250, useNativeDriver: true }).start(() => clearToast()), 5500);
    return () => clearTimeout(id);
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!toast) return null;
  const m = toast.match;
  return (
    <Animated.View style={{ position: 'absolute', top: insets.top + 6, left: 12, right: 12, transform: [{ translateY: y }], zIndex: 100, elevation: 100 }}>
      <Pressable
        onPress={() => {
          clearToast();
          onOpen(m);
        }}
      >
        <FlatBackdropContext.Provider value={false}>
          <Glass radius={26} strong tint={t.dark ? 'rgba(44,44,48,0.97)' : 'rgba(255,255,255,0.97)'} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', boxShadow: '0px 8px 24px rgba(0,0,0,0.22)' }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: toast.kind === 'score' ? t.green : t.blue, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name={toast.kind === 'score' ? sportByKey(m.sport).icon : toast.kind === 'end' ? 'whistle' : 'play'} size={22} color="#fff" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: t.text, fontWeight: '900', fontSize: 15 }}>
                {toast.title}
                {toast.scorer ? <Text style={{ fontWeight: '600' }}> {toast.scorer.name}</Text> : null}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                <Logo uri={m.home.logo} name={m.home.name} size={16} />
                <Text style={{ color: t.text, fontSize: 14, marginHorizontal: 6, fontWeight: '600' }} numberOfLines={1}>
                  {m.home.short} {m.home.score}-{m.away.score} {m.away.short}
                </Text>
                <Logo uri={m.away.logo} name={m.away.name} size={16} />
              </View>
            </View>
            <Text style={{ color: t.live, fontWeight: '800', fontSize: 12 }}>{m.short}</Text>
          </Glass>
        </FlatBackdropContext.Provider>
      </Pressable>
    </Animated.View>
  );
}

function Main() {
  const t = useTheme();
  const { settings, ready } = useStore();
  const blurTarget = useRef(null);
  const [tab, setTabState] = useState('matches');
  const [stack, setStack] = useState([]);
  const counter = useRef(0);
  useScoreWatcher();

  useEffect(() => {
    load('lastTab', 'matches').then((v) => TABS.find((x) => x.key === v) && setTabState(v));
  }, []);

  const setTab = useCallback((k) => {
    setTabState(k);
    save('lastTab', k);
  }, []);
  const push = useCallback((route) => {
    counter.current += 1;
    setStack((s) => [...s, { ...route, key: String(counter.current) }]);
  }, []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length) {
        pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, pop]);

  const nav = useMemo(() => ({ push, pop, setTab }), [push, pop, setTab]);

  let screen;
  switch (tab) {
    case 'live':
      screen = <MatchesScreen key="live" liveMode />;
      break;
    case 'leagues':
      screen = <LeaguesScreen />;
      break;
    case 'picks':
      screen = <PicksScreen />;
      break;
    case 'favorites':
      screen = <FavoritesScreen />;
      break;
    case 'search':
      screen = <SearchScreen />;
      break;
    default:
      screen = <MatchesScreen key="matches" />;
  }

  if (!ready) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  return (
    <NavContext.Provider value={nav}>
      <GlassModeContext.Provider value={settings.glass === false ? 'plain' : 'clear'}>
        <FlatBackdropContext.Provider value>
          <GlassTargetContext.Provider value={blurTarget}>
            <StatusBar style={t.dark ? 'light' : 'dark'} />
            <View style={{ flex: 1, backgroundColor: t.bg }}>
              <BlurTargetView ref={blurTarget} style={{ flex: 1, backgroundColor: t.bg }}>
                <Boundary resetKey={tab}>{screen}</Boundary>
              </BlurTargetView>
              <TabBar tabs={TABS} active={tab} onChange={setTab} />
              {!stack.length ? <Toast onOpen={(m) => push({ name: 'match', match: m })} /> : null}
            </View>
            {stack.map((route) => {
              const Screen = ROUTES[route.name];
              if (!Screen) return null;
              return (
                <Modal key={route.key} visible animationType="slide" onRequestClose={pop} statusBarTranslucent navigationBarTranslucent>
                  <SafeAreaProvider>
                    <View style={{ flex: 1, backgroundColor: t.bg }}>
                      <Boundary resetKey={route.key}>
                        <Screen route={route} />
                      </Boundary>
                    </View>
                  </SafeAreaProvider>
                </Modal>
              );
            })}
          </GlassTargetContext.Provider>
        </FlatBackdropContext.Provider>
      </GlassModeContext.Provider>
    </NavContext.Provider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Main />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

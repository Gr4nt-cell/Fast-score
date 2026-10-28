import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Animated, BackHandler, Modal, View } from 'react-native';
import { Text } from './src/components/Text';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavContext } from './src/nav';
import { useTheme } from './src/theme';
import { StoreProvider, useStore, load, save } from './src/store';
import { sportByKey } from './src/sports';
import { success } from './src/haptics';
import { checkFollowed } from './src/watch';
import { ensurePermission, notifyEvent, onNotificationTap } from './src/notify';
import { setBackgroundChecks } from './src/background';
import { pickToMatch } from './src/screens/PicksScreen';
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

// Watches followed matches and teams. While the app is on screen a goal shows as a banner;
// when it's in the background it becomes a phone notification. The background task keeps
// checking (about every 15 min) after the app is closed.
function useScoreWatcher() {
  const { favs, settings, showToast, ready } = useStore();
  const following = favs.matches.length + favs.teams.length;
  const asked = useRef(false);

  // ask for notification permission once there's something to notify about
  useEffect(() => {
    if (!ready || !settings.goalAlerts || !following || asked.current) return;
    asked.current = true;
    ensurePermission(true);
  }, [ready, settings.goalAlerts, following]);

  useEffect(() => {
    if (ready) setBackgroundChecks(!!settings.goalAlerts && following > 0);
  }, [ready, settings.goalAlerts, following]);

  useEffect(() => {
    if (!settings.goalAlerts || !following) return undefined;
    const onEvent = (ev) => (AppState.currentState === 'active' ? showToast(ev) : notifyEvent(ev));
    const check = () => checkFollowed(favs, onEvent).catch(() => {});
    check();
    const iv = setInterval(check, 30000);
    return () => clearInterval(iv);
  }, [favs, settings.goalAlerts, following, showToast]);
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

  // tapping a goal notification opens that match
  useEffect(() => onNotificationTap((m) => push({ name: 'match', match: pickToMatch(m) })), []); // eslint-disable-line react-hooks/exhaustive-deps

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

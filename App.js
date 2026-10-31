import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Animated, BackHandler, Modal, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Text } from './src/components/Text';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavContext } from './src/nav';
import { useTheme, GlassBackdropContext } from './src/theme';
import { StoreProvider, useStore, load, save } from './src/store';
import { sportByKey } from './src/sports';
import { success } from './src/haptics';
import { checkFollowed } from './src/watch';
import { ensurePermission, notifyEvent, onNotificationTap } from './src/notify';
import { setBackgroundChecks } from './src/background';
import { onLiveTap, syncLive, trackedKeys, alertOn, playTone, setAlertKinds, toneKind } from './src/live';
import { warmOdds } from './src/api/msport';
import { setLanguage } from './src/i18n';
import { pickToMatch } from './src/screens/PicksScreen';
import TabBar, { TABS } from './src/components/TabBar';
import { Backdrop, BlurTargetView, FlatBackdropContext, Glass, GlassModeContext, GlassTargetContext, ScrollGlowProvider } from './src/components/Glass';
import { Pressable } from './src/components/Touch';
import { Logo } from './src/components/ui';
import Boundary from './src/components/Boundary';
import { SofaBridge } from './src/api/browserBridge';
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
import ArticleScreen from './src/screens/ArticleScreen';

const PANE_ROUTES = new Set(['match', 'league', 'team', 'player']);

function PanePlaceholder({ tab }) {
  const t = useTheme();
  const hint = tab === 'leagues' ? 'Choose a competition on the left to see it here.' : tab === 'search' ? 'Choose a result on the left to see it here.' : 'Choose a match on the left to see it here.';
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <View style={{ width: 84, height: 84, borderRadius: 28, backgroundColor: t.track, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <Ionicons name={tab === 'leagues' ? 'trophy-outline' : tab === 'picks' ? 'sparkles-outline' : 'football-outline'} size={38} color={t.tertiary} />
      </View>
      <Text style={{ color: t.text, fontSize: 19, fontWeight: '800' }}>Nothing selected</Text>
      <Text style={{ color: t.secondary, fontSize: 14, marginTop: 6, textAlign: 'center' }}>{hint}</Text>
    </View>
  );
}

const ROUTES = {
  match: MatchScreen,
  league: LeagueScreen,
  team: TeamScreen,
  player: PlayerScreen,
  settings: SettingsScreen,
  article: ArticleScreen,
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

  // the live-alert service: give it the followed matches now, when the app comes back to the
  // front and every half hour (followed teams' games appear as fixtures get known)
  useEffect(() => {
    if (!ready) return undefined;
    const sync = () => syncLive(favs, !!settings.goalAlerts && following > 0);
    sync();
    const iv = setInterval(sync, 30 * 60 * 1000);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && sync());
    return () => {
      clearInterval(iv);
      sub.remove();
    };
  }, [ready, favs, settings.goalAlerts, following]);

  useEffect(() => {
    if (!settings.goalAlerts || !following) return undefined;
    // in the background the live service alerts for the matches it tracks; don't double up
    const onEvent = (ev) => {
      const kind = toneKind(ev);
      if (kind && !alertOn(settings, kind)) return;
      if (AppState.currentState === 'active') {
        showToast(ev);
        if (kind) playTone(kind);
      } else if (!trackedKeys().has(ev.match.key)) notifyEvent(ev, kind);
    };
    const check = () => checkFollowed(favs, onEvent).catch(() => {});
    check();
    const iv = setInterval(check, 30000);
    return () => clearInterval(iv);
  }, [favs, settings.goalAlerts, settings.alerts, following, showToast]);

  // tell the live service which kinds of alert are on
  useEffect(() => {
    if (ready) setAlertKinds(settings.alerts || {});
  }, [ready, settings.alerts]);
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
  const [detail, setDetail] = useState(null); // tablet: the page shown in the right-hand pane
  const counter = useRef(0);
  const { width: winW, height: winH } = useWindowDimensions();
  // tablets (and big foldables / landscape): list on the left, the chosen page on the right
  const wide = winW >= 720;
  const wideRef = useRef(wide);
  wideRef.current = wide;
  const stackLen = useRef(0);
  stackLen.current = stack.length;

  // phones stay upright; tablets and unfolded foldables turn freely
  const smallest = Math.min(winW, winH);
  useEffect(() => {
    ScreenOrientation.lockAsync(smallest >= 600 ? ScreenOrientation.OrientationLock.DEFAULT : ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, [smallest >= 600]); // eslint-disable-line react-hooks/exhaustive-deps
  useScoreWatcher();

  // tapping a goal notification opens that match
  useEffect(() => onNotificationTap((m) => push({ name: 'match', match: pickToMatch(m) })), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const open = (m) => push({ name: 'match', match: pickToMatch(m) });
    const off = onLiveTap(open);
    // an alert tapped while the app was in the background brings it back with the match attached
    const sub = AppState.addEventListener('change', (st) => st === 'active' && onLiveTap(open)());
    return () => {
      off();
      sub.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load('lastTab', 'matches').then((v) => TABS.find((x) => x.key === v) && setTabState(v));
    // MSport lists + saved prices, so odds are there the moment a match opens
    warmOdds('soccer');
  }, []);

  const setTab = useCallback((k) => {
    setTabState(k);
    save('lastTab', k);
  }, []);
  const push = useCallback((route) => {
    counter.current += 1;
    const r = { ...route, key: String(counter.current) };
    // on a tablet, pages opened from a list go to the right-hand pane instead of covering the screen
    if (wideRef.current && !stackLen.current && PANE_ROUTES.has(r.name)) return setDetail(r);
    setStack((s) => [...s, r]);
  }, []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const closeDetail = useCallback(() => setDetail(null), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length) {
        pop();
        return true;
      }
      if (wide && detail) {
        closeDetail();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, pop, wide, detail, closeDetail]);

  // switching tabs clears the pane (a match from Matches doesn't belong next to Leagues)
  useEffect(() => setDetail(null), [tab]);
  // rotating / unfolding to a narrow screen: the pane's page becomes a normal full-screen page
  useEffect(() => {
    if (!wide && detail) {
      setStack((s) => [detail, ...s]);
      setDetail(null);
    }
  }, [wide]); // eslint-disable-line react-hooks/exhaustive-deps

  const nav = useMemo(() => ({ push, pop, setTab }), [push, pop, setTab]);
  // inside the pane "back" closes the pane; anything opened from there opens as a sheet
  const paneNav = useMemo(() => ({ push: (r) => {
    counter.current += 1;
    setStack((s) => [...s, { ...r, key: String(counter.current) }]);
  }, pop: closeDetail, setTab }), [closeDetail, setTab]);

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
  const glassOn = settings.glass !== false;

  return (
    <NavContext.Provider value={nav}>
      <GlassBackdropContext.Provider value={glassOn}>
      <GlassModeContext.Provider value={glassOn ? 'clear' : 'plain'}>
        <FlatBackdropContext.Provider value={!glassOn}>
          <GlassTargetContext.Provider value={blurTarget}>
            <StatusBar style={t.dark ? 'light' : 'dark'} />
            <View style={{ flex: 1, backgroundColor: t.bg }}>
              <BlurTargetView ref={blurTarget} style={{ flex: 1, backgroundColor: t.bg, flexDirection: wide ? 'row' : 'column' }}>
                {glassOn ? <Backdrop /> : null}
                <View style={wide ? { width: Math.round(Math.min(520, Math.max(380, winW * 0.4))) } : { flex: 1 }}>
                  <Boundary resetKey={tab}>{screen}</Boundary>
                </View>
                {wide ? (
                  <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: glassOn ? 'rgba(255,255,255,0.5)' : t.separator }}>
                    {detail && ROUTES[detail.name] ? (
                      <NavContext.Provider value={paneNav}>
                        <Boundary resetKey={detail.key}>
                          {React.createElement(ROUTES[detail.name], { key: detail.key, route: detail })}
                        </Boundary>
                      </NavContext.Provider>
                    ) : (
                      <PanePlaceholder tab={tab} />
                    )}
                  </View>
                ) : null}
              </BlurTargetView>
              <SofaBridge />
              <View pointerEvents="box-none" style={wide ? { position: 'absolute', bottom: 0, left: 0, width: Math.round(Math.min(520, Math.max(380, winW * 0.4))), height: 140 } : { position: 'absolute', bottom: 0, left: 0, right: 0, height: 140 }}>
                <TabBar tabs={TABS} active={tab} onChange={setTab} />
              </View>
              {!stack.length ? <Toast onOpen={(m) => push({ name: 'match', match: m })} /> : null}
            </View>
            {stack.map((route) => {
              const Screen = ROUTES[route.name];
              if (!Screen) return null;
              if (wide) {
                // tablet: a centred sheet over a dimmed background
                const w = Math.min(760, winW - 80);
                const h = Math.min(winH - 60, 1100);
                return (
                  <Modal key={route.key} visible transparent animationType="fade" onRequestClose={pop} statusBarTranslucent navigationBarTranslucent>
                    <SafeAreaProvider>
                      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', alignItems: 'center', justifyContent: 'center' }}>
                        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={pop} feedback="none" />
                        <View style={{ width: w, height: h, borderRadius: 28, overflow: 'hidden', backgroundColor: t.bg }}>
                          {glassOn ? <Backdrop /> : null}
                          <Boundary resetKey={route.key}>
                            <Screen route={route} />
                          </Boundary>
                        </View>
                      </View>
                    </SafeAreaProvider>
                  </Modal>
                );
              }
              return (
                <Modal key={route.key} visible animationType="slide" onRequestClose={pop} statusBarTranslucent navigationBarTranslucent>
                  <SafeAreaProvider>
                    <View style={{ flex: 1, backgroundColor: t.bg }}>
                      {glassOn ? <Backdrop /> : null}
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
      </GlassBackdropContext.Provider>
    </NavContext.Provider>
  );
}

// the chosen language; changing it rebuilds the screens so every text switches at once
function LanguageGate({ children }) {
  const { settings } = useStore();
  const lang = setLanguage(settings.language || 'system');
  return <React.Fragment key={lang}>{children}</React.Fragment>;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ScrollGlowProvider>
        <StoreProvider>
          <LanguageGate>
            <Main />
          </LanguageGate>
        </StoreProvider>
      </ScrollGlowProvider>
    </SafeAreaProvider>
  );
}

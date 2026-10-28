import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useTheme, TAB_BAR_SPACE } from '../theme';
import { useStore } from '../store';
import { useNav } from '../nav';
import { sportByKey } from '../sports';
import { dayBoard, sameDay } from '../api/espn';
import { LeagueBlock, SportBar } from '../components/match';
import DateStrip, { startOfDay } from '../components/DateStrip';
import { Glass } from '../components/Glass';
import { Pressable } from '../components/Touch';
import { Empty, GlassCircle, LargeHeader, Loading } from '../components/ui';
import { tap } from '../haptics';

export default function MatchesScreen() {
  const t = useTheme();
  const nav = useNav();
  const { settings, setSetting, favs } = useStore();
  const [sport, setSport] = useState(settings.sport || 'soccer');
  const [date, setDate] = useState(startOfDay(new Date()));
  const [live, setLive] = useState(false);
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState('all'); // all | odds
  const reqId = useRef(0);

  const load = useCallback(
    async (quiet) => {
      const id = ++reqId.current;
      if (!quiet) setGroups(null);
      setError(null);
      try {
        const isToday = sameDay(date, new Date());
        const res = await dayBoard(sport, live ? new Date() : date, { ttl: isToday || live ? 20000 : 5 * 60 * 1000 });
        if (id !== reqId.current) return;
        setGroups(res);
      } catch (e) {
        if (id !== reqId.current) return;
        setError(e.message || 'Could not load matches');
        setGroups([]);
      }
    },
    [sport, date, live]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  // keep live scores moving while something is in play
  const anyLive = useMemo(() => (groups || []).some((g) => g.items.some((m) => m.state === 'in')), [groups]);
  useEffect(() => {
    if (!anyLive && !live) return undefined;
    const iv = setInterval(() => load(true), 25000);
    return () => clearInterval(iv);
  }, [anyLive, live, load]);

  const sp = sportByKey(sport);
  const shown = useMemo(() => {
    let gs = (groups || []).map((g) => ({ ...g, items: live ? g.items.filter((m) => m.state === 'in') : g.items })).filter((g) => g.items.length);
    const pinned = (slug) => favs.leagues.includes(`${sport}/${slug}`);
    const top = (slug) => !!(sp.leagues.find((l) => l.slug === slug) || {}).top;
    const idx = (slug) => sp.leagues.findIndex((l) => l.slug === slug);
    gs = gs.sort((a, b) => {
      const pa = pinned(a.league.slug) ? 0 : top(a.league.slug) ? 1 : 2;
      const pb = pinned(b.league.slug) ? 0 : top(b.league.slug) ? 1 : 2;
      return pa - pb || idx(a.league.slug) - idx(b.league.slug);
    });
    return gs;
  }, [groups, live, favs.leagues, sport, sp]);

  const total = shown.reduce((n, g) => n + g.items.length, 0);
  const liveCount = (groups || []).reduce((n, g) => n + g.items.filter((m) => m.state === 'in').length, 0);

  // days holding a match you follow get a dot, like days with calls in the dialer
  const marked = useMemo(() => new Set(favs.matches.filter((m) => m.sport === sport).map((m) => new Date(m.date).toDateString())), [favs.matches, sport]);

  const header = (
    <View>
      <LargeHeader
        title="Matches"
        subtitle={live ? `${liveCount} live now` : `${sameDay(date, new Date()) ? 'Today' : date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}${groups ? ` · ${total} events` : ''}`}
        left={
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <GlassCircle icon={view === 'odds' ? 'stats-chart' : 'options-outline'} active={view === 'odds'} onPress={() => setView(view === 'odds' ? 'all' : 'odds')} />
            <Pressable
              style={{ marginLeft: 10 }}
              onPress={() => {
                tap();
                setLive(!live);
              }}
            >
              {({ pressed }) => (
                <Glass radius={23} strong pressed={pressed} tint={live ? t.live : undefined} tintOpacity={0.95} style={{ height: 46, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: live ? 'rgba(255,255,255,0.25)' : t.live, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />
                  </View>
                  <Text style={{ color: live ? '#fff' : t.text, fontSize: 17, fontWeight: '600' }}>Live{liveCount ? ` ${liveCount}` : ''}</Text>
                </Glass>
              )}
            </Pressable>
          </View>
        }
        right={<GlassCircle icon="settings-outline" onPress={() => nav.push({ name: 'settings' })} />}
      />
      <View style={{ height: 14 }} />
      <SportBar
        value={sport}
        counts={{ [sport]: liveCount }}
        onChange={(k) => {
          setSport(k);
          setSetting('sport', k);
        }}
      />
      <DateStrip
        value={date}
        live={liveCount > 0}
        marked={marked}
        onChange={(d) => {
          setLive(false);
          setDate(d);
        }}
      />
      <View style={{ height: 14 }} />
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: t.bg }}
      data={groups ? shown : []}
      keyExtractor={(g) => g.league.slug}
      ListHeaderComponent={header}
      renderItem={({ item }) => <LeagueBlock group={item} sport={sport} showOdds={view === 'odds'} />}
      ListEmptyComponent={
        !groups ? (
          <Loading label={`Loading ${sp.name.toLowerCase()}…`} />
        ) : error ? (
          <Empty icon="cloud-offline-outline" title="Couldn't load scores" body={error} action="Try again" onAction={() => load(false)} />
        ) : (
          <Empty
            icon={live ? 'radio-outline' : 'calendar-outline'}
            title={live ? `No live ${sp.name.toLowerCase()} right now` : `No ${sp.name.toLowerCase()} on this day`}
            body={live ? 'Turn off Live to see the full schedule.' : 'Try another date or sport.'}
          />
        )
      }
      ListFooterComponent={
        groups && shown.length ? (
          <Text style={{ textAlign: 'center', color: t.tertiary, fontSize: 12, marginTop: 4 }}>Pin a competition to keep it at the top</Text>
        ) : null
      }
      contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + 20 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={t.secondary}
          onRefresh={async () => {
            setRefreshing(true);
            await load(true);
            setRefreshing(false);
          }}
        />
      }
      initialNumToRender={4}
      windowSize={7}
    />
  );
}

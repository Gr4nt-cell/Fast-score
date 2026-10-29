import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { Text } from '../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, TAB_BAR_SPACE } from '../theme';
import { useStore } from '../store';
import { useNav } from '../nav';
import { SPORTS, sportByKey } from '../sports';
import { dayBoard, pool, sameDay } from '../api/espn';
import { attachOdds } from '../api/msport';
import { LeagueBlock, SportPill } from '../components/match';
import DateStrip, { startOfDay } from '../components/DateStrip';
import { Empty, GlassCircle, LiveDot, Loading } from '../components/ui';

/**
 * Matches tab and Live tab. Layout from the sketch: a fixed top bar (filter circle · sport
 * pill · settings circle), then on Matches the calendar, also fixed; only the list scrolls.
 */
export default function MatchesScreen({ liveMode = false }) {
  const t = useTheme();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { settings, setSetting, favs } = useStore();
  // the Live tab starts on every sport at once
  const [sport, setSport] = useState(liveMode ? 'all' : settings.sport || 'soccer');
  const [date, setDate] = useState(startOfDay(new Date()));
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState('all'); // all | odds
  const reqId = useRef(0);
  const live = liveMode;

  const load = useCallback(
    async (quiet) => {
      const id = ++reqId.current;
      if (!quiet) setGroups(null);
      setError(null);
      try {
        const isToday = sameDay(date, new Date());
        const day = live ? new Date() : date;
        const ttl = isToday || live ? 20000 : 5 * 60 * 1000;
        let res;
        if (sport === 'all') {
          const per = await pool(SPORTS, 4, async (s) => (await dayBoard(s.key, day, { ttl })).map((g) => ({ ...g, sport: s.key })));
          res = per.filter(Boolean).flat();
        } else {
          const b = await dayBoard(sport, day, { ttl });
          res = b.map((g) => ({ ...g, sport }));
          res.source = b.source;
        }
        if (id !== reqId.current) return;
        setGroups(res);
        // today: note MSport's prices in the background, so finished matches can show closing odds
        if (view !== 'odds' && isToday && !live && sport !== 'all') attachOdds(res, sport).catch(() => {});
        // odds view: MSport prices for every match it lists
        if (view === 'odds') {
          const sports = sport === 'all' ? SPORTS.map((x) => x.key) : [sport];
          await Promise.all(sports.map((k) => attachOdds(res.filter((g) => (g.sport || sport) === k), k)));
          if (id !== reqId.current) return;
          const copy = res.map((g) => ({ ...g, items: [...g.items] }));
          copy.source = res.source;
          setGroups(copy);
        }
      } catch (e) {
        if (id !== reqId.current) return;
        setError(e.message || 'Could not load matches');
        setGroups([]);
      }
    },
    [sport, date, live, settings.source, view] // eslint-disable-line react-hooks/exhaustive-deps
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
    const pinTpl = new Set(favs.leagues.filter((k) => k.includes('/fs:t:')).map((k) => k.split(':')[3]));
    const pinned = (g) => favs.leagues.includes(`${g.sport}/${g.league.slug}`) || (g.items[0] && pinTpl.has(g.items[0].tpl));
    const meta = (g) => sportByKey(g.sport).leagues.find((l) => l.slug === g.league.slug) || {};
    const sIdx = (g) => SPORTS.findIndex((x) => x.key === g.sport);
    const idx = (g) => sportByKey(g.sport).leagues.findIndex((l) => l.slug === g.league.slug);
    gs = gs.sort((a, b) => {
      const pa = pinned(a) ? 0 : meta(a).top ? 1 : 2;
      const pb = pinned(b) ? 0 : meta(b).top ? 1 : 2;
      return pa - pb || sIdx(a) - sIdx(b) || idx(a) - idx(b);
    });
    return gs;
  }, [groups, live, favs.leagues]);

  const total = shown.reduce((n, g) => n + g.items.length, 0);
  const liveCount = (groups || []).reduce((n, g) => n + g.items.filter((m) => m.state === 'in').length, 0);

  // days holding a match you follow get a dot, like days with calls in the dialer
  const marked = useMemo(() => new Set(favs.matches.filter((m) => sport === 'all' || m.sport === sport).map((m) => new Date(m.date).toDateString())), [favs.matches, sport]);
  const sportName = sport === 'all' ? 'All sports' : sp.name;

  const summary = live
    ? `${liveCount} live now`
    : `${sameDay(date, new Date()) ? 'Today' : date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}${groups ? ` · ${total} events` : ''}`;

  // ---- fixed part: top bar (+ calendar on Matches) ----
  const fixed = (
    <View style={{ paddingTop: insets.top + 8, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 14 }}>
        <GlassCircle icon={view === 'odds' ? 'stats-chart' : 'options-outline'} active={view === 'odds'} onPress={() => setView(view === 'odds' ? 'all' : 'odds')} />
        <SportPill
          value={sport}
          withAll={live}
          counts={{ [sport]: liveCount }}
          onChange={(k) => {
            setSport(k);
            if (k !== 'all') setSetting('sport', k);
          }}
        />
        <GlassCircle icon="settings-outline" onPress={() => nav.push({ name: 'settings' })} />
      </View>
      {live ? null : <DateStrip value={date} live={liveCount > 0} marked={marked} onChange={setDate} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingTop: 12, paddingBottom: 10 }}>
        {live ? <LiveDot /> : null}
        <Text style={{ color: live ? t.live : t.secondary, fontSize: 13, fontWeight: '700', flex: 1 }} numberOfLines={1}>
          {live ? `Live · ${sportName}` : sportName} · {summary}
          {groups && groups.source === 'tsdb' ? ' · via TheSportsDB' : ''}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {fixed}
      <FlatList
        style={{ flex: 1 }}
        data={groups ? shown : []}
        keyExtractor={(g) => `${g.sport}/${g.league.slug}`}
        renderItem={({ item }) => <LeagueBlock group={item} sport={item.sport || sport} showOdds={view === 'odds'} />}
        ListEmptyComponent={
          !groups ? (
            <Loading label={`Loading ${sportName.toLowerCase()}…`} />
          ) : error ? (
            <Empty icon="cloud-offline-outline" title="Couldn't load scores" body={error} action="Try again" onAction={() => load(false)} />
          ) : (
            <Empty
              icon={live ? 'radio-outline' : 'calendar-outline'}
              title={live ? `No live ${sport === 'all' ? 'games' : sp.name.toLowerCase()} right now` : `No ${sp.name.toLowerCase()} on this day`}
              body={live ? (sport === 'all' ? 'Nothing is in play in any sport at the moment. Check Matches for what’s coming up today.' : 'Pick All or another sport above, or check Matches for what’s coming up.') : 'Try another date or sport.'}
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
    </View>
  );
}

import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from './Touch';
import { Glass } from './Glass';
import { Chevron, LiveDot, Logo, SportIcon, Star } from './ui';
import { useTheme } from '../theme';
import { useNav } from '../nav';
import { useStore, formatOdds } from '../store';
import { SPORTS } from '../sports';
import { sameDay } from '../api/espn';
import { tap } from '../haptics';

export function favMatch(m) {
  return {
    key: m.key,
    id: m.id,
    eventId: m.eventId,
    sport: m.sport,
    league: m.league,
    leagueName: m.leagueName,
    date: m.date,
    home: { name: m.home && m.home.name, logo: m.home && m.home.logo },
    away: { name: m.away && m.away.name, logo: m.away && m.away.logo },
    kind: m.kind,
  };
}

function StatusCol({ m }) {
  const t = useTheme();
  const live = m.state === 'in';
  const d = new Date(m.date);
  let top;
  let bottom = null;
  if (m.postponed) top = m.status.name.includes('POSTPONED') ? 'PPD' : m.short;
  else if (m.state === 'pre') {
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const ampm = time.match(/\s?([AaPp]\.?\s?[Mm]\.?)$/);
    top = ampm ? time.slice(0, ampm.index).trim() : time;
    const day = !sameDay(d, new Date()) ? d.toLocaleDateString([], { day: 'numeric', month: 'short' }) : '';
    bottom = [ampm ? ampm[1].replace(/\./g, '').toUpperCase() : '', day].filter(Boolean).join(' · ') || null;
  } else if (m.state === 'post') top = /FT|Final/i.test(m.short) ? 'FT' : m.short.replace('Final', 'FT');
  else top = m.short;
  return (
    <View style={{ width: 60, alignItems: 'center' }}>
      <Text style={{ fontSize: 13, fontWeight: live ? '800' : '600', color: live ? t.live : m.postponed ? t.orange : t.secondary, textAlign: 'center', alignSelf: 'stretch' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {top}
      </Text>
      {bottom ? (
        <Text style={{ fontSize: 10.5, color: t.tertiary, marginTop: 1, textAlign: 'center', alignSelf: 'stretch' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {bottom}
        </Text>
      ) : null}
    </View>
  );
}

function Side({ c, score, sets, live, won, lost }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 24 }}>
      <Logo uri={c.logo} name={c.name} size={18} round={c.isAthlete} />
      <Text style={{ flex: 1, marginLeft: 8, fontSize: 15, fontWeight: won ? '700' : '500', color: lost ? t.secondary : t.text }} numberOfLines={1}>
        {c.rank ? <Text style={{ color: t.secondary, fontSize: 12 }}>{c.rank} </Text> : null}
        {c.name}
      </Text>
      {sets
        ? sets.map((s, i) => (
            <Text key={i} style={{ width: 18, textAlign: 'center', fontSize: 14, color: t.secondary, fontVariant: ['tabular-nums'] }}>
              {s}
            </Text>
          ))
        : null}
      <Text style={{ width: 30, textAlign: 'right', fontSize: 15.5, fontWeight: '700', color: live ? t.live : lost ? t.secondary : t.text, fontVariant: ['tabular-nums'] }}>{score ?? ''}</Text>
    </View>
  );
}

export function MatchRow({ m, last, showLeague, showOdds }) {
  const t = useTheme();
  const nav = useNav();
  const { isFav, toggle, settings } = useStore();
  if (m.kind === 'field') return <FieldRow m={m} last={last} showLeague={showLeague} />;
  const live = m.state === 'in';
  const started = m.state !== 'pre';
  const tennis = m.sport === 'tennis';
  const hScore = started ? m.home.score : null;
  const aScore = started ? m.away.score : null;
  const hWon = m.state === 'post' && (m.home.winner || (!m.away.winner && Number(hScore) > Number(aScore)));
  const aWon = m.state === 'post' && (m.away.winner || (!m.home.winner && Number(aScore) > Number(hScore)));
  // tennis: the big number is sets won; the small ones are games per set
  const setsWon = (me, other) => me.linescores.reduce((n, g, i) => n + (Number(g) > Number(other.linescores[i] || 0) ? 1 : 0), 0);
  const fav = isFav('matches', m.key);
  const reds = (m.details || []).filter((d) => d.red);
  const odds = showOdds && settings.showOdds && m.state === 'pre' && m.odds && m.odds.home != null ? m.odds : null;
  return (
    <Pressable onPress={() => nav.push({ name: 'match', match: m })} feedback="subtle">
      <View style={[styles.row, { borderBottomColor: t.separator, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth }]}>
        <StatusCol m={m} />
        <View style={{ flex: 1, paddingRight: 8, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: t.separator, paddingLeft: 10 }}>
          {showLeague ? (
            <Text style={{ color: t.secondary, fontSize: 11.5, fontWeight: '600', marginBottom: 2 }} numberOfLines={1}>
              {m.leagueName}
            </Text>
          ) : null}
          {m.group && m.individual ? (
            <Text style={{ color: t.secondary, fontSize: 11.5, marginBottom: 2 }} numberOfLines={1}>
              {m.group}
            </Text>
          ) : null}
          <Side c={m.home} score={tennis && started ? setsWon(m.home, m.away) : hScore} sets={tennis && started ? m.home.linescores : null} live={live} won={hWon} lost={aWon} />
          <Side c={m.away} score={tennis && started ? setsWon(m.away, m.home) : aScore} sets={tennis && started ? m.away.linescores : null} live={live} won={aWon} lost={hWon} />
          {reds.length ? (
            <View style={{ flexDirection: 'row', marginTop: 2 }}>
              {reds.slice(0, 3).map((r, i) => (
                <View key={i} style={{ width: 8, height: 11, borderRadius: 1.5, backgroundColor: t.red, marginRight: 3 }} />
              ))}
            </View>
          ) : null}
          {odds ? (
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
              {[
                ['1', odds.home],
                ...(m.sport === 'soccer' || m.sport === 'rugby' ? [['X', odds.draw]] : []),
                ['2', odds.away],
              ].map(([k, v]) => (
                <View key={k} style={{ flexDirection: 'row', paddingHorizontal: 8, height: 22, borderRadius: 7, alignItems: 'center', backgroundColor: t.track }}>
                  <Text style={{ color: t.secondary, fontSize: 11, fontWeight: '700', marginRight: 5 }}>{k}</Text>
                  <Text style={{ color: t.text, fontSize: 12, fontWeight: '600' }}>{formatOdds(v, settings.oddsFormat)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <Star on={fav} size={20} onPress={() => toggle('matches', favMatch(m))} />
      </View>
    </Pressable>
  );
}

export function FieldRow({ m, last, showLeague }) {
  const t = useTheme();
  const nav = useNav();
  const live = m.state === 'in';
  const top = (m.field || []).slice(0, 3);
  const d = new Date(m.date);
  return (
    <Pressable onPress={() => nav.push({ name: 'match', match: m })} feedback="subtle">
      <View style={[styles.row, { alignItems: 'flex-start', borderBottomColor: t.separator, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth }]}>
        <View style={{ width: 54, alignItems: 'center', paddingTop: 2 }}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: live ? t.live : t.secondary, textAlign: 'center' }} numberOfLines={2}>
            {live ? 'LIVE' : m.state === 'post' ? 'Final' : d.toLocaleDateString([], { day: 'numeric', month: 'short' })}
          </Text>
        </View>
        <View style={{ flex: 1, paddingLeft: 10, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: t.separator }}>
          {showLeague ? <Text style={{ color: t.secondary, fontSize: 11.5, fontWeight: '600' }}>{m.leagueName}</Text> : null}
          <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
            {m.eventName}
          </Text>
          {m.venue ? (
            <Text style={{ color: t.secondary, fontSize: 12.5, marginBottom: 4 }} numberOfLines={1}>
              {m.venue}
            </Text>
          ) : null}
          {m.state !== 'pre'
            ? top.map((c, i) => (
                <View key={c.id + i} style={{ flexDirection: 'row', alignItems: 'center', height: 22 }}>
                  <Text style={{ width: 26, color: t.secondary, fontSize: 13, fontWeight: '700' }}>{c.position || c.order || i + 1}</Text>
                  <Logo uri={c.flag || c.logo} name={c.name} size={16} round />
                  <Text style={{ flex: 1, marginLeft: 6, color: t.text, fontSize: 14 }} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={{ color: t.text, fontWeight: '700', fontSize: 14 }}>{c.score ?? ''}</Text>
                </View>
              ))
            : null}
        </View>
        <Chevron />
      </View>
    </Pressable>
  );
}

export function LeagueHeader({ league, sport, country, count, liveCount, pinned, onPin, onPress }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} feedback="subtle">
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }}>
        <Logo uri={league.logo} name={league.name} size={26} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 15.5 }} numberOfLines={1}>
            {league.name}
          </Text>
          <Text style={{ color: t.secondary, fontSize: 12 }}>
            {country}
            {count ? ` · ${count} ${count === 1 ? 'event' : 'events'}` : ''}
          </Text>
        </View>
        {liveCount ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
            <LiveDot />
            <Text style={{ color: t.live, fontWeight: '800', fontSize: 12 }}>{liveCount}</Text>
          </View>
        ) : null}
        {onPin ? (
          <Pressable hitSlop={10} onPress={onPin} style={{ marginRight: 8 }}>
            <Ionicons name={pinned ? 'pin' : 'pin-outline'} size={19} color={pinned ? t.blue : t.tertiary} />
          </Pressable>
        ) : null}
        <Chevron />
      </View>
    </Pressable>
  );
}

/** A competition card: header plus its matches */
export function LeagueBlock({ group, sport, showOdds }) {
  const nav = useNav();
  const { isFav, toggle } = useStore();
  const lk = `${sport}/${group.league.slug}`;
  const live = group.items.filter((x) => x.state === 'in').length;
  return (
    <Glass radius={24} strong style={{ marginHorizontal: 16, marginBottom: 14 }}>
      <LeagueHeader
        league={group.league}
        sport={sport}
        country={group.items[0] && group.items[0].country}
        count={group.items.length}
        liveCount={live}
        pinned={isFav('leagues', lk)}
        onPin={() => {
          tap();
          toggle('leagues', lk);
        }}
        onPress={() => nav.push({ name: 'league', sport, league: group.league.slug, title: group.league.name, logo: group.league.logo })}
      />
      <View style={{ paddingHorizontal: 6, paddingBottom: 4 }}>
        {group.items.map((m, i) => (
          <MatchRow key={m.key} m={m} last={i === group.items.length - 1} showOdds={showOdds} />
        ))}
      </View>
    </Glass>
  );
}

// ---------- sport chips ----------

export function SportBar({ value, onChange, counts = {} }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
      <Glass radius={26} strong style={{ height: 52 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 5, alignItems: 'center' }}>
          {SPORTS.map((s) => {
            const on = s.key === value;
            return (
              <Pressable
                key={s.key}
                onPress={() => {
                  tap();
                  onChange(s.key);
                }}
              >
                <View style={{ height: 42, paddingHorizontal: 14, borderRadius: 21, flexDirection: 'row', alignItems: 'center', backgroundColor: on ? t.blue : 'transparent' }}>
                  <SportIcon name={s.icon} size={18} color={on ? '#fff' : t.text} />
                  <Text style={{ marginLeft: 6, color: on ? '#fff' : t.text, fontWeight: on ? '700' : '600', fontSize: 14 }}>{s.name}</Text>
                  {counts[s.key] ? (
                    <View style={{ marginLeft: 6, backgroundColor: on ? 'rgba(255,255,255,0.25)' : t.live, borderRadius: 8, paddingHorizontal: 5, height: 16, justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800' }}>{counts[s.key]}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </Glass>
    </View>
  );
}

/** The sketch's top bar: compact sport pill that sits between the two circle buttons.
 *  The chosen sport shows its icon and name; the others show just their icon. */
export function SportPill({ value, onChange, counts = {} }) {
  const t = useTheme();
  return (
    <Glass radius={23} strong style={{ flex: 1, height: 46, marginHorizontal: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 4, alignItems: 'center' }}>
        {SPORTS.map((s) => {
          const on = s.key === value;
          return (
            <Pressable
              key={s.key}
              hitSlop={4}
              onPress={() => {
                tap();
                onChange(s.key);
              }}
            >
              <View
                style={{
                  height: 38,
                  minWidth: 38,
                  paddingHorizontal: on ? 12 : 9,
                  borderRadius: 19,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: on ? (t.dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.07)') : 'transparent',
                }}
              >
                <SportIcon name={s.icon} size={20} color={on ? t.blue : t.text} />
                {on ? <Text numberOfLines={1} style={{ marginLeft: 6, paddingRight: 1, color: t.blue, fontWeight: '700', fontSize: 14 }}>{s.name}</Text> : null}
                {counts[s.key] ? <View style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: 4, backgroundColor: t.live }} /> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </Glass>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 4 },
});

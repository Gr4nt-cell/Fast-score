import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, TAB_BAR_SPACE } from '../theme';
import { useNav } from '../nav';
import { getDailyPicks, pickHistory } from '../predict';
import { Glass } from '../components/Glass';
import { Pressable } from '../components/Touch';
import { Card, Empty, GlassCircle, LargeHeader, Loading, Logo, SectionTitle, SportIcon } from '../components/ui';
import { sportByKey } from '../sports';

const side = (c) => ({ ...c, linescores: [], tiebreaks: [], isAthlete: false, score: null, form: null });

/** A saved pick carries just enough to open the full match screen, which fetches the rest. */
export function pickToMatch(p) {
  return {
    ...p,
    kind: 'match',
    state: 'pre',
    short: '',
    detail: '',
    status: { name: '' },
    home: side(p.home),
    away: side(p.away),
    details: [],
    odds: null,
  };
}

function ProbBar({ probs, draws }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2, marginTop: 10 }}>
      <View style={{ flex: probs.home, backgroundColor: t.blue }} />
      {draws ? <View style={{ flex: probs.draw, backgroundColor: t.tertiary }} /> : null}
      <View style={{ flex: probs.away, backgroundColor: t.orange }} />
    </View>
  );
}

function PickCard({ p, i }) {
  const t = useTheme();
  const nav = useNav();
  const d = new Date(p.date);
  const sp = sportByKey(p.sport);
  const conf = Math.round(p.tip.prob * 100);
  return (
    <Pressable onPress={() => nav.push({ name: 'match', match: pickToMatch(p) })} feedback="subtle">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <LinearGradient colors={['#7A5CFF', '#BF5AF2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '900' }}>{i + 1}</Text>
          </LinearGradient>
          <SportIcon name={sp.icon} size={15} color={t.secondary} />
          <Text style={{ flex: 1, color: t.secondary, fontSize: 12.5, fontWeight: '600', marginLeft: 4 }} numberOfLines={1}>
            {p.leagueName}
          </Text>
          <Text style={{ color: t.secondary, fontSize: 12.5, fontWeight: '700' }}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
        <View style={{ marginTop: 12, gap: 8 }}>
          {[p.home, p.away].map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Logo uri={c.logo} name={c.name} size={24} />
              <Text style={{ marginLeft: 10, color: t.text, fontSize: 16, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                {c.name}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 36, borderRadius: 18, backgroundColor: t.dark ? 'rgba(191,90,242,0.18)' : 'rgba(175,82,222,0.1)' }}>
            <Ionicons name="sparkles" size={14} color={t.purple} />
            <Text style={{ color: t.text, fontWeight: '800', marginLeft: 6, flex: 1 }} numberOfLines={1}>
              {p.tip.label}
            </Text>
          </View>
          <View style={{ marginLeft: 10, alignItems: 'flex-end' }}>
            <Text style={{ color: conf >= 70 ? t.green : conf >= 55 ? t.orange : t.text, fontWeight: '900', fontSize: 22 }}>{conf}%</Text>
            <Text style={{ color: t.secondary, fontSize: 10.5, fontWeight: '600' }}>confidence</Text>
          </View>
        </View>
        <ProbBar probs={p.probs} draws={sp.draws} />
        <View style={{ marginTop: 10, gap: 4 }}>
          {p.reasons.slice(0, 3).map((r, k) => (
            <Text key={k} style={{ color: t.secondary, fontSize: 12.5, lineHeight: 17 }} numberOfLines={2}>
              • {r}
            </Text>
          ))}
        </View>
      </Card>
    </Pressable>
  );
}

export default function PicksScreen() {
  const t = useTheme();
  const nav = useNav();
  const [day, setDay] = useState(null);
  const [progress, setProgress] = useState('Scanning today’s matches…');
  const [history, setHistory] = useState([]);
  const [about, setAbout] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (force) => {
    setError(null);
    try {
      const d = await getDailyPicks({ force, onProgress: setProgress });
      setDay(d);
    } catch (e) {
      setError(e.message || 'Could not build today’s picks');
      setDay({ picks: [] });
    }
    pickHistory(14).then(setHistory).catch(() => {});
  }, []);

  useEffect(() => {
    run(false);
  }, [run]);

  const settled = history.flatMap((h) => h.picks).filter((p) => p.result === true || p.result === false);
  const hits = settled.filter((p) => p.result === true).length;
  const today = new Date();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + 20 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={t.secondary}
          onRefresh={async () => {
            setRefreshing(true);
            await run(true);
            setRefreshing(false);
          }}
        />
      }
    >
      <LargeHeader
        title="AI Picks"
        subtitle={`Top 5 for ${today.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}`}
        left={<GlassCircle icon="information-circle-outline" active={about} onPress={() => setAbout(!about)} />}
        right={<GlassCircle icon="settings-outline" onPress={() => nav.push({ name: 'settings' })} />}
      />
      <View style={{ height: 14 }} />
      <Glass radius={26} strong style={{ marginHorizontal: 16, marginBottom: 14, overflow: 'hidden' }}>
        <LinearGradient colors={t.dark ? ['rgba(122,92,255,0.35)', 'rgba(191,90,242,0.12)'] : ['rgba(122,92,255,0.16)', 'rgba(191,90,242,0.04)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: '800', fontSize: 17 }}>Track record</Text>
            <Text style={{ color: t.secondary, fontSize: 13, marginTop: 2 }}>{settled.length ? `${hits} of ${settled.length} picks landed in the last 14 days` : 'Results appear here after today’s picks are played'}</Text>
          </View>
          <Text style={{ color: t.purple, fontWeight: '900', fontSize: 30 }}>{settled.length ? `${Math.round((hits / settled.length) * 100)}%` : '—'}</Text>
        </View>
      </Glass>
      {about ? (
        <Card>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, marginBottom: 6 }}>How the picks are made</Text>
          <Text style={{ color: t.secondary, fontSize: 13.5, lineHeight: 20 }}>
            Every morning the app scans the day's football, NBA, NHL, NFL, MLB and rugby fixtures. For football a Poisson goals model uses each side's scoring and conceding rates from the current table, home advantage and recent form; other sports use win rates, points difference and home advantage. When bookmaker odds are available they're blended in 50/50. The five most confident calls (at most two per competition) become the day's picks and are locked once the first one kicks off, so the track record is honest.{'\n\n'}This runs entirely on your phone. It's for fun and insight, not betting advice.
          </Text>
        </Card>
      ) : null}
      {!day ? (
        <Loading label={progress} />
      ) : day.picks.length ? (
        <>
          <SectionTitle right={<Text style={{ color: t.secondary, fontSize: 12 }}>{day.scanned ? `${day.modelled} of ${day.scanned} matches modelled` : ''}</Text>}>Today</SectionTitle>
          {day.picks.map((p, i) => (
            <PickCard key={p.key} p={p} i={i} />
          ))}
        </>
      ) : (
        <Empty icon="sparkles-outline" title={error ? 'Couldn’t build picks' : 'No picks today'} body={error || 'There aren’t enough upcoming matches with data today. Pull down to try again later.'} action="Try again" onAction={() => run(true)} />
      )}
      {history.length ? <SectionTitle>Previous days</SectionTitle> : null}
      {history.map((h) => (
        <Card key={h.date}>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 15, marginBottom: 6 }}>
            {new Date(Number(h.date.slice(0, 4)), Number(h.date.slice(4, 6)) - 1, Number(h.date.slice(6))).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })}
          </Text>
          {h.picks.map((p, i) => (
            <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: i === h.picks.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: t.separator }}>
              <Ionicons
                name={p.result === true ? 'checkmark-circle' : p.result === false ? 'close-circle' : p.result === 'void' ? 'remove-circle' : 'time-outline'}
                size={20}
                color={p.result === true ? t.green : p.result === false ? t.red : t.tertiary}
              />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={{ color: t.text, fontSize: 13.5, fontWeight: '600' }} numberOfLines={1}>
                  {p.home.short || p.home.name} vs {p.away.short || p.away.name}
                </Text>
                <Text style={{ color: t.secondary, fontSize: 12 }} numberOfLines={1}>
                  {p.tip.label} · {Math.round(p.tip.prob * 100)}%
                </Text>
              </View>
              <Text style={{ color: t.text, fontWeight: '800' }}>{p.final || ''}</Text>
            </View>
          ))}
        </Card>
      ))}
    </ScrollView>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, TAB_BAR_SPACE } from '../theme';
import { useNav } from '../nav';
import { pickHistory, picksForDate } from '../predict';
import { forecastMetrics } from '../prediction/model';
import DateStrip, { startOfDay } from '../components/DateStrip';
import { load } from '../store';
import { Glass, ScrollGlowScrollView as ScrollView } from '../components/Glass';
import { Pressable } from '../components/Touch';
import { Card, Empty, FormPills, GlassCircle, Loading, Logo, SectionTitle, SportIcon } from '../components/ui';
import { sportByKey } from '../sports';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
          {p.result === true || p.result === false || p.result === 'void' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
              <Ionicons name={p.result === true ? 'checkmark-circle' : p.result === false ? 'close-circle' : 'remove-circle'} size={18} color={p.result === true ? t.green : p.result === false ? t.red : t.tertiary} />
              {p.final ? <Text style={{ color: t.text, fontWeight: '800', fontSize: 12.5, marginLeft: 4 }}>{p.final}</Text> : null}
            </View>
          ) : null}
          <View style={{borderRadius:8,paddingHorizontal:7,paddingVertical:3,marginRight:8,backgroundColor:t.track}}>
            <Text style={{fontSize:10.5,color:t.secondary,fontWeight:'700'}}>v{p.modelVersion || 2} · {p.quality || 'saved'}</Text>
          </View>
          <Text style={{ color: t.secondary, fontSize: 12.5, fontWeight: '700' }}>
            {d.toDateString() !== new Date().toDateString() ? d.toLocaleDateString([], { weekday: 'short' }) + ' ' : ''}
            {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>
        <View style={{ marginTop: 12, gap: 8 }}>
          {[
            [p.home, p.homeForm],
            [p.away, p.awayForm],
          ].map(([c, f]) => (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Logo uri={c.logo} name={c.name} size={24} />
              <Text style={{ marginLeft: 10, color: t.text, fontSize: 16, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                {c.name}
              </Text>
              {f ? <FormPills form={f} count={10} size={13} /> : null}
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
            <Text style={{ color: conf >= 90 ? t.green : conf >= 70 ? t.orange : t.text, fontWeight: '900', fontSize: 22 }}>{conf}%</Text>
            <Text style={{ color: t.secondary, fontSize: 10.5, fontWeight: '600' }}>model estimate</Text>
          </View>
        </View>
        <ProbBar probs={p.probs} draws={sp.draws} />
        <View style={{ marginTop: 10, gap: 4 }}>
          {p.reasons.slice(0, 5).map((r, k) => (
            <Text key={k} style={{ color: t.secondary, fontSize: 12.5, lineHeight: 17 }} numberOfLines={2}>
              • {r}
            </Text>
          ))}
        </View>
      </Card>
    </Pressable>
  );
}

const MAX_BACK = 30;
const MAX_AHEAD = 7;

export default function PicksScreen() {
  const t = useTheme();
  const nav = useNav();
  const [date, setDate] = useState(startOfDay(new Date()));
  const [day, setDay] = useState(null);
  const [progress, setProgress] = useState('Scanning matches…');
  const [history, setHistory] = useState([]);
  const [marked, setMarked] = useState(new Set());
  const [about, setAbout] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const reqId = React.useRef(0);
  const insets = useSafeAreaInsets();

  const today = startOfDay(new Date());
  const diff = Math.round((date - today) / 86400000);
  const inRange = diff >= -MAX_BACK && diff <= MAX_AHEAD;

  const run = useCallback(
    async (force) => {
      const id = ++reqId.current;
      setError(null);
      if (!force) setDay(null);
      if (!inRange) return setDay({ picks: [], kind: 'range' });
      setProgress(diff < 0 ? 'Checking that day’s matches…' : 'Scanning matches…');
      try {
        const d = await picksForDate(date, { force, onProgress: (x) => id === reqId.current && setProgress(x) });
        if (id === reqId.current) setDay(d);
      } catch (e) {
        if (id !== reqId.current) return;
        setError(e.message || 'Could not build the picks');
        setDay({ picks: [] });
      }
      pickHistory(14).then(value => {if(id===reqId.current)setHistory(value);}).catch(() => {});
      load('picks5:index', []).then((idx) => {if(id===reqId.current)setMarked(new Set((Array.isArray(idx)?idx:[]).filter(x=>/^\d{8}$/.test(x)).map((x) => new Date(Number(x.slice(0,4)),Number(x.slice(4,6))-1,Number(x.slice(6))).toDateString())));}).catch(()=>{});
    },
    [date] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    run(false);
    return ()=>{reqId.current++;};
  }, [run]);

  const metrics = forecastMetrics(history);
  const hits = metrics.hits;
  const settled = new Array(metrics.count);
  const dayName = diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : diff === -1 ? 'yesterday' : date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  const dayHits = day ? day.picks.filter((p) => p.result === true).length : 0;
  const daySettled = day ? day.picks.filter((p) => p.result === true || p.result === false).length : 0;
  const note =
    day && day.kind === 'simulation'
      ? 'Legacy historical simulation · excluded from the forecast track record.'
      : day && day.kind === 'preview'
      ? 'Saved preview from the fixtures known so far. This date’s picks stay fixed; results update after matches finish.'
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* fixed: info circle · title pill · settings circle, the calendar, the track record */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
        <GlassCircle icon="information-circle-outline" active={about} onPress={() => setAbout(!about)} />
        <Glass radius={23} strong style={{ flex: 1, height: 46, justifyContent: 'center', paddingHorizontal: 16, marginHorizontal: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="sparkles" size={17} color={t.purple} />
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '800', marginLeft: 8 }}>AI Picks</Text>
          </View>
        </Glass>
        <GlassCircle icon="settings-outline" onPress={() => nav.push({ name: 'settings' })} />
      </View>
      <DateStrip value={date} onChange={setDate} marked={marked} />
      <View style={{ height: 12 }} />
      <Glass radius={26} strong style={{ marginHorizontal: 16, marginBottom: 12, overflow: 'hidden' }}>
        <LinearGradient colors={t.dark ? ['rgba(122,92,255,0.35)', 'rgba(191,90,242,0.12)'] : ['rgba(122,92,255,0.16)', 'rgba(191,90,242,0.04)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: '800', fontSize: 17 }}>v3 forecast record</Text>
            <Text style={{ color: t.secondary, fontSize: 13, marginTop: 2 }}>{settled.length ? `${hits} / ${settled.length} settled · Brier ${metrics.brier.toFixed(3)}` : 'Results appear after saved v3 forecasts finish'}</Text>
          </View>
          <Text style={{ color: t.purple, fontWeight: '900', fontSize: 30 }}>{settled.length ? `${Math.round((hits / settled.length) * 100)}%` : '—'}</Text>
        </View>
      </Glass>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + 20 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={t.secondary}
            onRefresh={async () => {
              setRefreshing(true);
              try { await run(true); } finally { setRefreshing(false); }
            }}
          />
        }
      >
        {about ? (
          <Card>
            <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, marginBottom: 6 }}>How the picks are made</Text>
            <Text style={{ color: t.secondary, fontSize: 13.5, lineHeight: 20 }}>
              Version 3 uses up to 20 verified prior results per team. Recent dates and home/away games receive more weight; thin samples are shrunk toward conservative priors. Football uses a normalized goals distribution with low-score and uncertainty adjustments. Other supported team sports use regularized form and scoring margins. Verified competition context supplies only a bounded prior.
              {'\n\n'}Up to five eligible picks are saved before kick-off, with at most two per competition and no repeated teams. When evidence is insufficient, fewer picks appear. Saved forecasts stay fixed. Older forecasts retain their original model version. Historical simulations are labelled separately and excluded from the v3 record.
              {'\n\n'}Percentages are uncalibrated model estimates. The record shows settled v3 forecasts and a Brier probability score (lower is better). Live accuracy must be measured as results accumulate.

            </Text>
          </Card>
        ) : null}
        {!day ? (
          <Loading label={progress} />
        ) : day.kind === 'range' ? (
          <Empty icon="calendar-outline" title="Out of range" body={`Picks are available from ${MAX_BACK} days back to ${MAX_AHEAD} days ahead.`} action="Go to today" onAction={() => setDate(today)} />
        ) : day.picks.length ? (
          <>
            <SectionTitle
              right={
                <Text style={{ color: t.secondary, fontSize: 12 }}>
                  {daySettled ? `${dayHits} of ${daySettled} landed` : day.scanned ? `${day.modelled} of ${day.scanned} modelled` : ''}
                </Text>
              }
            >
              {dayName.charAt(0).toUpperCase() + dayName.slice(1)}
            </SectionTitle>
            {note ? <Text style={{ color: t.secondary, fontSize: 12.5, marginHorizontal: 22, marginBottom: 10, lineHeight: 17 }}>{note}</Text> : null}
            {day.picks.map((p, i) => (
              <PickCard key={p.key} p={p} i={i} />
            ))}
          </>
        ) : (
          <Empty
            icon="sparkles-outline"
            title={error ? 'Couldn’t build picks' : day.kind === 'unrecorded' ? 'No saved forecast' : 'No eligible picks'}
            body={error || (day.kind === 'unrecorded' ? 'Only selections recorded before kick-off appear in the forecast record.' : 'The available match evidence did not meet the selection criteria. Pull down to check again.')}
            action="Check again"
            onAction={() => run(true)}
          />
        )}
      </ScrollView>
    </View>
  );
}

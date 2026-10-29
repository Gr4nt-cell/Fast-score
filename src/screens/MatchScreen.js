import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTheme } from '../theme';
import { useNav } from '../nav';
import { useStore, formatOdds, americanToProb } from '../store';
import { sportByKey } from '../sports';
import { normalizeEvent, scoreboard, standings as fetchStandings, summary as fetchSummary } from '../api/espn';
import { predictMatch } from '../predict';
import { matchOdds as msportOdds } from '../api/msport';
import { Glass } from '../components/Glass';
import { Pressable } from '../components/Touch';
import Standings from '../components/Standings';
import { favMatch } from '../components/match';
import { Card, Empty, FormPills, GlassCircle, Loading, Logo, PushHeader, Row, StatBar, TabStrip } from '../components/ui';

const LOWER_BETTER = /foul|card|offside|turnover|error|penalt|giveaway/i;

// ---------- header ----------

function TeamCol({ c, onPress }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center' }} feedback="subtle">
      <Glass radius={22} strong style={{ width: 74, height: 74, alignItems: 'center', justifyContent: 'center' }}>
        <Logo uri={c.logo} name={c.name} size={c.isAthlete ? 64 : 48} round={c.isAthlete} />
      </Glass>
      <Text style={{ color: t.text, fontWeight: '700', fontSize: 15, marginTop: 8, textAlign: 'center' }} numberOfLines={2}>
        {c.name}
      </Text>
      {c.record ? <Text style={{ color: t.secondary, fontSize: 12, marginTop: 2 }}>{c.record}</Text> : null}
    </Pressable>
  );
}

function ScoreHeader({ m, sport }) {
  const t = useTheme();
  const nav = useNav();
  const live = m.state === 'in';
  const started = m.state !== 'pre';
  const d = new Date(m.date);
  const goals = (side) => (m.details || []).filter((x) => x.scoring && x.teamId === m[side].id);
  const openTeam = (c) => {
    if (c.isAthlete && c.athleteId) nav.push({ name: 'player', sport, league: m.league, id: c.athleteId, title: c.name });
    else if (!c.isAthlete) nav.push({ name: 'team', sport, league: m.league, id: c.id, title: c.name, logo: c.logo });
  };
  return (
    <Card style={{ paddingVertical: 18 }}>
      <Text style={{ color: t.secondary, fontSize: 12.5, fontWeight: '600', textAlign: 'center', marginBottom: 14 }} numberOfLines={1}>
        {[m.leagueName, m.round || m.note, m.group].filter(Boolean).join(' · ')}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <TeamCol c={m.home} onPress={() => openTeam(m.home)} />
        <View style={{ width: 120, alignItems: 'center', paddingTop: 12 }}>
          {started ? (
            <Text style={{ color: live ? t.live : t.text, fontSize: 40, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] }}>
              {sport === 'tennis' ? `${m.home.linescores.filter((g, i) => Number(g) > Number(m.away.linescores[i])).length}-${m.away.linescores.filter((g, i) => Number(g) > Number(m.home.linescores[i])).length}` : `${m.home.score ?? 0} - ${m.away.score ?? 0}`}
            </Text>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: t.text, fontSize: 28, fontWeight: '800' }}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              <Text style={{ color: t.secondary, fontSize: 13, marginTop: 2 }}>{d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
            </View>
          )}
          <View style={{ marginTop: 8, paddingHorizontal: 10, height: 24, borderRadius: 12, justifyContent: 'center', backgroundColor: live ? t.live : t.track }}>
            <Text style={{ color: live ? '#fff' : t.secondary, fontWeight: '800', fontSize: 12 }} numberOfLines={1}>
              {live ? m.short : m.state === 'post' ? m.detail || 'Full time' : m.postponed ? m.detail : 'Not started'}
            </Text>
          </View>
        </View>
        <TeamCol c={m.away} onPress={() => openTeam(m.away)} />
      </View>
      {goals('home').length || goals('away').length ? (
        <View style={{ flexDirection: 'row', marginTop: 14 }}>
          {['home', 'away'].map((side) => (
            <View key={side} style={{ flex: 1, alignItems: side === 'home' ? 'flex-start' : 'flex-end', paddingHorizontal: 6 }}>
              {goals(side).map((g, i) => (
                <Text key={i} style={{ color: t.secondary, fontSize: 12.5 }} numberOfLines={1}>
                  {side === 'home' ? '⚽ ' : ''}
                  {g.player} {g.clock}
                  {g.pen ? ' (P)' : g.own ? ' (OG)' : ''}
                  {side === 'away' ? ' ⚽' : ''}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

// ---------- details tab ----------

function Probability({ probs, label, home, away, draws }) {
  const t = useTheme();
  const parts = [
    { k: 'home', v: probs.home, c: t.blue, l: home },
    ...(draws ? [{ k: 'draw', v: probs.draw, c: t.tertiary, l: 'Draw' }] : []),
    { k: 'away', v: probs.away, c: t.orange, l: away },
  ];
  return (
    <View>
      {label ? <Text style={{ color: t.secondary, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>{label}</Text> : null}
      <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
        {parts.map((p) => (
          <View key={p.k} style={{ flex: Math.max(p.v, 0.01), backgroundColor: p.c }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        {parts.map((p) => (
          <View key={p.k} style={{ alignItems: p.k === 'home' ? 'flex-start' : p.k === 'away' ? 'flex-end' : 'center', flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: '800', fontSize: 17 }}>{Math.round(p.v * 100)}%</Text>
            <Text style={{ color: t.secondary, fontSize: 12 }} numberOfLines={1}>
              {p.l}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function AIPrediction({ m, pred }) {
  const t = useTheme();
  if (!pred) return null;
  const sp = sportByKey(m.sport);
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: t.purple, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
          <Ionicons name="sparkles" size={16} color="#fff" />
        </View>
        <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, flex: 1 }}>AI prediction</Text>
        <Text style={{ color: t.secondary, fontSize: 12 }}>Last 10 matches{pred.market ? ' + odds' : ''}</Text>
      </View>
      <Probability probs={pred.probs} home={m.home.short || m.home.name} away={m.away.short || m.away.name} draws={sp.draws} />
      {pred.last ? (
        <View style={{ marginTop: 14, gap: 8 }}>
          {[
            [m.home, pred.last.homeForm],
            [m.away, pred.last.awayForm],
          ].map(([c, f]) => (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Logo uri={c.logo} name={c.name} size={18} />
              <Text style={{ color: t.text, fontSize: 13, fontWeight: '600', marginLeft: 6, width: 82 }} numberOfLines={1}>
                {c.short || c.name}
              </Text>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <FormPills form={f} count={10} size={17} />
              </View>
            </View>
          ))}
          <Text style={{ color: t.tertiary, fontSize: 11 }}>Oldest → newest</Text>
        </View>
      ) : null}
      <View style={{ marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: t.dark ? 'rgba(191,90,242,0.16)' : 'rgba(175,82,222,0.09)' }}>
        <Text style={{ color: t.secondary, fontSize: 12, fontWeight: '700' }}>Best call</Text>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '800', marginTop: 2 }}>
          {pred.tip.label} · {Math.round(pred.tip.prob * 100)}%
        </Text>
      </View>
      {pred.xg ? (
        <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
          {[
            ['Exp. goals', `${pred.xg.home.toFixed(1)} – ${pred.xg.away.toFixed(1)}`],
            ['Over 2.5', `${Math.round(pred.over * 100)}%`],
            ['Both score', `${Math.round(pred.btts * 100)}%`],
          ].map(([k, v]) => (
            <View key={k} style={{ flex: 1, padding: 10, borderRadius: 12, backgroundColor: t.track, alignItems: 'center' }}>
              <Text style={{ color: t.text, fontWeight: '800', fontSize: 15 }}>{v}</Text>
              <Text style={{ color: t.secondary, fontSize: 11.5, marginTop: 2 }}>{k}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ marginTop: 12, gap: 5 }}>
        {pred.reasons.map((r, i) => (
          <View key={i} style={{ flexDirection: 'row' }}>
            <Text style={{ color: t.purple, marginRight: 6 }}>•</Text>
            <Text style={{ color: t.secondary, fontSize: 13, flex: 1, lineHeight: 18 }}>{r}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function Timeline({ m, events }) {
  const t = useTheme();
  if (!events.length) return null;
  const icon = (e) => {
    if (e.red) return <View style={{ width: 11, height: 15, borderRadius: 2, backgroundColor: t.red }} />;
    if (e.yellow) return <View style={{ width: 11, height: 15, borderRadius: 2, backgroundColor: t.yellow }} />;
    if (e.sub) return <Ionicons name="swap-vertical" size={16} color={t.green} />;
    if (e.scoring) return <MaterialCommunityIcons name={m.sport === 'soccer' ? 'soccer' : 'star-four-points'} size={16} color={t.text} />;
    if (e.var) return <Ionicons name="tv-outline" size={15} color={t.secondary} />;
    return <Ionicons name="ellipse" size={7} color={t.tertiary} />;
  };
  return (
    <Card>
      <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, marginBottom: 10 }}>{m.sport === 'soccer' ? 'Match events' : 'Scoring summary'}</Text>
      {events.map((e, i) => {
        const home = e.teamId === m.home.id;
        return (
          <View key={i} style={{ flexDirection: home ? 'row' : 'row-reverse', alignItems: 'center', paddingVertical: 7, borderBottomWidth: i === events.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: t.separator }}>
            <Text style={{ width: 44, textAlign: home ? 'left' : 'right', color: t.secondary, fontSize: 13, fontWeight: '700' }}>{e.clock}</Text>
            <View style={{ width: 22, alignItems: 'center' }}>{icon(e)}</View>
            <View style={{ flex: 1, paddingHorizontal: 8, alignItems: home ? 'flex-start' : 'flex-end' }}>
              <Text style={{ color: t.text, fontSize: 14, fontWeight: e.scoring ? '700' : '500' }} numberOfLines={2}>
                {e.title}
              </Text>
              {e.sub2 ? (
                <Text style={{ color: t.secondary, fontSize: 12 }} numberOfLines={2}>
                  {e.sub2}
                </Text>
              ) : null}
            </View>
            {e.score ? <Text style={{ color: t.text, fontWeight: '800', fontSize: 13 }}>{e.score}</Text> : null}
          </View>
        );
      })}
    </Card>
  );
}

function OddsCard({ m, pick }) {
  const t = useTheme();
  const { settings } = useStore();
  const o = m.odds && m.odds.home != null ? m.odds : null;
  const pc = pick && pick[0];
  const home = o ? o.home : pc && pc.homeTeamOdds && pc.homeTeamOdds.moneyLine;
  const away = o ? o.away : pc && pc.awayTeamOdds && pc.awayTeamOdds.moneyLine;
  const draw = o ? o.draw : pc && pc.drawOdds && pc.drawOdds.moneyLine;
  if (home == null || !settings.showOdds) return null;
  const sp = sportByKey(m.sport);
  const items = [
    ['1', home, m.home.short],
    ...(sp.draws && draw != null ? [['X', draw, 'Draw']] : []),
    ['2', away, m.away.short],
  ];
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={{ color: t.text, fontWeight: '800', fontSize: 16 }}>Odds</Text>
        <Text style={{ color: t.secondary, fontSize: 12 }}>{(o && o.provider) || (pc && pc.provider && pc.provider.name) || ''}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {items.map(([k, v, l]) => (
          <View key={k} style={{ flex: 1, padding: 10, borderRadius: 14, backgroundColor: t.track, alignItems: 'center' }}>
            <Text style={{ color: t.secondary, fontSize: 12, fontWeight: '700' }}>{k}</Text>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: '800', marginTop: 2 }}>{formatOdds(Number(v), settings.oddsFormat)}</Text>
            <Text style={{ color: t.secondary, fontSize: 11 }} numberOfLines={1}>
              {Math.round((americanToProb(Number(v)) || 0) * 100)}% · {l}
            </Text>
          </View>
        ))}
      </View>
      {(o && (o.details || o.overUnder)) || (pc && (pc.details || pc.overUnder)) ? (
        <Text style={{ color: t.secondary, fontSize: 12.5, marginTop: 10 }}>
          {[(o && o.details) || (pc && pc.details), (o && o.overUnder) || (pc && pc.overUnder) ? `O/U ${(o && o.overUnder) || pc.overUnder}` : null].filter(Boolean).join('  ·  ')}
        </Text>
      ) : null}
    </Card>
  );
}

function InfoCard({ m, sum }) {
  const t = useTheme();
  const gi = (sum && sum.gameInfo) || {};
  const venue = (gi.venue && `${gi.venue.fullName}${gi.venue.address && gi.venue.address.city ? ', ' + gi.venue.address.city : ''}`) || m.venue;
  const ref = gi.officials && gi.officials[0] && (gi.officials[0].displayName || gi.officials[0].fullName);
  const rows = [
    ['calendar-outline', 'Date', new Date(m.date).toLocaleString([], { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })],
    ['location-outline', 'Venue', venue],
    ['people-outline', 'Attendance', gi.attendance ? Number(gi.attendance).toLocaleString() : null],
    ['person-outline', 'Referee', ref],
    ['tv-outline', 'Broadcast', m.broadcast],
    ['cloud-outline', 'Weather', gi.weather && (gi.weather.displayValue || (gi.weather.temperature != null ? `${gi.weather.temperature}°` : null))],
  ].filter((r) => r[2]);
  return (
    <Card>
      <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, marginBottom: 4 }}>Match info</Text>
      {rows.map(([ic, k, v], i) => (
        <Row key={k} last={i === rows.length - 1}>
          <Ionicons name={ic} size={18} color={t.secondary} style={{ width: 28 }} />
          <Text style={{ color: t.secondary, fontSize: 14, width: 96 }}>{k}</Text>
          <Text style={{ color: t.text, fontSize: 14, flex: 1, textAlign: 'right' }} numberOfLines={2}>
            {v}
          </Text>
        </Row>
      ))}
    </Card>
  );
}

function WinProb({ m, sum }) {
  const wp = sum && sum.winprobability && sum.winprobability.length ? sum.winprobability[sum.winprobability.length - 1] : null;
  const pr = sum && sum.predictor;
  let probs = null;
  let label = '';
  if (wp && wp.homeWinPercentage != null) {
    const tie = wp.tiePercentage || 0;
    probs = { home: wp.homeWinPercentage, draw: tie, away: Math.max(0, 1 - wp.homeWinPercentage - tie) };
    label = m.state === 'in' ? 'Live win probability (ESPN)' : 'Win probability (ESPN)';
  } else if (pr && pr.homeTeam && pr.homeTeam.gameProjection) {
    const h = Number(pr.homeTeam.gameProjection) / 100;
    const a = Number(pr.awayTeam.gameProjection) / 100;
    probs = { home: h, away: a, draw: Math.max(0, 1 - h - a) };
    label = 'ESPN Matchup Predictor';
  }
  if (!probs) return null;
  return (
    <Card>
      <Probability probs={probs} label={label} home={m.home.short} away={m.away.short} draws={probs.draw > 0.005} />
    </Card>
  );
}


// ---------- momentum & live action ----------

const KIND_ICON = {
  'soccer-ball': ['football', null],
  goal: ['football', null],
  'y-card': ['square', '#F5C400'],
  'r-card': ['square', '#E5302F'],
  'yr-card': ['square', '#E5302F'],
  corner: ['flag', null],
  substitution: ['swap-horizontal', null],
  whistle: ['megaphone-outline', null],
  time: ['time-outline', null],
  var: ['tv-outline', null],
  'penalty-missed': ['close-circle-outline', null],
  injury: ['medkit-outline', null],
};
const kindIcon = (k) => KIND_ICON[k] || KIND_ICON[(k || '').replace(/-.*/, '')] || null;
const KIND_LABEL = { 'soccer-ball': 'Goal', 'y-card': 'Yellow card', 'r-card': 'Red card', 'yr-card': 'Second yellow', corner: 'Corner', substitution: 'Substitution', whistle: 'Whistle', time: 'Added time', var: 'VAR' };

/** Bars per minute: home above the line, away below. Goals marked with a ball. */
function MomentumGraph({ m, mom, compact }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  if (!mom || !mom.points || !mom.points.length) return null;
  const pts = mom.points;
  const H = compact ? 46 : 64; // half height
  const n = Math.max(pts.length, 90);
  const bw = w ? w / n : 0;
  const homeC = t.blue;
  const awayC = t.orange;
  const halfIdx = pts.findIndex((p) => p.half === 2);
  const goalAt = (e) => {
    let i = pts.findIndex((p) => p.min >= e.min && (e.min <= 45 || p.half === 2 || halfIdx < 0));
    return i < 0 ? pts.length - 1 : i;
  };
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, flex: 1 }}>Momentum</Text>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: homeC, marginRight: 4 }} />
        <Text style={{ color: t.secondary, fontSize: 12, marginRight: 10 }}>{m.home.short}</Text>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: awayC, marginRight: 4 }} />
        <Text style={{ color: t.secondary, fontSize: 12 }}>{m.away.short}</Text>
      </View>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H * 2 + 20 }}>
        {w ? (
          <>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 10 + H, height: StyleSheet.hairlineWidth, backgroundColor: t.separator }} />
            {halfIdx > 0 ? <View style={{ position: 'absolute', top: 6, bottom: 6, left: halfIdx * bw, width: 1, backgroundColor: t.separator }} /> : null}
            {pts.map((p, i) => {
              const h = Math.max(1, Math.abs(p.v) * H);
              const up = p.v >= 0;
              return (
                <View
                  key={i}
                  style={{
                    position: 'absolute',
                    left: i * bw + bw * 0.12,
                    width: Math.max(1, bw * 0.76),
                    height: h,
                    top: up ? 10 + H - h : 10 + H,
                    backgroundColor: up ? homeC : awayC,
                    opacity: 0.35 + Math.min(0.65, Math.abs(p.v)),
                    borderRadius: 1.5,
                  }}
                />
              );
            })}
            {(mom.events || []).map((e, k) => {
              const i = goalAt(e);
              const home = e.teamId === m.home.id;
              const red = /red/.test(e.type || '');
              return (
                <View key={k} style={{ position: 'absolute', left: Math.min(w - 14, Math.max(0, i * bw - 6)), top: home ? 0 : H * 2 + 6 }}>
                  {red ? <View style={{ width: 9, height: 12, borderRadius: 2, backgroundColor: '#E5302F' }} /> : <Ionicons name="football" size={13} color={t.text} />}
                </View>
              );
            })}
          </>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ color: t.tertiary, fontSize: 11 }}>1'</Text>
        {halfIdx > 0 ? <Text style={{ color: t.tertiary, fontSize: 11 }}>HT</Text> : null}
        <Text style={{ color: t.tertiary, fontSize: 11 }}>{pts[pts.length - 1].t}</Text>
      </View>
    </Card>
  );
}

/** Live in-game action: a small pitch showing who's pressing right now, and the latest plays. */
function LiveAction({ m, sum }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const items = sum && sum.commentary ? [...sum.commentary].reverse() : [];
  const mom = sum && sum.momentum && sum.momentum.points;
  if (m.state !== 'in' || (!items.length && !mom)) return null;
  // pressure from the last few minutes of momentum: -1 (away pressing) .. 1 (home pressing)
  let press = 0;
  if (mom && mom.length) {
    const last = mom.slice(-3);
    press = last.reduce((a, p, i) => a + p.v * (i + 1), 0) / last.reduce((a, _, i) => a + i + 1, 0);
  }
  const latest = items[0];
  const ic = latest && kindIcon(latest.kind);
  const ballX = w ? (w / 2) * (1 + press * 0.8) : 0;
  const pressing = Math.abs(press) < 0.15 ? 'Even contest' : `${press > 0 ? m.home.short : m.away.short} ${Math.abs(press) > 0.5 ? 'dominating' : 'pressing'}`;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.live, marginRight: 7 }} />
        <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, flex: 1 }}>Live action</Text>
        <Text style={{ color: t.live, fontWeight: '800', fontSize: 13 }}>{m.short}</Text>
      </View>
      {mom ? (
        <>
          <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 92, borderRadius: 14, backgroundColor: t.dark ? '#1E5A2E' : '#2E8B47', overflow: 'hidden', justifyContent: 'center' }}>
            {/* pitch markings */}
            <View style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1.5, backgroundColor: 'rgba(255,255,255,0.55)' }} />
            <View style={{ position: 'absolute', left: '50%', top: 46 - 18, width: 36, height: 36, marginLeft: -18, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)' }} />
            <View style={{ position: 'absolute', left: 0, top: 20, width: 34, height: 52, borderWidth: 1.5, borderLeftWidth: 0, borderColor: 'rgba(255,255,255,0.55)' }} />
            <View style={{ position: 'absolute', right: 0, top: 20, width: 34, height: 52, borderWidth: 1.5, borderRightWidth: 0, borderColor: 'rgba(255,255,255,0.55)' }} />
            {/* the side under pressure glows */}
            {Math.abs(press) >= 0.15 ? (
              <View style={{ position: 'absolute', top: 0, bottom: 0, width: '45%', [press > 0 ? 'right' : 'left']: 0, backgroundColor: press > 0 ? 'rgba(10,132,255,0.28)' : 'rgba(255,149,0,0.3)' }} />
            ) : null}
            {w ? (
              <View style={{ position: 'absolute', left: ballX - 9, top: 37, width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 6px rgba(0,0,0,0.35)' }}>
                <Ionicons name="football" size={16} color="#111" />
              </View>
            ) : null}
            <Text style={{ position: 'absolute', left: 8, top: 6, color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '800' }}>{m.home.abbr || m.home.short}</Text>
            <Text style={{ position: 'absolute', right: 8, top: 6, color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '800' }}>{m.away.abbr || m.away.short}</Text>
          </View>
          <Text style={{ color: t.secondary, fontSize: 12.5, fontWeight: '700', textAlign: 'center', marginTop: 6 }}>{pressing}</Text>
        </>
      ) : null}
      {latest ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: mom ? 10 : 0, padding: 12, borderRadius: 14, backgroundColor: t.track }}>
          <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
            <Ionicons name={(ic && ic[0]) || 'radio-outline'} size={18} color={(ic && ic[1]) || t.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.secondary, fontSize: 12, fontWeight: '800' }}>
              {latest.time.displayValue}
              {KIND_LABEL[latest.kind] ? ` · ${KIND_LABEL[latest.kind]}` : ''}
            </Text>
            <Text style={{ color: t.text, fontSize: 14.5, lineHeight: 20, fontWeight: latest.important ? '700' : '500', marginTop: 2 }}>{latest.text}</Text>
          </View>
        </View>
      ) : null}
      {items.slice(1, 5).map((c, i) => {
        const ci = kindIcon(c.kind);
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingTop: 10 }}>
            <Text style={{ width: 44, color: t.secondary, fontSize: 12, fontWeight: '800' }}>{c.time.displayValue}</Text>
            {ci ? <Ionicons name={ci[0]} size={14} color={ci[1] || t.secondary} style={{ marginRight: 6, marginTop: 2 }} /> : null}
            <Text style={{ flex: 1, color: t.text, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
              {c.text}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}

/** Every MSport market for the match, in the chosen odds format. */
function MSportMarkets({ m }) {
  const t = useTheme();
  const { settings } = useStore();
  const o = m.odds;
  if (!o || o.provider !== 'MSport' || !o.markets || !o.markets.length || !settings.showOdds) return null;
  const fmt = (d) => {
    const ml = d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
    return settings.oddsFormat === 'decimal' ? d.toFixed(2) : formatOdds(ml, settings.oddsFormat);
  };
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, flex: 1 }}>MSport odds</Text>
        {o.live ? <Text style={{ color: t.live, fontWeight: '800', fontSize: 12 }}>LIVE</Text> : null}
      </View>
      {o.markets.map((mk, i) => (
        <View key={mk.id} style={{ paddingVertical: 9, borderBottomWidth: i === o.markets.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: t.separator }}>
          <Text style={{ color: t.secondary, fontSize: 12.5, fontWeight: '700', marginBottom: 6 }}>{mk.name}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {mk.outcomes.map((oc, k) => (
              <View key={k} style={{ flex: 1, paddingVertical: 7, borderRadius: 11, backgroundColor: t.track, alignItems: 'center' }}>
                <Text style={{ color: t.secondary, fontSize: 11 }} numberOfLines={1}>
                  {oc.label}
                </Text>
                <Text style={{ color: t.text, fontSize: 15, fontWeight: '800', marginTop: 1 }}>{fmt(oc.odds)}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
      <Text style={{ color: t.tertiary, fontSize: 11, marginTop: 8 }}>Prices change quickly. 18+, bet responsibly.</Text>
    </Card>
  );
}

// ---------- lineups ----------

function lineOf(abbr = '') {
  const a = abbr.toUpperCase();
  if (a === 'G' || a === 'GK') return 0;
  if (/^(DM|CDM)/.test(a)) return 2;
  if (/^(AM|CAM)/.test(a)) return 4;
  if (/^(SW|D|CD|CB|LB|RB|LWB|RWB)/.test(a)) return 1;
  if (/^(F|CF|ST|LW|RW|LF|RF|S)/.test(a)) return 5;
  if (/M/.test(a)) return 3;
  return 3;
}
function sideOf(abbr = '') {
  const a = abbr.toUpperCase();
  if (/-L$|^L/.test(a)) return 0;
  if (/-R$|^R/.test(a)) return 2;
  return 1;
}

function buildLines(starters, formation) {
  const gk = starters.filter((p) => lineOf(p.pos) === 0);
  const rest = starters.filter((p) => lineOf(p.pos) !== 0);
  const nums = (formation || '').split('-').map(Number).filter(Boolean);
  // by position first
  const byLine = {};
  rest.forEach((p) => (byLine[lineOf(p.pos)] = byLine[lineOf(p.pos)] || []).push(p));
  let lines = Object.keys(byLine)
    .sort()
    .map((k) => byLine[k].sort((a, b) => sideOf(a.pos) - sideOf(b.pos) || (a.place || 0) - (b.place || 0)));
  // when positions are vague and the formation is known, split by formation place instead
  const unknown = rest.every((p) => /^[DMF]$/.test((p.pos || '').toUpperCase()) || !p.pos);
  if (nums.length && nums.reduce((a, b) => a + b, 0) === rest.length && (unknown || lines.length !== nums.length)) {
    const sorted = [...rest].sort((a, b) => (a.place || 0) - (b.place || 0));
    lines = [];
    let i = 0;
    nums.forEach((n) => {
      lines.push(sorted.slice(i, i + n));
      i += n;
    });
  }
  return [gk, ...lines].filter((l) => l.length);
}

function PlayerDot({ p, color, onPress }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', width: 64 }} feedback="subtle">
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: color, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{p.jersey || ''}</Text>
        {p.goals ? (
          <View style={{ position: 'absolute', top: -6, right: -8, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 2 }}>
            <Text style={{ fontSize: 10 }}>⚽{p.goals > 1 ? p.goals : ''}</Text>
          </View>
        ) : null}
        {p.red || p.yellow ? <View style={{ position: 'absolute', top: -5, left: -6, width: 8, height: 11, borderRadius: 1.5, backgroundColor: p.red ? '#FF3B30' : '#FFCC00' }} /> : null}
        {p.subbedOut ? (
          <View style={{ position: 'absolute', bottom: -6, right: -8, backgroundColor: '#fff', borderRadius: 8, width: 15, height: 15, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="arrow-down" size={11} color="#FF3B30" />
          </View>
        ) : null}
      </View>
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 3, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3 }} numberOfLines={1}>
        {p.short}
      </Text>
    </Pressable>
  );
}

function parseRoster(r) {
  const plays = (x) => x.plays || [];
  const players = (r.roster || []).map((x) => ({
    id: x.athlete && String(x.athlete.id),
    name: (x.athlete && x.athlete.displayName) || '',
    short: (x.athlete && (x.athlete.lastName || (x.athlete.shortName || x.athlete.displayName || '').split(' ').pop())) || '',
    jersey: x.jersey || (x.athlete && x.athlete.jersey),
    pos: (x.position && x.position.abbreviation) || '',
    posName: (x.position && x.position.displayName) || '',
    place: Number(x.formationPlace) || 0,
    starter: !!x.starter,
    subbedIn: !!x.subbedIn,
    subbedOut: !!x.subbedOut,
    goals: plays(x).filter((p) => p.scoringPlay && !p.ownGoal).length,
    yellow: plays(x).some((p) => p.yellowCard),
    red: plays(x).some((p) => p.redCard),
    subClock: (plays(x).find((p) => p.substitution) || {}).clock,
  }));
  return { team: r.team || {}, homeAway: r.homeAway, formation: r.formation, starters: players.filter((p) => p.starter), bench: players.filter((p) => !p.starter) };
}

function SoccerLineups({ m, sum }) {
  const t = useTheme();
  const nav = useNav();
  const rosters = (sum.rosters || []).map(parseRoster);
  const home = rosters.find((r) => r.homeAway === 'home') || rosters[0];
  const away = rosters.find((r) => r.homeAway === 'away') || rosters[1];
  if (!home || !away || !home.starters.length) return <Empty icon="people-outline" title="Lineups not available yet" body="They usually appear about an hour before kick-off." />;
  const openP = (p) => p.id && nav.push({ name: 'player', sport: m.sport, league: m.league, id: p.id, title: p.name });
  const hl = buildLines(home.starters, home.formation);
  const al = buildLines(away.starters, away.formation);
  const hc = m.home.color && m.home.color !== '#ffffff' ? m.home.color : t.blue;
  let ac = m.away.color && m.away.color !== '#ffffff' ? m.away.color : t.orange;
  if (ac === hc) ac = t.orange;
  return (
    <View>
      <Card padded={false} style={{ overflow: 'hidden' }}>
        <View style={{ backgroundColor: t.pitch, borderRadius: 24, paddingVertical: 14 }}>
          <View style={{ position: 'absolute', left: 14, right: 14, top: '50%', height: 1.5, backgroundColor: t.pitchLine }} />
          <View style={{ position: 'absolute', alignSelf: 'center', top: '50%', marginTop: -40, width: 80, height: 80, borderRadius: 40, borderWidth: 1.5, borderColor: t.pitchLine }} />
          <View style={{ position: 'absolute', alignSelf: 'center', top: 0, width: 160, height: 60, borderWidth: 1.5, borderTopWidth: 0, borderColor: t.pitchLine }} />
          <View style={{ position: 'absolute', alignSelf: 'center', bottom: 0, width: 160, height: 60, borderWidth: 1.5, borderBottomWidth: 0, borderColor: t.pitchLine }} />
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13, marginLeft: 16, marginBottom: 6 }}>
            {m.away.short} {away.formation || ''}
          </Text>
          {al.map((line, i) => (
            <View key={'a' + i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-evenly', marginVertical: 7 }}>
              {line.map((p) => (
                <PlayerDot key={p.id || p.name} p={p} color={ac} onPress={() => openP(p)} />
              ))}
            </View>
          ))}
          <View style={{ height: 16 }} />
          {[...hl].reverse().map((line, i) => (
            <View key={'h' + i} style={{ flexDirection: 'row', justifyContent: 'space-evenly', marginVertical: 7 }}>
              {line.map((p) => (
                <PlayerDot key={p.id || p.name} p={p} color={hc} onPress={() => openP(p)} />
              ))}
            </View>
          ))}
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13, marginLeft: 16, marginTop: 6 }}>
            {m.home.short} {home.formation || ''}
          </Text>
        </View>
      </Card>
      <Card>
        <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, marginBottom: 6 }}>Substitutes</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {[home, away].map((r, k) => (
            <View key={k} style={{ flex: 1 }}>
              <Text style={{ color: t.secondary, fontWeight: '700', fontSize: 12, marginBottom: 4 }} numberOfLines={1}>
                {r.team.displayName || (k ? m.away.name : m.home.name)}
              </Text>
              {r.bench.map((p) => (
                <Pressable key={p.id || p.name} onPress={() => openP(p)} feedback="subtle">
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5 }}>
                    <Text style={{ width: 24, color: t.secondary, fontSize: 12, fontWeight: '700' }}>{p.jersey}</Text>
                    <Text style={{ flex: 1, color: t.text, fontSize: 13 }} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {p.subbedIn ? <Ionicons name="arrow-up" size={13} color={t.green} /> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

function BoxScore({ m, sum }) {
  const t = useTheme();
  const nav = useNav();
  const players = (sum.boxscore && sum.boxscore.players) || [];
  if (!players.length) return <Empty icon="people-outline" title="No player stats yet" body="Box scores fill in once the game starts." />;
  return (
    <View>
      {players.map((tp, i) => (
        <Card key={i}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Logo uri={tp.team && (tp.team.logo || (tp.team.logos && tp.team.logos[0] && tp.team.logos[0].href))} name={tp.team && tp.team.displayName} size={22} />
            <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, marginLeft: 8 }}>{tp.team && tp.team.displayName}</Text>
          </View>
          {(tp.statistics || []).slice(0, 3).map((sg, j) => (
            <ScrollView key={j} horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              <View>
                <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.separator }}>
                  <Text style={{ width: 130, color: t.secondary, fontWeight: '700', fontSize: 12 }}>{sg.name || sg.text || 'Player'}</Text>
                  {(sg.labels || []).map((l) => (
                    <Text key={l} style={{ width: 44, textAlign: 'center', color: t.secondary, fontWeight: '700', fontSize: 12 }}>
                      {l}
                    </Text>
                  ))}
                </View>
                {(sg.athletes || []).map((a, k) => (
                  <Pressable key={k} feedback="subtle" onPress={() => a.athlete && nav.push({ name: 'player', sport: m.sport, league: m.league, id: String(a.athlete.id), title: a.athlete.displayName })}>
                    <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.separator }}>
                      <Text style={{ width: 130, color: t.text, fontSize: 13, fontWeight: a.starter ? '600' : '400' }} numberOfLines={1}>
                        {a.athlete && (a.athlete.shortName || a.athlete.displayName)}
                      </Text>
                      {(a.stats || []).map((v, n) => (
                        <Text key={n} style={{ width: 44, textAlign: 'center', color: t.text, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                          {v}
                        </Text>
                      ))}
                    </View>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          ))}
        </Card>
      ))}
    </View>
  );
}

// ---------- statistics ----------

function TeamStats({ m, sum }) {
  const t = useTheme();
  const teams = (sum.boxscore && sum.boxscore.teams) || [];
  if (teams.length < 2) return <Empty icon="stats-chart-outline" title="No statistics yet" />;
  const home = teams.find((x) => x.homeAway === 'home' || (x.team && String(x.team.id) === m.home.id)) || teams[1];
  const away = teams.find((x) => x !== home) || teams[0];
  const stats = (home.statistics || [])
    .map((s) => {
      const a = (away.statistics || []).find((x) => x.name === s.name);
      if (!a || s.displayValue == null) return null;
      return { label: s.label || s.abbreviation || s.name, home: s.displayValue, away: a.displayValue, name: s.name };
    })
    .filter(Boolean);
  if (!stats.length) return <Empty icon="stats-chart-outline" title="No statistics yet" />;
  const poss = stats.find((s) => /possession/i.test(s.name));
  return (
    <View>
      {poss ? (
        <Card>
          <Text style={{ color: t.secondary, fontWeight: '700', fontSize: 12, textAlign: 'center', marginBottom: 8 }}>Ball possession</Text>
          <View style={{ flexDirection: 'row', height: 30, borderRadius: 15, overflow: 'hidden' }}>
            <View style={{ flex: parseFloat(poss.home) || 50, backgroundColor: t.blue, justifyContent: 'center', paddingLeft: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>{poss.home}%</Text>
            </View>
            <View style={{ flex: parseFloat(poss.away) || 50, backgroundColor: t.orange, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>{poss.away}%</Text>
            </View>
          </View>
        </Card>
      ) : null}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
          <Logo uri={m.home.logo} name={m.home.name} size={22} />
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 16 }}>Match stats</Text>
          <Logo uri={m.away.logo} name={m.away.name} size={22} />
        </View>
        {stats
          .filter((s) => s !== poss)
          .map((s) => (
            <StatBar key={s.name} label={s.label} home={s.home} away={s.away} lowerBetter={LOWER_BETTER.test(s.name)} />
          ))}
      </Card>
    </View>
  );
}

// ---------- commentary / plays ----------

function Commentary({ m, sum }) {
  const t = useTheme();
  const [scoringOnly, setScoringOnly] = useState(false);
  let items = [];
  if (sum.commentary && sum.commentary.length) {
    items = [...sum.commentary].reverse().map((c) => ({ clock: c.time && c.time.displayValue, text: c.text, scoring: (c.play && c.play.scoringPlay) || c.important, kind: c.kind, type: c.play && c.play.type && c.play.type.text }));
  } else if (sum.plays && sum.plays.length) {
    items = [...sum.plays]
      .reverse()
      .slice(0, 150)
      .map((p) => ({
        clock: `${p.period && p.period.displayValue ? p.period.displayValue + ' ' : ''}${(p.clock && p.clock.displayValue) || ''}`,
        text: p.text,
        scoring: p.scoringPlay,
        score: p.scoringPlay && p.homeScore != null ? `${p.homeScore}-${p.awayScore}` : null,
      }));
  }
  if (!items.length) return <Empty icon="chatbubbles-outline" title="No commentary yet" />;
  const shown = scoringOnly ? items.filter((x) => x.scoring) : items;
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ color: t.text, fontWeight: '800', fontSize: 16 }}>{sum.commentary ? 'Live commentary' : 'Play-by-play'}</Text>
        <Pressable onPress={() => setScoringOnly(!scoringOnly)}>
          <Text style={{ color: t.blue, fontWeight: '600' }}>{scoringOnly ? 'All plays' : 'Key plays'}</Text>
        </Pressable>
      </View>
      {shown.map((c, i) => (
        <View key={i} style={{ flexDirection: 'row', paddingVertical: 9, borderBottomWidth: i === shown.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: t.separator }}>
          <Text style={{ width: 56, color: c.scoring ? t.green : t.secondary, fontWeight: '800', fontSize: 12.5 }}>{c.clock}</Text>
          {kindIcon(c.kind) ? <Ionicons name={kindIcon(c.kind)[0]} size={15} color={kindIcon(c.kind)[1] || t.secondary} style={{ marginRight: 8, marginTop: 2 }} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontSize: 14, lineHeight: 19, fontWeight: c.scoring ? '700' : '400' }}>{c.text}</Text>
            {c.score ? <Text style={{ color: t.secondary, fontSize: 12, marginTop: 2 }}>{c.score}</Text> : null}
          </View>
        </View>
      ))}
    </Card>
  );
}

// ---------- head to head ----------

function H2H({ m, sum }) {
  const t = useTheme();
  const games = [];
  (sum.headToHeadGames || []).forEach((g) => (g.events || []).forEach((e) => games.push(e)));
  const forms = (sum.boxscore && sum.boxscore.form) || sum.lastFiveGames || [];
  const seen = new Set();
  const h2h = games.filter((e) => (seen.has(e.id) ? false : seen.add(e.id)));
  let hw = 0;
  let aw = 0;
  let dr = 0;
  h2h.forEach((e) => {
    // results are from the perspective of the team the list belongs to (the home side here)
    if (e.gameResult === 'W') hw++;
    else if (e.gameResult === 'L') aw++;
    else dr++;
  });
  if (!h2h.length && !forms.length) return <Empty icon="git-compare-outline" title="No head-to-head data" />;
  return (
    <View>
      {h2h.length ? (
        <Card>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, marginBottom: 10 }}>Head to head</Text>
          <View style={{ flexDirection: 'row', marginBottom: 12 }}>
            {[
              [hw, m.home.short, t.blue],
              ...(sportByKey(m.sport).draws ? [[dr, 'Draws', t.secondary]] : []),
              [aw, m.away.short, t.orange],
            ].map(([n, l, c]) => (
              <View key={l} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ color: c, fontWeight: '800', fontSize: 26 }}>{n}</Text>
                <Text style={{ color: t.secondary, fontSize: 12 }} numberOfLines={1}>
                  {l}
                </Text>
              </View>
            ))}
          </View>
          {h2h.slice(0, 10).map((e, i) => (
            <Row key={e.id || i} last={i === Math.min(h2h.length, 10) - 1}>
              <Text style={{ width: 80, color: t.secondary, fontSize: 12 }}>{e.gameDate ? new Date(e.gameDate).toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' }) : ''}</Text>
              <Text style={{ flex: 1, color: t.text, fontSize: 13 }} numberOfLines={1}>
                {e.atVs === '@' ? `${m.home.short} @ ${(e.opponent && e.opponent.displayName) || m.away.short}` : `${m.home.short} vs ${(e.opponent && e.opponent.displayName) || m.away.short}`}
              </Text>
              <Text style={{ color: t.text, fontWeight: '800', fontSize: 13, marginRight: 8 }}>{e.score || `${e.homeTeamScore}-${e.awayTeamScore}`}</Text>
              <View style={{ width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: e.gameResult === 'W' ? t.win : e.gameResult === 'L' ? t.loss : t.draw }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>{e.gameResult || 'D'}</Text>
              </View>
            </Row>
          ))}
        </Card>
      ) : null}
      {forms.map((f, i) => (
        <Card key={i}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Logo uri={f.team && (f.team.logo || (f.team.logos && f.team.logos[0] && f.team.logos[0].href))} name={f.team && f.team.displayName} size={22} />
            <Text style={{ color: t.text, fontWeight: '800', fontSize: 15, marginLeft: 8, flex: 1 }}>{f.team && f.team.displayName} · last games</Text>
            <FormPills form={(f.events || []).map((e) => e.gameResult).join('')} size={18} />
          </View>
          {(f.events || []).map((e, k) => (
            <Row key={k} last={k === f.events.length - 1}>
              <Text style={{ width: 70, color: t.secondary, fontSize: 12 }}>{e.gameDate ? new Date(e.gameDate).toLocaleDateString([], { day: 'numeric', month: 'short' }) : ''}</Text>
              <Text style={{ color: t.secondary, fontSize: 12, width: 24 }}>{e.atVs}</Text>
              <Logo uri={e.opponentLogo || (e.opponent && e.opponent.logo)} name={e.opponent && e.opponent.displayName} size={16} />
              <Text style={{ flex: 1, color: t.text, fontSize: 13, marginLeft: 6 }} numberOfLines={1}>
                {e.opponent && e.opponent.displayName}
              </Text>
              <Text style={{ color: t.text, fontWeight: '700', fontSize: 13 }}>{e.score}</Text>
            </Row>
          ))}
        </Card>
      ))}
    </View>
  );
}

// ---------- individual / field ----------

function TennisSets({ m }) {
  const t = useTheme();
  const n = Math.max(m.home.linescores.length, m.away.linescores.length);
  if (!n) return null;
  return (
    <Card>
      <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, marginBottom: 8 }}>Sets</Text>
      <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
        <Text style={{ flex: 1 }} />
        {Array.from({ length: n }, (_, i) => (
          <Text key={i} style={{ width: 34, textAlign: 'center', color: t.secondary, fontWeight: '700', fontSize: 12 }}>
            S{i + 1}
          </Text>
        ))}
      </View>
      {[m.home, m.away].map((c, k) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
          <Logo uri={c.flag || c.logo} name={c.name} size={18} round />
          <Text style={{ flex: 1, color: t.text, fontWeight: c.winner ? '800' : '500', marginLeft: 8 }} numberOfLines={1}>
            {c.name}
          </Text>
          {Array.from({ length: n }, (_, i) => {
            const other = k ? m.home : m.away;
            const won = Number(c.linescores[i]) > Number(other.linescores[i]);
            return (
              <Text key={i} style={{ width: 34, textAlign: 'center', color: won ? t.text : t.secondary, fontWeight: won ? '800' : '500', fontSize: 15 }}>
                {c.linescores[i] ?? ''}
                {c.tiebreaks[i] ? <Text style={{ fontSize: 10 }}>{c.tiebreaks[i]}</Text> : null}
              </Text>
            );
          })}
        </View>
      ))}
    </Card>
  );
}

function Leaderboard({ m }) {
  const t = useTheme();
  const nav = useNav();
  return (
    <Card>
      <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, marginBottom: 6 }}>{m.sport === 'golf' ? 'Leaderboard' : 'Classification'}</Text>
      {(m.field || []).map((c, i) => (
        <Row key={c.id + i} last={i === m.field.length - 1} onPress={c.athleteId ? () => nav.push({ name: 'player', sport: m.sport, league: m.league, id: c.athleteId, title: c.name }) : undefined}>
          <Text style={{ width: 36, color: t.secondary, fontWeight: '800', fontSize: 13 }}>{c.position || c.order || i + 1}</Text>
          <Logo uri={c.flag || c.logo} name={c.name} size={20} round />
          <Text style={{ flex: 1, marginLeft: 8, color: t.text, fontSize: 14, fontWeight: i < 3 ? '700' : '500' }} numberOfLines={1}>
            {c.name}
          </Text>
          {c.thru != null && m.sport === 'golf' ? <Text style={{ color: t.secondary, fontSize: 12, marginRight: 10 }}>{String(c.thru)}</Text> : null}
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 14 }}>{c.score ?? ''}</Text>
        </Row>
      ))}
      {!(m.field || []).length ? <Text style={{ color: t.secondary }}>The field will appear once the event starts.</Text> : null}
    </Card>
  );
}

function News({ sum }) {
  const t = useTheme();
  const arts = (sum.news && sum.news.articles) || [];
  if (!arts.length) return <Empty icon="newspaper-outline" title="No news for this match" />;
  return arts.map((a, i) => (
    <Pressable key={i} onPress={() => a.links && a.links.web && Linking.openURL(a.links.web.href)}>
      <Card>
        {a.images && a.images[0] ? <Image source={{ uri: a.images[0].url }} style={{ height: 160, borderRadius: 14, marginBottom: 10 }} contentFit="cover" /> : null}
        <Text style={{ color: t.text, fontWeight: '800', fontSize: 15.5 }}>{a.headline}</Text>
        {a.description ? <Text style={{ color: t.secondary, fontSize: 13.5, marginTop: 4 }}>{a.description}</Text> : null}
      </Card>
    </Pressable>
  ));
}

// ---------- screen ----------

export default function MatchScreen({ route }) {
  const t = useTheme();
  const { isFav, toggle } = useStore();
  const sport = route.match.sport;
  const sp = sportByKey(sport);
  const [m, setM] = useState(route.match);
  const [sum, setSum] = useState(null);
  const [table, setTable] = useState(null);
  const [pred, setPred] = useState(null);
  const [tab, setTab] = useState('details');
  const teamGame = !sp.individual && m.kind === 'match';

  const refresh = useCallback(async () => {
    try {
      if (teamGame) {
        const s = await fetchSummary(sport, m.league, m.eventId, 15000);
        setSum(s);
        if (s && s.__match) {
          const n = s.__match;
          setM((old) => ({ ...old, ...n, home: { ...old.home, ...n.home, logo: n.home.logo || old.home.logo }, away: { ...old.away, ...n.away, logo: n.away.logo || old.away.logo } }));
        } else if (s && s.header && s.header.competitions) {
          const n = normalizeEvent({ id: s.header.id, date: s.header.competitions[0].date, competitions: s.header.competitions }, sport, m.league, m.leagueName)[0];
          if (n) setM((old) => ({ ...old, ...n, odds: old.odds || n.odds, venue: n.venue || old.venue, details: n.details.length ? n.details : old.details, home: { ...old.home, ...n.home, form: n.home.form || old.home.form }, away: { ...old.away, ...n.away, form: n.away.form || old.away.form } }));
        }
      } else {
        setSum({});
        const sb = await scoreboard(sport, m.league, new Date(m.date), 15000);
        const n = sb.items.find((x) => x.key === m.key);
        if (n) setM(n);
      }
    } catch {
      setSum((s) => s || {});
    }
  }, [sport, m.league, m.eventId, m.key, m.date, m.leagueName, teamGame]);

  useEffect(() => {
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (m.state !== 'in') return undefined;
    const iv = setInterval(refresh, 20000);
    return () => clearInterval(iv);
  }, [m.state, refresh]);

  // MSport prices: on open, then every minute while the match is on
  useEffect(() => {
    if (!teamGame) return undefined;
    let alive = true;
    const get = () =>
      msportOdds(m).then((o) => {
        if (alive && o) setM((old) => ({ ...old, odds: old.odds && old.odds.home != null && old.odds.provider !== 'MSport' && !o ? old.odds : o }));
      });
    get();
    const iv = m.state === 'post' ? null : setInterval(get, 60000);
    return () => {
      alive = false;
      iv && clearInterval(iv);
    };
  }, [m.state === 'post']); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!teamGame) return;
    fetchStandings(sport, m.league)
      .then(setTable)
      .catch(() => setTable([]));
    predictMatch(route.match).then(setPred).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const events = useMemo(() => {
    if (!sum) return [];
    if (sum.keyEvents && sum.keyEvents.length) {
      return sum.keyEvents
        .filter((e) => e.type && !/kickoff|halftime|end|start/i.test(e.type.type || e.type.text || ''))
        .map((e) => {
          const tt = (e.type && (e.type.type || e.type.text)) || '';
          const ps = (e.participants || []).map((p) => p.athlete && p.athlete.displayName).filter(Boolean);
          const sub = /substitution/i.test(tt);
          return {
            clock: e.clock && e.clock.displayValue,
            teamId: e.team && String(e.team.id),
            scoring: !!e.scoringPlay,
            red: /red/i.test(tt),
            yellow: /yellow/i.test(tt) && !/red/i.test(tt),
            sub,
            var: /var/i.test(tt),
            title: sub ? ps[0] || e.text : ps[0] || (e.type && e.type.text) || '',
            sub2: sub ? (ps[1] ? `Off: ${ps[1]}` : '') : e.scoringPlay ? (ps[1] ? `Assist: ${ps[1]}` : e.type.text) : e.type.text,
          };
        });
    }
    if (sum.scoringPlays && sum.scoringPlays.length) {
      return sum.scoringPlays.map((p) => ({
        clock: `${p.period ? 'Q' + (p.period.number || '') : ''} ${(p.clock && p.clock.displayValue) || ''}`.trim(),
        teamId: p.team && String(p.team.id),
        scoring: true,
        title: (p.type && p.type.text) || 'Score',
        sub2: p.text,
        score: p.homeScore != null ? `${p.awayScore}-${p.homeScore}` : null,
      }));
    }
    return (m.details || []).map((d) => ({ clock: d.clock, teamId: d.teamId, scoring: d.scoring, red: d.red, yellow: d.yellow, title: d.player || d.type, sub2: d.type }));
  }, [sum, m.details]);

  const tabs = [{ key: 'details', label: 'Details' }];
  if (teamGame) {
    tabs.push({ key: 'lineups', label: sport === 'soccer' ? 'Lineups' : 'Box score' });
    tabs.push({ key: 'stats', label: 'Statistics' });
    if (sum && ((sum.commentary && sum.commentary.length) || (sum.plays && sum.plays.length))) tabs.push({ key: 'commentary', label: sum.commentary ? 'Commentary' : 'Plays' });
    tabs.push({ key: 'standings', label: 'Standings' });
    tabs.push({ key: 'h2h', label: 'H2H' });
    if (sum && sum.news && sum.news.articles && sum.news.articles.length) tabs.push({ key: 'news', label: 'News' });
  }

  const fav = isFav('matches', m.key);
  const body = () => {
    if (!sum) return <Loading />;
    switch (tab) {
      case 'lineups':
        return sport === 'soccer' ? <SoccerLineups m={m} sum={sum} /> : <BoxScore m={m} sum={sum} />;
      case 'stats':
        return (
          <View>
            <MomentumGraph m={m} mom={sum.momentum} compact />
            <TeamStats m={m} sum={sum} />
          </View>
        );
      case 'commentary':
        return <Commentary m={m} sum={sum} />;
      case 'standings':
        return table == null ? (
          <Loading />
        ) : table.length ? (
          <Card>
            <Standings groups={table} sport={sport} league={m.league} highlight={[m.home.id, m.away.id]} />
          </Card>
        ) : (
          <Empty icon="list-outline" title="No table for this competition" />
        );
      case 'h2h':
        return <H2H m={m} sum={sum} />;
      case 'news':
        return <News sum={sum} />;
      default:
        return (
          <View>
            {m.kind === 'field' ? <Leaderboard m={m} /> : null}
            {sport === 'tennis' ? <TennisSets m={m} /> : null}
            <LiveAction m={m} sum={sum} />
            <Timeline m={m} events={events} />
            <MomentumGraph m={m} mom={sum.momentum} />
            {m.state !== 'post' ? <AIPrediction m={m} pred={pred} /> : null}
            <WinProb m={m} sum={sum} />
            <OddsCard m={m} pick={sum.pickcenter} />
            <MSportMarkets m={m} />
            {m.state === 'post' && pred ? <AIPrediction m={m} pred={pred} /> : null}
            <InfoCard m={m} sum={sum} />
          </View>
        );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <PushHeader title={m.kind === 'field' ? m.eventName : `${m.home.short} vs ${m.away.short}`} subtitle={m.leagueName} right={<GlassCircle icon={fav ? 'star' : 'star-outline'} color={fav ? t.yellow : undefined} onPress={() => toggle('matches', favMatch(m))} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingTop: 6 }}>
        {m.kind === 'match' ? <ScoreHeader m={m} sport={sport} /> : null}
        {tabs.length > 1 ? <TabStrip tabs={tabs} value={tab} onChange={setTab} /> : null}
        {body()}
      </ScrollView>
    </View>
  );
}

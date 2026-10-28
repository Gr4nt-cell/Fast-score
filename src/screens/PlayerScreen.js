import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { useNav } from '../nav';
import { useStore } from '../store';
import { athlete as fetchAthlete } from '../api/espn';
import { Glass } from '../components/Glass';
import { Card, Empty, GlassCircle, Loading, Logo, PushHeader, Row } from '../components/ui';

function StatTable({ title, labels, rows }) {
  const t = useTheme();
  if (!labels || !labels.length || !rows.length) return null;
  return (
    <Card>
      <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, marginBottom: 6 }}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.separator }}>
            <Text style={{ width: 120, color: t.secondary, fontSize: 12, fontWeight: '700' }} />
            {labels.map((l, i) => (
              <Text key={i} style={{ width: 48, textAlign: 'center', color: t.secondary, fontSize: 12, fontWeight: '700' }}>
                {l}
              </Text>
            ))}
          </View>
          {rows.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', paddingVertical: 7, borderBottomWidth: i === rows.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: t.separator }}>
              <Text style={{ width: 120, color: t.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                {r.name}
              </Text>
              {r.stats.map((v, k) => (
                <Text key={k} style={{ width: 48, textAlign: 'center', color: t.text, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                  {v}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </Card>
  );
}

export default function PlayerScreen({ route }) {
  const t = useTheme();
  const nav = useNav();
  const { isFav, toggle } = useStore();
  const { sport, league, id } = route;
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchAthlete(sport, league, id)
      .then(setData)
      .catch(() => setData({ athlete: {} }));
  }, [sport, league, id]);

  const a = (data && data.athlete) || {};
  const name = a.displayName || route.title;
  const photo = (a.headshot && a.headshot.href) || null;
  const team = a.team || {};
  const favItem = { id: `${sport}:${id}`, athleteId: id, name, photo, sport, league };
  const fav = isFav('players', favItem.id);

  const facts = [
    ['Team', team.displayName],
    ['Position', a.position && (a.position.displayName || a.position.name)],
    ['Shirt', a.jersey ? `#${a.jersey}` : null],
    ['Age', a.age],
    ['Born', a.displayDOB || (a.dateOfBirth ? new Date(a.dateOfBirth).toLocaleDateString() : null)],
    ['Nationality', a.citizenship || (a.flag && a.flag.alt)],
    ['Height', a.displayHeight],
    ['Weight', a.displayWeight],
    ['Birthplace', a.displayBirthPlace],
    ['Experience', a.displayExperience],
    ['Status', a.status && a.status.name !== 'Active' ? a.status.name : null],
  ].filter((f) => f[1]);

  const ov = data && data.overview;
  const st = ov && ov.statistics;
  const statRows = st && st.splits ? st.splits.map((s) => ({ name: s.displayName, stats: s.stats || [] })) : [];
  const gl = data && data.gamelog;
  const glRows = [];
  if (gl && gl.events && gl.seasonTypes && gl.seasonTypes[0]) {
    const cats = gl.seasonTypes[0].categories || [];
    cats.forEach((c) =>
      (c.events || []).slice(0, 10).forEach((e) => {
        const ev = gl.events[e.eventId] || {};
        glRows.push({ name: `${ev.atVs || ''} ${(ev.opponent && ev.opponent.abbreviation) || ''} ${ev.gameResult || ''}`.trim(), stats: e.stats || [] });
      })
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <PushHeader title={name} right={<GlassCircle icon={fav ? 'star' : 'star-outline'} color={fav ? t.yellow : undefined} onPress={() => toggle('players', favItem)} />} />
      {!data ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={{ alignItems: 'center', marginVertical: 12 }}>
            <Glass radius={60} strong style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <Logo uri={photo} name={name} size={112} round />
            </Glass>
            <Text style={{ color: t.text, fontSize: 24, fontWeight: '800', marginTop: 10 }}>{name}</Text>
            {team.displayName ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Logo uri={team.logos && team.logos[0] && team.logos[0].href} name={team.displayName} size={18} />
                <Text
                  style={{ color: t.blue, marginLeft: 6, fontWeight: '600' }}
                  onPress={() => team.id && nav.push({ name: 'team', sport, league, id: String(team.id), title: team.displayName })}
                >
                  {team.displayName}
                </Text>
              </View>
            ) : null}
          </View>
          {facts.length ? (
            <Card>
              {facts.map(([k, v], i) => (
                <Row key={k} last={i === facts.length - 1}>
                  <Text style={{ color: t.secondary, fontSize: 14, flex: 1 }}>{k}</Text>
                  <Text style={{ color: t.text, fontSize: 14, fontWeight: '600' }}>{String(v)}</Text>
                </Row>
              ))}
            </Card>
          ) : null}
          <StatTable title="Season statistics" labels={st && st.labels} rows={statRows} />
          <StatTable title="Recent games" labels={gl && gl.labels} rows={glRows.slice(0, 10)} />
          {!facts.length && !statRows.length ? <Empty icon="person-outline" title="No profile available" body="ESPN doesn't publish details for this player." /> : null}
        </ScrollView>
      )}
    </View>
  );
}

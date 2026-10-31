import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Text } from '../components/Text';
import { useTheme } from '../theme';
import { useNav } from '../nav';
import { useStore } from '../store';
import { roster as fetchRoster, standings as fetchStandings, team as fetchTeam, teamSchedule } from '../api/espn';
import { Glass, ScrollGlowScrollView as ScrollView } from '../components/Glass';
import Standings from '../components/Standings';
import { MatchRow } from '../components/match';
import { Card, Empty, FormPills, GlassCircle, Loading, Logo, PushHeader, Row, SectionTitle, TabStrip } from '../components/ui';

export default function TeamScreen({ route }) {
  const t = useTheme();
  const nav = useNav();
  const { isFav, toggle } = useStore();
  const { sport, league, id } = route;
  const [info, setInfo] = useState(null);
  const [games, setGames] = useState(null);
  const [squad, setSquad] = useState(null);
  const [table, setTable] = useState(null);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    fetchTeam(sport, league, id).then(setInfo).catch(() => setInfo({}));
    teamSchedule(sport, league, id).then(setGames).catch(() => setGames([]));
  }, [sport, league, id]);

  useEffect(() => {
    if (tab === 'squad' && squad == null) fetchRoster(sport, league, id).then(setSquad).catch(() => setSquad({ groups: [] }));
    if (tab === 'standings' && table == null) fetchStandings(sport, league).then(setTable).catch(() => setTable([]));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = (info && info.displayName) || route.title;
  const logo = (info && info.logos && info.logos[0] && info.logos[0].href) || route.logo;
  const favItem = { id: `${sport}:${league}:${id}`, teamId: id, name, logo, sport, league };
  const fav = isFav('teams', favItem.id);

  const { past, upcoming } = useMemo(() => {
    const g = games || [];
    return { past: g.filter((x) => x.state === 'post').reverse(), upcoming: g.filter((x) => x.state !== 'post') };
  }, [games]);

  const form = past
    .slice(0, 5)
    .map((m) => {
      const me = m.home.id === String(id) ? m.home : m.away;
      const op = me === m.home ? m.away : m.home;
      return Number(me.score) > Number(op.score) ? 'W' : Number(me.score) < Number(op.score) ? 'L' : 'D';
    })
    .reverse()
    .join('');

  const record = info && info.record && info.record.items && info.record.items[0] && info.record.items[0].summary;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <PushHeader title={name} right={<GlassCircle icon={fav ? 'star' : 'star-outline'} color={fav ? t.yellow : undefined} onPress={() => toggle('teams', favItem)} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ alignItems: 'center', marginVertical: 10 }}>
          <Glass radius={28} strong style={{ width: 100, height: 100, alignItems: 'center', justifyContent: 'center' }}>
            <Logo uri={logo} name={name} size={68} />
          </Glass>
          <Text style={{ color: t.text, fontSize: 24, fontWeight: '800', marginTop: 10, textAlign: 'center', paddingHorizontal: 20 }}>{name}</Text>
          <Text style={{ color: t.secondary, marginTop: 2 }}>{[info && info.standingSummary, record].filter(Boolean).join(' · ')}</Text>
          {form ? (
            <View style={{ marginTop: 8 }}>
              <FormPills form={form} />
            </View>
          ) : null}
        </View>
        <TabStrip
          tabs={[
            { key: 'overview', label: 'Overview' },
            { key: 'matches', label: 'Matches' },
            { key: 'squad', label: 'Squad' },
            { key: 'standings', label: 'Standings' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'overview' ? (
          games == null ? (
            <Loading />
          ) : (
            <View>
              {upcoming.length ? (
                <>
                  <SectionTitle>Next match</SectionTitle>
                  <Glass radius={24} strong style={{ marginHorizontal: 16, marginBottom: 14, paddingHorizontal: 6 }}>
                    <MatchRow m={upcoming[0]} last showLeague />
                  </Glass>
                </>
              ) : null}
              {past.length ? (
                <>
                  <SectionTitle>Recent results</SectionTitle>
                  <Glass radius={24} strong style={{ marginHorizontal: 16, marginBottom: 14, paddingHorizontal: 6 }}>
                    {past.slice(0, 5).map((m, i) => (
                      <MatchRow key={m.key} m={m} last={i === Math.min(4, past.length - 1)} showLeague />
                    ))}
                  </Glass>
                </>
              ) : null}
              {info && info.venue ? (
                <Card>
                  <Text style={{ color: t.secondary, fontSize: 12, fontWeight: '700' }}>Home venue</Text>
                  <Text style={{ color: t.text, fontSize: 15, fontWeight: '700', marginTop: 2 }}>{info.venue.fullName}</Text>
                </Card>
              ) : null}
              {!past.length && !upcoming.length ? <Empty title="No matches found" /> : null}
            </View>
          )
        ) : null}
        {tab === 'matches' ? (
          games == null ? (
            <Loading />
          ) : games.length ? (
            <View>
              {upcoming.length ? <SectionTitle>Fixtures</SectionTitle> : null}
              {upcoming.length ? (
                <Glass radius={24} strong style={{ marginHorizontal: 16, marginBottom: 14, paddingHorizontal: 6 }}>
                  {upcoming.map((m, i) => (
                    <MatchRow key={m.key} m={m} last={i === upcoming.length - 1} showLeague />
                  ))}
                </Glass>
              ) : null}
              {past.length ? <SectionTitle>Results</SectionTitle> : null}
              {past.length ? (
                <Glass radius={24} strong style={{ marginHorizontal: 16, marginBottom: 14, paddingHorizontal: 6 }}>
                  {past.map((m, i) => (
                    <MatchRow key={m.key} m={m} last={i === past.length - 1} showLeague />
                  ))}
                </Glass>
              ) : null}
            </View>
          ) : (
            <Empty title="No matches found" />
          )
        ) : null}
        {tab === 'squad' ? (
          squad == null ? (
            <Loading />
          ) : squad.groups.length ? (
            <View>
              {squad.coach ? (
                <Card>
                  <Text style={{ color: t.secondary, fontSize: 12, fontWeight: '700' }}>Head coach</Text>
                  <Text style={{ color: t.text, fontSize: 15, fontWeight: '700', marginTop: 2 }}>{squad.coach}</Text>
                </Card>
              ) : null}
              {squad.groups.map((g) => (
                <Card key={g.name}>
                  <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, marginBottom: 4 }}>{g.name}</Text>
                  {g.players.map((p, i) => (
                    <Row key={p.id} last={i === g.players.length - 1} onPress={() => nav.push({ name: 'player', sport, league, id: p.id, title: p.name })}>
                      <Text style={{ width: 30, color: t.secondary, fontWeight: '800' }}>{p.jersey || ''}</Text>
                      <Logo uri={p.headshot} name={p.name} size={32} round />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>{p.name}</Text>
                        <Text style={{ color: t.secondary, fontSize: 12 }}>{[p.posAbbr, p.age ? `${p.age} yrs` : null, p.country].filter(Boolean).join(' · ')}</Text>
                      </View>
                      {p.flag ? <Logo uri={p.flag} name={p.country} size={18} /> : null}
                    </Row>
                  ))}
                </Card>
              ))}
            </View>
          ) : (
            <Empty icon="people-outline" title="Squad not available" />
          )
        ) : null}
        {tab === 'standings' ? (
          table == null ? (
            <Loading />
          ) : table.length ? (
            <Card>
              <Standings groups={table} sport={sport} league={league} highlight={[String(id)]} />
            </Card>
          ) : (
            <Empty icon="list-outline" title="No table available" />
          )
        ) : null}
      </ScrollView>
    </View>
  );
}

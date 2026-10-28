import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../theme';
import { useNav } from '../nav';
import { useStore } from '../store';
import { leagueMeta } from '../sports';
import { news as fetchNews, scoreboard, standings as fetchStandings, teams as fetchTeams } from '../api/espn';
import { Glass } from '../components/Glass';
import { Pressable } from '../components/Touch';
import DateStrip, { startOfDay } from '../components/DateStrip';
import Standings from '../components/Standings';
import { MatchRow } from '../components/match';
import { Card, Chevron, Empty, GlassCircle, Loading, Logo, PushHeader, Row, TabStrip } from '../components/ui';

export function NewsList({ items }) {
  const t = useTheme();
  if (!items) return <Loading />;
  if (!items.length) return <Empty icon="newspaper-outline" title="No news right now" />;
  return items.map((a) => (
    <Pressable key={a.id} onPress={() => a.url && Linking.openURL(a.url)}>
      <Card>
        {a.image ? <Image source={{ uri: a.image }} style={{ height: 170, borderRadius: 14, marginBottom: 10 }} contentFit="cover" transition={150} /> : null}
        <Text style={{ color: t.text, fontWeight: '800', fontSize: 16 }}>{a.title}</Text>
        {a.body ? (
          <Text style={{ color: t.secondary, fontSize: 13.5, marginTop: 4, lineHeight: 19 }} numberOfLines={3}>
            {a.body}
          </Text>
        ) : null}
        {a.date ? <Text style={{ color: t.tertiary, fontSize: 12, marginTop: 6 }}>{new Date(a.date).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text> : null}
      </Card>
    </Pressable>
  ));
}

export default function LeagueScreen({ route }) {
  const t = useTheme();
  const nav = useNav();
  const { isFav, toggle } = useStore();
  const { sport, league } = route;
  const meta = leagueMeta(sport, league);
  const [tab, setTab] = useState('matches');
  const [date, setDate] = useState(startOfDay(new Date()));
  const [board, setBoard] = useState(null);
  const [logo, setLogo] = useState(route.logo);
  const [table, setTable] = useState(null);
  const [newsItems, setNews] = useState(null);
  const [teamList, setTeams] = useState(null);

  useEffect(() => {
    setBoard(null);
    scoreboard(sport, league, date, 30000)
      .then((r) => {
        setBoard(r.items);
        if (r.league.logo) setLogo(r.league.logo);
      })
      .catch(() => setBoard([]));
  }, [sport, league, date]);

  useEffect(() => {
    if (tab === 'standings' && table == null) fetchStandings(sport, league).then(setTable).catch(() => setTable([]));
    if (tab === 'news' && newsItems == null) fetchNews(sport, league).then(setNews).catch(() => setNews([]));
    if (tab === 'teams' && teamList == null) fetchTeams(sport, league).then(setTeams).catch(() => setTeams([]));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const lk = `${sport}/${league}`;
  const pinned = isFav('leagues', lk);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <PushHeader title={route.title || meta.name} subtitle={meta.country} right={<GlassCircle icon={pinned ? 'pin' : 'pin-outline'} color={pinned ? t.blue : undefined} onPress={() => toggle('leagues', lk)} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ alignItems: 'center', marginVertical: 10 }}>
          <Glass radius={26} strong style={{ width: 92, height: 92, alignItems: 'center', justifyContent: 'center' }}>
            <Logo uri={logo} name={meta.name} size={62} />
          </Glass>
          <Text style={{ color: t.text, fontSize: 24, fontWeight: '800', marginTop: 10 }}>{route.title || meta.name}</Text>
        </View>
        <TabStrip
          tabs={[
            { key: 'matches', label: 'Matches' },
            { key: 'standings', label: 'Standings' },
            { key: 'news', label: 'News' },
            { key: 'teams', label: 'Teams' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'matches' ? (
          <View>
            <DateStrip value={date} onChange={setDate} />
            <View style={{ height: 14 }} />
            {board == null ? (
              <Loading />
            ) : board.length ? (
              <Glass radius={24} strong style={{ marginHorizontal: 16, paddingHorizontal: 6 }}>
                {board.map((m, i) => (
                  <MatchRow key={m.key} m={m} last={i === board.length - 1} showOdds />
                ))}
              </Glass>
            ) : (
              <Empty title="Nothing on this day" body="Pick another day on the calendar." />
            )}
          </View>
        ) : null}
        {tab === 'standings' ? (
          table == null ? (
            <Loading />
          ) : table.length ? (
            <Card>
              <Standings groups={table} sport={sport} league={league} />
            </Card>
          ) : (
            <Empty icon="list-outline" title="No table for this competition" />
          )
        ) : null}
        {tab === 'news' ? <NewsList items={newsItems} /> : null}
        {tab === 'teams' ? (
          teamList == null ? (
            <Loading />
          ) : (
            <Card>
              {teamList.map((tm, i) => (
                <Row key={tm.id} last={i === teamList.length - 1} onPress={() => nav.push({ name: 'team', sport, league, id: tm.id, title: tm.name, logo: tm.logo })}>
                  <Logo uri={tm.logo} name={tm.name} size={26} />
                  <Text style={{ flex: 1, marginLeft: 10, color: t.text, fontSize: 15, fontWeight: '600' }}>{tm.name}</Text>
                  <Chevron />
                </Row>
              ))}
              {!teamList.length ? <Text style={{ color: t.secondary }}>No teams listed.</Text> : null}
            </Card>
          )
        ) : null}
      </ScrollView>
    </View>
  );
}

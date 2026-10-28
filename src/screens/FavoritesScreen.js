import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useTheme, TAB_BAR_SPACE } from '../theme';
import { useNav } from '../nav';
import { useStore } from '../store';
import { leagueMeta, sportByKey } from '../sports';
import { pool, scoreboard, teamSchedule } from '../api/espn';
import { Glass } from '../components/Glass';
import { MatchRow } from '../components/match';
import { Card, Chevron, Empty, GlassCircle, LargeHeader, Loading, Logo, Row, SectionTitle, Segmented, SportIcon } from '../components/ui';
import { pickToMatch } from './PicksScreen';

export default function FavoritesScreen() {
  const t = useTheme();
  const nav = useNav();
  const { favs, toggle } = useStore();
  const [mode, setMode] = useState('matches');
  const [matches, setMatches] = useState(null);
  const [teamGames, setTeamGames] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const loadMatches = useCallback(async () => {
    const jobs = {};
    favs.matches.forEach((m) => {
      const k = `${m.sport}|${m.league}|${new Date(m.date).toDateString()}`;
      (jobs[k] = jobs[k] || []).push(m);
    });
    const keys = Object.keys(jobs);
    const res = await pool(keys, 6, (k) => {
      const [s, l, d] = k.split('|');
      return scoreboard(s, l, new Date(d), 20000);
    });
    const out = [];
    keys.forEach((k, i) => {
      jobs[k].forEach((fm) => {
        const live = res[i] && res[i].items.find((x) => x.key === fm.key);
        out.push(live || pickToMatch(fm));
      });
    });
    out.sort((a, b) => (a.state === 'in' ? -1 : 0) - (b.state === 'in' ? -1 : 0) || new Date(a.date) - new Date(b.date));
    setMatches(out);
  }, [favs.matches]);

  const loadTeams = useCallback(async () => {
    const res = await pool(favs.teams, 4, (tm) => teamSchedule(tm.sport, tm.league, tm.teamId));
    const map = {};
    favs.teams.forEach((tm, i) => {
      const g = res[i] || [];
      map[tm.id] = { next: g.find((x) => x.state !== 'post'), last: [...g].reverse().find((x) => x.state === 'post') };
    });
    setTeamGames(map);
  }, [favs.teams]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);
  useEffect(() => {
    if (mode === 'teams') loadTeams();
  }, [mode, loadTeams]);

  const finished = (matches || []).filter((m) => m.state === 'post' && Date.now() - new Date(m.date) > 24 * 3600 * 1000);

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
            await Promise.all([loadMatches(), mode === 'teams' ? loadTeams() : null]);
            setRefreshing(false);
          }}
        />
      }
    >
      <LargeHeader title="Favorites" right={<GlassCircle icon="settings-outline" onPress={() => nav.push({ name: 'settings' })} />} />
      <View style={{ paddingHorizontal: 16, marginTop: 14, marginBottom: 14 }}>
        <Segmented
          options={[
            { key: 'matches', label: `Matches${favs.matches.length ? ' ' + favs.matches.length : ''}` },
            { key: 'teams', label: 'Teams' },
            { key: 'players', label: 'Players' },
            { key: 'leagues', label: 'Leagues' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </View>

      {mode === 'matches' ? (
        !favs.matches.length ? (
          <Empty icon="star-outline" title="No followed matches" body="Tap the star on any match to follow it. You'll get an alert in the app when it scores." />
        ) : matches == null ? (
          <Loading />
        ) : (
          <>
            <Glass radius={24} strong style={{ marginHorizontal: 16, paddingHorizontal: 6, marginBottom: 14 }}>
              {matches.map((m, i) => (
                <MatchRow key={m.key} m={m} last={i === matches.length - 1} showLeague />
              ))}
            </Glass>
            {finished.length ? (
              <Text style={{ color: t.blue, textAlign: 'center', fontWeight: '600' }} onPress={() => finished.forEach((m) => toggle('matches', m.key))}>
                Clear {finished.length} finished
              </Text>
            ) : null}
          </>
        )
      ) : null}

      {mode === 'teams' ? (
        !favs.teams.length ? (
          <Empty icon="shield-outline" title="No favourite teams" body="Open a team and tap the star to follow it." />
        ) : (
          favs.teams.map((tm) => {
            const g = teamGames[tm.id];
            return (
              <Card key={tm.id} padded={false}>
                <Row style={{ paddingHorizontal: 14 }} last={!g || (!g.next && !g.last)} onPress={() => nav.push({ name: 'team', sport: tm.sport, league: tm.league, id: tm.teamId, title: tm.name, logo: tm.logo })}>
                  <Logo uri={tm.logo} name={tm.name} size={32} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: t.text, fontSize: 16, fontWeight: '800' }}>{tm.name}</Text>
                    <Text style={{ color: t.secondary, fontSize: 12 }}>{leagueMeta(tm.sport, tm.league).name}</Text>
                  </View>
                  <Chevron />
                </Row>
                <View style={{ paddingHorizontal: 6 }}>
                  {g && g.last ? <MatchRow m={g.last} last={!g.next} showLeague /> : null}
                  {g && g.next ? <MatchRow m={g.next} last showLeague /> : null}
                  {!g ? <Loading /> : null}
                </View>
              </Card>
            );
          })
        )
      ) : null}

      {mode === 'players' ? (
        !favs.players.length ? (
          <Empty icon="person-outline" title="No favourite players" body="Open a player and tap the star." />
        ) : (
          <Card>
            {favs.players.map((p, i) => (
              <Row key={p.id} last={i === favs.players.length - 1} onPress={() => nav.push({ name: 'player', sport: p.sport, league: p.league, id: p.athleteId, title: p.name })}>
                <Logo uri={p.photo} name={p.name} size={36} round />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{p.name}</Text>
                  <Text style={{ color: t.secondary, fontSize: 12 }}>{sportByKey(p.sport).name}</Text>
                </View>
                <Chevron />
              </Row>
            ))}
          </Card>
        )
      ) : null}

      {mode === 'leagues' ? (
        !favs.leagues.length ? (
          <Empty icon="pin-outline" title="No pinned competitions" body="Pinned competitions stay at the top of Matches." />
        ) : (
          <>
            <SectionTitle>Pinned competitions</SectionTitle>
            <Card>
              {favs.leagues.map((k, i) => {
                const [s, slug] = k.split('/');
                const meta = leagueMeta(s, slug);
                return (
                  <Row key={k} last={i === favs.leagues.length - 1} onPress={() => nav.push({ name: 'league', sport: s, league: slug, title: meta.name })}>
                    <View style={{ width: 30 }}>
                      <SportIcon name={sportByKey(s).icon} size={20} color={t.secondary} />
                    </View>
                    <Text style={{ flex: 1, color: t.text, fontSize: 15, fontWeight: '700' }}>{meta.name}</Text>
                    <Text style={{ color: t.secondary, fontSize: 12, marginRight: 8 }}>{meta.country}</Text>
                    <Chevron />
                  </Row>
                );
              })}
            </Card>
          </>
        )
      ) : null}
    </ScrollView>
  );
}

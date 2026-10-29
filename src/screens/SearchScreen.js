import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, ScrollView, View } from 'react-native';
import { tr } from '../i18n';
import { Text, TextInput } from '../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, TAB_BAR_SPACE } from '../theme';
import { useNav } from '../nav';
import { load, save } from '../store';
import { SPORTS, sportByKey } from '../sports';
import { pool, search as espnSearch, teams as fetchTeams } from '../api/espn';
import { Glass } from '../components/Glass';
import { Card, Chevron, Empty, LargeHeader, Loading, Logo, Row, SectionTitle, SportIcon } from '../components/ui';

// teams of the main competitions, loaded once and kept for a day
let teamIndex = null;
async function getTeamIndex() {
  if (teamIndex) return teamIndex;
  const jobs = [];
  SPORTS.forEach((s) => s.leagues.forEach((l) => (l.top || s.key === 'soccer') && !s.individual && jobs.push([s.key, l.slug])));
  const res = await pool(jobs, 8, ([s, l]) => fetchTeams(s, l));
  const seen = new Set();
  teamIndex = [];
  res.forEach((lst) =>
    (lst || []).forEach((tm) => {
      const k = tm.sport + tm.id;
      if (seen.has(k)) return;
      seen.add(k);
      teamIndex.push(tm);
    })
  );
  return teamIndex;
}

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export default function SearchScreen() {
  const t = useTheme();
  const nav = useNav();
  const [q, setQ] = useState('');
  const [teamsIdx, setTeamsIdx] = useState(null);
  const [remote, setRemote] = useState([]);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState([]);
  const timer = useRef(null);

  useEffect(() => {
    load('recentSearches', []).then(setRecent);
    getTeamIndex()
      .then(setTeamsIdx)
      .catch(() => setTeamsIdx([]));
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setRemote([]);
      return undefined;
    }
    timer.current = setTimeout(async () => {
      setBusy(true);
      const r = await espnSearch(q.trim());
      setRemote(r);
      setBusy(false);
    }, 350);
    return () => clearTimeout(timer.current);
  }, [q]);

  const nq = norm(q.trim());
  const leagues = useMemo(() => {
    if (nq.length < 2) return [];
    const out = [];
    SPORTS.forEach((s) => s.leagues.forEach((l) => (norm(l.name).includes(nq) || norm(l.country).includes(nq)) && out.push({ sport: s.key, ...l })));
    return out.slice(0, 8);
  }, [nq]);
  const localTeams = useMemo(() => {
    if (nq.length < 2 || !teamsIdx) return [];
    return teamsIdx
      .filter((tm) => norm(tm.name).includes(nq) || norm(tm.abbr) === nq || norm(tm.short).includes(nq))
      .sort((a, b) => norm(a.name).indexOf(nq) - norm(b.name).indexOf(nq))
      .slice(0, 20);
  }, [nq, teamsIdx]);
  const players = remote.filter((r) => r.type === 'player').slice(0, 15);
  const remoteTeams = remote.filter((r) => r.type === 'team' && r.league && !localTeams.find((x) => x.id === r.id && x.sport === r.sport)).slice(0, 10);

  const remember = (item) => {
    const n = [item, ...recent.filter((r) => r.key !== item.key)].slice(0, 10);
    setRecent(n);
    save('recentSearches', n);
  };
  const openTeam = (tm) => {
    remember({ key: 'team' + tm.sport + tm.id, type: 'team', ...tm });
    nav.push({ name: 'team', sport: tm.sport, league: tm.league, id: tm.id, title: tm.name, logo: tm.logo || tm.image });
  };
  const openPlayer = (p) => {
    remember({ key: 'player' + p.sport + p.id, ...p });
    nav.push({ name: 'player', sport: p.sport, league: p.league, id: p.id, title: p.name });
  };
  const openLeague = (l) => {
    remember({ key: 'league' + l.sport + l.slug, type: 'league', ...l });
    nav.push({ name: 'league', sport: l.sport, league: l.slug, title: l.name });
  };
  const openRecent = (r) => (r.type === 'team' ? openTeam(r) : r.type === 'league' ? openLeague(r) : openPlayer(r));

  const nothing = nq.length >= 2 && !busy && teamsIdx && !leagues.length && !localTeams.length && !players.length && !remoteTeams.length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + 20 }} keyboardShouldPersistTaps="handled" onScrollBeginDrag={Keyboard.dismiss}>
      <LargeHeader title="Search" />
      <View style={{ paddingHorizontal: 16, marginTop: 14, marginBottom: 16 }}>
        <Glass radius={30} strong style={{ height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 }}>
          <Ionicons name="search" size={22} color={t.secondary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={tr('Teams, players, competitions')}
            placeholderTextColor={t.secondary}
            style={{ flex: 1, height: 50, marginLeft: 10, fontSize: 19, color: t.text }}
            autoCorrect={false}
            returnKeyType="search"
          />
          {q ? <Ionicons name="close-circle" size={20} color={t.tertiary} onPress={() => setQ('')} /> : null}
        </Glass>
      </View>

      {nq.length < 2 ? (
        recent.length ? (
          <>
            <SectionTitle right={<Text style={{ color: t.blue, fontWeight: '600' }} onPress={() => { setRecent([]); save('recentSearches', []); }}>Clear</Text>}>Recent</SectionTitle>
            <Card>
              {recent.map((r, i) => (
                <Row key={r.key} last={i === recent.length - 1} onPress={() => openRecent(r)}>
                  <Logo uri={r.logo || r.image} name={r.name} size={30} round={r.type === 'player'} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>{r.name}</Text>
                    <Text style={{ color: t.secondary, fontSize: 12, textTransform: 'capitalize' }}>{r.type}</Text>
                  </View>
                  <Chevron />
                </Row>
              ))}
            </Card>
          </>
        ) : (
          <Empty icon="search" title="Find anything" body="Search across football, basketball, tennis, F1, UFC and more." />
        )
      ) : null}

      {leagues.length ? (
        <>
          <SectionTitle>Competitions</SectionTitle>
          <Card>
            {leagues.map((l, i) => (
              <Row key={l.sport + l.slug} last={i === leagues.length - 1} onPress={() => openLeague(l)}>
                <View style={{ width: 30 }}>
                  <SportIcon name={sportByKey(l.sport).icon} size={20} color={t.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{l.name}</Text>
                  <Text style={{ color: t.secondary, fontSize: 12 }}>{l.country}</Text>
                </View>
                <Chevron />
              </Row>
            ))}
          </Card>
        </>
      ) : null}

      {localTeams.length || remoteTeams.length ? (
        <>
          <SectionTitle>Teams</SectionTitle>
          <Card>
            {[...localTeams, ...remoteTeams].map((tm, i, arr) => (
              <Row key={tm.sport + tm.id + i} last={i === arr.length - 1} onPress={() => openTeam(tm)}>
                <Logo uri={tm.logo || tm.image} name={tm.name} size={30} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{tm.name}</Text>
                  <Text style={{ color: t.secondary, fontSize: 12 }}>{sportByKey(tm.sport).name}</Text>
                </View>
                <Chevron />
              </Row>
            ))}
          </Card>
        </>
      ) : null}

      {players.length ? (
        <>
          <SectionTitle>Players</SectionTitle>
          <Card>
            {players.map((p, i) => (
              <Row key={p.sport + p.id} last={i === players.length - 1} onPress={() => openPlayer(p)}>
                <Logo uri={p.image} name={p.name} size={34} round />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{p.name}</Text>
                  <Text style={{ color: t.secondary, fontSize: 12 }} numberOfLines={1}>
                    {[p.sub, sportByKey(p.sport).name].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Chevron />
              </Row>
            ))}
          </Card>
        </>
      ) : null}

      {nq.length >= 2 && (busy || !teamsIdx) ? <Loading /> : null}
      {nothing ? <Empty icon="search" title={`No results for “${q.trim()}”`} body="Try a shorter name or another spelling." /> : null}
    </ScrollView>
  );
}

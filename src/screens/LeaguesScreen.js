import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { Text } from '../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, TAB_BAR_SPACE } from '../theme';
import { useNav } from '../nav';
import { useStore } from '../store';
import { SPORTS, leagueMeta, sportByKey } from '../sports';
import { news as fetchNews } from '../api/espn';
import { SportBar } from '../components/match';
import { Pressable } from '../components/Touch';
import { Card, Chevron, Empty, GlassCircle, Loading, Logo, Row, SectionTitle, Segmented, SportIcon } from '../components/ui';
import { leagueInfo, sportLeagues } from '../api/leaguesIndex';
import { leagueNames } from '../api/flashscore';
import { NewsList } from './LeagueScreen';
import { Glass } from '../components/Glass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const norm = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function LeaguesScreen() {
  const t = useTheme();
  const nav = useNav();
  const { settings, favs, toggle } = useStore();
  const [sport, setSport] = useState(settings.sport || 'soccer');
  const [mode, setMode] = useState('leagues');
  const [newsItems, setNews] = useState(null);
  const [idx, setIdx] = useState(null); // { countries, top, total } | 'error'
  const [open, setOpen] = useState({}); // expanded countries
  const [q, setQ] = useState('');
  const [pinnedInfo, setPinnedInfo] = useState({});
  const sp = sportByKey(sport);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (mode !== 'news') return;
    setNews(null);
    const lg = sp.leagues.find((l) => l.top) || sp.leagues[0];
    fetchNews(sport, lg.slug)
      .then(setNews)
      .catch(() => setNews([]));
  }, [mode, sport]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setIdx(null);
    setOpen({});
    sportLeagues(sport)
      .then((r) => setIdx(r.total ? r : 'error'))
      .catch(() => setIdx('error'));
  }, [sport]);

  // names for pinned competitions that came from the full index or from day lists
  useEffect(() => {
    let alive = true;
    (async () => {
      const out = {};
      for (const k of favs.leagues) {
        const [s, slug] = k.split('/');
        if (!String(slug).startsWith('fs:')) continue;
        const info = (await leagueInfo(s, slug)) || leagueNames.get(slug);
        if (info) out[k] = info;
      }
      if (alive) setPinnedInfo(out);
    })();
    return () => {
      alive = false;
    };
  }, [favs.leagues]);

  const pinned = favs.leagues.map((k) => {
    const [s, slug] = k.split('/');
    const info = pinnedInfo[k];
    const meta = info ? { slug, name: info.name, country: info.country || '' } : leagueMeta(s, slug);
    return { sport: s, slug, meta };
  });

  const ready = idx && idx !== 'error';
  const fallback = idx === 'error';
  const byCountry = useMemo(() => {
    const out = {};
    sp.leagues.forEach((l) => (out[l.country] = out[l.country] || []).push(l));
    return Object.entries(out);
  }, [sp]);

  const open_ = (s, l) => nav.push({ name: 'league', sport: s, league: l.slug, title: l.name, country: l.country });
  const openIdx = (l) => nav.push({ name: 'league', sport, league: l.key, title: l.name, country: l.country });

  const nq = norm(q.trim());
  const results = useMemo(() => {
    if (!ready || nq.length < 2) return null;
    const out = [];
    for (const c of idx.countries) {
      const cm = norm(c.name).includes(nq);
      for (const l of c.leagues) {
        if (cm || norm(l.name).includes(nq)) out.push(l);
        if (out.length >= 150) return out;
      }
    }
    return out;
  }, [ready, idx, nq]);

  const leagueRow = (l, i, n, showCountry) => {
    const k = `${sport}/${l.key}`;
    const on = favs.leagues.includes(k);
    return (
      <Row key={l.key} last={i === n - 1} onPress={() => openIdx(l)}>
        <Logo uri={null} name={l.name} size={28} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
            {l.name}
          </Text>
          {showCountry ? <Text style={{ color: t.secondary, fontSize: 12 }}>{l.country}</Text> : null}
        </View>
        <Pressable hitSlop={10} onPress={() => toggle('leagues', k)} style={{ marginRight: 10 }}>
          <Ionicons name={on ? 'pin' : 'pin-outline'} size={18} color={on ? t.blue : t.tertiary} />
        </Pressable>
        <Chevron />
      </Row>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* fixed top bar from the sketch: [trophy | news] · title pill · settings, then the sport bar */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
        <Segmented
          options={[
            { key: 'leagues', icon: 'trophy-outline' },
            { key: 'news', icon: 'newspaper-outline' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <Glass radius={23} strong style={{ flex: 1, height: 46, justifyContent: 'center', paddingHorizontal: 14, marginHorizontal: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: '800' }}>{mode === 'news' ? 'News' : 'Leagues'}</Text>
            <Text numberOfLines={1} style={{ color: t.secondary, fontSize: 12.5, fontWeight: '600', marginLeft: 6, flexShrink: 1 }}>
              {mode === 'news' ? sp.name : `${(ready ? idx.total : sp.leagues.length).toLocaleString()} competitions`}
            </Text>
          </View>
        </Glass>
        <GlassCircle icon="settings-outline" onPress={() => nav.push({ name: 'settings' })} />
      </View>
      <View style={{ height: 14 }} />
      <SportBar value={sport} onChange={setSport} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + 20 }} keyboardShouldPersistTaps="handled">
        {mode === 'news' ? (
          <NewsList items={newsItems} />
        ) : (
          <>
            {ready ? (
              <View style={{ paddingHorizontal: 16, marginTop: 4, marginBottom: 6 }}>
                <Glass radius={23} strong style={{ height: 46, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
                  <Ionicons name="search" size={18} color={t.secondary} />
                  <TextInput
                    value={q}
                    onChangeText={setQ}
                    placeholder={`Search ${idx.total.toLocaleString()} competitions or countries`}
                    placeholderTextColor={t.secondary}
                    style={{ flex: 1, height: 44, marginLeft: 8, fontSize: 15.5, color: t.text }}
                    autoCorrect={false}
                  />
                  {q ? <Ionicons name="close-circle" size={18} color={t.tertiary} onPress={() => setQ('')} /> : null}
                </Glass>
              </View>
            ) : null}
            {results ? (
              results.length ? (
                <Card>{results.map((l, i) => leagueRow(l, i, results.length, true))}</Card>
              ) : (
                <Empty icon="search-outline" title="No competitions found" body="Try a country or a shorter name." />
              )
            ) : (
              <>
                {pinned.length ? (
                  <>
                    <SectionTitle>Pinned</SectionTitle>
                    <Card>
                      {pinned.map((p, i) => (
                        <Row key={p.sport + p.slug} last={i === pinned.length - 1} onPress={() => open_(p.sport, p.meta)}>
                          <View style={{ width: 30 }}>
                            <SportIcon name={sportByKey(p.sport).icon} size={20} color={t.secondary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
                              {p.meta.name}
                            </Text>
                            {p.meta.country ? <Text style={{ color: t.secondary, fontSize: 12 }}>{p.meta.country}</Text> : null}
                          </View>
                          <Pressable hitSlop={10} onPress={() => toggle('leagues', `${p.sport}/${p.slug}`)} style={{ marginRight: 10 }}>
                            <Ionicons name="pin" size={18} color={t.blue} />
                          </Pressable>
                          <Chevron />
                        </Row>
                      ))}
                    </Card>
                  </>
                ) : null}
                {idx == null ? <Loading label="Loading every competition…" /> : null}
                {ready && idx.top.length ? (
                  <>
                    <SectionTitle>Popular</SectionTitle>
                    <Card>{idx.top.map((l, i) => leagueRow(l, i, idx.top.length, true))}</Card>
                  </>
                ) : null}
                {ready ? (
                  <>
                    <SectionTitle right={<Text style={{ color: t.secondary, fontSize: 12 }}>{idx.countries.length} countries &amp; regions</Text>}>All competitions</SectionTitle>
                    <Card>
                      {idx.countries.map((c, i) => {
                        const isOpen = !!open[c.slug];
                        return (
                          <View key={c.slug}>
                            <Row last={i === idx.countries.length - 1 && !isOpen} onPress={() => setOpen((o) => ({ ...o, [c.slug]: !o[c.slug] }))}>
                              <Logo uri={null} name={c.name} size={28} />
                              <Text style={{ flex: 1, marginLeft: 10, color: t.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
                                {c.name}
                              </Text>
                              <Text style={{ color: t.secondary, fontSize: 13, marginRight: 8 }}>{c.leagues.length}</Text>
                              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={17} color={t.tertiary} />
                            </Row>
                            {isOpen ? <View style={{ paddingLeft: 14 }}>{c.leagues.map((l, k) => leagueRow(l, k, i === idx.countries.length - 1 ? c.leagues.length : c.leagues.length + 1, false))}</View> : null}
                          </View>
                        );
                      })}
                    </Card>
                  </>
                ) : null}
                {fallback
                  ? byCountry.map(([country, ls]) => (
                      <View key={country}>
                        <SectionTitle>{country}</SectionTitle>
                        <Card>
                          {ls.map((l, i) => {
                            const on = favs.leagues.includes(`${sport}/${l.slug}`);
                            return (
                              <Row key={l.slug} last={i === ls.length - 1} onPress={() => open_(sport, l)}>
                                <Logo uri={null} name={l.name} size={30} />
                                <Text style={{ flex: 1, marginLeft: 10, color: t.text, fontSize: 15, fontWeight: '600' }}>{l.name}</Text>
                                <Pressable hitSlop={10} onPress={() => toggle('leagues', `${sport}/${l.slug}`)} style={{ marginRight: 10 }}>
                                  <Ionicons name={on ? 'pin' : 'pin-outline'} size={18} color={on ? t.blue : t.tertiary} />
                                </Pressable>
                                <Chevron />
                              </Row>
                            );
                          })}
                        </Card>
                      </View>
                    ))
                  : null}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

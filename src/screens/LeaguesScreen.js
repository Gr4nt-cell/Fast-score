import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, TAB_BAR_SPACE } from '../theme';
import { useNav } from '../nav';
import { useStore } from '../store';
import { SPORTS, leagueMeta, sportByKey } from '../sports';
import { news as fetchNews } from '../api/espn';
import { SportBar } from '../components/match';
import { Pressable } from '../components/Touch';
import { Card, Chevron, GlassCircle, LargeHeader, Logo, Row, SectionTitle, Segmented, SportIcon } from '../components/ui';
import { NewsList } from './LeagueScreen';

export default function LeaguesScreen() {
  const t = useTheme();
  const nav = useNav();
  const { settings, favs, toggle } = useStore();
  const [sport, setSport] = useState(settings.sport || 'soccer');
  const [mode, setMode] = useState('leagues');
  const [newsItems, setNews] = useState(null);
  const sp = sportByKey(sport);

  useEffect(() => {
    if (mode !== 'news') return;
    setNews(null);
    const lg = sp.leagues.find((l) => l.top) || sp.leagues[0];
    fetchNews(sport, lg.slug)
      .then(setNews)
      .catch(() => setNews([]));
  }, [mode, sport]); // eslint-disable-line react-hooks/exhaustive-deps

  const pinned = favs.leagues.map((k) => {
    const [s, slug] = k.split('/');
    return { sport: s, slug, meta: leagueMeta(s, slug) };
  });

  const byCountry = useMemo(() => {
    const out = {};
    sp.leagues.forEach((l) => (out[l.country] = out[l.country] || []).push(l));
    return Object.entries(out);
  }, [sp]);

  const open = (s, l) => nav.push({ name: 'league', sport: s, league: l.slug, title: l.name });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <LargeHeader
        title="Leagues"
        left={
          <Segmented
            options={[
              { key: 'leagues', icon: 'trophy-outline' },
              { key: 'news', icon: 'newspaper-outline' },
            ]}
            value={mode}
            onChange={setMode}
          />
        }
        right={<GlassCircle icon="settings-outline" onPress={() => nav.push({ name: 'settings' })} />}
        subtitle={mode === 'news' ? `Latest ${sp.name.toLowerCase()} news` : `${SPORTS.reduce((n, s) => n + s.leagues.length, 0)} competitions across ${SPORTS.length} sports`}
      />
      <View style={{ height: 14 }} />
      <SportBar value={sport} onChange={setSport} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + 20 }}>
      {mode === 'news' ? (
        <NewsList items={newsItems} />
      ) : (
        <>
          {pinned.length ? (
            <>
              <SectionTitle>Pinned</SectionTitle>
              <Card>
                {pinned.map((p, i) => (
                  <Row key={p.sport + p.slug} last={i === pinned.length - 1} onPress={() => open(p.sport, p.meta)}>
                    <View style={{ width: 30 }}>
                      <SportIcon name={sportByKey(p.sport).icon} size={20} color={t.secondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{p.meta.name}</Text>
                      <Text style={{ color: t.secondary, fontSize: 12 }}>{p.meta.country}</Text>
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
          {byCountry.map(([country, ls]) => (
            <View key={country}>
              <SectionTitle>{country}</SectionTitle>
              <Card>
                {ls.map((l, i) => {
                  const on = favs.leagues.includes(`${sport}/${l.slug}`);
                  return (
                    <Row key={l.slug} last={i === ls.length - 1} onPress={() => open(sport, l)}>
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
          ))}
        </>
      )}
      </ScrollView>
    </View>
  );
}

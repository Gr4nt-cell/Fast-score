import React, { useEffect, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { Text } from '../components/Text';
import Constants from 'expo-constants';
import { useTheme } from '../theme';
import { useStore } from '../store';
import { SPORTS } from '../sports';
import { clearCache } from '../api/espn';
import { serverStatus } from '../api/server';
import { diagnose } from '../api/sofascore';
import { ensurePermission, openNotificationSettings, permissionStatus } from '../notify';
import { Card, PushHeader, Row, SectionTitle, Segmented, SportIcon } from '../components/ui';
import { Pressable } from '../components/Touch';

function Toggle({ label, sub, value, onChange, last }) {
  const t = useTheme();
  return (
    <Row last={last}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 15.5, fontWeight: '600' }}>{label}</Text>
        {sub ? <Text style={{ color: t.secondary, fontSize: 12.5, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.green }} />
    </Row>
  );
}

export default function SettingsScreen() {
  const t = useTheme();
  const { settings, setSetting } = useStore();
  const [cleared, setCleared] = useState(false);
  const [server, setServer] = useState(null);
  const [notif, setNotif] = useState(null);
  const [ssTest, setSsTest] = useState(null);
  useEffect(() => {
    permissionStatus().then(setNotif);
  }, []);
  useEffect(() => {
    serverStatus().then(setServer);
  }, []);
  const version = (Constants.expoConfig && Constants.expoConfig.version) || '1.0.0';
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <PushHeader title="Settings" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <SectionTitle>Appearance</SectionTitle>
        <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
          <Segmented
            options={[
              { key: 'system', label: 'System' },
              { key: 'light', label: 'Light' },
              { key: 'dark', label: 'Dark' },
            ]}
            value={settings.theme}
            onChange={(v) => setSetting('theme', v)}
          />
        </View>
        <Card>
          <Toggle label="Liquid Glass" sub="Glass panels with a specular rim. Off uses plain cards." value={settings.glass !== false} onChange={(v) => setSetting('glass', v)} last />
        </Card>

        <SectionTitle>Start on</SectionTitle>
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SPORTS.map((s) => {
              const on = settings.sport === s.key;
              return (
                <Pressable key={s.key} onPress={() => setSetting('sport', s.key)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: on ? t.blue : t.track }}>
                    <SportIcon name={s.icon} size={15} color={on ? '#fff' : t.text} />
                    <Text style={{ marginLeft: 5, color: on ? '#fff' : t.text, fontWeight: '600', fontSize: 13 }}>{s.name}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <SectionTitle>Odds</SectionTitle>
        <Card>
          <Toggle label="Show odds" sub="Bookmaker prices where ESPN carries them" value={settings.showOdds} onChange={(v) => setSetting('showOdds', v)} last={!settings.showOdds} />
          {settings.showOdds ? (
            <View style={{ paddingTop: 12 }}>
              <Segmented
                height={40}
                options={[
                  { key: 'decimal', label: '1.85' },
                  { key: 'fractional', label: '17/20' },
                  { key: 'american', label: '-118' },
                ]}
                value={settings.oddsFormat}
                onChange={(v) => setSetting('oddsFormat', v)}
              />
            </View>
          ) : null}
        </Card>

        <SectionTitle>Notifications</SectionTitle>
        <Card>
          <Toggle
            label="Score notifications"
            sub="Goals, kick-off and full time for matches and teams you follow. Instant while the app is open; checked about every 15 minutes when it's closed."
            value={settings.goalAlerts}
            onChange={async (v) => {
              setSetting('goalAlerts', v);
              if (v) setNotif((await ensurePermission(true)) ? 'granted' : await permissionStatus());
            }}
            last={!settings.goalAlerts || notif === 'granted'}
          />
          {settings.goalAlerts && notif && notif !== 'granted' ? (
            <Row
              last
              onPress={async () => {
                if (notif === 'denied') openNotificationSettings();
                else setNotif((await ensurePermission(true)) ? 'granted' : await permissionStatus());
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.orange, fontSize: 15, fontWeight: '600' }}>Notifications are off for Fast Score</Text>
                <Text style={{ color: t.secondary, fontSize: 12.5, marginTop: 2 }}>{notif === 'denied' ? 'Tap to open the phone’s settings and allow them.' : 'Tap to allow notifications.'}</Text>
              </View>
            </Row>
          ) : null}
        </Card>

        <SectionTitle>Fast Score server</SectionTitle>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, marginRight: 10, backgroundColor: !server ? t.tertiary : server.connected ? t.green : t.orange }} />
            <Text style={{ color: t.text, fontSize: 15.5, fontWeight: '600', flex: 1 }}>{!server ? 'Checking…' : server.connected ? 'Connected' : 'Not connected'}</Text>
          </View>
          <Text style={{ color: t.secondary, fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>
            {!server
              ? ''
              : server.connected
              ? `${(server.events || 0).toLocaleString()} games stored${server.history_since ? ` since ${new Date(server.history_since).toLocaleDateString()}` : ''} · ${server.live_now || 0} live now · last sync ${server.last_sync ? new Date(server.last_sync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}`
              : 'The app is fetching from ESPN directly. Everything still works; the server adds a shared cache and match history.'}
          </Text>
        </Card>
        <SectionTitle>Data source</SectionTitle>
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <Segmented
            options={[
              { key: 'auto', label: 'Auto' },
              { key: 'sofascore', label: 'Sofa' },
              { key: 'espn', label: 'ESPN' },
              { key: 'tsdb', label: 'TSDB' },
            ]}
            value={settings.source || 'auto'}
            onChange={(v) => setSetting('source', v)}
          />
        </View>
        <Text style={{ color: t.secondary, fontSize: 12.5, marginHorizontal: 22, marginBottom: 14, lineHeight: 18 }}>
          Auto tries SofaScore first (every league worldwide, live minute, lineups, stats, odds), then ESPN (plus news and win probability), then TheSportsDB, switching by itself when one can't be reached. SofaScore isn't an official API and may refuse requests at times; the app then moves on to ESPN.
        </Text>
        <Card>
          <Row
            last={!ssTest}
            onPress={async () => {
              setSsTest('running');
              try {
                setSsTest(await diagnose());
              } catch (e) {
                setSsTest([{ route: 'test', status: 0, events: null, sample: String(e.message || e) }]);
              }
            }}
          >
            <Text style={{ color: t.blue, fontSize: 15.5, fontWeight: '600', flex: 1 }}>Test SofaScore connection</Text>
            {ssTest === 'running' ? <Text style={{ color: t.secondary }}>Testing… (up to a minute)</Text> : null}
          </Row>
          {Array.isArray(ssTest)
            ? ssTest.map((r, i) => (
                <Row key={r.route} last={i === ssTest.length - 1}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, marginRight: 10, backgroundColor: r.events ? t.green : t.red }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontSize: 14.5, fontWeight: '600' }}>
                      {{ direct: 'Phone → SofaScore', server: 'Your server → SofaScore', browser: 'Hidden browser page' }[r.route] || r.route}
                    </Text>
                    <Text style={{ color: t.secondary, fontSize: 12, marginTop: 2 }}>
                      {r.events ? `Working · ${r.events} football games today · ${r.ms} ms` : `HTTP ${r.status || 'no answer'}${r.events === 0 ? ' · empty' : ''}${r.sample ? ' · ' + r.sample : ''}`}
                    </Text>
                  </View>
                </Row>
              ))
            : null}
        </Card>
        <SectionTitle>Data</SectionTitle>
        <Card>
          <Row
            onPress={async () => {
              await clearCache();
              setCleared(true);
            }}
          >
            <Text style={{ color: t.blue, fontSize: 15.5, fontWeight: '600', flex: 1 }}>Clear cached data</Text>
            {cleared ? <Text style={{ color: t.secondary }}>Cleared</Text> : null}
          </Row>
          <Row last>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 15.5, fontWeight: '600' }}>Data source</Text>
              <Text style={{ color: t.secondary, fontSize: 12.5, marginTop: 2 }}>ESPN's public sports API, with TheSportsDB as backup. Both are free. AI Picks run on your phone.</Text>
            </View>
          </Row>
        </Card>
        <Text style={{ color: t.tertiary, textAlign: 'center', fontSize: 12 }}>Fast Score {version}</Text>
      </ScrollView>
    </View>
  );
}

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Switch, View } from 'react-native';
import { Text } from '../components/Text';
import { ScrollGlowScrollView as ScrollView } from '../components/Glass';
import Constants from 'expo-constants';
import { useTheme } from '../theme';
import { useStore } from '../store';
import { SPORTS } from '../sports';
import { clearCache } from '../api/espn';
import { fixtureBoardCache } from '../api/fixtureBoardStore';
import { serverStatus } from '../api/server';
import { ensurePermission, openNotificationSettings, permissionStatus, sendTestNotification } from '../notify';
import { ALERT_KINDS, alertOn, askBatteryUnrestricted, askExactAlarms, batteryUnrestricted, exactAlarmsAllowed, liveAvailable, playTone } from '../live';
import { AppState, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LANGUAGES } from '../i18n';
import { useNav } from '../nav';
import { LanguageWheel } from '../components/LanguageWheel';
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
  const [testNotificationStatus, setTestNotificationStatus] = useState('');
  const [testingNotification, setTestingNotification] = useState(false);
  const [battery, setBattery] = useState(batteryUnrestricted());
  const [alarms, setAlarms] = useState(exactAlarmsAllowed());
  useEffect(() => {
    permissionStatus().then(setNotif);
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      setBattery(batteryUnrestricted());
      setAlarms(exactAlarmsAllowed());
      permissionStatus().then(setNotif);
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    serverStatus().then(setServer);
  }, []);
  const [langOpen, setLangOpen] = useState(false);
  const nav = useNav();
  const curLang = LANGUAGES.find((l) => l.code === (settings.language || 'system')) || LANGUAGES[0];
  const version = (Constants.expoConfig && Constants.expoConfig.version) || '1.0.0';
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <PushHeader title="Settings" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <SectionTitle>Language</SectionTitle>
        <Card>
          <Row last onPress={() => setLangOpen(true)}>
            <Ionicons name="language-outline" size={20} color={t.blue} style={{ marginRight: 12 }} />
            <Text style={{ color: t.text, fontSize: 15.5, fontWeight: '500', flex: 1 }}>Language</Text>
            <Text style={{ color: t.secondary, fontSize: 15, marginRight: 6 }}>{curLang.code === 'system' ? 'System language' : curLang.native}</Text>
            <Ionicons name="chevron-forward" size={18} color={t.tertiary} />
          </Row>
        </Card>
        <LanguageWheel
          visible={langOpen}
          value={settings.language || 'system'}
          onClose={() => setLangOpen(false)}
          onDone={(code) => {
            setLangOpen(false);
            if (code !== (settings.language || 'system')) setTimeout(() => setSetting('language', code), 250);
          }}
        />

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
          <Toggle label="Liquid Glass" sub="Soft refracted panels with a polished edge. Off uses plain cards." value={settings.glass !== false} onChange={(v) => setSetting('glass', v)} last />
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
            sub="Kick-off, goals, half-time and full time for matches and teams you follow, within about 30 seconds, even with the app closed. While a followed match is on, its live score sits in your notifications."
            value={settings.goalAlerts}
            onChange={async (v) => {
              setSetting('goalAlerts', v);
              if (v) setNotif((await ensurePermission(true)) ? 'granted' : await permissionStatus());
            }}
            last={!settings.goalAlerts || (notif === 'granted' && ((battery && alarms) || !liveAvailable()))}
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
          {settings.goalAlerts && notif === 'granted' && liveAvailable() && !alarms ? (
            <Row last={battery} onPress={() => askExactAlarms()}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.orange, fontSize: 15, fontWeight: '600' }}>Allow alarms for kick-off</Text>
                <Text style={{ color: t.secondary, fontSize: 12.5, marginTop: 2 }}>Turn on "Alarms & reminders" for Fast Score so live alerts start right at kick-off.</Text>
              </View>
            </Row>
          ) : null}
          {settings.goalAlerts && notif === 'granted' && liveAvailable() && !battery ? (
            <Row last onPress={() => askBatteryUnrestricted()}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.orange, fontSize: 15, fontWeight: '600' }}>Let live alerts run in the background</Text>
                <Text style={{ color: t.secondary, fontSize: 12.5, marginTop: 2 }}>Tap, find Fast Score and choose "Don't optimise" / "Allow", so the battery saver doesn't pause alerts during a match. On OPPO / realme also set its battery use to "Allow background activity".</Text>
              </View>
            </Row>
          ) : null}
        </Card>

        {settings.goalAlerts ? (
          <>
            <SectionTitle>Alert tones</SectionTitle>
            <Card>
              {ALERT_KINDS.map((k) => {
                const on = alertOn(settings, k.key);
                return (
                  <Row key={k.key} last={false}>
                    {k.key === 'redcard' ? (
                      <View style={{ width: 14, height: 18, borderRadius: 3, backgroundColor: t.red, marginLeft: 3, marginRight: 15 }} />
                    ) : (
                      <Ionicons name={k.icon} size={20} color={t.blue} style={{ marginRight: 12 }} />
                    )}
                    <Text style={{ color: t.text, fontSize: 15.5, fontWeight: '500', flex: 1 }}>{k.label}</Text>
                    <Pressable
                      hitSlop={8}
                      onPress={async () => {
                        if (!(await playTone(k.key))) setTestNotificationStatus('Sound preview is unavailable in this build. Try the test notification below.');
                      }}
                      style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.fill, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}
                    >
                      <Ionicons name="play" size={15} color={t.blue} style={{ marginLeft: 2 }} />
                    </Pressable>
                    <Switch value={on} onValueChange={(v) => setSetting('alerts', { ...(settings.alerts || {}), [k.key]: v })} trackColor={{ true: t.green }} />
                  </Row>
                );
              })}
              <Row
                last
                onPress={async () => {
                  if (testingNotification) return;
                  setTestingNotification(true);
                  setTestNotificationStatus('Sending test notification…');
                  try {
                    const result = await sendTestNotification();
                    const channelHealth = result.channelHealth;
                    const diagnostics = result.diagnostics;
                    setTestNotificationStatus(
                      diagnostics?.notificationsEnabled === false
                        ? 'Android has notifications disabled for Fast Score. Open the goal alert channel settings and enable notifications.'
                        : diagnostics?.channelImportance === 0
                          ? 'Android has blocked the goal alert channel. Set it to High in the channel settings.'
                          : diagnostics?.channelSoundEnabled === false
                            ? 'Android has muted the goal alert channel. Enable sound in the channel settings.'
                            : diagnostics?.channelImportance > 0 && diagnostics.channelImportance < 4
                              ? 'Android has lowered the goal alert channel. Set it to High to show pop-ups.'
                              : result.ok && channelHealth?.soundEnabled === true && channelHealth?.highImportance === true
                                ? 'Android posted the test on the High channel. If no sound or pop-up appeared, check Do Not Disturb and phone volume.'
                                : result.ok
                                  ? 'Android posted the test. Check the notification shade and channel settings.'
                                  : result.reason === 'permission'
                                    ? 'Allow notifications for Fast Score, then try again.'
                                    : `Android could not post the test (${diagnostics?.error || result.reason || 'unknown error'}). Open channel settings and retry.`
                    );
                  } catch (error) {
                    setTestNotificationStatus(`The test failed (${error?.message || 'unknown error'}). You can still use the app; open channel settings and retry.`);
                  } finally {
                    setTestingNotification(false);
                  }
                }}
              >
                <Ionicons name="notifications-outline" size={20} color={t.blue} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 15.5, fontWeight: '500' }}>Send test notification</Text>
                  <Text style={{ color: t.secondary, fontSize: 12.5, marginTop: 2 }}>
                    {testNotificationStatus || 'Check Android notification sound and pop-up delivery.'}
                  </Text>
                </View>
                {testingNotification ? <ActivityIndicator size="small" color={t.blue} /> : <Ionicons name="chevron-forward" size={18} color={t.tertiary} />}
              </Row>
              {testNotificationStatus ? (
                <Row last onPress={openNotificationSettings}>
                  <Ionicons name="settings-outline" size={20} color={t.blue} style={{ marginRight: 12 }} />
                  <Text style={{ color: t.text, fontSize: 15.5, fontWeight: '500', flex: 1 }}>Open phone notification settings</Text>
                  <Ionicons name="chevron-forward" size={18} color={t.tertiary} />
                </Row>
              ) : null}
            </Card>
            <Text style={{ color: t.secondary, fontSize: 12.5, marginHorizontal: 20, marginTop: -6, marginBottom: 14, lineHeight: 17 }}>
              Tap ▶ to hear a tone. Line-up alerts come about an hour before kick-off for followed football matches. You can also change each sound in your phone's notification settings.
            </Text>
          </>
        ) : null}

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
        <SectionTitle>Data</SectionTitle>
        <Card>
          <Row
            last
            onPress={async () => {
              await clearCache();
              await fixtureBoardCache.clear();
              setCleared(true);
            }}
          >
            <Text style={{ color: t.blue, fontSize: 15.5, fontWeight: '600', flex: 1 }}>Clear cached data</Text>
            {cleared ? <Text style={{ color: t.secondary }}>Cleared</Text> : null}
          </Row>
        </Card>
        <SectionTitle>About</SectionTitle>
        <Card>
          <Row onPress={() => nav.push({ name: 'article', url: 'https://fast-score.gstephen116.workers.dev/privacy', title: 'Privacy policy' })}>
            <Text style={{ color: t.blue, fontSize: 15.5, fontWeight: '600', flex: 1 }}>Privacy policy</Text>
          </Row>
          <Row last onPress={() => nav.push({ name: 'article', url: 'https://fast-score.gstephen116.workers.dev/child-safety', title: 'Child safety standards' })}>
            <Text style={{ color: t.blue, fontSize: 15.5, fontWeight: '600', flex: 1 }}>Child safety standards</Text>
          </Row>
        </Card>
        <Text style={{ color: t.tertiary, textAlign: 'center', fontSize: 12 }}>Fast Score {version}</Text>
      </ScrollView>
    </View>
  );
}

// Real phone notifications for followed matches and teams.
import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { favMatch } from './components/match';
import { tr } from './i18n';

const CHANNEL = 'scores';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let channelReady = null;
function channel() {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!channelReady) {
    channelReady = Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Goals and results',
      description: 'Goals, kick-offs and full time for matches and teams you follow',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#0A84FF',
      sound: 'default',
    }).catch(() => {});
  }
  return channelReady;
}

/** 'granted' | 'denied' | 'undetermined' */
export async function permissionStatus() {
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.granted ? 'granted' : p.canAskAgain === false ? 'denied' : p.status || 'undetermined';
  } catch {
    return 'undetermined';
  }
}

/** Asks once if needed; true when notifications may be shown. */
export async function ensurePermission(ask = true) {
  await channel();
  const s = await permissionStatus();
  if (s === 'granted') return true;
  if (!ask || s === 'denied') return false;
  try {
    const r = await Notifications.requestPermissionsAsync();
    return !!(r.granted || r.status === 'granted');
  } catch {
    return false;
  }
}

export const openNotificationSettings = () => Linking.openSettings().catch(() => {});

function text(ev) {
  const r = rawText(ev);
  return { title: tr(r.title), body: r.body };
}

function rawText(ev) {
  const m = ev.match;
  const score = `${m.home.short || m.home.name} ${m.home.score ?? 0}–${m.away.score ?? 0} ${m.away.short || m.away.name}`;
  const where = [m.state === 'in' ? m.short : null, m.leagueName].filter(Boolean).join(' · ');
  if (ev.kind === 'score') return { title: `${m.sport === 'soccer' ? '⚽ ' : ''}${ev.title}${ev.scorer ? ' ' + (ev.scorer.short || ev.scorer.name) : ''}`, body: `${score}${where ? '  ·  ' + where : ''}` };
  if (ev.kind === 'start') return { title: `${ev.title}: ${m.home.short || m.home.name} v ${m.away.short || m.away.name}`, body: m.leagueName || '' };
  return { title: `${ev.title}: ${score}`, body: m.leagueName || '' };
}

export async function notifyEvent(ev) {
  if (!(await ensurePermission(false))) return;
  await channel();
  const { title, body } = text(ev);
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: 'default', data: { match: favMatch(ev.match) } },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
    });
  } catch {}
}

/** Calls onOpen(match) when a score notification is tapped (also for the one that opened the app). */
export function onNotificationTap(onOpen) {
  const handle = (resp) => {
    const m = resp && resp.notification && resp.notification.request.content.data && resp.notification.request.content.data.match;
    if (m) onOpen(m);
  };
  Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}

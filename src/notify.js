// Real phone notifications for followed matches and teams.
import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { favMatch } from './components/match';
import { tr } from './i18n';

// Android retains channel settings between app upgrades; version channel IDs when repairing them.
const CHANNEL = 'scores_v3';

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
    }).catch((error) => {
      console.warn('[Fast Score] Could not create the default notification channel', error);
      channelReady = null;
    });
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

// one channel per kind of alert, each with its own tone (same ids as the live service uses)
const KIND_CHANNELS = {
  goal: 'Goals',
  kickoff: 'Kick-off',
  halftime: 'Half-time',
  fulltime: 'Full-time',
  redcard: 'Red cards',
  lineups: 'Line-ups',
};
const kindReady = {};
function kindChannel(kind) {
  const id = `ev_${kind}_v3`;
  if (Platform.OS !== 'android') return Promise.resolve(id);
  if (!kindReady[kind]) {
    kindReady[kind] = Notifications.setNotificationChannelAsync(id, {
      name: KIND_CHANNELS[kind] || kind,
      description: 'Alerts for matches and teams you follow',
      importance: kind === 'lineups' ? Notifications.AndroidImportance.DEFAULT : Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#0A84FF',
      sound: `fs_${kind}.wav`,
    })
      .then(() => id)
      .catch((error) => {
        console.warn(`[Fast Score] Could not create the ${kind} notification channel`, error);
        kindReady[kind] = null;
        return CHANNEL;
      });
  }
  return kindReady[kind];
}

export async function notifyEvent(ev, kind) {
  if (!(await ensurePermission(false))) return false;
  const alertKind = kind && KIND_CHANNELS[kind] ? kind : null;
  const channelId = alertKind ? await kindChannel(alertKind) : CHANNEL;
  const defaultSoundFallback = Platform.OS === 'android' && alertKind && channelId === CHANNEL;
  const { title, body } = text(ev);
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: alertKind && !defaultSoundFallback ? `fs_${alertKind}.wav` : 'default',
        data: { match: favMatch(ev.match) },
      },
      trigger: Platform.OS === 'android' ? { channelId } : null,
    });
    return true;
  } catch (error) {
    console.warn('[Fast Score] Could not schedule a match notification', error);
    return false;
  }
}

/** Sends a real goal-tone notification so users can verify permission and sound. */
export async function sendTestNotification() {
  if (!(await ensurePermission(true))) return { ok: false, reason: 'permission' };
  const kind = 'goal';
  const channelId = await kindChannel(kind);
  const defaultSoundFallback = Platform.OS === 'android' && channelId === CHANNEL;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Fast Score test notification',
        body: 'Notifications are enabled. This tests the goal alert sound.',
        sound: defaultSoundFallback ? 'default' : 'fs_goal.wav',
      },
      trigger: Platform.OS === 'android' ? { channelId } : null,
    });
    return { ok: true };
  } catch (error) {
    console.warn('[Fast Score] Could not schedule a test notification', error);
    return { ok: false, reason: 'schedule' };
  }
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

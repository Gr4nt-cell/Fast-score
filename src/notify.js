// Real phone notifications for followed matches and teams.
import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { favMatch } from './components/match';
import { tr } from './i18n';
import FastLive from '../modules/fast-live';

// Android keeps a channel's sound settings across app upgrades, even if the app
// changes its configuration. Bump this when repairing channel behavior.
const CHANNEL = 'scores_v6';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
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

export const openNotificationSettings = () => {
  try {
    if (Platform.OS === 'android' && FastLive?.openGoalNotificationSettings) {
      return FastLive.openGoalNotificationSettings();
    }
  } catch {}
  return Linking.openSettings().catch(() => {});
};

const channelTrigger = (channelId) => ({
  channelId,
});

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
  const id = `ev_${kind}_v6`;
  if (Platform.OS !== 'android') return Promise.resolve(id);
  if (!kindReady[kind]) {
    kindReady[kind] = Notifications.setNotificationChannelAsync(id, {
      name: KIND_CHANNELS[kind] || kind,
      description: 'Alerts for matches and teams you follow',
      importance: kind === 'lineups' ? Notifications.AndroidImportance.DEFAULT : Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#0A84FF',
      sound: 'default',
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

async function getChannelHealth(channelId) {
  if (Platform.OS !== 'android') return null;
  try {
    const channel = await Notifications.getNotificationChannelAsync(channelId);
    if (!channel) return null;
    return {
      soundEnabled: channel.sound != null,
      highImportance:
        typeof channel.importance === 'number'
          ? channel.importance >= Notifications.AndroidImportance.HIGH
          : null,
    };
  } catch {
    return null;
  }
}

async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function notifyEvent(ev, kind) {
  if (!(await ensurePermission(false))) return false;
  const alertKind = kind && KIND_CHANNELS[kind] ? kind : null;
  const channelId = alertKind ? await kindChannel(alertKind) : CHANNEL;
  const { title, body } = text(ev);
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: Platform.OS === 'android' || !alertKind ? 'default' : `fs_${alertKind}.wav`,
        priority:
          alertKind === 'lineups'
            ? Notifications.AndroidNotificationPriority.DEFAULT
            : Notifications.AndroidNotificationPriority.HIGH,
        data: { match: favMatch(ev.match) },
      },
      trigger: Platform.OS === 'android' ? channelTrigger(channelId) : null,
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
  if (Platform.OS === 'android' && FastLive?.testNotification) {
    try {
      const raw = await withTimeout(FastLive.testNotification(), 8000);
      const diagnostics = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const channelId = diagnostics?.channelId || (await kindChannel(kind));
      const channelHealth = await getChannelHealth(channelId);
      return {
        ok: !!diagnostics?.posted,
        reason: diagnostics?.error || (diagnostics?.posted ? null : 'native'),
        channelHealth: {
          ...channelHealth,
          soundEnabled: diagnostics?.channelSoundEnabled ?? channelHealth?.soundEnabled,
          highImportance:
            typeof diagnostics?.channelImportance === 'number'
              ? diagnostics.channelImportance >= Notifications.AndroidImportance.HIGH
              : channelHealth?.highImportance,
        },
        diagnostics,
      };
    } catch (error) {
      console.warn('[Fast Score] Could not post a native test notification', error);
      return { ok: false, reason: error?.message === 'timeout' ? 'timeout' : 'native' };
    }
  }

  const channelId = await kindChannel(kind);
  const channelHealth = await getChannelHealth(channelId);
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Fast Score test notification',
        body: 'This checks notification delivery and sound.',
        sound: Platform.OS === 'android' ? 'default' : 'fs_goal.wav',
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: Platform.OS === 'android' ? channelTrigger(channelId) : null,
    });
    return { ok: true, channelHealth, diagnostics: null };
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

// Checks followed matches while the app is closed. Android runs this through WorkManager about
// every 15 minutes (the shortest interval it allows); some phone makers delay it further to
// save battery.
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { load } from './store';
import { checkFollowed } from './watch';
import { notifyEvent } from './notify';
import { alertOn, syncLive, toneKind, trackedKeys } from './live';

export const TASK = 'fastscore-follow';

TaskManager.defineTask(TASK, async () => {
  try {
    const settings = await load('settings', {});
    if (settings && settings.goalAlerts === false) return BackgroundTask.BackgroundTaskResult.Success;
    const favs = await load('favs', null);
    const tracked = trackedKeys();
    await checkFollowed(favs, (ev) => {
      const kind = toneKind(ev);
      if (tracked.has(ev.match.key) || (kind && !alertOn(settings, kind))) return null;
      return notifyEvent(ev, kind);
    });
    // followed teams' new fixtures -> the live-alert service
    await syncLive(favs, true);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function setBackgroundChecks(on) {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(TASK);
    if (on && !registered) await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
    if (!on && registered) await BackgroundTask.unregisterTaskAsync(TASK);
  } catch {}
}

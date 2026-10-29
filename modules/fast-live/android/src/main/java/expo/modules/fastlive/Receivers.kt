package expo.modules.fastlive

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** The alarm set for a few minutes before a followed kick-off. */
class LiveAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!Live.enabled(context)) return
    if (Live.due(context).isNotEmpty()) Live.startService(context) else Live.kick(context)
  }
}

/** Alarms are lost on reboot and app updates: set them again. */
class LiveBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val next = Live.nextWake(context)
    if (Live.enabled(context)) {
      if (Live.due(context).isNotEmpty()) Live.scheduleAt(context, System.currentTimeMillis() + 30 * 1000L)
      else if (next != null) Live.scheduleAt(context, next)
    }
  }
}

package expo.modules.fastlive

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FastLiveModule : Module() {
  private val ctx: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No context")

  override fun definition() = ModuleDefinition {
    Name("FastLive")

    Events("onTap")

    /** Replace the list of followed matches (JSON array) and start/schedule the tracker. */
    Function("sync") { json: String ->
      Live.saveItems(ctx, json)
      Live.kick(ctx)
      true
    }

    Function("setEnabled") { on: Boolean ->
      Live.setEnabled(ctx, on)
      Live.kick(ctx)
      true
    }

    Function("isRunning") { LiveService.running }

    /** Which kinds of alert are on, as JSON {"goal":true,...}. */
    Function("setAlerts") { json: String ->
      Live.setAlerts(ctx, json)
      Live.channels(ctx) // so each tone shows up in the phone's notification settings
      Live.kick(ctx)
      true
    }

    /** Play an alert tone: goal, kickoff, halftime, fulltime, redcard, lineups. */
    Function("playTone") { kind: String -> Live.playTone(ctx, kind) }

    /** Only matches the running live service is polling; others need the background fallback. */
    Function("trackedKeys") {
      if (LiveService.running) Live.due(ctx).map { it.key } else emptyList<String>()
    }

    /** The match of a tapped alert that opened the app, once. */
    Function("consumeTap") {
      val act = appContext.currentActivity
      val intent = act?.intent
      val tap = intent?.getStringExtra(Live.EXTRA_TAP)
      if (tap != null) intent.removeExtra(Live.EXTRA_TAP)
      tap
    }

    Function("canExactAlarms") {
      if (Build.VERSION.SDK_INT < 31) true
      else (ctx.getSystemService(android.app.AlarmManager::class.java)?.canScheduleExactAlarms() ?: false)
    }

    Function("isIgnoringBattery") {
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(ctx.packageName)
    }

    /** Open the phone's battery-optimisation list so the user can exempt the app (no special permission needed). */
    Function("requestIgnoreBattery") {
      try {
        val i = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(i)
        true
      } catch (e: Exception) {
        try {
          val i = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))
          i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          ctx.startActivity(i)
          true
        } catch (e2: Exception) {
          false
        }
      }
    }

    /** Android 12+: "Alarms & reminders" lets the tracker wake exactly before kick-off. */
    Function("requestExactAlarms") {
      if (Build.VERSION.SDK_INT < 31) return@Function true
      try {
        val i = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${ctx.packageName}"))
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(i)
        true
      } catch (e: Exception) {
        false
      }
    }

    OnNewIntent { intent ->
      val tap = intent.getStringExtra(Live.EXTRA_TAP)
      if (tap != null) {
        intent.removeExtra(Live.EXTRA_TAP)
        sendEvent("onTap", mapOf("match" to tap))
      }
    }
  }
}

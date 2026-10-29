package expo.modules.fastlive

import android.app.Notification
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager

/**
 * Runs only while a followed match is about to start or under way. Shows the live score in a
 * quiet pinned notification and posts a real alert for kick-off, goals, half-time and full time.
 * Stops itself when nothing is on and sets an alarm for the next followed kick-off.
 */
class LiveService : Service() {
  private var thread: HandlerThread? = null
  private var handler: Handler? = null
  private var wake: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    running = true
    Live.channels(this)
    thread = HandlerThread("fastlive").also { it.start() }
    handler = Handler(thread!!.looper)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    goForeground(ongoing("Live alerts on", "Checking your matches…"))
    handler?.removeCallbacksAndMessages(null)
    handler?.post { tick() }
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    handler?.removeCallbacksAndMessages(null)
    thread?.quitSafely()
    try {
      wake?.let { if (it.isHeld) it.release() }
    } catch (e: Exception) {}
    super.onDestroy()
  }

  override fun onTimeout(startId: Int, fgsType: Int) {
    finish()
  }

  private fun goForeground(n: Notification) {
    try {
      if (Build.VERSION.SDK_INT >= 34) startForeground(ONGOING_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      else startForeground(ONGOING_ID, n)
    } catch (e: Exception) {
      stopSelf()
    }
  }

  private fun ongoing(title: String, text: String): Notification {
    val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, Live.CH_LIVE) else Notification.Builder(this)
    return b.setSmallIcon(Live.smallIcon(this))
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(Notification.BigTextStyle().bigText(text))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setContentIntent(Live.openApp(this, null, 1))
      .build()
  }

  private fun alert(item: Item, title: String, text: String) {
    if (Live.appInForeground()) return // the app shows its own banner
    val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, Live.CH_SCORES) else Notification.Builder(this)
    @Suppress("DEPRECATION")
    val n = b.setSmallIcon(Live.smallIcon(this))
      .setContentTitle(title)
      .setContentText(text)
      .setAutoCancel(true)
      .setCategory(Notification.CATEGORY_EVENT)
      .setPriority(Notification.PRIORITY_HIGH)
      .setDefaults(Notification.DEFAULT_ALL)
      .setContentIntent(Live.openApp(this, item.tap, item.key.hashCode()))
      .build()
    try {
      getSystemService(NotificationManager::class.java).notify(item.key.hashCode() + (System.currentTimeMillis() / 1000 % 1000).toInt(), n)
    } catch (e: Exception) {}
  }

  private fun finish() {
    val next = Live.nextWake(this)
    if (next != null && Live.enabled(this)) Live.scheduleAt(this, next)
    try {
      wake?.let { if (it.isHeld) it.release() }
    } catch (e: Exception) {}
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun tick() {
    if (!Live.enabled(this)) return finish()
    val due = Live.due(this)
    if (due.isEmpty()) return finish()
    // keep the CPU awake between checks while a match is on (renewed every check, so it lapses
    // by itself if anything goes wrong); without it the phone's deep sleep would delay alerts
    val wl = wake ?: (getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "fastscore:live").also {
      it.setReferenceCounted(false)
      wake = it
    }
    wl.acquire(3 * 60 * 1000L)
    val lines = ArrayList<String>()
    var anyLive = false
    try {
      for (it in due) {
        val now = Live.poll(it) ?: continue
        val before = Live.snap(this, it.key)
        Live.saveSnap(this, it.key, now)
        val score = "${it.home} ${now.hs.ifEmpty { "0" }}–${now.aws.ifEmpty { "0" }} ${it.away}"
        val ball = if (it.sport == "soccer") "⚽ " else ""
        if (now.state == "in") {
          anyLive = true
          lines.add("$score · ${now.clock}")
        }
        if (before == null) {
          // first look: only announce if it just kicked off
          if (now.state == "in" && System.currentTimeMillis() - it.date < 5 * 60 * 1000L) alert(it, "Kick-off: ${it.home} v ${it.away}", it.league)
          continue
        }
        if (before.state == "pre" && now.state == "in") {
          alert(it, if (it.sport == "soccer") "Kick-off: ${it.home} v ${it.away}" else "Started: ${it.home} v ${it.away}", it.league)
        }
        if (now.state != "pre" && (now.hs != before.hs || now.aws != before.aws) && before.state != "pre") {
          val hUp = (now.hs.toIntOrNull() ?: 0) > (before.hs.toIntOrNull() ?: 0)
          val aUp = (now.aws.toIntOrNull() ?: 0) > (before.aws.toIntOrNull() ?: 0)
          val who = if (hUp && !aUp) " ${it.home}" else if (aUp && !hUp) " ${it.away}" else ""
          val head = if (it.sport == "soccer") "GOAL!$who" else "Score update"
          if (it.sport == "soccer" || now.state == "post") alert(it, "$ball$head", "$score${if (now.clock.isNotEmpty()) " · " + now.clock else ""} · ${it.league}")
        }
        if (now.ht && !before.ht && it.sport == "soccer") alert(it, "Half-time: $score", it.league)
        if (before.state == "in" && now.state == "post") alert(it, "${if (it.sport == "soccer") "Full time" else "Final"}: $score", it.league)
      }
    } catch (e: Exception) {}
    val waiting = due.filter { Live.snap(this, it.key)?.state != "in" && !Live.finished(this, it) }
    val text = if (lines.isNotEmpty()) lines.joinToString("\n") else waiting.joinToString("\n") { "${it.home} v ${it.away} · starts soon" }
    val title = if (anyLive) "Live now" else "Live alerts on"
    try {
      getSystemService(NotificationManager::class.java).notify(ONGOING_ID, ongoing(title, text.ifEmpty { "Watching your matches" }))
    } catch (e: Exception) {}
    if (Live.due(this).isEmpty()) return finish()
    handler?.postDelayed({ tick() }, if (anyLive) 30 * 1000L else 60 * 1000L)
  }

  companion object {
    const val ONGOING_ID = 7100
    @Volatile var running = false
  }
}

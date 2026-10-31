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
 * quiet pinned notification and posts alerts (each kind with its own tone) for line-ups,
 * kick-off, goals, red cards, half-time and full time.
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

  private fun alert(item: Item, kind: String, title: String, text: String) = Live.alert(this, item, kind, title, text)

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
        val raw = Live.poll(it) ?: continue
        val before = Live.snap(this, it.key)
        // line-ups once out stay out; red cards keep the last known count if the incidents feed didn't answer
        val now = raw.copy(li = raw.li || before?.li == true, reds = raw.reds.ifEmpty { before?.reds ?: "" })
        Live.saveSnap(this, it.key, now)
        val score = "${it.home} ${now.hs.ifEmpty { "0" }}–${now.aws.ifEmpty { "0" }} ${it.away}"
        val ball = if (it.sport == "soccer") "⚽ " else ""
        if (now.state == "in") {
          anyLive = true
          lines.add("$score · ${now.clock}")
        }
        if (before == null) {
          // first look: only announce if it just kicked off
          if (now.state == "in" && System.currentTimeMillis() - it.date < 5 * 60 * 1000L) alert(it, "kickoff", "Kick-off: ${it.home} v ${it.away}", it.league)
          continue
        }
        if (now.li && !before.li && now.state == "pre" && it.sport == "soccer") {
          alert(it, "lineups", "Line-ups are out: ${it.home} v ${it.away}", it.league)
        }
        if (before.state == "pre" && now.state == "in") {
          alert(it, "kickoff", if (it.sport == "soccer") "Kick-off: ${it.home} v ${it.away}" else "Started: ${it.home} v ${it.away}", it.league)
        }
        if (now.state != "pre" && (now.hs != before.hs || now.aws != before.aws) && before.state != "pre") {
          val hUp = (now.hs.toIntOrNull() ?: 0) > (before.hs.toIntOrNull() ?: 0)
          val aUp = (now.aws.toIntOrNull() ?: 0) > (before.aws.toIntOrNull() ?: 0)
          val who = if (hUp && !aUp) " ${it.home}" else if (aUp && !hUp) " ${it.away}" else ""
          val by = if (it.sport == "soccer" && now.scorer.isNotEmpty() && (hUp || aUp)) " · ${now.scorer}" else ""
          val head = if (it.sport == "soccer") "GOAL!$who" else "Score update"
          if (it.sport == "soccer" || now.state == "post") alert(it, "goal", "$ball$head", "$score${if (now.clock.isNotEmpty()) " · " + now.clock else ""}$by · ${it.league}")
        }
        if (it.sport == "soccer" && now.state == "in" && before.reds.isNotEmpty() && now.reds.isNotEmpty()) {
          val (rh0, ra0) = before.reds.split(":").map { x -> x.toIntOrNull() ?: 0 }.let { x -> (x.getOrNull(0) ?: 0) to (x.getOrNull(1) ?: 0) }
          val (rh1, ra1) = now.reds.split(":").map { x -> x.toIntOrNull() ?: 0 }.let { x -> (x.getOrNull(0) ?: 0) to (x.getOrNull(1) ?: 0) }
          if (rh1 > rh0) alert(it, "redcard", "🟥 Red card: ${it.home}", "$score · ${now.clock} · ${it.league}")
          if (ra1 > ra0) alert(it, "redcard", "🟥 Red card: ${it.away}", "$score · ${now.clock} · ${it.league}")
        }
        if (now.ht && !before.ht && it.sport == "soccer") alert(it, "halftime", "Half-time: $score", it.league)
        if (before.state == "in" && now.state == "post") alert(it, "fulltime", "${if (it.sport == "soccer") "Full time" else "Final"}: $score", it.league)
      }
    } catch (e: Exception) {}
    val waiting = due.filter { Live.snap(this, it.key)?.state != "in" && !Live.finished(this, it) }
    val text = if (lines.isNotEmpty()) lines.joinToString("\n") else waiting.joinToString("\n") { "${it.home} v ${it.away} · starts soon" }
    val title = if (anyLive) "Live now" else "Live alerts on"
    try {
      getSystemService(NotificationManager::class.java).notify(ONGOING_ID, ongoing(title, text.ifEmpty { "Watching your matches" }))
    } catch (e: Exception) {}
    if (Live.due(this).isEmpty()) return finish()
    handler?.postDelayed({ tick() }, if (anyLive) 15 * 1000L else 60 * 1000L)
  }

  companion object {
    const val ONGOING_ID = 7100
    @Volatile var running = false
  }
}

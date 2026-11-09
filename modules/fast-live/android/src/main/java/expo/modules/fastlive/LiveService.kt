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
import android.os.SystemClock
import java.util.concurrent.Executors
import java.util.concurrent.ExecutorCompletionService
import java.util.concurrent.TimeUnit
import java.util.concurrent.Future

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
  private val requests = Executors.newFixedThreadPool(4)
  private val detailsAt = HashMap<String, Long>()
  @Volatile private var stopped = false
  private var cursor = 0
  private var pollingStarted = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    Live.channels(this)
    thread = HandlerThread("fastlive").also { it.start() }
    handler = Handler(thread!!.looper)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!goForeground(ongoing("Live alerts on", "Checking your matches…"))) return START_NOT_STICKY
    running = true
    if (!pollingStarted) { pollingStarted = true; handler?.post { tick() } }
    return START_STICKY
  }

  override fun onDestroy() {
    stopped = true
    requests.shutdownNow()
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

  private fun goForeground(n: Notification): Boolean {
    try {
      if (Build.VERSION.SDK_INT >= 34) startForeground(ONGOING_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      else startForeground(ONGOING_ID, n)
      return true
    } catch (e: Exception) {
      stopSelf()
      return false
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
    stopped = true
    running = false
    val next = Live.nextWake(this)
    if (next != null && Live.enabled(this)) Live.scheduleAt(this, next)
    try {
      wake?.let { if (it.isHeld) it.release() }
    } catch (e: Exception) {}
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun process(it: Item, raw: Snap) {
    if (stopped || !Live.enabled(this)) return
    val before = Live.snap(this, it.key)
    // line-ups once out stay out; red cards keep the last known count if the incidents feed didn't answer
    val now = raw.copy(li = raw.li || before?.li == true, reds = raw.reds.ifEmpty { before?.reds ?: "" })
    Live.saveSnap(this, it.key, now)
    val score = "${it.home} ${now.hs.ifEmpty { "0" }}–${now.aws.ifEmpty { "0" }} ${it.away}"
    val ball = if (it.sport == "soccer") "⚽ " else ""
    if (before == null) {
      // first look: only announce if it just kicked off
      if (now.state == "in" && System.currentTimeMillis() - it.date < 5 * 60 * 1000L) alert(it, "kickoff", "Kick-off: ${it.home} v ${it.away}", it.league)
      return
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
      val head = if (!hUp && !aUp) "Score correction" else if (it.sport == "soccer") "GOAL!$who" else "Score update"
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

  private fun tick() {
    if (stopped) return
    if (!Live.enabled(this)) return finish()
    val due = Live.due(this)
    if (due.isEmpty()) return finish()
    val began = SystemClock.elapsedRealtime()
    val wl = wake ?: (getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"fastscore:live").also { it.setReferenceCounted(false); wake=it }
    try { wl.acquire(30000L) } catch (_: Exception) {}
    val completed = ExecutorCompletionService<Pair<Item,Snap?>>(requests)
    val futures = ArrayList<Future<Pair<Item,Snap?>>>()
    val batch = LivePollPolicy.batch(due,cursor)
    cursor = (cursor + batch.size) % due.size
    fun submit(item: Item, detail: Snap? = null) {
      futures.add(completed.submit(java.util.concurrent.Callable { item to if(detail==null)Live.poll(item,false) else Live.enrich(item,detail) }))
    }
    try {
      batch.forEach { submit(it) }
      var remaining = futures.size
      while (remaining > 0 && !stopped) {
        val budget = LivePollPolicy.ROUND_BUDGET_MS - (SystemClock.elapsedRealtime()-began)
        if (budget <= 0) break
        val future = completed.poll(budget,TimeUnit.MILLISECONDS) ?: break
        remaining--
        val result = try { future.get() } catch (_: Exception) { continue }
        val item=result.first; val snap=result.second ?: continue
        process(item,snap)
        if (snap.state=="in" && item.sport=="soccer" && began-(detailsAt[item.key] ?: 0L)>=30000L) {
          detailsAt[item.key]=began; submit(item,snap);remaining++
        }
      }
    } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
      catch (_: Exception) {} finally { futures.filter { !it.isDone }.forEach { it.cancel(true) } }
    if(stopped)return
    val lines=due.mapNotNull { item -> Live.snap(this,item.key)?.takeIf{it.state=="in"}?.let { "${item.home} ${it.hs}–${it.aws} ${item.away} · ${it.clock}" } }
    val text=lines.joinToString("\n").ifEmpty { "Watching your matches" }
    try { getSystemService(NotificationManager::class.java).notify(ONGOING_ID,ongoing(if(lines.isNotEmpty())"Live now" else "Live alerts on",text)) } catch (_: Exception) {}
    if(Live.due(this).isEmpty())return finish()
    detailsAt.keys.retainAll(due.map{it.key}.toSet())
    val urgent=lines.isNotEmpty() || due.any{it.date<=System.currentTimeMillis()+120000L}
    val delay=LivePollPolicy.delay(urgent,SystemClock.elapsedRealtime()-began)
    handler?.postDelayed({tick()},delay)
  }

  companion object {
    const val ONGOING_ID = 7100
    @Volatile var running = false
  }
}

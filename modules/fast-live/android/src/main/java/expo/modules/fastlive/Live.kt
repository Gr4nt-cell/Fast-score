package expo.modules.fastlive

import android.app.ActivityManager
import android.app.Notification
import android.media.MediaPlayer
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** One followed match, as handed over by the app. */
data class Item(
  val key: String,
  val src: String, // "fs" or "espn"
  val id: String,
  val fsSport: Int,
  val sport: String,
  val espnPath: String,
  val home: String,
  val away: String,
  val league: String,
  val date: Long,
  val tap: String,
) {
  companion object {
    fun from(o: JSONObject) = Item(
      o.optString("key"), o.optString("src"), o.optString("id"), o.optInt("fsSport", 1), o.optString("sport", "soccer"),
      o.optString("espnPath"), o.optString("home"), o.optString("away"), o.optString("league"), o.optLong("date"), o.optString("tap"),
    )
  }
}

/** What we last saw of a match. `reds` = "home:away" red cards, `li` = line-ups published. */
data class Snap(
  val state: String,
  val hs: String,
  val aws: String,
  val clock: String,
  val ht: Boolean,
  val reds: String = "", // "" = unknown
  val li: Boolean = false,
  val scorer: String = "", // not stored: who scored the latest goal, when known
)

object Live {
  private const val PREFS = "fastlive"
  const val CH_SCORES = "scores_v5"
  const val CH_LIVE = "live-tracker"
  const val EXTRA_TAP = "fastlive_match"
  const val LEAD_MS = 10 * 60 * 1000L       // wake this long before kick-off
  const val LINEUPS_MS = 75 * 60 * 1000L    // start looking for line-ups this long before kick-off

  // one notification channel (and tone) per kind of event
  val KINDS = listOf("goal", "kickoff", "halftime", "fulltime", "redcard", "lineups")
  private val KIND_NAMES = mapOf(
    "goal" to "Goals", "kickoff" to "Kick-off", "halftime" to "Half-time", "fulltime" to "Full-time", "redcard" to "Red cards", "lineups" to "Line-ups",
  )
  fun channelOf(kind: String) = "ev_${kind}_v5"

  /** Which kinds of alert the user wants (Settings -> Alert tones); all on by default. */
  fun kindOn(ctx: Context, kind: String): Boolean {
    return try {
      JSONObject(prefs(ctx).getString("alerts", "{}") ?: "{}").optBoolean(kind, true)
    } catch (e: Exception) {
      true
    }
  }
  fun setAlerts(ctx: Context, json: String) = prefs(ctx).edit().putString("alerts", json).apply()

  fun toneUri(ctx: Context, kind: String): Uri? {
    val id = ctx.resources.getIdentifier("fs_$kind", "raw", ctx.packageName)
    return if (id != 0) Uri.parse("android.resource://${ctx.packageName}/$id") else null
  }
  const val MAX_MATCH_MS = 6 * 3600 * 1000L  // give up on a match this long after kick-off

  fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun items(ctx: Context): List<Item> {
    val raw = prefs(ctx).getString("items", "[]") ?: "[]"
    return try {
      val a = JSONArray(raw)
      (0 until a.length()).map { Item.from(a.getJSONObject(it)) }
    } catch (e: Exception) {
      emptyList()
    }
  }

  fun saveItems(ctx: Context, json: String) {
    prefs(ctx).edit().putString("items", json).apply()
  }

  fun enabled(ctx: Context) = prefs(ctx).getBoolean("enabled", true)
  fun setEnabled(ctx: Context, on: Boolean) = prefs(ctx).edit().putBoolean("enabled", on).apply()

  fun snap(ctx: Context, key: String): Snap? {
    val s = prefs(ctx).getString("s:$key", null) ?: return null
    val p = s.split("|")
    if (p.size < 5) return null
    return Snap(p[0], p[1], p[2], p[3], p[4] == "1", p.getOrNull(5) ?: "", p.getOrNull(6) == "1")
  }

  fun saveSnap(ctx: Context, key: String, s: Snap) {
    prefs(ctx).edit().putString("s:$key", "${s.state}|${s.hs}|${s.aws}|${s.clock}|${if (s.ht) "1" else "0"}|${s.reds}|${if (s.li) "1" else "0"}").apply()
  }

  /** Followed football matches (Flashscore) in the hour before kick-off whose line-ups we haven't announced. */
  fun lineupsPending(ctx: Context): List<Item> {
    if (!kindOn(ctx, "lineups")) return emptyList()
    val now = System.currentTimeMillis()
    return items(ctx).filter {
      it.src == "fs" && it.sport == "soccer" && it.date - now in 1..LINEUPS_MS && snap(ctx, it.key)?.li != true
    }
  }

  fun finished(ctx: Context, it: Item): Boolean {
    val s = snap(ctx, it.key)
    return (s != null && s.state == "post") || System.currentTimeMillis() - it.date > MAX_MATCH_MS
  }

  /** Matches to watch right now (about to start or under way). */
  fun due(ctx: Context): List<Item> {
    val now = System.currentTimeMillis()
    return items(ctx).filter { it.date - now < 15 * 60 * 1000L && !finished(ctx, it) }
  }

  /** When to wake next: a few minutes from now while waiting for line-ups, else the next kick-off (minus the lead). */
  fun nextWake(ctx: Context): Long? {
    val now = System.currentTimeMillis()
    val lineupsOn = kindOn(ctx, "lineups")
    return items(ctx).filter { !finished(ctx, it) && it.date - LEAD_MS > now }.minOfOrNull {
      val liStart = it.date - LINEUPS_MS
      when {
        !lineupsOn || it.src != "fs" || it.sport != "soccer" || snap(ctx, it.key)?.li == true -> it.date - LEAD_MS
        liStart > now -> liStart
        else -> minOf(now + 5 * 60 * 1000L, it.date - LEAD_MS) // checking for line-ups every 5 minutes
      }
    }
  }

  fun appInForeground(): Boolean {
    val info = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(info)
    return info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }

  fun channels(ctx: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val nm = ctx.getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(CH_SCORES) == null) {
      nm.createNotificationChannel(NotificationChannel(CH_SCORES, "Goals and results", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Goals, kick-offs and full time for matches and teams you follow"
        enableVibration(true)
      })
    }
    val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
    for (k in KINDS) {
      if (nm.getNotificationChannel(channelOf(k)) != null) continue
      nm.createNotificationChannel(NotificationChannel(channelOf(k), KIND_NAMES[k] ?: k, if (k == "lineups") NotificationManager.IMPORTANCE_DEFAULT else NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Alerts for matches and teams you follow"
        enableVibration(true)
        setSound(toneUri(ctx, k) ?: Settings.System.DEFAULT_NOTIFICATION_URI, attrs)
      })
    }
    if (nm.getNotificationChannel(CH_LIVE) == null) {
      nm.createNotificationChannel(NotificationChannel(CH_LIVE, "Live match tracker", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shows the live score while a followed match is on"
        setShowBadge(false)
      })
    }
  }

  /** Android-native test bypassing JS scheduling so channel and OS behavior can be diagnosed. */
  fun testNotification(ctx: Context): String {
    channels(ctx)
    val channelId = channelOf("goal")
    val nm = ctx.getSystemService(NotificationManager::class.java)
    val channel = if (Build.VERSION.SDK_INT >= 26) nm.getNotificationChannel(channelId) else null
    val notificationsEnabled = nm.areNotificationsEnabled()
    val importance = channel?.importance ?: NotificationManager.IMPORTANCE_HIGH
    val soundEnabled = Build.VERSION.SDK_INT < 26 || channel?.sound != null
    var posted = false
    var error = ""

    if (!notificationsEnabled) {
      error = "notifications_disabled"
    } else if (Build.VERSION.SDK_INT >= 26 && importance == NotificationManager.IMPORTANCE_NONE) {
      error = "channel_blocked"
    } else {
      try {
        @Suppress("DEPRECATION")
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(ctx, channelId) else Notification.Builder(ctx)
        builder.setSmallIcon(smallIcon(ctx))
          .setContentTitle("Fast Score test notification")
          .setContentText("This is an Android-native sound and pop-up check.")
          .setCategory(Notification.CATEGORY_EVENT)
          .setPriority(Notification.PRIORITY_HIGH)
          .setAutoCancel(true)
          .setWhen(System.currentTimeMillis())
          .setContentIntent(openApp(ctx, null, 7102))
        if (Build.VERSION.SDK_INT < 26) {
          @Suppress("DEPRECATION")
          builder.setDefaults(Notification.DEFAULT_SOUND or Notification.DEFAULT_VIBRATE)
          toneUri(ctx, "goal")?.let { builder.setSound(it) }
        }
        nm.notify(7102, builder.build())
        posted = true
      } catch (e: SecurityException) {
        error = "permission"
      } catch (e: Exception) {
        error = e.javaClass.simpleName
      }
    }

    return JSONObject()
      .put("posted", posted)
      .put("notificationsEnabled", notificationsEnabled)
      .put("channelId", channelId)
      .put("channelImportance", importance)
      .put("channelSoundEnabled", soundEnabled)
      .put("error", error)
      .toString()
  }

  fun smallIcon(ctx: Context): Int {
    val id = ctx.resources.getIdentifier("notification_icon", "drawable", ctx.packageName)
    return if (id != 0) id else ctx.applicationInfo.icon
  }

  fun openApp(ctx: Context, tap: String?, code: Int): PendingIntent {
    val intent = (ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: Intent()).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      if (!tap.isNullOrEmpty()) putExtra(EXTRA_TAP, tap)
    }
    return PendingIntent.getActivity(ctx, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  // ---------- alerts ----------

  /** Kinds the app shows itself (banner + tone) while it's open, so the phone doesn't double up. */
  private val APP_SHOWS = setOf("goal", "kickoff", "fulltime")

  /** Post an alert of one kind on its own channel (and tone), if the user wants that kind. */
  fun alert(ctx: Context, item: Item, kind: String, title: String, text: String) {
    if (!kindOn(ctx, kind)) return
    if (kind in APP_SHOWS && appInForeground()) return
    channels(ctx)
    val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(ctx, channelOf(kind)) else Notification.Builder(ctx)
    @Suppress("DEPRECATION")
    b.setSmallIcon(smallIcon(ctx))
      .setContentTitle(title)
      .setContentText(text)
      .setAutoCancel(true)
      .setCategory(Notification.CATEGORY_EVENT)
      .setPriority(if (kind == "lineups") Notification.PRIORITY_DEFAULT else Notification.PRIORITY_HIGH)
      .setContentIntent(openApp(ctx, item.tap, item.key.hashCode()))
    if (Build.VERSION.SDK_INT < 26) {
      @Suppress("DEPRECATION")
      b.setDefaults(Notification.DEFAULT_VIBRATE)
      toneUri(ctx, kind)?.let { @Suppress("DEPRECATION") b.setSound(it) }
    }
    try {
      ctx.getSystemService(NotificationManager::class.java).notify(item.key.hashCode() + (System.currentTimeMillis() / 1000 % 1000).toInt(), b.build())
    } catch (e: Exception) {}
  }

  /** Before kick-off: announce line-ups for followed football matches once they're published. */
  fun checkLineups(ctx: Context) {
    for (it in lineupsPending(ctx)) {
      val s = poll(it) ?: continue
      if (!s.li) continue
      val before = snap(ctx, it.key)
      saveSnap(ctx, it.key, (before ?: s).copy(li = true))
      alert(ctx, it, "lineups", "Line-ups are out: ${it.home} v ${it.away}", it.league)
    }
  }

  private var player: MediaPlayer? = null

  /** Play one alert tone (Settings preview, and the in-app banner). */
  fun playTone(ctx: Context, kind: String): Boolean {
    val id = ctx.resources.getIdentifier("fs_$kind", "raw", ctx.packageName)
    if (id == 0) return false
    return try {
      player?.release()
      player = MediaPlayer.create(ctx, id)?.apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        setOnCompletionListener { mp ->
          mp.release()
          if (player === mp) player = null
        }
        start()
      }
      player != null
    } catch (e: Exception) {
      false
    }
  }

  // ---------- scheduling ----------

  private fun alarmIntent(ctx: Context) =
    PendingIntent.getBroadcast(ctx, 7001, Intent(ctx, LiveAlarmReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  fun scheduleAt(ctx: Context, t: Long) {
    val am = ctx.getSystemService(AlarmManager::class.java) ?: return
    val pi = alarmIntent(ctx)
    try {
      if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi)
      else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi)
    } catch (e: Exception) {
      am.set(AlarmManager.RTC_WAKEUP, t, pi)
    }
  }

  fun cancelAlarm(ctx: Context) {
    ctx.getSystemService(AlarmManager::class.java)?.cancel(alarmIntent(ctx))
  }

  fun startService(ctx: Context): Boolean {
    return try {
      val i = Intent(ctx, LiveService::class.java)
      if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
      true
    } catch (e: Exception) {
      // not allowed from the background right now: an exact alarm may start it
      scheduleAt(ctx, System.currentTimeMillis() + 60 * 1000L)
      false
    }
  }

  /** Decide what to do after the list changed or the phone rebooted. */
  fun kick(ctx: Context) {
    if (!enabled(ctx)) {
      cancelAlarm(ctx)
      ctx.stopService(Intent(ctx, LiveService::class.java))
      return
    }
    if (due(ctx).isNotEmpty()) {
      startService(ctx)
      return
    }
    val next = nextWake(ctx)
    if (next != null) scheduleAt(ctx, next) else cancelAlarm(ctx)
  }

  // ---------- network ----------

  fun get(url: String, headers: Map<String, String>): String? {
    val conn = try {
      URL(url).openConnection() as HttpURLConnection
    } catch (e: Exception) {
      return null
    }
    return try {
      conn.connectTimeout = 10000
      conn.readTimeout = 12000
      for ((k, v) in headers) conn.setRequestProperty(k, v)
      if (conn.responseCode != 200) null else conn.inputStream.bufferedReader().use { r -> r.readText() }
    } catch (e: Exception) {
      null
    } finally {
      conn.disconnect()
    }
  }

  private val FS_HOSTS = listOf("https://global.flashscore.ninja/2/x/feed", "https://2.flashscore.ninja/2/x/feed", "https://d.flashscore.com/x/feed")
  private val FS_HEADERS = mapOf("x-fsign" to "SW9D1eZo", "Referer" to "https://www.flashscore.com/", "Accept" to "*/*")

  private fun fields(text: String): Map<String, String> {
    val out = HashMap<String, String>()
    text.split("~").firstOrNull()?.split("¬")?.forEach { f ->
      val i = f.indexOf("÷")
      if (i > 0 && !out.containsKey(f.substring(0, i))) out[f.substring(0, i)] = f.substring(i + 1)
    }
    return out
  }

  private val STAGE = mapOf(
    6 to "ET", 7 to "Pens", 12 to "1st half", 13 to "2nd half", 14 to "P1", 15 to "P2", 16 to "P3",
    17 to "Set 1", 18 to "Set 2", 19 to "Set 3", 20 to "Set 4", 21 to "Set 5", 22 to "Q1", 23 to "Q2", 24 to "Q3", 25 to "Q4", 38 to "HT", 45 to "Break", 46 to "Break",
  )

  /** Current state of a match, or null if the source didn't answer. */
  fun poll(it: Item): Snap? {
    return if (it.src == "fs") pollFs(it) else pollEspn(it)
  }

  private fun pollFs(it: Item): Snap? {
    for (h in FS_HOSTS) {
      val body = get("$h/dc_${it.fsSport}_${it.id}", FS_HEADERS) ?: continue
      val f = fields(body)
      val da = f["DA"] ?: continue
      val state = when (da) { "2" -> "in"; "3" -> "post"; else -> "pre" }
      val stage = f["DB"]?.toIntOrNull() ?: 0
      var clock = STAGE[stage] ?: if (state == "in") "Live" else ""
      if (it.sport == "soccer" && (stage == 12 || stage == 13)) {
        val start = f["DD"]?.toLongOrNull()
        if (start != null) {
          val min = ((System.currentTimeMillis() / 1000 - start) / 60 + 1 + if (stage == 13) 45 else 0).toInt()
          val cap = if (stage == 13) 90 else 45
          clock = if (min > cap) "$cap+${min - cap}'" else "${maxOf(1, min)}'"
        }
      }
      val lineups = (f["DX"] ?: "").split(",").contains("LI")
      var reds = "" // unknown
      var scorer = ""
      if (it.sport == "soccer" && state != "pre") {
        // incidents: red cards per side and the latest goal's scorer
        val sui = get("$h/df_sui_${it.fsSport}_${it.id}", FS_HEADERS)
        if (sui != null) {
          var rh = 0
          var ra = 0
          for (rec in sui.split("~")) {
            val kinds = Regex("IK÷([^¬]*)").findAll(rec).map { m -> m.groupValues[1] }.toList()
            val side = Regex("IA÷(\\d)").find(rec)?.groupValues?.get(1)
            if (kinds.any { k -> k == "Red Card" || k.contains("Red card") }) {
              if (side == "1") rh++ else if (side == "2") ra++
            }
            if (kinds.firstOrNull()?.let { k -> k == "Goal" || k == "Penalty" || k == "Own goal" } == true) {
              scorer = Regex("IF÷([^¬]*)").find(rec)?.groupValues?.get(1) ?: scorer
            }
          }
          reds = "$rh:$ra"
        }
      }
      return Snap(state, f["DE"] ?: "", f["DF"] ?: "", clock, stage == 38, reds, lineups, scorer)
    }
    return null
  }

  private fun pollEspn(it: Item): Snap? {
    if (it.espnPath.isEmpty()) return null
    for (host in listOf("https://site.api.espn.com", "https://site.web.api.espn.com")) {
      val body = get("$host/apis/site/v2/sports/${it.espnPath}/summary?event=${it.id}", mapOf("Accept" to "application/json")) ?: continue
      return try {
        val comp = JSONObject(body).getJSONObject("header").getJSONArray("competitions").getJSONObject(0)
        val type = comp.getJSONObject("status").getJSONObject("type")
        val state = type.optString("state", "pre")
        var hs = ""
        var aws = ""
        val cs = comp.getJSONArray("competitors")
        for (i in 0 until cs.length()) {
          val c = cs.getJSONObject(i)
          if (c.optString("homeAway") == "home") hs = c.optString("score") else aws = c.optString("score")
        }
        val detail = type.optString("shortDetail")
        Snap(state, hs, aws, if (state == "in") detail else "", detail.equals("HT", true) || detail.contains("Halftime", true))
      } catch (e: Exception) {
        null
      }
    }
    return null
  }
}

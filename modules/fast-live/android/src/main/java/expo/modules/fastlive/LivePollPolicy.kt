package expo.modules.fastlive

internal object LivePollPolicy {
  const val ROUND_BUDGET_MS=7500L
  fun <T> batch(items:List<T>,cursor:Int):List<T> = if(items.isEmpty())emptyList() else
    (0 until minOf(items.size,12)).map { items[(cursor.coerceAtLeast(0)+it)%items.size] }
  fun delay(live:Boolean,elapsed:Long)=maxOf(500L,(if(live)8000L else 30000L)-elapsed.coerceAtLeast(0))
}

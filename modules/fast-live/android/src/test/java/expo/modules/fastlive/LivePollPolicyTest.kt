package expo.modules.fastlive
import org.junit.Assert.*
import org.junit.Test
class LivePollPolicyTest {
  @Test fun boundedRoundsVisitEveryFollowedMatch() {
    val items=(0 until 40).toList();val seen=HashSet<Int>();var cursor=0
    repeat(4){val batch=LivePollPolicy.batch(items,cursor);assertTrue(batch.size<=12);seen.addAll(batch);cursor=(cursor+batch.size)%items.size}
    assertEquals(40,seen.size);assertTrue(LivePollPolicy.batch(emptyList<Int>(),0).isEmpty())
  }
  @Test fun cadenceAccountsForRequestTimeWithoutBusyLooping() {
    assertEquals(7000L,LivePollPolicy.delay(true,1000));assertEquals(500L,LivePollPolicy.delay(true,20000));assertEquals(29000L,LivePollPolicy.delay(false,1000))
  }
}

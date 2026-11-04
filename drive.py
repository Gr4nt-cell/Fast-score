import subprocess, time, re
def sh(c): return subprocess.run(c, shell=True, capture_output=True, text=True).stdout
def shot(n): sh(f"adb exec-out screencap -p > out/{n}.png")
def tap(x,y): sh(f"adb shell input tap {x} {y}"); print('tap',x,y,flush=True)
def dump():
    for _ in range(3):
        sh("adb shell uiautomator dump /sdcard/u.xml >/dev/null 2>&1"); x=sh("adb shell cat /sdcard/u.xml")
        if '<node' in x: return x
        time.sleep(2)
    return ''
def find(text):
    x=dump()
    for m in re.finditer(r'<node [^>]*>', x):
        n=m.group(0)
        if f'text="{text}"' in n or f'content-desc="{text}"' in n:
            b=list(map(int,re.findall(r'\d+',re.search(r'bounds="([^"]*)"',n).group(1)))); return ((b[0]+b[2])//2,(b[1]+b[3])//2)
    return None
def tap_text(text, swipes=8):
    for i in range(swipes):
        p=find(text)
        if p: tap(*p); return True
        sh("adb shell input swipe 540 1500 540 700 400"); time.sleep(1.2)
    print('not found', text); return False
def anr(): 
    d=sh("adb shell dumpsys window | grep -i mCurrentFocus"); print(d.strip(),flush=True)
    if 'Not Responding' in d or ('Launcher' in d and 'fastscore' not in d): tap(322,1360); time.sleep(2)
sh("adb shell pm grant com.gr4nt.fastscore android.permission.POST_NOTIFICATIONS")
sh("adb shell media volume --stream 5 --set 5")  # notification stream audible
sh("adb shell monkey -p com.gr4nt.fastscore -c android.intent.category.LAUNCHER 1"); time.sleep(40); anr(); shot('a0_matches')
sh("adb shell input swipe 540 1700 540 600 600"); time.sleep(2); shot('a1_scrolled')
sh("adb shell cmd uimode night yes"); time.sleep(6); shot('a2_dark'); sh("adb shell cmd uimode night no"); time.sleep(6)
# open the first match that shows odds: tap a row in the first league card
tap(560,900); time.sleep(15); anr(); shot('b0_match')
sh("adb shell input swipe 540 1700 540 900 500"); time.sleep(2); shot('b1_match_scrolled')
sh("adb shell input keyevent KEYCODE_BACK"); time.sleep(4)
# settings -> test notification
tap(978,210); time.sleep(6); shot('c0_settings')
sh("adb logcat -c")
ok = tap_text('Send test notification') or tap_text('Test notification')
time.sleep(6); shot('c1_after_test')
print('notif shade:')
print(sh("adb shell dumpsys notification --noredact | grep -E 'NotificationRecord|ev_goal|channel=|mId=.ev_|mId=.scores' | head -40"))
print('channels:', sh("adb shell dumpsys notification --noredact | grep -o \"mId='[a-z_0-9]*'\" | sort -u"))
open('out/logcat_test.txt','w').write(sh("adb logcat -d"))
print('pid', sh("adb shell pidof com.gr4nt.fastscore"))

import subprocess, time, re
def sh(c): return subprocess.run(c, shell=True, capture_output=True, text=True).stdout
def shot(n): sh(f"adb exec-out screencap -p > out/{n}.png"); print('shot',n,flush=True)
def tap(x,y): sh(f"adb shell input tap {x} {y}"); print('tap',x,y,flush=True)
def nodes():
    for _ in range(4):
        sh("adb shell uiautomator dump /sdcard/u.xml >/dev/null 2>&1"); x=sh("adb shell cat /sdcard/u.xml")
        if '<node' in x: break
        time.sleep(2)
    out=[]
    for m in re.finditer(r'<node [^>]*>', x):
        n=m.group(0)
        t=re.search(r' text="([^"]*)"',n); d=re.search(r'content-desc="([^"]*)"',n); b=re.search(r'bounds="([^"]*)"',n)
        if not b: continue
        bb=list(map(int,re.findall(r'\d+',b.group(1))))
        out.append(((t.group(1) if t else ''),(d.group(1) if d else ''),bb,'clickable="true"' in n))
    return out
def center(b): return ((b[0]+b[2])//2,(b[1]+b[3])//2)
def tap_text(text, swipes=8, sx=540):
    for i in range(swipes):
        for t,d,b,c in nodes():
            if t==text or d==text: tap(*center(b)); return True
        sh(f"adb shell input swipe {sx} 1400 {sx} 600 400"); time.sleep(1.2)
    print('not found', text, flush=True); return False
def anr():
    d=sh("adb shell dumpsys window | grep -i mCurrentFocus")
    if 'Not Responding' in d or ('Launcher' in d and 'fastscore' not in d):
        for t,dd,b,c in nodes():
            if t in ('Wait','Close app') and t=='Wait': tap(*center(b))
        time.sleep(2)
def launch():
    sh("adb shell am force-stop com.gr4nt.fastscore")
    sh("adb shell monkey -p com.gr4nt.fastscore -c android.intent.category.LAUNCHER 1"); time.sleep(30); anr()
def first_match():
    pat=re.compile(r"^(\d{1,2}:\d{2}( (AM|PM))?|FT|HT|\d{1,3}')$")
    for t,d,b,c in nodes():
        if pat.match(t) and b[1] > 500: tap(b[2]+80, center(b)[1]); return True
    print('no match row', flush=True); return False
def settings_gear():
    top=[n for n in nodes() if n[3] and n[2][1] < 400 and (n[2][2]-n[2][0]) < 220 and (n[2][3]-n[2][1]) > 60]
    if not top: print('no gear',flush=True); return False
    g=max(top, key=lambda n: n[2][0]); tap(*center(g[2])); return True

def run(mode, w, h, dpi, notif=False):
    sh(f"adb shell wm size {w}x{h}"); sh(f"adb shell wm density {dpi}")
    if w > h: sh("adb shell settings put system accelerometer_rotation 0"); sh("adb shell settings put system user_rotation 1")
    else: sh("adb shell settings put system user_rotation 0")
    time.sleep(3); launch()
    shot(f'{mode}_1_matches')
    if first_match(): time.sleep(14); anr()
    shot(f'{mode}_2_match')
    sh("adb shell input keyevent KEYCODE_BACK"); time.sleep(3)
    if mode != 'phone': sh("adb shell input keyevent KEYCODE_BACK"); time.sleep(2); launch()
    settings_gear(); time.sleep(6)
    shot(f'{mode}_3_settings')
    if notif:
        sh("adb logcat -c")
        tap_text('Send test notification', sx=w//2)
        time.sleep(8); shot(f'{mode}_4_test_notification')
        print(sh("adb shell dumpsys notification --noredact | grep -o \"mId='[a-z_0-9]*'\" | sort -u"))
        lc=sh("adb logcat -d")
        open('out/logcat_test.txt','w').write(lc)
        print('\n'.join(l for l in lc.splitlines() if re.search(r'MediaPlayer|NuPlayer|AudioTrack|fs_goal|playTone|notification_alert', l))[:4000])
    sh("adb shell input keyevent KEYCODE_BACK")

sh("adb shell pm grant com.gr4nt.fastscore android.permission.POST_NOTIFICATIONS")
sh("adb shell media volume --stream 5 --set 5")
run('phone', 1080, 2400, 420, notif=True)
run('tablet', 1600, 2560, 320)
run('desktop', 2560, 1440, 240)
sh("adb shell wm size reset; adb shell wm density reset")
print('pid', sh("adb shell pidof com.gr4nt.fastscore"))

import subprocess, time
def sh(c): return subprocess.run(c, shell=True, capture_output=True, text=True).stdout
def shot(n): sh(f"adb exec-out screencap -p > out/{n}.png")
def tap(x,y): sh(f"adb shell input tap {x} {y}"); print('tap',x,y,flush=True)
sh("adb shell settings put global hide_error_dialogs 1")
sh("adb shell pm grant com.gr4nt.fastscore android.permission.POST_NOTIFICATIONS")
sh("adb shell monkey -p com.gr4nt.fastscore -c android.intent.category.LAUNCHER 1"); time.sleep(35); shot('t0')
tap(978,210); time.sleep(6); shot('t1')   # settings
for i in range(4):
    sh("adb shell input swipe 540 1800 540 900 500"); time.sleep(1.5); shot(f't2_{i}')
print(sh("adb shell dumpsys notification | grep -i 'ev_\\|NotificationChannel{mId=.scores\\|fs_'")[:3000])
print('pid', sh("adb shell pidof com.gr4nt.fastscore"))

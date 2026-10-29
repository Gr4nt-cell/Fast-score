import subprocess, time, sys
def sh(c): return subprocess.run(c, shell=True, capture_output=True, text=True).stdout
def shot(n): sh(f"adb exec-out screencap -p > out/{n}.png")
def tap(x,y): sh(f"adb shell input tap {x} {y}"); print('tap',x,y,flush=True)
sh("adb shell settings put global hide_error_dialogs 1")
sh("adb shell monkey -p com.gr4nt.fastscore -c android.intent.category.LAUNCHER 1"); time.sleep(35); shot('a0')
tap(299,2262); time.sleep(8); shot('a1')          # Leagues tab
tap(200,210); time.sleep(12); shot('a2')          # news half of the left pill
tap(540,900); time.sleep(4); shot('a3')           # first article
time.sleep(15); shot('a4')
print('pid', sh("adb shell pidof com.gr4nt.fastscore"))

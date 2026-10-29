import subprocess, time
def sh(c): return subprocess.run(c, shell=True, capture_output=True, text=True).stdout
def shot(n): sh(f"adb exec-out screencap -p > out/{n}.png")
def tap(x,y): sh(f"adb shell input tap {x} {y}"); print('tap',x,y,flush=True)
sh("adb shell settings put global hide_error_dialogs 1")
sh("adb shell monkey -p com.gr4nt.fastscore -c android.intent.category.LAUNCHER 1"); time.sleep(35); shot('m0')
tap(622,2262); time.sleep(10); shot('l1')     # Live tab
tap(600,1104); time.sleep(14); shot('x0')
for i in range(3):
    if i: sh("adb shell input swipe 540 1900 540 1100 500"); time.sleep(1.2)
    for k in range(3): shot(f'x{i}_{k}'); time.sleep(0.7)
print('pid', sh("adb shell pidof com.gr4nt.fastscore"))

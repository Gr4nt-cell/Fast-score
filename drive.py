import subprocess, time
def sh(c): return subprocess.run(c, shell=True, capture_output=True, text=True).stdout
def shot(n): sh(f"adb exec-out screencap -p > out/{n}.png")
def tap(x,y): sh(f"adb shell input tap {x} {y}"); print('tap',x,y,flush=True)
def anr():
    d = sh("adb shell dumpsys window | grep -i 'mCurrentFocus'")
    print(d.strip(), flush=True)
    if 'Application Not Responding' in d or 'Launcher' in d and 'fastscore' not in d: tap(322,1360); time.sleep(2)
sh("adb shell monkey -p com.gr4nt.fastscore -c android.intent.category.LAUNCHER 1"); time.sleep(40)
anr(); shot('m0')
tap(622,2262); time.sleep(10); anr(); shot('l1')
tap(427,210); time.sleep(8); anr(); shot('l2')   # football filter
tap(600,620); time.sleep(14); anr(); shot('x0')   # first match under first league
for i in range(3):
    if i: sh("adb shell input swipe 540 1900 540 1100 500"); time.sleep(1.2)
    for k in range(3): shot(f'x{i}_{k}'); time.sleep(0.7)
print('pid', sh("adb shell pidof com.gr4nt.fastscore"))

import subprocess, re, time, sys
def sh(c): return subprocess.run(c, shell=True, capture_output=True, text=True).stdout
def nodes():
    sh("adb shell uiautomator dump /sdcard/u.xml >/dev/null 2>&1"); x=sh("adb shell cat /sdcard/u.xml")
    out=[]
    for m in re.finditer(r'<node [^>]*>', x):
        n=m.group(0); t=re.search(r' text="([^"]*)"',n).group(1); d=re.search(r'content-desc="([^"]*)"',n).group(1)
        b=list(map(int,re.findall(r'\d+',re.search(r'bounds="([^"]*)"',n).group(1)))); c='clickable="true"' in n
        out.append((t,d,b,c))
    return out
def tap(b): x=(b[0]+b[2])//2; y=(b[1]+b[3])//2; print('tap',x,y,flush=True); sh(f"adb shell input tap {x} {y}")
def tap_text(s, tries=6):
    for i in range(tries):
        for t,d,b,c in nodes():
            if t==s or d==s: tap(b); return True
        sh("adb shell input swipe 540 1700 540 700 400"); time.sleep(1.5)
    print('not found',s); return False
def shot(name): sh(f"adb exec-out screencap -p > out/{name}.png")
def crashed(): return 'com.gr4nt.fastscore' not in sh("adb shell pidof com.gr4nt.fastscore || true") and sh("adb shell pidof com.gr4nt.fastscore").strip()==''
mode=sys.argv[1]
sh("adb shell monkey -p com.gr4nt.fastscore -c android.intent.category.LAUNCHER 1"); time.sleep(30); shot(mode+'0')
tap_text('Leagues', 1); time.sleep(6); shot(mode+'1')
top=[n for n in nodes() if n[3] and n[2][1]<350 and n[2][3]-n[2][1]>40]
top.sort(key=lambda n:n[2][0]); print([n[2] for n in top])
if mode=='news':
    # left pill = [trophy | news]; tap the right half of the left-most clickable element group
    l=top[0][2]; pill=[n for n in top if n[2][0]<l[2]+200]
    cand=sorted(top,key=lambda n:n[2][0])
    tap(cand[1][2] if len(cand)>2 else [l[0]+(l[2]-l[0])*3//4,l[1],l[2],l[3]]); time.sleep(12); shot('news2')
    arts=[n for n in nodes() if n[3] and n[2][1]>400 and n[2][3]-n[2][1]>200]
    print('arts',len(arts)); 
    if arts: tap(arts[0][2])
else:
    tap(top[-1][2]); time.sleep(5); shot('set2')
    tap_text('Privacy policy')
time.sleep(20); shot(mode+'3')
print('pid', sh("adb shell pidof com.gr4nt.fastscore"))

import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Pressable, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Text } from '../components/Text';

// SofaScore's data now needs a "captcha token": its site runs a Cloudflare human check
// (Turnstile) on www.sofascore.com/captcha.html, exchanges the result at /api/v1/token/captcha
// for a token valid ~60 minutes, and sends it with every data request as the X-Captcha header.
// The token only works for the browser that obtained it, so:
//  - a hidden browser page (real Android Chrome, the phone's own home/mobile IP) opens the check
//    page; on most phones the check passes by itself in a few seconds;
//  - the token is caught as the page receives it, and every data request is then made from
//    inside that page with the token attached;
//  - if the check wants a tap, the app can show the same page (Settings -> Verify SofaScore);
//    one tap gives about an hour of data, and the page keeps renewing it in the background.

const ORIGIN = 'https://www.sofascore.com';
const LIGHT = ORIGIN + '/robots.txt'; // a tiny page on the site to work from
const CAPTCHA = `${ORIGIN}/captcha.html?redirectUrl=${encodeURIComponent(LIGHT)}`;

let wake = null;
let ctl = null; // { open(url), inject(js) } while the hidden page is mounted
let page = ''; // where the hidden page is
let token = null;
let tokenExp = 0; // ms
let solving = null; // promise while waiting for a token
let solveWaiters = [];
let lastSolveFail = 0;
const solveLog = []; // times of solve attempts (max 8 an hour)
const pending = new Map();
let seq = 0;
let needsTap = false;
const listeners = new Set();

export const bridgeReady = () => !!ctl;
export const sofaNeedsTap = () => needsTap;
export function onSofaState(f) {
  listeners.add(f);
  return () => listeners.delete(f);
}
function emit() {
  listeners.forEach((f) => f({ needsTap, hasToken: !!validToken() }));
}

function validToken() {
  return token && Date.now() < tokenExp - 3 * 60 * 1000 ? token : null;
}
export const sofaToken = validToken;

function setToken(t, exp) {
  if (!t || (exp && exp * 1000 < Date.now() + 60000)) return; // missing or already expired
  if (t === token) return;
  token = t;
  tokenExp = exp ? exp * 1000 : Date.now() + 55 * 60 * 1000;
  needsTap = false;
  const w = solveWaiters;
  solveWaiters = [];
  w.forEach((f) => f(true));
  emit();
}

// Injected before every page loads: catch the token as the site receives it.
const HOOK = `(function(){
  if(window.__fsHook)return;window.__fsHook=1;
  function send(o){try{window.ReactNativeWebView.postMessage(JSON.stringify(o))}catch(e){}}
  function exp(t){try{var p=t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(p)).exp||0}catch(e){return 0}}
  function give(t){if(t&&typeof t==='string'&&t.split('.').length===3)send({token:t,exp:exp(t)})}
  function fromStore(){try{var v=localStorage.getItem('sofa.captcha.token');if(!v)return;
    if(v.charAt(0)==='"'||v.charAt(0)==='{'){var j=JSON.parse(v);v=typeof j==='string'?j:(j&&(j.token||j.value))}give(v)}catch(e){}}
  try{var of=window.fetch;window.fetch=function(u,o){var p=of.apply(this,arguments);
    try{if(String(u&&u.url||u).indexOf('/token/captcha')>=0){p.then(function(r){r.clone().json().then(function(j){give(j&&j.token)}).catch(function(){})})}}catch(e){}
    return p}}catch(e){}
  try{var oo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){
    if(String(u).indexOf('/token/captcha')>=0){this.addEventListener('load',function(){try{give(JSON.parse(this.responseText).token)}catch(e){}})}
    return oo.apply(this,arguments)}}catch(e){}
  fromStore();var n=0;var iv=setInterval(function(){fromStore();if(++n>120)clearInterval(iv)},500);
})();true;`;

// Injected after every page load: report where the page is (and what it shows).
const READ = `(function(){try{var pre=document.querySelector('pre');var b=document.body;
  window.ReactNativeWebView.postMessage(JSON.stringify({doc:true,href:location.href,title:document.title,text:(pre?pre.textContent:(b?b.innerText:'')).slice(0,400)}))}catch(e){}})();true;`;

function onBridgeMessage(raw, visibleView) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (!msg) return;
  if (msg.token) return setToken(msg.token, msg.exp);
  if (visibleView) return;
  if (msg.doc) {
    page = msg.href || '';
    return;
  }
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  clearTimeout(p.t);
  p.resolve({ status: msg.status, body: msg.body });
}

function waitMounted(timeout) {
  if (ctl) return Promise.resolve(true);
  if (!wake) return Promise.resolve(false); // no screen (e.g. the background check)
  wake();
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (ctl) return resolve(true);
      if (Date.now() - t0 > timeout) return resolve(false);
      setTimeout(tick, 100);
    };
    tick();
  });
}

function waitPage(test, timeout) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (test()) return resolve(true);
      if (Date.now() - t0 > timeout) return resolve(false);
      setTimeout(tick, 150);
    };
    tick();
  });
}

/** Get a token: open the check page in the hidden browser and wait for it to pass. */
function solve(timeout = 25000) {
  if (validToken()) return Promise.resolve(true);
  if (solving) return solving;
  const now = Date.now();
  while (solveLog.length && solveLog[0] < now - 3600000) solveLog.shift();
  if (solveLog.length >= 8 || now - lastSolveFail < 60000) {
    needsTap = true;
    emit();
    return Promise.resolve(false);
  }
  solveLog.push(now);
  solving = new Promise((resolve) => {
    const t = setTimeout(() => {
      solveWaiters = solveWaiters.filter((f) => f !== done);
      lastSolveFail = Date.now();
      needsTap = true; // it wants a tap: the user can do it from Settings
      emit();
      resolve(false);
    }, timeout);
    function done(ok) {
      clearTimeout(t);
      resolve(ok);
    }
    solveWaiters.push(done);
    // forget the old token first, or the check page just redirects without issuing a new one
    ctl.inject(`try{localStorage.removeItem('sofa.captcha.token')}catch(e){};document.cookie='sofa_captcha=; Max-Age=0; path=/';document.cookie='sofa_captcha=; Max-Age=0; path=/; domain=.sofascore.com';true;`);
    setTimeout(() => ctl && ctl.open(CAPTCHA), 300);
  }).finally(() => {
    solving = null;
  });
  return solving;
}

function fetchInPage(path, timeout) {
  return new Promise((resolve) => {
    const id = ++seq;
    const t = setTimeout(() => {
      pending.delete(id);
      resolve({ status: 0, body: 'timed out' });
    }, timeout);
    pending.set(id, { resolve, t });
    const headers = { Accept: '*/*' };
    const tk = validToken();
    if (tk) headers['X-Captcha'] = tk;
    ctl.inject(
      `(function(){function post(s,b){window.ReactNativeWebView.postMessage(JSON.stringify({id:${id},status:s,body:b}))}` +
        `if(location.origin!==${JSON.stringify(ORIGIN)}){post(0,'page is on '+location.href);return;}` +
        `fetch(${JSON.stringify(path)},{credentials:'include',headers:${JSON.stringify(headers)}})` +
        `.then(function(r){return r.text().then(function(b){post(r.status,b)})})` +
        `.catch(function(e){post(0,String(e))});})();true;`
    );
  });
}

const challenged = (r) => r && r.status === 403 && /challenge|jwt|captcha/i.test(String(r.body || ''));
const onSite = () => page.startsWith(ORIGIN + '/') && !page.includes('captcha.html');

/** GET a SofaScore API path (e.g. "/api/v1/event/123") through the hidden page. */
export async function browserFetch(path, timeout = 20000, readyTimeout = 8000) {
  const ok = await waitMounted(readyTimeout);
  if (!ok || !ctl) throw new Error('Browser view not available');
  if (solving) await solving;
  // get the page onto the site
  if (!onSite()) {
    if (!page || !page.includes('captcha.html')) ctl.open(LIGHT);
    if (!(await waitPage(onSite, 15000))) return { status: 0, body: `page didn't open (${page || 'nothing'})` };
  }
  let r = await fetchInPage(path, Math.min(timeout, 15000));
  if (challenged(r)) {
    token = null;
    const got = await solve();
    if (!got) return { status: 403, body: 'SofaScore wants a human check: Settings → Verify SofaScore' };
    if (!(await waitPage(onSite, 15000))) {
      ctl.open(LIGHT);
      await waitPage(onSite, 10000);
    }
    r = await fetchInPage(path, Math.min(timeout, 15000));
  }
  return r;
}

export function SofaBridge() {
  const ref = useRef(null);
  const [active, setActive] = useState(false);
  const [src, setSrc] = useState(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    wake = () => setActive(true);
    return () => {
      wake = null;
      ctl = null;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    ctl = {
      open: (url) => {
        page = '';
        setSrc((s) => {
          if (s && s.uri === url && ref.current) {
            ref.current.reload();
            return s;
          }
          return { uri: url };
        });
      },
      inject: (js) => ref.current && ref.current.injectJavaScript(js),
    };
    // keep the token fresh while the app is open: renew a few minutes before it runs out
    const iv = setInterval(() => {
      if (token && Date.now() > tokenExp - 5 * 60 * 1000 && !solving) {
        token = null;
        solve();
      }
    }, 60000);
    return () => clearInterval(iv);
  }, [active]);

  if (!active || !src) return null;

  // full phone-sized (the check behaves better on a real-sized page) but invisible and untouchable
  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: 360, height: 640, left: 0, top: 0, opacity: 0.01 }}>
      <BridgeWebView
        key={key}
        innerRef={ref}
        src={src}
        onError={() => {
          page = '';
        }}
        onCrash={() => {
          page = '';
          setKey((k) => k + 1);
        }}
      />
    </View>
  );
}

function BridgeWebView({ innerRef, src, onError, onCrash, style, visibleView }) {
  return (
    <WebView
      ref={innerRef}
      source={src}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      thirdPartyCookiesEnabled
      sharedCookiesEnabled
      setSupportMultipleWindows={false}
      mediaPlaybackRequiresUserAction
      style={style || { flex: 1, backgroundColor: 'transparent' }}
      injectedJavaScriptBeforeContentLoaded={HOOK}
      injectedJavaScriptBeforeContentLoadedForMainFrameOnly
      injectedJavaScript={READ}
      onMessage={(ev) => onBridgeMessage(ev.nativeEvent.data, visibleView)}
      onError={onError}
      onContentProcessDidTerminate={onCrash}
      onRenderProcessGone={() => {
        onCrash && onCrash();
        return true;
      }}
    />
  );
}

/** A visible SofaScore check, for when it asks for a tap. Closes itself once it passes. */
export function SofaVerify({ visible, onClose, theme }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setDone(false);
    token = null;
    return onSofaState((s) => {
      if (s.hasToken) {
        setDone(true);
        setTimeout(onClose, 900);
      }
    });
  }, [visible, onClose]);
  const t = theme || {};
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: t.bg || '#fff', paddingTop: 48 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text || '#000', fontSize: 17, fontWeight: '700' }}>{done ? 'Verified' : 'Verify SofaScore'}</Text>
            <Text style={{ color: t.secondary || '#666', fontSize: 12.5, marginTop: 2 }}>
              {done ? 'SofaScore data is on. Closing…' : 'Tap the check box if one appears. Lasts about an hour, then renews by itself.'}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: t.track || '#eee' }}>
            <Text style={{ color: t.text || '#000', fontWeight: '600' }}>Close</Text>
          </Pressable>
        </View>
        {visible && !done ? <BridgeWebView src={{ uri: CAPTCHA }} style={{ flex: 1 }} visibleView /> : <ActivityIndicator style={{ marginTop: 40 }} />}
      </View>
    </Modal>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

// A hidden browser page on sofascore.com. When SofaScore refuses the app's own requests, its data
// is loaded by this page instead, as a real Chrome browser would:
//  1. "open"  - the page navigates straight to the data address (www.sofascore.com/api/v1/...).
//     A top-level visit has no cross-site rules, carries the browser's own fingerprint and cookies,
//     and passes Cloudflare's "checking your browser" step by itself. The JSON is read off the page.
//  2. "fetch" - once the page sits on www.sofascore.com, further requests are fetched from inside
//     it (same site, so allowed), several at a time. If that is refused, it goes back to opening.
// The view is 2 px and invisible; it is only mounted once the app first needs it.

const ORIGIN = 'https://www.sofascore.com';
const API = ORIGIN + '/api/v1';

let wake = null; // asks the component to mount
let mounted = false;
let ctl = null; // { open(url), inject(js) } while mounted
let onSite = false; // the page currently shows a www.sofascore.com document
let lastDoc = ''; // where the page is, for error messages
const pending = new Map(); // in-page fetches
let seq = 0;

// navigation queue: one page visit at a time
const queue = [];
let current = null;
let navWaiters = [];
const navDone = () => new Promise((r) => navWaiters.push(r));

export const bridgeReady = () => mounted;

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

const looksJson = (s) => /^\s*[[{]/.test(s || '');
const isChallenge = (title, text) => /just a moment|attention required|checking your browser|cf-chl|verify you are human/i.test(`${title} ${String(text).slice(0, 2000)}`);

function pump() {
  if (current || !queue.length || !ctl) return;
  current = queue.shift();
  current.status = 0;
  current.timer = setTimeout(() => finish({ status: 0, body: `page timed out on ${lastDoc || 'nothing'}` }), current.timeout);
  ctl.open(current.url);
}

function finish(r) {
  const c = current;
  if (!c) return;
  clearTimeout(c.timer);
  current = null;
  c.resolve(r);
  const w = navWaiters;
  navWaiters = [];
  w.forEach((f) => f());
  pump();
}

function openPage(url, timeout) {
  return new Promise((resolve) => {
    queue.push({ url, timeout, resolve });
    pump();
  });
}

function fetchInPage(path, timeout) {
  return new Promise((resolve) => {
    const id = ++seq;
    const t = setTimeout(() => {
      pending.delete(id);
      resolve({ status: 0, body: 'in-page fetch timed out' });
    }, timeout);
    pending.set(id, { resolve, t });
    ctl.inject(
      `(function(){function post(s,b){window.ReactNativeWebView.postMessage(JSON.stringify({id:${id},status:s,body:b}))}` +
        `if(location.origin!==${JSON.stringify(ORIGIN)}){post(0,'page is on '+location.href);return;}` +
        `fetch(${JSON.stringify(path)},{credentials:'include',headers:{'Accept':'*/*'}})` +
        `.then(function(r){return r.text().then(function(b){post(r.status,b)})})` +
        `.catch(function(e){post(0,String(e))});})();true;`
    );
  });
}

/** GET a SofaScore API path (e.g. "/api/v1/event/123") through the hidden page. */
export async function browserFetch(path, timeout = 20000, readyTimeout = 8000) {
  const ok = await waitMounted(readyTimeout);
  if (!ok || !ctl) throw new Error('Browser view not available');
  // a page visit is under way: wait for it, the page may then be on the site and fetch directly
  if (!onSite && current) await Promise.race([navDone(), new Promise((r) => setTimeout(r, timeout))]);
  if (onSite) {
    const r = await fetchInPage(path, Math.min(timeout, 12000));
    if (r.status === 404 || (r.status >= 200 && r.status < 300 && looksJson(r.body))) return r;
  }
  return openPage(ORIGIN + path, timeout);
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
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    mounted = true;
    ctl = {
      open: (url) => {
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
    pump();
  }, [active]);

  if (!active || !src) return null;

  const onMessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.nativeEvent.data);
    } catch {
      return;
    }
    if (!msg) return;
    if (msg.doc) {
      lastDoc = msg.href;
      onSite = String(msg.href || '').startsWith(ORIGIN + '/');
      if (!current) return;
      if (isChallenge(msg.title, msg.text)) return; // Cloudflare is checking; it reloads when done
      if (looksJson(msg.text)) return finish({ status: current.status || 200, body: msg.text });
      if (current.status) return finish({ status: current.status, body: String(msg.text || '').slice(0, 300) });
      // an HTML page that isn't a challenge (e.g. a block page)
      return finish({ status: 0, body: `${msg.title || 'page'}: ${String(msg.text || '').replace(/\s+/g, ' ').slice(0, 160)}` });
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.t);
    p.resolve({ status: msg.status, body: msg.body });
  };

  // runs after every page load: hand the page's text back to the app
  const READ =
    `(function(){try{var b=document.body;var pre=document.querySelector('pre');` +
    `var t=pre?pre.textContent:(b?b.innerText:'');` +
    `window.ReactNativeWebView.postMessage(JSON.stringify({doc:true,href:location.href,title:document.title,text:t}))}catch(e){}})();true;`;

  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: 2, height: 2, left: 0, top: 0, opacity: 0.01 }}>
      <WebView
        key={key}
        ref={ref}
        source={src}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        cacheEnabled={false}
        incognito={false}
        setSupportMultipleWindows={false}
        mediaPlaybackRequiresUserAction
        style={{ width: 2, height: 2, backgroundColor: 'transparent' }}
        injectedJavaScript={READ}
        onMessage={onMessage}
        onHttpError={(e) => {
          // status of the main page (e.g. 403 / 404); the body still arrives through READ
          if (current) current.status = e.nativeEvent.statusCode;
        }}
        onError={(e) => {
          onSite = false;
          lastDoc = (e.nativeEvent && e.nativeEvent.url) || lastDoc;
          if (current) finish({ status: 0, body: `page error: ${(e.nativeEvent && e.nativeEvent.description) || 'failed to load'}` });
        }}
        onContentProcessDidTerminate={() => {
          onSite = false;
          setKey((k) => k + 1);
        }}
        onRenderProcessGone={() => {
          onSite = false;
          setKey((k) => k + 1);
          return true;
        }}
      />
    </View>
  );
}

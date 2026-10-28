import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

// A hidden browser page on sofascore.com. When SofaScore refuses the app's own requests, its API
// is fetched from inside this page instead, the same way the website does it. The page is kept
// off-screen and 1 px small; it's only loaded once the app first needs it.

const ORIGIN = 'https://www.sofascore.com';
const START = ORIGIN + '/';
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

let send = null; // set while the page is ready
let wanted = false;
let wake = null; // asks the component to load the page
let readyWaiters = [];
const pending = new Map();
let seq = 0;

export const bridgeReady = () => !!send;

function whenReady(timeout = 10000) {
  if (send) return Promise.resolve(true);
  // no screen mounted (e.g. the background check): don't wait for a page that can't load
  if (!wake) return Promise.resolve(false);
  wanted = true;
  if (wake) wake();
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), timeout);
    readyWaiters.push(() => {
      clearTimeout(t);
      resolve(true);
    });
  });
}

/** GET an SofaScore API path (e.g. "/api/v1/event/123") from inside the page. */
export async function browserFetch(path, timeout = 15000) {
  const ok = await whenReady();
  if (!ok || !send) throw new Error('Browser view not ready');
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Browser view timed out'));
    }, timeout);
    pending.set(id, { resolve, reject, t });
    send(
      `(function(){fetch(${JSON.stringify(path)},{credentials:'include',headers:{'Accept':'application/json'}})` +
        `.then(function(r){return r.text().then(function(b){window.ReactNativeWebView.postMessage(JSON.stringify({id:${id},status:r.status,body:b}))})})` +
        `.catch(function(e){window.ReactNativeWebView.postMessage(JSON.stringify({id:${id},status:0,body:String(e)}))});})();true;`
    );
  });
}

export function SofaBridge() {
  const ref = useRef(null);
  const [active, setActive] = useState(wanted);
  const [key, setKey] = useState(0);

  useEffect(() => {
    wake = () => setActive(true);
    if (wanted) setActive(true);
    return () => {
      wake = null;
      send = null;
    };
  }, []);

  if (!active) return null;

  const onMessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.nativeEvent.data);
    } catch {
      return;
    }
    if (msg && msg.ready) return;
    const p = msg && pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.t);
    p.resolve({ status: msg.status, body: msg.body });
  };

  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: 1, height: 1, left: -10, top: -10, opacity: 0 }}>
      <WebView
        key={key}
        ref={ref}
        source={{ uri: START }}
        userAgent={UA}
        originWhitelist={['https://*']}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        cacheEnabled
        mediaPlaybackRequiresUserAction
        style={{ width: 1, height: 1 }}
        onLoadEnd={() => {
          send = (js) => ref.current && ref.current.injectJavaScript(js);
          const w = readyWaiters;
          readyWaiters = [];
          w.forEach((f) => f());
        }}
        onMessage={onMessage}
        onError={() => {
          send = null;
          setTimeout(() => setKey((k) => k + 1), 30000);
        }}
        onHttpError={() => {}}
        onContentProcessDidTerminate={() => {
          send = null;
          setKey((k) => k + 1);
        }}
        onRenderProcessGone={() => {
          send = null;
          setKey((k) => k + 1);
        }}
      />
    </View>
  );
}

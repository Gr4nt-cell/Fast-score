// Reads a news story (or any web page) inside the app instead of the external browser.
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Share, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/Text';
import { Glass } from '../components/Glass';
import { GlassCircle } from '../components/ui';
import { useTheme } from '../theme';
import { useNav } from '../nav';

const host = (u) => {
  const m = /^https?:\/\/([^/?#]+)/i.exec(u || '');
  return m ? m[1].replace(/^www\./, '') : '';
};

export default function ArticleScreen({ route }) {
  const t = useTheme();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const web = useRef(null);
  const [url, setUrl] = useState(route.url);
  const [canBack, setCanBack] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
        <GlassCircle icon={canBack ? 'arrow-back' : 'chevron-back'} onPress={() => (canBack && web.current ? web.current.goBack() : nav.pop())} />
        <Glass radius={23} strong style={{ flex: 1, height: 46, justifyContent: 'center', paddingHorizontal: 14, marginHorizontal: 10, overflow: 'hidden' }}>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: '800', textAlign: 'center' }} numberOfLines={1}>
            {route.title || host(url) || 'News'}
          </Text>
          {route.title ? (
            <Text style={{ color: t.secondary, fontSize: 11.5, textAlign: 'center' }} numberOfLines={1}>
              {host(url)}
            </Text>
          ) : null}
          {progress < 1 ? <View style={{ position: 'absolute', left: 0, bottom: 0, height: 2.5, width: `${Math.max(8, progress * 100)}%`, backgroundColor: t.blue }} /> : null}
        </Glass>
        <GlassCircle icon="share-outline" onPress={() => Share.share({ message: url, url }).catch(() => {})} />
      </View>
      {failed ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '800' }}>Couldn't load this page</Text>
          <Text
            style={{ color: t.blue, fontSize: 15, marginTop: 10, fontWeight: '700' }}
            onPress={() => {
              setFailed(false);
              web.current && web.current.reload();
            }}
          >
            Try again
          </Text>
        </View>
      ) : null}
      <WebView
        ref={web}
        source={{ uri: route.url }}
        style={{ flex: failed ? 0 : 1, backgroundColor: t.bg }}
        startInLoadingState
        renderLoading={() => (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
            <ActivityIndicator color={t.secondary} />
          </View>
        )}
        onLoadProgress={(e) => setProgress(e.nativeEvent.progress)}
        onNavigationStateChange={(s) => {
          setCanBack(!!s.canGoBack);
          if (s.url) setUrl(s.url);
        }}
        onError={() => setFailed(true)}
        onRenderProcessGone={() => {
          setFailed(true);
          return true;
        }}
        // keep ordinary links inside; app links (intent:, market:, mailto:) aren't loaded
        originWhitelist={['http://*', 'https://*']}
        setSupportMultipleWindows={false}
        forceDarkOn={t.dark}
      />
    </View>
  );
}

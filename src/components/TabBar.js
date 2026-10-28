import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { FlatBackdropContext, Glass, GlassShadow } from './Glass';

function tick() {
  Haptics.selectionAsync().catch(() => {});
}

export const TABS = [
  { key: 'matches', label: 'Matches', icon: 'football' },
  { key: 'leagues', label: 'Leagues', icon: 'trophy' },
  { key: 'picks', label: 'AI Picks', icon: 'sparkles' },
  { key: 'favorites', label: 'Favorites', icon: 'star' },
  { key: 'search', label: 'Search', icon: 'search' },
];

// Floating glass capsule with a glass "lens" behind the selected tab. The lens can be dragged
// along the bar like on iOS: it follows your finger, lights up the tab under it, ticks as it
// crosses tabs, and selects the tab you let go on. A plain tap still selects straight away.
export default function TabBar({ tabs, active, onChange, badges = {} }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, tabs.findIndex((x) => x.key === active));
  const pos = useRef(new Animated.Value(index)).current;
  const lift = useRef(new Animated.Value(0)).current; // 0 resting, 1 while the finger is down
  const [hover, setHover] = useState(-1);
  const st = useRef({ itemW: 0, n: tabs.length, hover: -1, dragging: false, startX: 0, tabs, onChange, index });
  st.current.n = tabs.length;
  st.current.tabs = tabs;
  st.current.onChange = onChange;
  st.current.index = index;

  const itemW = width ? (width - 8) / tabs.length : 0;
  st.current.itemW = itemW;

  useEffect(() => {
    if (st.current.dragging) return;
    Animated.spring(pos, { toValue: index, useNativeDriver: true, speed: 16, bounciness: 8 }).start();
  }, [index, pos]);

  const slotAt = (x) => {
    const { itemW: w, n } = st.current;
    if (!w) return 0;
    return Math.min(n - 1, Math.max(0, Math.floor((x - 4) / w)));
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const x = e.nativeEvent.locationX;
          const slot = slotAt(x);
          st.current.dragging = false;
          st.current.startX = x;
          st.current.hover = slot;
          setHover(slot);
          tick();
          Animated.spring(lift, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
        },
        onPanResponderMove: (e, g) => {
          const { itemW: w, n } = st.current;
          if (!w) return;
          if (!st.current.dragging && Math.abs(g.dx) < 6) return;
          if (!st.current.dragging) {
            st.current.dragging = true;
            pos.stopAnimation();
          }
          const x = st.current.startX + g.dx;
          // lens centre follows the finger, a little rubber band past the ends
          let p = (x - 4) / w - 0.5;
          if (p < 0) p = p * 0.3;
          if (p > n - 1) p = n - 1 + (p - (n - 1)) * 0.3;
          pos.setValue(p);
          const slot = slotAt(x);
          if (slot !== st.current.hover) {
            st.current.hover = slot;
            setHover(slot);
            tick();
          }
        },
        onPanResponderRelease: () => finish(true),
        onPanResponderTerminate: () => finish(false),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pos, lift]
  );

  const finish = (commit) => {
    const slot = st.current.hover;
    st.current.dragging = false;
    st.current.hover = -1;
    setHover(-1);
    Animated.spring(lift, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 10 }).start();
    const target = commit && slot >= 0 ? slot : st.current.index;
    Animated.spring(pos, { toValue: target, useNativeDriver: true, speed: 16, bounciness: 8 }).start();
    if (commit && slot >= 0) {
      const key = st.current.tabs[slot].key;
      if (slot !== st.current.index) tick();
      st.current.onChange(key);
    }
  };

  const lensScale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const lensScaleY = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <GlassShadow radius={32} style={{ flex: 1 }}>
        <Glass blur vivid outline radius={32} intensity={100} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: 62 }}>
          {itemW > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                width: itemW,
                bottom: 4,
                transform: [{ translateX: Animated.multiply(pos, itemW) }, { scaleX: lensScale }, { scaleY: lensScaleY }],
              }}
            >
              {/* the pill sits on the tab bar, not on the page, so it keeps the
                  glass material in every background mode and carries a shadow
                  40% lighter than the one small controls get */}
              <FlatBackdropContext.Provider value={false}>
                <Glass
                  radius={27}
                  selected
                  style={{ flex: 1, boxShadow: `0px 1px 4px rgba(0,0,0,${t.dark ? 0.126 : 0.034})` }}
                  tint={t.dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.06)'}
                  tintOpacity={0.9}
                />
              </FlatBackdropContext.Provider>
            </Animated.View>
          ) : null}
          <View style={{ flexDirection: 'row', flex: 1, paddingHorizontal: 4 }} {...responder.panHandlers}>
            {tabs.map((tab, i) => {
              const on = hover >= 0 ? i === hover : tab.key === active;
              const color = on ? t.blue : t.text;
              return (
                <View key={tab.key} style={styles.item} pointerEvents="none">
                  <View style={{ transform: [{ scale: hover === i ? 1.1 : 1 }] }}>
                    <Ionicons name={tab.icon === 'search' ? 'search' : on ? tab.icon : tab.icon + '-outline'} size={tabs.length > 5 ? 22 : 24} color={color} />
                    {badges[tab.key] ? (
                      <View style={[styles.badge, { backgroundColor: t.red }]}>
                        <Text style={styles.badgeText}>{badges[tab.key] > 99 ? '99+' : badges[tab.key]}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.label, { color }]} numberOfLines={1} allowFontScaling={false}>
                    {tab.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </Glass>
      </GlassShadow>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'flex-end' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, fontWeight: '600', marginTop: 2, letterSpacing: -0.1 },
  badge: { position: 'absolute', top: -4, right: -12, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});

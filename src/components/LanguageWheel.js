// iOS-style wheel picker for the app language, in a centred sheet with a Done button.
// The list repeats end-to-end, so it scrolls forever in both directions.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Touch';
import { useTheme } from '../theme';
import { tap } from '../haptics';
import { LANGUAGES } from '../i18n';

const ITEM = 60;
const VISIBLE = 5; // rows shown; the middle one is selected
const PAD = ITEM * Math.floor(VISIBLE / 2);
const REPEAT = 41; // copies of the list (odd, so there's a true middle)

const label = (l) => (l.code === 'system' ? 'System language' : l.native);

export function LanguageWheel({ visible, value, onDone, onClose }) {
  const t = useTheme();
  const n = LANGUAGES.length;
  const data = useMemo(() => Array.from({ length: n * REPEAT }, (_, i) => ({ l: LANGUAGES[i % n], i })), [n]);
  const start = Math.max(0, LANGUAGES.findIndex((l) => l.code === (value || 'system')));
  const mid = n * Math.floor(REPEAT / 2);
  const [sel, setSel] = useState(start);
  const y = useRef(new Animated.Value((mid + start) * ITEM)).current;
  const list = useRef(null);
  const last = useRef(start);

  useEffect(() => {
    if (!visible) return;
    setSel(start);
    last.current = start;
    y.setValue((mid + start) * ITEM);
    requestAnimationFrame(() => list.current && list.current.scrollToOffset({ offset: (mid + start) * ITEM, animated: false }));
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y } } }], {
    useNativeDriver: true,
    listener: (e) => {
      const k = (((Math.round(e.nativeEvent.contentOffset.y / ITEM)) % n) + n) % n;
      if (k !== last.current) {
        last.current = k;
        setSel(k);
        tap();
      }
    },
  });

  // keep the scroll position near the middle copy so it never reaches an end
  const recenter = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM);
    if (idx < n * 5 || idx > n * (REPEAT - 5)) {
      const off = (mid + (((idx % n) + n) % n)) * ITEM;
      list.current && list.current.scrollToOffset({ offset: off, animated: false });
    }
  };

  const renderItem = ({ item }) => {
    const c = item.i * ITEM;
    const range = [c - 2 * ITEM, c - ITEM, c, c + ITEM, c + 2 * ITEM];
    const opacity = y.interpolate({ inputRange: range, outputRange: [0.18, 0.45, 1, 0.45, 0.18], extrapolate: 'clamp' });
    const scale = y.interpolate({ inputRange: range, outputRange: [0.82, 0.9, 1, 0.9, 0.82], extrapolate: 'clamp' });
    const rotateX = y.interpolate({ inputRange: range, outputRange: ['40deg', '22deg', '0deg', '-22deg', '-40deg'], extrapolate: 'clamp' });
    return (
      <Pressable
        feedback="none"
        onPress={() => list.current && list.current.scrollToOffset({ offset: item.i * ITEM, animated: true })}
        style={{ height: ITEM, justifyContent: 'center', alignItems: 'center' }}
      >
        <Animated.View style={{ opacity, transform: [{ perspective: 600 }, { rotateX }, { scale }] }}>
          <Text style={{ color: t.text, fontSize: 24, fontWeight: '600' }}>{label(item.l)}</Text>
        </Animated.View>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable feedback="none" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.28)' }]} />
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 22 }} pointerEvents="box-none">
        <View
          style={{
            backgroundColor: t.card,
            borderRadius: 44,
            borderWidth: 1.5,
            borderColor: t.dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.10)',
            paddingTop: 22,
            paddingBottom: 18,
            paddingHorizontal: 18,
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 30,
            shadowOffset: { width: 0, height: 12 },
            elevation: 16,
          }}
        >
          <Text style={{ color: t.text, fontSize: 21, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>Language</Text>
          <View style={{ height: ITEM * VISIBLE }}>
            {/* selection pill behind the middle row */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: PAD,
                height: ITEM,
                borderRadius: ITEM / 2,
                borderWidth: 1.5,
                borderColor: t.dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.14)',
                backgroundColor: t.dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.6)',
              }}
            />
            <Animated.FlatList
              ref={list}
              data={data}
              keyExtractor={(it) => String(it.i)}
              renderItem={renderItem}
              getItemLayout={(_, i) => ({ length: ITEM, offset: ITEM * i, index: i })}
              initialScrollIndex={mid + start}
              contentContainerStyle={{ paddingVertical: PAD }}
              showsVerticalScrollIndicator={false}
              snapToInterval={ITEM}
              decelerationRate="fast"
              onScroll={onScroll}
              scrollEventThrottle={16}
              onMomentumScrollEnd={recenter}
              initialNumToRender={VISIBLE + 4}
              windowSize={7}
            />
          </View>
          <Pressable
            onPress={() => onDone(LANGUAGES[sel].code)}
            style={{ marginTop: 14, height: 58, borderRadius: 29, backgroundColor: t.blue, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: 19, fontWeight: '700' }}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

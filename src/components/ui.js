import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from './Touch';
import { Glass } from './Glass';
import { useTheme } from '../theme';
import { useNav } from '../nav';
import { tap } from '../haptics';

export function initials(name = '') {
  const parts = String(name).replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------- logo with initials fallback (the frosted tile from the contacts screen) ----------

export function Logo({ uri, name, size = 24, round = false }) {
  const t = useTheme();
  const [failed, setFailed] = useState(false);
  const r = round ? size / 2 : size * 0.28;
  if (uri && !failed) {
    return (
      <Image
        source={/sofascore/.test(uri) ? { uri, headers: { Referer: 'https://www.sofascore.com/', 'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36' } } : { uri }}
        style={{ width: size, height: size, borderRadius: round ? r : 0 }}
        contentFit={round ? 'cover' : 'contain'}
        cachePolicy="memory-disk"
        transition={120}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: t.dark ? '#2C2C2E' : '#E9E9EE', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: t.secondary, fontWeight: '700', fontSize: size * 0.38 }} allowFontScaling={false}>
        {initials(name)}
      </Text>
    </View>
  );
}

export function SportIcon({ name, size = 18, color }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

// ---------- glass controls ----------

export function GlassCircle({ icon, onPress, size = 46, color, iconSize = 22, active, mci }) {
  const t = useTheme();
  const Icon = mci ? MaterialCommunityIcons : Ionicons;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress && onPress();
      }}
      hitSlop={6}
    >
      {({ pressed }) => (
        <Glass radius={size / 2} pressed={pressed} strong style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} tint={active ? t.blue : undefined} tintOpacity={0.95}>
          <Icon name={icon} size={iconSize} color={active ? '#fff' : color || t.text} />
        </Glass>
      )}
    </Pressable>
  );
}

/** Segmented glass control like the grid/list switch: options [{ key, icon?, label? }] */
export function Segmented({ options, value, onChange, height = 46 }) {
  const t = useTheme();
  return (
    <Glass radius={height / 2} strong style={{ height, flexDirection: 'row', padding: 4 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              tap();
              onChange(o.key);
            }}
            style={{ flex: o.label ? 1 : undefined }}
          >
            <View
              style={{
                height: height - 8,
                minWidth: height + 4,
                paddingHorizontal: o.label ? 14 : 0,
                borderRadius: (height - 8) / 2,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                backgroundColor: on ? (t.dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.07)') : 'transparent',
              }}
            >
              {o.icon ? <Ionicons name={o.icon} size={20} color={on ? t.text : t.secondary} /> : null}
              {o.label ? (
                <Text style={{ color: on ? t.text : t.secondary, fontWeight: on ? '700' : '500', fontSize: 14, marginLeft: o.icon ? 6 : 0 }} numberOfLines={1}>
                  {o.label}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </Glass>
  );
}

export function Pill({ label, active, onPress, color, icon, mci, small }) {
  const t = useTheme();
  const Icon = mci ? MaterialCommunityIcons : Ionicons;
  const bg = color || t.blue;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress && onPress();
      }}
    >
      <View
        style={{
          height: small ? 30 : 36,
          paddingHorizontal: small ? 12 : 16,
          borderRadius: 18,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: active ? bg : 'transparent',
        }}
      >
        {icon ? <Icon name={icon} size={small ? 15 : 17} color={active ? '#fff' : t.text} style={{ marginRight: label ? 6 : 0 }} /> : null}
        {label ? <Text style={{ color: active ? '#fff' : t.text, fontWeight: active ? '700' : '600', fontSize: small ? 13 : 15 }}>{label}</Text> : null}
      </View>
    </Pressable>
  );
}

export function Card({ children, style, padded = true, radius = 24 }) {
  return (
    <Glass radius={radius} strong style={[{ padding: padded ? 14 : 0, marginHorizontal: 16, marginBottom: 14 }, style]}>
      {children}
    </Glass>
  );
}

// ---------- headers ----------

export function LargeHeader({ title, left, right, subtitle }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 50 }}>
        <View style={{ flexDirection: 'row' }}>{left}</View>
        <View style={{ flexDirection: 'row', gap: 10 }}>{right}</View>
      </View>
      <Text style={{ fontSize: 40, fontWeight: '800', color: t.text, letterSpacing: -0.8, marginTop: 12 }} numberOfLines={1} adjustsFontSizeToFit>
        {title}
      </Text>
      {subtitle ? <Text style={{ color: t.secondary, fontSize: 15, marginTop: 2 }}>{subtitle}</Text> : null}
    </View>
  );
}

export function PushHeader({ title, right, subtitle }) {
  const t = useTheme();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
      <GlassCircle icon="chevron-back" onPress={nav.pop} />
      <View style={{ flex: 1, marginHorizontal: 12 }}>
        {title ? (
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text style={{ color: t.secondary, fontSize: 12, textAlign: 'center' }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right || <View style={{ width: 46 }} />}
    </View>
  );
}

/** Horizontal glass tab strip for detail screens */
export function TabStrip({ tabs, value, onChange }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
      <Glass radius={23} strong style={{ height: 46 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 4, alignItems: 'center' }}>
          {tabs.map((x) => {
            const on = x.key === value;
            return (
              <Pressable
                key={x.key}
                onPress={() => {
                  tap();
                  onChange(x.key);
                }}
              >
                <View
                  style={{
                    height: 38,
                    paddingHorizontal: 16,
                    borderRadius: 19,
                    justifyContent: 'center',
                    backgroundColor: on ? t.blue : 'transparent',
                  }}
                >
                  <Text style={{ color: on ? '#fff' : t.text, fontWeight: on ? '700' : '600', fontSize: 14 }}>{x.label}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </Glass>
    </View>
  );
}

// ---------- states ----------

export function Loading({ label }) {
  const t = useTheme();
  return (
    <View style={{ padding: 40, alignItems: 'center' }}>
      <ActivityIndicator color={t.blue} />
      {label ? <Text style={{ color: t.secondary, marginTop: 10 }}>{label}</Text> : null}
    </View>
  );
}

export function Empty({ icon = 'calendar-outline', title, body, action, onAction }) {
  const t = useTheme();
  return (
    <View style={{ padding: 36, alignItems: 'center' }}>
      <Ionicons name={icon} size={40} color={t.tertiary} />
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', marginTop: 12, textAlign: 'center' }}>{title}</Text>
      {body ? <Text style={{ color: t.secondary, fontSize: 14, marginTop: 6, textAlign: 'center', lineHeight: 20 }}>{body}</Text> : null}
      {action ? (
        <Pressable onPress={onAction} style={{ marginTop: 16 }}>
          <Glass radius={20} tint={t.blue} style={{ paddingHorizontal: 18, height: 40, justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{action}</Text>
          </Glass>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SectionTitle({ children, right }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, marginTop: 6, marginBottom: 8 }}>
      <Text style={{ color: t.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 }}>{children}</Text>
      {right}
    </View>
  );
}

export function FormPills({ form, size = 20, count = 5 }) {
  const t = useTheme();
  if (!form) return null;
  const letters = String(form).toUpperCase().replace(/[^WDLT]/g, '').slice(-count).split('');
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {letters.map((c, i) => (
        <View key={i} style={{ width: size, height: size, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: c === 'W' ? t.win : c === 'L' ? t.loss : t.draw }}>
          <Text style={{ color: '#fff', fontSize: size * 0.55, fontWeight: '800' }} allowFontScaling={false}>
            {c}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Two-sided comparison bar used for match statistics */
export function StatBar({ label, home, away, homeVal, awayVal, lowerBetter }) {
  const t = useTheme();
  const h = Number.isFinite(homeVal) ? homeVal : parseFloat(home) || 0;
  const a = Number.isFinite(awayVal) ? awayVal : parseFloat(away) || 0;
  const total = h + a || 1;
  const homeLead = lowerBetter ? h < a : h > a;
  const awayLead = lowerBetter ? a < h : a > h;
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={[st.statVal, { color: homeLead ? t.blue : t.text }]}>{home}</Text>
        <Text style={{ color: t.secondary, fontSize: 13, fontWeight: '600' }}>{label}</Text>
        <Text style={[st.statVal, { color: awayLead ? t.orange : t.text, textAlign: 'right' }]}>{away}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <View style={{ flex: 1, height: 7, borderRadius: 4, backgroundColor: t.track, alignItems: 'flex-end', overflow: 'hidden' }}>
          <View style={{ width: `${(h / total) * 100}%`, height: 7, borderRadius: 4, backgroundColor: homeLead ? t.blue : t.tertiary }} />
        </View>
        <View style={{ flex: 1, height: 7, borderRadius: 4, backgroundColor: t.track, overflow: 'hidden' }}>
          <View style={{ width: `${(a / total) * 100}%`, height: 7, borderRadius: 4, backgroundColor: awayLead ? t.orange : t.tertiary }} />
        </View>
      </View>
    </View>
  );
}

export function Row({ children, onPress, style, last }) {
  const t = useTheme();
  const body = (
    <View style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: t.separator }, style]}>{children}</View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} feedback="subtle">
      {body}
    </Pressable>
  );
}

export function Chevron() {
  const t = useTheme();
  return <Ionicons name="chevron-forward" size={18} color={t.tertiary} />;
}

export function Star({ on, onPress, size = 22 }) {
  const t = useTheme();
  return (
    <Pressable
      hitSlop={10}
      onPress={() => {
        tap();
        onPress();
      }}
    >
      <Ionicons name={on ? 'star' : 'star-outline'} size={size} color={on ? t.yellow : t.tertiary} />
    </Pressable>
  );
}

export function LiveDot() {
  const t = useTheme();
  return <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.live, marginRight: 5 }} />;
}

const st = StyleSheet.create({
  statVal: { fontSize: 15, fontWeight: '700', minWidth: 40 },
});

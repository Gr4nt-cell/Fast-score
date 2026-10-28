import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Touch';
import { tap as scrollTick } from '../haptics';
import { useTheme } from '../theme';
import { EXTENDED_BLUR, Glass } from './Glass';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_W = 37;            // 15% tighter than before

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

/**
 * Month row (previous · selected · next) above a scrolling row of days, the same calendar
 * navigation as the Calls screen of the dialer.
 * `marked` is a Set of `toDateString()` values for days that have something you follow.
 * `dim` greys out a day (e.g. nothing scheduled); `live` puts a red dot on today.
 */
export default function DateStrip({ value, onChange, marked, live, dimPast = false }) {
  const t = useTheme();
  const scroller = useRef(null);
  const [stripW, setStripW] = useState(0);
  const today = startOfDay(new Date());
  const y = value.getFullYear();
  const m = value.getMonth();

  const days = useMemo(() => Array.from({ length: daysIn(y, m) }, (_, i) => new Date(y, m, i + 1)), [y, m]);

  // keep the selected day centred
  useEffect(() => {
    if (!stripW || !scroller.current) return;
    const x = Math.max(0, (value.getDate() - 1) * DAY_W - stripW / 2 + DAY_W / 2);
    scroller.current.scrollTo({ x, animated: true });
  }, [value, stripW]);

  const select = (d) => {
    scrollTick();
    onChange(startOfDay(d));
  };

  const shiftMonth = (delta) => {
    const ny = y + Math.floor((m + delta) / 12);
    const nm = (((m + delta) % 12) + 12) % 12;
    // jumping back to this month lands on today; otherwise keep the same day number
    if (ny === today.getFullYear() && nm === today.getMonth()) return select(today);
    select(new Date(ny, nm, Math.min(value.getDate(), daysIn(ny, nm))));
  };

  const prev = new Date(y, m - 1, 1);
  const next = new Date(y, m + 1, 1);
  const monthLabel = (d) => MONTHS[d.getMonth()] + (d.getFullYear() !== today.getFullYear() ? ` ’${String(d.getFullYear()).slice(2)}` : '');

  return (
    <Glass radius={24} strong blur={EXTENDED_BLUR} vivid intensity={90} style={{ marginHorizontal: 16, paddingTop: 10, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 22, marginBottom: 7 }}>
        <Pressable onPress={() => shiftMonth(-1)} hitSlop={10}>
          <Text style={{ color: t.secondary, fontSize: 12, fontWeight: '500' }}>{monthLabel(prev)}</Text>
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: t.text, fontSize: 15.5, fontWeight: '700' }}>
            {monthLabel(value)}
          </Text>
          <View style={{ height: 2, width: 22, borderRadius: 2, backgroundColor: t.blue, marginTop: 2 }} />
        </View>
        <Pressable onPress={() => shiftMonth(1)} hitSlop={10}>
          <Text style={{ color: t.secondary, fontSize: 12, fontWeight: '500' }}>{monthLabel(next)}</Text>
        </Pressable>
      </View>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => setStripW(e.nativeEvent.layout.width)}
        contentContainerStyle={{ paddingHorizontal: 6 }}
      >
        {days.map((d) => {
          const selected = d.getDate() === value.getDate();
          const isToday = d.getTime() === today.getTime();
          const past = dimPast && d < today;
          const has = marked && marked.has(d.toDateString());
          return (
            <Pressable key={d.getDate()} onPress={() => select(d)} style={{ width: DAY_W, alignItems: 'center' }}>
              <Text allowFontScaling={false} style={{ color: t.tertiary, fontSize: 9.5, fontWeight: '600', marginBottom: 3 }}>{WEEKDAYS[d.getDay()]}</Text>
              <View
                style={{
                  width: 29,
                  height: 29,
                  borderRadius: 14.5,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? t.blue : 'transparent',
                  borderWidth: isToday && !selected ? 1.5 : 0,
                  borderColor: t.blue,
                }}
              >
                <Text
                  numberOfLines={1}
                  allowFontScaling={false}
                  style={{
                    color: selected ? '#fff' : isToday ? t.blue : past ? t.tertiary : t.text,
                    fontSize: 14,
                    width: 29,
                    textAlign: 'center',
                    fontWeight: selected || isToday ? '700' : '500',
                  }}
                >
                  {d.getDate()}
                </Text>
              </View>
              <View style={{ width: 4.5, height: 4.5, borderRadius: 2.25, marginTop: 3, backgroundColor: isToday && live ? t.live : has && !selected ? t.blue : 'transparent' }} />
            </Pressable>
          );
        })}
      </ScrollView>
    </Glass>
  );
}

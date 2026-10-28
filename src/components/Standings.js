import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Touch';
import { Logo } from './ui';
import { useTheme } from '../theme';
import { useNav } from '../nav';
import { sportByKey } from '../sports';

function columnsFor(sport, rows) {
  const has = (k) => rows.some((r) => r[k] != null && r[k] !== '');
  if (sportByKey(sport).draws && has('pts')) {
    return [
      ['P', 'gp'],
      ['W', 'w'],
      ['D', 'd'],
      ['L', 'l'],
      ['GD', 'gd'],
      ['PTS', 'pts'],
    ].filter(([, k]) => has(k));
  }
  if (sport === 'hockey') return [['GP', 'gp'], ['W', 'w'], ['L', 'l'], ['OTL', 'otl'], ['PTS', 'pts']].filter(([, k]) => has(k));
  const c = [['W', 'w'], ['L', 'l']];
  if (has('d') && rows.some((r) => r.d)) c.push(['T', 'd']);
  if (has('pct')) c.push(['PCT', 'pct']);
  if (has('gb')) c.push(['GB', 'gb']);
  if (!has('w') && has('pts')) return [['PTS', 'pts']];
  return c.filter(([, k]) => has(k));
}

function fmt(k, v) {
  if (v == null || v === '') return '–';
  if (k === 'pct') return Number(v).toFixed(3).replace(/^0/, '');
  if (k === 'gd' && Number(v) > 0) return '+' + v;
  return String(v);
}

/** League table. `highlight` is a list of team ids to emphasise (e.g. the two in a match). */
export default function Standings({ groups, sport, league, highlight = [] }) {
  const t = useTheme();
  const nav = useNav();
  if (!groups || !groups.length) return null;
  return (
    <View>
      {groups.map((g, gi) => {
        const cols = columnsFor(sport, g.rows);
        const notes = [];
        g.rows.forEach((r) => r.note && !notes.find((n) => n.text === r.note.text) && notes.push(r.note));
        return (
          <View key={gi} style={{ marginBottom: 14 }}>
            {g.name && groups.length > 1 ? <Text style={{ color: t.text, fontWeight: '800', fontSize: 15, marginBottom: 6, marginLeft: 4 }}>{g.name}</Text> : null}
            <View style={[styles.row, { borderBottomColor: t.separator }]}>
              <Text style={[styles.pos, { color: t.secondary }]}>#</Text>
              <Text style={{ flex: 1, color: t.secondary, fontSize: 12, fontWeight: '700' }}>Team</Text>
              {cols.map(([l]) => (
                <Text key={l} style={[styles.cell, { color: t.secondary, fontWeight: '700' }]}>
                  {l}
                </Text>
              ))}
            </View>
            {g.rows.map((r, i) => {
              const hi = highlight.includes(r.teamId);
              return (
                <Pressable
                  key={r.teamId + i}
                  feedback="subtle"
                  onPress={() => r.teamId && nav.push({ name: 'team', sport, league, id: r.teamId, title: r.name, logo: r.logo })}
                >
                  <View style={[styles.row, { borderBottomColor: t.separator, backgroundColor: hi ? (t.dark ? 'rgba(10,132,255,0.18)' : 'rgba(0,122,255,0.08)') : 'transparent', borderRadius: hi ? 10 : 0 }]}>
                    <View style={[styles.posBox, { backgroundColor: r.note && r.note.color ? '#' + String(r.note.color).replace('#', '') : 'transparent' }]}>
                      <Text style={{ color: r.note && r.note.color ? '#fff' : t.text, fontWeight: '700', fontSize: 12 }}>{r.rank || i + 1}</Text>
                    </View>
                    <Logo uri={r.logo} name={r.name} size={20} />
                    <Text style={{ flex: 1, marginLeft: 8, color: t.text, fontSize: 14, fontWeight: hi ? '800' : '500' }} numberOfLines={1}>
                      {r.short || r.name}
                    </Text>
                    {cols.map(([l, k]) => (
                      <Text key={l} style={[styles.cell, { color: t.text, fontWeight: k === 'pts' ? '800' : '500' }]}>
                        {fmt(k, r[k])}
                      </Text>
                    ))}
                  </View>
                </Pressable>
              );
            })}
            {notes.length ? (
              <View style={{ marginTop: 8, gap: 4 }}>
                {notes.map((n) => (
                  <View key={n.text} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: n.color ? '#' + String(n.color).replace('#', '') : t.tertiary, marginRight: 6 }} />
                    <Text style={{ color: t.secondary, fontSize: 12 }}>{n.text}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  pos: { width: 30, fontSize: 12, fontWeight: '700' },
  posBox: { width: 24, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  cell: { width: 34, textAlign: 'center', fontSize: 13, fontVariant: ['tabular-nums'] },
});

export { ScrollView };

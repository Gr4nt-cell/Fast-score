import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './ui';
import { Text } from './Text';
import { Pressable } from './Touch';
import { useTheme } from '../theme';

// Do not simulate an MSport feed or invent an undocumented tracker endpoint.
// Automated access currently returns an anti-bot page, not a live-action payload.
export default function MSportLiveAction({ match }) {
  const t = useTheme();
  const [error, setError] = useState('');
  if (match.sport !== 'soccer' || match.state !== 'in') return null;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="radio-outline" size={20} color={t.blue} />
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '800' }}>MSport live action</Text>
      </View>
      <Text style={{ color: t.secondary, fontSize: 13, lineHeight: 19, marginTop: 10 }}>
        MSport live-action data is not connected. Open MSport to check coverage for this match.
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Open MSport Ghana"
        onPress={() => {
          setError('');
          Linking.openURL('https://www.msport.com/gh/').catch(() => setError('Unable to open MSport. Please try again.'));
        }}
        style={{ paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}
      >
        <Text style={{ color: t.blue, fontSize: 14, fontWeight: '700' }}>Open MSport</Text>
        <Ionicons name="open-outline" size={16} color={t.blue} />
      </Pressable>
      {error ? <Text style={{ color: t.red, fontSize: 12 }}>{error}</Text> : null}
    </Card>
  );
}

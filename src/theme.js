import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

// True when the solid backdrop is painted behind the screens.
// Screens fill with t.bg, so in that mode bg turns transparent and the
// solid colour moves to t.solidBg.
export const GlassBackdropContext = createContext(false);

const light = {
  dark: false,
  bg: '#F5F7FC',
  liquidBackground: {
    base: '#F5F7FC',
    blooms: [
      { id: 'sky', cx: '10%', cy: '18%', r: '78%', color: '#8FB8FF', opacity: 0.84 },
      { id: 'rose', cx: '100%', cy: '45%', r: '84%', color: '#F6B7D0', opacity: 0.78 },
      { id: 'lilac', cx: '0%', cy: '76%', r: '72%', color: '#C8B9FF', opacity: 0.58 },
      { id: 'aqua', cx: '82%', cy: '100%', r: '80%', color: '#9CE5D7', opacity: 0.78 },
      { id: 'warm', cx: '88%', cy: '92%', r: '64%', color: '#F5DDB7', opacity: 0.24 },
    ],
  },
  grouped: 'rgba(255,255,255,0.256)',
  card: 'rgba(255,255,255,0.4864)',
  text: '#14232B',
  secondary: '#5F737C',
  tertiary: '#A9BAC1',
  separator: 'rgba(20,50,60,0.10)',
  fill: 'rgba(255,255,255,0.32)',
  blue: '#2F6BD8',
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',
  yellow: '#FFCC00',
  purple: '#AF52DE',
  live: '#E5162B',
  win: '#2FB869',
  draw: '#8A8A8E',
  loss: '#E5162B',
  track: 'rgba(20,23,31,0.08)',
  pitch: '#2E9E55',
  pitchLine: 'rgba(255,255,255,0.55)',
};

const dark = {
  dark: true,
  bg: '#000000',
  liquidBackground: {
    base: '#000000',
    blooms: [],
  },
  grouped: '#000000',
  card: 'rgba(22,35,42,0.64)',
  text: '#EEF6F8',
  secondary: '#8DA2AA',
  tertiary: '#4A5E66',
  separator: 'rgba(255,255,255,0.10)',
  fill: 'rgba(24,38,45,0.64)',
  blue: '#6FA8FF',
  green: '#30D158',
  red: '#FF453A',
  orange: '#FF9F0A',
  yellow: '#FFD60A',
  purple: '#BF5AF2',
  live: '#FF453A',
  win: '#30D158',
  draw: '#8D8D93',
  loss: '#FF453A',
  track: 'rgba(255,255,255,0.10)',
  pitch: '#1F6B3B',
  pitchLine: 'rgba(255,255,255,0.4)',
};

const lightGlass = { ...light, bg: 'transparent', solidBg: light.bg };
const darkGlass = { ...dark, bg: 'transparent', solidBg: dark.bg };
light.solidBg = light.bg;
dark.solidBg = dark.bg;

export function useTheme() {
  const isDark = useColorScheme() === 'dark';
  const glass = useContext(GlassBackdropContext);
  return useMemo(() => (glass ? (isDark ? darkGlass : lightGlass) : isDark ? dark : light), [glass, isDark]);
}

export const TAB_BAR_SPACE = 96;

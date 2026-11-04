import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

// True when the solid backdrop is painted behind the screens.
// Screens fill with t.bg, so in that mode bg turns transparent and the
// solid colour moves to t.solidBg.
export const GlassBackdropContext = createContext(false);

const light = {
  dark: false,
  bg: '#FFFFFF',
  liquidBackground: { base: '#FFFFFF', blooms: [] },
  grouped: '#FFFFFF',
  card: '#FFFFFF',
  text: '#000000',
  secondary: '#6B6B6B',
  tertiary: '#A3A3A3',
  separator: 'rgba(0,0,0,0.10)',
  fill: '#F2F2F2',
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
  track: '#F2F2F2',
  pitch: '#2E9E55',
  pitchLine: 'rgba(255,255,255,0.55)',
};

const dark = {
  dark: true,
  bg: '#000000',
  liquidBackground: { base: '#000000', blooms: [] },
  grouped: '#000000',
  card: '#161616',
  text: '#FFFFFF',
  secondary: '#9A9A9A',
  tertiary: '#5C5C5C',
  separator: 'rgba(255,255,255,0.12)',
  fill: '#222222',
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
  track: '#222222',
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

// Tab screens now end just above the dock (see App.js), so lists only need a little air at the end.
export const TAB_BAR_SPACE = 0;

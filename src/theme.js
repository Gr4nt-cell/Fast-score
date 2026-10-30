import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

// True when the solid backdrop is painted behind the screens.
// Screens fill with t.bg, so in that mode bg turns transparent and the
// solid colour moves to t.solidBg.
export const GlassBackdropContext = createContext(false);

const light = {
  dark: false,
  bg: '#FFFFFF',
  grouped: '#F4F7F8',
  card: '#FFFFFF',
  text: '#14232B',
  secondary: '#5F737C',
  tertiary: '#A9BAC1',
  separator: 'rgba(20,50,60,0.10)',
  fill: '#EDF3F5',
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
  bg: '#0B1418',
  grouped: '#0B1418',
  card: '#16232A',
  text: '#EEF6F8',
  secondary: '#8DA2AA',
  tertiary: '#4A5E66',
  separator: 'rgba(255,255,255,0.10)',
  fill: '#18262D',
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

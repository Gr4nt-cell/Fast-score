import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

// True when the soft pastel glass backdrop is painted behind the screens.
// Screens fill with t.bg, so in that mode bg turns transparent and the
// solid colour moves to t.solidBg.
export const GlassBackdropContext = createContext(false);

const light = {
  dark: false,
  bg: '#F6FAFB',
  grouped: '#EEF4F6',
  card: '#FDFEFE',
  text: '#14232B',
  secondary: '#5F737C',
  tertiary: '#A9BAC1',
  separator: 'rgba(20,50,60,0.10)',
  fill: '#E7F0F2',
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

// Pastel field behind the glass: cyan sky, coral drift, mint floor.
export function backdropColors(isDark) {
  return isDark
    ? { base: ['#0E2430', '#0D1A20', '#0F2621'], cyan: '#2B7FA3', coral: '#9A4E48', mint: '#2E7A5C' }
    : { base: ['#B9E6F7', '#E6F2F5', '#C9EEDB'], cyan: '#8FD8F5', coral: '#F6B9A8', mint: '#A6E8C2' };
}

export const TAB_BAR_SPACE = 96;

import { useColorScheme } from 'react-native';

const light = {
  dark: false,
  bg: '#FFFFFF',
  grouped: '#F2F2F7',
  card: '#FFFFFF',
  text: '#000000',
  secondary: '#8A8A8E',
  tertiary: '#C4C4C7',
  separator: '#E3E3E8',
  fill: '#EEEEF0',
  blue: '#007AFF',
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
  grouped: '#000000',
  card: '#1C1C1E',
  text: '#FFFFFF',
  secondary: '#8D8D93',
  tertiary: '#48484A',
  separator: '#2C2C2E',
  fill: '#1C1C1E',
  blue: '#0A84FF',
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

export function useTheme() {
  return useColorScheme() === 'dark' ? dark : light;
}

export const TAB_BAR_SPACE = 96;

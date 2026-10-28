import * as Haptics from 'expo-haptics';

export const tap = () => Haptics.selectionAsync().catch(() => {});
export const bump = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
export const success = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

// The native live-alert service (Android). Missing on other platforms / old builds.
const M = Platform.OS === 'android' ? requireOptionalNativeModule('FastLive') : null;
export default M;

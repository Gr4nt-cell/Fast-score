import React from 'react';
import { Platform, Text as RNText } from 'react-native';

/**
 * Text with Android's "simple" line breaking. Some phone makers' system fonts are measured a
 * little narrower than they draw, so the default (highQuality) breaker cut the last letters off
 * labels ("Footbal", "7:45 P", "Match…"). Every screen imports Text from here instead.
 */
export function Text({ textBreakStrategy, ...props }) {
  return <RNText textBreakStrategy={textBreakStrategy || (Platform.OS === 'android' ? 'simple' : undefined)} {...props} />;
}

export default Text;

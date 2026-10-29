import React from 'react';
import { Platform, Text as RNText } from 'react-native';
import { trChildren } from '../i18n';

/**
 * Text with Android's "simple" line breaking. Some phone makers' system fonts are measured a
 * little narrower than they draw, so the default (highQuality) breaker cut the last letters off
 * labels ("Footbal", "7:45 P", "Match…"). Every screen imports Text from here instead.
 * It also translates UI text into the chosen language (see src/i18n).
 */
export function Text({ textBreakStrategy, children, ...props }) {
  return (
    <RNText textBreakStrategy={textBreakStrategy || (Platform.OS === 'android' ? 'simple' : undefined)} {...props}>
      {trChildren(children)}
    </RNText>
  );
}

export default Text;

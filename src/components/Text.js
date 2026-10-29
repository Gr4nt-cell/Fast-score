import React from 'react';
import { Platform, StyleSheet, Text as RNText, TextInput as RNTextInput } from 'react-native';
import { trChildren } from '../i18n';

/**
 * Text with Android's "simple" line breaking. Some phone makers' system fonts are measured a
 * little narrower than they draw, so the default (highQuality) breaker cut the last letters off
 * labels ("Footbal", "7:45 P", "Match…"). Every screen imports Text from here instead.
 * It also translates UI text into the chosen language (see src/i18n).
 */
// App-wide text size: everything is set 10% smaller than its written size, except the bottom
// dock (which passes `unscaled`).
export const FONT_SCALE = 0.9;

export function scaleFont(style) {
  const f = StyleSheet.flatten(style);
  if (!f || (f.fontSize == null && f.lineHeight == null)) return style;
  const out = { ...f };
  if (f.fontSize != null) out.fontSize = Math.round(f.fontSize * FONT_SCALE * 2) / 2;
  if (f.lineHeight != null) out.lineHeight = Math.round(f.lineHeight * FONT_SCALE);
  return out;
}

export function Text({ textBreakStrategy, children, style, unscaled, ...props }) {
  return (
    <RNText textBreakStrategy={textBreakStrategy || (Platform.OS === 'android' ? 'simple' : undefined)} style={unscaled ? style : scaleFont(style)} {...props}>
      {trChildren(children)}
    </RNText>
  );
}

/** TextInput with the same 10% smaller text. */
export const TextInput = React.forwardRef(function TextInput({ style, ...props }, ref) {
  return <RNTextInput ref={ref} style={scaleFont(style)} {...props} />;
});

export default Text;

import React, { useRef } from 'react';
import { Animated, Pressable as RNPressable } from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

/**
 * Drop-in Pressable that always reacts to touch. Buttons that draw their own pressed look
 * (children as a function of `pressed`) keep it and also get a slight squeeze; everything else
 * gets a soft scale + dim so no touchable area feels dead. `feedback="none"` opts out.
 */
export function Pressable({ style, children, onPressIn, onPressOut, feedback, disabled, ...rest }) {
  const v = useRef(new Animated.Value(0)).current;
  const custom = typeof children === 'function';
  const interactive = !disabled && (rest.onPress || rest.onLongPress);
  const mode = feedback || (custom ? 'subtle' : 'full');
  const off = mode === 'none' || !interactive || typeof style === 'function';

  const to = (value) =>
    Animated.spring(v, {
      toValue: value,
      useNativeDriver: true,
      speed: value ? 60 : 28,
      bounciness: value ? 0 : 8,
    }).start();

  const anim = off
    ? null
    : {
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, mode === 'subtle' ? 0.985 : 0.94] }) }],
        opacity: mode === 'subtle' ? 1 : v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }),
      };

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      style={anim ? [style, anim] : style}
      onPressIn={(e) => {
        if (!off) to(1);
        if (onPressIn) onPressIn(e);
      }}
      onPressOut={(e) => {
        if (!off) to(0);
        if (onPressOut) onPressOut(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}

export default Pressable;

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { Animated, FlatList as NativeFlatList, Platform, ScrollView as NativeScrollView, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import * as ExpoBlur from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme';

// Liquid-glass style material: real background blur where Android supports it,
// a translucent fill, a bright specular rim on top and a darker lower edge.

const { BlurView } = ExpoBlur;
// Newer expo-blur (SDK 55+) blurs a BlurTargetView; SDK 54 uses experimentalBlurMethod.
export const BlurTargetView = ExpoBlur.BlurTargetView || View;
const HAS_TARGET_API = !!ExpoBlur.BlurTargetView;

/**
 * Real background blur costs a live snapshot of the view behind each surface,
 * and stacking too many of them has crashed this app before. These are the
 * surfaces allowed to use it: at most a few per screen, never inside a list.
 * Flip this to false to fall back to the translucent fill everywhere but the
 * tab bar.
 *
 * Off: three live blurs on the Calls tab (tab bar, date strip, Statistics
 * pill) took the app down on device. The tab bar keeps the only real blur;
 * the rest get the vivid translucent fill below, which costs nothing.
 */
export const EXTENDED_BLUR = false;

export const GlassTargetContext = createContext(null);
export const GlassModeContext = createContext('clear'); // 'clear' | 'tinted' | 'plain'
export const ScrollGlowContext = createContext(null);
// True when the app background is Plain. Glass relies on the colour field
// behind it to show its shape; over flat white or flat black there is nothing
// to refract, so panels need a crisp edge and a shadow to read at all.
export const FlatBackdropContext = createContext(false);

const GLOW_NATIVE_DRIVER = Platform.OS !== 'web';

export function ScrollGlowProvider({ children }) {
  const phase = useRef(new Animated.Value(0)).current;
  const strength = useRef(new Animated.Value(0)).current;
  const loop = useRef(null);
  const stopTimer = useRef(null);
  const active = useRef(false);

  const pulse = useCallback(() => {
    if (stopTimer.current) clearTimeout(stopTimer.current);

    if (!active.current) {
      active.current = true;
      phase.setValue(0);
      loop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(phase, {
            toValue: 1,
            duration: 1250,
            useNativeDriver: GLOW_NATIVE_DRIVER,
          }),
          Animated.timing(phase, {
            toValue: 0,
            duration: 1250,
            useNativeDriver: GLOW_NATIVE_DRIVER,
          }),
        ]),
      );
      loop.current.start();
      Animated.timing(strength, {
        toValue: 1,
        duration: 180,
        useNativeDriver: GLOW_NATIVE_DRIVER,
      }).start();
    }

    stopTimer.current = setTimeout(() => {
      active.current = false;
      loop.current?.stop();
      loop.current = null;
      Animated.timing(strength, {
        toValue: 0,
        duration: 420,
        useNativeDriver: GLOW_NATIVE_DRIVER,
      }).start(({ finished }) => {
        if (finished && !active.current) phase.setValue(0);
      });
    }, 320);
  }, [phase, strength]);

  useEffect(
    () => () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
      loop.current?.stop();
    },
    [],
  );

  const value = useMemo(() => ({ phase, strength, pulse }), [phase, strength, pulse]);
  return <ScrollGlowContext.Provider value={value}>{children}</ScrollGlowContext.Provider>;
}

function useScrollGlowHandler(onScroll) {
  const scrollGlow = useContext(ScrollGlowContext);
  return useCallback(
    (event) => {
      scrollGlow?.pulse();
      onScroll?.(event);
    },
    [onScroll, scrollGlow],
  );
}

export function ScrollGlowScrollView({ onScroll, scrollEventThrottle = 16, ...props }) {
  const handleScroll = useScrollGlowHandler(onScroll);
  return <NativeScrollView {...props} onScroll={handleScroll} scrollEventThrottle={scrollEventThrottle} />;
}

export function ScrollGlowFlatList({ onScroll, scrollEventThrottle = 16, ...props }) {
  const handleScroll = useScrollGlowHandler(onScroll);
  return <NativeFlatList {...props} onScroll={handleScroll} scrollEventThrottle={scrollEventThrottle} />;
}

/**
 * Edge and shadow that lift a panel off a flat background.
 *
 * `soft` is for a group of small controls — a row of dial keys casting a full
 * panel shadow each reads as far heavier than one shadow under one panel, so
 * they get a shallower one and end up looking like the date strip.
 */
function lift(dark, soft) {
  // boxShadow, not elevation: Android's elevation shadow is traced from a
  // polygonal approximation of the view's outline, which turned the round keys
  // into decagons. boxShadow follows the border radius exactly, so a circle
  // casts a circle. (React Native 0.76+ on Android.)
  const a = soft ? (dark ? 0.18 : 0.055) : dark ? 0.32 : 0.12;
  const y = soft ? 2 : 4;
  const blur = soft ? 6 : 12;
  return {
    borderColor: dark ? 'rgba(255,255,255,0.24)' : 'rgba(38,67,82,0.18)',
    boxShadow: `0px ${y}px ${blur}px rgba(0,0,0,${a})`,
  };
}

function blurProps(target) {
  if (Platform.OS !== 'android') return {};
  if (HAS_TARGET_API) return target ? { blurTarget: target, blurMethod: 'dimezisBlurViewSdk31Plus' } : null;
  return { experimentalBlurMethod: 'dimezisBlurView' };
}

export function Glass({
  children,
  style,
  radius = 999,
  blur = false,
  tint, // optional colour, e.g. green call button
  tintOpacity = 0.85,
  pressed = false,
  selected = false,
  dark: forceDark,
  intensity = 60,
  pointerEvents,
  onLayout,
  outline = false, // stronger edge, e.g. the floating tab bar
  strong = false, // clearly visible edge, e.g. the date strip and letter panel
  vivid = false, // wide blur that lets the colour behind bleed through (tab bar)
  soft = false, // shallower shadow on a flat background, for small repeated controls
  fillScale = 1, // thins the fill further, e.g. a button over a photo
}) {
  const t = useTheme();
  const mode = useContext(GlassModeContext);
  const target = useContext(GlassTargetContext);
  const scrollGlow = useContext(ScrollGlowContext);
  const flat = useContext(FlatBackdropContext);
  const dark = forceDark ?? t.dark;
  const plain = mode === 'plain';
  const surfaceOpacityScale = 0.64;
  // Android draws a shadow only for a view that has its own background, so a
  // lifted panel is opaque — over a flat backdrop there is nothing to see
  // through to anyway.
  const lifted = flat ? lift(dark, soft) : null;
  // a lifted panel is opaque, so a live blur behind it would never show
  const bp = blur && !plain && !flat ? blurProps(target) : null;
  const realBlur = !!bp;
  const tinted = mode === 'tinted';

  // Liquid Glass turned off: a solid card with a hairline edge, and none of
  // the blur, washes or specular highlights.
  if (plain) {
    return (
      <View
        pointerEvents={pointerEvents}
        onLayout={onLayout}
        style={[
          {
            borderRadius: radius,
            // no overflow clip here either, for the same outline reason
            backgroundColor: tint || (dark ? t.card : selected ? t.fill : t.card),
            opacity: tint ? tintOpacity * surfaceOpacityScale : 1,
            borderWidth: flat ? 1 : StyleSheet.hairlineWidth,
            borderColor: t.separator,
            transform: [{ scale: pressed ? 1.02 : 1 }],
            ...(lifted || {}),
          },
          style,
        ]}
      >
        {pressed ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]} />
        ) : null}
        {selected && !tint ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' }]} />
        ) : null}
        {children}
      </View>
    );
  }

  // fill strength: stronger when there's no real blur behind it, and in Tinted mode
  // Light mode is kept very clear (mostly see-through, defined by its rim);
  // dark mode needs a little more body to read on black.
  // "vivid" keeps the fill barely there so the blurred colour stays saturated
  // instead of being washed out by a milky layer.
  // Without real blur, "vivid" still stays well clear of the milky default so
  // the colour of the background washes keeps coming through.
  const alpha = vivid
    ? realBlur
      ? dark ? (tinted ? 0.34 : 0.14) : tinted ? 0.3 : 0.08
      : dark ? (tinted ? 0.66 : 0.38) : tinted ? 0.54 : 0.12
    : dark
    ? realBlur ? (tinted ? 0.62 : 0.3) : tinted ? 0.8 : 0.5
      : realBlur ? (tinted ? 0.48 : 0.16) : tinted ? 0.62 : strong ? 0.30 : 0.24;
  // Over a flat backdrop a translucent fill just shows more of the same white
  // or black, so the panel is given its own solid surface instead.
  const a = alpha * fillScale * surfaceOpacityScale;
  const fill = tint
    ? tint
    : flat
    ? dark ? '#1C1C1E' : '#FFFFFF'
    : dark ? `rgba(36,54,62,${a})` : `rgba(255,255,255,${a})`;
  const rimTop = dark ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.96)';
  const rim = flat
    ? lifted.borderColor
    : strong
    ? dark ? 'rgba(255,255,255,0.26)' : 'rgba(35,62,79,0.18)'
    : outline
    ? dark ? 'rgba(255,255,255,0.22)' : 'rgba(35,62,79,0.16)'
    : dark ? 'rgba(255,255,255,0.14)' : 'rgba(35,62,79,0.13)';
  const edge = dark ? 'rgba(0,0,0,0.22)' : 'rgba(40,70,85,0.075)';
  const highlight = flat
    ? dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0)'
    : tint
    ? 'rgba(255,255,255,0.3)'
    : vivid
    ? dark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.55)'
    : dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.45)';

  // Android derives an elevation shadow from the view's outline, and a view
  // that also clips its children can hand it a coarse polygon instead of the
  // rounded shape — a circular key then casts a hexagon. So when a shadow is in
  // play the outer view is left plain (background, radius, shadow, nothing
  // else) and the clipping moves to a layer inside it.
  const decoration = (
    <>
      {realBlur ? (
        <BlurView
          {...bp}
          intensity={intensity}
          // the material tints add a heavy desaturated wash; the plain ones
          // keep the colour behind the glass
          tint={vivid ? (dark ? 'dark' : 'light') : dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fill, opacity: tint ? tintOpacity * surfaceOpacityScale : 1 }]} />
      {/* A low-contrast spectral band gives the clear surface a refracted-glass look. */}
      {!flat ? (
        <LinearGradient
          pointerEvents="none"
          colors={
            dark
              ? ['rgba(130,190,220,0.018)', 'rgba(125,183,210,0.07)', 'rgba(175,195,220,0.045)', 'rgba(255,255,255,0.015)']
              : ['rgba(114,183,210,0.025)', 'rgba(139,194,215,0.065)', 'rgba(187,205,224,0.04)', 'rgba(255,255,255,0.02)']
          }
          locations={[0, 0.34, 0.68, 1]}
          start={{ x: 0, y: 0.08 }}
          end={{ x: 1, y: 0.92 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius, opacity: vivid ? 0.75 : 0.52 }]}
        />
      ) : null}
      {!flat && scrollGlow && (strong || vivid || tint) ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: scrollGlow.strength.interpolate({
                inputRange: [0, 1],
                outputRange: [0, vivid ? 0.2 : 0.15],
              }),
              transform: [
                {
                  translateX: scrollGlow.phase.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-88, 88],
                  }),
                },
                {
                  translateY: scrollGlow.phase.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, -8],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={[
              'rgba(255,255,255,0)',
              'rgba(255,255,255,0.06)',
              dark ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.3)',
              'rgba(255,255,255,0.06)',
              'rgba(255,255,255,0)',
            ]}
            locations={[0, 0.32, 0.5, 0.68, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
          />
        </Animated.View>
      ) : null}
      {/* specular highlight */}
      <LinearGradient
        pointerEvents="none"
        colors={[highlight, 'rgba(255,255,255,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.55 }}
        style={StyleSheet.absoluteFill}
      />
      {/* darker lower edge for depth */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0)', edge]}
        start={{ x: 0.5, y: 0.55 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.05)' }]} /> : null}
      {pressed ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.5)' }]} /> : null}
      {/* rim light: bright on top, softer around (on the outer view when lifted) */}
      {lifted ? null : (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: strong ? 1.6 : outline ? 1.2 : StyleSheet.hairlineWidth * 2, borderColor: rim }]} />
      )}
      {flat ? null : (
        <LinearGradient
          pointerEvents="none"
          colors={[rimTop, 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.12 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
      )}
    </>
  );

  if (lifted) {
    return (
      <View
        pointerEvents={pointerEvents}
        onLayout={onLayout}
        style={[
          {
            borderRadius: radius,
            backgroundColor: fill,
            borderWidth: strong || outline ? 1.4 : 1,
            transform: [{ scale: pressed ? 1.04 : 1 }],
          },
          lifted,
          style,
        ]}
      >
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
          {decoration}
        </View>
        {children}
      </View>
    );
  }

  return (
    <View
      pointerEvents={pointerEvents}
      onLayout={onLayout}
      style={[{ borderRadius: radius, transform: [{ scale: pressed ? 1.04 : 1 }], boxShadow: tint ? undefined : dark ? '0px 4px 14px rgba(0,0,0,0.25)' : '0px 5px 16px rgba(35,57,73,0.12)' }, style]}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
        {decoration}
      </View>
      {children}
    </View>
  );
}

function BloomField({ style }) {
  return (
    <ExpoImage
      source={require('../../assets/liquid-glass-background.png')}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={0}
      style={[StyleSheet.absoluteFill, style]}
    />
  );
}

/** Soft color field behind the app's translucent glass controls. */
export function Backdrop({ style }) {
  const t = useTheme();
  const backdrop = t.liquidBackground;
  const scrollGlow = useContext(ScrollGlowContext);
  const scrollGlowStyle = scrollGlow
    ? {
        opacity: scrollGlow.strength.interpolate({ inputRange: [0, 1], outputRange: [0, 0.48] }),
        transform: [
          {
            translateX: scrollGlow.phase.interpolate({
              inputRange: [0, 1],
              outputRange: [-18, 18],
            }),
          },
          {
            translateY: scrollGlow.phase.interpolate({
              inputRange: [0, 1],
              outputRange: [12, -12],
            }),
          },
          {
            scale: scrollGlow.strength.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.06],
            }),
          },
        ],
      }
    : null;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: backdrop.base }, style]}>
      {!t.dark ? <BloomField /> : null}
      {!t.dark && scrollGlow ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, scrollGlowStyle]}>
          <BloomField />
        </Animated.View>
      ) : null}
    </View>
  );
}

// Soft drop shadow wrapper (kept outside the clipped glass so it isn't cut off).
export function GlassShadow({ children, style, radius = 999 }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          borderRadius: radius,
          shadowColor: '#000',
          shadowOpacity: t.dark ? 0.46 : 0.12,
          shadowRadius: 17,
          shadowOffset: { width: 0, height: 7 },
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

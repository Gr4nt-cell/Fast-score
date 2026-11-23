import React, { createContext, useContext } from 'react';
import { Image, FlatList as NativeFlatList, ScrollView as NativeScrollView, Platform, StyleSheet, View } from 'react-native';
import * as ExpoBlur from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme';
import { glassBudget } from '../performanceProfile';

// Soft-glass material: a milky translucent fill, a delicate neutral rim and
// diffuse depth. Real background blur stays limited to supported surfaces.

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
export const GlassFillScaleContext = createContext(1);
export const PerformanceModeContext = createContext(false);
export const PerformanceProfileContext = createContext(null);
export const KeypadScreenShadingContext = createContext(false);
// True when the app background is Plain. Glass relies on the colour field
// behind it to show its shape; over flat white or flat black there is nothing
// to refract, so panels need a crisp edge and a shadow to read at all.
export const FlatBackdropContext = createContext(false);

function colorWithOpacity(color, opacity) {
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color || '');
  if (hex) {
    const value = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join('') : hex[1];
    const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
    return `rgba(${channels.join(',')},${opacity})`;
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(color || '');
  if (rgb) return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${Number(rgb[4] ?? 1) * opacity})`;
  return color;
}

/**
 * Edge and shadow that lift a panel off a flat background.
 *
 * `soft` is for a group of small controls — a row of dial keys casting a full
 * panel shadow each reads as far heavier than one shadow under one panel, so
 * they get a shallower one and end up looking like the date strip.
 */
function lift(dark, soft, liquid, performanceMode = false) {
  const borderColor = liquid
    ? dark ? 'rgba(220,238,255,0.25)' : 'rgba(255,255,255,0.78)'
    : dark ? 'rgba(220,228,240,0.14)' : 'rgba(80,86,96,0.14)';
  if (performanceMode) return { borderColor };

  // boxShadow, not elevation: Android's elevation shadow is traced from a
  // polygonal approximation of the view's outline, which turned the round keys
  // into decagons. boxShadow follows the border radius exactly, so a circle
  // casts a circle. (React Native 0.76+ on Android.)
  const a = liquid
    ? soft
      ? dark ? 0.19 : 0.09
      : dark ? 0.29 : 0.14
    : soft
      ? dark ? 0.16 : 0.045
      : dark ? 0.26 : 0.075;
  const y = soft ? 2 : 5;
  const blur = soft ? 8 : 18;
  return {
    borderColor,
    boxShadow: liquid && !dark
      ? `0px ${y}px ${blur}px rgba(57,83,70,${a})`
      : `0px ${y}px ${blur}px rgba(0,0,0,${a})`,
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
  outline = false, // extra edge contrast for floating navigation
  strong = true, // alphabet-bar rim across the app's glass surfaces
  vivid = true, // translucent colour bleed is the shared app-wide surface
  soft = false, // shallower shadow on a flat background, for small repeated controls
  liquid = true, // brighter bevel and cool glass tint across glass surfaces
  fillScale = 1, // thins the fill further, e.g. a button over a photo
  sheenScale = 1, // lowers the glass sheen without dimming its contents
  allowDarkShading = false,
}) {
  const t = useTheme();
  const mode = useContext(GlassModeContext);
  const target = useContext(GlassTargetContext);
  const glassFillScale = useContext(GlassFillScaleContext);
  const flat = useContext(FlatBackdropContext);
  const performanceMode = useContext(PerformanceModeContext);
  const profile = useContext(PerformanceProfileContext);
  const budget = glassBudget(profile || { lowEnd: performanceMode });
  const dark = forceDark ?? t.dark;
  const inKeypadScreen = useContext(KeypadScreenShadingContext);
  const showShading = true;
  // Explicitly themed surfaces (the photo/gradient call screen) keep their
  // existing material, as does every surface when the system theme is dark.
  const lightLiquid = liquid && !t.dark && !dark && forceDark == null;
  const surfaceFillScale = dark ? 1 : glassFillScale;
  const plain = mode === 'plain';
  const optimizedLight = performanceMode && !dark && forceDark == null;
  // Flat backdrops still get the translucent fill; the stronger rim and shadow
  // keep those surfaces distinct from the white or black behind them.
  const lifted = flat ? lift(dark, soft, liquid && !plain, budget.compact) : null;
  // a lifted panel is opaque, so a live blur behind it would never show
  const bp = blur && !plain && !flat && !budget.compact ? blurProps(target) : null;
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
            opacity: tint ? tintOpacity : 1,
            borderWidth: flat ? 1 : StyleSheet.hairlineWidth,
            borderColor: t.separator,
            transform: [{ scale: 1 }],
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
  // A soft frosted fill gives controls body without a hard reflective edge.
  // Vivid keeps more of the existing background visible; tinted stays denser.
  // Sheets without a live blur need enough body for their labels to read.
  const baseAlpha = vivid
    ? realBlur
      ? dark ? (tinted ? 0.48 : 0.2) : tinted ? 0.4 : 0.12
      : dark ? (tinted ? 0.6 : 0.34) : tinted ? 0.5 : 0.22
    : dark
    ? realBlur ? (tinted ? 0.74 : 0.56) : tinted ? 0.94 : 0.9
    : realBlur ? (tinted ? 0.88 : 0.76) : tinted ? 0.97 : 0.94;
  // Optimized mode skips layered highlights and shadows, so give light-mode
  // cards a stronger translucent body and rim to keep them easy to distinguish.
  const alpha = optimizedLight ? Math.max(baseAlpha, tinted ? 0.6 : vivid ? 0.36 : 0.92) : baseAlpha;
  // Flat surfaces keep their own faint colour field and rely on the raised rim
  // and shadow for definition, rather than becoming opaque.
  const a = alpha * fillScale * surfaceFillScale;
  const fill = tint
    ? colorWithOpacity(tint, tintOpacity * fillScale * (vivid ? 0.86 : 1))
    : flat
    ? dark ? `rgba(39,42,48,${a})` : `rgba(246,250,255,${a})`
    : dark ? `rgba(38,41,47,${a})` : `rgba(252,253,254,${a})`;
  const rimTop = dark ? 'rgba(255,255,255,0.32)' : liquid ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.55)';
  const rim = flat
    ? lifted.borderColor
    : optimizedLight
    ? liquid
      ? 'rgba(255,255,255,0.86)'
      : strong || outline
        ? 'rgba(45,66,94,0.26)'
        : 'rgba(45,66,94,0.2)'
    : liquid
    ? dark ? 'rgba(220,238,255,0.28)' : lightLiquid ? t.glassBorder : 'rgba(105,143,185,0.25)'
    : strong
    ? dark ? 'rgba(220,228,240,0.18)' : 'rgba(80,86,96,0.16)'
    : outline
    ? dark ? 'rgba(220,228,240,0.14)' : 'rgba(80,86,96,0.12)'
    : dark ? 'rgba(220,228,240,0.1)' : 'rgba(80,86,96,0.08)';
  const edge = dark ? 'rgba(0,0,0,0.35)' : lightLiquid ? 'rgba(72,105,85,0.035)' : liquid ? 'rgba(70,102,145,0.075)' : 'rgba(70,78,90,0.018)';
  const highlight = flat
    ? liquid ? dark ? 'rgba(255,255,255,0.17)' : 'rgba(255,255,255,0.78)' : dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0)'
    : tint
    ? liquid ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.14)'
    : vivid
    ? liquid ? dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.36)' : dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.24)'
    : liquid ? dark ? 'rgba(255,255,255,0.17)' : 'rgba(255,255,255,0.42)' : dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.2)';

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
      <View style={[StyleSheet.absoluteFill, { backgroundColor: lifted ? 'transparent' : fill }]} />
      {!budget.compact && lightLiquid && !tint ? (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(214,238,230,0.10)', 'rgba(255,255,255,0)', 'rgba(220,230,246,0.07)']}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: sheenScale }]}
        />
      ) : null}
      {/* specular highlight */}
      {!budget.compact && showShading ? <LinearGradient
        pointerEvents="none"
        colors={[highlight, 'rgba(255,255,255,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.55 }}
        style={[StyleSheet.absoluteFill, { opacity: sheenScale }]}
      /> : null}
      {budget.compact && showShading ? <Image source={require('../../assets/glass/static-sheen.png')} fadeDuration={0} resizeMode="stretch" pointerEvents="none" style={StyleSheet.absoluteFill} /> : null}
      {/* darker lower edge for depth */}
      {!budget.compact && showShading ? <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0)', edge]}
        start={{ x: 0.5, y: 0.55 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      /> : null}
      {selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.12)' }]} /> : null}
      {pressed ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.5)' }]} /> : null}
      {/* rim light: bright on top, softer around (on the outer view when lifted) */}
      {lifted ? null : (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: strong || outline ? (lightLiquid ? 1.15 : 1) : StyleSheet.hairlineWidth, borderColor: rim }]} />
      )}
      {budget.compact || (flat && !liquid) ? null : (
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
            borderWidth: 1,
            transform: [{ scale: 1 }],
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

  // On Android, clipping a view and drawing a boxShadow on that same view can
  // leave its children unpainted after Appearance.setColorScheme changes the
  // app from dark to light. Keep the shadow on the outer layer and clip only
  // the decorative glass layers; render labels and controls above that layer.
  if (lightLiquid && Platform.OS === 'android') {
    return (
      <View
        pointerEvents={pointerEvents}
        onLayout={onLayout}
        style={[
          { borderRadius: radius, transform: [{ scale: 1 }] },
          !budget.shadows ? null : { boxShadow: `0px ${soft ? 2 : 5}px ${soft ? 8 : 20}px rgba(57,83,70,${soft ? 0.055 : 0.075})` },
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
      style={[
        { borderRadius: radius, overflow: 'hidden', transform: [{ scale: 1 }] },
        style,
      ]}
    >
      {decoration}
      {children}
    </View>
  );
}

// Soft drop shadow wrapper (kept outside the clipped glass so it isn't cut off).
export function GlassShadow({ children, style, radius = 999 }) {
  const t = useTheme();
  const performanceMode = useContext(PerformanceModeContext);
  const profile = useContext(PerformanceProfileContext);
  const budget = glassBudget(profile || { lowEnd: performanceMode });
  return (
    <View
      style={[
        !budget.shadows ? { borderRadius: radius } : {
          borderRadius: radius,
          shadowColor: t.dark ? '#000' : '#395346',
          shadowOpacity: t.dark ? 0.32 : 0.07,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 8 },
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}


/** The keypad material, shared by light-mode cards and in-call controls. */

// Static sheen is intentional: scrolling never animates the full background or every card.
export const ScrollGlowContext = createContext(null);
export function ScrollGlowProvider({ children }) { return <ScrollGlowContext.Provider value={null}>{children}</ScrollGlowContext.Provider>; }
export function ScrollGlowScrollView(props) { return <NativeScrollView {...props} />; }
export function ScrollGlowFlatList(props) {
  const low = useContext(PerformanceModeContext);
  return <NativeFlatList {...(low ? {initialNumToRender:8,maxToRenderPerBatch:6,windowSize:5,updateCellsBatchingPeriod:50} : {})} {...props} />;
}
export function Backdrop({ style }) {
  const t=useTheme();
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:t.dark?'#000000':'#e6eee9'},style]}>
    {!t.dark ? <Image source={require('../../assets/glass/pearl-mist.webp')} resizeMode="cover" fadeDuration={0} style={StyleSheet.absoluteFill} /> : null}
  </View>;
}

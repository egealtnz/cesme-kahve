// Small, calm animations built on React Native's own Animated API (no extra native module, so they ship
// over the air). Every one of them steps aside when the phone's "Reduce motion" setting is on.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

const native = Platform.OS !== 'web';
let reduced = false;
AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { reduced = v; }).catch(() => undefined);
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => { reduced = v; });

/** True when the user asked the system for less motion. */
export function useReducedMotion(): boolean {
  const [r, setR] = useState(reduced);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setR).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setR);
    return () => sub?.remove?.();
  }, []);
  return r;
}

export const EASE_OUT = Easing.bezier(0.2, 0.8, 0.2, 1);

/**
 * Fades and lifts its content in when it first appears. `index` staggers items in a list
 * (capped, so long lists do not keep the user waiting).
 */
export function FadeIn({ children, index = 0, delay = 0, distance = 10, style }: {
  children: ReactNode; index?: number; delay?: number; distance?: number; style?: StyleProp<ViewStyle>;
}) {
  const [v] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) return;
    Animated.timing(v, { toValue: 1, duration: 320, delay: delay + Math.min(index, 8) * 45, easing: EASE_OUT, useNativeDriver: native }).start();
  }, [v, index, delay]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Springs in from small (stamps, badges, success ticks). */
export function Pop({ children, delay = 0, style, from = 0.4 }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle>; from?: number }) {
  const [v] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => Animated.spring(v, { toValue: 1, friction: 5, tension: 140, useNativeDriver: native }).start(), delay);
    return () => clearTimeout(t);
  }, [v, delay]);
  return (
    <Animated.View style={[style, { opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
      transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [from, 1] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** A quick "boing" whenever `trigger` changes (e.g. the cart count). */
export function Bump({ trigger, children, style }: { trigger: unknown; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [v] = useState(() => new Animated.Value(1));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduced) return;
    v.setValue(0.7);
    Animated.spring(v, { toValue: 1, friction: 3, tension: 220, useNativeDriver: native }).start();
  }, [trigger, v]);
  return <Animated.View style={[style, { transform: [{ scale: v }] }]}>{children}</Animated.View>;
}

/** Softly breathes (the "live" dot on an order in progress, loading placeholders). */
export function Pulse({ children, style, min = 0.35 }: { children?: ReactNode; style?: StyleProp<ViewStyle>; min?: number }) {
  const [v] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: min, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
      Animated.timing(v, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v, min]);
  return <Animated.View style={[style, { opacity: v }]}>{children}</Animated.View>;
}

/** A bar that fills smoothly to `progress` (0…1). */
export function ProgressBar({ progress, color, track, height = 6 }: { progress: number; color: string; track: string; height?: number }) {
  const [v] = useState(() => new Animated.Value(reduced ? progress : 0));
  useEffect(() => {
    Animated.timing(v, { toValue: Math.max(0, Math.min(1, progress)), duration: reduced ? 0 : 700, easing: EASE_OUT, useNativeDriver: false }).start();
  }, [v, progress]);
  return (
    <Animated.View style={{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }}
      accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
      <Animated.View style={{ height, borderRadius: height, backgroundColor: color,
        width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </Animated.View>
  );
}

/** Pressable that gently sinks when touched (cards, tiles). */
export function PressableScale({ children, style, scaleTo = 0.97, disabled, onPressIn, onPressOut, ...rest }: Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number;
}) {
  const [v] = useState(() => new Animated.Value(1));
  const to = (x: number) => { if (!reduced) Animated.spring(v, { toValue: x, friction: 7, tension: 300, useNativeDriver: native }).start(); };
  return (
    <Pressable disabled={disabled} {...rest}
      onPressIn={(e) => { to(scaleTo); onPressIn?.(e); }}
      onPressOut={(e) => { to(1); onPressOut?.(e); }}>
      <Animated.View style={[style, { transform: [{ scale: v }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Fades between children when `id` changes (status texts, swapping panels). */
export function CrossFade({ id, children, style }: { id: string | number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [v] = useState(() => new Animated.Value(1));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduced) return;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 260, easing: EASE_OUT, useNativeDriver: native }).start();
  }, [id, v]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>{children}</Animated.View>;
}

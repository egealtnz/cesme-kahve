import { useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { LucideIcon } from 'lucide-react-native';
import { Txt } from './Txt';
import { useReducedMotion } from './Motion';
import { color, radius, size, space } from '@/theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger';
type Size = 'lg' | 'md' | 'sm';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  label?: string;
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
};

const BG: Record<Variant, [string, string]> = {
  primary: [color.primary, color.primaryPressed],
  secondary: ['transparent', color.surfaceMuted],
  tertiary: ['transparent', color.surfaceMuted],
  accent: [color.secondary, color.secondaryPressed],
  danger: ['transparent', color.errorSoft],
};
const FG: Record<Variant, keyof typeof color> = {
  primary: 'onPrimary', secondary: 'ink', tertiary: 'ink', accent: 'onSecondary', danger: 'error',
};

export function Button({ label, variant = 'primary', size: s = 'lg', icon: Icon, loading, full, disabled, style, onPress, onPressIn, onPressOut, ...rest }: Props) {
  const isDisabled = disabled || loading;
  const fg = isDisabled ? 'inkDisabled' : FG[variant];
  const iconOnly = !label;
  const [pressed, setPressed] = useState(false);
  const [scale] = useState(() => new Animated.Value(1));
  const reduce = useReducedMotion();
  const springTo = (v: number) => {
    if (!reduce) Animated.spring(scale, { toValue: v, friction: 7, tension: 320, useNativeDriver: Platform.OS !== 'web' }).start();
  };
  return (
    <AnimatedPressable
      onPressIn={(e) => { setPressed(true); springTo(0.96); onPressIn?.(e); }}
      onPressOut={(e) => { setPressed(false); springTo(1); onPressOut?.(e); }}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      hitSlop={s === 'sm' ? 4 : 0}
      onPress={(e) => {
        if (variant === 'primary' || variant === 'accent') Haptics.selectionAsync().catch(() => undefined);
        onPress?.(e);
      }}
      style={[
        styles.base,
        styles[s],
        iconOnly && { width: s === 'lg' ? size.buttonLg : s === 'md' ? size.buttonMd : size.buttonSm, paddingHorizontal: 0, borderRadius: radius.full },
        { backgroundColor: isDisabled && variant !== 'tertiary' && variant !== 'danger' ? color.disabled : BG[variant][pressed ? 1 : 0] },
        variant === 'secondary' && !isDisabled && { borderWidth: 1.5, borderColor: color.primary },
        variant === 'danger' && { borderWidth: 1.5, borderColor: color.error },
        full && { alignSelf: 'stretch' },
        { transform: [{ scale }] },
        style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={color[fg]} /> : Icon ? <Icon size={s === 'sm' ? 18 : 22} color={color[fg]} strokeWidth={1.75} /> : null}
      {label ? (
        <View style={variant === 'tertiary' ? styles.underline : undefined}>
          <Txt variant={s === 'sm' ? 'label' : 'button'} color={fg} numberOfLines={1}>{label}</Txt>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], borderRadius: radius.md },
  lg: { minHeight: size.buttonLg, paddingHorizontal: space[5] },
  md: { minHeight: size.buttonMd, paddingHorizontal: space[4] },
  sm: { minHeight: size.buttonSm, paddingHorizontal: space[3], gap: space[1], borderRadius: radius.sm },
  underline: { borderBottomWidth: 1.5, borderBottomColor: color.secondary, paddingBottom: 1 },
});

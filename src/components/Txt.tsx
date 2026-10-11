import { Text, type TextProps } from 'react-native';
import { color as palette, type ColorName, type, type TypeVariant } from '@/theme/tokens';

type Props = TextProps & { variant?: TypeVariant; color?: ColorName; center?: boolean };

/** Text in one of the design system's type styles. Scales with the system font size (capped). */
export function Txt({ variant = 'body', color = 'ink', center, style, maxFontSizeMultiplier = 1.6, ...rest }: Props) {
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[type[variant], { color: palette[color] }, center && { textAlign: 'center' }, style]}
      {...rest}
    />
  );
}

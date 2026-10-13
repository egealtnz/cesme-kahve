import { Text, type TextProps } from 'react-native';
import { isEn } from '@/lib/i18n';
import { color as palette, type ColorName, type, type TypeVariant } from '@/theme/tokens';

type Props = TextProps & { variant?: TypeVariant; color?: ColorName; center?: boolean };

/** Text in one of the design system's type styles. Scales with the system font size (capped). */
export function Txt({ variant = 'body', color = 'ink', center, style, maxFontSizeMultiplier = 1.6, children, ...rest }: Props) {
  // Upper-case labels are converted here with the right language rules (Turkish "i" → "İ",
  // English "i" → "I"); the platform's own upper-casing follows the phone's locale instead.
  const plain = (c: unknown) => typeof c === 'string' || typeof c === 'number' || c === null || c === undefined || c === false;
  const upper = variant === 'overline' && (Array.isArray(children) ? children.every(plain) : plain(children));
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[type[variant], { color: palette[color] }, center && { textAlign: 'center' }, upper && { textTransform: 'none' }, style]}
      {...rest}
    >
      {upper
        ? (Array.isArray(children) ? children : [children]).filter((c) => c !== null && c !== undefined && c !== false).join('')
          .toLocaleUpperCase(isEn() ? 'en-US' : 'tr-TR')
        : children}
    </Text>
  );
}

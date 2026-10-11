/**
 * Çeşme Kahve design system — "Cream" (light) theme.
 * Same names and values as the design system's tokens.json; text pairs are WCAG AA checked there.
 */
export const color = {
  background: '#faf5ec',
  surface: '#fffdf8',
  surfaceMuted: '#f3ebdf',
  line: '#e8ddcd',
  lineStrong: '#8b7d6c',
  ink: '#00283e',
  inkMuted: '#4e6170',
  inkDisabled: '#9c9387',
  disabled: '#ebe3d6',
  primary: '#00283e',
  primaryPressed: '#0f3c58',
  onPrimary: '#fffdf8',
  secondary: '#ca812a',
  secondaryPressed: '#d99446',
  onSecondary: '#00283e',
  secondaryInk: '#8f5410',
  secondarySoft: '#f7e5cc',
  illustration: '#be9c79',
  success: '#23675a',
  successSoft: '#dcece5',
  warning: '#845b00',
  warningSoft: '#fbeac2',
  error: '#a5362a',
  errorSoft: '#f8e0da',
  scrim: 'rgba(0, 40, 62, 0.45)',
} as const;

export type ColorName = keyof typeof color;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;

export const radius = { xs: 6, sm: 12, md: 14, lg: 20, xl: 28, full: 999 } as const;

export const shadow = {
  sm: '0px 1px 2px rgba(0, 40, 62, 0.06), 0px 2px 8px rgba(0, 40, 62, 0.05)',
  md: '0px -1px 0px rgba(0, 40, 62, 0.05), 0px -8px 24px rgba(0, 40, 62, 0.07)',
  lg: '0px 12px 32px rgba(0, 40, 62, 0.14), 0px 2px 6px rgba(0, 40, 62, 0.08)',
} as const;

export const size = { touch: 44, buttonLg: 52, buttonMd: 44, buttonSm: 36, icon: 24, iconSm: 18 } as const;

/** Font files are static instances (React Native cannot use variable-font axes reliably). */
export const font = {
  serif: 'Fraunces-SemiBold',
  serifDisplay: 'Fraunces-Display',
  regular: 'DMSans-Regular',
  medium: 'DMSans-Medium',
  semibold: 'DMSans-SemiBold',
  bold: 'DMSans-Bold',
} as const;

export const type = {
  h1: { fontFamily: font.serifDisplay, fontSize: 32, lineHeight: 38, letterSpacing: -0.32 },
  h2: { fontFamily: font.serifDisplay, fontSize: 28, lineHeight: 34, letterSpacing: -0.28 },
  h3: { fontFamily: font.serif, fontSize: 24, lineHeight: 30 },
  h4: { fontFamily: font.serif, fontSize: 20, lineHeight: 26 },
  h5: { fontFamily: font.serif, fontSize: 18, lineHeight: 24 },
  h6: { fontFamily: font.serif, fontSize: 16, lineHeight: 22 },
  price: { fontFamily: font.serif, fontSize: 18, lineHeight: 24, fontVariant: ['tabular-nums'] as 'tabular-nums'[] },
  bodyLg: { fontFamily: font.regular, fontSize: 18, lineHeight: 28 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24 },
  bodySm: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  button: { fontFamily: font.semibold, fontSize: 16, lineHeight: 20, letterSpacing: 0.16 },
  label: { fontFamily: font.semibold, fontSize: 14, lineHeight: 18 },
  caption: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.12 },
  overline: { fontFamily: font.bold, fontSize: 11, lineHeight: 16, letterSpacing: 1.32, textTransform: 'uppercase' as const },
} as const;

export type TypeVariant = keyof typeof type;

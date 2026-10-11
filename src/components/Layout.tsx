import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Txt } from './Txt';
import { color, radius, shadow, space } from '@/theme/tokens';

export function Logo({ height = 44 }: { height?: number }) {
  return (
    <Image
      source={require('../../assets/images/logo.png')}
      style={{ height, width: (height * 1200) / 360 }}
      contentFit="contain"
      accessibilityLabel="Çeşme Kahve"
      accessibilityRole="image"
    />
  );
}

/** Header row with the logo centred; optional back button on the left and an action on the right. */
export function TopBar({ back, backLabel = 'Geri', right }: { back?: boolean | (() => void); backLabel?: string; right?: ReactNode }) {
  return (
    <View style={styles.topBar}>
      <View style={styles.topSide}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            onPress={typeof back === 'function' ? back : () => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: color.surfaceMuted }]}
          >
            <ChevronLeft size={24} color={color.ink} strokeWidth={1.75} />
          </Pressable>
        ) : null}
      </View>
      <Logo />
      <View style={[styles.topSide, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

type ScreenProps = ScrollViewProps & { children: ReactNode; footer?: ReactNode; scroll?: boolean; edges?: ('top' | 'bottom')[]; padded?: boolean };

/** A screen on the cream background with safe-area padding, optional sticky footer. */
export function Screen({ children, footer, scroll = true, edges = ['top'], padded = true, contentContainerStyle, ...rest }: ScreenProps) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[padded && styles.padded, { paddingBottom: space[12] }, contentContainerStyle]}
          {...rest}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, padded && styles.padded]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function SectionTitle({ eyebrow, title, action, style }: { eyebrow?: string; title: string; action?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.section, style]}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Txt variant="overline" color="secondaryInk">{eyebrow}</Txt> : null}
        <Txt variant="h3" accessibilityRole="header" style={{ marginTop: 4 }}>{title}</Txt>
      </View>
      {action}
    </View>
  );
}

export function Card({ children, style, tone = 'surface' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'surface' | 'soft' | 'eco' | 'primary' }) {
  const bg = tone === 'soft' ? color.secondarySoft : tone === 'eco' ? color.successSoft : tone === 'primary' ? color.primary : color.surface;
  return <View style={[styles.card, { backgroundColor: bg }, tone === 'surface' && { boxShadow: shadow.sm }, style]}>{children}</View>;
}

/** Tappable settings/list row: icon, label, optional value, chevron. */
export function ListRow({ icon: Icon, label, value, onPress, danger, last }: {
  icon: LucideIcon; label: string; value?: string; onPress: () => void; danger?: boolean; last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && { backgroundColor: color.surfaceMuted }]}
    >
      <Icon size={20} color={danger ? color.error : color.inkMuted} strokeWidth={1.75} />
      <Txt variant="body" color={danger ? 'error' : 'ink'} style={{ flex: 1 }}>{label}</Txt>
      {value ? <Txt variant="bodySm" color="inkMuted">{value}</Txt> : null}
      <ChevronRight size={20} color={color.inkMuted} strokeWidth={1.75} />
    </Pressable>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: color.line }} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  padded: { paddingHorizontal: space[4] },
  topBar: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topSide: { width: 72, justifyContent: 'center' },
  iconBtn: { width: 44, height: 44, marginLeft: -10, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  footer: { backgroundColor: color.surface, paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[3], boxShadow: shadow.md },
  section: { flexDirection: 'row', alignItems: 'flex-end', gap: space[3] },
  card: { borderRadius: radius.lg, padding: space[4] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingHorizontal: space[4] },
  rowLine: { borderBottomWidth: 1, borderBottomColor: color.line },
});

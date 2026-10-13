// Small building blocks shared by the owner (admin) screens.
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Txt } from './Txt';
import { Button } from './Button';
import { Screen, TopBar } from './Layout';
import { useAuth } from '@/state/auth';
import { color, radius, shadow, space } from '@/theme/tokens';
import { router } from 'expo-router';

/** Shows the screen only to admins (others see a short note). */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { staff, ready } = useAuth();
  if (!ready) return <Screen><TopBar back /></Screen>;
  if (!staff.some((s) => s.role === 'admin')) {
    return (
      <Screen>
        <TopBar back />
        <Txt variant="h2" style={{ marginTop: space[6] }}>Yetkin yok</Txt>
        <Txt variant="body" color="inkMuted" style={{ marginTop: space[2] }}>Bu bölüm yalnızca işletme yöneticileri içindir.</Txt>
        <Button label="Ana sayfa" variant="secondary" style={{ marginTop: space[5], alignSelf: 'flex-start' }} onPress={() => router.replace('/')} />
      </Screen>
    );
  }
  return <>{children}</>;
}

export function NavRow({ icon: Icon, title, body, onPress, right }: { icon: LucideIcon; title: string; body?: string; onPress: () => void; right?: ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={body ? `${title}: ${body}` : title} onPress={onPress}
      style={({ pressed }) => [styles.nav, pressed && { backgroundColor: color.surfaceMuted }]}>
      <View style={styles.navIcon}><Icon size={20} color={color.secondaryInk} strokeWidth={1.75} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label">{title}</Txt>
        {body ? <Txt variant="bodySm" color="inkMuted" numberOfLines={2}>{body}</Txt> : null}
      </View>
      {right}
      <ChevronRight size={20} color={color.inkMuted} strokeWidth={1.75} />
    </Pressable>
  );
}

/** Horizontal choice chips (single choice). */
export function Chips<T extends string | number | null>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label?: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" accessibilityLabel={label}
      contentContainerStyle={{ gap: space[2], paddingVertical: 2 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={[styles.chip, on && styles.chipOn]}>
            <Txt variant="label" color={on ? 'onPrimary' : 'ink'}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Chips where several can be on at once. */
export function MultiChips<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; label?: string;
}) {
  return (
    <View accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <Pressable key={o.value} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
            onPress={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            style={[styles.chip, on && styles.chipOn]}>
            <Txt variant="label" color={on ? 'onPrimary' : 'ink'}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.stat}>
      <Txt variant="h4" numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ['tabular-nums'] }}>{value}</Txt>
      <Txt variant="caption" color="inkMuted">{label}</Txt>
      {sub ? <Txt variant="caption" color="secondaryInk">{sub}</Txt> : null}
    </View>
  );
}

/** A horizontal bar for simple charts (value relative to max). */
export function Bar({ value, max, tone = color.secondary }: { value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: tone }]} />
    </View>
  );
}

export const adminStyles = StyleSheet.create({
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space[4], boxShadow: shadow.sm },
  h: { marginTop: space[6], marginBottom: space[3] },
});

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.md,
    backgroundColor: color.surface, boxShadow: shadow.sm,
  },
  navIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.secondarySoft, alignItems: 'center', justifyContent: 'center' },
  chip: { height: 36, paddingHorizontal: space[4], borderRadius: radius.full, backgroundColor: color.surfaceMuted, justifyContent: 'center' },
  chipOn: { backgroundColor: color.primary },
  stat: { flexBasis: '47%', flexGrow: 1, padding: space[3], borderRadius: radius.md, backgroundColor: color.surface, gap: 2 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: color.surfaceMuted, overflow: 'hidden', flex: 1 },
  barFill: { height: 8, borderRadius: 4 },
});

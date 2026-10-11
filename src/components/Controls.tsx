import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Txt } from './Txt';
import { color, radius, space } from '@/theme/tokens';

/** A labelled native switch row (accessible on both platforms). */
export function ToggleRow({ icon: Icon, title, body, value, onChange, tone = 'eco' }: {
  icon: LucideIcon; title: string; body?: string; value: boolean; onChange: (v: boolean) => void; tone?: 'eco' | 'soft';
}) {
  return (
    <View style={styles.toggle}>
      <View style={[styles.iconDisc, { backgroundColor: tone === 'eco' ? color.successSoft : color.surface }]}>
        <Icon size={20} color={tone === 'eco' ? color.success : color.ink} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }}>{title}</Txt>
        {body ? <Txt variant="bodySm" color="inkMuted">{body}</Txt> : null}
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: color.lineStrong, true: color.success }}
        thumbColor={color.surface}
        ios_backgroundColor={color.lineStrong}
      />
    </View>
  );
}

/** Radio-style option row. */
export function OptionRow({ selected, onPress, title, body, icon: Icon, right, disabled }: {
  selected: boolean; onPress: () => void; title: string; body?: string; icon?: LucideIcon; right?: ReactNode; disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.option, selected && styles.optionOn, pressed && { opacity: 0.85 }, disabled && { opacity: 0.5 }]}
    >
      {Icon ? (
        <View style={[styles.iconDisc, { backgroundColor: color.surface }]}><Icon size={20} color={color.ink} strokeWidth={1.75} /></View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }}>{title}</Txt>
        {body ? <Txt variant="bodySm" color="inkMuted">{body}</Txt> : null}
      </View>
      {right}
      <View style={[styles.radio, selected && { borderColor: color.primary }]}>{selected ? <View style={styles.dot} /> : null}</View>
    </Pressable>
  );
}

/** Checkbox row for consents. */
export function CheckRow({ checked, onChange, children, error }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; error?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={() => onChange(!checked)}
        style={styles.check}
        hitSlop={4}
      >
        <View style={[styles.box, checked && styles.boxOn, error ? { borderColor: color.error } : null]}>
          {checked ? <Txt variant="label" color="onPrimary" style={{ lineHeight: 16 }}>✓</Txt> : null}
        </View>
        <View style={{ flex: 1 }}>{children}</View>
      </Pressable>
      {error ? <Txt variant="bodySm" color="error" style={{ marginLeft: 32 }}>{error}</Txt> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] },
  iconDisc: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 64, paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.md, backgroundColor: color.background, borderWidth: 2, borderColor: 'transparent' },
  optionOn: { borderColor: color.primary },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: color.lineStrong, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.primary },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingVertical: 4 },
  box: { width: 20, height: 20, marginTop: 1, borderRadius: radius.xs - 2, borderWidth: 1.5, borderColor: color.lineStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface },
  boxOn: { backgroundColor: color.primary, borderColor: color.primary },
});

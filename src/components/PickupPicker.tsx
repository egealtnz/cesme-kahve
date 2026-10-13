// "Ne zaman alacaksın?" — as soon as possible, or a time later today / tomorrow (every 15 minutes, only
// while the branch is open). Pure UI: the server checks the chosen time again.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CalendarClock, Zap } from 'lucide-react-native';
import { Txt } from './Txt';
import { OptionRow } from './Controls';
import { branchState, clock, pickupSlots } from '@/lib/hours';
import type { Branch } from '@/lib/types';
import { color, radius, space } from '@/theme/tokens';

type Props = { branch: Branch; value: string | null; onChange: (iso: string | null) => void };

export function PickupPicker({ branch, value, onChange }: Props) {
  const st = branchState(branch);
  const slots = useMemo(() => pickupSlots(branch), [branch]);
  const hasToday = slots.some((s) => s.day === 0);
  const [day, setDay] = useState<0 | 1>(value && slots.find((s) => s.at.toISOString() === value)?.day === 1 ? 1 : hasToday ? 0 : 1);
  const later = value !== null || !st.orderNow;
  const visible = slots.filter((s) => s.day === day);

  const chooseLater = () => {
    if (value) return;
    const first = slots.find((s) => s.day === day) ?? slots[0];
    if (first) { setDay(first.day); onChange(first.at.toISOString()); }
  };

  return (
    <View style={{ gap: space[2] }} accessibilityRole="radiogroup">
      <OptionRow
        selected={!later}
        disabled={!st.orderNow}
        onPress={() => onChange(null)}
        icon={Zap}
        title="Hemen hazırlansın"
        body={st.orderNow ? `Yaklaşık ${st.waitMinutes} dakikada hazır${st.kind === 'busy' ? ' · şube şu an yoğun' : ''}` : st.label}
      />
      <OptionRow
        selected={later}
        disabled={slots.length === 0}
        onPress={chooseLater}
        icon={CalendarClock}
        title="Daha sonra alacağım"
        body={slots.length ? 'Bugün ya da yarın, istediğin saate hazırlayalım.' : 'Yakın zamanda uygun saat yok.'}
      />
      {later && slots.length ? (
        <View style={styles.box}>
          <View style={styles.days} accessibilityRole="tablist">
            {([0, 1] as const).map((d) => {
              const any = slots.some((s) => s.day === d);
              return (
                <Pressable key={d} accessibilityRole="tab" accessibilityState={{ selected: day === d, disabled: !any }} disabled={!any}
                  onPress={() => { setDay(d); const f = slots.find((s) => s.day === d); if (f) onChange(f.at.toISOString()); }}
                  style={[styles.day, day === d && styles.dayOn, !any && { opacity: 0.4 }]}>
                  <Txt variant="label" color={day === d ? 'ink' : 'inkMuted'}>{d === 0 ? 'Bugün' : 'Yarın'}</Txt>
                </Pressable>
              );
            })}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingVertical: space[1] }}>
            {visible.map((s) => {
              const iso = s.at.toISOString();
              const on = iso === value;
              return (
                <Pressable key={iso} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${day === 0 ? 'Bugün' : 'Yarın'} ${clock(s.at)}`}
                  onPress={() => onChange(iso)} style={[styles.slot, on && styles.slotOn]}>
                  <Txt variant="label" color={on ? 'onPrimary' : 'ink'} style={{ fontVariant: ['tabular-nums'] }}>{clock(s.at)}</Txt>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space[3], padding: space[3], borderRadius: radius.md, backgroundColor: color.surface },
  days: { flexDirection: 'row', padding: 4, borderRadius: radius.full, backgroundColor: color.surfaceMuted },
  day: { flex: 1, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: color.surface, boxShadow: '0px 1px 3px rgba(0, 40, 62, 0.12)' },
  slot: { minWidth: 72, height: 44, paddingHorizontal: space[3], borderRadius: radius.full, borderWidth: 1.5, borderColor: color.lineStrong, alignItems: 'center', justifyContent: 'center' },
  slotOn: { backgroundColor: color.primary, borderColor: color.primary },
});

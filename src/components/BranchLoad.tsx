// Busy mode for the counter: tell customers it's busy (+10/+20 min on the wait they see) or pause app orders
// for a while. Any staff member of the branch can use it; it switches itself off (busy: 2 hours, pause: as set).
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Gauge, PauseCircle, PlayCircle } from 'lucide-react-native';
import { Txt } from './Txt';
import { staffPauseOrders, staffSetBusy } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { branchState, busyExtra, clock } from '@/lib/hours';
import type { Branch } from '@/lib/types';
import { useToast } from '@/state/toast';
import { color, radius, space } from '@/theme/tokens';

export function BranchLoad({ branch, large }: { branch: Branch; large?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const st = branchState(branch);
  const extra = busyExtra(branch);
  const paused = st.kind === 'paused';

  const run = async (key: string, fn: () => Promise<void>, done: string) => {
    setBusy(key);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['branches-live'] });
      toast(done);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const status = paused ? `Uygulama siparişleri durduruldu (bitiş: ${clock(st.pausedUntil!)})`
    : st.kind === 'closed' ? `Şube kapalı (çalışma saatleri dışında)`
    : extra ? `Yoğun: müşteriler ~${st.waitMinutes} dk bekleyeceğini görüyor`
    : `Normal: müşteriler ~${st.waitMinutes} dk görüyor`;

  return (
    <View style={[styles.card, paused && { backgroundColor: color.warningSoft }]}>
      <View style={styles.head}>
        <Gauge size={20} color={color.ink} strokeWidth={1.75} />
        <Txt variant="label" style={{ flex: 1 }}>{status}</Txt>
      </View>
      <View style={styles.row}>
        {[0, 10, 20].map((m) => (
          <Chip key={m} large={large} on={!paused && extra === m} loading={busy === `b${m}`}
            label={m === 0 ? 'Normal' : `+${m} dk`}
            onPress={() => run(`b${m}`, () => staffSetBusy(branch.id, m), m ? `Bekleme süresi ${m} dakika uzatıldı (2 saat).` : 'Bekleme süresi normale döndü.')} />
        ))}
        {paused ? (
          <Chip large={large} icon={PlayCircle} label="Devam et" loading={busy === 'resume'} tone="go"
            onPress={() => run('resume', () => staffPauseOrders(branch.id, 0), 'Uygulama siparişleri yeniden açıldı.')} />
        ) : (
          <Chip large={large} icon={PauseCircle} label="30 dk durdur" loading={busy === 'pause'} tone="stop"
            onPress={() => run('pause', () => staffPauseOrders(branch.id, 30), 'Uygulama siparişleri 30 dakika durduruldu.')} />
        )}
      </View>
    </View>
  );
}

function Chip({ label, on, onPress, loading, icon: Icon, tone, large }: {
  label: string; on?: boolean; onPress: () => void; loading?: boolean; icon?: typeof Gauge; tone?: 'stop' | 'go'; large?: boolean;
}) {
  const bg = on ? color.primary : tone === 'stop' ? color.errorSoft : tone === 'go' ? color.successSoft : color.surfaceMuted;
  const fg = on ? 'onPrimary' : tone === 'stop' ? 'error' : tone === 'go' ? 'success' : 'ink';
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on, busy: !!loading }} disabled={loading} onPress={onPress}
      style={({ pressed }) => [styles.chip, large && styles.chipLarge, { backgroundColor: bg }, (pressed || loading) && { opacity: 0.7 }]}>
      {Icon ? <Icon size={16} color={tone === 'stop' ? color.error : color.success} strokeWidth={1.75} /> : null}
      <Txt variant="label" color={fg}>{label}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space[3], padding: space[3], gap: space[3], borderRadius: radius.md, backgroundColor: color.surface, boxShadow: '0px 1px 3px rgba(0, 40, 62, 0.10)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: space[3], borderRadius: radius.full },
  chipLarge: { height: 48, paddingHorizontal: space[4] },
});

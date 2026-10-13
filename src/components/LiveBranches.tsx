// Owner: what is happening in every branch right now — open orders by stage, the longest wait, today's
// takings, busy / paused / closed state and sold-out items. Refreshes itself every 30 seconds.
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AlertTriangle, ChevronRight } from 'lucide-react-native';
import { Txt } from './Txt';
import { Badge, type BadgeTone } from './Badge';
import { Divider } from './Layout';
import { adminStyles, Stat } from './Admin';
import { useBranchesLive, useLiveOverview } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { tl, timeOf } from '@/lib/format';
import { branchState, type BranchState } from '@/lib/hours';
import type { Branch, LiveBranch } from '@/lib/types';
import { color, space } from '@/theme/tokens';

/** An order waiting longer than this (minutes) is flagged. */
export const LATE_MINUTES = 15;

const STATE_TONE: Record<BranchState['kind'], BadgeTone> = { open: 'success', busy: 'warning', paused: 'warning', closed: 'neutral', unavailable: 'error' };
const STATE_LABEL: Record<BranchState['kind'], string> = { open: 'Açık', busy: 'Yoğun', paused: 'Durduruldu', closed: 'Kapalı', unavailable: 'Sipariş almıyor' };

export const minutesSince = (iso: string | null, now = Date.now()) => (iso ? Math.max(0, Math.round((now - Date.parse(iso)) / 60_000)) : 0);

export function openSummary(l: LiveBranch): string {
  const parts = [l.waiting && `${l.waiting} bekliyor`, l.preparing && `${l.preparing} hazırlanıyor`, l.ready && `${l.ready} hazır`,
    l.scheduled && `${l.scheduled} ileri saat`].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Açık sipariş yok';
}

export function StateBadge({ branch }: { branch: Branch }) {
  const st = branchState(branch);
  return <Badge tone={STATE_TONE[st.kind]} icon={null} label={STATE_LABEL[st.kind]} />;
}

/** `summary`: totals and alerts; `list`: every branch, busiest first. Both share one query. */
export function LiveBranches({ part }: { part: 'summary' | 'list' }) {
  const live = useLiveOverview();
  const branches = useBranchesLive();
  const now = live.dataUpdatedAt || 0;

  if (live.isLoading || branches.isLoading) return <ActivityIndicator color={color.ink} style={{ marginTop: space[5] }} />;
  if (live.isError) return <Txt variant="bodySm" color="error" style={{ marginTop: space[3] }}>{errorMessage(live.error)}</Txt>;
  const rows = (live.data?.branches ?? [])
    .map((l) => ({ l, b: branches.data?.find((x) => x.id === l.branch_id) }))
    .filter((x): x is { l: LiveBranch; b: Branch } => !!x.b && x.b.status !== 'coming_soon');
  const sum = (f: (l: LiveBranch) => number) => rows.reduce((a, x) => a + f(x.l), 0);
  const states = rows.map((x) => branchState(x.b));
  const late = rows.filter((x) => x.l.oldest_waiting_at && minutesSince(x.l.oldest_waiting_at, now) >= LATE_MINUTES);
  const paused = rows.filter((x, i) => states[i].kind === 'paused');
  const soldOut = rows.filter((x) => x.l.sold_out > 0);
  const busiest = [...rows].sort((x, y) => (y.l.waiting + y.l.preparing + y.l.ready) - (x.l.waiting + x.l.preparing + x.l.ready)
    || y.l.today_revenue - x.l.today_revenue || x.b.sort - y.b.sort);

  if (part === 'list') {
    return (
      <>
      <View style={[adminStyles.card, { paddingVertical: 0, marginTop: space[3] }]}>
        {busiest.map(({ l, b }, i) => {
          const wait = minutesSince(l.oldest_waiting_at, now);
          return (
            <View key={b.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable accessibilityRole="button" accessibilityLabel={`${b.name}: ${openSummary(l)}, bugün ${tl(l.today_revenue)}`}
                onPress={() => router.push({ pathname: '/admin/live/[id]', params: { id: b.id } })}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <View style={styles.titleRow}>
                    <Txt variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>{b.name}</Txt>
                    <StateBadge branch={b} />
                  </View>
                  <Txt variant="caption" color={l.oldest_waiting_at && wait >= LATE_MINUTES ? 'error' : 'inkMuted'} numberOfLines={2}>
                    {openSummary(l)}{l.oldest_waiting_at && wait >= 5 ? ` · en eski ${wait} dk` : ''}
                  </Txt>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt variant="label" style={{ fontVariant: ['tabular-nums'] }}>{tl(l.today_revenue)}</Txt>
                  <Txt variant="caption" color="inkMuted">{l.today_orders} sipariş</Txt>
                </View>
                <ChevronRight size={18} color={color.inkMuted} strokeWidth={1.75} />
              </Pressable>
            </View>
          );
        })}
      </View>
      {live.data ? (
        <Txt variant="caption" color="inkMuted" style={{ marginTop: space[2] }}>
          Güncelleme: {timeOf(live.data.generated_at)} · her 30 saniyede yenilenir
        </Txt>
      ) : null}
      </>
    );
  }

  return (
    <>
      <View style={styles.stats}>
        <Stat label="Bugünkü ciro" value={tl(sum((l) => l.today_revenue))} />
        <Stat label="Bugün teslim edilen" value={String(sum((l) => l.today_orders))}
          sub={sum((l) => l.today_cancelled) ? `${sum((l) => l.today_cancelled)} iptal` : undefined} />
        <Stat label="Şu an açık sipariş" value={String(sum((l) => l.waiting + l.preparing + l.ready))}
          sub={sum((l) => l.scheduled) ? `+${sum((l) => l.scheduled)} ileri saat` : undefined} />
        <Stat label="Sipariş alan şube" value={`${states.filter((s) => s.orderNow).length}/${rows.length}`} />
      </View>

      {late.length || paused.length || soldOut.length ? (
        <View style={[adminStyles.card, styles.alerts]} accessibilityRole="alert">
          {late.map(({ l, b }) => (
            <Alert key={`late-${b.id}`} tone="error" text={`${b.name}: en eski sipariş ${minutesSince(l.oldest_waiting_at, now)} dakikadır bekliyor`}
              onPress={() => router.push({ pathname: '/admin/live/[id]', params: { id: b.id } })} />
          ))}
          {paused.map(({ b }) => (
            <Alert key={`pause-${b.id}`} tone="warning" text={`${b.name}: uygulama siparişleri durduruldu`}
              onPress={() => router.push({ pathname: '/admin/live/[id]', params: { id: b.id } })} />
          ))}
          {soldOut.map(({ l, b }) => (
            <Alert key={`so-${b.id}`} tone="warning" text={`${b.name}: ${l.sold_out} ürün tükendi olarak işaretli`}
              onPress={() => router.push({ pathname: '/staff/menu', params: { branch: b.id } })} />
          ))}
        </View>
      ) : null}
    </>
  );
}

function Alert({ text, tone, onPress }: { text: string; tone: 'error' | 'warning'; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.alert, pressed && { opacity: 0.7 }]}>
      <AlertTriangle size={16} color={tone === 'error' ? color.error : color.warning} strokeWidth={1.75} style={{ marginTop: 2 }} />
      <Txt variant="bodySm" style={{ flex: 1 }}>{text}</Txt>
      <ChevronRight size={16} color={color.inkMuted} strokeWidth={1.75} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[3] },
  alerts: { marginTop: space[3], gap: space[2], paddingVertical: space[3] },
  alert: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2], minHeight: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});

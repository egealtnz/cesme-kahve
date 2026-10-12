// Branch order history for the staff screen: finished orders (collected or cancelled) with a short summary.
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { UserRound } from 'lucide-react-native';
import { Txt } from './Txt';
import { Badge } from './Badge';
import { Card } from './Layout';
import { handlers, useBranchHistory } from '@/lib/api';
import { dayKey, dayLabel, dayMonth, timeOf, tl } from '@/lib/format';
import type { Order } from '@/lib/types';
import { color, radius, space } from '@/theme/tokens';

const RANGES = [
  { days: 1, label: 'Bugün' },
  { days: 7, label: 'Son 7 gün' },
  { days: 30, label: 'Son 30 gün' },
] as const;

const CANCEL_REASON: Record<string, string> = {
  customer: 'Müşteri iptal etti',
  branch: 'Şube iptal etti',
  payment_failed: 'Ödeme alınamadı',
  payment_timeout: 'Ödeme süresi doldu',
  refunded: 'İade edildi',
};

/** Local midnight `days - 1` days ago, so "Bugün" starts at 00:00 today. Stable within a day. */
function startOf(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString();
}

function paymentLabel(o: Order): string {
  if (o.total === 0) return 'Hediye kahve';
  if (o.payment_method === 'card') return 'Kartla ödendi';
  return o.status === 'collected' ? 'Kasada ödendi' : 'Kasada ödenecekti';
}

export function StaffHistory({ branchId }: { branchId: string | null }) {
  const [days, setDays] = useState<number>(1);
  const since = useMemo(() => startOf(days), [days]);
  const history = useBranchHistory(branchId, since);
  const orders = useMemo(() => history.data ?? [], [history.data]);

  const summary = useMemo(() => {
    const done = orders.filter((o) => o.status === 'collected');
    return {
      collected: done.length,
      cancelled: orders.length - done.length,
      revenue: done.reduce((sum, o) => sum + o.total, 0),
      coffees: done.reduce((sum, o) => sum + (o.order_items ?? []).filter((i) => i.is_coffee).reduce((n, i) => n + i.quantity, 0), 0),
    };
  }, [orders]);

  // Grouped by day, newest first; every group is labelled ("Bugün", "Dün", "10 Ekim Cumartesi").
  const groups = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of orders) {
      const key = dayKey(o.created_at);
      map.set(key, [...(map.get(key) ?? []), o]);
    }
    return [...map.entries()].map(([key, list]) => ({ key, label: dayLabel(list[0].created_at), list }));
  }, [orders]);

  return (
    <View style={{ marginTop: space[5] }}>
      <View style={styles.ranges} accessibilityRole="tablist">
        {RANGES.map((r) => (
          <Pressable key={r.days} accessibilityRole="tab" accessibilityState={{ selected: r.days === days }}
            onPress={() => setDays(r.days)} style={[styles.range, r.days === days && styles.rangeOn]}>
            <Txt variant="label" color={r.days === days ? 'onPrimary' : 'ink'}>{r.label}</Txt>
          </Pressable>
        ))}
      </View>

      <Card tone="soft" style={styles.summary}>
        <Stat label="Teslim edilen" value={String(summary.collected)} />
        <Stat label="Ciro" value={tl(summary.revenue)} />
        <Stat label="Kahve" value={String(summary.coffees)} />
        <Stat label="İptal" value={String(summary.cancelled)} />
      </Card>

      {history.isLoading ? <ActivityIndicator color={color.ink} style={{ marginTop: space[6] }} /> : null}
      {!history.isLoading && orders.length === 0 ? (
        <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[4] }}>Bu dönemde tamamlanan sipariş yok.</Txt>
      ) : null}
      {history.isError ? (
        <Txt variant="bodySm" color="error" style={{ marginTop: space[4] }}>Geçmiş yüklenemedi. Aşağı çekerek yenile.</Txt>
      ) : null}

      {groups.map(({ key, label, list }) => (
        <View key={key} style={{ marginTop: space[5] }}>
          <View style={styles.dayHead}>
            <Txt variant="overline" color="secondaryInk" accessibilityRole="header">{label}</Txt>
            <Txt variant="caption" color="inkMuted">{list.length} sipariş</Txt>
          </View>
          <Card style={{ padding: 0 }}>
            {list.map((o, i) => (
              <View key={o.id} style={[styles.row, i < list.length - 1 && styles.line]}
                accessibilityLabel={`Sipariş ${o.order_no}, ${dayMonth(o.created_at)} ${timeOf(o.created_at)}, ${o.customer_name ?? 'Misafir'}, ${o.status === 'collected' ? 'teslim edildi' : 'iptal'}, ${tl(o.total)}`}>
                <View style={styles.between}>
                  <Txt variant="h6" style={{ fontVariant: ['tabular-nums'] }}>#{o.order_no} · {o.customer_name ?? 'Misafir'}</Txt>
                  <Txt variant="h6" style={{ fontVariant: ['tabular-nums'], textDecorationLine: o.status === 'cancelled' ? 'line-through' : 'none' }}>
                    {tl(o.total)}
                  </Txt>
                </View>
                <Txt variant="bodySm" color="inkMuted" numberOfLines={2}>
                  {(o.order_items ?? []).map((it) => `${it.quantity}× ${it.product_name}${it.milk_label ? ` (${it.milk_label})` : ''}`).join(', ')}
                </Txt>
                <View style={styles.meta}>
                  {o.status === 'collected'
                    ? <Badge tone="success" label="Teslim edildi" />
                    : <Badge tone="neutral" label={CANCEL_REASON[o.cancel_reason ?? ''] ?? 'İptal'} />}
                  <Txt variant="caption" color="inkMuted">
                    {dayMonth(o.created_at)} · {timeOf(o.created_at)}{o.collected_at ? ` → ${timeOf(o.collected_at)}` : ''} · {paymentLabel(o)}
                  </Txt>
                </View>
                <Handlers order={o} />
              </View>
            ))}
          </Card>
        </View>
      ))}
      {orders.length === 200 ? (
        <Txt variant="caption" color="inkMuted" style={{ marginTop: space[3] }}>En son 200 sipariş gösteriliyor.</Txt>
      ) : null}
    </View>
  );
}

/** "Hazırlayan: Ece K. · Teslim eden: Can Ö." — who handled the order at the branch. */
function Handlers({ order }: { order: Order }) {
  const h = handlers(order);
  const parts = [
    h.preparing ? ['Kabul eden', h.preparing.name] : null,
    h.ready ? ['Hazırlayan', h.ready.name] : null,
    h.collected ? ['Teslim eden', h.collected.name] : null,
    h.cancelled ? ['İptal eden', h.cancelled.name] : null,
  ].filter(Boolean) as [string, string][];
  if (!parts.length) return null;
  return (
    <View style={styles.handlers}>
      <UserRound size={14} color={color.inkMuted} strokeWidth={1.75} style={{ marginTop: 1 }} />
      <Txt variant="caption" color="inkMuted" style={{ flex: 1 }}>
        {parts.map(([k, v], i) => (
          <Txt key={k} variant="caption" color="inkMuted">
            {i > 0 ? ' · ' : ''}{k}: <Txt variant="caption" color="ink">{v}</Txt>
          </Txt>
        ))}
      </Txt>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt variant="h5" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{value}</Txt>
      <Txt variant="caption" color="inkMuted">{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  ranges: { flexDirection: 'row', gap: space[2] },
  range: { height: 36, paddingHorizontal: space[4], borderRadius: radius.full, backgroundColor: color.surfaceMuted, justifyContent: 'center' },
  rangeOn: { backgroundColor: color.primary },
  summary: { flexDirection: 'row', gap: space[2], marginTop: space[4] },
  row: { padding: space[4], gap: space[1] },
  line: { borderBottomWidth: 1, borderBottomColor: color.line },
  between: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2] },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space[2] },
  handlers: { flexDirection: 'row', gap: 6, marginTop: space[1] },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2], marginTop: space[1] },
});

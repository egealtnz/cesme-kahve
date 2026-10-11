// Branch order history for the staff screen: finished orders (collected or cancelled) with a short summary.
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Txt } from './Txt';
import { Badge } from './Badge';
import { Card } from './Layout';
import { useBranchHistory } from '@/lib/api';
import { shortDate, timeOf, tl } from '@/lib/format';
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

  // Group by day when the range covers more than today.
  const groups = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of orders) {
      const key = shortDate(o.created_at);
      map.set(key, [...(map.get(key) ?? []), o]);
    }
    return [...map.entries()];
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

      {groups.map(([day, list]) => (
        <View key={day} style={{ marginTop: space[5] }}>
          {days > 1 ? <Txt variant="overline" color="secondaryInk" style={{ marginBottom: space[2] }}>{day}</Txt> : null}
          <Card style={{ padding: 0 }}>
            {list.map((o, i) => (
              <View key={o.id} style={[styles.row, i < list.length - 1 && styles.line]}
                accessibilityLabel={`Sipariş ${o.order_no}, ${o.customer_name ?? 'Misafir'}, ${o.status === 'collected' ? 'teslim edildi' : 'iptal'}, ${tl(o.total)}`}>
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
                    {timeOf(o.created_at)}{o.collected_at ? ` → ${timeOf(o.collected_at)}` : ''} · {paymentLabel(o)}
                  </Txt>
                </View>
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
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2], marginTop: space[1] },
});

// One order in the owner's lists (live branch, order search, customer history). Tap opens the order.
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Txt } from './Txt';
import { Badge, type BadgeTone } from './Badge';
import { dayMonth, tl, timeOf } from '@/lib/format';
import { pickupLabel } from '@/lib/hours';
import type { OrderStatus } from '@/lib/types';
import { space } from '@/theme/tokens';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: 'Ödeme bekleniyor', placed: 'Yeni', preparing: 'Hazırlanıyor', ready: 'Hazır', collected: 'Teslim edildi', cancelled: 'İptal',
};
export const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  awaiting_payment: 'neutral', placed: 'warning', preparing: 'fresh', ready: 'success', collected: 'neutral', cancelled: 'error',
};

export function AdminOrderRow({ o }: {
  o: { id: string; order_no: number; status: OrderStatus; total: number; created_at: string; pickup_at?: string | null;
       customer_name?: string | null; branch?: string | null; items?: string | null; table_label?: string | null };
}) {
  const who = [o.customer_name ?? (o.customer_name === undefined ? null : 'Misafir'), o.branch].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Sipariş ${o.order_no}, ${STATUS_LABEL[o.status]}, ${tl(o.total)}`}
      onPress={() => router.push({ pathname: '/admin/order/[id]', params: { id: o.id } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={styles.head}>
          <Txt variant="label">#{o.order_no}</Txt>
          <Badge tone={STATUS_TONE[o.status]} icon={null} label={STATUS_LABEL[o.status]} />
        </View>
        {who ? <Txt variant="bodySm" numberOfLines={1}>{who}</Txt> : null}
        {o.items ? <Txt variant="caption" color="inkMuted" numberOfLines={2}>{o.items}</Txt> : null}
        <Txt variant="caption" color="inkMuted">
          {dayMonth(o.created_at)} {timeOf(o.created_at)}{o.pickup_at ? ` · Teslim: ${pickupLabel(o.pickup_at)}` : ''}{o.table_label ? ` · Masa ${o.table_label}` : ''}
        </Txt>
      </View>
      <Txt variant="label" style={{ fontVariant: ['tabular-nums'] }}>{tl(o.total)}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingVertical: space[3] },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});

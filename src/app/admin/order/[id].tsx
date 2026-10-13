// Company panel: one order from any branch — what was ordered, who handled it, the rating — with the same
// status buttons the counter has, and cancelling (asks for a second tap).
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ThumbsDown, ThumbsUp, UserRound, XCircle } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Card, Divider, Screen, TopBar } from '@/components/Layout';
import { NavRow } from '@/components/Admin';
import { STATUS_LABEL, STATUS_TONE } from '@/components/AdminOrderRow';
import { handlers, staffSetStatus, useAnyOrder, useCatalogue } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { dayLabel, tl, timeOf } from '@/lib/format';
import { pickupLabel } from '@/lib/hours';
import type { OrderStatus } from '@/lib/types';
import { useToast } from '@/state/toast';
import { color, space } from '@/theme/tokens';
import { counterExtras, deliveredLabel, NoteBox, TableTag } from '@/components/StaffOrderBits';

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  placed: { to: 'preparing', label: 'Hazırlamaya başla' },
  preparing: { to: 'ready', label: 'Hazır' },
  ready: { to: 'collected', label: 'Teslim edildi' },   // "Masaya götürüldü" for table orders
};
const HANDLED: Partial<Record<OrderStatus, string>> = { preparing: 'Kabul etti', ready: 'Hazırladı', collected: 'Teslim etti', cancelled: 'İptal etti' };
const PAYMENT = { card: 'Kartla ödendi', store: 'Kasada ödeme' } as const;

export default function AdminOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useAnyOrder(id);
  const { data: cat } = useCatalogue();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<OrderStatus | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const o = order.data;

  const move = async (to: OrderStatus) => {
    if (!o) return;
    setBusy(to);
    try {
      await staffSetStatus(o.id, to);
      await Promise.all(['admin-order', 'admin-orders', 'admin-live', 'queue', 'admin-customer'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      toast(to === 'cancelled' ? `#${o.order_no} iptal edildi.` : `#${o.order_no}: ${STATUS_LABEL[to]}.`);
      setConfirmCancel(false);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (!o) {
    return (
      <Screen>
        <TopBar back />
        {order.isLoading ? <ActivityIndicator color={color.ink} style={{ marginTop: space[6] }} /> : null}
        {order.isError ? <Txt variant="bodySm" color="error" style={{ marginTop: space[6] }}>{errorMessage(order.error)}</Txt> : null}
      </Screen>
    );
  }
  const branch = cat?.branches.find((b) => b.id === o.branch_id);
  const who = handlers(o);
  const next = NEXT[o.status];
  const open = o.status === 'placed' || o.status === 'preparing' || o.status === 'ready';
  const discount = o.subtotal - o.total;

  return (
    <Screen>
      <TopBar back />
      <Txt variant="overline" color="secondaryInk" style={{ marginTop: space[5] }}>{branch?.name ?? o.branch_id}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], marginTop: 4 }}>
        <Txt variant="h1" accessibilityRole="header">#{o.order_no}</Txt>
        <Badge tone={STATUS_TONE[o.status]} icon={null} label={STATUS_LABEL[o.status]} />
      </View>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>
        {dayLabel(o.created_at)} {timeOf(o.created_at)} · {o.customer_name ?? 'Misafir'}
        {o.pickup_at ? ` · Teslim: ${pickupLabel(o.pickup_at)}` : ''}
      </Txt>
      {o.table_label ? <View style={{ marginTop: space[3] }}><TableTag table={o.table_label} /></View> : null}
      {o.note ? <NoteBox note={o.note} /> : null}

      <Card style={{ marginTop: space[5], paddingVertical: 0 }}>
        {o.order_items?.map((it, i) => (
          <View key={it.id}>
            {i > 0 ? <Divider /> : null}
            <View style={{ flexDirection: 'row', gap: space[3], paddingVertical: space[3] }}>
              <Txt variant="label" style={{ width: 28 }}>{it.quantity}×</Txt>
              <View style={{ flex: 1 }}>
                <Txt variant="body">{it.product_name}</Txt>
                {counterExtras(it) ? <Txt variant="caption" color="inkMuted">{counterExtras(it)}</Txt> : null}
                {it.free_quantity ? <Txt variant="caption" color="success">{it.free_quantity} adet hediye kahve</Txt> : null}
              </View>
              <Txt variant="bodySm" style={{ fontVariant: ['tabular-nums'] }}>{tl(it.unit_price * it.quantity)}</Txt>
            </View>
          </View>
        ))}
        <Divider />
        <View style={{ paddingVertical: space[3], gap: 4 }}>
          {discount > 0 ? <Row label="İndirim" value={`−${tl(discount)}`} /> : null}
          <Row label="Toplam" value={tl(o.total)} strong />
          <Txt variant="caption" color="inkMuted">
            {o.payment_status === 'paid' ? (o.payment_method === 'card' ? PAYMENT.card : 'Ödendi') : o.payment_status === 'refunded' ? 'İade edildi' : PAYMENT[o.payment_method]}
            {o.own_cup ? ' · kendi bardağı' : ''}{o.stamps_earned ? ` · ${o.stamps_earned} damga` : ''}
          </Txt>
        </View>
      </Card>

      {Object.keys(who).length ? (
        <Card style={{ marginTop: space[3], gap: space[2] }}>
          {(Object.entries(who) as [OrderStatus, { name: string; at: string }][]).map(([st, h]) => (
            <Row key={st} label={HANDLED[st] ?? STATUS_LABEL[st]} value={`${h.name} · ${timeOf(h.at)}`} />
          ))}
        </Card>
      ) : null}

      {o.order_ratings ? (
        <Card style={{ marginTop: space[3], flexDirection: 'row', gap: space[3] }}>
          {o.order_ratings.liked ? <ThumbsUp size={20} color={color.success} strokeWidth={1.75} /> : <ThumbsDown size={20} color={color.error} strokeWidth={1.75} />}
          <Txt variant="bodySm" style={{ flex: 1 }}>
            {o.order_ratings.liked ? 'Beğendi' : 'Beğenmedi'}{o.order_ratings.comment ? `: “${o.order_ratings.comment}”` : ''}
          </Txt>
        </Card>
      ) : null}

      {o.status === 'cancelled' && o.cancel_reason ? (
        <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[3] }}>
          İptal nedeni: {o.cancel_reason === 'customer' ? 'müşteri vazgeçti' : o.cancel_reason === 'branch' ? 'şube iptal etti'
            : o.cancel_reason === 'payment_timeout' ? 'ödeme tamamlanmadı' : o.cancel_reason === 'refunded' ? 'iade edildi' : o.cancel_reason}
        </Txt>
      ) : null}

      {open ? (
        <View style={{ gap: space[2], marginTop: space[5] }}>
          {next ? <Button label={next.to === 'collected' ? deliveredLabel(o.table_label) : next.label} loading={busy === next.to} onPress={() => move(next.to)} /> : null}
          {confirmCancel ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <Txt variant="bodySm" style={{ flex: 1 }}>Sipariş iptal edilsin mi? Müşteriye bildirim gider.</Txt>
              <Button label="Vazgeç" variant="secondary" size="sm" onPress={() => setConfirmCancel(false)} />
              <Button label="İptal et" variant="danger" size="sm" loading={busy === 'cancelled'} onPress={() => move('cancelled')} />
            </View>
          ) : (
            <Button label="Siparişi iptal et" icon={XCircle} variant="secondary" onPress={() => setConfirmCancel(true)} />
          )}
        </View>
      ) : null}

      {o.user_id ? (
        <View style={{ marginTop: space[6] }}>
          <NavRow icon={UserRound} title="Müşteri" body={`${o.customer_name ?? ''} · kahve kartı ve geçmiş siparişler`}
            onPress={() => router.push({ pathname: '/admin/customer/[id]', params: { id: o.user_id! } })} />
        </View>
      ) : null}
      <View style={{ height: space[8] }} />
    </Screen>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3] }}>
      <Txt variant={strong ? 'label' : 'bodySm'} color={strong ? 'ink' : 'inkMuted'}>{label}</Txt>
      <Txt variant={strong ? 'label' : 'bodySm'} style={{ fontVariant: ['tabular-nums'], flexShrink: 1, textAlign: 'right' }}>{value}</Txt>
    </View>
  );
}

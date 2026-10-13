import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarClock, Check, Clock, CreditCard, Gift, Leaf, MapPin, MessageSquare, Percent, Recycle, RotateCcw, Utensils, XCircle } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Card, Divider, Screen, TopBar } from '@/components/Layout';
import { checkPayment, startCardPayment, openPaymentPage, useCancelOrder, useCatalogue, useOrder } from '@/lib/api';
import { pickupLabel } from '@/lib/hours';
import { useReorder } from '@/lib/reorder';
import { L } from '@/lib/i18n';
import { itemExtras, itemName } from '@/lib/display';
import { CrossFade, Pop, ProgressBar, Pulse } from '@/components/Motion';
import { canRate, RatingCard } from '@/components/RatingCard';
import { errorMessage } from '@/lib/errors';
import { tl, timeOf } from '@/lib/format';
import { notificationsAllowed, registerForOrderNotifications } from '@/lib/notifications';
import type { Order, OrderStatus } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { useCart } from '@/state/cart';
import { useToast } from '@/state/toast';
import { color, radius, space } from '@/theme/tokens';

const STEPS: { status: OrderStatus; label: () => string }[] = [
  { status: 'placed', label: () => L('Alındı', 'Received') },
  { status: 'preparing', label: () => L('Hazırlanıyor', 'Preparing') },
  { status: 'ready', label: () => L('Hazır', 'Ready') },
  { status: 'collected', label: () => L('Teslim alındı', 'Collected') },
];

function headline(o: Order, outcome?: string): { title: string; body: string } {
  const branch = o.branch?.name ?? L('şube', 'the branch');
  const table = o.table_label;
  switch (o.status) {
    case 'awaiting_payment':
      return outcome === 'review'
        ? { title: L('Ödemen kontrol ediliyor', 'Checking your payment'), body: L('Bankan ödemeyi onaylayınca siparişin şubeye iletilecek.', 'Your order goes to the branch once your bank approves the payment.') }
        : { title: L('Ödeme tamamlanmadı', 'Payment not completed'), body: L('Kartla ödemeyi tamamla ya da siparişi iptal et. Ödenmeyen siparişler 30 dakika sonra iptal edilir.', 'Finish the card payment or cancel the order. Unpaid orders are cancelled after 30 minutes.') };
    case 'placed':
      if (table) return { title: L('Siparişin alındı', 'Order received'), body: L(`Hazır olunca masana getireceğiz (Masa ${table}).`, `We will bring it to table ${table} when it is ready.`) };
      return o.pickup_at
        ? { title: L('Siparişin alındı', 'Order received'), body: L(`${branch} şubesi siparişini ${pickupLabel(o.pickup_at).toLocaleLowerCase('tr-TR')} için hazırlayacak.`, `${branch} will have it ready for ${pickupLabel(o.pickup_at)}.`) }
        : { title: L('Siparişin alındı', 'Order received'), body: L(`${branch} şubesi siparişini sıraya aldı. Yaklaşık ${o.branch?.prep_minutes ?? 6} dakikada hazır olacak.`, `${branch} has queued your order. It will be ready in about ${o.branch?.prep_minutes ?? 6} minutes.`) };
    case 'preparing':
      return { title: L('Hazırlanıyor', 'Being prepared'), body: L('Baristamız siparişini hazırlıyor.', 'Our barista is making your order.') };
    case 'ready':
      return table
        ? { title: L('Siparişin hazır', 'Your order is ready'), body: L(`Masana geliyor (Masa ${table}). Afiyet olsun!`, `On its way to table ${table}. Enjoy!`) }
        : { title: L('Siparişin hazır', 'Your order is ready'), body: L(`${branch} şubesinde seni bekliyor. Afiyet olsun!`, `Waiting for you at ${branch}. Enjoy!`) };
    case 'collected':
      return { title: table ? L('Masana servis edildi', 'Served at your table') : L('Teslim alındı', 'Collected'), body: L('Afiyet olsun! Bir sonraki kahvende görüşmek üzere.', 'Enjoy! See you for your next coffee.') };
    case 'cancelled':
      return {
        title: L('Sipariş iptal edildi', 'Order cancelled'),
        body: o.cancel_reason === 'payment_failed' ? L('Ödeme tamamlanamadı; kartından ücret alınmadı.', 'The payment did not go through; your card was not charged.')
          : o.cancel_reason === 'payment_timeout' ? L('Ödeme süresinde tamamlanmadı.', 'The payment was not completed in time.')
          : o.cancel_reason === 'refunded' ? L('Ödemen kartına iade edildi. İadenin hesabına geçmesi bankana göre birkaç gün sürebilir.', 'Your payment was refunded to your card. It can take a few days to show, depending on your bank.')
          : o.cancel_reason === 'branch' ? L('Şube siparişini iptal etti.', 'The branch cancelled your order.') : L('Siparişini iptal ettin.', 'You cancelled your order.'),
      };
  }
}

export default function OrderScreen() {
  const { id, fresh, outcome } = useLocalSearchParams<{ id: string; fresh?: string; outcome?: string }>();
  const { userId, ready } = useAuth();
  const { data: order, isLoading, isError, refetch } = useOrder(id, userId);
  const cart = useCart();
  const cancel = useCancelOrder();
  const toast = useToast();
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const reorder = useReorder();
  const { data: cat } = useCatalogue();
  const [askPush, setAskPush] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' && fresh && order && order.status !== 'awaiting_payment' && order.status !== 'cancelled') {
      notificationsAllowed().then((ok) => setAskPush(!ok)).catch(() => undefined);
    }
  }, [fresh, order]);

  useEffect(() => {
    if (fresh && outcome === 'failed') toast(L('Ödeme tamamlanamadı. Kartından ücret alınmadı.', 'The payment did not go through. Your card was not charged.'));
  }, [fresh, outcome, toast]);

  const goBack = () => {
    if (fresh) { router.dismissAll(); router.replace('/'); } else if (router.canGoBack()) router.back(); else router.replace('/');
  };

  if (ready && !userId) {
    return (
      <Screen><TopBar back={goBack} />
        <Txt variant="h3" style={{ marginTop: space[8] }}>{L('Siparişini görmek için giriş yap', 'Sign in to see your order')}</Txt>
        <Button label={L('Giriş yap', 'Sign in')} style={{ marginTop: space[6] }} onPress={() => router.push('/auth/sign-in')} />
      </Screen>
    );
  }
  if (isError && !order) {
    return (
      <Screen><TopBar back={goBack} />
        <Txt variant="h3" style={{ marginTop: space[8] }}>{L('Sipariş bulunamadı', 'Order not found')}</Txt>
        <Txt variant="body" color="inkMuted" style={{ marginTop: space[2] }}>{L('Bağlantını kontrol edip tekrar dene.', 'Check your connection and try again.')}</Txt>
        <Button label={L('Tekrar dene', 'Try again')} variant="secondary" style={{ marginTop: space[6] }} onPress={() => refetch()} />
      </Screen>
    );
  }
  if (isLoading || !order) {
    return <Screen><TopBar back={goBack} /><ActivityIndicator color={color.ink} style={{ marginTop: space[10] }} /></Screen>;
  }

  const { title, body } = headline(order, outcome);
  const stepIndex = STEPS.findIndex((s) => s.status === order.status);
  const canCancel = order.status === 'awaiting_payment' || (order.status === 'placed' && order.payment_method === 'store' && order.payment_status === 'unpaid');

  const resumePayment = async () => {
    setPaying(true);
    try {
      const pageUrl = await startCardPayment(order.id);
      await openPaymentPage(pageUrl);
      const result = await checkPayment(order.id).catch(() => 'pending');
      if (result === 'success') { cart.clear(); toast(L('Ödemen alındı.', 'Payment received.')); }
      else if (result === 'failed') toast(L('Ödeme tamamlanamadı. Kartından ücret alınmadı.', 'The payment did not go through. Your card was not charged.'));
      await refetch();
      qc.invalidateQueries({ queryKey: ['orders'] });
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setPaying(false);
    }
  };

  return (
    <Screen>
      <TopBar back={goBack} />
      <Card tone={order.status === 'ready' ? 'eco' : order.status === 'cancelled' ? 'surface' : 'soft'} style={{ marginTop: space[5], gap: space[2] }}>
        <View style={styles.headRow}>
          <Txt variant="overline" color={order.status === 'ready' ? 'success' : 'secondaryInk'}>{L('Sipariş no', 'Order no')}</Txt>
          <Txt variant="caption" color="inkMuted">{timeOf(order.created_at)}</Txt>
        </View>
        <Txt variant="h1" style={{ fontVariant: ['tabular-nums'] }} accessibilityLabel={L(`Sipariş numarası ${order.order_no}`, `Order number ${order.order_no}`)}>#{order.order_no}</Txt>
        <CrossFade id={order.status}>
          <Txt variant="h4" accessibilityRole="header" accessibilityLiveRegion="polite">{title}</Txt>
          <Txt variant="bodySm" style={{ marginTop: space[2] }}>{body}</Txt>
        </CrossFade>

        {order.status !== 'awaiting_payment' && order.status !== 'cancelled' ? (
          <View accessible accessibilityLabel={`${L('Durum', 'Status')}: ${STEPS[stepIndex]?.label() ?? ''}`} style={{ marginTop: space[3], gap: space[3] }}>
            <ProgressBar progress={(stepIndex + (order.status === 'collected' ? 1 : 0.5)) / STEPS.length} color={color.primary} track={color.surface} />
            <View style={styles.steps}>
              {STEPS.map((s, i) => {
                const done = i < stepIndex || order.status === 'collected';
                const current = i === stepIndex && order.status !== 'collected';
                const label = i === 3 && order.table_label ? L('Masada', 'Served') : s.label();
                return (
                  <View key={s.status} style={styles.step}>
                    {current ? (
                      <Pulse min={0.55}><View style={[styles.dot, styles.dotOn]}><View style={styles.dotCore} /></View></Pulse>
                    ) : (
                      <View style={[styles.dot, done && styles.dotOn]}>
                        {done ? <Pop delay={i * 90}><Check size={14} color={color.onPrimary} strokeWidth={2} /></Pop> : null}
                      </View>
                    )}
                    <Txt variant="caption" color={i <= stepIndex ? 'ink' : 'inkMuted'} center>{label}</Txt>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}
      </Card>

      {askPush && userId ? (
        <Card style={{ marginTop: space[4], gap: space[3] }}>
          <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
            <Bell size={20} color={color.ink} strokeWidth={1.75} />
            <Txt variant="body" style={{ flex: 1, fontFamily: 'DMSans-SemiBold' }}>{L('Hazır olunca haber verelim mi?', 'Shall we tell you when it is ready?')}</Txt>
          </View>
          <Txt variant="bodySm" color="inkMuted">{L('Sadece sipariş durumun için bildirim göndeririz. İstediğin zaman ayarlardan kapatabilirsin.', 'We only notify you about your order. You can turn this off any time in settings.')}</Txt>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Button label={L('Bildirimleri aç', 'Turn on')} size="md" onPress={async () => {
              const r = await registerForOrderNotifications(userId);
              setAskPush(false);
              toast(r === 'granted' ? L('Siparişin hazır olunca haber vereceğiz.', 'We will let you know when it is ready.') : L('Bildirimlere izin verilmedi. Ayarlardan açabilirsin.', 'Notifications were not allowed. You can turn them on in settings.'));
            }} />
            <Button label={L('Şimdi değil', 'Not now')} variant="tertiary" size="md" onPress={() => setAskPush(false)} />
          </View>
        </Card>
      ) : null}

      {order.status === 'awaiting_payment' ? (
        <View style={{ gap: space[2], marginTop: space[4] }}>
          <Button label={L('Ödemeyi tamamla', 'Complete payment')} icon={CreditCard} loading={paying} onPress={resumePayment} />
        </View>
      ) : null}

      <Card style={{ marginTop: space[4], gap: space[3] }}>
        <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
          {order.table_label ? <Utensils size={20} color={color.ink} strokeWidth={1.75} /> : <MapPin size={20} color={color.ink} strokeWidth={1.75} />}
          <View style={{ flex: 1 }}>
            <Txt variant="caption" color="inkMuted">{order.table_label ? L(`Masaya servis · Masa ${order.table_label}`, `Table service · Table ${order.table_label}`) : L('Teslim alınacak şube', 'Pick up at')}</Txt>
            <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }}>{order.branch?.name}</Txt>
            <Txt variant="caption" color="inkMuted">{order.branch?.district} · {order.branch?.city}</Txt>
          </View>
        </View>
        {order.pickup_at ? (
          <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
            <CalendarClock size={20} color={color.ink} strokeWidth={1.75} />
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color="inkMuted">{L('Teslim alma zamanı', 'Pickup time')}</Txt>
              <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }}>{pickupLabel(order.pickup_at)}</Txt>
            </View>
          </View>
        ) : null}
        {order.note ? (
          <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
            <MessageSquare size={20} color={color.ink} strokeWidth={1.75} />
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color="inkMuted">{L('Baristaya not', 'Note for the barista')}</Txt>
              <Txt variant="body">“{order.note}”</Txt>
            </View>
          </View>
        ) : null}
        <Divider />
        {order.order_items?.map((i) => (
          <View key={i.id} style={{ flexDirection: 'row', gap: space[2] }}>
            <Txt variant="body" style={{ width: 28 }}>{i.quantity}×</Txt>
            <View style={{ flex: 1 }}>
              <Txt variant="body">{itemName(i, cat)}</Txt>
              {itemExtras(i, cat) ? <Txt variant="caption" color="inkMuted">{itemExtras(i, cat)}</Txt> : null}
              {i.free_quantity ? <Txt variant="caption" color="success">{L(`${i.free_quantity} adet hediye kahve`, `${i.free_quantity} free coffee`)}</Txt> : null}
            </View>
            <Txt variant="body" style={{ fontVariant: ['tabular-nums'] }}>{tl(i.unit_price * i.quantity)}</Txt>
          </View>
        ))}
        <Divider />
        {order.reward_discount ? <Row icon={Gift} label={L('Hediye kahve', 'Free coffee')} value={`−${tl(order.reward_discount)}`} /> : null}
        {order.campaign_discount ? <Row icon={Percent} label={L('İkinci kahve indirimi', 'Second coffee discount')} value={`−${tl(order.campaign_discount)}`} /> : null}
        {order.cup_discount ? <Row icon={Recycle} label={L('Kendi bardağın', 'Own cup')} value={`−${tl(order.cup_discount)}`} /> : null}
        {order.eco_packaging ? <Row icon={Leaf} label={L('Çevre dostu ambalaj', 'Eco-friendly packaging')} /> : null}
        <View style={styles.headRow}>
          <Txt variant="h5">{L('Toplam', 'Total')}</Txt>
          <Txt variant="h4" style={{ fontVariant: ['tabular-nums'] }}>{tl(order.total)}</Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
          {order.payment_status === 'paid' ? <Check size={16} color={color.success} strokeWidth={2} /> : <Clock size={16} color={color.inkMuted} strokeWidth={1.75} />}
          <Txt variant="bodySm" color={order.payment_status === 'paid' ? 'success' : 'inkMuted'}>
            {order.payment_status === 'paid' ? (order.total === 0 ? L('Hediye kahveyle ödendi', 'Paid with a free coffee') : order.payment_method === 'card' ? L('Kartla ödendi', 'Paid by card') : L('Kasada ödendi', 'Paid at the counter'))
              : order.payment_status === 'failed' ? L('Ödeme alınamadı', 'Payment failed')
              : order.payment_status === 'refunded' ? L('Kartına iade edildi', 'Refunded to your card')
              : order.payment_method === 'store' ? (order.table_label ? L('Masada ya da kasada ödenecek', 'To pay at the table or counter') : L('Teslim alırken kasada ödenecek', 'To pay at the counter on pickup')) : L('Ödeme bekleniyor', 'Awaiting payment')}
          </Txt>
        </View>
        {order.stamps_earned > 0 && order.status !== 'cancelled' ? (
          <Txt variant="caption" color="inkMuted">
            {order.payment_method === 'store' && order.status !== 'collected'
              ? L(`Teslim aldığında kahve kartına ${order.stamps_earned} damga eklenecek.`, `${order.stamps_earned} ${order.stamps_earned === 1 ? 'stamp goes' : 'stamps go'} on your coffee card when you get it.`)
              : L(`Kahve kartına ${order.stamps_earned} damga eklendi.`, `${order.stamps_earned} ${order.stamps_earned === 1 ? 'stamp was' : 'stamps were'} added to your coffee card.`)}
          </Txt>
        ) : null}
      </Card>

      {canRate(order) ? <View style={{ marginTop: space[4] }}><RatingCard order={order} /></View> : null}

      {order.status === 'collected' || order.status === 'cancelled' ? (
        <Button label={L('Tekrar sipariş ver', 'Order again')} variant="secondary" icon={RotateCcw} style={{ marginTop: space[4] }} onPress={() => reorder(order)} />
      ) : null}

      {canCancel ? (
        <Button
          label={L('Siparişi iptal et', 'Cancel order')}
          variant="danger"
          size="md"
          icon={XCircle}
          loading={cancel.isPending}
          style={{ marginTop: space[6] }}
          onPress={() => cancel.mutate(order.id, {
            onSuccess: () => { toast(L('Siparişin iptal edildi.', 'Your order was cancelled.')); refetch(); },
            onError: (e) => toast(errorMessage(e)),
          })}
        />
      ) : null}
    </Screen>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof Gift; label: string; value?: string }) {
  return (
    <View style={styles.headRow}>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <Icon size={18} color={color.success} strokeWidth={1.75} />
        <Txt variant="bodySm" color="success">{label}</Txt>
      </View>
      {value ? <Txt variant="bodySm" color="success">{value}</Txt> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  steps: { flexDirection: 'row', marginTop: space[3] },
  step: { flex: 1, alignItems: 'center', gap: 4 },
  dot: { width: 24, height: 24, borderRadius: radius.full, borderWidth: 1.5, borderColor: color.lineStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface },
  dotOn: { backgroundColor: color.primary, borderColor: color.primary },
  dotCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.onPrimary },
});

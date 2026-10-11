import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Clock, CreditCard, Gift, Leaf, MapPin, Percent, Recycle, XCircle } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Card, Divider, Screen, TopBar } from '@/components/Layout';
import { checkPayment, startCardPayment, openPaymentPage, useCancelOrder, useOrder } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { tl, timeOf } from '@/lib/format';
import { notificationsAllowed, registerForOrderNotifications } from '@/lib/notifications';
import type { Order, OrderStatus } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { useCart } from '@/state/cart';
import { useToast } from '@/state/toast';
import { color, radius, space } from '@/theme/tokens';

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'placed', label: 'Alındı' },
  { status: 'preparing', label: 'Hazırlanıyor' },
  { status: 'ready', label: 'Hazır' },
  { status: 'collected', label: 'Teslim alındı' },
];

function headline(o: Order, outcome?: string): { title: string; body: string } {
  const branch = o.branch?.name ?? 'şube';
  switch (o.status) {
    case 'awaiting_payment':
      return outcome === 'review'
        ? { title: 'Ödemen kontrol ediliyor', body: 'Bankan ödemeyi onaylayınca siparişin şubeye iletilecek.' }
        : { title: 'Ödeme tamamlanmadı', body: 'Kartla ödemeyi tamamla ya da siparişi iptal et. Ödenmeyen siparişler 30 dakika sonra iptal edilir.' };
    case 'placed':
      return { title: 'Siparişin alındı', body: `${branch} şubesi siparişini sıraya aldı. Yaklaşık ${o.branch?.prep_minutes ?? 6} dakikada hazır olacak.` };
    case 'preparing':
      return { title: 'Hazırlanıyor', body: 'Baristamız siparişini hazırlıyor.' };
    case 'ready':
      return { title: 'Siparişin hazır', body: `${branch} şubesinde seni bekliyor. Afiyet olsun!` };
    case 'collected':
      return { title: 'Teslim alındı', body: 'Afiyet olsun! Bir sonraki kahvende görüşmek üzere.' };
    case 'cancelled':
      return {
        title: 'Sipariş iptal edildi',
        body: o.cancel_reason === 'payment_failed' ? 'Ödeme tamamlanamadı; kartından ücret alınmadı.'
          : o.cancel_reason === 'payment_timeout' ? 'Ödeme süresinde tamamlanmadı.'
          : o.cancel_reason === 'refunded' ? 'Ödemen kartına iade edildi. İadenin hesabına geçmesi bankana göre birkaç gün sürebilir.'
          : o.cancel_reason === 'branch' ? 'Şube siparişini iptal etti.' : 'Siparişini iptal ettin.',
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
  const [askPush, setAskPush] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' && fresh && order && order.status !== 'awaiting_payment' && order.status !== 'cancelled') {
      notificationsAllowed().then((ok) => setAskPush(!ok)).catch(() => undefined);
    }
  }, [fresh, order]);

  useEffect(() => {
    if (fresh && outcome === 'failed') toast('Ödeme tamamlanamadı. Kartından ücret alınmadı.');
  }, [fresh, outcome, toast]);

  const goBack = () => {
    if (fresh) { router.dismissAll(); router.replace('/'); } else if (router.canGoBack()) router.back(); else router.replace('/');
  };

  if (ready && !userId) {
    return (
      <Screen><TopBar back={goBack} />
        <Txt variant="h3" style={{ marginTop: space[8] }}>Siparişini görmek için giriş yap</Txt>
        <Button label="Giriş yap" style={{ marginTop: space[6] }} onPress={() => router.push('/auth/sign-in')} />
      </Screen>
    );
  }
  if (isError && !order) {
    return (
      <Screen><TopBar back={goBack} />
        <Txt variant="h3" style={{ marginTop: space[8] }}>Sipariş bulunamadı</Txt>
        <Txt variant="body" color="inkMuted" style={{ marginTop: space[2] }}>Bağlantını kontrol edip tekrar dene.</Txt>
        <Button label="Tekrar dene" variant="secondary" style={{ marginTop: space[6] }} onPress={() => refetch()} />
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
      if (result === 'success') { cart.clear(); toast('Ödemen alındı.'); }
      else if (result === 'failed') toast('Ödeme tamamlanamadı. Kartından ücret alınmadı.');
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
          <Txt variant="overline" color={order.status === 'ready' ? 'success' : 'secondaryInk'}>Sipariş no</Txt>
          <Txt variant="caption" color="inkMuted">{timeOf(order.created_at)}</Txt>
        </View>
        <Txt variant="h1" style={{ fontVariant: ['tabular-nums'] }} accessibilityLabel={`Sipariş numarası ${order.order_no}`}>#{order.order_no}</Txt>
        <Txt variant="h4" accessibilityRole="header" accessibilityLiveRegion="polite">{title}</Txt>
        <Txt variant="bodySm">{body}</Txt>

        {order.status !== 'awaiting_payment' && order.status !== 'cancelled' ? (
          <View style={styles.steps} accessible accessibilityLabel={`Durum: ${STEPS[stepIndex]?.label ?? ''}`}>
            {STEPS.map((s, i) => (
              <View key={s.status} style={styles.step}>
                <View style={[styles.dot, i <= stepIndex && styles.dotOn]}>
                  {i <= stepIndex ? <Check size={14} color={color.onPrimary} strokeWidth={2} /> : null}
                </View>
                <Txt variant="caption" color={i <= stepIndex ? 'ink' : 'inkMuted'} center>{s.label}</Txt>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      {askPush && userId ? (
        <Card style={{ marginTop: space[4], gap: space[3] }}>
          <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
            <Bell size={20} color={color.ink} strokeWidth={1.75} />
            <Txt variant="body" style={{ flex: 1, fontFamily: 'DMSans-SemiBold' }}>Hazır olunca haber verelim mi?</Txt>
          </View>
          <Txt variant="bodySm" color="inkMuted">Sadece sipariş durumun için bildirim göndeririz. İstediğin zaman ayarlardan kapatabilirsin.</Txt>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Button label="Bildirimleri aç" size="md" onPress={async () => {
              const r = await registerForOrderNotifications(userId);
              setAskPush(false);
              toast(r === 'granted' ? 'Siparişin hazır olunca haber vereceğiz.' : 'Bildirimlere izin verilmedi. Ayarlardan açabilirsin.');
            }} />
            <Button label="Şimdi değil" variant="tertiary" size="md" onPress={() => setAskPush(false)} />
          </View>
        </Card>
      ) : null}

      {order.status === 'awaiting_payment' ? (
        <View style={{ gap: space[2], marginTop: space[4] }}>
          <Button label="Ödemeyi tamamla" icon={CreditCard} loading={paying} onPress={resumePayment} />
        </View>
      ) : null}

      <Card style={{ marginTop: space[4], gap: space[3] }}>
        <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
          <MapPin size={20} color={color.ink} strokeWidth={1.75} />
          <View style={{ flex: 1 }}>
            <Txt variant="caption" color="inkMuted">Teslim alınacak şube</Txt>
            <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }}>{order.branch?.name}</Txt>
            <Txt variant="caption" color="inkMuted">{order.branch?.district} · {order.branch?.city}</Txt>
          </View>
        </View>
        <Divider />
        {order.order_items?.map((i) => (
          <View key={i.id} style={{ flexDirection: 'row', gap: space[2] }}>
            <Txt variant="body" style={{ width: 28 }}>{i.quantity}×</Txt>
            <View style={{ flex: 1 }}>
              <Txt variant="body">{i.product_name}</Txt>
              {i.milk_label ? <Txt variant="caption" color="inkMuted">{i.milk_label}</Txt> : null}
              {i.free_quantity ? <Txt variant="caption" color="success">{i.free_quantity} adet hediye kahve</Txt> : null}
            </View>
            <Txt variant="body" style={{ fontVariant: ['tabular-nums'] }}>{tl(i.unit_price * i.quantity)}</Txt>
          </View>
        ))}
        <Divider />
        {order.reward_discount ? <Row icon={Gift} label="Hediye kahve" value={`−${tl(order.reward_discount)}`} /> : null}
        {order.campaign_discount ? <Row icon={Percent} label="İkinci kahve indirimi" value={`−${tl(order.campaign_discount)}`} /> : null}
        {order.cup_discount ? <Row icon={Recycle} label="Kendi bardağın" value={`−${tl(order.cup_discount)}`} /> : null}
        {order.eco_packaging ? <Row icon={Leaf} label="Çevre dostu ambalaj" /> : null}
        <View style={styles.headRow}>
          <Txt variant="h5">Toplam</Txt>
          <Txt variant="h4" style={{ fontVariant: ['tabular-nums'] }}>{tl(order.total)}</Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
          {order.payment_status === 'paid' ? <Check size={16} color={color.success} strokeWidth={2} /> : <Clock size={16} color={color.inkMuted} strokeWidth={1.75} />}
          <Txt variant="bodySm" color={order.payment_status === 'paid' ? 'success' : 'inkMuted'}>
            {order.payment_status === 'paid' ? (order.total === 0 ? 'Hediye kahveyle ödendi' : order.payment_method === 'card' ? 'Kartla ödendi' : 'Kasada ödendi')
              : order.payment_status === 'failed' ? 'Ödeme alınamadı'
              : order.payment_status === 'refunded' ? 'Kartına iade edildi'
              : order.payment_method === 'store' ? 'Teslim alırken kasada ödenecek' : 'Ödeme bekleniyor'}
          </Txt>
        </View>
        {order.stamps_earned > 0 && order.status !== 'cancelled' ? (
          <Txt variant="caption" color="inkMuted">
            {order.payment_method === 'store' && order.status !== 'collected'
              ? `Teslim aldığında kahve kartına ${order.stamps_earned} damga eklenecek.`
              : `Kahve kartına ${order.stamps_earned} damga eklendi.`}
          </Txt>
        ) : null}
      </Card>

      {canCancel ? (
        <Button
          label="Siparişi iptal et"
          variant="danger"
          size="md"
          icon={XCircle}
          loading={cancel.isPending}
          style={{ marginTop: space[6] }}
          onPress={() => cancel.mutate(order.id, {
            onSuccess: () => { toast('Siparişin iptal edildi.'); refetch(); },
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
});

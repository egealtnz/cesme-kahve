import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { CreditCard, Gift, Leaf, Lock, MapPin, MessageSquare, Percent, Recycle, Utensils, Wallet } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { OptionRow } from '@/components/Controls';
import { Card, Divider, Screen, TopBar } from '@/components/Layout';
import { checkPayment, placeOrder, startCardPayment, openPaymentPage, useBranchesLive, useCatalogue, useRewards } from '@/lib/api';
import { branchState, pickupLabel, pickupSlots } from '@/lib/hours';
import { PickupPicker } from '@/components/PickupPicker';
import { errorCode, errorMessage } from '@/lib/errors';
import { tl } from '@/lib/format';
import { priceCart } from '@/lib/pricing';
import type { PaymentMethod } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { useCart } from '@/state/cart';
import { color, space } from '@/theme/tokens';
import { DemoNote } from '@/components/Demo';
import { FadeIn } from '@/components/Motion';
import { itemExtrasFromCart, productName } from '@/lib/display';
import { L } from '@/lib/i18n';

export default function CheckoutConfirm() {
  const { data: cat } = useCatalogue();
  const { session, userId, profile } = useAuth();
  const rewards = useRewards(userId);
  const cart = useCart();
  const qc = useQueryClient();
  const hasPhone = !!profile?.phone;
  const cardsOn = !!cat?.settings.card_payments_enabled;
  const [method, setMethod] = useState<PaymentMethod>(hasPhone && cardsOn ? 'card' : 'store');
  const [busy, setBusy] = useState<null | 'placing' | 'paying' | 'checking'>(null);
  const [error, setError] = useState<string | null>(null);

  const live = useBranchesLive();
  const branch = (live.data ?? cat?.branches)?.find((b) => b.id === cart.branchId);
  const [pickupAt, setPickupAt] = useState<string | null>(null);
  const rewardCount = rewards.data?.length ?? 0;
  const totals = useMemo(() => {
    if (!cat) return null;
    const lines = cart.lines.flatMap((l) => {
      const product = cat.productById.get(l.productId);
      const options = (l.options ?? []).flatMap((id) => cat.valueById.get(id) ?? []);
      return product ? [{ key: l.key, product, milk: l.milkId ? cat.milkById.get(l.milkId) ?? null : null, options, qty: l.qty }] : [];
    });
    return priceCart(lines, { useRewards: Math.min(cart.useRewards, rewardCount), ownCup: cart.ownCup && cat.settings.own_cup_discount > 0, settings: cat.settings, drinkCategories: cat.drinkCategories });
  }, [cat, cart.lines, cart.useRewards, cart.ownCup, rewardCount]);

  if (!session) return <Redirect href={{ pathname: '/auth/sign-in', params: { next: '/checkout/branch' } }} />;
  if (!cart.lines.length) return <Redirect href="/cart" />;
  if (!branch) return <Redirect href="/checkout/branch" />;
  if (!totals || !cat) return <Screen><TopBar back /></Screen>;

  const st = branchState(branch);
  const atTable = !!cart.table;
  if (!st.orderable && !atTable) return <Redirect href="/checkout/branch" />;
  // Branch closed or paused right now: an order for later is the only option (first free time preselected).
  // At a table it is always "now".
  const pickup = atTable ? null : pickupAt ?? (st.orderNow ? null : pickupSlots(branch)[0]?.at.toISOString() ?? null);
  const needsTime = !atTable && !st.orderNow && !pickup;
  const tableBlocked = atTable && !st.orderNow;
  const free = totals.total === 0;
  const effective: PaymentMethod = free || !cardsOn ? 'store' : method;

  const submit = async () => {
    if (needsTime) { setError(L('Teslim alma saatini seç.', 'Choose a pickup time.')); return; }
    if (tableBlocked) { setError(L('Şube şu an sipariş almıyor. Biraz sonra tekrar dene.', 'The branch is not taking orders right now. Try again shortly.')); return; }
    setError(null);
    setBusy('placing');
    try {
      const order = await placeOrder({
        branchId: branch.id,
        items: cart.lines.map((l) => ({ product_id: l.productId, milk_id: l.milkId, quantity: l.qty, options: l.options ?? [] })),
        paymentMethod: effective,
        useRewards: Math.min(cart.useRewards, totals.coffees, rewardCount),
        eco: cart.eco,
        ownCup: cart.ownCup && (cat?.settings.own_cup_discount ?? 0) > 0,
        pickupAt: pickup,
        table: cart.table,
        note: cart.note,
      });
      qc.invalidateQueries({ queryKey: ['rewards'] });

      if (order.status !== 'awaiting_payment') {
        cart.clear();
        qc.invalidateQueries({ queryKey: ['orders'] });
        router.replace({ pathname: '/order/[id]', params: { id: order.id, fresh: '1' } });
        return;
      }

      setBusy('paying');
      const pageUrl = await startCardPayment(order.id);
      await openPaymentPage(pageUrl);
      setBusy('checking');
      const outcome = await checkPayment(order.id).catch(() => 'pending' as const);
      if (outcome === 'success') cart.clear();
      qc.invalidateQueries({ queryKey: ['orders'] });
      router.replace({ pathname: '/order/[id]', params: { id: order.id, fresh: '1', outcome } });
    } catch (e) {
      const code = errorCode(e);
      if (code === 'product_sold_out') qc.invalidateQueries({ queryKey: ['sold-out', branch.id] });
      if (code === 'product_unavailable') qc.invalidateQueries({ queryKey: ['catalogue'] });
      if (['branch_paused', 'branch_closed_now', 'pickup_outside_hours', 'pickup_too_soon'].includes(code)) {
        qc.invalidateQueries({ queryKey: ['branches-live'] });
        setPickupAt(null);
      }
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      footer={
        <View style={{ gap: space[2] }}>
          {error ? <Txt variant="bodySm" color="error" accessibilityLiveRegion="polite">{error}</Txt> : null}
          <Button
            label={busy === 'placing' ? L('Sipariş oluşturuluyor…', 'Placing your order…') : busy === 'paying' ? L('Ödeme sayfası açılıyor…', 'Opening the payment page…') : busy === 'checking' ? L('Ödeme kontrol ediliyor…', 'Checking the payment…')
              : effective === 'card' ? L(`${tl(totals.total)} öde`, `Pay ${tl(totals.total)}`) : L(`Siparişi onayla · ${tl(totals.total)}`, `Place order · ${tl(totals.total)}`)}
            disabled={tableBlocked}
            icon={effective === 'card' ? Lock : undefined}
            loading={!!busy}
            onPress={submit}
          />
          <Txt variant="caption" color="inkMuted" center>
            {L('Siparişi onaylayarak', 'By placing the order you accept the')}{' '}
            <Txt variant="caption" color="ink" style={{ textDecorationLine: 'underline' }} onPress={() => router.push('/legal/on-bilgilendirme')}>{L('Ön Bilgilendirme Formu', 'Pre-information Form')}</Txt>
            {' '}{L('ve', 'and the')}{' '}
            <Txt variant="caption" color="ink" style={{ textDecorationLine: 'underline' }} onPress={() => router.push('/legal/mesafeli-satis')}>{L('Mesafeli Satış Sözleşmesi', 'Distance Sales Agreement')}</Txt>
            {L('’ni kabul edersin.', '.')}
          </Txt>
        </View>
      }
    >
      <TopBar back />
      <Txt variant="overline" color="secondaryInk" style={{ marginTop: space[5] }}>{L('Son adım', 'Last step')}</Txt>
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>{L('Ödeme', 'Checkout')}</Txt>

      {atTable ? (
        <FadeIn>
          <Card tone="primary" style={{ marginTop: space[6], flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
            <Utensils size={20} color={color.onPrimary} strokeWidth={1.75} />
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color="onPrimary">{L('Masaya servis', 'Table service')} · {branch.name}</Txt>
              <Txt variant="body" color="onPrimary" style={{ fontFamily: 'DMSans-SemiBold' }}>{L(`Masa ${cart.table}`, `Table ${cart.table}`)}</Txt>
              <Txt variant="caption" color="onPrimary">
                {st.orderNow ? L(`Yaklaşık ${st.waitMinutes} dakikada masanda`, `At your table in about ${st.waitMinutes} minutes`) : st.label}
              </Txt>
            </View>
          </Card>
        </FadeIn>
      ) : (
        <>
          <FadeIn>
            <Card tone="soft" style={{ marginTop: space[6], flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
              <MapPin size={20} color={color.ink} strokeWidth={1.75} />
              <View style={{ flex: 1 }}>
                <Txt variant="caption">{L('Teslim alınacak şube', 'Pick up at')}</Txt>
                <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }}>{branch.name}</Txt>
                <Txt variant="caption">{pickup ? L(`Teslim alma: ${pickupLabel(pickup)}`, `Pickup: ${pickupLabel(pickup)}`) : st.orderNow ? L(`Yaklaşık ${st.waitMinutes} dakikada hazır`, `Ready in about ${st.waitMinutes} minutes`) : st.label}</Txt>
              </View>
              <Button label={L('Değiştir', 'Change')} variant="tertiary" size="sm" onPress={() => router.back()} />
            </Card>
          </FadeIn>

          <Txt variant="h6" accessibilityRole="header" style={{ marginTop: space[6], marginBottom: space[3] }}>{L('Ne zaman alacaksın?', 'When will you pick it up?')}</Txt>
          <PickupPicker branch={branch} value={pickup} onChange={setPickupAt} />
        </>
      )}

      <Txt variant="h6" accessibilityRole="header" style={{ marginTop: space[6], marginBottom: space[3] }}>{L('Siparişin', 'Your order')}</Txt>
      <Card style={{ gap: space[2] }}>
        {totals.lines.map((l) => (
          <View key={l.key} style={{ flexDirection: 'row', gap: space[2] }}>
            <Txt variant="body" style={{ width: 28, fontVariant: ['tabular-nums'] }}>{l.qty}×</Txt>
            <View style={{ flex: 1 }}>
              <Txt variant="body">{productName(l.product)}</Txt>
              {itemExtrasFromCart(l.milk, l.options) ? <Txt variant="caption" color="inkMuted">{itemExtrasFromCart(l.milk, l.options)}</Txt> : null}
            </View>
            <Txt variant="body" style={{ fontVariant: ['tabular-nums'] }}>{tl(l.unit * l.qty)}</Txt>
          </View>
        ))}
        <Divider />
        {cart.note.trim() ? <Line icon={MessageSquare} label={`${L('Not', 'Note')}: “${cart.note.trim()}”`} /> : null}
        {atTable ? null : <Line icon={cart.eco ? Leaf : undefined} label={cart.eco ? L('Çevre dostu ambalaj', 'Eco-friendly packaging') : L('Standart ambalaj', 'Standard packaging')} />}
        {totals.reward > 0 ? <Line icon={Gift} label={`${L('Hediye kahve', 'Free coffee')}${totals.freeCount > 1 ? ` ×${totals.freeCount}` : ''}`} value={`−${tl(totals.reward)}`} good /> : null}
        {totals.campaign > 0 ? <Line icon={Percent} label={L(`İkinci kahve %${cat.settings.second_coffee_pct}`, `Second coffee ${cat.settings.second_coffee_pct}% off`)} value={`−${tl(totals.campaign)}`} good /> : null}
        {totals.cup > 0 && !atTable ? <Line icon={Recycle} label={L('Kendi bardağın', 'Own cup')} value={`−${tl(totals.cup)}`} good /> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: space[1] }}>
          <Txt variant="h5">{L('Toplam', 'Total')}</Txt>
          <Txt variant="h3" style={{ fontVariant: ['tabular-nums'] }}>{tl(totals.total)}</Txt>
        </View>
      </Card>

      <Txt variant="h6" accessibilityRole="header" style={{ marginTop: space[6], marginBottom: space[3] }}>{L('Ödeme yöntemi', 'Payment')}</Txt>
      {free ? (
        <Card tone="eco" style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
          <Gift size={20} color={color.success} strokeWidth={1.75} />
          <Txt variant="bodySm" style={{ flex: 1 }}>{L('Hediye kahvenle ödenecek tutar kalmadı.', 'Your free coffee covers everything.')}</Txt>
        </Card>
      ) : (
        <View style={{ gap: space[2] }} accessibilityRole="radiogroup">
          {cardsOn ? (
            <OptionRow
              selected={effective === 'card'}
              onPress={() => setMethod('card')}
              disabled={!hasPhone}
              icon={CreditCard}
              title={L('Kartla öde', 'Pay by card')}
              body={hasPhone ? L('Kredi veya banka kartı · iyzico güvencesiyle', 'Credit or debit card · secured by iyzico') : L('Kartla ödeme için hesabına cep telefonu ekle.', 'Add a mobile number to your account to pay by card.')}
            />
          ) : null}
          {effective === 'card' ? <DemoNote>{L('Önizlemede gerçek ödeme alınmaz; kartla ödeme otomatik onaylanır.', 'No real payment in the preview; card payments are approved automatically.')}</DemoNote> : null}
          <OptionRow selected={effective === 'store'} onPress={() => setMethod('store')} icon={Wallet}
            title={atTable ? L('Masada ya da kasada öde', 'Pay at the table or the counter') : L('Şubede öde', 'Pay at the branch')}
            body={atTable ? L('Nakit ya da kartla', 'Cash or card') : L('Teslim alırken kasada nakit ya da kartla öde', 'Pay cash or card at the counter when you pick up')} />
          {cardsOn && !hasPhone ? <Button label={L('Telefon ekle', 'Add phone')} variant="tertiary" size="sm" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/account/edit')} /> : null}
        </View>
      )}
    </Screen>
  );
}

function Line({ icon: Icon, label, value, good }: { icon?: typeof Gift; label: string; value?: string; good?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        {Icon ? <Icon size={18} color={good ? color.success : color.inkMuted} strokeWidth={1.75} /> : null}
        <Txt variant="bodySm" color={good ? 'success' : 'inkMuted'}>{label}</Txt>
      </View>
      {value ? <Txt variant="bodySm" color={good ? 'success' : 'inkMuted'} style={{ fontVariant: ['tabular-nums'] }}>{value}</Txt> : null}
    </View>
  );
}

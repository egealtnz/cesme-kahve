import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { CreditCard, Gift, Leaf, Lock, MapPin, Percent, Recycle, Wallet } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { OptionRow } from '@/components/Controls';
import { Card, Divider, Screen, TopBar } from '@/components/Layout';
import { checkPayment, placeOrder, startCardPayment, openPaymentPage, useCatalogue, useRewards } from '@/lib/api';
import { errorCode, errorMessage } from '@/lib/errors';
import { tl } from '@/lib/format';
import { priceCart } from '@/lib/pricing';
import type { PaymentMethod } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { useCart } from '@/state/cart';
import { color, space } from '@/theme/tokens';
import { DemoNote } from '@/components/Demo';

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

  const branch = cat?.branches.find((b) => b.id === cart.branchId);
  const rewardCount = rewards.data?.length ?? 0;
  const totals = useMemo(() => {
    if (!cat) return null;
    const lines = cart.lines.flatMap((l) => {
      const product = cat.productById.get(l.productId);
      return product ? [{ key: l.key, product, milk: l.milkId ? cat.milkById.get(l.milkId) ?? null : null, qty: l.qty }] : [];
    });
    return priceCart(lines, { useRewards: Math.min(cart.useRewards, rewardCount), ownCup: cart.ownCup && cat.settings.own_cup_discount > 0, settings: cat.settings, drinkCategories: cat.drinkCategories });
  }, [cat, cart.lines, cart.useRewards, cart.ownCup, rewardCount]);

  if (!session) return <Redirect href={{ pathname: '/auth/sign-in', params: { next: '/checkout/branch' } }} />;
  if (!cart.lines.length) return <Redirect href="/cart" />;
  if (!branch) return <Redirect href="/checkout/branch" />;
  if (!totals || !cat) return <Screen><TopBar back /></Screen>;

  const free = totals.total === 0;
  const effective: PaymentMethod = free || !cardsOn ? 'store' : method;

  const submit = async () => {
    setError(null);
    setBusy('placing');
    try {
      const order = await placeOrder({
        branchId: branch.id,
        items: cart.lines.map((l) => ({ product_id: l.productId, milk_id: l.milkId, quantity: l.qty })),
        paymentMethod: effective,
        useRewards: Math.min(cart.useRewards, totals.coffees, rewardCount),
        eco: cart.eco,
        ownCup: cart.ownCup && (cat?.settings.own_cup_discount ?? 0) > 0,
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
            label={busy === 'placing' ? 'Sipariş oluşturuluyor…' : busy === 'paying' ? 'Ödeme sayfası açılıyor…' : busy === 'checking' ? 'Ödeme kontrol ediliyor…'
              : effective === 'card' ? `${tl(totals.total)} öde` : `Siparişi onayla · ${tl(totals.total)}`}
            icon={effective === 'card' ? Lock : undefined}
            loading={!!busy}
            onPress={submit}
          />
          <Txt variant="caption" color="inkMuted" center>
            Siparişi onaylayarak{' '}
            <Txt variant="caption" color="ink" style={{ textDecorationLine: 'underline' }} onPress={() => router.push('/legal/on-bilgilendirme')}>Ön Bilgilendirme Formu</Txt>
            {' '}ve{' '}
            <Txt variant="caption" color="ink" style={{ textDecorationLine: 'underline' }} onPress={() => router.push('/legal/mesafeli-satis')}>Mesafeli Satış Sözleşmesi</Txt>
            ’ni kabul edersin.
          </Txt>
        </View>
      }
    >
      <TopBar back />
      <Txt variant="overline" color="secondaryInk" style={{ marginTop: space[5] }}>Son adım</Txt>
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>Ödeme</Txt>

      <Card tone="soft" style={{ marginTop: space[6], flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
        <MapPin size={20} color={color.ink} strokeWidth={1.75} />
        <View style={{ flex: 1 }}>
          <Txt variant="caption">Teslim alınacak şube</Txt>
          <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }}>{branch.name}</Txt>
          <Txt variant="caption">Yaklaşık {branch.prep_minutes} dakikada hazır</Txt>
        </View>
        <Button label="Değiştir" variant="tertiary" size="sm" onPress={() => router.back()} />
      </Card>

      <Txt variant="h6" accessibilityRole="header" style={{ marginTop: space[6], marginBottom: space[3] }}>Siparişin</Txt>
      <Card style={{ gap: space[2] }}>
        {totals.lines.map((l) => (
          <View key={l.key} style={{ flexDirection: 'row', gap: space[2] }}>
            <Txt variant="body" style={{ width: 28, fontVariant: ['tabular-nums'] }}>{l.qty}×</Txt>
            <View style={{ flex: 1 }}>
              <Txt variant="body">{l.product.name}</Txt>
              {l.milk ? <Txt variant="caption" color="inkMuted">{l.milk.label}</Txt> : null}
            </View>
            <Txt variant="body" style={{ fontVariant: ['tabular-nums'] }}>{tl(l.unit * l.qty)}</Txt>
          </View>
        ))}
        <Divider />
        <Line icon={cart.eco ? Leaf : undefined} label={cart.eco ? 'Çevre dostu ambalaj' : 'Standart ambalaj'} />
        {totals.reward > 0 ? <Line icon={Gift} label={`Hediye kahve${totals.freeCount > 1 ? ` ×${totals.freeCount}` : ''}`} value={`−${tl(totals.reward)}`} good /> : null}
        {totals.campaign > 0 ? <Line icon={Percent} label={`İkinci kahve %${cat.settings.second_coffee_pct}`} value={`−${tl(totals.campaign)}`} good /> : null}
        {totals.cup > 0 ? <Line icon={Recycle} label="Kendi bardağın" value={`−${tl(totals.cup)}`} good /> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: space[1] }}>
          <Txt variant="h5">Toplam</Txt>
          <Txt variant="h3" style={{ fontVariant: ['tabular-nums'] }}>{tl(totals.total)}</Txt>
        </View>
      </Card>

      <Txt variant="h6" accessibilityRole="header" style={{ marginTop: space[6], marginBottom: space[3] }}>Ödeme yöntemi</Txt>
      {free ? (
        <Card tone="eco" style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
          <Gift size={20} color={color.success} strokeWidth={1.75} />
          <Txt variant="bodySm" style={{ flex: 1 }}>Hediye kahvenle ödenecek tutar kalmadı.</Txt>
        </Card>
      ) : (
        <View style={{ gap: space[2] }} accessibilityRole="radiogroup">
          {cardsOn ? (
            <OptionRow
              selected={effective === 'card'}
              onPress={() => setMethod('card')}
              disabled={!hasPhone}
              icon={CreditCard}
              title="Kartla öde"
              body={hasPhone ? 'Kredi veya banka kartı · iyzico güvencesiyle' : 'Kartla ödeme için hesabına cep telefonu ekle.'}
            />
          ) : null}
          {effective === 'card' ? <DemoNote>Önizlemede gerçek ödeme alınmaz; kartla ödeme otomatik onaylanır.</DemoNote> : null}
          <OptionRow selected={effective === 'store'} onPress={() => setMethod('store')} icon={Wallet} title="Şubede öde" body="Teslim alırken kasada nakit ya da kartla öde" />
          {cardsOn && !hasPhone ? <Button label="Telefon ekle" variant="tertiary" size="sm" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/account/edit')} /> : null}
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

import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Coffee, CreditCard, Gift, Leaf, MapPin, MessageSquare, Percent, Recycle, UserPlus, Utensils } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Stepper } from '@/components/Stepper';
import { ToggleRow } from '@/components/Controls';
import { ProductPhoto } from '@/components/Product';
import { Card, Divider, TopBar } from '@/components/Layout';
import { Field } from '@/components/Field';
import { FadeIn, Pop } from '@/components/Motion';
import { itemExtrasFromCart, productName } from '@/lib/display';
import { useBranchesLive, useCatalogue, useRewards, useSoldOut } from '@/lib/api';
import { branchState } from '@/lib/hours';
import { tl } from '@/lib/format';
import { priceCart } from '@/lib/pricing';
import { useAuth } from '@/state/auth';
import { useCart } from '@/state/cart';
import { color, radius, shadow, space } from '@/theme/tokens';
import { L } from '@/lib/i18n';

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const { data: cat } = useCatalogue();
  const { session, userId } = useAuth();
  const rewards = useRewards(userId);
  const cart = useCart();
  const soldOut = useSoldOut(cart.branchId);
  const live = useBranchesLive();
  const branch = (live.data ?? cat?.branches)?.find((b) => b.id === cart.branchId) ?? null;
  const rewardCount = session ? rewards.data?.length ?? 0 : 0;

  // Items that left the menu are dropped from the cart.
  useEffect(() => {
    if (!cat) return;
    const gone = cart.lines.filter((l) => !cat.productById.has(l.productId)).map((l) => l.productId);
    if (gone.length) cart.removeProducts(gone);
  }, [cat, cart]);

  const totals = useMemo(() => {
    if (!cat) return null;
    const lines = cart.lines.flatMap((l) => {
      const product = cat.productById.get(l.productId);
      const options = (l.options ?? []).flatMap((id) => cat.valueById.get(id) ?? []);
      return product ? [{ key: l.key, product, milk: l.milkId ? cat.milkById.get(l.milkId) ?? null : null, options, qty: l.qty }] : [];
    });
    return priceCart(lines, { useRewards: Math.min(cart.useRewards, rewardCount), ownCup: cart.ownCup && cat.settings.own_cup_discount > 0, settings: cat.settings, drinkCategories: cat.drinkCategories });
  }, [cat, cart.lines, cart.useRewards, cart.ownCup, rewardCount]);

  const unavailable = totals?.lines.filter((l) => soldOut.data?.has(l.product.id)) ?? [];
  const tabBar = 64 + insets.bottom;

  if (!cat || !totals || cart.lines.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.pad}><TopBar /><Txt variant="h1" style={{ marginTop: space[4] }}>{L('Sepetin', 'Your cart')}</Txt></View>
        <View style={[styles.empty, { paddingBottom: tabBar }]}>
          <Pop from={0.7}>
            <Image source={require('../../../assets/images/takeaway-cup.png')} style={{ width: 160, height: 140 }} contentFit="contain" accessibilityIgnoresInvertColors />
          </Pop>
          <FadeIn delay={120}>
            <Txt variant="h4" center style={{ marginTop: space[4] }}>{L('Sepetin şimdilik boş', 'Your cart is empty')}</Txt>
            <Txt variant="bodySm" color="inkMuted" center style={{ marginTop: space[2], maxWidth: 260 }}>
              {L('Kruvasanlar fırından yeni çıktı. Menüye göz atıp ilk ürününü ekle.', 'The croissants just came out of the oven. Have a look at the menu and add your first item.')}
            </Txt>
          </FadeIn>
          <FadeIn delay={220}>
            <Button label={L('Menüye göz at', 'Browse the menu')} icon={Coffee} style={{ marginTop: space[6] }} onPress={() => router.navigate('/')} />
          </FadeIn>
        </View>
      </SafeAreaView>
    );
  }

  const maxFree = Math.min(rewardCount, totals.coffees);
  const goCheckout = () => {
    const next = cart.table && cart.branchId ? '/checkout/confirm' : '/checkout/branch';
    if (!session) router.push({ pathname: '/auth/sign-in', params: { next } });
    else router.push(next);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: tabBar + 96 }]} showsVerticalScrollIndicator={false}>
        <TopBar />
        <View style={styles.titleRow}>
          <Txt variant="h1" accessibilityRole="header">{L('Sepetin', 'Your cart')}</Txt>
          <Txt variant="bodySm" color="inkMuted">{L(`${totals.count} ürün`, `${totals.count} ${totals.count === 1 ? 'item' : 'items'}`)}</Txt>
        </View>

        {cart.table && branch ? (
          <Card tone="primary" style={styles.branch}>
            <View style={[styles.disc, { backgroundColor: color.secondary }]}><Utensils size={20} color={color.onSecondary} strokeWidth={1.75} /></View>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color="onPrimary">{L('Masaya servis', 'Table service')} · {branch.name}</Txt>
              <Txt variant="body" color="onPrimary" style={{ fontFamily: 'DMSans-SemiBold' }}>{L(`Masa ${cart.table}`, `Table ${cart.table}`)}</Txt>
              <Txt variant="caption" color="onPrimary">{L('Hazır olunca masana getireceğiz.', 'We will bring it to your table when it is ready.')}</Txt>
            </View>
          </Card>
        ) : (
          <Card tone="soft" style={styles.branch}>
            <View style={styles.disc}><MapPin size={20} color={color.ink} strokeWidth={1.75} /></View>
            <View style={{ flex: 1 }}>
              <Txt variant="caption">{L('Teslim alınacak şube', 'Pick up at')}</Txt>
              <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }}>{branch ? branch.name : L('Ödemeden önce seçeceksin', 'You will choose before paying')}</Txt>
              {branch ? <Txt variant="caption">{(() => { const st = branchState(branch); return st.orderNow ? L(`Yaklaşık ${st.waitMinutes} dakikada hazır`, `Ready in about ${st.waitMinutes} minutes`) : L(`${st.label} · ileri saate sipariş verebilirsin`, `${st.label} · you can order for later`); })()}</Txt> : null}
            </View>
            <Button label={branch ? L('Değiştir', 'Change') : L('Seç', 'Choose')} variant="tertiary" size="sm" onPress={() => router.push('/branches')} />
          </Card>
        )}

        <Txt variant="h4" accessibilityRole="header" style={styles.h}>{L('Sipariş özeti', 'Order summary')}</Txt>
        <Card style={{ paddingVertical: 0, paddingHorizontal: space[3] }}>
          {totals.lines.map((l, i) => (
            <FadeIn key={l.key} index={i}>
              {i > 0 ? <Divider /> : null}
              <View style={styles.line}>
                <ProductPhoto product={l.product} size={64} soldOut={soldOut.data?.has(l.product.id)} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.lineTop}>
                    <Txt variant="h6" style={{ flex: 1 }}>{productName(l.product)}</Txt>
                    <Txt variant="h6" style={{ fontVariant: ['tabular-nums'] }}>{tl(l.unit * l.qty)}</Txt>
                  </View>
                  {itemExtrasFromCart(l.milk, l.options) ? <Txt variant="caption" color="secondaryInk">{itemExtrasFromCart(l.milk, l.options)}</Txt> : null}
                  <Txt variant="caption" color="inkMuted">{L(`${tl(l.unit)} / adet`, `${tl(l.unit)} each`)}</Txt>
                  {l.free ? <Pop><Badge tone="gift" label={L(`${l.free} adet hediye`, `${l.free} free`)} /></Pop> : null}
                  {soldOut.data?.has(l.product.id) ? <Badge tone="error" label={L('Bu şubede tükendi', 'Sold out at this branch')} /> : null}
                  <View style={{ marginTop: 4 }}>
                    <Stepper value={l.qty} onChange={(n) => cart.setQty(l.key, n)} name={productName(l.product)} removable />
                  </View>
                </View>
              </View>
            </FadeIn>
          ))}
        </Card>

        <Txt variant="h4" accessibilityRole="header" style={styles.h}>{L('Baristaya not', 'Note for the barista')}</Txt>
        <Card style={{ gap: space[2] }}>
          <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
            <MessageSquare size={18} color={color.inkMuted} strokeWidth={1.75} />
            <Txt variant="bodySm" color="inkMuted" style={{ flex: 1 }}>{L('Ör. “az köpüklü”, “çok sıcak olmasın”, “kruvasanı ısıtın”.', 'E.g. “light foam”, “not too hot”, “warm the croissant”.')}</Txt>
          </View>
          <Field label={L('Not', 'Note')} optional value={cart.note} onChangeText={cart.setNote} maxLength={140} multiline
            placeholder={L('Baristaya iletmek istediğin bir şey', 'Anything the barista should know')}
            hint={cart.note ? `${cart.note.length}/140` : undefined}
            style={{ minHeight: 64, textAlignVertical: 'top', paddingTop: 12 }} />
        </Card>

        {cart.table ? null : <>
        <Txt variant="h4" accessibilityRole="header" style={styles.h}>{L('Ambalaj', 'Packaging')}</Txt>
        <Card style={{ padding: 0 }}>
          <ToggleRow
            icon={Leaf}
            title={L('Çevre dostu ambalaj kullan', 'Use eco-friendly packaging')}
            body={cart.eco ? L('Geri dönüştürülebilir bardak ve kâğıt çanta. Plastik yok.', 'Recyclable cup and paper bag. No plastic.') : L('Standart ambalajla hazırlanacak.', 'Standard packaging.')}
            value={cart.eco}
            onChange={cart.setEco}
          />
          {totals.hasDrink && cat.settings.own_cup_discount > 0 ? (
            <>
              <Divider />
              <ToggleRow
                icon={Recycle}
                title={L('Kendi bardağımı getireceğim', 'I’ll bring my own cup')}
                body={L(`Bardağını baristaya ver, siparişinden ${tl(cat.settings.own_cup_discount)} düşelim.`, `Hand your cup to the barista and we take ${tl(cat.settings.own_cup_discount)} off.`)}
                value={cart.ownCup}
                onChange={cart.setOwnCup}
              />
            </>
          ) : null}
        </Card>
        </>}

        {rewardCount > 0 || !session ? (
          <>
            <Txt variant="h4" accessibilityRole="header" style={styles.h}>{L('Kahve kartı', 'Coffee card')}</Txt>
            <Card tone="soft">
              {session ? (
                <View style={{ gap: space[3] }}>
                  <View style={styles.rewardHead}>
                    <View style={[styles.disc, { backgroundColor: color.surface }]}><Gift size={20} color={color.ink} strokeWidth={1.75} /></View>
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }}>{L(`${rewardCount} hediye kahven var`, `You have ${rewardCount} free ${rewardCount === 1 ? 'coffee' : 'coffees'}`)}</Txt>
                      <Txt variant="bodySm">
                        {totals.coffees === 0 ? L('Sepetine bir kahve ekle, hediyeni burada kullan.', 'Add a coffee to your cart to use it here.') : L('En yüksek fiyatlı kahvene uygulanır, süt seçimi dahil.', 'Applied to your most expensive coffee, milk and extras included.')}
                      </Txt>
                    </View>
                  </View>
                  {maxFree > 0 ? (
                    <View style={styles.rewardPick}>
                      <Txt variant="bodySm" style={{ flex: 1 }}>{L('Kullanılacak hediye kahve', 'Free coffees to use')}</Txt>
                      <Stepper value={Math.min(cart.useRewards, maxFree)} onChange={(n) => cart.setUseRewards(Math.max(0, Math.min(n, maxFree)))}
                        name={L('hediye kahve', 'free coffee')} min={0} max={maxFree} />
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={{ gap: space[3] }}>
                  <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }}>{L('Üye ol, her kahveden damga kazan', 'Sign up and earn a stamp with every coffee')}</Txt>
                  <Txt variant="bodySm">{L(`${cat.settings.stamps_per_reward} kahvede bir kahve bizden. Damgalar üye olduktan sonraki siparişlerinde birikir.`, `Every ${cat.settings.stamps_per_reward}th coffee is on us. Stamps start with your first order after signing up.`)}</Txt>
                  <Button label={L('Üye ol', 'Sign up')} icon={UserPlus} size="md" style={{ alignSelf: 'flex-start' }}
                    onPress={() => router.push({ pathname: '/auth/sign-up', params: { next: '/cart' } })} />
                </View>
              )}
            </Card>
          </>
        ) : null}

        <Txt variant="h4" accessibilityRole="header" style={styles.h}>{L('Ödeme özeti', 'Payment summary')}</Txt>
        <Card style={{ gap: space[2] }}>
          <Row label={L('Ara toplam', 'Subtotal')} value={tl(totals.subtotal)} />
          {totals.reward > 0 ? <Row icon={Gift} label={`${L('Hediye kahve', 'Free coffee')}${totals.freeCount > 1 ? ` ×${totals.freeCount}` : ''}`} value={`−${tl(totals.reward)}`} good /> : null}
          {totals.campaign > 0 ? <Row icon={Percent} label={L(`İkinci kahve %${cat.settings.second_coffee_pct}`, `Second coffee ${cat.settings.second_coffee_pct}% off`)} value={`−${tl(totals.campaign)}`} good /> : null}
          {totals.cup > 0 ? <Row icon={Leaf} label={L('Kendi bardağın', 'Own cup')} value={`−${tl(totals.cup)}`} good /> : null}
          {cat.settings.second_coffee_active && totals.paidCoffees === 1 ? (
            <View style={styles.hint}><Txt variant="bodySm">{L(`Bir kahve daha ekle, ikincisi %${cat.settings.second_coffee_pct} indirimli olsun.`, `Add one more coffee and get ${cat.settings.second_coffee_pct}% off the second.`)}</Txt></View>
          ) : null}
          <View style={styles.totalRow}>
            <Txt variant="h5">{L('Toplam', 'Total')}</Txt>
            <Txt variant="h3" style={{ fontVariant: ['tabular-nums'] }}>{tl(totals.total)}</Txt>
          </View>
          <Txt variant="caption" color="inkMuted">{L('KDV dahil. Kesin tutar ödeme adımında gösterilir.', 'VAT included. The final amount is shown at checkout.')}</Txt>
        </Card>
      </ScrollView>

      <View style={[styles.footer, { bottom: tabBar }]}>
        {unavailable.length ? (
          <Txt variant="bodySm" color="error" style={{ marginBottom: space[2] }}>{L('Tükenen ürünleri çıkar ya da başka bir şube seç.', 'Remove the sold-out items or choose another branch.')}</Txt>
        ) : null}
        <Button
          label={L(`Ödeme Yap · ${tl(totals.total)}`, `Checkout · ${tl(totals.total)}`)}
          icon={CreditCard}
          disabled={unavailable.length > 0}
          onPress={goCheckout}
        />
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value, icon: Icon, good }: { label: string; value: string; icon?: typeof Gift; good?: boolean }) {
  return (
    <View style={styles.row}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {Icon ? <Icon size={18} color={good ? color.success : color.ink} strokeWidth={1.75} /> : null}
        <Txt variant="body" color={good ? 'success' : 'ink'}>{label}</Txt>
      </View>
      <Txt variant="body" color={good ? 'success' : 'ink'} style={{ fontVariant: ['tabular-nums'] }}>{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  pad: { paddingHorizontal: space[4] },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[6] },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space[4] },
  branch: { marginTop: space[6], flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], paddingHorizontal: space[3], borderRadius: radius.md },
  disc: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' },
  h: { marginTop: space[8], marginBottom: space[3] },
  line: { flexDirection: 'row', gap: space[3], paddingVertical: space[3] },
  lineTop: { flexDirection: 'row', gap: space[2], alignItems: 'flex-start' },
  rewardHead: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  rewardPick: { flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: color.surface, borderRadius: radius.md, paddingHorizontal: space[3], paddingVertical: space[2] },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hint: { backgroundColor: color.secondarySoft, borderRadius: radius.sm, paddingHorizontal: space[3], paddingVertical: space[2] },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', borderTopWidth: 1, borderTopColor: color.line, paddingTop: space[3], marginTop: space[1] },
  footer: { position: 'absolute', left: 0, right: 0, backgroundColor: color.surface, paddingHorizontal: space[4], paddingVertical: space[3], boxShadow: shadow.md },
});

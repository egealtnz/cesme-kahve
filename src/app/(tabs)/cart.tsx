import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Coffee, CreditCard, Gift, Leaf, MapPin, Percent, Recycle, UserPlus } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Stepper } from '@/components/Stepper';
import { ToggleRow } from '@/components/Controls';
import { ProductPhoto } from '@/components/Product';
import { Card, Divider, TopBar } from '@/components/Layout';
import { useBranchesLive, useCatalogue, useRewards, useSoldOut } from '@/lib/api';
import { branchState } from '@/lib/hours';
import { tl } from '@/lib/format';
import { priceCart } from '@/lib/pricing';
import { useAuth } from '@/state/auth';
import { useCart } from '@/state/cart';
import { color, radius, shadow, space } from '@/theme/tokens';

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
      return product ? [{ key: l.key, product, milk: l.milkId ? cat.milkById.get(l.milkId) ?? null : null, qty: l.qty }] : [];
    });
    return priceCart(lines, { useRewards: Math.min(cart.useRewards, rewardCount), ownCup: cart.ownCup && cat.settings.own_cup_discount > 0, settings: cat.settings, drinkCategories: cat.drinkCategories });
  }, [cat, cart.lines, cart.useRewards, cart.ownCup, rewardCount]);

  const unavailable = totals?.lines.filter((l) => soldOut.data?.has(l.product.id)) ?? [];
  const tabBar = 64 + insets.bottom;

  if (!cat || !totals || cart.lines.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.pad}><TopBar /><Txt variant="h1" style={{ marginTop: space[4] }}>Sepetin</Txt></View>
        <View style={[styles.empty, { paddingBottom: tabBar }]}>
          <Image source={require('../../../assets/images/takeaway-cup.png')} style={{ width: 160, height: 140 }} contentFit="contain" accessibilityIgnoresInvertColors />
          <Txt variant="h4" center style={{ marginTop: space[4] }}>Sepetin şimdilik boş</Txt>
          <Txt variant="bodySm" color="inkMuted" center style={{ marginTop: space[2], maxWidth: 260 }}>
            Kruvasanlar fırından yeni çıktı. Menüye göz atıp ilk ürününü ekle.
          </Txt>
          <Button label="Menüye göz at" icon={Coffee} style={{ marginTop: space[6] }} onPress={() => router.navigate('/')} />
        </View>
      </SafeAreaView>
    );
  }

  const maxFree = Math.min(rewardCount, totals.coffees);
  const goCheckout = () => {
    if (!session) router.push({ pathname: '/auth/sign-in', params: { next: '/checkout/branch' } });
    else router.push('/checkout/branch');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: tabBar + 96 }]} showsVerticalScrollIndicator={false}>
        <TopBar />
        <View style={styles.titleRow}>
          <Txt variant="h1" accessibilityRole="header">Sepetin</Txt>
          <Txt variant="bodySm" color="inkMuted">{totals.count} ürün</Txt>
        </View>

        <Card tone="soft" style={styles.branch}>
          <View style={styles.disc}><MapPin size={20} color={color.ink} strokeWidth={1.75} /></View>
          <View style={{ flex: 1 }}>
            <Txt variant="caption">Teslim alınacak şube</Txt>
            <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }}>{branch ? branch.name : 'Ödemeden önce seçeceksin'}</Txt>
            {branch ? <Txt variant="caption">{(() => { const st = branchState(branch); return st.orderNow ? `Yaklaşık ${st.waitMinutes} dakikada hazır` : `${st.label} · ileri saate sipariş verebilirsin`; })()}</Txt> : null}
          </View>
          <Button label={branch ? 'Değiştir' : 'Seç'} variant="tertiary" size="sm" onPress={() => router.push('/branches')} />
        </Card>

        <Txt variant="h4" accessibilityRole="header" style={styles.h}>Sipariş özeti</Txt>
        <Card style={{ paddingVertical: 0, paddingHorizontal: space[3] }}>
          {totals.lines.map((l, i) => (
            <View key={l.key}>
              {i > 0 ? <Divider /> : null}
              <View style={styles.line}>
                <ProductPhoto product={l.product} size={64} soldOut={soldOut.data?.has(l.product.id)} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.lineTop}>
                    <Txt variant="h6" style={{ flex: 1 }}>{l.product.name}</Txt>
                    <Txt variant="h6" style={{ fontVariant: ['tabular-nums'] }}>{tl(l.unit * l.qty)}</Txt>
                  </View>
                  <Txt variant="caption" color="inkMuted">{l.milk ? `${l.milk.label} · ` : ''}{tl(l.unit)} / adet</Txt>
                  {l.free ? <Badge tone="gift" label={`${l.free} adet hediye`} /> : null}
                  {soldOut.data?.has(l.product.id) ? <Badge tone="error" label="Bu şubede tükendi" /> : null}
                  <View style={{ marginTop: 4 }}>
                    <Stepper value={l.qty} onChange={(n) => cart.setQty(l.key, n)} name={l.product.name} removable />
                  </View>
                </View>
              </View>
            </View>
          ))}
        </Card>

        <Txt variant="h4" accessibilityRole="header" style={styles.h}>Ambalaj</Txt>
        <Card style={{ padding: 0 }}>
          <ToggleRow
            icon={Leaf}
            title="Çevre dostu ambalaj kullan"
            body={cart.eco ? 'Geri dönüştürülebilir bardak ve kâğıt çanta. Plastik yok.' : 'Standart ambalajla hazırlanacak.'}
            value={cart.eco}
            onChange={cart.setEco}
          />
          {totals.hasDrink && cat.settings.own_cup_discount > 0 ? (
            <>
              <Divider />
              <ToggleRow
                icon={Recycle}
                title="Kendi bardağımı getireceğim"
                body={`Bardağını baristaya ver, siparişinden ${tl(cat.settings.own_cup_discount)} düşelim.`}
                value={cart.ownCup}
                onChange={cart.setOwnCup}
              />
            </>
          ) : null}
        </Card>

        {rewardCount > 0 || !session ? (
          <>
            <Txt variant="h4" accessibilityRole="header" style={styles.h}>Kahve kartı</Txt>
            <Card tone="soft">
              {session ? (
                <View style={{ gap: space[3] }}>
                  <View style={styles.rewardHead}>
                    <View style={[styles.disc, { backgroundColor: color.surface }]}><Gift size={20} color={color.ink} strokeWidth={1.75} /></View>
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }}>{rewardCount} hediye kahven var</Txt>
                      <Txt variant="bodySm">
                        {totals.coffees === 0 ? 'Sepetine bir kahve ekle, hediyeni burada kullan.' : 'En yüksek fiyatlı kahvene uygulanır, süt seçimi dahil.'}
                      </Txt>
                    </View>
                  </View>
                  {maxFree > 0 ? (
                    <View style={styles.rewardPick}>
                      <Txt variant="bodySm" style={{ flex: 1 }}>Kullanılacak hediye kahve</Txt>
                      <Stepper value={Math.min(cart.useRewards, maxFree)} onChange={(n) => cart.setUseRewards(Math.max(0, Math.min(n, maxFree)))}
                        name="hediye kahve" min={0} max={maxFree} />
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={{ gap: space[3] }}>
                  <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }}>Üye ol, her kahveden damga kazan</Txt>
                  <Txt variant="bodySm">{cat.settings.stamps_per_reward} kahvede bir kahve bizden. Damgalar üye olduktan sonraki siparişlerinde birikir.</Txt>
                  <Button label="Üye ol" icon={UserPlus} size="md" style={{ alignSelf: 'flex-start' }}
                    onPress={() => router.push({ pathname: '/auth/sign-up', params: { next: '/cart' } })} />
                </View>
              )}
            </Card>
          </>
        ) : null}

        <Txt variant="h4" accessibilityRole="header" style={styles.h}>Ödeme özeti</Txt>
        <Card style={{ gap: space[2] }}>
          <Row label="Ara toplam" value={tl(totals.subtotal)} />
          {totals.reward > 0 ? <Row icon={Gift} label={`Hediye kahve${totals.freeCount > 1 ? ` ×${totals.freeCount}` : ''}`} value={`−${tl(totals.reward)}`} good /> : null}
          {totals.campaign > 0 ? <Row icon={Percent} label={`İkinci kahve %${cat.settings.second_coffee_pct}`} value={`−${tl(totals.campaign)}`} good /> : null}
          {totals.cup > 0 ? <Row icon={Leaf} label="Kendi bardağın" value={`−${tl(totals.cup)}`} good /> : null}
          {cat.settings.second_coffee_active && totals.paidCoffees === 1 ? (
            <View style={styles.hint}><Txt variant="bodySm">Bir kahve daha ekle, ikincisi %{cat.settings.second_coffee_pct} indirimli olsun.</Txt></View>
          ) : null}
          <View style={styles.totalRow}>
            <Txt variant="h5">Toplam</Txt>
            <Txt variant="h3" style={{ fontVariant: ['tabular-nums'] }}>{tl(totals.total)}</Txt>
          </View>
          <Txt variant="caption" color="inkMuted">KDV dahil. Kesin tutar ödeme adımında gösterilir.</Txt>
        </Card>
      </ScrollView>

      <View style={[styles.footer, { bottom: tabBar }]}>
        {unavailable.length ? (
          <Txt variant="bodySm" color="error" style={{ marginBottom: space[2] }}>Tükenen ürünleri çıkar ya da başka bir şube seç.</Txt>
        ) : null}
        <Button
          label={`Ödeme Yap · ${tl(totals.total)}`}
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

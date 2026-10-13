import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowRight, ChevronRight, Clock, Coffee, Gift, Leaf, MapPin, Percent, QrCode, Recycle, ShoppingBag, Sparkles, Utensils, X } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { ProductCard, ProductPhoto } from '@/components/Product';
import { Logo, SectionTitle } from '@/components/Layout';
import { useBranchesLive, useCatalogue, useRewards, useSoldOut } from '@/lib/api';
import { branchState } from '@/lib/hours';
import { ForYou } from '@/components/ForYou';
import { greeting, tl } from '@/lib/format';
import { errorMessage } from '@/lib/errors';
import { priceCart } from '@/lib/pricing';
import { L, loc } from '@/lib/i18n';
import { categoryBlurb, categoryName, DIET_FILTERS, dietFilterLabel, matchesDiet, productName, type DietFilter } from '@/lib/display';
import { FadeIn, PressableScale } from '@/components/Motion';
import type { Campaign, Product } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { useCart } from '@/state/cart';
import { useToast } from '@/state/toast';
import { color, radius, shadow, space } from '@/theme/tokens';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { data: cat, isLoading, error, refetch } = useCatalogue();
  const { profile, userId } = useAuth();
  const rewards = useRewards(userId);
  const cart = useCart();
  const toast = useToast();
  const live = useBranchesLive();
  const branch = (live.data ?? cat?.branches)?.find((b) => b.id === cart.branchId) ?? null;

  // Signed-in customers start from their favourite branch.
  useEffect(() => {
    if (!cart.branchId && profile?.favorite_branch_id) cart.setBranch(profile.favorite_branch_id);
  }, [cart, profile?.favorite_branch_id]);
  const soldOut = useSoldOut(cart.branchId);
  const [category, setCategory] = useState<string>('all');
  const [diet, setDiet] = useState<DietFilter | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const menuTop = useRef(0);

  const qtyByProduct = useMemo(() => {
    const m: Record<string, number> = {};
    cart.lines.forEach((l) => { m[l.productId] = (m[l.productId] ?? 0) + l.qty; });
    return m;
  }, [cart.lines]);

  const totals = useMemo(() => {
    if (!cat) return null;
    const lines = cart.lines.flatMap((l) => {
      const product = cat.productById.get(l.productId);
      const options = (l.options ?? []).flatMap((id) => cat.valueById.get(id) ?? []);
      return product ? [{ key: l.key, product, milk: l.milkId ? cat.milkById.get(l.milkId) ?? null : null, options, qty: l.qty }] : [];
    });
    return priceCart(lines, { useRewards: 0, ownCup: false, settings: cat.settings, drinkCategories: cat.drinkCategories });
  }, [cat, cart.lines]);

  if (isLoading) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color={color.ink} /></SafeAreaView>;
  }
  if (error || !cat) {
    return (
      <SafeAreaView style={styles.center}>
        <Txt variant="h4" center>{L('Menü yüklenemedi', 'The menu could not be loaded')}</Txt>
        <Txt variant="bodySm" color="inkMuted" center style={{ marginTop: 8, maxWidth: 280 }}>{errorMessage(error)}</Txt>
        <Button label={L('Tekrar dene', 'Try again')} variant="secondary" size="md" style={{ marginTop: 16 }} onPress={() => refetch()} />
      </SafeAreaView>
    );
  }

  const quickAdd = (p: Product) => {
    // Turkish coffee and the like need a choice (sugar): open the product instead of guessing.
    if (cat.optionsFor(p.id).some((x) => x.group.required)) {
      router.push({ pathname: '/product/[id]', params: { id: p.id } });
      return;
    }
    const defaultMilk = p.has_milk_options ? cat.milks.find((m) => m.is_default)?.id ?? null : null;
    cart.add(p.id, defaultMilk);
    toast(L(`${productName(p)} sepete eklendi`, `${productName(p)} added to your cart`));
  };

  const sections = category === 'all' ? cat.categories : cat.categories.filter((c) => c.id === category);
  const tableBranch = cart.table ? cat.branches.find((b) => b.id === cart.branchId) : null;
  const bottomPad = 64 + insets.bottom + (cart.count > 0 ? 72 : 0) + space[6];
  const rewardCount = rewards.data?.length ?? 0;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad }}
      >
        {/* 0: header, branch, greeting, campaigns */}
        <View>
          <View style={styles.pad}>
            <View style={styles.logoRow}><Logo height={48} /></View>
            {cart.table && tableBranch ? (
              <FadeIn style={[styles.branchCard, styles.tableCard]}>
                <View style={[styles.disc, { backgroundColor: color.secondary }]}><Utensils size={20} color={color.onSecondary} strokeWidth={1.75} /></View>
                <View style={{ flex: 1 }}>
                  <Txt variant="caption" color="onPrimary">{L('Masaya servis', 'Table service')} · {tableBranch.name}</Txt>
                  <Txt variant="body" color="onPrimary" style={{ fontFamily: 'DMSans-SemiBold' }}>
                    {L(`Masa ${cart.table} · siparişin masana gelecek`, `Table ${cart.table} · we bring it to you`)}
                  </Txt>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={L('Masadan çık', 'Leave the table')} hitSlop={8}
                  onPress={() => { cart.leaveTable(); toast(L('Masaya servis kapatıldı; siparişini tezgahtan alacaksın.', 'Table service off; you will pick up at the counter.')); }}
                  style={styles.leave}>
                  <X size={18} color={color.onPrimary} strokeWidth={2} />
                </Pressable>
              </FadeIn>
            ) : (
              <>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={branch ? L(`Sipariş verilecek şube ${branch.name}. Değiştir`, `Ordering from ${branch.name}. Change`) : L('Şube seç', 'Choose a branch')}
                  onPress={() => router.push('/branches')}
                  style={styles.branchCard}
                  scaleTo={0.98}
                >
                  <View style={styles.disc}><MapPin size={20} color={color.ink} strokeWidth={1.75} /></View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="caption" color="inkMuted">{L('Sipariş verilecek şube', 'Ordering from')}</Txt>
                    <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }} color={branch ? 'ink' : 'inkMuted'}>
                      {branch ? branch.name : L('Henüz seçilmedi', 'Not chosen yet')}
                    </Txt>
                  </View>
                  <View style={styles.change}>
                    <Txt variant="label" style={styles.underline}>{branch ? L('Değiştir', 'Change') : L('Şube seç', 'Choose')}</Txt>
                    <ChevronRight size={18} color={color.ink} strokeWidth={1.75} />
                  </View>
                </PressableScale>
                <Pressable accessibilityRole="button" onPress={() => router.push('/table-scan')} style={styles.tableLink} hitSlop={6}>
                  <QrCode size={16} color={color.secondaryInk} strokeWidth={1.75} />
                  <Txt variant="label" color="secondaryInk">{L('Masadasın mı? Masadaki QR kodu okut', 'At a table? Scan its QR code')}</Txt>
                </Pressable>
              </>
            )}

            <View style={{ marginTop: space[6] }}>
              <Txt variant="overline" color="secondaryInk">{greeting()}{profile ? `, ${profile.first_name}` : ''}</Txt>
              <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>{L('Bugün ne içelim?', 'What are we having today?')}</Txt>
              <View style={styles.inline}>
                <Clock size={16} color={color.inkMuted} strokeWidth={1.75} />
                <Txt variant="bodySm" color="inkMuted">
                  {branch ? `${branch.district} · ${(() => {
                    const st = branchState(branch);
                    return st.orderNow
                      ? L(`${st.kind === 'busy' ? 'şu an yoğun, ' : ''}yaklaşık ${st.waitMinutes} dakikada hazır`, `${st.kind === 'busy' ? 'busy right now, ' : ''}ready in about ${st.waitMinutes} minutes`)
                      : L(`${st.label} · ileri saate sipariş verebilirsin`, `${st.label} · you can order for later`);
                  })()}` : L('Teslim alacağın şubeyi ödemeden önce seçeceksin.', 'You will choose the branch before paying.')}
                </Txt>
              </View>
            </View>

            {rewardCount > 0 ? (
              <FadeIn delay={150}>
                <PressableScale accessibilityRole="button" onPress={() => router.push('/loyalty')} style={styles.rewardBanner}>
                  <View style={[styles.disc, { backgroundColor: color.surface }]}><Gift size={18} color={color.ink} strokeWidth={1.75} /></View>
                  <Txt variant="bodySm" style={{ flex: 1 }}>
                    <Txt variant="bodySm" style={{ fontFamily: 'DMSans-SemiBold' }}>{L(`${rewardCount} hediye kahven var. `, `You have ${rewardCount} free ${rewardCount === 1 ? 'coffee' : 'coffees'}. `)}</Txt>
                    {L('Bir kahve ekle, sepette kullan.', 'Add a coffee and use it in the cart.')}
                  </Txt>
                </PressableScale>
              </FadeIn>
            ) : null}
          </View>
          {userId ? <ForYou userId={userId} soldOut={soldOut.data} /> : null}

          {cat.campaigns.length > 0 ? (
            <View style={{ marginTop: space[8] }}>
              <SectionTitle eyebrow={L('Fırsatlar', 'Offers')} title={L('Kampanyalar', 'Campaigns')} style={styles.pad} />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={284}
                decelerationRate="fast"
                contentContainerStyle={{ paddingHorizontal: space[4], gap: space[3], paddingTop: space[4], paddingBottom: space[2] }}
              >
                {cat.campaigns.map((c, i) => <FadeIn key={c.id} index={i} delay={100}><CampaignCard c={c} product={cat.productById.get('kruvasan-tereyagli')} /></FadeIn>)}
              </ScrollView>
            </View>
          ) : null}

          <SectionTitle eyebrow={L('Menü', 'Menu')} title={L('Ne istersin?', 'What would you like?')} style={[styles.pad, { marginTop: space[8] }]} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={L('Beslenme tercihine göre süz', 'Filter by diet')}
            contentContainerStyle={{ paddingHorizontal: space[4], gap: space[2], paddingTop: space[3] }}>
            {DIET_FILTERS.map((f) => {
              const on = diet === f;
              return (
                <Pressable key={f} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setDiet(on ? null : f)}
                  style={[styles.dietChip, on && styles.dietOn]}>
                  <Leaf size={14} color={on ? color.onPrimary : color.success} strokeWidth={2} />
                  <Txt variant="caption" color={on ? 'onPrimary' : 'ink'} style={{ fontFamily: 'DMSans-SemiBold' }}>{dietFilterLabel(f)}</Txt>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* 1: sticky category chips */}
        <View style={styles.chipsBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space[4], gap: space[2] }}>
            {[{ id: 'all', name: L('Tümü', 'All'), name_en: null }, ...cat.categories].map((c) => {
              const on = category === c.id;
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    setCategory(c.id);
                    scrollRef.current?.scrollTo({ y: menuTop.current, animated: true });
                  }}
                  style={[styles.chip, on && { backgroundColor: color.primary }]}
                >
                  <Txt variant="label" color={on ? 'onPrimary' : 'ink'}>{categoryName(c)}</Txt>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* 2: menu */}
        <View style={[styles.pad, { gap: space[8], marginTop: space[4] }]} onLayout={(e: LayoutChangeEvent) => { menuTop.current = e.nativeEvent.layout.y - 60; }}>
          {sections.map((c, ci) => {
            const items = cat.products.filter((p) => p.category_id === c.id && (!diet || matchesDiet(p, diet)));
            if (!items.length) return null;
            return (
              <FadeIn key={`${c.id}-${diet ?? ''}`} index={ci}>
                <View style={styles.catHead}>
                  <Txt variant="h4" accessibilityRole="header">{categoryName(c)}</Txt>
                  <Txt variant="caption" color="inkMuted">{L(`${items.length} ürün`, `${items.length} ${items.length === 1 ? 'item' : 'items'}`)}</Txt>
                </View>
                {categoryBlurb(c) ? <Txt variant="bodySm" color="inkMuted">{categoryBlurb(c)}</Txt> : null}
                <View style={styles.grid}>
                  {chunk(items, 2).map((row, i) => (
                    <View key={i} style={styles.gridRow}>
                      {row.map((p) => (
                        <ProductCard
                          key={p.id}
                          product={p}
                          qty={qtyByProduct[p.id] ?? 0}
                          soldOut={!!soldOut.data?.has(p.id)}
                          onOpen={() => router.push({ pathname: '/product/[id]', params: { id: p.id } })}
                          onAdd={() => quickAdd(p)}
                          onRemove={() => cart.removeOne(p.id)}
                        />
                      ))}
                      {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
                    </View>
                  ))}
                </View>
              </FadeIn>
            );
          })}
          {diet && !sections.some((c) => cat.products.some((p) => p.category_id === c.id && matchesDiet(p, diet))) ? (
            <Txt variant="bodySm" color="inkMuted">{L('Bu seçime uyan ürün yok.', 'Nothing matches this filter.')}</Txt>
          ) : null}
          <Txt variant="caption" color="inkMuted">
            {L('Fiyatlara KDV dahildir. Alerjen bilgisi için ürüne dokun; ciddi alerjin varsa baristaya da danış.',
               'Prices include VAT. Tap an item for allergen information; if you have a serious allergy, please also ask the barista.')}
          </Txt>
        </View>
      </ScrollView>

      {cart.count > 0 && totals ? (
        <FadeIn distance={24} style={[styles.miniCart, { bottom: 64 + insets.bottom + space[2] }]}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={L(`Sepete git, ${cart.count} ürün, ${tl(totals.total)}`, `Go to cart, ${cart.count} items, ${tl(totals.total)}`)}
            onPress={() => router.push('/cart')}
            style={styles.miniBtn}
            scaleTo={0.98}
          >
            <View style={styles.inlineTight}>
              <ShoppingBag size={20} color={color.onPrimary} strokeWidth={1.75} />
              <Txt variant="label" color="onPrimary">{L(`${cart.count} ürün`, `${cart.count} ${cart.count === 1 ? 'item' : 'items'}`)} · {tl(totals.total)}</Txt>
            </View>
            <View style={styles.inlineTight}>
              <Txt variant="button" color="onPrimary">{L('Sepete git', 'View cart')}</Txt>
              <ArrowRight size={20} color={color.onPrimary} strokeWidth={1.75} />
            </View>
          </PressableScale>
        </FadeIn>
      ) : null}
    </SafeAreaView>
  );
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Width of the picture on the right of each campaign card; the text gets the rest, so they never overlap.
const CAMPAIGN_ART: Record<Campaign['tone'], number> = { primary: 84, eco: 84, copper: 80, surface: 74 };

function CampaignCard({ c, product }: { c: Campaign; product?: Product }) {
  const bg = { primary: color.primary, eco: color.successSoft, copper: color.secondarySoft, surface: color.surface }[c.tone];
  const fg = c.tone === 'primary' ? 'onPrimary' : 'ink';
  const eyebrow = c.tone === 'primary' ? 'onPrimary' : c.tone === 'eco' ? 'success' : 'secondaryInk';
  return (
    <View style={[styles.campaign, { backgroundColor: bg }, c.tone === 'surface' && { boxShadow: shadow.sm }]}>
      <View style={styles.campaignText}>
        {c.eyebrow ? <Txt variant="overline" color={eyebrow}>{loc(c.eyebrow, c.eyebrow_en)}</Txt> : null}
        <Txt variant="h5" color={fg} style={{ marginTop: 4 }}>{loc(c.title, c.title_en)}</Txt>
        {c.body ? <Txt variant="caption" color={fg} style={{ marginTop: 'auto', paddingTop: space[2] }}>{loc(c.body, c.body_en)}</Txt> : null}
      </View>
      <View style={[styles.campaignArt, { width: CAMPAIGN_ART[c.tone] }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {c.tone === 'primary' ? (
          <View style={styles.wheel}><View style={styles.wheelInner}><Percent size={26} color={color.secondary} strokeWidth={1.75} /></View></View>
        ) : c.tone === 'eco' ? (
          c.id === 'own-cup' ? <Recycle size={76} color={color.success} strokeWidth={1.25} /> : <Leaf size={72} color={color.success} strokeWidth={1.25} />
        ) : c.tone === 'copper' ? (
          c.id === 'fresh' && product ? <ProductPhoto product={product} size={80} /> : <Coffee size={72} color={color.secondary} strokeWidth={1.25} />
        ) : c.id !== 'loyalty' ? (
          <Sparkles size={64} color={color.secondary} strokeWidth={1.25} />
        ) : (
          <View style={styles.stampGrid}>
            {Array.from({ length: 9 }, (_, i) => (
              <View key={i} style={[styles.stamp, i < 6 ? { backgroundColor: color.secondary } : styles.stampOff]}>
                {i < 6 ? <Coffee size={12} color={color.onSecondary} strokeWidth={1.75} /> : null}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[6], backgroundColor: color.background },
  pad: { paddingHorizontal: space[4] },
  logoRow: { height: 56, alignItems: 'center', justifyContent: 'center' },
  branchCard: {
    marginTop: space[4], flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[3], paddingVertical: 10,
    backgroundColor: color.surface, borderRadius: radius.md, boxShadow: shadow.sm,
  },
  disc: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: color.secondarySoft, alignItems: 'center', justifyContent: 'center' },
  change: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 },
  underline: { borderBottomWidth: 1.5, borderBottomColor: color.secondary },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  inlineTight: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  tableCard: { backgroundColor: color.primary },
  leave: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  tableLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: space[3], minHeight: 32 },
  dietChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: space[3], borderRadius: radius.full,
    borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.surface },
  dietOn: { backgroundColor: color.success, borderColor: color.success },
  rewardBanner: { marginTop: space[4], flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.md, backgroundColor: color.secondarySoft },
  campaign: {
    width: 272, minHeight: 148, borderRadius: radius.lg, padding: space[4], overflow: 'hidden',
    flexDirection: 'row', gap: space[3],
  },
  campaignText: { flex: 1, minWidth: 0 },
  campaignArt: { alignItems: 'center', justifyContent: 'center' },
  wheel: { width: 120, height: 120, borderRadius: 60, backgroundColor: color.secondary, alignItems: 'center', justifyContent: 'center', marginRight: -56 },
  wheelInner: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: color.primary, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
  stampGrid: { width: 74, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  stamp: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stampOff: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.lineStrong },
  chipsBar: { backgroundColor: color.background, paddingVertical: space[2], marginTop: space[3] },
  chip: { height: 36, paddingHorizontal: space[4], borderRadius: radius.full, backgroundColor: color.surfaceMuted, justifyContent: 'center' },
  catHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  grid: { marginTop: space[4], gap: space[3] },
  gridRow: { flexDirection: 'row', gap: space[3] },
  miniCart: { position: 'absolute', left: space[4], right: space[4] },
  miniBtn: {
    height: 56, borderRadius: radius.md, backgroundColor: color.primary, paddingHorizontal: space[4],
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', boxShadow: shadow.lg,
  },
});

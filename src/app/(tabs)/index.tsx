import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowRight, ChevronRight, Clock, Coffee, Gift, MapPin, Percent, Recycle, ShoppingBag } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { ProductCard, ProductPhoto } from '@/components/Product';
import { Logo, SectionTitle } from '@/components/Layout';
import { useCatalogue, useRewards, useSoldOut } from '@/lib/api';
import { greeting, tl } from '@/lib/format';
import { errorMessage } from '@/lib/errors';
import { priceCart } from '@/lib/pricing';
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
  const branch = cat?.branches.find((b) => b.id === cart.branchId) ?? null;

  // Signed-in customers start from their favourite branch.
  useEffect(() => {
    if (!cart.branchId && profile?.favorite_branch_id) cart.setBranch(profile.favorite_branch_id);
  }, [cart, profile?.favorite_branch_id]);
  const soldOut = useSoldOut(cart.branchId);
  const [category, setCategory] = useState<string>('all');
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
      return product ? [{ key: l.key, product, milk: l.milkId ? cat.milkById.get(l.milkId) ?? null : null, qty: l.qty }] : [];
    });
    return priceCart(lines, { useRewards: 0, ownCup: false, settings: cat.settings, drinkCategories: cat.drinkCategories });
  }, [cat, cart.lines]);

  if (isLoading) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color={color.ink} /></SafeAreaView>;
  }
  if (error || !cat) {
    return (
      <SafeAreaView style={styles.center}>
        <Txt variant="h4" center>Menü yüklenemedi</Txt>
        <Txt variant="bodySm" color="inkMuted" center style={{ marginTop: 8, maxWidth: 280 }}>{errorMessage(error)}</Txt>
        <Button label="Tekrar dene" variant="secondary" size="md" style={{ marginTop: 16 }} onPress={() => refetch()} />
      </SafeAreaView>
    );
  }

  const quickAdd = (p: Product) => {
    const defaultMilk = p.has_milk_options ? cat.milks.find((m) => m.is_default)?.id ?? null : null;
    cart.add(p.id, defaultMilk);
    toast(`${p.name} sepete eklendi`);
  };

  const sections = category === 'all' ? cat.categories : cat.categories.filter((c) => c.id === category);
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={branch ? `Sipariş verilecek şube ${branch.name}. Değiştir` : 'Şube seç'}
              onPress={() => router.push('/branches')}
              style={styles.branchCard}
            >
              <View style={styles.disc}><MapPin size={20} color={color.ink} strokeWidth={1.75} /></View>
              <View style={{ flex: 1 }}>
                <Txt variant="caption" color="inkMuted">Sipariş verilecek şube</Txt>
                <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }} color={branch ? 'ink' : 'inkMuted'}>
                  {branch ? branch.name : 'Henüz seçilmedi'}
                </Txt>
              </View>
              <View style={styles.change}>
                <Txt variant="label" style={styles.underline}>{branch ? 'Değiştir' : 'Şube seç'}</Txt>
                <ChevronRight size={18} color={color.ink} strokeWidth={1.75} />
              </View>
            </Pressable>

            <View style={{ marginTop: space[6] }}>
              <Txt variant="overline" color="secondaryInk">{greeting()}{profile ? `, ${profile.first_name}` : ''}</Txt>
              <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>Bugün ne içelim?</Txt>
              <View style={styles.inline}>
                <Clock size={16} color={color.inkMuted} strokeWidth={1.75} />
                <Txt variant="bodySm" color="inkMuted">
                  {branch ? `${branch.district} · yaklaşık ${branch.prep_minutes} dakikada hazır` : 'Teslim alacağın şubeyi ödemeden önce seçeceksin.'}
                </Txt>
              </View>
            </View>

            {rewardCount > 0 ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/loyalty')} style={styles.rewardBanner}>
                <View style={[styles.disc, { backgroundColor: color.surface }]}><Gift size={18} color={color.ink} strokeWidth={1.75} /></View>
                <Txt variant="bodySm" style={{ flex: 1 }}>
                  <Txt variant="bodySm" style={{ fontFamily: 'DMSans-SemiBold' }}>{rewardCount} hediye kahven var. </Txt>
                  Bir kahve ekle, sepette kullan.
                </Txt>
              </Pressable>
            ) : null}
          </View>

          {cat.campaigns.length > 0 ? (
            <View style={{ marginTop: space[8] }}>
              <SectionTitle eyebrow="Fırsatlar" title="Kampanyalar" style={styles.pad} />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={284}
                decelerationRate="fast"
                contentContainerStyle={{ paddingHorizontal: space[4], gap: space[3], paddingTop: space[4], paddingBottom: space[2] }}
              >
                {cat.campaigns.map((c) => <CampaignCard key={c.id} c={c} product={cat.productById.get('kruvasan-tereyagli')} />)}
              </ScrollView>
            </View>
          ) : null}

          <SectionTitle eyebrow="Menü" title="Ne istersin?" style={[styles.pad, { marginTop: space[8] }]} />
        </View>

        {/* 1: sticky category chips */}
        <View style={styles.chipsBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space[4], gap: space[2] }}>
            {[{ id: 'all', name: 'Tümü' }, ...cat.categories].map((c) => {
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
                  <Txt variant="label" color={on ? 'onPrimary' : 'ink'}>{c.name}</Txt>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* 2: menu */}
        <View style={[styles.pad, { gap: space[8], marginTop: space[4] }]} onLayout={(e: LayoutChangeEvent) => { menuTop.current = e.nativeEvent.layout.y - 60; }}>
          {sections.map((c) => {
            const items = cat.products.filter((p) => p.category_id === c.id);
            if (!items.length) return null;
            return (
              <View key={c.id}>
                <View style={styles.catHead}>
                  <Txt variant="h4" accessibilityRole="header">{c.name}</Txt>
                  <Txt variant="caption" color="inkMuted">{items.length} ürün</Txt>
                </View>
                {c.blurb ? <Txt variant="bodySm" color="inkMuted">{c.blurb}</Txt> : null}
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
              </View>
            );
          })}
          <Txt variant="caption" color="inkMuted">Fiyatlara KDV dahildir.</Txt>
        </View>
      </ScrollView>

      {cart.count > 0 && totals ? (
        <View style={[styles.miniCart, { bottom: 64 + insets.bottom + space[2] }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Sepete git, ${cart.count} ürün, ${tl(totals.total)}`}
            onPress={() => router.push('/cart')}
            style={({ pressed }) => [styles.miniBtn, pressed && { backgroundColor: color.primaryPressed }]}
          >
            <View style={styles.inlineTight}>
              <ShoppingBag size={20} color={color.onPrimary} strokeWidth={1.75} />
              <Txt variant="label" color="onPrimary">{cart.count} ürün · {tl(totals.total)}</Txt>
            </View>
            <View style={styles.inlineTight}>
              <Txt variant="button" color="onPrimary">Sepete git</Txt>
              <ArrowRight size={20} color={color.onPrimary} strokeWidth={1.75} />
            </View>
          </Pressable>
        </View>
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
        {c.eyebrow ? <Txt variant="overline" color={eyebrow}>{c.eyebrow}</Txt> : null}
        <Txt variant="h5" color={fg} style={{ marginTop: 4 }}>{c.title}</Txt>
        {c.body ? <Txt variant="caption" color={fg} style={{ marginTop: 'auto', paddingTop: space[2] }}>{c.body}</Txt> : null}
      </View>
      <View style={[styles.campaignArt, { width: CAMPAIGN_ART[c.tone] }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {c.tone === 'primary' ? (
          <View style={styles.wheel}><View style={styles.wheelInner}><Percent size={26} color={color.secondary} strokeWidth={1.75} /></View></View>
        ) : c.tone === 'eco' ? (
          <Recycle size={76} color={color.success} strokeWidth={1.25} />
        ) : c.tone === 'copper' && product ? (
          <ProductPhoto product={product} size={80} />
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

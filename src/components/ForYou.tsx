// Home screen for signed-in customers: rate the last order, order "the usual" again, favourite drinks.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Heart, Plus, RotateCcw } from 'lucide-react-native';
import { Txt } from './Txt';
import { Button } from './Button';
import { ProductPhoto } from './Product';
import { RatingCard } from './RatingCard';
import { useCatalogue, useFavorites, useMyOrders } from '@/lib/api';
import { tl } from '@/lib/format';
import { useReorder } from '@/lib/reorder';
import { useCart } from '@/state/cart';
import { useToast } from '@/state/toast';
import { color, radius, shadow, space } from '@/theme/tokens';

export function ForYou({ userId, soldOut }: { userId: string; soldOut?: Set<string> }) {
  const { data: cat } = useCatalogue();
  const orders = useMyOrders(userId);
  const favorites = useFavorites(userId);
  const reorder = useReorder();
  const cart = useCart();
  const toast = useToast();
  const [now] = useState(() => Date.now());
  if (!cat) return null;

  const last = orders.data?.find((o) => o.status === 'collected');
  const rateNow = last && !last.order_ratings && last.collected_at && Date.parse(last.collected_at) > now - 2 * 86_400_000 ? last : null;
  const favs = (favorites.data ?? []).flatMap((f) => {
    const p = cat.productById.get(f.product_id);
    return p ? [{ f, p, milk: f.milk_id ? cat.milkById.get(f.milk_id) ?? null : null }] : [];
  });
  if (!last && favs.length === 0) return null;

  return (
    <View style={{ marginTop: space[6], gap: space[4] }}>
      {rateNow ? <View style={styles.pad}><RatingCard order={rateNow} compact /></View> : null}

      {last ? (
        <View style={[styles.pad]}>
          <View style={styles.again}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="overline" color="secondaryInk">Her zamankinden</Txt>
              <Txt variant="body" numberOfLines={2} style={{ fontFamily: 'DMSans-SemiBold' }}>
                {(last.order_items ?? []).map((i) => `${i.quantity}× ${i.product_name}${i.milk_label ? ` (${i.milk_label})` : ''}`).join(', ')}
              </Txt>
              <Txt variant="caption" color="inkMuted">Son siparişin · {last.branch?.name}</Txt>
            </View>
            <Button label="Tekrarla" icon={RotateCcw} size="sm" onPress={() => reorder(last, soldOut)} />
          </View>
        </View>
      ) : null}

      {favs.length ? (
        <View>
          <View style={[styles.pad, styles.head]}>
            <Heart size={16} color={color.secondaryInk} strokeWidth={2} />
            <Txt variant="overline" color="secondaryInk">Favorilerin</Txt>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space[4], gap: space[3], paddingVertical: space[2] }}>
            {favs.map(({ f, p, milk }) => {
              const out = soldOut?.has(p.id);
              return (
                <Pressable key={f.id} accessibilityRole="button" accessibilityLabel={`${p.name}${milk ? `, ${milk.label}` : ''}, sepete ekle`}
                  disabled={out}
                  onPress={() => { cart.add(p.id, milk?.id ?? null); toast(`${p.name} sepete eklendi`); }}
                  style={({ pressed }) => [styles.fav, out && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}>
                  <ProductPhoto product={p} size={48} soldOut={out} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="label" numberOfLines={1}>{p.name}</Txt>
                    <Txt variant="caption" color="inkMuted" numberOfLines={1}>{out ? 'Tükendi' : milk ? milk.label : tl(p.price)}</Txt>
                  </View>
                  <View style={styles.plus}><Plus size={18} color={color.onPrimary} strokeWidth={2} /></View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: space[4] },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  again: {
    flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.lg,
    backgroundColor: color.surface, boxShadow: shadow.sm,
  },
  fav: {
    width: 220, flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.lg,
    backgroundColor: color.surface, boxShadow: shadow.sm,
  },
  plus: { width: 32, height: 32, borderRadius: 16, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
});

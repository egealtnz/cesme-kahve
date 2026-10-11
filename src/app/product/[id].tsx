import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShoppingBag, X } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Stepper } from '@/components/Stepper';
import { OptionRow } from '@/components/Controls';
import { ProductPhoto } from '@/components/Product';
import { useCatalogue, useSoldOut } from '@/lib/api';
import { tl } from '@/lib/format';
import { useCart } from '@/state/cart';
import { useToast } from '@/state/toast';
import { color, radius, space } from '@/theme/tokens';

export default function ProductSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data: cat } = useCatalogue();
  const cart = useCart();
  const soldOut = useSoldOut(cart.branchId);
  const toast = useToast();
  const product = cat?.productById.get(id);
  const defaultMilk = cat?.milks.find((m) => m.is_default)?.id ?? null;
  const [milkId, setMilkId] = useState<string | null>(product?.has_milk_options ? defaultMilk : null);
  const [qty, setQty] = useState(1);

  if (!cat || !product) return <View style={styles.sheet} />;
  const category = cat.categories.find((c) => c.id === product.category_id);
  const milk = milkId ? cat.milkById.get(milkId) : undefined;
  const isSoldOut = !!soldOut.data?.has(product.id);
  const total = (product.price + (milk?.extra_price ?? 0)) * qty;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={styles.sheet}>
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: space[6] }}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Kapat" onPress={close} style={styles.close}>
            <X size={24} color={color.ink} strokeWidth={1.75} />
          </Pressable>
        </View>
        <View style={styles.photoWell}>
          <ProductPhoto product={product} size={176} soldOut={isSoldOut} />
        </View>
        <Txt variant="overline" color="secondaryInk" style={{ marginTop: space[4] }}>{category?.name}</Txt>
        <View style={styles.titleRow}>
          <Txt variant="h2" accessibilityRole="header" style={{ flex: 1 }}>{product.name}</Txt>
          <Txt variant="h4" style={{ marginTop: 4, fontVariant: ['tabular-nums'] }}>{tl(product.price)}</Txt>
        </View>
        {product.description ? <Txt variant="body" color="inkMuted" style={{ marginTop: space[2] }}>{product.description}</Txt> : null}
        <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[3] }}>
          {product.badge === 'fresh' ? <Badge tone="fresh" label="Bugün fırından" /> : null}
          {product.is_coffee ? <Badge tone="neutral" label="Kahve kartına damga" /> : null}
          {isSoldOut ? <Badge tone="error" label="Bu şubede tükendi" /> : null}
        </View>

        {product.has_milk_options ? (
          <View style={{ marginTop: space[6] }} accessibilityRole="radiogroup" accessibilityLabel="Süt seçimi">
            <Txt variant="h6" accessibilityRole="header">Süt seçimi</Txt>
            <View style={{ gap: space[2], marginTop: space[3] }}>
              {cat.milks.map((m) => (
                <OptionRow
                  key={m.id}
                  selected={milkId === m.id}
                  onPress={() => setMilkId(m.id)}
                  title={m.label}
                  right={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                      {m.is_plant ? <Badge tone="eco" label="Bitkisel" /> : null}
                      <Txt variant="bodySm" color="inkMuted" style={{ minWidth: 44, textAlign: 'right' }}>{m.extra_price ? `+${tl(m.extra_price)}` : ''}</Txt>
                    </View>
                  }
                />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[4]) }]}>
        <Stepper value={qty} onChange={setQty} name={product.name} min={1} max={20} />
        <Button
          label={isSoldOut ? 'Tükendi' : `Sepete ekle · ${tl(total)}`}
          icon={ShoppingBag}
          disabled={isSoldOut}
          style={{ flex: 1 }}
          onPress={() => {
            cart.add(product.id, milkId, qty);
            toast(`${product.name} sepete eklendi`);
            close();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: color.surface },
  header: { alignItems: 'flex-end', marginBottom: space[1] },
  close: { width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surfaceMuted },
  photoWell: { height: 208, borderRadius: radius.sm, backgroundColor: color.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[4], marginTop: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingTop: space[3], borderTopWidth: 1, borderTopColor: color.line, backgroundColor: color.surface },
});

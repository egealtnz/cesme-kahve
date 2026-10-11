import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Minus, Plus } from 'lucide-react-native';
import { Txt } from './Txt';
import { Badge } from './Badge';
import { menuImageSource } from '@/lib/supabase';
import { tl } from '@/lib/format';
import type { Product } from '@/lib/types';
import { color, radius, shadow, space } from '@/theme/tokens';

/** Round product photo (the brand's menu photos are circular). */
export function ProductPhoto({ product, size, soldOut }: { product: Pick<Product, 'image_path'>; size: number; soldOut?: boolean }) {
  return (
    <Image
      source={menuImageSource(product.image_path)}
      style={{ width: size, height: size, borderRadius: size / 2, opacity: soldOut ? 0.5 : 1, backgroundColor: color.surfaceMuted }}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      accessibilityIgnoresInvertColors
    />
  );
}

type CardProps = { product: Product; qty: number; soldOut: boolean; onOpen: () => void; onAdd: () => void; onRemove: () => void };

export function ProductCard({ product, qty, soldOut, onOpen, onAdd, onRemove }: CardProps) {
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${product.name}, ${tl(product.price)}. Ayrıntılar`} onPress={onOpen} style={{ flex: 1 }}>
        <View style={styles.well}>
          <ProductPhoto product={product} size={104} soldOut={soldOut} />
          <View style={styles.badge}>
            {soldOut ? <Badge tone="error" label="Tükendi" /> : product.badge === 'fresh' ? <Badge tone="fresh" label="Bugün fırından" /> : null}
          </View>
        </View>
        <View style={styles.body}>
          <Txt variant="h5" numberOfLines={2}>{product.name}</Txt>
          {product.description ? <Txt variant="bodySm" color="inkMuted" numberOfLines={2} style={{ marginTop: 4 }}>{product.description}</Txt> : null}
        </View>
      </Pressable>
      <View style={styles.foot}>
        <Txt variant="price" color={soldOut ? 'inkMuted' : 'ink'}>{tl(product.price)}</Txt>
        {qty > 0 ? (
          <View style={styles.stepper}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${product.name} sepetten bir tane çıkar`} hitSlop={4} onPress={onRemove}
              style={({ pressed }) => [styles.stepBtn, pressed && { backgroundColor: color.secondaryPressed }]}>
              <Minus size={18} color={color.onSecondary} strokeWidth={2} />
            </Pressable>
            <Txt variant="label" color="onSecondary" style={styles.stepQty} accessibilityLabel={`Sepette ${qty} adet`}>{qty}</Txt>
            <Pressable accessibilityRole="button" accessibilityLabel={soldOut ? `${product.name} tükendi` : `${product.name} sepete ekle`}
              accessibilityState={{ disabled: soldOut }} disabled={soldOut} hitSlop={4} onPress={onAdd}
              style={({ pressed }) => [styles.stepBtn, pressed && { backgroundColor: color.secondaryPressed }]}>
              <Plus size={18} color={soldOut ? color.inkDisabled : color.onSecondary} strokeWidth={2} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={soldOut ? `${product.name} tükendi` : `${product.name} sepete ekle`}
            accessibilityState={{ disabled: soldOut }}
            disabled={soldOut}
            hitSlop={4}
            onPress={onAdd}
            style={({ pressed }) => [styles.add, { backgroundColor: soldOut ? color.disabled : pressed ? color.secondaryPressed : color.secondary }]}
          >
            <Plus size={22} color={soldOut ? color.inkDisabled : color.onSecondary} strokeWidth={1.75} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: color.surface, borderRadius: radius.lg, padding: space[2], boxShadow: shadow.sm },
  well: { aspectRatio: 4 / 3, borderRadius: radius.sm, backgroundColor: color.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', left: space[2], bottom: space[2] },
  body: { paddingHorizontal: space[1], paddingTop: space[3] },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[1], paddingTop: space[3], paddingBottom: space[1] },
  add: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: radius.full, backgroundColor: color.secondary },
  stepBtn: { width: 36, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  stepQty: { minWidth: 18, textAlign: 'center', fontVariant: ['tabular-nums'] },
});

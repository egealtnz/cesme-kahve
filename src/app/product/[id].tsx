import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, Check, Heart, Leaf, ShoppingBag, X } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Stepper } from '@/components/Stepper';
import { OptionRow } from '@/components/Controls';
import { ProductPhoto } from '@/components/Product';
import { Bump, FadeIn, Pop } from '@/components/Motion';
import { addFavorite, removeFavorite, useCatalogue, useFavorites, useSoldOut } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { L } from '@/lib/i18n';
import {
  allergenLabel, allergensOf, categoryName, dietLabel, groupName, milkLabel, noneLabel, optionLabel, productDesc, productName,
} from '@/lib/display';
import { unitPrice } from '@/lib/pricing';
import { useAuth } from '@/state/auth';
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
  const groups = product && cat ? cat.optionsFor(product.id) : [];
  // value ids picked per group; required groups start on their default
  const [picked, setPicked] = useState<Record<string, string[]>>(() => Object.fromEntries(groups.map(({ group, values }) => [
    group.id, group.required ? [values.find((v) => v.is_default)?.id ?? values[0].id] : [],
  ])));
  const { userId } = useAuth();
  const favorites = useFavorites(userId);
  const qc = useQueryClient();

  if (!cat || !product) return <View style={styles.sheet} />;
  const name = productName(product);
  const desc = productDesc(product);
  const category = cat.categories.find((c) => c.id === product.category_id);
  const milk = milkId ? cat.milkById.get(milkId) ?? null : null;
  const isSoldOut = !!soldOut.data?.has(product.id);
  const chosen = Object.values(picked).flat().flatMap((v) => cat.valueById.get(v) ?? []);
  const unit = unitPrice(product, milk, chosen);
  const total = unit * qty;
  const allergens = allergensOf(product, milk);
  const diet = (product.diet ?? []).filter((d) => d !== 'vegetarian' || !(product.diet ?? []).some((x) => x === 'vegan' || x === 'vegan_option'));

  const pick = (groupId: string, valueId: string | null, multi: boolean) => setPicked((p) => {
    const cur = p[groupId] ?? [];
    if (multi) return { ...p, [groupId]: valueId ? (cur.includes(valueId) ? cur.filter((x) => x !== valueId) : [...cur, valueId]) : [] };
    return { ...p, [groupId]: valueId ? [valueId] : [] };
  });

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const fav = favorites.data?.find((f) => f.product_id === product.id && (f.milk_id ?? null) === (milkId ?? null));
  const toggleFav = async () => {
    if (!userId) { router.push({ pathname: '/auth/sign-in', params: { next: `/product/${product.id}` } }); return; }
    try {
      if (fav) await removeFavorite(fav.id); else await addFavorite(product.id, milkId);
      await qc.invalidateQueries({ queryKey: ['favorites', userId] });
      toast(fav ? L('Favorilerden çıkarıldı', 'Removed from favourites')
        : L(`${name}${milk ? ` (${milkLabel(milk)})` : ''} favorilerine eklendi`, `${name}${milk ? ` (${milkLabel(milk)})` : ''} added to favourites`));
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  return (
    <View style={styles.sheet}>
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: space[6] }}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: !!fav }}
            accessibilityLabel={fav ? L('Favorilerden çıkar', 'Remove from favourites') : L('Favorilere ekle', 'Add to favourites')} onPress={toggleFav} style={styles.close}>
            <Bump trigger={!!fav}>
              <Heart size={22} color={fav ? color.error : color.ink} fill={fav ? color.error : 'transparent'} strokeWidth={1.75} />
            </Bump>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={L('Kapat', 'Close')} onPress={close} style={styles.close}>
            <X size={24} color={color.ink} strokeWidth={1.75} />
          </Pressable>
        </View>
        <View style={styles.photoWell}>
          <Pop from={0.8}><ProductPhoto product={product} size={176} soldOut={isSoldOut} /></Pop>
        </View>
        <FadeIn delay={60}>
          <Txt variant="overline" color="secondaryInk" style={{ marginTop: space[4] }}>{category ? categoryName(category) : ''}</Txt>
          <View style={styles.titleRow}>
            <Txt variant="h2" accessibilityRole="header" style={{ flex: 1 }}>{name}</Txt>
            <Txt variant="h4" style={{ marginTop: 4, fontVariant: ['tabular-nums'] }}>{tl(product.price)}</Txt>
          </View>
          {desc ? <Txt variant="body" color="inkMuted" style={{ marginTop: space[2] }}>{desc}</Txt> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[3] }}>
            {product.badge === 'fresh' ? <Badge tone="fresh" label={L('Bugün fırından', 'Fresh today')} /> : null}
            {product.is_coffee ? <Badge tone="neutral" label={L('Kahve kartına damga', 'Earns a stamp')} /> : null}
            {diet.map((d) => <Badge key={d} tone="eco" icon={Leaf} label={dietLabel(d)} />)}
            {isSoldOut ? <Badge tone="error" label={L('Bu şubede tükendi', 'Sold out at this branch')} /> : null}
          </View>
        </FadeIn>

        {product.has_milk_options ? (
          <FadeIn index={1} delay={80} style={{ marginTop: space[6] }}>
            <View accessibilityRole="radiogroup" accessibilityLabel={L('Süt seçimi', 'Milk')}>
              <Txt variant="h6" accessibilityRole="header">{L('Süt seçimi', 'Milk')}</Txt>
              <View style={{ gap: space[2], marginTop: space[3] }}>
                {cat.milks.map((m) => (
                  <OptionRow
                    key={m.id}
                    selected={milkId === m.id}
                    onPress={() => setMilkId(m.id)}
                    title={milkLabel(m)}
                    right={
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                        {m.is_plant ? <Badge tone="eco" label={L('Bitkisel', 'Plant-based')} /> : null}
                        <Txt variant="bodySm" color="inkMuted" style={{ minWidth: 44, textAlign: 'right' }}>{m.extra_price ? `+${tl(m.extra_price)}` : ''}</Txt>
                      </View>
                    }
                  />
                ))}
              </View>
            </View>
          </FadeIn>
        ) : null}

        {groups.map(({ group, values }, gi) => {
          const cur = picked[group.id] ?? [];
          const choices = [
            ...(!group.required && !group.multi ? [{ id: null as string | null, label: noneLabel(group), price: 0 }] : []),
            ...values.map((v) => ({ id: v.id as string | null, label: optionLabel(v), price: v.extra_price })),
          ];
          return (
            <FadeIn key={group.id} index={gi + 2} delay={80} style={{ marginTop: space[6] }}>
              <View style={styles.groupHead}>
                <Txt variant="h6" accessibilityRole="header">{groupName(group)}</Txt>
                {group.multi ? <Txt variant="caption" color="inkMuted">{L('istediğin kadar seç', 'pick any')}</Txt> : null}
              </View>
              <View style={styles.choices} accessibilityRole={group.multi ? undefined : 'radiogroup'} accessibilityLabel={groupName(group)}>
                {choices.map((c) => {
                  const on = c.id === null ? cur.length === 0 : cur.includes(c.id);
                  return (
                    <Pressable key={c.id ?? 'none'} accessibilityRole={group.multi ? 'checkbox' : 'radio'}
                      accessibilityState={group.multi ? { checked: on } : { selected: on }}
                      accessibilityLabel={`${c.label}${c.price ? `, +${tl(c.price)}` : ''}`}
                      onPress={() => pick(group.id, c.id, group.multi)}
                      style={({ pressed }) => [styles.choice, on && styles.choiceOn, pressed && { opacity: 0.8 }]}>
                      {on && group.multi ? <Pop from={0.3}><Check size={16} color={color.onPrimary} strokeWidth={2.25} /></Pop> : null}
                      <Txt variant="label" color={on ? 'onPrimary' : 'ink'}>{c.label}</Txt>
                      {c.price ? <Txt variant="caption" color={on ? 'onPrimary' : 'inkMuted'}>+{tl(c.price)}</Txt> : null}
                    </Pressable>
                  );
                })}
              </View>
            </FadeIn>
          );
        })}

        <FadeIn index={groups.length + 2} delay={80} style={{ marginTop: space[6] }}>
          <Txt variant="h6" accessibilityRole="header">{L('Alerjenler', 'Allergens')}</Txt>
          {allergens.length ? (
            <View style={[styles.choices, { marginTop: space[2] }]}>
              {allergens.map((a) => <Badge key={a} tone="warning" icon={AlertTriangle} label={allergenLabel(a)} />)}
            </View>
          ) : (
            <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>{L('Bilinen alerjen içermiyor.', 'No known allergens.')}</Txt>
          )}
          <Txt variant="caption" color="inkMuted" style={{ marginTop: space[2] }}>
            {L('Aynı mutfakta hazırlandığı için iz miktarda başka alerjen bulunabilir. Ciddi alerjin varsa baristaya danış.',
               'Made in a kitchen that handles other allergens, so traces may be present. If you have a serious allergy, please ask the barista.')}
          </Txt>
        </FadeIn>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[4]) }]}>
        <Stepper value={qty} onChange={setQty} name={name} min={1} max={20} />
        <Button
          label={isSoldOut ? L('Tükendi', 'Sold out') : L(`Sepete ekle · ${tl(total)}`, `Add · ${tl(total)}`)}
          icon={ShoppingBag}
          disabled={isSoldOut}
          style={{ flex: 1 }}
          onPress={() => {
            cart.add(product.id, milkId, qty, chosen.map((v) => v.id));
            toast(L(`${name} sepete eklendi`, `${name} added to your cart`));
            close();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: color.surface },
  header: { flexDirection: 'row', justifyContent: 'flex-end', gap: space[2], marginBottom: space[1] },
  close: { width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surfaceMuted },
  photoWell: { height: 208, borderRadius: radius.sm, backgroundColor: color.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[4], marginTop: 4 },
  groupHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[3] },
  choice: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: space[4], borderRadius: radius.full,
    backgroundColor: color.surfaceMuted, borderWidth: 1.5, borderColor: 'transparent',
  },
  choiceOn: { backgroundColor: color.primary, borderColor: color.primary },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingTop: space[3], borderTopWidth: 1, borderTopColor: color.line, backgroundColor: color.surface },
});

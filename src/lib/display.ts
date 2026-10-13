// How menu content and order lines are shown in the chosen language. Orders keep a Turkish snapshot of
// names (for staff and receipts); in English the current menu's translation is shown when there is one.
import { L, loc } from './i18n';
import type { Allergen, Category, Diet, Milk, OptionGroup, OptionValue, OrderItem, Product } from './types';

type Cat = { productById: Map<string, Product>; milkById: Map<string, Milk> } | undefined | null;

export const productName = (p: Pick<Product, 'name' | 'name_en'>) => loc(p.name, p.name_en);
export const productDesc = (p: Pick<Product, 'description' | 'description_en'>) => (p.description ? loc(p.description, p.description_en) : null);
export const categoryName = (c: Pick<Category, 'name' | 'name_en'>) => loc(c.name, c.name_en);
export const categoryBlurb = (c: Pick<Category, 'blurb' | 'blurb_en'>) => (c.blurb ? loc(c.blurb, c.blurb_en) : null);
export const milkLabel = (m: Pick<Milk, 'label' | 'label_en'>) => loc(m.label, m.label_en);
export const groupName = (g: Pick<OptionGroup, 'name' | 'name_en'>) => loc(g.name, g.name_en);
export const noneLabel = (g: Pick<OptionGroup, 'none_label' | 'none_label_en'>) => (g.none_label ? loc(g.none_label, g.none_label_en) : L('Yok', 'None'));
export const optionLabel = (v: Pick<OptionValue, 'label' | 'label_en'>) => loc(v.label, v.label_en);

/** Name of an ordered item. */
export function itemName(it: Pick<OrderItem, 'product_id' | 'product_name'>, cat?: Cat): string {
  const p = it.product_id ? cat?.productById.get(it.product_id) : undefined;
  return p ? loc(it.product_name, p.name_en) : it.product_name;
}

/** "Badem sütü · Büyük · Vanilya" for an ordered item ('' when nothing was chosen). */
export function itemExtras(it: Pick<OrderItem, 'milk_label' | 'milk_id' | 'options' | 'options_label'>, cat?: Cat): string {
  const milk = (it.milk_id ? cat?.milkById.get(it.milk_id) : undefined)
    ?? (it.milk_label && cat ? [...cat.milkById.values()].find((m) => m.label === it.milk_label) : undefined);
  const m = it.milk_label ? (milk ? loc(it.milk_label, milk.label_en) : it.milk_label) : null;
  const o = it.options?.length ? it.options.map((x) => loc(x.label, x.label_en)).join(' · ') : it.options_label ?? null;
  return [m, o].filter(Boolean).join(' · ');
}

export function itemLine(it: OrderItem, cat?: Cat): string {
  const extras = itemExtras(it, cat);
  return `${it.quantity}× ${itemName(it, cat)}${extras ? ` (${extras})` : ''}`;
}

// ---------------------------------------------------------------- allergens and diet
export const ALLERGENS: Allergen[] = ['gluten', 'sut', 'yumurta', 'kuruyemis', 'yer_fistigi', 'soya', 'susam'];
export function allergenLabel(a: Allergen): string {
  switch (a) {
    case 'gluten': return L('Gluten', 'Gluten');
    case 'sut': return L('Süt', 'Milk');
    case 'yumurta': return L('Yumurta', 'Egg');
    case 'kuruyemis': return L('Kuruyemiş', 'Tree nuts');
    case 'yer_fistigi': return L('Yer fıstığı', 'Peanuts');
    case 'soya': return L('Soya', 'Soy');
    case 'susam': return L('Susam', 'Sesame');
  }
}
export function dietLabel(d: Diet): string {
  switch (d) {
    case 'vegan': return L('Vegan', 'Vegan');
    case 'vegan_option': return L('Bitkisel sütle vegan', 'Vegan with plant milk');
    case 'vegetarian': return L('Vejetaryen', 'Vegetarian');
  }
}

/** Allergens of a product, including those of the chosen milk. */
export function allergensOf(p: Product, milk?: Milk | null): Allergen[] {
  const set = new Set<Allergen>(p.allergens ?? []);
  if (p.has_milk_options) for (const a of milk?.allergens ?? ['sut']) set.add(a as Allergen);
  return ALLERGENS.filter((a) => set.has(a));
}

export type DietFilter = 'vegan' | 'vegetarian' | 'gluten_free' | 'nut_free';
export const DIET_FILTERS: DietFilter[] = ['vegan', 'vegetarian', 'gluten_free', 'nut_free'];
export function dietFilterLabel(f: DietFilter): string {
  switch (f) {
    case 'vegan': return L('Vegan', 'Vegan');
    case 'vegetarian': return L('Vejetaryen', 'Vegetarian');
    case 'gluten_free': return L('Glutensiz', 'Gluten-free');
    case 'nut_free': return L('Kuruyemişsiz', 'Nut-free');
  }
}
/** Products with plant-milk options count as vegan (the plant milk is then picked on the product page). */
export function matchesDiet(p: Product, f: DietFilter): boolean {
  const d = p.diet ?? [];
  const a = p.allergens ?? [];
  switch (f) {
    case 'vegan': return d.includes('vegan') || d.includes('vegan_option');
    case 'vegetarian': return d.includes('vegetarian') || d.includes('vegan') || d.includes('vegan_option');
    case 'gluten_free': return !a.includes('gluten');
    case 'nut_free': return !a.includes('kuruyemis') && !a.includes('yer_fistigi');
  }
}

/** "Badem sütü · Büyük · Vanilya" for a cart line. */
export function itemExtrasFromCart(milk: Milk | null, options: OptionValue[]): string {
  return [milk ? milkLabel(milk) : null, ...options.map(optionLabel)].filter(Boolean).join(' · ');
}

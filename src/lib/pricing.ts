// Mirrors place_order() in supabase/migrations/…_logic.sql so the cart can show a total before the
// order exists. The server's number is the one that is charged; the confirm screen shows it.
import type { Milk, Product, Settings } from './types';

export type PricedLine = { key: string; product: Product; milk: Milk | null; unit: number; qty: number; free: number };
export type Totals = {
  lines: PricedLine[]; subtotal: number; reward: number; campaign: number; cup: number; total: number;
  count: number; coffees: number; paidCoffees: number; freeCount: number; hasDrink: boolean;
};

export function priceCart(
  lines: { key: string; product: Product; milk: Milk | null; qty: number }[],
  opts: { useRewards: number; ownCup: boolean; settings: Settings; drinkCategories: Set<string> },
): Totals {
  const priced: PricedLine[] = lines.map((l) => ({ ...l, unit: l.product.price + (l.milk?.extra_price ?? 0), free: 0 }));
  const subtotal = priced.reduce((s, l) => s + l.unit * l.qty, 0);
  const coffeeTotal = priced.filter((l) => l.product.is_coffee).reduce((s, l) => s + l.qty, 0);

  let left = Math.max(0, Math.min(opts.useRewards, coffeeTotal));
  const freeCount = left;
  [...priced].filter((l) => l.product.is_coffee).sort((a, b) => b.unit - a.unit).forEach((l) => {
    const take = Math.min(left, l.qty);
    l.free = take;
    left -= take;
  });
  const reward = priced.reduce((s, l) => s + l.unit * l.free, 0);

  const paidUnits = priced.filter((l) => l.product.is_coffee)
    .flatMap((l) => Array(l.qty - l.free).fill(l.unit) as number[])
    .sort((a, b) => b - a);
  let campaign = 0;
  if (opts.settings.second_coffee_active && opts.settings.second_coffee_pct > 0) {
    for (let i = 1; i < paidUnits.length; i += 2) campaign += Math.round((paidUnits[i] * opts.settings.second_coffee_pct) / 100);
  }
  const hasDrink = priced.some((l) => opts.drinkCategories.has(l.product.category_id));
  const cup = opts.ownCup && hasDrink ? Math.min(opts.settings.own_cup_discount, Math.max(subtotal - reward - campaign, 0)) : 0;
  return {
    lines: priced, subtotal, reward, campaign, cup,
    total: Math.max(subtotal - reward - campaign - cup, 0),
    count: priced.reduce((s, l) => s + l.qty, 0),
    coffees: coffeeTotal, paidCoffees: paidUnits.length, freeCount, hasDrink,
  };
}

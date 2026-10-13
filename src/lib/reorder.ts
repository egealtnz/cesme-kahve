// "Tekrar sipariş ver": puts the items of a past order back in the cart (with the same milk), skipping
// anything that is no longer on the menu or sold out at the chosen branch.
import { useCallback } from 'react';
import { router } from 'expo-router';
import { useCatalogue } from './api';
import type { Order } from './types';
import { useCart } from '@/state/cart';
import { useToast } from '@/state/toast';
import { L } from './i18n';

export function useReorder() {
  const { data: cat } = useCatalogue();
  const cart = useCart();
  const toast = useToast();

  return useCallback((order: Order, soldOut?: Set<string>) => {
    if (!cat) return;
    let added = 0;
    let skipped = 0;
    for (const item of order.order_items ?? []) {
      const product = item.product_id ? cat.productById.get(item.product_id) : undefined;
      if (!product || soldOut?.has(product.id)) { skipped += item.quantity; continue; }
      // same milk (by id, or by label for older orders) and the same options that are still offered
      const milk = product.has_milk_options
        ? (item.milk_id ? cat.milkById.get(item.milk_id) : undefined) ?? cat.milks.find((m) => m.label === item.milk_label) ?? cat.milks.find((m) => m.is_default) ?? null
        : null;
      const offered = new Set(cat.optionsFor(product.id).flatMap((g) => g.values.map((v) => v.id)));
      const options = (item.options ?? []).map((o) => o.id).filter((id) => offered.has(id));
      cart.add(product.id, milk?.id ?? null, item.quantity, options);
      added += item.quantity;
    }
    if (!cart.branchId && order.branch_id) cart.setBranch(order.branch_id);
    if (added === 0) {
      toast(L('Bu siparişteki ürünler şu an menüde yok.', 'The items in this order are not on the menu right now.'));
      return;
    }
    toast(skipped ? L(`${added} ürün sepete eklendi; ${skipped} ürün şu an menüde yok.`, `${added} added to your cart; ${skipped} not on the menu right now.`) : L(`${added} ürün sepete eklendi.`, `${added} added to your cart.`));
    router.navigate('/cart');
  }, [cat, cart, toast]);
}

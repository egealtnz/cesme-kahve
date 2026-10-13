// "Tekrar sipariş ver": puts the items of a past order back in the cart (with the same milk), skipping
// anything that is no longer on the menu or sold out at the chosen branch.
import { useCallback } from 'react';
import { router } from 'expo-router';
import { useCatalogue } from './api';
import type { Order } from './types';
import { useCart } from '@/state/cart';
import { useToast } from '@/state/toast';

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
      // milk is stored by label on the order; find the option with that label (or the default)
      const milk = product.has_milk_options
        ? cat.milks.find((m) => m.label === item.milk_label) ?? cat.milks.find((m) => m.is_default) ?? null
        : null;
      cart.add(product.id, milk?.id ?? null, item.quantity);
      added += item.quantity;
    }
    if (!cart.branchId && order.branch_id) cart.setBranch(order.branch_id);
    if (added === 0) {
      toast('Bu siparişteki ürünler şu an menüde yok.');
      return;
    }
    toast(skipped ? `${added} ürün sepete eklendi; ${skipped} ürün şu an menüde yok.` : `${added} ürün sepete eklendi.`);
    router.navigate('/cart');
  }, [cat, cart, toast]);
}

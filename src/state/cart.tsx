import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CartLine = { key: string; productId: string; milkId: string | null; qty: number };
type Stored = { lines: CartLine[]; branchId: string | null; eco: boolean; ownCup: boolean; useRewards: number };

type CartState = Stored & {
  hydrated: boolean;
  count: number;
  add: (productId: string, milkId: string | null, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  /** Takes one of this product out (from the line added last, e.g. the latest milk choice). */
  removeOne: (productId: string) => void;
  removeProducts: (productIds: string[]) => void;
  clear: () => void;
  setBranch: (id: string | null) => void;
  setEco: (v: boolean) => void;
  setOwnCup: (v: boolean) => void;
  setUseRewards: (n: number) => void;
};

const KEY = 'ck.cart.v1';
const EMPTY: Stored = { lines: [], branchId: null, eco: true, ownCup: false, useRewards: 0 };
const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Stored>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => { if (raw) setState({ ...EMPTY, ...JSON.parse(raw) }); })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (hydrated) AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => undefined);
  }, [state, hydrated]);

  const add = useCallback((productId: string, milkId: string | null, qty = 1) => {
    const key = `${productId}|${milkId ?? '-'}`;
    setState((s) => {
      const found = s.lines.find((l) => l.key === key);
      const lines = found
        ? s.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(20, l.qty + qty) } : l))
        : [...s.lines, { key, productId, milkId, qty: Math.min(20, qty) }];
      return { ...s, lines };
    });
  }, []);

  const value = useMemo<CartState>(() => ({
    ...state,
    hydrated,
    count: state.lines.reduce((n, l) => n + l.qty, 0),
    add,
    setQty: (key, qty) => setState((s) => ({
      ...s,
      lines: qty <= 0 ? s.lines.filter((l) => l.key !== key) : s.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(20, qty) } : l)),
    })),
    removeOne: (productId) => setState((s) => {
      const idx = s.lines.map((l) => l.productId).lastIndexOf(productId);
      if (idx < 0) return s;
      const line = s.lines[idx];
      const lines = line.qty <= 1 ? s.lines.filter((_, i) => i !== idx) : s.lines.map((l, i) => (i === idx ? { ...l, qty: l.qty - 1 } : l));
      return { ...s, lines };
    }),
    removeProducts: (ids) => setState((s) => ({ ...s, lines: s.lines.filter((l) => !ids.includes(l.productId)) })),
    clear: () => setState((s) => ({ ...s, lines: [], ownCup: false, useRewards: 0 })),
    setBranch: (branchId) => setState((s) => ({ ...s, branchId })),
    setEco: (eco) => setState((s) => ({ ...s, eco })),
    setOwnCup: (ownCup) => setState((s) => ({ ...s, ownCup })),
    setUseRewards: (useRewards) => setState((s) => ({ ...s, useRewards: Math.max(0, useRewards) })),
  }), [state, hydrated, add]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart outside CartProvider');
  return ctx;
}

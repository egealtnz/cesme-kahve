import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { callFunction, IS_DEMO, supabase } from './supabase';
import type {
  Branch, Campaign, Category, Milk, Order, OrderStatus, PaymentMethod, Product, Profile, Reward, Settings, StaffMembership,
} from './types';

async function must<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

// ---------------------------------------------------------------- catalogue (public)
export type Catalogue = {
  branches: Branch[]; categories: Category[]; products: Product[]; milks: Milk[];
  campaigns: Campaign[]; settings: Settings;
  productById: Map<string, Product>; milkById: Map<string, Milk>; drinkCategories: Set<string>;
};

export function useCatalogue() {
  return useQuery({
    queryKey: ['catalogue'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Catalogue> => {
      const [branches, categories, products, milks, campaigns, settings] = await Promise.all([
        must(supabase.from('branches').select('*').order('sort')),
        must(supabase.from('menu_categories').select('*').order('sort')),
        must(supabase.from('products').select('*').order('sort')),
        must(supabase.from('milk_options').select('*').order('sort')),
        must(supabase.from('campaigns').select('*').order('sort')),
        must(supabase.from('app_settings').select('*').single()),
      ]);
      return {
        branches: branches as Branch[], categories: categories as Category[], products: products as Product[],
        milks: milks as Milk[], campaigns: campaigns as Campaign[], settings: settings as unknown as Settings,
        productById: new Map((products as Product[]).map((p) => [p.id, p])),
        milkById: new Map((milks as Milk[]).map((m) => [m.id, m])),
        drinkCategories: new Set((categories as Category[]).filter((c) => c.is_drink).map((c) => c.id)),
      };
    },
  });
}

/** Products marked sold out at a branch, kept live while the screen is open. */
export function useSoldOut(branchId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['sold-out', branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const rows = await must(supabase.from('product_availability').select('product_id').eq('branch_id', branchId!).eq('sold_out', true));
      return new Set((rows as { product_id: string }[]).map((r) => r.product_id));
    },
  });
  useEffect(() => {
    if (!branchId) return;
    const channel = supabase
      .channel(`availability-${branchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_availability', filter: `branch_id=eq.${branchId}` },
        () => qc.invalidateQueries({ queryKey: ['sold-out', branchId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [branchId, qc]);
  return query;
}

// ---------------------------------------------------------------- the signed-in customer
export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => (await must(supabase.from('profiles').select('*').eq('id', userId!).single())) as Profile,
  });
}

export function useRewards(userId: string | undefined) {
  return useQuery({
    queryKey: ['rewards', userId],
    enabled: !!userId,
    queryFn: async () => {
      const rows = await must(supabase.from('rewards').select('*').is('used_at', null).is('reserved_order_id', null)
        .gt('expires_at', new Date().toISOString()).order('expires_at'));
      return rows as Reward[];
    },
  });
}

export function useStaffMemberships(userId: string | undefined) {
  return useQuery({
    queryKey: ['staff', userId],
    enabled: !!userId,
    queryFn: async () => (await must(supabase.from('staff_members').select('branch_id, role'))) as StaffMembership[],
  });
}

const ORDER_SELECT = '*, order_items(*), branch:branches(name, district, city, prep_minutes)';

export function useMyOrders(userId: string | undefined) {
  return useQuery({
    queryKey: ['orders', userId],
    enabled: !!userId,
    queryFn: async () => (await must(supabase.from('orders').select(ORDER_SELECT)
      .eq('user_id', userId!).neq('status', 'awaiting_payment').order('created_at', { ascending: false }).limit(30))) as Order[],
  });
}

const FINAL: OrderStatus[] = ['collected', 'cancelled'];

/** One order, updated live through Realtime with a polling fallback while it is still open. */
export function useOrder(orderId: string | undefined, userId: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    // Waits for the restored session: opened cold (e.g. from a notification) an anonymous read would find nothing.
    queryKey: ['order', orderId, userId],
    enabled: !!orderId && !!userId,
    retry: 2,
    queryFn: async () => (await must(supabase.from('orders').select(ORDER_SELECT).eq('id', orderId!).single())) as Order,
    refetchInterval: (q) => (q.state.data && FINAL.includes(q.state.data.status) ? false : IS_DEMO ? 3_000 : 15_000),
  });
  const status = query.data?.status;
  const paid = query.data?.payment_status;
  useEffect(() => {
    if (status === 'collected' || status === 'cancelled' || paid === 'paid') {
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['rewards'] });
    }
  }, [status, paid, qc]);
  useEffect(() => {
    if (!orderId || !userId) return;
    const channel = supabase
      .channel(`order-${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => qc.invalidateQueries({ queryKey: ['order', orderId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId, userId, qc]);
  return query;
}

// ---------------------------------------------------------------- ordering
export type PlaceOrderInput = {
  branchId: string;
  items: { product_id: string; milk_id: string | null; quantity: number }[];
  paymentMethod: PaymentMethod;
  useRewards: number;
  eco: boolean;
  ownCup: boolean;
};

export async function placeOrder(input: PlaceOrderInput): Promise<Order> {
  const { data, error } = await supabase.rpc('place_order', {
    p_branch_id: input.branchId,
    p_items: input.items,
    p_payment_method: input.paymentMethod,
    p_use_rewards: input.useRewards,
    p_eco_packaging: input.eco,
    p_own_cup: input.ownCup,
  });
  if (error) throw new Error(error.message);
  return data as Order;
}

export async function startCardPayment(orderId: string): Promise<string> {
  const { paymentPageUrl } = await callFunction<{ paymentPageUrl: string }>('iyzico-checkout', { order_id: orderId });
  return paymentPageUrl;
}

/** Opens iyzico's payment page and waits until the customer is sent back to the app. */
export async function openPaymentPage(pageUrl: string): Promise<void> {
  if (IS_DEMO) {
    await new Promise((r) => setTimeout(r, 1200));   // demo: no payment page, the demo bank approves
    return;
  }
  await WebBrowser.openAuthSessionAsync(pageUrl, Linking.createURL('odeme-sonucu'));
}

export type PaymentOutcome = 'success' | 'failed' | 'review' | 'pending' | 'error';
export async function checkPayment(orderId: string): Promise<PaymentOutcome> {
  const { outcome } = await callFunction<{ outcome: PaymentOutcome }>('iyzico-status', { order_id: orderId });
  return outcome;
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc('cancel_my_order', { p_order: orderId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

// ---------------------------------------------------------------- staff
const QUEUE: OrderStatus[] = ['placed', 'preparing', 'ready'];

export function useBranchQueue(branchId: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['queue', branchId],
    enabled: !!branchId,
    refetchInterval: IS_DEMO ? 4_000 : 30_000,
    queryFn: async () => (await must(supabase.from('orders').select('*, order_items(*)')
      .eq('branch_id', branchId!).in('status', QUEUE).order('created_at'))) as Order[],
  });
  useEffect(() => {
    if (!branchId) return;
    const channel = supabase
      .channel(`queue-${branchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
        () => qc.invalidateQueries({ queryKey: ['queue', branchId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [branchId, qc]);
  return query;
}

export async function staffSetStatus(orderId: string, status: OrderStatus): Promise<Order> {
  const { order } = await callFunction<{ order: Order }>('staff-order-status', { order_id: orderId, status });
  return order;
}

export async function staffRedeemReward(code: string, branchId: string) {
  const { data, error } = await supabase.rpc('staff_redeem_reward', { p_code: code, p_branch: branchId });
  if (error) throw new Error(error.message);
  return data as { first_name: string; code: string; expires_at: string };
}

export async function staffAddStamps(memberCode: string, branchId: string, coffees: number) {
  const { data, error } = await supabase.rpc('staff_add_counter_stamps', { p_member_code: memberCode, p_branch: branchId, p_coffees: coffees });
  if (error) throw new Error(error.message);
  return data as { first_name: string; stamps: number; rewards_earned: number };
}

export async function staffSetSoldOut(branchId: string, productId: string, soldOut: boolean) {
  const { error } = await supabase.rpc('staff_set_sold_out', { p_branch: branchId, p_product: productId, p_sold_out: soldOut });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- account
export async function updateProfile(userId: string, patch: Partial<Pick<Profile,
  'first_name' | 'last_name' | 'phone' | 'birthday' | 'favorite_branch_id' | 'marketing_opt_in'>>) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function deleteMyAccount() {
  await callFunction<{ ok: true }>('delete-account', {});
  await supabase.auth.signOut({ scope: 'local' });
}

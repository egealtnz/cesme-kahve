/**
 * Demo backend: a stand-in for the Supabase client used only in preview builds (EXPO_PUBLIC_DEMO=1).
 *
 * It implements exactly the parts of the Supabase API the app calls (table reads, profile updates,
 * the SQL functions, the edge functions and e-mail/password auth) with the same rules as
 * supabase/migrations — server-side pricing, free coffees, stamps, staff permissions — but keeps
 * everything on the device (AsyncStorage / localStorage). Nothing is sent anywhere: no real accounts,
 * no e-mails, no payments. A simulated barista moves new orders to "preparing" and "ready".
 *
 * Production builds never include this file (the import in lib/supabase.ts is dropped at build time).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { priceCart } from '../pricing';
import type { Milk, Order, OrderItem, Product, Profile, Reward, Settings } from '../types';
import catalogue from './catalogue.json';
import { DEMO_CODE, DEMO_CUSTOMER, DEMO_MEMBER_CODE, DEMO_REWARD_CODE, DEMO_STAFF } from './constants';


const STORE_KEY = 'ck.demo.v2';
const settings = catalogue.app_settings as unknown as Settings & { max_open_orders: number; payment_timeout_min: number };
const products = catalogue.products as unknown as (Product & { is_active: boolean })[];
const categories = catalogue.menu_categories as unknown as { id: string; is_drink: boolean; is_active: boolean }[];
const milks = catalogue.milk_options as unknown as (Milk & { is_active: boolean })[];

// Simulated barista timing (seconds after the order reaches the branch).
const SIM_PREPARING = 8;
const SIM_READY = 22;
const SIM_COLLECTED = 22 + 150;

type User = { id: string; email: string; password: string; confirmed: boolean; meta: Record<string, unknown> };
type Row = Record<string, unknown>;
type DemoOrder = Order & { paid_at: string | null; sim: boolean; sim_at: string | null; stamps_awarded?: boolean };
type DemoItem = OrderItem & { order_id: string };
type DemoReward = Reward & { user_id: string; used_branch_id: string | null; source_order_id: string | null };
type State = {
  v: 1;
  users: User[];
  profiles: Profile[];
  staff: { user_id: string; branch_id: string | null; role: 'barista' | 'manager' | 'admin' }[];
  rewards: DemoReward[];
  orders: DemoOrder[];
  items: DemoItem[];
  availability: { branch_id: string; product_id: string; sold_out: boolean }[];
  nextOrderNo: number;
  nextItemId: number;
  sessionUserId: string | null;
};

// ---------------------------------------------------------------- helpers
class DemoError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; }
}
const nowIso = () => new Date().toISOString();
const ago = (sec: number) => new Date(Date.now() - sec * 1000).toISOString();
const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = (len: number) => Array.from({ length: len }, () => ALPHABET[Math.floor(Math.random() * 32)]).join('');
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const normalizeCode = (raw: unknown) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ---------------------------------------------------------------- initial data
function seed(): State {
  const demo = 'u-demo', barista = 'u-barista', mert = 'u-mert', selin = 'u-selin';
  const profile = (id: string, first: string, last: string, code: string, stamps: number, extra: Partial<Profile> = {}): Profile => ({
    id, first_name: first, last_name: last, phone: '5321234567', birthday: null, favorite_branch_id: null,
    marketing_opt_in: false, member_code: code, stamps, ...extra,
  });
  const order = (o: Partial<DemoOrder> & Pick<DemoOrder, 'id' | 'order_no' | 'user_id' | 'customer_name' | 'status'>): DemoOrder => ({
    branch_id: 'alacati', payment_method: 'store', payment_status: 'unpaid', eco_packaging: true, own_cup: false,
    subtotal: 0, reward_discount: 0, campaign_discount: 0, cup_discount: 0, total: 0, rewards_used: 0, stamps_earned: 0,
    created_at: ago(120), ready_at: null, collected_at: null, cancelled_at: null, cancel_reason: null,
    paid_at: null, sim: false, sim_at: null, ...o,
  });
  const item = (id: number, order_id: string, product_id: string, qty: number, milk_id: string | null): DemoItem => {
    const p = products.find((x) => x.id === product_id)!;
    const m = milk_id ? milks.find((x) => x.id === milk_id)! : null;
    return {
      id, order_id, product_id, product_name: p.name, milk_label: m?.label ?? null,
      unit_price: p.price + (m?.extra_price ?? 0), quantity: qty, free_quantity: 0, is_coffee: p.is_coffee,
    };
  };
  return {
    v: 1,
    users: [
      { id: demo, email: DEMO_CUSTOMER.email, password: DEMO_CUSTOMER.password, confirmed: true, meta: {} },
      { id: barista, email: DEMO_STAFF.email, password: DEMO_STAFF.password, confirmed: true, meta: {} },
    ],
    profiles: [
      profile(demo, 'Deniz', 'Yılmaz', DEMO_MEMBER_CODE, 7, { favorite_branch_id: 'alacati' }),
      profile(barista, 'Ece', 'Kaya', 'B7RQ2MXK4T', 0),
      profile(mert, 'Mert', 'Aydın', 'M4KX7PRT2B', 3),
      profile(selin, 'Selin', 'Demir', 'S9HW3NCE6Q', 5),
    ],
    staff: [{ user_id: barista, branch_id: 'alacati', role: 'barista' }],
    rewards: [{
      id: uuid(), user_id: demo, code: DEMO_REWARD_CODE, earned_at: ago(86400 * 4), expires_at: inDays(86),
      reserved_order_id: null, used_at: null, used_branch_id: null, source_order_id: null,
    }],
    orders: [
      order({ id: 'o-1001', order_no: 1001, user_id: demo, customer_name: 'Deniz', status: 'collected', payment_status: 'paid',
        subtotal: 25500, total: 25500, stamps_earned: 1, created_at: ago(86400 * 3), ready_at: ago(86400 * 3 - 300),
        collected_at: ago(86400 * 3 - 600), paid_at: ago(86400 * 3 - 600), stamps_awarded: true }),
      order({ id: 'o-1002', order_no: 1002, user_id: mert, customer_name: 'Mert', status: 'placed', payment_method: 'card',
        payment_status: 'paid', subtotal: 29000, campaign_discount: 7250, total: 21750, stamps_earned: 2,
        created_at: ago(90), paid_at: ago(85), stamps_awarded: true }),
      order({ id: 'o-1003', order_no: 1003, user_id: selin, customer_name: 'Selin', status: 'preparing', own_cup: true,
        subtotal: 23000, cup_discount: 1000, total: 22000, stamps_earned: 1, created_at: ago(240) }),
    ],
    items: [
      item(1, 'o-1001', 'latte', 1, 'badem'),
      item(2, 'o-1001', 'kruvasan-tereyagli', 1, null),
      item(3, 'o-1002', 'cappuccino', 2, 'tam'),
      item(4, 'o-1003', 'cortado', 1, 'yagsiz'),
      item(5, 'o-1003', 'kruvasan-tereyagli', 1, null),
    ],
    availability: [],
    nextOrderNo: 1004,
    nextItemId: 6,
    sessionUserId: null,
  };
}

// ---------------------------------------------------------------- the store
let state: State = seed();
const ready: Promise<void> = AsyncStorage.getItem(STORE_KEY)
  .then((raw) => {
    if (!raw) return;
    const saved = JSON.parse(raw) as State;
    if (saved?.v === 1) state = saved;
  })
  .catch(() => undefined);

function save() {
  AsyncStorage.setItem(STORE_KEY, JSON.stringify(state)).catch(() => undefined);
}

const uid = () => state.sessionUserId;
const isStaff = (branch: string | null | undefined) =>
  !!uid() && state.staff.some((s) => s.user_id === uid() && (s.branch_id === null || s.branch_id === branch));
const profileOf = (id: string) => state.profiles.find((p) => p.id === id);

function addStamps(userId: string, n: number): number {
  const p = profileOf(userId);
  if (!p || n <= 0) return 0;
  p.stamps += n;
  let earned = 0;
  while (p.stamps >= settings.stamps_per_reward) {
    p.stamps -= settings.stamps_per_reward;
    state.rewards.push({
      id: uuid(), user_id: userId, code: newCode(6), earned_at: nowIso(), expires_at: inDays(settings.reward_valid_days),
      reserved_order_id: null, used_at: null, used_branch_id: null, source_order_id: null,
    });
    earned++;
  }
  return earned;
}

/** Once per order, like orders.stamps_awarded_at on the server. */
function awardStamps(o: DemoOrder) {
  if (o.stamps_awarded) return;
  o.stamps_awarded = true;
  if (o.user_id && o.stamps_earned > 0) addStamps(o.user_id, o.stamps_earned);
}
function consumeRewards(o: DemoOrder) {
  for (const r of state.rewards) if (r.reserved_order_id === o.id && !r.used_at) { r.used_at = nowIso(); r.used_branch_id = o.branch_id; }
}
function releaseRewards(o: DemoOrder) {
  for (const r of state.rewards) if (r.reserved_order_id === o.id) { r.reserved_order_id = null; r.used_at = null; r.used_branch_id = null; }
}

/** Advances time-based state: the simulated barista and the unpaid-order timeout. */
function tick() {
  let changed = false;
  const now = Date.now();
  for (const o of state.orders) {
    if (o.status === 'awaiting_payment' && now - Date.parse(o.created_at) > settings.payment_timeout_min * 60_000) {
      o.status = 'cancelled'; o.payment_status = 'failed'; o.cancelled_at = nowIso(); o.cancel_reason = 'payment_timeout';
      releaseRewards(o); changed = true;
      continue;
    }
    if (!o.sim || !o.sim_at) continue;
    const t = (now - Date.parse(o.sim_at)) / 1000;
    const at = (s: number) => new Date(Date.parse(o.sim_at!) + s * 1000).toISOString();
    if (o.status === 'placed' && t >= SIM_PREPARING) { o.status = 'preparing'; changed = true; }
    if (o.status === 'preparing' && t >= SIM_READY) { o.status = 'ready'; o.ready_at = at(SIM_READY); changed = true; }
    if (o.status === 'ready' && t >= SIM_COLLECTED) {
      o.status = 'collected'; o.collected_at = at(SIM_COLLECTED);
      if (o.payment_method === 'store' && o.payment_status !== 'paid') { o.payment_status = 'paid'; o.paid_at = o.collected_at; }
      awardStamps(o); o.sim = false; changed = true;
    }
  }
  if (changed) save();
}

// ---------------------------------------------------------------- table reads
function tableRows(table: string): Row[] {
  const me = uid();
  switch (table) {
    case 'branches': return catalogue.branches as Row[];
    case 'menu_categories': return categories.filter((c) => c.is_active) as Row[];
    case 'products': return products.filter((p) => p.is_active) as Row[];
    case 'milk_options': return milks.filter((m) => m.is_active) as Row[];
    case 'campaigns': return (catalogue.campaigns as Row[]).filter((c) => c.is_active);
    case 'app_settings': return [settings as unknown as Row];
    case 'product_availability': return state.availability as Row[];
    case 'profiles': return state.profiles.filter((p) => p.id === me) as Row[];
    case 'staff_members': return state.staff.filter((s) => s.user_id === me) as Row[];
    case 'rewards': return state.rewards.filter((r) => r.user_id === me) as Row[];
    case 'orders': return state.orders.filter((o) => (me && o.user_id === me) || isStaff(o.branch_id)) as Row[];
    default: return [];
  }
}

function project(row: Row, table: string, cols: string): Row {
  const tokens = cols.split(/,(?![^(]*\))/).map((t) => t.trim()).filter(Boolean);
  let out: Row = {};
  for (const tok of tokens) {
    const embed = tok.match(/^(?:(\w+):)?(\w+)\(([^)]*)\)$/);
    if (tok === '*') {
      out = { ...out, ...row };
    } else if (embed && table === 'orders' && embed[2] === 'order_items') {
      out[embed[1] ?? 'order_items'] = state.items.filter((i) => i.order_id === row.id).sort((a, b) => a.id - b.id);
    } else if (embed && table === 'orders' && embed[2] === 'branches') {
      const b = (catalogue.branches as Row[]).find((x) => x.id === row.branch_id) ?? {};
      const fields = embed[3].split(',').map((f) => f.trim());
      out[embed[1] ?? 'branches'] = Object.fromEntries(fields.map((f) => [f, b[f]]));
    } else {
      out[tok] = row[tok];
    }
  }
  for (const k of ['sim', 'sim_at', 'stamps_awarded']) delete out[k];
  return out;
}

type Filter = (r: Row) => boolean;
type Result = { data: unknown; error: { message: string; code?: string } | null };

class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private cols = '*';
  private sort: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private one = false;
  private mode: 'select' | 'update' | 'upsert' = 'select';
  private patch: Row = {};

  constructor(private table: string) {}

  select(cols = '*') { this.cols = cols; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  is(c: string, v: unknown) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  gt(c: string, v: unknown) { this.filters.push((r) => r[c] != null && String(r[c]) > String(v)); return this; }
  gte(c: string, v: unknown) { this.filters.push((r) => r[c] != null && String(r[c]) >= String(v)); return this; }
  in(c: string, vals: unknown[]) { this.filters.push((r) => vals.includes(r[c])); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.sort = { col, asc: opts?.ascending ?? true }; return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.one = true; return this; }
  update(patch: Row) { this.mode = 'update'; this.patch = patch; return this; }
  upsert() { this.mode = 'upsert'; return this; }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(ok, fail);
  }

  private async run(): Promise<Result> {
    await ready;
    tick();
    if (this.mode === 'upsert') return { data: null, error: null };   // push tokens: nothing to send in the demo
    let rows = tableRows(this.table).filter((r) => this.filters.every((f) => f(r)));
    if (this.mode === 'update') {
      const allowed = ['first_name', 'last_name', 'phone', 'birthday', 'favorite_branch_id', 'marketing_opt_in'];
      if (this.table !== 'profiles') return { data: null, error: { message: 'permission denied' } };
      for (const r of rows) for (const k of Object.keys(this.patch)) if (allowed.includes(k)) r[k] = this.patch[k];
      save();
      return { data: null, error: null };
    }
    if (this.sort) {
      const { col, asc } = this.sort;
      rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
    }
    if (this.max != null) rows = rows.slice(0, this.max);
    const data = rows.map((r) => project(r, this.table, this.cols));
    if (this.one) {
      if (data.length !== 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
      return { data: clone(data[0]), error: null };
    }
    return { data: clone(data), error: null };
  }
}

// ---------------------------------------------------------------- SQL functions
function requireUser(): string {
  const me = uid();
  if (!me) throw new DemoError('not_authenticated');
  return me;
}
function requireStaff(branch: string | null | undefined) {
  if (!isStaff(branch)) throw new DemoError('not_allowed');
}
const publicOrder = (o: DemoOrder) => project(o as unknown as Row, 'orders', '*');

const rpcs: Record<string, (p: Row) => unknown> = {
  place_order(p) {
    const me = requireUser();
    const profile = profileOf(me);
    if (!profile) throw new DemoError('profile_missing');
    const b = catalogue.branches.find((x) => x.id === p.p_branch_id);
    if (!b) throw new DemoError('branch_not_found');
    if (b.status !== 'open' || !b.accepts_orders) throw new DemoError('branch_not_accepting_orders');
    const open = state.orders.filter((o) => o.user_id === me && ['awaiting_payment', 'placed', 'preparing', 'ready'].includes(o.status));
    if (open.length >= settings.max_open_orders) throw new DemoError('too_many_open_orders');

    const items = p.p_items as { product_id: string; milk_id?: string | null; quantity: number }[];
    if (!Array.isArray(items) || items.length === 0 || items.length > 30) throw new DemoError('invalid_items');
    let totalQty = 0;
    const lines = items.map((it, i) => {
      const qty = Number(it.quantity);
      if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw new DemoError('invalid_quantity');
      totalQty += qty;
      if (totalQty > 50) throw new DemoError('order_too_large');
      const prod = products.find((x) => x.id === it.product_id && x.is_active);
      const cat = prod && categories.find((c) => c.id === prod.category_id);
      if (!prod || !cat?.is_active) throw new DemoError(`product_unavailable:${it.product_id}`);
      if (state.availability.some((a) => a.branch_id === b.id && a.product_id === prod.id && a.sold_out)) {
        throw new DemoError(`product_sold_out:${prod.id}`);
      }
      let milk: Milk | null = null;
      if (prod.has_milk_options) {
        milk = it.milk_id ? milks.find((m) => m.id === it.milk_id && m.is_active) ?? null : milks.find((m) => m.is_default) ?? null;
        if (it.milk_id && !milk) throw new DemoError(`milk_unavailable:${it.milk_id}`);
      } else if (it.milk_id) {
        throw new DemoError(`milk_not_allowed:${prod.id}`);
      }
      return { key: String(i), product: prod as Product, milk, qty };
    });

    const coffees = lines.filter((l) => l.product.is_coffee).reduce((s, l) => s + l.qty, 0);
    const available = state.rewards
      .filter((r) => r.user_id === me && !r.used_at && !r.reserved_order_id && r.expires_at > nowIso())
      .sort((a, b) => a.expires_at.localeCompare(b.expires_at));
    const useRewards = Math.min(Math.max(Number(p.p_use_rewards) || 0, 0), coffees, available.length);
    const t = priceCart(lines, {
      useRewards, ownCup: !!p.p_own_cup, settings,
      drinkCategories: new Set(categories.filter((c) => c.is_drink).map((c) => c.id)),
    });

    const card = p.p_payment_method === 'card' && t.total > 0;
    const o: DemoOrder = {
      id: uuid(), order_no: state.nextOrderNo++, user_id: me, customer_name: profile.first_name, branch_id: b.id,
      status: card ? 'awaiting_payment' : 'placed', payment_method: t.total === 0 ? 'store' : (p.p_payment_method as 'card' | 'store'),
      payment_status: t.total === 0 ? 'paid' : 'unpaid', eco_packaging: p.p_eco_packaging !== false,
      own_cup: !!p.p_own_cup && t.hasDrink, subtotal: t.subtotal, reward_discount: t.reward, campaign_discount: t.campaign,
      cup_discount: t.cup, total: t.total, rewards_used: useRewards, stamps_earned: t.paidCoffees,
      created_at: nowIso(), ready_at: null, collected_at: null, cancelled_at: null, cancel_reason: null,
      paid_at: t.total === 0 ? nowIso() : null, sim: !card, sim_at: card ? null : nowIso(),
    };
    state.orders.push(o);
    for (const l of t.lines) {
      state.items.push({
        id: state.nextItemId++, order_id: o.id, product_id: l.product.id, product_name: l.product.name,
        milk_label: l.milk?.label ?? null, unit_price: l.unit, quantity: l.qty, free_quantity: l.free, is_coffee: l.product.is_coffee,
      });
    }
    available.slice(0, useRewards).forEach((r) => { r.reserved_order_id = o.id; });
    if (o.status === 'placed') consumeRewards(o);
    save();
    return publicOrder(o);
  },

  cancel_my_order(p) {
    const me = requireUser();
    const o = state.orders.find((x) => x.id === p.p_order && x.user_id === me);
    if (!o) throw new DemoError('order_not_found');
    if (!(o.status === 'awaiting_payment' || (o.status === 'placed' && o.payment_method === 'store' && o.payment_status === 'unpaid'))) {
      throw new DemoError('cannot_cancel');
    }
    o.status = 'cancelled'; o.cancelled_at = nowIso(); o.cancel_reason = 'customer'; o.sim = false;
    releaseRewards(o);
    save();
    return publicOrder(o);
  },

  staff_set_sold_out(p) {
    requireStaff(p.p_branch as string);
    const row = state.availability.find((a) => a.branch_id === p.p_branch && a.product_id === p.p_product);
    if (row) row.sold_out = !!p.p_sold_out;
    else state.availability.push({ branch_id: p.p_branch as string, product_id: p.p_product as string, sold_out: !!p.p_sold_out });
    save();
    return null;
  },

  staff_redeem_reward(p) {
    requireStaff(p.p_branch as string);
    let code = normalizeCode(p.p_code);
    if (code.startsWith('CKR')) code = code.slice(3);
    const r = state.rewards.find((x) => x.code === code);
    if (!r) throw new DemoError('reward_not_found');
    if (r.used_at) throw new DemoError('reward_already_used');
    if (r.reserved_order_id) throw new DemoError('reward_reserved');
    if (r.expires_at <= nowIso()) throw new DemoError('reward_expired');
    r.used_at = nowIso(); r.used_branch_id = p.p_branch as string;
    save();
    return { first_name: profileOf(r.user_id)?.first_name ?? '', code: r.code, expires_at: r.expires_at };
  },

  staff_add_counter_stamps(p) {
    requireStaff(p.p_branch as string);
    const n = Number(p.p_coffees);
    if (!Number.isInteger(n) || n < 1 || n > settings.max_counter_stamps) throw new DemoError('invalid_quantity');
    let code = normalizeCode(p.p_member_code);
    if (code.startsWith('CKM')) code = code.slice(3);
    const prof = state.profiles.find((x) => x.member_code === code);
    if (!prof) throw new DemoError('member_not_found');
    const earned = addStamps(prof.id, n);
    save();
    return { first_name: prof.first_name, stamps: prof.stamps, rewards_earned: earned };
  },
};

// ---------------------------------------------------------------- edge functions
const functions: Record<string, (body: Row) => unknown> = {
  'iyzico-checkout'(body) {
    const me = requireUser();
    const o = state.orders.find((x) => x.id === body.order_id && x.user_id === me);
    if (!o) throw new DemoError('order_not_found');
    if (o.status !== 'awaiting_payment' || o.payment_method !== 'card') throw new DemoError('order_not_awaiting_payment');
    return { paymentPageUrl: 'demo:payment' };
  },
  'iyzico-status'(body) {
    const me = requireUser();
    const o = state.orders.find((x) => x.id === body.order_id && x.user_id === me);
    if (!o) throw new DemoError('order_not_found');
    if (o.status === 'awaiting_payment') {
      // The demo "bank" approves every payment.
      o.status = 'placed'; o.payment_status = 'paid'; o.paid_at = nowIso(); o.sim = true; o.sim_at = nowIso();
      consumeRewards(o);
      awardStamps(o);
      save();
    }
    return { outcome: o.payment_status === 'paid' ? 'success' : o.payment_status === 'failed' ? 'failed' : 'pending' };
  },
  'staff-order-status'(body) {
    const o = state.orders.find((x) => x.id === body.order_id);
    if (!o) throw new DemoError('order_not_found');
    requireStaff(o.branch_id);
    const to = body.status as Order['status'];
    const ok = (o.status === 'placed' && ['preparing', 'ready', 'cancelled'].includes(to))
      || (o.status === 'preparing' && ['ready', 'cancelled'].includes(to))
      || (o.status === 'ready' && ['collected', 'cancelled'].includes(to));
    if (!ok) throw new DemoError(`invalid_transition:${o.status}->${to}`);
    if (to === 'cancelled' && o.payment_status === 'paid' && o.total > 0) throw new DemoError('refund_required');
    o.status = to; o.sim = false;
    if (to === 'ready') o.ready_at = nowIso();
    if (to === 'collected') {
      o.collected_at = nowIso();
      if (o.payment_method === 'store' && o.payment_status !== 'paid') { o.payment_status = 'paid'; o.paid_at = nowIso(); }
      awardStamps(o);
    }
    if (to === 'cancelled') { o.cancelled_at = nowIso(); o.cancel_reason = 'branch'; releaseRewards(o); }
    save();
    return { order: publicOrder(o) };
  },
  'delete-account'() {
    const me = requireUser();
    for (const o of state.orders) if (o.user_id === me) { o.user_id = null; o.customer_name = null; }
    state.users = state.users.filter((u) => u.id !== me);
    state.profiles = state.profiles.filter((p) => p.id !== me);
    state.rewards = state.rewards.filter((r) => r.user_id !== me);
    state.staff = state.staff.filter((s) => s.user_id !== me);
    save();
    return { ok: true };
  },
};

// ---------------------------------------------------------------- auth
type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'USER_UPDATED' | 'PASSWORD_RECOVERY';
type Listener = (event: AuthEvent, session: ReturnType<typeof sessionOf>) => void;
const listeners = new Set<Listener>();

function sessionOf(userId: string | null) {
  const u = userId ? state.users.find((x) => x.id === userId) : undefined;
  if (!u) return null;
  return {
    access_token: 'demo', refresh_token: 'demo', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', user_metadata: u.meta, app_metadata: {} },
  };
}
function setSession(userId: string | null, event: AuthEvent) {
  state.sessionUserId = userId;
  save();
  const s = sessionOf(userId);
  listeners.forEach((l) => l(event, s));
}
const authError = (code: string, message: string) => ({ code, message, status: 400, name: 'AuthApiError' });
const findUser = (email: string) => state.users.find((u) => u.email === String(email).trim().toLowerCase());

function createProfile(u: User) {
  if (profileOf(u.id)) return;
  const m = u.meta;
  state.profiles.push({
    id: u.id, first_name: String(m.first_name ?? ''), last_name: String(m.last_name ?? ''),
    phone: (m.phone as string) || null, birthday: (m.birthday as string) || null,
    favorite_branch_id: (m.favorite_branch_id as string) || null, marketing_opt_in: !!m.marketing_opt_in,
    member_code: newCode(10), stamps: 0,
  });
}

const auth = {
  async getSession() {
    await ready;
    return { data: { session: sessionOf(state.sessionUserId) }, error: null };
  },
  onAuthStateChange(cb: Listener) {
    listeners.add(cb);
    return { data: { subscription: { unsubscribe: () => { listeners.delete(cb); } } } };
  },
  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
    await ready;
    const e = String(email).trim().toLowerCase();
    if (password.length < 8 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) || !/\d/.test(password)) {
      return { data: { user: null, session: null }, error: authError('weak_password', 'Password is too weak') };
    }
    const existing = findUser(e);
    if (existing?.confirmed) return { data: { user: null, session: null }, error: authError('user_already_exists', 'User already registered') };
    if (existing) { existing.password = password; existing.meta = options?.data ?? {}; }
    else state.users.push({ id: uuid(), email: e, password, confirmed: false, meta: options?.data ?? {} });
    save();
    return { data: { user: { id: findUser(e)!.id, email: e }, session: null }, error: null };
  },
  async verifyOtp({ email, token, type }: { email: string; token: string; type: 'signup' | 'recovery' }) {
    await ready;
    const u = findUser(email);
    if (!u || token !== DEMO_CODE) return { data: { user: null, session: null }, error: authError('otp_expired', 'Token has expired or is invalid') };
    if (type === 'signup') { u.confirmed = true; createProfile(u); }
    setSession(u.id, type === 'recovery' ? 'PASSWORD_RECOVERY' : 'SIGNED_IN');
    return { data: { user: sessionOf(u.id)!.user, session: sessionOf(u.id) }, error: null };
  },
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    await ready;
    const u = findUser(email);
    if (!u || u.password !== password) return { data: { user: null, session: null }, error: authError('invalid_credentials', 'Invalid login credentials') };
    if (!u.confirmed) return { data: { user: null, session: null }, error: authError('email_not_confirmed', 'Email not confirmed') };
    setSession(u.id, 'SIGNED_IN');
    return { data: { user: sessionOf(u.id)!.user, session: sessionOf(u.id) }, error: null };
  },
  async resend() { return { data: {}, error: null }; },
  async resetPasswordForEmail() { return { data: {}, error: null }; },
  async updateUser({ password }: { password?: string }) {
    await ready;
    const u = state.users.find((x) => x.id === uid());
    if (!u) return { data: { user: null }, error: authError('not_authenticated', 'Auth session missing') };
    if (password) u.password = password;
    save();
    return { data: { user: sessionOf(u.id)!.user }, error: null };
  },
  async signOut() {
    setSession(null, 'SIGNED_OUT');
    return { error: null };
  },
  startAutoRefresh() { /* no tokens to refresh */ },
  stopAutoRefresh() { /* no tokens to refresh */ },
};

// ---------------------------------------------------------------- client
const fail = (e: unknown) => ({ message: e instanceof Error ? e.message : String(e) });

export function createDemoClient() {
  const channel = { on: () => channel, subscribe: () => channel, unsubscribe: async () => 'ok' };
  return {
    from: (table: string) => new Query(table),
    async rpc(name: string, params: Row = {}) {
      await ready;
      tick();
      try {
        const fn = rpcs[name];
        if (!fn) throw new DemoError(`unknown_function:${name}`);
        return { data: clone(fn(params)), error: null };
      } catch (e) {
        return { data: null, error: fail(e) };
      }
    },
    functions: {
      async invoke(name: string, opts: { body?: Row } = {}) {
        await ready;
        tick();
        try {
          const fn = functions[name];
          if (!fn) throw new DemoError('not_found');
          return { data: clone(fn(opts.body ?? {})), error: null };
        } catch (e) {
          const code = e instanceof Error ? e.message : String(e);
          return { data: null, error: { name: 'FunctionsHttpError', message: code, context: { json: async () => ({ error: code }) } } };
        }
      },
    },
    auth,
    channel: () => channel,
    removeChannel: async () => 'ok',
  };
}

/** Puts the demo back to its starting data (sample customer, barista and orders). */
export async function resetDemo() {
  await ready;
  state = seed();
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(state)).catch(() => undefined);
  listeners.forEach((l) => l('SIGNED_OUT', null));
}

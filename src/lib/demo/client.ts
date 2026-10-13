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
import type { Branch, Milk, Order, OrderItem, Product, Profile, Reward, Settings } from '../types';
import catalogue from './catalogue.json';
import { DEMO_CODE, DEMO_CUSTOMER, DEMO_MANAGER, DEMO_MEMBER_CODE, DEMO_OWNER, DEMO_REWARD_CODE, DEMO_STAFF } from './constants';
import { isOpenAt } from '../hours';


const STORE_KEY = 'ck.demo.v2';
const settings = catalogue.app_settings as unknown as Settings & { max_open_orders: number; payment_timeout_min: number };
const products = catalogue.products as unknown as (Product & { is_active: boolean })[];
const categories = catalogue.menu_categories as unknown as { id: string; is_drink: boolean; is_active: boolean }[];
const milks = catalogue.milk_options as unknown as (Milk & { is_active: boolean })[];
const branches = catalogue.branches as unknown as Branch[];
const campaignsList = catalogue.campaigns as unknown as Row[];
// Owner edits (menu, branches, campaigns, settings) are applied over a pristine copy of the catalogue.
const PRISTINE = JSON.parse(JSON.stringify(catalogue)) as typeof catalogue;

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
  staff: { user_id: string; branch_id: string | null; role: 'barista' | 'manager' | 'admin'; created_at?: string }[];
  invites?: { email: string; branch_id: string; role: 'barista' | 'manager'; created_at: string }[];
  events?: { order_id: string; status: Order['status']; actor_name: string | null; created_at: string }[];
  ratings?: { order_id: string; user_id: string | null; liked: boolean; comment: string | null; created_at: string }[];
  favorites?: { id: number; user_id: string; product_id: string; milk_id: string | null; created_at: string }[];
  pushCampaigns?: { id: number; title: string; body: string; branch_id: string | null; recipients: number; created_at: string }[];
  edits?: { products?: Row[]; campaigns?: Row[]; branches?: Row[]; settings?: Row };
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
const MANAGER_ID = 'u-manager';
const OWNER_ID = 'u-owner';

/** A month of finished orders across a few branches, so the owner's report has something to show. */
function demoHistory(startNo: number) {
  const names = ['Ayşe', 'Mehmet', 'Zeynep', 'Can', 'Elif', 'Burak', 'Deniz', 'Ece', 'Mert', 'Selin', 'Kerem', 'Nil'];
  const shops = ['alacati', 'alacati', 'korfez', 'pendik-marina', 'izmit-merkez'];
  const menu = [['latte', 'tam'], ['cappuccino', 'tam'], ['americano', null], ['latte', 'badem'], ['flat-white', 'tam'],
    ['kruvasan-tereyagli', null], ['turk-kahvesi', null], ['cortado', 'yagsiz'], ['su', null]] as [string, string | null][];
  const baristas = ['Ece K.', 'Can Ö.', 'Derya A.', 'Mert Y.'];
  const comments = ['Latte harikaydı', 'Biraz bekledim ama lezzetliydi', 'Çok hızlı hazırlandı, teşekkürler', 'Kahve biraz soğuktu', 'Kruvasan taptaze'];
  let rnd = 7;
  const r = (n: number) => { rnd = (rnd * 9301 + 49297) % 233280; return Math.floor((rnd / 233280) * n); };
  const orders: DemoOrder[] = [];
  const items: DemoItem[] = [];
  const events: NonNullable<State['events']> = [];
  const ratings: NonNullable<State['ratings']> = [];
  let itemId = 100;
  for (let i = 0; i < 90; i++) {
    const daysBack = Math.floor(i / 3);
    const hour = [8, 8, 9, 9, 10, 12, 13, 15, 16, 17, 18, 19][r(12)];
    const created = new Date();
    created.setDate(created.getDate() - daysBack - 1);
    created.setHours(hour, r(60), 0, 0);
    const id = `o-h${i}`;
    const lines = Array.from({ length: 1 + r(3) }, () => menu[r(menu.length)]);
    let subtotal = 0;
    let coffees = 0;
    for (const [pid, milkId] of lines) {
      const prod = products.find((p) => p.id === pid);
      if (!prod) continue;
      const milk = milkId ? milks.find((m) => m.id === milkId) ?? null : null;
      const qty = 1 + (r(5) === 0 ? 1 : 0);
      subtotal += (prod.price + (milk?.extra_price ?? 0)) * qty;
      if (prod.is_coffee) coffees += qty;
      items.push({ id: itemId++, order_id: id, product_id: prod.id, product_name: prod.name, milk_label: milk?.label ?? null,
        unit_price: prod.price + (milk?.extra_price ?? 0), quantity: qty, free_quantity: 0, is_coffee: prod.is_coffee });
    }
    const cancelled = r(14) === 0;
    const at = (min: number) => new Date(created.getTime() + min * 60_000).toISOString();
    orders.push({
      id, order_no: startNo + i, user_id: `u-guest-${r(40)}`, customer_name: names[r(names.length)], branch_id: shops[r(shops.length)],
      status: cancelled ? 'cancelled' : 'collected', payment_method: 'store', payment_status: cancelled ? 'unpaid' : 'paid',
      eco_packaging: true, own_cup: false, subtotal, reward_discount: 0, campaign_discount: 0, cup_discount: 0, total: subtotal,
      rewards_used: 0, stamps_earned: coffees, created_at: created.toISOString(), ready_at: cancelled ? null : at(6),
      collected_at: cancelled ? null : at(9), cancelled_at: cancelled ? at(2) : null, cancel_reason: cancelled ? 'customer' : null,
      paid_at: cancelled ? null : at(9), sim: false, sim_at: null, stamps_awarded: true, pickup_at: r(10) === 0 ? at(30) : null,
    } as DemoOrder);
    if (!cancelled) {
      const who = baristas[r(baristas.length)];
      events.push({ order_id: id, status: 'preparing', actor_name: who, created_at: at(1) },
        { order_id: id, status: 'ready', actor_name: who, created_at: at(6) },
        { order_id: id, status: 'collected', actor_name: baristas[r(baristas.length)], created_at: at(9) });
      if (r(3) === 0) {
        const liked = r(6) !== 0;
        ratings.push({ order_id: id, user_id: null, liked, comment: r(2) === 0 ? comments[liked ? r(3) === 0 ? 4 : r(3) : 3] : null, created_at: at(40) });
      }
    }
  }
  return { orders, items, events, ratings };
}

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
      { id: MANAGER_ID, email: DEMO_MANAGER.email, password: DEMO_MANAGER.password, confirmed: true, meta: {} },
      { id: OWNER_ID, email: DEMO_OWNER.email, password: DEMO_OWNER.password, confirmed: true, meta: {} },
    ],
    profiles: [
      profile(demo, 'Deniz', 'Yılmaz', DEMO_MEMBER_CODE, 7, { favorite_branch_id: 'alacati' }),
      profile(barista, 'Ece', 'Kaya', 'B7RQ2MXK4T', 0),
      profile(MANAGER_ID, 'Can', 'Öztürk', 'C5NW8KQT3M', 0),
      profile(OWNER_ID, 'Selda', 'Arslan', 'Y8PL2RTK5N', 0),
      profile(mert, 'Mert', 'Aydın', 'M4KX7PRT2B', 3),
      profile(selin, 'Selin', 'Demir', 'S9HW3NCE6Q', 5),
    ],
    staff: [
      { user_id: barista, branch_id: 'alacati', role: 'barista', created_at: ago(86400 * 40) },
      { user_id: MANAGER_ID, branch_id: 'alacati', role: 'manager', created_at: ago(86400 * 90) },
      { user_id: OWNER_ID, branch_id: null, role: 'admin', created_at: ago(86400 * 365) },
    ],
    invites: [],
    events: [
      { order_id: 'o-1001', status: 'preparing', actor_name: 'Ece K.', created_at: ago(86400 * 3 - 60) },
      { order_id: 'o-1001', status: 'ready', actor_name: 'Ece K.', created_at: ago(86400 * 3 - 300) },
      { order_id: 'o-1001', status: 'collected', actor_name: 'Can Ö.', created_at: ago(86400 * 3 - 600) },
      { order_id: 'o-1003', status: 'preparing', actor_name: 'Ece K.', created_at: ago(200) },
    ],
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

function seedWithHistory(): State {
  const base = seed();
  const h = demoHistory(900);
  base.orders.push(...h.orders);
  base.items.push(...h.items);
  base.events = [...(base.events ?? []), ...h.events];
  base.ratings = [{ order_id: 'o-1001', user_id: 'u-demo', liked: true, comment: 'Badem sütlü latte çok iyiydi', created_at: ago(86400 * 3 - 3600) }, ...h.ratings];
  base.favorites = [{ id: 1, user_id: 'u-demo', product_id: 'latte', milk_id: 'badem', created_at: ago(86400 * 10) }];
  base.pushCampaigns = [];
  base.edits = {};
  return base;
}

// ---------------------------------------------------------------- the store
let state: State = seedWithHistory();
const ready: Promise<void> = AsyncStorage.getItem(STORE_KEY)
  .then((raw) => {
    if (!raw) return;
    const saved = JSON.parse(raw) as State;
    if (saved?.v === 1) {
      state = saved;
      state.invites ??= [];
      state.events ??= [];
      if (!state.ratings) {   // preview saved before the owner tools existed
        const fresh = seedWithHistory();
        Object.assign(state, { ratings: fresh.ratings, favorites: fresh.favorites, pushCampaigns: [], edits: {} });
        state.orders.push(...fresh.orders.filter((o) => o.id.startsWith('o-h')));
        state.items.push(...fresh.items.filter((i) => i.order_id.startsWith('o-h')));
        state.events.push(...(fresh.events ?? []).filter((e) => e.order_id.startsWith('o-h')));
      }
      if (!state.users.some((u) => u.id === OWNER_ID)) {
        const fresh = seed();
        state.users.push(fresh.users.find((u) => u.id === OWNER_ID)!);
        state.profiles.push(fresh.profiles.find((x) => x.id === OWNER_ID)!);
        state.staff.push(fresh.staff.find((x) => x.user_id === OWNER_ID)!);
      }
      if (!state.users.some((u) => u.id === MANAGER_ID)) {
        const fresh = seed();
        state.users.push(fresh.users.find((u) => u.id === MANAGER_ID)!);
        state.profiles.push(fresh.profiles.find((x) => x.id === MANAGER_ID)!);
        state.staff.push(fresh.staff.find((x) => x.user_id === MANAGER_ID)!);
      }
    }
  })
  .catch(() => undefined)
  .then(() => applyEdits());

function applyEdits() {
  const e = state.edits ?? {};
  const put = (target: Row[], value: Row[] | undefined, original: Row[]) => target.splice(0, target.length, ...clone(value ?? original));
  put(products as unknown as Row[], e.products, PRISTINE.products as unknown as Row[]);
  put(campaignsList, e.campaigns, PRISTINE.campaigns as unknown as Row[]);
  put(branches as unknown as Row[], e.branches, PRISTINE.branches as unknown as Row[]);
  for (const k of Object.keys(settings)) delete (settings as unknown as Row)[k];
  Object.assign(settings, clone(PRISTINE.app_settings), e.settings ?? {});
}
function saveEdits(kind: 'products' | 'campaigns' | 'branches' | 'settings') {
  state.edits ??= {};
  if (kind === 'products') state.edits.products = clone(products as unknown as Row[]);
  if (kind === 'campaigns') state.edits.campaigns = clone(campaignsList);
  if (kind === 'branches') state.edits.branches = clone(branches as unknown as Row[]);
  if (kind === 'settings') state.edits.settings = clone(settings as unknown as Row);
  save();
}

function save() {
  AsyncStorage.setItem(STORE_KEY, JSON.stringify(state)).catch(() => undefined);
}

const uid = () => state.sessionUserId;
const isStaff = (branch: string | null | undefined) =>
  !!uid() && state.staff.some((s) => s.user_id === uid() && (s.branch_id === null || s.branch_id === branch));
const profileOf = (id: string) => state.profiles.find((p) => p.id === id);
const SIM_BARISTA = 'Ece K.';
/** "Ece K." for the signed-in staff member. */
const staffName = () => {
  const pr = profileOf(uid() ?? '');
  if (!pr) return 'Personel';
  const initial = pr.last_name && pr.last_name !== '-' ? ' ' + pr.last_name[0] + '.' : '';
  return (pr.first_name + initial).trim() || 'Personel';
};
const recordEvent = (orderId: string, status: Order['status'], name: string, at = nowIso()) => {
  (state.events ??= []).push({ order_id: orderId, status, actor_name: name, created_at: at });
};
const isAdmin = () => !!uid() && state.staff.some((s) => s.user_id === uid() && s.role === 'admin');
const canManage = (branch: string) =>
  !!uid() && state.staff.some((s) => s.user_id === uid() && (s.role === 'admin' || (s.role === 'manager' && s.branch_id === branch)));

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
    if (o.status === 'placed' && t >= SIM_PREPARING) { o.status = 'preparing'; recordEvent(o.id, 'preparing', SIM_BARISTA, at(SIM_PREPARING)); changed = true; }
    if (o.status === 'preparing' && t >= SIM_READY) { o.status = 'ready'; o.ready_at = at(SIM_READY); recordEvent(o.id, 'ready', SIM_BARISTA, o.ready_at); changed = true; }
    if (o.status === 'ready' && t >= SIM_COLLECTED) {
      o.status = 'collected'; o.collected_at = at(SIM_COLLECTED); recordEvent(o.id, 'collected', SIM_BARISTA, o.collected_at);
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
    case 'branches': return branches as unknown as Row[];
    case 'menu_categories': return (isAdmin() ? categories : categories.filter((c) => c.is_active)) as Row[];
    case 'products': return (isAdmin() ? products : products.filter((p) => p.is_active)) as unknown as Row[];
    case 'milk_options': return milks.filter((m) => m.is_active) as Row[];
    case 'campaigns': return isAdmin() ? campaignsList : campaignsList.filter((c) => c.is_active);
    case 'favorites': return (state.favorites ?? []).filter((f) => f.user_id === me) as Row[];
    case 'push_campaigns': return isAdmin() ? (state.pushCampaigns ?? []) as Row[] : [];
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
    } else if (embed && table === 'orders' && embed[2] === 'order_events') {
      const fields = embed[3].split(',').map((f) => f.trim());
      out[embed[1] ?? 'order_events'] = isStaff(row.branch_id as string)
        ? (state.events ?? []).filter((e) => e.order_id === row.id)
          .map((e) => Object.fromEntries(fields.map((f) => [f, (e as Row)[f]])))
        : [];
    } else if (embed && table === 'orders' && embed[2] === 'order_ratings') {
      const rt = (state.ratings ?? []).find((x) => x.order_id === row.id);
      const visible = rt && (rt.user_id === uid() || isStaff(row.branch_id as string));
      out[embed[1] ?? 'order_ratings'] = visible ? { liked: rt.liked, comment: rt.comment } : null;
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

function writeInsert(table: string, row: Row, cols: string): Result {
  const me = uid();
  if (table === 'favorites') {
    if (!me) return { data: null, error: { message: 'not_authenticated' } };
    const list = (state.favorites ??= []);
    if (list.some((f) => f.user_id === me && f.product_id === row.product_id && (f.milk_id ?? null) === (row.milk_id ?? null))) {
      return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
    }
    if (list.filter((f) => f.user_id === me).length >= 30) return { data: null, error: { message: 'too_many_favorites' } };
    list.unshift({ id: Date.now(), user_id: me, product_id: String(row.product_id), milk_id: (row.milk_id as string) ?? null, created_at: nowIso() });
    save();
    return { data: null, error: null };
  }
  if ((table === 'products' || table === 'campaigns') && isAdmin()) {
    const target = table === 'products' ? (products as unknown as Row[]) : campaignsList;
    const full = table === 'products'
      ? { description: null, image_path: null, badge: null, is_coffee: false, has_milk_options: false, is_active: true, sort: 900, ...row }
      : { eyebrow: null, body: null, starts_at: null, ends_at: null, is_active: true, sort: 50, tone: 'surface', ...row };
    target.push(full);
    saveEdits(table);
    return { data: [project(full, table, cols)], error: null };
  }
  return { data: null, error: { message: 'permission denied' } };
}

function writeDelete(table: string, rows: Row[]): Result {
  if (table === 'favorites') {
    state.favorites = (state.favorites ?? []).filter((f) => !rows.includes(f as unknown as Row));
    save();
    return { data: null, error: null };
  }
  if (table === 'campaigns' && isAdmin()) {
    for (const r of rows) campaignsList.splice(campaignsList.indexOf(r), 1);
    saveEdits('campaigns');
    return { data: null, error: null };
  }
  return { data: null, error: { message: 'permission denied' } };
}

class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private cols = '*';
  private sort: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private one = false;
  private mode: 'select' | 'update' | 'upsert' | 'insert' | 'delete' = 'select';
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
  insert(row: Row) { this.mode = 'insert'; this.patch = row; return this; }
  delete() { this.mode = 'delete'; return this; }
  maybeSingle() { this.one = true; return this; }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(ok, fail);
  }

  private async run(): Promise<Result> {
    await ready;
    tick();
    if (this.mode === 'upsert') return { data: null, error: null };   // push tokens: nothing to send in the demo
    let rows = tableRows(this.table).filter((r) => this.filters.every((f) => f(r)));
    if (this.mode === 'insert') return writeInsert(this.table, this.patch, this.cols);
    if (this.mode === 'delete') return writeDelete(this.table, rows);
    if (this.mode === 'update') {
      if (this.table === 'profiles') {
        const allowed = ['first_name', 'last_name', 'phone', 'birthday', 'favorite_branch_id', 'marketing_opt_in'];
        for (const r of rows) for (const k of Object.keys(this.patch)) if (allowed.includes(k)) r[k] = this.patch[k];
        save();
        return { data: null, error: null };
      }
      const editable: Record<string, 'products' | 'campaigns' | 'branches' | 'settings'> = {
        products: 'products', campaigns: 'campaigns', branches: 'branches', app_settings: 'settings',
      };
      if (!editable[this.table] || !isAdmin()) return { data: [], error: null };
      if (this.table === 'branches' && 'opening_hours' in this.patch && this.patch.opening_hours) {
        const ok = Object.entries(this.patch.opening_hours as Row).every(([k, v]) => /^[1-7]$/.test(k) && Array.isArray(v)
          && v.length === 2 && v.every((t) => /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(t))));
        if (!ok) return { data: null, error: { message: 'invalid_hours' } };
      }
      for (const r of rows) Object.assign(r, this.patch);
      saveEdits(editable[this.table]);
      return { data: clone(rows.map((r) => project(r, this.table, this.cols))), error: null };
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
  // ---- branch team (same rules as supabase/migrations/…_branch_team.sql)
  can_manage_branch(p) { return canManage(String(p.p_branch)); },
  branch_team(p) {
    const branch = String(p.p_branch);
    if (!canManage(branch)) throw new DemoError('not_allowed');
    const roleOrder = (r: string) => (r === 'manager' ? 0 : 1);
    return {
      members: state.staff.filter((x) => x.branch_id === branch)
        .map((x) => {
          const u = state.users.find((y) => y.id === x.user_id);
          const pr = profileOf(x.user_id);
          return { user_id: x.user_id, email: u?.email ?? '', first_name: pr?.first_name ?? null, last_name: pr?.last_name ?? null,
            role: x.role, since: x.created_at ?? nowIso(), is_me: x.user_id === uid() };
        })
        .sort((a, b) => roleOrder(a.role) - roleOrder(b.role) || String(a.first_name).localeCompare(String(b.first_name), 'tr')),
      invites: (state.invites ?? []).filter((i) => i.branch_id === branch)
        .map((i) => ({ email: i.email, role: i.role, since: i.created_at })),
    };
  },
  branch_add_staff(p) {
    const branch = String(p.p_branch);
    const role = (p.p_role ?? 'barista') as 'barista' | 'manager';
    const email = String(p.p_email ?? '').trim().toLowerCase();
    if (!canManage(branch)) throw new DemoError('not_allowed');
    if (role !== 'barista' && role !== 'manager') throw new DemoError('invalid_role');
    if (role === 'manager' && !isAdmin()) throw new DemoError('not_allowed');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new DemoError('invalid_email');
    const u = state.users.find((x) => x.email === email && x.confirmed);
    if (!u) {
      state.invites = (state.invites ?? []).filter((i) => !(i.email === email && i.branch_id === branch));
      state.invites.unshift({ email, branch_id: branch, role, created_at: nowIso() });
      save();
      return { status: 'invited' };
    }
    const current = state.staff.find((x) => x.user_id === u.id && x.branch_id === branch);
    if (current) {
      if (current.role === role) throw new DemoError('already_staff');
      if (!isAdmin()) throw new DemoError('not_allowed');
      current.role = role;
      save();
      return { status: 'updated' };
    }
    if (state.staff.some((x) => x.user_id === u.id && x.role === 'admin')) throw new DemoError('already_staff');
    state.staff.push({ user_id: u.id, branch_id: branch, role, created_at: nowIso() });
    save();
    return { status: 'added' };
  },
  branch_remove_staff(p) {
    const branch = String(p.p_branch);
    if (!canManage(branch)) throw new DemoError('not_allowed');
    if (p.p_user === uid()) throw new DemoError('cannot_remove_self');
    const row = state.staff.find((x) => x.user_id === p.p_user && x.branch_id === branch);
    if (!row) throw new DemoError('not_found');
    if (row.role !== 'barista' && !isAdmin()) throw new DemoError('not_allowed');
    state.staff = state.staff.filter((x) => x !== row);
    save();
    return null;
  },
  branch_cancel_invite(p) {
    const branch = String(p.p_branch);
    const email = String(p.p_email ?? '').trim().toLowerCase();
    if (!canManage(branch)) throw new DemoError('not_allowed');
    const inv = (state.invites ?? []).find((i) => i.email === email && i.branch_id === branch);
    if (!inv) throw new DemoError('not_found');
    if (inv.role !== 'barista' && !isAdmin()) throw new DemoError('not_allowed');
    state.invites = (state.invites ?? []).filter((i) => i !== inv);
    save();
    return null;
  },
};

// ---------------------------------------------------------------- edge functions
// ---- owner tools, busy mode, orders for later, ratings (same rules as the 2026-10-13 migrations)
Object.assign(rpcs, {
  is_admin: () => isAdmin(),
  place_order_v2(p: Row) {
    const b = branches.find((x) => x.id === p.p_branch_id);
    if (!b) throw new DemoError('branch_not_found');
    const pickup = p.p_pickup_at ? new Date(String(p.p_pickup_at)) : null;
    if (pickup) {
      if (pickup.getTime() < Date.now() + b.prep_minutes * 60_000) throw new DemoError('pickup_too_soon');
      if (pickup.getTime() > Date.now() + 2 * 86_400_000) throw new DemoError('pickup_too_late');
    }
    const at = pickup ?? new Date();
    if (b.paused_until && Date.parse(b.paused_until) > Date.now() && at.getTime() < Date.parse(b.paused_until)) throw new DemoError('branch_paused');
    if (!isOpenAt(b.opening_hours, at)) throw new DemoError(pickup ? 'pickup_outside_hours' : 'branch_closed_now');
    const created = rpcs.place_order(p) as Order;
    const o = state.orders.find((x) => x.id === created.id)!;
    if (pickup) {
      o.pickup_at = pickup.toISOString();
      // the simulated barista starts when it is time to prepare it
      if (o.sim) o.sim_at = new Date(pickup.getTime() - (b.prep_minutes + 1) * 60_000).toISOString();
      save();
    }
    return publicOrder(o);
  },
  staff_set_busy(p: Row) {
    requireStaff(String(p.p_branch));
    const b = branches.find((x) => x.id === p.p_branch)!;
    const n = Number(p.p_extra_minutes);
    if (!Number.isInteger(n) || n < 0 || n > 60) throw new DemoError('invalid_quantity');
    b.busy_extra_minutes = n;
    b.busy_until = n > 0 ? new Date(Date.now() + 2 * 3600_000).toISOString() : null;
    saveEdits('branches');
    return b;
  },
  staff_pause_orders(p: Row) {
    requireStaff(String(p.p_branch));
    const b = branches.find((x) => x.id === p.p_branch)!;
    const n = Number(p.p_minutes);
    if (!Number.isInteger(n) || n < 0 || n > 240) throw new DemoError('invalid_quantity');
    b.paused_until = n > 0 ? new Date(Date.now() + n * 60_000).toISOString() : null;
    saveEdits('branches');
    return b;
  },
  rate_order(p: Row) {
    const me = requireUser();
    const o = state.orders.find((x) => x.id === p.p_order && x.user_id === me);
    if (!o) throw new DemoError('order_not_found');
    if (o.status !== 'collected' || !o.collected_at || Date.parse(o.collected_at) < Date.now() - 7 * 86_400_000) throw new DemoError('cannot_rate');
    const list = (state.ratings ??= []);
    const comment = String(p.p_comment ?? '').trim().slice(0, 500) || null;
    const existing = list.find((x) => x.order_id === o.id);
    if (existing) Object.assign(existing, { liked: !!p.p_liked, comment, created_at: nowIso() });
    else list.push({ order_id: o.id, user_id: me, liked: !!p.p_liked, comment, created_at: nowIso() });
    save();
    return { liked: !!p.p_liked, comment };
  },
  admin_report(p: Row) {
    const branch = (p.p_branch as string | null) ?? null;
    if (!(isAdmin() || (branch && canManage(branch)))) throw new DemoError('not_allowed');
    const from = String(p.p_from), to = String(p.p_to);
    const all = state.orders.filter((o) => o.created_at >= from && o.created_at < to && (!branch || o.branch_id === branch)
      && (o.status === 'collected' || o.status === 'cancelled'));
    const done = all.filter((o) => o.status === 'collected');
    const items = state.items.filter((i) => done.some((o) => o.id === i.order_id));
    const rts = (state.ratings ?? []).filter((r) => all.some((o) => o.id === r.order_id));
    const tr = (iso: string) => new Date(Date.parse(iso) + 3 * 3600_000);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const byBranch = new Map<string, { orders: number; revenue: number }>();
    for (const o of done) { const x = byBranch.get(o.branch_id) ?? { orders: 0, revenue: 0 }; x.orders++; x.revenue += o.total; byBranch.set(o.branch_id, x); }
    const prod = new Map<string, { qty: number; revenue: number }>();
    for (const i of items) { const x = prod.get(i.product_name) ?? { qty: 0, revenue: 0 }; x.qty += i.quantity; x.revenue += i.unit_price * (i.quantity - i.free_quantity); prod.set(i.product_name, x); }
    const hours = new Map<number, number>();
    for (const o of done) { const h = tr(o.created_at).getUTCHours(); hours.set(h, (hours.get(h) ?? 0) + 1); }
    const days = new Map<string, { orders: number; revenue: number }>();
    for (const o of done) { const d = tr(o.created_at).toISOString().slice(0, 10); const x = days.get(d) ?? { orders: 0, revenue: 0 }; x.orders++; x.revenue += o.total; days.set(d, x); }
    const rtOf = (bid: string, liked: boolean) => rts.filter((r) => r.liked === liked && all.find((o) => o.id === r.order_id)?.branch_id === bid).length;
    return {
      totals: {
        orders: done.length, revenue: sum(done.map((o) => o.total)), avg_ticket: done.length ? Math.round(sum(done.map((o) => o.total)) / done.length) : 0,
        coffees: sum(items.filter((i) => i.is_coffee).map((i) => i.quantity)), cancelled: all.length - done.length,
        customers: new Set(done.map((o) => o.user_id)).size, likes: rts.filter((r) => r.liked).length, dislikes: rts.filter((r) => !r.liked).length,
        scheduled: done.filter((o) => o.pickup_at).length,
      },
      by_branch: [...byBranch.entries()].map(([id, x]) => ({ branch_id: id, name: branches.find((b) => b.id === id)?.name ?? id, ...x, likes: rtOf(id, true), dislikes: rtOf(id, false) }))
        .sort((a, b) => b.revenue - a.revenue),
      top_products: [...prod.entries()].map(([name, x]) => ({ name, ...x })).sort((a, b) => b.qty - a.qty).slice(0, 10),
      by_hour: [...hours.entries()].map(([hour, orders]) => ({ hour, orders })).sort((a, b) => a.hour - b.hour),
      by_day: [...days.entries()].map(([day, x]) => ({ day, ...x })).sort((a, b) => a.day.localeCompare(b.day)),
      comments: rts.filter((r) => r.comment).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20).map((r) => {
        const o = all.find((x) => x.id === r.order_id)!;
        return { liked: r.liked, comment: r.comment, created_at: r.created_at, branch: branches.find((b) => b.id === o.branch_id)?.name ?? '', order_no: o.order_no };
      }),
    };
  },
  admin_export_orders(p: Row) {
    const branch = (p.p_branch as string | null) ?? null;
    if (!(isAdmin() || (branch && canManage(branch)))) throw new DemoError('not_allowed');
    const from = String(p.p_from), to = String(p.p_to);
    return state.orders.filter((o) => o.created_at >= from && o.created_at < to && (!branch || o.branch_id === branch)
      && (o.status === 'collected' || o.status === 'cancelled'))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((o) => {
        const rt = (state.ratings ?? []).find((r) => r.order_id === o.id);
        return {
          order_no: o.order_no, created_at: o.created_at, pickup_at: o.pickup_at ?? null, branch: branches.find((b) => b.id === o.branch_id)?.name ?? '',
          customer: o.customer_name ?? 'Misafir', status: o.status, payment: o.payment_method, subtotal: o.subtotal, discount: o.subtotal - o.total,
          total: o.total, items: state.items.filter((i) => i.order_id === o.id).map((i) => `${i.quantity}x ${i.product_name}${i.milk_label ? ` (${i.milk_label})` : ''}`).join(', '),
          liked: rt ? rt.liked : null, comment: rt?.comment ?? null,
          handled_by: [...new Set((state.events ?? []).filter((e) => e.order_id === o.id).map((e) => e.actor_name))].join(', ') || null,
        };
      });
  },
  admin_push_audience(p: Row) {
    if (!isAdmin()) throw new DemoError('not_allowed');
    const list = state.profiles.filter((x) => x.marketing_opt_in && (!p.p_branch || x.favorite_branch_id === p.p_branch));
    return { reachable: list.length * 37 + 12, opted_in: list.length * 52 + 20 };   // a believable audience for the preview
  },
  admin_send_push(p: Row) {
    if (!isAdmin()) throw new DemoError('not_allowed');
    const title = String(p.p_title ?? '').trim(), body = String(p.p_body ?? '').trim();
    if (!title || title.length > 60 || !body || body.length > 180) throw new DemoError('invalid_message');
    const list = (state.pushCampaigns ??= []);
    if (list[0] && Date.parse(list[0].created_at) > Date.now() - 10 * 60_000) throw new DemoError('campaign_too_soon');
    const recipients = (rpcs.admin_push_audience({ p_branch: p.p_branch }) as { reachable: number }).reachable;
    list.unshift({ id: Date.now(), title, body, branch_id: (p.p_branch as string) ?? null, recipients, created_at: nowIso() });
    save();
    return { campaign_id: list[0].id, recipients };
  },
});

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
    recordEvent(o.id, to, staffName());
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

/** Invites for this email become staff memberships once the address is confirmed. */
function claimInvites(u: User) {
  for (const i of (state.invites ?? []).filter((x) => x.email === u.email)) {
    if (!state.staff.some((x) => x.user_id === u.id && x.branch_id === i.branch_id)) {
      state.staff.push({ user_id: u.id, branch_id: i.branch_id, role: i.role, created_at: nowIso() });
    }
  }
  state.invites = (state.invites ?? []).filter((x) => x.email !== u.email);
}

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
    if (type === 'signup') { u.confirmed = true; createProfile(u); claimInvites(u); }
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
  state = seedWithHistory();
  applyEdits();
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(state)).catch(() => undefined);
  listeners.forEach((l) => l('SIGNED_OUT', null));
}

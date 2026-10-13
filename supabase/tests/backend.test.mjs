// End-to-end checks of the database rules and edge functions through the real Supabase APIs.
// Run against a LOCAL or STAGING project only — it creates and deletes test users.
//
//   SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… node supabase/tests/backend.test.mjs
//
// Set IYZICO_MOCK_URL to also exercise card payments against the iyzico test double used in development.
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MOCK = process.env.IYZICO_MOCK_URL;
if (!URL_ || !ANON || !SERVICE) throw new Error('Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY');

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, opts);
const anon = createClient(URL_, ANON, opts);
const stamp = Date.now();
let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

async function newCustomer(first) {
  const email = `test+${first.toLowerCase()}${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: 'Kahve2026!', email_confirm: true,
    user_metadata: { first_name: first, last_name: 'Test', phone: '5321234567', terms_accepted: true,
                     privacy_notice_ack: true, marketing_opt_in: true, favorite_branch_id: 'alacati' },
  });
  if (error) throw error;
  const client = createClient(URL_, ANON, opts);
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: 'Kahve2026!' });
  if (e2) throw e2;
  return { id: data.user.id, email, client };
}

async function newStaff(branch) {
  const s = await newCustomer('Barista' + branch.replace(/-/g, ''));
  const { error } = await admin.from('staff_members').insert({ user_id: s.id, branch_id: branch, role: 'barista' });
  if (error) throw error;
  return s;
}

const rpc = async (client, fn, args) => {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
};
const rpcError = async (client, fn, args) => {
  const { error } = await client.rpc(fn, args);
  return error?.message ?? null;
};
const profile = async (u) => (await u.client.from('profiles').select('*').single()).data;
const fn = (u, name, body) => fetch(`${URL_}/functions/v1/${name}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: ANON,
             Authorization: `Bearer ${(await_session(u))}` },
  body: JSON.stringify(body),
});
const sessions = new Map();
const await_session = (u) => sessions.get(u.id);

console.log('Çeşme Kahve backend tests');
const a = await newCustomer('Ayse');
const b = await newCustomer('Burak');
const staff = await newStaff('pendik-marina');
const otherStaff = await newStaff('alacati');
for (const u of [a, b, staff, otherStaff]) sessions.set(u.id, (await u.client.auth.getSession()).data.session.access_token);
await admin.from('product_availability').delete().eq('branch_id', 'pendik-marina');

await test('anyone can read the menu and branches', async () => {
  const { data: p } = await anon.from('products').select('id, price').limit(5);
  const { data: br } = await anon.from('branches').select('id');
  assert.ok(p.length === 5 && br.length >= 10);
});

await test('anonymous visitors cannot read orders or profiles', async () => {
  const { data: o } = await anon.from('orders').select('id');
  const { data: pr } = await anon.from('profiles').select('id');
  assert.equal((o ?? []).length, 0);
  assert.equal((pr ?? []).length, 0);
});

await test('sign-up metadata becomes a profile with consent timestamps', async () => {
  const p = await profile(a);
  assert.equal(p.first_name, 'Ayse');
  assert.equal(p.phone, '5321234567');
  assert.equal(p.favorite_branch_id, 'alacati');
  assert.ok(p.terms_accepted_at && p.privacy_notice_at && p.marketing_opt_in_at);
  assert.match(p.member_code, /^[A-HJ-NP-Z2-9]{10}$/);
  assert.equal(p.stamps, 0);
});

await test('customers can edit their name but not their stamps', async () => {
  const { error: e1 } = await a.client.from('profiles').update({ first_name: 'Ayşe' }).eq('id', a.id);
  assert.equal(e1, null);
  const { error: e2 } = await a.client.from('profiles').update({ stamps: 99 }).eq('id', a.id);
  assert.ok(e2, 'stamp update should be refused');
  assert.equal((await profile(a)).stamps, 0);
});

let storeOrder;
await test('pay-at-counter order: server prices it and applies "second coffee 50%"', async () => {
  storeOrder = await rpc(a.client, 'place_order', {
    p_branch_id: 'pendik-marina', p_payment_method: 'store', p_use_rewards: 0, p_eco_packaging: true, p_own_cup: false,
    p_items: [{ product_id: 'flat-white', milk_id: 'badem', quantity: 1 }, { product_id: 'americano', quantity: 1 },
              { product_id: 'cortado', quantity: 1 }, { product_id: 'kruvasan-tereyagli', quantity: 1 }],
  });
  // 165 (flat white + almond) + 125 + 135 + 95 = 520 TL; pairs 165/135 → 135 × 50% = 67.50 TL off
  assert.equal(storeOrder.subtotal, 52000);
  assert.equal(storeOrder.campaign_discount, 6750);
  assert.equal(storeOrder.total, 45250);
  assert.equal(storeOrder.status, 'placed');
  assert.equal(storeOrder.stamps_earned, 3);
  assert.equal(storeOrder.customer_name, 'Ayşe');
});

await test('prices sent by the app are ignored; unknown products and milk on tea are refused', async () => {
  assert.match(await rpcError(a.client, 'place_order', { p_branch_id: 'pendik-marina', p_payment_method: 'store',
    p_items: [{ product_id: 'nope', quantity: 1 }] }), /product_unavailable/);
  assert.match(await rpcError(a.client, 'place_order', { p_branch_id: 'pendik-marina', p_payment_method: 'store',
    p_items: [{ product_id: 'earl-grey', milk_id: 'tam', quantity: 1 }] }), /milk_not_allowed/);
  assert.match(await rpcError(a.client, 'place_order', { p_branch_id: 'florya', p_payment_method: 'store',
    p_items: [{ product_id: 'americano', quantity: 1 }] }), /branch_not_accepting_orders/);
});

await test('customers only see their own orders', async () => {
  const { data } = await b.client.from('orders').select('id');
  assert.equal(data.length, 0);
  const { data: mine } = await a.client.from('orders').select('id, order_items(product_name)').eq('id', storeOrder.id).single();
  assert.equal(mine.order_items.length, 4);
});

await test('staff see their branch queue; staff elsewhere and customers cannot move orders', async () => {
  const { data } = await staff.client.from('orders').select('id').eq('id', storeOrder.id);
  assert.equal(data.length, 1);
  const { data: none } = await otherStaff.client.from('orders').select('id').eq('id', storeOrder.id);
  assert.equal(none.length, 0);
  assert.match(await rpcError(a.client, 'staff_set_order_status', { p_order: storeOrder.id, p_status: 'ready' }), /not_allowed/);
  assert.match(await rpcError(otherStaff.client, 'staff_set_order_status', { p_order: storeOrder.id, p_status: 'ready' }), /not_allowed/);
});

await test('collecting a pay-at-counter order marks it paid and adds 3 stamps', async () => {
  for (const s of ['preparing', 'ready', 'collected']) {
    const res = await fn(staff, 'staff-order-status', { order_id: storeOrder.id, status: s });
    assert.equal(res.status, 200, await res.clone().text());
  }
  const { data: o } = await a.client.from('orders').select('status, payment_status').eq('id', storeOrder.id).single();
  assert.deepEqual(o, { status: 'collected', payment_status: 'paid' });
  assert.equal((await profile(a)).stamps, 3);
  assert.match(await rpcError(staff.client, 'staff_set_order_status', { p_order: storeOrder.id, p_status: 'ready' }), /invalid_transition/);
});

await test('counter stamps fill the card and create a free coffee with a 90-day expiry', async () => {
  const p = await profile(a);
  const res = await rpc(staff.client, 'staff_add_counter_stamps', { p_member_code: `CK-M:${p.member_code}`, p_branch: 'pendik-marina', p_coffees: 7 });
  assert.equal(res.rewards_earned, 1);
  assert.equal(res.stamps, 0);
  const { data: rewards } = await a.client.from('rewards').select('*');
  assert.equal(rewards.length, 1);
  const days = (new Date(rewards[0].expires_at) - new Date(rewards[0].earned_at)) / 864e5;
  assert.ok(Math.abs(days - 90) < 0.01);
  assert.match(await rpcError(b.client, 'staff_add_counter_stamps', { p_member_code: p.member_code, p_branch: 'pendik-marina', p_coffees: 7 }), /not_allowed/);
  assert.match(await rpcError(staff.client, 'staff_add_counter_stamps', { p_member_code: p.member_code, p_branch: 'pendik-marina', p_coffees: 40 }), /invalid_quantity/);
});

await test('card orders are refused while card payments are switched off', async () => {
  await admin.from('app_settings').update({ card_payments_enabled: false }).eq('id', true);
  assert.match(await rpcError(a.client, 'place_order', { p_branch_id: 'pendik-marina', p_payment_method: 'card',
    p_items: [{ product_id: 'americano', quantity: 1 }] }), /card_payments_disabled/);
  const { error } = await admin.from('app_settings').update({ card_payments_enabled: true }).eq('id', true);
  assert.ifError(error);
});

await test('a free coffee covers the most expensive coffee and is held while the order is unpaid', async () => {
  const o = await rpc(a.client, 'place_order', {
    p_branch_id: 'pendik-marina', p_payment_method: 'card', p_use_rewards: 1, p_own_cup: true,
    p_items: [{ product_id: 'espresso', quantity: 1 }, { product_id: 'mocha-ruby', milk_id: 'soya', quantity: 1 }],
  });
  // mocha 180 + soy 15 = 195 free; espresso 95 paid; own cup −10 → 85 TL
  assert.equal(o.reward_discount, 19500);
  assert.equal(o.campaign_discount, 0);
  assert.equal(o.cup_discount, 1000);
  assert.equal(o.total, 8500);
  assert.equal(o.status, 'awaiting_payment');
  assert.equal(o.stamps_earned, 1);
  const { data: r } = await a.client.from('rewards').select('reserved_order_id, used_at').single();
  assert.equal(r.reserved_order_id, o.id);
  assert.equal(r.used_at, null);
  // A held reward cannot be used at the counter at the same time.
  assert.match(await rpcError(a.client, 'cancel_my_order', { p_order: '00000000-0000-0000-0000-000000000000' }), /order_not_found/);
  const cancelled = await rpc(a.client, 'cancel_my_order', { p_order: o.id });
  assert.equal(cancelled.status, 'cancelled');
  const { data: r2 } = await a.client.from('rewards').select('reserved_order_id, used_at').single();
  assert.equal(r2.reserved_order_id, null);
});

await test('unpaid card orders expire after the timeout and give the free coffee back', async () => {
  const o = await rpc(a.client, 'place_order', { p_branch_id: 'pendik-marina', p_payment_method: 'card', p_use_rewards: 1,
    p_items: [{ product_id: 'latte', quantity: 1 }, { product_id: 'su', quantity: 1 }] });
  assert.equal(o.status, 'awaiting_payment');
  await admin.from('orders').update({ created_at: new Date(Date.now() - 3600e3).toISOString() }).eq('id', o.id);
  const expired = await rpc(admin, '_expire_stale_orders', { p_user: null });
  assert.ok(expired >= 1);
  const { data: e } = await a.client.from('orders').select('status, cancel_reason').eq('id', o.id).single();
  assert.deepEqual(e, { status: 'cancelled', cancel_reason: 'payment_timeout' });
  const { data: back } = await a.client.from('rewards').select('reserved_order_id').single();
  assert.equal(back.reserved_order_id, null);
});

await test('an order fully covered by a free coffee goes straight to the branch', async () => {
  const o = await rpc(a.client, 'place_order', { p_branch_id: 'pendik-marina', p_payment_method: 'card', p_use_rewards: 1,
    p_items: [{ product_id: 'latte', quantity: 1 }] });
  assert.equal(o.total, 0, 'free latte → nothing to pay');
  assert.equal(o.status, 'placed', 'zero-total order goes straight to the branch');
  const { data: r } = await a.client.from('rewards').select('used_at, used_branch_id').single();
  assert.ok(r.used_at);
  // the branch cancels it → the free coffee comes back
  await rpc(staff.client, 'staff_set_order_status', { p_order: o.id, p_status: 'cancelled' });
  const { data: r2 } = await a.client.from('rewards').select('used_at, reserved_order_id').single();
  assert.equal(r2.used_at, null);
  assert.equal(r2.reserved_order_id, null);
});

await test('sold-out items cannot be ordered at that branch', async () => {
  await admin.from('product_availability').delete().eq('product_id', 'tiramisu');
  await rpc(staff.client, 'staff_set_sold_out', { p_branch: 'pendik-marina', p_product: 'tiramisu', p_sold_out: true });
  assert.match(await rpcError(b.client, 'place_order', { p_branch_id: 'pendik-marina', p_payment_method: 'store',
    p_items: [{ product_id: 'tiramisu', quantity: 1 }] }), /product_sold_out/);
  const ok = await rpc(b.client, 'place_order', { p_branch_id: 'alacati', p_payment_method: 'store',
    p_items: [{ product_id: 'tiramisu', quantity: 1 }] });
  assert.equal(ok.status, 'placed');
  await rpc(b.client, 'cancel_my_order', { p_order: ok.id });
  await rpc(staff.client, 'staff_set_sold_out', { p_branch: 'pendik-marina', p_product: 'tiramisu', p_sold_out: false });
});

await test('a customer can hold at most 3 open orders', async () => {
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await rpc(b.client, 'place_order', { p_branch_id: 'pendik-marina', p_payment_method: 'store',
    p_items: [{ product_id: 'su', quantity: 1 }] })).id);
  assert.match(await rpcError(b.client, 'place_order', { p_branch_id: 'pendik-marina', p_payment_method: 'store',
    p_items: [{ product_id: 'su', quantity: 1 }] }), /too_many_open_orders/);
  for (const id of ids) await rpc(b.client, 'cancel_my_order', { p_order: id });
});

await test('free coffee QR redeems once at the counter', async () => {
  const { data: r } = await a.client.from('rewards').select('code').is('used_at', null).single();
  const res = await rpc(staff.client, 'staff_redeem_reward', { p_code: `CK-R:${r.code}`, p_branch: 'pendik-marina' });
  assert.equal(res.first_name, 'Ayşe');
  assert.match(await rpcError(staff.client, 'staff_redeem_reward', { p_code: r.code, p_branch: 'pendik-marina' }), /reward_already_used/);
  assert.match(await rpcError(staff.client, 'staff_redeem_reward', { p_code: 'ZZZZZZ', p_branch: 'pendik-marina' }), /reward_not_found/);
});

if (MOCK) {
  const payWith = async (user, orderId, result) => {
    const init = await fn(user, 'iyzico-checkout', { order_id: orderId });
    const { paymentPageUrl, error } = await init.json();
    assert.ok(paymentPageUrl, `checkout failed: ${error}`);
    const token = paymentPageUrl.split('/pay/')[1];
    await fetch(`${MOCK}/pay/${token}/submit?result=${result}`, { method: 'POST' });   // customer submits the card form
    const cb = await fetch(`${URL_}/functions/v1/iyzico-callback`, {                  // browser posts token back to us
      method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
    return cb.headers.get('location');
  };

  await test('card payment: iyzico success marks the order paid, uses the free coffee and adds stamps', async () => {
    await rpc(staff.client, 'staff_add_counter_stamps', { p_member_code: (await profile(a)).member_code, p_branch: 'pendik-marina', p_coffees: 10 });
    const before = (await profile(a)).stamps;
    const o = await rpc(a.client, 'place_order', { p_branch_id: 'pendik-marina', p_payment_method: 'card', p_use_rewards: 1,
      p_items: [{ product_id: 'flat-white', quantity: 2 }] });
    assert.equal(o.total, 15000);
    const status = await (await fn(a, 'iyzico-status', { order_id: o.id })).json();
    assert.equal(status.outcome, 'pending', 'no payment started yet');
    const location = await payWith(a, o.id, 'ok');
    assert.equal(location, `cesmekahve://odeme-sonucu?status=success&order=${o.id}`);
    const { data: paid } = await a.client.from('orders').select('status, payment_status, iyzico_payment_id').eq('id', o.id).single();
    assert.equal(paid.status, 'placed');
    assert.equal(paid.payment_status, 'paid');
    assert.ok(paid.iyzico_payment_id);
    assert.equal((await profile(a)).stamps, before + 1);
    const { data: used } = await a.client.from('rewards').select('used_at').eq('reserved_order_id', o.id).single();
    assert.ok(used.used_at);
    const again = await (await fn(a, 'iyzico-status', { order_id: o.id })).json();
    assert.equal(again.outcome, 'success');
  });

  await test('card payment: declined card cancels the order and releases the free coffee', async () => {
    await rpc(staff.client, 'staff_add_counter_stamps', { p_member_code: (await profile(a)).member_code, p_branch: 'pendik-marina', p_coffees: 10 });
    const o = await rpc(a.client, 'place_order', { p_branch_id: 'pendik-marina', p_payment_method: 'card', p_use_rewards: 1,
      p_items: [{ product_id: 'cortado', quantity: 2 }] });
    const location = await payWith(a, o.id, 'fail');
    assert.equal(location, `cesmekahve://odeme-sonucu?status=failed&order=${o.id}`);
    const { data: f } = await a.client.from('orders').select('status, payment_status').eq('id', o.id).single();
    assert.deepEqual(f, { status: 'cancelled', payment_status: 'failed' });
    const { count } = await a.client.from('rewards').select('id', { count: 'exact', head: true })
      .is('used_at', null).is('reserved_order_id', null);
    assert.ok(count >= 1);
  });

  await test('another customer cannot start payment for someone else\'s order', async () => {
    const o = await rpc(a.client, 'place_order', { p_branch_id: 'pendik-marina', p_payment_method: 'card',
      p_items: [{ product_id: 'americano', quantity: 1 }] });
    const res = await fn(b, 'iyzico-checkout', { order_id: o.id });
    assert.equal(res.status, 404);
    await rpc(a.client, 'cancel_my_order', { p_order: o.id });
  });

  await test('paid card orders cannot be cancelled by the branch without a refund', async () => {
    const o = await rpc(a.client, 'place_order', { p_branch_id: 'pendik-marina', p_payment_method: 'card',
      p_items: [{ product_id: 'americano', quantity: 1 }] });
    await payWith(a, o.id, 'ok');
    const res = await fn(staff, 'staff-order-status', { order_id: o.id, status: 'cancelled' });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, 'refund_required');
  });

  await test('admin refund cancels a paid card order, returns the free coffee and takes back its stamps', async () => {
    await rpc(staff.client, 'staff_add_counter_stamps', { p_member_code: (await profile(a)).member_code, p_branch: 'pendik-marina', p_coffees: 10 });
    const before = (await profile(a)).stamps;
    const o = await rpc(a.client, 'place_order', { p_branch_id: 'pendik-marina', p_payment_method: 'card', p_use_rewards: 1,
      p_items: [{ product_id: 'cortado', quantity: 1 }, { product_id: 'americano', quantity: 1 }] });
    await payWith(a, o.id, 'ok');
    const paid = (await profile(a)).stamps;
    assert.ok(paid > before || paid === 0, 'stamps were added on payment');
    const { data: unused1 } = await admin.from('rewards').select('id').eq('user_id', a.id).is('used_at', null).is('reserved_order_id', null).gt('expires_at', new Date().toISOString());
    const { data: r, error } = await admin.rpc('admin_refund_order', { p_order_no: o.order_no });
    assert.ifError(error);
    assert.equal(r.status, 'cancelled'); assert.equal(r.payment_status, 'refunded'); assert.equal(r.cancel_reason, 'refunded');
    assert.equal((await profile(a)).stamps, before);
    const { data: unused2 } = await admin.from('rewards').select('id').eq('user_id', a.id).is('used_at', null).is('reserved_order_id', null).gt('expires_at', new Date().toISOString());
    assert.equal(unused2.length, unused1.length + 1);
    const { error: denied } = await a.client.rpc('admin_refund_order', { p_order_no: o.order_no });
    assert.ok(denied, 'customers cannot call it');
  });
}

await test('a new order is announced once to that branch\'s staff only (FCM on Android, Expo on iOS)', async () => {
  const c = await newCustomer('Cem');
  try {
    const android = `fcm-android-ok-${stamp}:APA91b${'x'.repeat(40)}`, dead = `fcm-android-dead-${stamp}:APA91b${'x'.repeat(40)}`;
    const iphone = `ExponentPushToken[staff-ios-${stamp}]`, other = `fcm-other-branch-${stamp}:APA91b${'x'.repeat(40)}`;
    await admin.from('push_tokens').insert([
      { token: android, user_id: staff.id, platform: 'android' },
      { token: dead, user_id: staff.id, platform: 'android' },
      { token: iphone, user_id: staff.id, platform: 'ios' },
      { token: other, user_id: otherStaff.id, platform: 'android' },
    ]);
    const o = await rpc(c.client, 'place_order', { p_branch_id: 'pendik-marina', p_payment_method: 'store',
      p_items: [{ product_id: 'su', quantity: 2 }] });
    const call = (body) => fetch(`${URL_}/functions/v1/notify-branch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const sentFor = async (id) => (await (await fetch(`${MOCK}/push/log`)).json())
      .filter((m) => (m.fcm ? JSON.parse(m.data.body).orderId : m.data?.orderId) === id);

    const first = await call({ order_id: o.id });
    assert.equal(first.status, 200, await first.clone().text());
    assert.deepEqual(await first.json(), { sent: 2 }, 'android + iphone accepted, uninstalled app refused');
    const mine = await sentFor(o.id);
    assert.deepEqual(mine.map((m) => m.token ?? m.to).sort(), [android, dead, iphone].sort(), 'only the branch staff are notified');

    const viaFcm = mine.find((m) => m.token === android);
    assert.equal(viaFcm.project, 'cesme-test');
    assert.equal(viaFcm.android.priority, 'HIGH');
    assert.equal(viaFcm.data.channelId, 'new-orders');
    assert.match(viaFcm.data.title, new RegExp(`^Yeni sipariş #${o.order_no} · Cem`));
    assert.match(viaFcm.data.message, /2× Su · Kasada ödenecek/);
    assert.deepEqual(JSON.parse(viaFcm.data.body), { screen: 'staff', orderId: o.id, branchId: 'pendik-marina' });

    const viaExpo = mine.find((m) => m.to === iphone);
    assert.equal(viaExpo.title, viaFcm.data.title);
    assert.equal(viaExpo.channelId, 'new-orders');
    assert.equal(viaExpo.data.screen, 'staff');

    const { data: left } = await admin.from('push_tokens').select('token').in('token', [android, dead, iphone]);
    assert.deepEqual(left.map((t) => t.token).sort(), [android, iphone].sort(), 'uninstalled app token is forgotten');

    const again = await call({ order_id: o.id });
    assert.deepEqual(await again.json(), { skipped: true });
    assert.equal((await sentFor(o.id)).length, 3, 'no second announcement');
    assert.equal((await call({ order_id: 'nope' })).status, 400);

    // the customer's "order ready" notification goes through the same paths
    await admin.from('push_tokens').insert({ token: `fcm-customer-${stamp}:APA91b${'y'.repeat(40)}`, user_id: c.id, platform: 'android' });
    for (const st of ['preparing', 'ready']) {
      const r = await fn(staff, 'staff-order-status', { order_id: o.id, status: st });
      assert.equal(r.status, 200, await r.clone().text());
    }
    const ready = (await sentFor(o.id)).find((m) => m.token === `fcm-customer-${stamp}:APA91b${'y'.repeat(40)}`);
    assert.ok(ready, 'customer got the ready notification');
    assert.equal(ready.data.channelId, 'orders');
    assert.match(ready.data.title, /Siparişin hazır/);
    await admin.from('push_tokens').delete().in('token', [android, iphone, other]);
  } finally {
    await admin.auth.admin.deleteUser(c.id);
  }
});

await test('branch managers add and remove their own baristas by email; invites wait for email confirmation', async () => {
  const mgr = await newCustomer('Mudur');
  const boss = await newCustomer('Patron');
  const nb = await newCustomer('Yenibarista');
  const extra = [];
  try {
    await admin.from('staff_members').insert([
      { user_id: mgr.id, branch_id: 'pendik-marina', role: 'manager' },
      { user_id: boss.id, branch_id: null, role: 'admin' },
    ]);
    const err = (u, fn, args) => rpcError(u.client, fn, args);

    // who may manage what
    assert.equal(await rpc(mgr.client, 'can_manage_branch', { p_branch: 'pendik-marina' }), true);
    assert.equal(await rpc(mgr.client, 'can_manage_branch', { p_branch: 'alacati' }), false);
    assert.equal(await rpc(staff.client, 'can_manage_branch', { p_branch: 'pendik-marina' }), false, 'baristas cannot');
    assert.equal(await rpc(boss.client, 'can_manage_branch', { p_branch: 'alacati' }), true, 'admin manages every branch');
    assert.match(await err(staff, 'branch_team', { p_branch: 'pendik-marina' }), /not_allowed/);
    assert.match(await err(mgr, 'branch_team', { p_branch: 'alacati' }), /not_allowed/);
    assert.match(await err(nb, 'branch_add_staff', { p_branch: 'pendik-marina', p_email: nb.email }), /not_allowed/);

    // manager adds an existing account (email in any case) → barista right away
    assert.deepEqual(await rpc(mgr.client, 'branch_add_staff', { p_branch: 'pendik-marina', p_email: '  ' + nb.email.toUpperCase() }), { status: 'added' });
    assert.match(await err(mgr, 'branch_add_staff', { p_branch: 'pendik-marina', p_email: nb.email }), /already_staff/);
    assert.equal(await rpc(nb.client, 'is_staff', { p_branch: 'pendik-marina' }), true);
    assert.equal(await rpc(nb.client, 'is_staff', { p_branch: 'alacati' }), false);
    let team = await rpc(mgr.client, 'branch_team', { p_branch: 'pendik-marina' });
    const row = team.members.find((m) => m.user_id === nb.id);
    assert.equal(row.role, 'barista'); assert.equal(row.email, nb.email); assert.equal(row.first_name, 'Yenibarista');
    assert.equal(team.members.find((m) => m.user_id === mgr.id).is_me, true);

    // managers cannot hand out manager rights, touch other branches, remove managers or themselves
    assert.match(await err(mgr, 'branch_add_staff', { p_branch: 'pendik-marina', p_email: b.email, p_role: 'manager' }), /not_allowed/);
    assert.match(await err(mgr, 'branch_add_staff', { p_branch: 'alacati', p_email: b.email }), /not_allowed/);
    assert.match(await err(mgr, 'branch_add_staff', { p_branch: 'pendik-marina', p_email: 'not-an-email' }), /invalid_email/);
    assert.match(await err(mgr, 'branch_remove_staff', { p_branch: 'pendik-marina', p_user: mgr.id }), /cannot_remove_self/);
    assert.match(await err(mgr, 'branch_remove_staff', { p_branch: 'alacati', p_user: otherStaff.id }), /not_allowed/);

    // invite for an email without an account: becomes staff when that address is confirmed
    const invitedEmail = `test+davet${stamp}@example.com`;
    assert.deepEqual(await rpc(mgr.client, 'branch_add_staff', { p_branch: 'pendik-marina', p_email: invitedEmail }), { status: 'invited' });
    team = await rpc(mgr.client, 'branch_team', { p_branch: 'pendik-marina' });
    assert.deepEqual(team.invites.map((i) => [i.email, i.role]), [[invitedEmail, 'barista']]);
    const { data: unconfirmed } = await admin.auth.admin.createUser({ email: invitedEmail, password: 'Kahve2026!', email_confirm: false });
    extra.push(unconfirmed.user.id);
    let { count } = await admin.from('staff_members').select('id', { count: 'exact', head: true }).eq('user_id', unconfirmed.user.id);
    assert.equal(count, 0, 'not staff before the email is confirmed');
    await admin.auth.admin.updateUserById(unconfirmed.user.id, { email_confirm: true });
    ({ count } = await admin.from('staff_members').select('id', { count: 'exact', head: true }).eq('user_id', unconfirmed.user.id).eq('branch_id', 'pendik-marina').eq('role', 'barista'));
    assert.equal(count, 1, 'invite claimed on confirmation');
    team = await rpc(mgr.client, 'branch_team', { p_branch: 'pendik-marina' });
    assert.equal(team.invites.length, 0);

    // cancelling an invite
    await rpc(mgr.client, 'branch_add_staff', { p_branch: 'pendik-marina', p_email: `test+vazgec${stamp}@example.com` });
    await rpc(mgr.client, 'branch_cancel_invite', { p_branch: 'pendik-marina', p_email: `test+vazgec${stamp}@example.com` });
    assert.equal((await rpc(mgr.client, 'branch_team', { p_branch: 'pendik-marina' })).invites.length, 0);

    // removing a barista takes their branch access away
    await rpc(mgr.client, 'branch_remove_staff', { p_branch: 'pendik-marina', p_user: nb.id });
    assert.equal(await rpc(nb.client, 'is_staff', { p_branch: 'pendik-marina' }), false);

    // admin: assigns a manager to any branch, can change roles and remove managers
    assert.deepEqual(await rpc(boss.client, 'branch_add_staff', { p_branch: 'alacati', p_email: nb.email, p_role: 'manager' }), { status: 'added' });
    assert.equal(await rpc(nb.client, 'can_manage_branch', { p_branch: 'alacati' }), true);
    assert.deepEqual(await rpc(boss.client, 'branch_add_staff', { p_branch: 'alacati', p_email: nb.email, p_role: 'barista' }), { status: 'updated' });
    assert.equal(await rpc(nb.client, 'can_manage_branch', { p_branch: 'alacati' }), false);
    await rpc(boss.client, 'branch_add_staff', { p_branch: 'alacati', p_email: nb.email, p_role: 'manager' });
    await rpc(boss.client, 'branch_remove_staff', { p_branch: 'alacati', p_user: nb.id });
    assert.equal(await rpc(nb.client, 'is_staff', { p_branch: 'alacati' }), false);

    // the invites table is not readable directly
    const { data: direct } = await mgr.client.from('staff_invites').select('*');
    assert.ok(!direct?.length, 'staff_invites only through functions');
  } finally {
    for (const id of [mgr.id, boss.id, nb.id, ...extra]) await admin.auth.admin.deleteUser(id);
  }
});

await test('the branch sees which staff member accepted, prepared and handed over an order; customers do not', async () => {
  const c = await newCustomer('Zeynep');
  try {
    const o = await rpc(c.client, 'place_order', { p_branch_id: 'pendik-marina', p_payment_method: 'store',
      p_items: [{ product_id: 'su', quantity: 1 }] });
    for (const st of ['preparing', 'ready', 'collected']) {
      const r = await fn(staff, 'staff-order-status', { order_id: o.id, status: st });
      assert.equal(r.status, 200, await r.clone().text());
    }
    const { data: seen, error } = await staff.client.from('orders').select('id, order_events(status, actor_id, actor_name)').eq('id', o.id).single();
    assert.ifError(error);
    const events = seen.order_events.map((e) => [e.status, e.actor_id, e.actor_name]);
    assert.deepEqual(events, [
      ['preparing', staff.id, 'Baristapendikmarina T.'],
      ['ready', staff.id, 'Baristapendikmarina T.'],
      ['collected', staff.id, 'Baristapendikmarina T.'],
    ]);
    const { data: mine } = await c.client.from('orders').select('id, order_events(status)').eq('id', o.id).single();
    assert.deepEqual(mine.order_events, [], 'customers do not see staff names');
    const { data: direct } = await c.client.from('order_events').select('*').eq('order_id', o.id);
    assert.equal(direct.length, 0);
    const { data: other } = await otherStaff.client.from('order_events').select('*').eq('order_id', o.id);
    assert.equal(other.length, 0, 'other branches do not see them');

    // a customer cancelling their own order is not a staff action
    const o2 = await rpc(c.client, 'place_order', { p_branch_id: 'pendik-marina', p_payment_method: 'store',
      p_items: [{ product_id: 'su', quantity: 1 }] });
    await rpc(c.client, 'cancel_my_order', { p_order: o2.id });
    const { count } = await admin.from('order_events').select('id', { count: 'exact', head: true }).eq('order_id', o2.id);
    assert.equal(count, 0);
  } finally {
    await admin.auth.admin.deleteUser(c.id);
  }
});

await test('owner tools: admin edits the catalogue; busy mode, pausing, opening hours and orders for later', async () => {
  const boss = await newCustomer('Sahip');
  const c = await newCustomer('Pelin');
  try {
    await admin.from('staff_members').insert({ user_id: boss.id, branch_id: null, role: 'admin' });
    assert.equal(await rpc(boss.client, 'is_admin', {}), true);
    assert.equal(await rpc(staff.client, 'is_admin', {}), false);

    // catalogue writes: admins only (others are silently limited by row level security)
    const { data: before } = await admin.from('products').select('price').eq('id', 'su').single();
    const { data: denied } = await staff.client.from('products').update({ price: 1 }).eq('id', 'su').select();
    assert.equal(denied?.length ?? 0, 0, 'baristas cannot change prices');
    const { data: changed, error: e1 } = await boss.client.from('products').update({ price: before.price + 500 }).eq('id', 'su').select('price');
    assert.ifError(e1); assert.equal(changed[0].price, before.price + 500);
    await boss.client.from('products').update({ price: before.price }).eq('id', 'su');
    const { error: e2 } = await boss.client.from('campaigns').insert({ id: `test-${stamp}`, title: 'Deneme', is_active: false });
    assert.ifError(e2);
    const { data: hidden } = await anon.from('campaigns').select('id').eq('id', `test-${stamp}`);
    assert.equal(hidden.length, 0, 'inactive campaigns stay hidden from customers');
    const { data: seenByBoss } = await boss.client.from('campaigns').select('id').eq('id', `test-${stamp}`);
    assert.equal(seenByBoss.length, 1, 'admins see inactive ones');
    await boss.client.from('campaigns').delete().eq('id', `test-${stamp}`);
    const { error: e3 } = await c.client.from('campaigns').insert({ id: `x-${stamp}`, title: 'x' });
    assert.ok(e3, 'customers cannot add campaigns');

    // opening hours (Turkey time), including a late night that runs past midnight; 2026-10-12 is a Monday
    const hours = { 1: ['20:00', '02:00'] };
    const at = async (iso) => rpc(anon, 'branch_open_at', { p_hours: hours, p_at: iso });
    assert.equal(await at('2026-10-12T21:00:00+03:00'), true);
    assert.equal(await at('2026-10-13T01:30:00+03:00'), true, 'Monday night continues after midnight');
    assert.equal(await at('2026-10-13T03:00:00+03:00'), false);
    assert.equal(await at('2026-10-12T19:59:00+03:00'), false);
    const { error: badHours } = await boss.client.from('branches').update({ opening_hours: { 9: ['08:00', '22:00'] } }).eq('id', 'pendik-marina');
    assert.match(badHours?.message ?? '', /invalid_hours/);

    const item = [{ product_id: 'su', quantity: 1 }];
    const place = (extra = {}) => rpcError(c.client, 'place_order_v2', { p_branch_id: 'pendik-marina', p_payment_method: 'store', p_items: item, ...extra });
    // closed every day → no orders now, no orders for later
    await boss.client.from('branches').update({ opening_hours: {} }).eq('id', 'pendik-marina');
    assert.match(await place(), /branch_closed_now/);
    assert.match(await place({ p_pickup_at: new Date(Date.now() + 3 * 3600_000).toISOString() }), /pickup_outside_hours/);
    await boss.client.from('branches').update({ opening_hours: null }).eq('id', 'pendik-marina');

    // busy mode and pause: any staff of the branch; customers cannot
    assert.match(await rpcError(c.client, 'staff_set_busy', { p_branch: 'pendik-marina', p_extra_minutes: 15 }), /not_allowed/);
    const busy = await rpc(staff.client, 'staff_set_busy', { p_branch: 'pendik-marina', p_extra_minutes: 15 });
    assert.equal(busy.busy_extra_minutes, 15); assert.ok(Date.parse(busy.busy_until) > Date.now() + 3600_000);
    await rpc(staff.client, 'staff_pause_orders', { p_branch: 'pendik-marina', p_minutes: 30 });
    assert.match(await place(), /branch_paused/);
    const later = await rpc(c.client, 'place_order_v2', { p_branch_id: 'pendik-marina', p_payment_method: 'store', p_items: item,
      p_pickup_at: new Date(Date.now() + 2 * 3600_000).toISOString() });
    assert.equal(later.status, 'placed', 'pickups after the pause still come in');
    assert.ok(Math.abs(Date.parse(later.pickup_at) - (Date.now() + 2 * 3600_000)) < 60_000);
    await rpc(staff.client, 'staff_pause_orders', { p_branch: 'pendik-marina', p_minutes: 0 });
    await rpc(staff.client, 'staff_set_busy', { p_branch: 'pendik-marina', p_extra_minutes: 0 });
    assert.match(await place({ p_pickup_at: new Date(Date.now() + 60_000).toISOString() }), /pickup_too_soon/);
    assert.match(await place({ p_pickup_at: new Date(Date.now() + 3 * 86400_000).toISOString() }), /pickup_too_late/);
    const now = await rpc(c.client, 'place_order_v2', { p_branch_id: 'pendik-marina', p_payment_method: 'store', p_items: item });
    assert.equal(now.pickup_at, null);
    for (const o of [later, now]) await rpc(c.client, 'cancel_my_order', { p_order: o.id });
  } finally {
    await admin.from('branches').update({ opening_hours: null, paused_until: null, busy_extra_minutes: 0, busy_until: null }).eq('id', 'pendik-marina');
    for (const id of [boss.id, c.id]) await admin.auth.admin.deleteUser(id);
  }
});

await test('favourites, ratings, reports, birthday coffee and owner offers', async () => {
  const boss = await newCustomer('Patron2');
  const c = await newCustomer('Selim');
  const token = `fcm-selim-${stamp}:APA91b${'z'.repeat(40)}`;
  try {
    await admin.from('staff_members').insert({ user_id: boss.id, branch_id: null, role: 'admin' });
    await admin.from('push_tokens').insert({ token, user_id: c.id, platform: 'android' });

    // favourites are private
    const { error: fe } = await c.client.from('favorites').insert({ product_id: 'latte', milk_id: 'badem' });
    assert.ifError(fe);
    assert.equal((await c.client.from('favorites').select('product_id')).data.length, 1);
    assert.equal((await b.client.from('favorites').select('id').eq('product_id', 'latte')).data.length, 0);

    // rating: only the customer's own collected order
    const o = await rpc(c.client, 'place_order_v2', { p_branch_id: 'pendik-marina', p_payment_method: 'store',
      p_items: [{ product_id: 'su', quantity: 2 }] });
    assert.match(await rpcError(c.client, 'rate_order', { p_order: o.id, p_liked: true }), /cannot_rate/);
    for (const st of ['preparing', 'ready', 'collected']) await fn(staff, 'staff-order-status', { order_id: o.id, status: st });
    assert.match(await rpcError(b.client, 'rate_order', { p_order: o.id, p_liked: true }), /order_not_found/);
    await rpc(c.client, 'rate_order', { p_order: o.id, p_liked: false, p_comment: '  Biraz soğuktu  ' });
    const r = await rpc(c.client, 'rate_order', { p_order: o.id, p_liked: true, p_comment: 'Harika' });
    assert.equal(r.liked, true); assert.equal(r.comment, 'Harika');
    const { data: seen } = await staff.client.from('orders').select('order_ratings(liked, comment)').eq('id', o.id).single();
    assert.deepEqual(seen.order_ratings, { liked: true, comment: 'Harika' });

    // report and export: owner for everything, managers for their branch, baristas not at all
    const from = new Date(Date.now() - 3600_000).toISOString(), to = new Date(Date.now() + 3600_000).toISOString();
    const rep = await rpc(boss.client, 'admin_report', { p_from: from, p_to: to });
    assert.ok(rep.totals.orders >= 1 && rep.totals.revenue >= 6000);
    assert.ok(rep.by_branch.some((x) => x.branch_id === 'pendik-marina'));
    assert.ok(rep.top_products.some((x) => x.name === 'Su'));
    assert.ok(rep.comments.some((x) => x.comment === 'Harika'));
    assert.match(await rpcError(staff.client, 'admin_report', { p_from: from, p_to: to, p_branch: 'pendik-marina' }), /not_allowed/);
    assert.match(await rpcError(c.client, 'admin_report', { p_from: from, p_to: to }), /not_allowed/);
    const rows = await rpc(boss.client, 'admin_export_orders', { p_from: from, p_to: to, p_branch: 'pendik-marina' });
    const mine = rows.find((x) => x.order_no === o.order_no);
    assert.equal(mine.items, '2x Su'); assert.equal(mine.liked, true); assert.match(mine.handled_by, /Baristapendikmarina T\./);

    // birthday coffee: today (Turkey time), once a year, with a notification
    const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(5, 10);
    await admin.from('profiles').update({ birthday: `1995-${today}` }).eq('id', c.id);
    await admin.from('push_campaigns').delete().gt('id', 0);
    const run1 = await rpc(admin, '_daily_customer_jobs', {});
    assert.ok(run1.birthdays >= 1);
    const { data: gifts } = await c.client.from('rewards').select('reason, expires_at').eq('reason', 'birthday');
    assert.equal(gifts.length, 1);
    assert.ok(Date.parse(gifts[0].expires_at) > Date.now() + 13 * 86400_000);
    await rpc(admin, '_daily_customer_jobs', {});
    assert.equal((await c.client.from('rewards').select('id').eq('reason', 'birthday')).data.length, 1, 'only once');

    // owner offer to opted-in customers with notifications on
    assert.match(await rpcError(c.client, 'admin_send_push', { p_title: 'x', p_body: 'y' }), /not_allowed/);
    const aud = await rpc(boss.client, 'admin_push_audience', {});
    assert.ok(aud.reachable >= 1 && aud.opted_in >= aud.reachable);
    const sentCampaign = await rpc(boss.client, 'admin_send_push', { p_title: `Kampanya ${stamp}`, p_body: 'Soğuk kahveler %20' });
    assert.ok(sentCampaign.recipients >= 1);
    assert.match(await rpcError(boss.client, 'admin_send_push', { p_title: 'Tekrar', p_body: 'x' }), /campaign_too_soon/);

    // the outbox function delivers both (FCM test double)
    const res = await fetch(`${URL_}/functions/v1/push-outbox`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 200, await res.clone().text());
    const log = await (await fetch(`${MOCK}/push/log`)).json();
    const toSelim = log.filter((m) => m.token === token);
    assert.ok(toSelim.some((m) => m.data.title === 'İyi ki doğdun Selim! 🎂' && m.data.channelId === 'rewards'));
    assert.ok(toSelim.some((m) => m.data.title === `Kampanya ${stamp}` && m.data.channelId === 'offers'));
    const again = await (await fetch(`${URL_}/functions/v1/push-outbox`, { method: 'POST', body: '{}' })).json();
    assert.equal(again.messages, 0, 'each message goes out once');
  } finally {
    await admin.from('push_campaigns').delete().gt('id', 0);
    await admin.from('push_tokens').delete().eq('token', token);
    for (const id of [boss.id, c.id]) await admin.auth.admin.deleteUser(id);
  }
});

await test('deleting an account removes the person and keeps anonymous order records', async () => {
  const o = await rpc(b.client, 'place_order', { p_branch_id: 'pendik-marina', p_payment_method: 'store',
    p_items: [{ product_id: 'su', quantity: 1 }] });
  await b.client.from('push_tokens').insert({ token: `ExponentPushToken[test${stamp}]`, user_id: b.id, platform: 'ios' });
  const res = await fn(b, 'delete-account', {});
  assert.equal(res.status, 200, await res.clone().text());
  const { data: u } = await admin.auth.admin.getUserById(b.id);
  assert.equal(u.user, null);
  const { data: kept } = await admin.from('orders').select('user_id, customer_name, total').eq('id', o.id).single();
  assert.deepEqual(kept, { user_id: null, customer_name: null, total: 3000 });
  const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('id', b.id);
  assert.equal(count, 0);
});

await admin.from('app_settings').update({ card_payments_enabled: false }).eq('id', true);

// clean up the remaining test users
for (const u of [a, staff, otherStaff]) await admin.auth.admin.deleteUser(u.id);
console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);

// Tells the baristas of a branch that a new order has arrived, with a push notification on their phones.
// Called by the database (pg_net) when an order becomes 'placed'; see migration …_staff_new_order_push.sql.
// POST { order_id } → { sent } or { skipped }
//
// No session is needed: the function only ever notifies the order's own branch, once per order (the
// staff_notified_at claim below), and order ids are random UUIDs. Anyone calling it can at most trigger
// that one notification early.
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { adminClient } from '../_shared/supabase.ts';
import { sendPush } from '../_shared/push.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Item = { product_name: string; milk_label: string | null; quantity: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  let body: { order_id?: string } = {};
  try { body = await req.json(); } catch { /* handled below */ }
  if (!body.order_id || !UUID.test(body.order_id)) return fail('invalid_request');

  const db = adminClient();
  // Claim the order so each order is announced once, even if this is called twice.
  const { data: order, error } = await db.from('orders')
    .update({ staff_notified_at: new Date().toISOString() })
    .eq('id', body.order_id).eq('status', 'placed').is('staff_notified_at', null)
    .select('id, order_no, branch_id, customer_name, payment_method, total, own_cup, order_items(product_name, milk_label, quantity)')
    .maybeSingle();
  if (error) return fail('update_failed', 500, error.message);
  if (!order) return json({ skipped: true });

  const { data: staff } = await db.from('staff_members').select('user_id').eq('branch_id', order.branch_id);
  const userIds = [...new Set((staff ?? []).map((s) => s.user_id as string))];
  if (!userIds.length) return json({ sent: 0 });
  const { data: tokens } = await db.from('push_tokens').select('token').in('user_id', userIds);
  if (!tokens?.length) return json({ sent: 0 });

  const items = (order.order_items as Item[] | null) ?? [];
  const summary = items.map((i) => i.quantity + '× ' + i.product_name + (i.milk_label ? ' (' + i.milk_label + ')' : '')).join(', ');
  const payment = order.total === 0 ? 'Hediye' : order.payment_method === 'card' ? 'Kartla ödendi' : 'Kasada ödenecek';
  const title = 'Yeni sipariş #' + order.order_no + (order.customer_name ? ' · ' + order.customer_name : '');
  const text = [summary, payment, order.own_cup ? 'Kendi bardağı' : ''].filter(Boolean).join(' · ');

  try {
    const sent = await sendPush(db, [...new Set(tokens.map((t) => t.token as string))].map((to) => ({
      to,
      title,
      body: text.length > 180 ? text.slice(0, 177) + '…' : text,
      data: { screen: 'staff', orderId: order.id, branchId: order.branch_id },
      channelId: 'new-orders',
      sound: 'default',
      priority: 'high',
    })));
    return json({ sent });
  } catch (e) {
    console.error('push failed', e);
    return json({ sent: 0, error: 'push_failed' });
  }
});

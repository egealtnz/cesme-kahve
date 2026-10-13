// Baristas move an order along (preparing → ready → collected). When it is ready, the customer's
// phones get a push notification.
// POST { order_id, status } with a staff member's session → { order }
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { adminClient, requireUser, userClient } from '../_shared/supabase.ts';
import { sendPush } from '../_shared/push.ts';

const STATUSES = new Set(['preparing', 'ready', 'collected', 'cancelled']);
const KNOWN_ERRORS = ['not_allowed', 'order_not_found', 'invalid_transition', 'refund_required'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  if (!(await requireUser(req))) return fail('not_authenticated', 401);

  let body: { order_id?: string; status?: string } = {};
  try { body = await req.json(); } catch { /* handled below */ }
  if (!body.order_id || !body.status || !STATUSES.has(body.status)) return fail('invalid_request');

  // Runs as the barista, so the database checks they work at this order's branch.
  const { data: order, error } = await userClient(req)
    .rpc('staff_set_order_status', { p_order: body.order_id, p_status: body.status });
  if (error) {
    const code = KNOWN_ERRORS.find((k) => error.message.startsWith(k)) ?? 'update_failed';
    return fail(code, code === 'not_allowed' ? 403 : 409, error.message);
  }

  if ((body.status === 'ready' || body.status === 'cancelled') && order?.user_id) {
    await notify(order.user_id, order.id, order.order_no, body.status).catch((e) => console.error('push failed', e));
  }
  return json({ order });
});

async function notify(userId: string, orderId: string, orderNo: number, status: string) {
  const db = adminClient();
  const { data: tokens } = await db.from('push_tokens').select('token').eq('user_id', userId);
  if (!tokens?.length) return;
  const { data: o } = await db.from('orders').select('table_label, branch:branches(name)').eq('id', orderId).single();
  const { data: p } = await db.from('profiles').select('locale').eq('id', userId).maybeSingle();
  // deno-lint-ignore no-explicit-any
  const branchName = (o?.branch as any)?.name ?? '';
  const table = (o?.table_label as string | null) ?? null;
  const en = p?.locale === 'en';
  const ready = status === 'ready';
  const title = ready ? (en ? 'Your order is ready ☕' : 'Siparişin hazır ☕') : (en ? 'Your order was cancelled' : 'Siparişin iptal edildi');
  const text = ready
    ? table
      ? (en ? `#${orderNo} is on its way to table ${table}. Enjoy!` : `#${orderNo} masana geliyor (Masa ${table}). Afiyet olsun!`)
      : (en ? `#${orderNo} is waiting for you at ${branchName}. Enjoy!` : `#${orderNo} ${branchName} şubesinde seni bekliyor. Afiyet olsun!`)
    : (en ? `Order #${orderNo} was cancelled by the branch.` : `#${orderNo} numaralı siparişin şube tarafından iptal edildi.`);
  await sendPush(db, tokens.map(({ token }) => ({
    to: token,
    title,
    body: text,
    data: { orderId, url: `cesmekahve://siparis/${orderId}` },
    channelId: 'orders',
    priority: 'high',
  })));
}

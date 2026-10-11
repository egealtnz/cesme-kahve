// The app calls this after the payment page closes (or when the customer taps "check again").
// POST { order_id } with the customer's session → { outcome, order }
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { adminClient, requireUser } from '../_shared/supabase.ts';
import { settlePayment } from '../_shared/settle.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  const user = await requireUser(req);
  if (!user) return fail('not_authenticated', 401);

  let orderId = '';
  try { orderId = String((await req.json()).order_id ?? ''); } catch { /* handled below */ }
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return fail('invalid_request');

  const db = adminClient();
  const { data: order } = await db
    .from('orders').select('id, user_id, total, status, payment_status, iyzico_token').eq('id', orderId).maybeSingle();
  if (!order || order.user_id !== user.id) return fail('order_not_found', 404);

  const outcome = order.status === 'awaiting_payment' ? await settlePayment(db, order)
    : order.payment_status === 'paid' ? 'success' : order.status === 'cancelled' ? 'failed' : 'pending';
  const { data: fresh } = await db.from('orders').select('id, status, payment_status, total').eq('id', orderId).single();
  return json({ outcome, order: fresh });
});

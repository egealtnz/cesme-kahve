// Starts an iyzico hosted payment page for one of the caller's card orders.
// POST { order_id } with the customer's session → { paymentPageUrl }
import { corsHeaders, env, fail, json } from '../_shared/http.ts';
import { adminClient, requireUser } from '../_shared/supabase.ts';
import { CF_INITIALIZE, iyzicoPost, kurusToPrice, signatureMatches } from '../_shared/iyzico.ts';

type InitResponse = {
  status: 'success' | 'failure';
  errorCode?: string;
  errorMessage?: string;
  conversationId?: string;
  token?: string;
  paymentPageUrl?: string;
  signature?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  const user = await requireUser(req);
  if (!user) return fail('not_authenticated', 401);

  let orderId: string;
  try {
    orderId = String((await req.json()).order_id ?? '');
  } catch {
    return fail('invalid_request');
  }
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return fail('invalid_request');

  const db = adminClient();
  const { data: order, error } = await db
    .from('orders')
    .select('id, order_no, user_id, status, payment_method, total, branch:branches(name, address, district, city)')
    .eq('id', orderId)
    .single();
  if (error || !order || order.user_id !== user.id) return fail('order_not_found', 404);
  if (order.status !== 'awaiting_payment' || order.payment_method !== 'card') return fail('order_not_awaiting_payment', 409);

  const { data: profile } = await db.from('profiles').select('first_name, last_name, phone').eq('id', user.id).single();
  if (!profile?.phone) return fail('phone_required', 422);

  // deno-lint-ignore no-explicit-any
  const branch = order.branch as any;
  const fullName = `${profile.first_name} ${profile.last_name}`.trim();
  const pickupAddress = `Çeşme Kahve ${branch.name}${branch.address ? ', ' + branch.address : ''}, ${branch.district}`;
  const price = kurusToPrice(order.total);
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const callbackUrl = `${env('SUPABASE_URL')}/functions/v1/iyzico-callback`;

  const payload = {
    locale: 'tr',
    conversationId: order.id,
    price,
    paidPrice: price,
    currency: 'TRY',
    basketId: order.id,
    paymentGroup: 'PRODUCT',
    callbackUrl,
    enabledInstallments: [1],
    buyer: {
      id: user.id,
      name: profile.first_name,
      surname: profile.last_name || '-',
      gsmNumber: `+90${profile.phone}`,
      email: user.email,
      // iyzico requires a TC identity number; apps that do not collect it send the value agreed with iyzico.
      identityNumber: env('IYZICO_IDENTITY_NUMBER', '11111111111'),
      registrationAddress: pickupAddress,
      city: branch.city,
      country: 'Turkey',
      ...(forwardedFor ? { ip: forwardedFor } : {}),
    },
    shippingAddress: { contactName: fullName, city: branch.city, country: 'Turkey', address: pickupAddress },
    billingAddress: { contactName: fullName, city: branch.city, country: 'Turkey', address: pickupAddress },
    basketItems: [{
      id: `order-${order.order_no}`,
      name: `Çeşme Kahve sipariş #${order.order_no}`,
      category1: 'Yiyecek ve İçecek',
      itemType: 'PHYSICAL',
      price,
    }],
  };

  let res: InitResponse;
  try {
    res = await iyzicoPost<InitResponse>(CF_INITIALIZE, payload);
  } catch (e) {
    return fail('payment_provider_unavailable', 502, String(e));
  }
  if (res.status !== 'success' || !res.token || !res.paymentPageUrl) {
    return fail('payment_init_failed', 502, `${res.errorCode}: ${res.errorMessage}`);
  }
  if (!(await signatureMatches([res.conversationId, res.token], res.signature))) {
    return fail('payment_signature_invalid', 502, 'initialize signature mismatch');
  }

  const { error: tokenError } = await db.rpc('attach_payment_token', { p_order: order.id, p_token: res.token });
  if (tokenError) return fail('order_not_awaiting_payment', 409, tokenError.message);

  return json({ paymentPageUrl: res.paymentPageUrl });
});

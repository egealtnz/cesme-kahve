// iyzico posts the customer's browser here after the hosted payment page (form field "token").
// We fetch the result from iyzico ourselves, record it, and send the browser back to the app.
// Deployed with verify_jwt = false (see supabase/config.toml): iyzico does not send a Supabase session.
import { env } from '../_shared/http.ts';
import { adminClient } from '../_shared/supabase.ts';
import { type Outcome, settlePayment } from '../_shared/settle.ts';

function backToApp(orderId: string | null, outcome: Outcome): Response {
  const scheme = env('APP_SCHEME', 'cesmekahve');
  const target = `${scheme}://odeme-sonucu?status=${outcome}${orderId ? `&order=${orderId}` : ''}`;
  const message = outcome === 'success' ? 'Ödemen alındı.' : outcome === 'review' ? 'Ödemen kontrol ediliyor.' : 'Ödeme tamamlanamadı.';
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Çeşme Kahve</title><meta http-equiv="refresh" content="0;url=${target}"></head>
<body style="font-family:system-ui;background:#faf5ec;color:#00283e;text-align:center;padding:48px 24px">
<p style="font-size:18px">${message}</p><p><a href="${target}" style="color:#00283e;font-weight:600">Uygulamaya dön</a></p></body></html>`;
  return new Response(html, { status: 303, headers: { Location: target, 'Content-Type': 'text/html; charset=utf-8' } });
}

Deno.serve(async (req) => {
  let token = '';
  try {
    token = req.method === 'POST'
      ? String((await req.formData()).get('token') ?? '')
      : new URL(req.url).searchParams.get('token') ?? '';
  } catch {
    token = '';
  }
  if (!/^[A-Za-z0-9-]{8,100}$/.test(token)) return backToApp(null, 'error');

  const db = adminClient();
  const { data: order } = await db
    .from('orders').select('id, total, payment_status, iyzico_token').eq('iyzico_token', token).maybeSingle();
  if (!order) return backToApp(null, 'error');
  return backToApp(order.id, await settlePayment(db, order));
});

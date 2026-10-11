// Asks iyzico for a checkout result and records it on the order. Used by the browser callback and by
// the app's "check payment again" call, so both reach the same answer.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';
import { CF_RETRIEVE, iyzicoPost, normalizePrice, priceToKurus, signatureMatches } from './iyzico.ts';

export type Outcome = 'success' | 'failed' | 'review' | 'pending' | 'error';

type RetrieveResponse = {
  status: 'success' | 'failure';
  errorMessage?: string;
  paymentStatus?: string;
  paymentId?: string;
  currency?: string;
  basketId?: string;
  conversationId?: string;
  paidPrice?: number | string;
  price?: number | string;
  token?: string;
  fraudStatus?: number;
  signature?: string;
};

export type SettleOrder = { id: string; total: number; payment_status: string; iyzico_token: string | null };

export async function settlePayment(db: SupabaseClient, order: SettleOrder): Promise<Outcome> {
  if (order.payment_status === 'paid') return 'success';
  const token = order.iyzico_token;
  if (!token) return 'pending';

  let r: RetrieveResponse;
  try {
    r = await iyzicoPost<RetrieveResponse>(CF_RETRIEVE, { locale: 'tr', conversationId: order.id, token });
  } catch (e) {
    console.error('retrieve failed', order.id, String(e));
    return 'error';
  }
  if (r.status !== 'success') {
    // The result request itself failed, or the customer has not finished the form yet. We cannot tell
    // whether money was taken, so the order stays "awaiting payment"; the timeout job cleans up.
    console.warn('retrieve returned failure', order.id, r.errorMessage);
    return 'pending';
  }

  const signed = await signatureMatches(
    [r.paymentStatus, r.paymentId, r.currency, r.basketId, r.conversationId,
     r.paidPrice === undefined ? undefined : normalizePrice(r.paidPrice),
     r.price === undefined ? undefined : normalizePrice(r.price), r.token],
    r.signature,
  );
  if (!signed) {
    console.error('signature mismatch', order.id);
    return 'error';
  }
  if (r.paymentStatus !== 'SUCCESS') {
    await db.rpc('mark_order_payment_failed', { p_order: order.id });
    return 'failed';
  }

  const consistent = r.token === token && r.basketId === order.id && r.conversationId === order.id &&
    r.currency === 'TRY' && r.paidPrice !== undefined && priceToKurus(r.paidPrice) === order.total && !!r.paymentId;
  if (!consistent) {
    console.error('payment result does not match order', order.id);
    return 'error';
  }
  if (r.fraudStatus === 0) return 'review';
  if (r.fraudStatus === -1) {
    await db.rpc('mark_order_payment_failed', { p_order: order.id });
    return 'failed';
  }

  const { error } = await db.rpc('mark_order_paid', {
    p_order: order.id, p_payment_id: String(r.paymentId), p_paid_amount: priceToKurus(r.paidPrice!),
  });
  if (error) {
    console.error('mark_order_paid failed', order.id, error.message);
    return 'error';
  }
  return 'success';
}

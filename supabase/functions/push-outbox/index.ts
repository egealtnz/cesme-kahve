// Sends the messages waiting in push_outbox (owner offers, birthday coffees, "Seni özledik").
// Poked by the database whenever messages are added (pg_net). It only sends what the database put in the
// outbox, so calling it needs no session: the worst a caller can do is make waiting messages go out sooner.
// POST {} → { sent, messages }
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { adminClient } from '../_shared/supabase.ts';
import { sendPush, type PushMessage } from '../_shared/push.ts';

type OutboxRow = { id: number; user_id: string; title: string; body: string; data: Record<string, unknown>; channel: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  const db = adminClient();
  let sent = 0;
  let messages = 0;
  // A few batches per call; anything left is picked up by the next poke.
  for (let round = 0; round < 10; round++) {
    const { data, error } = await db.rpc('claim_push_outbox', { p_limit: 300 });
    if (error) return fail('outbox_failed', 500, error.message);
    const rows = (data ?? []) as OutboxRow[];
    if (!rows.length) break;
    messages += rows.length;

    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: tokens } = await db.from('push_tokens').select('token, user_id').in('user_id', userIds);
    const byUser = new Map<string, string[]>();
    for (const t of tokens ?? []) byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t.token]);

    const batch: PushMessage[] = [];
    for (const r of rows) {
      for (const to of byUser.get(r.user_id) ?? []) {
        batch.push({ to, title: r.title, body: r.body, data: r.data ?? {}, channelId: r.channel, priority: 'normal' });
      }
    }
    try {
      sent += await sendPush(db, batch);
    } catch (e) {
      console.error('push failed', e);
    }
  }
  return json({ sent, messages });
});

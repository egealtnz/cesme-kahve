// Sends push notifications through Expo's push service (which forwards them to FCM on Android and APNs on iOS).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
};

type Ticket = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };

/** Sends the messages and forgets tokens of apps that were uninstalled. Returns how many Expo accepted. */
export async function sendPush(db: SupabaseClient, messages: PushMessage[]): Promise<number> {
  if (!messages.length) return 0;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.Authorization = 'Bearer ' + accessToken;
  const url = Deno.env.get('EXPO_PUSH_URL') ?? 'https://exp.host/--/api/v2/push/send';

  let accepted = 0;
  // Expo accepts at most 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(batch) });
    const result = await res.json().catch(() => null);
    const tickets: Ticket[] = result?.data ?? [];
    tickets.forEach((t, j) => {
      if (t.status === 'ok') accepted++;
      else console.error('push ticket error', batch[j]?.to, t.message ?? t.details?.error);
    });
    const dead = tickets
      .map((t, j) => (t.details?.error === 'DeviceNotRegistered' ? batch[j]?.to : null))
      .filter((t): t is string => !!t);
    if (dead.length) await db.from('push_tokens').delete().in('token', dead);
  }
  return accepted;
}

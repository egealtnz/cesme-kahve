// Push notifications.
// - Android phones register their Firebase (FCM) token and are sent to through the FCM HTTP v1 API, signed
//   with the Firebase service account in the FCM_SERVICE_ACCOUNT secret.
// - iPhones register an Expo push token and are sent to through Expo's push service (which uses APNs).
// The Android message is "data only" in the format expo-notifications understands, so the app shows it in
// the right channel and reports taps with the same data on both platforms.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
};

const isExpoToken = (t: string) => /^Expo(nent)?PushToken\[/.test(t);

/** Sends the messages and forgets tokens of apps that were uninstalled. Returns how many were accepted. */
export async function sendPush(db: SupabaseClient, messages: PushMessage[]): Promise<number> {
  if (!messages.length) return 0;
  const expo = messages.filter((m) => isExpoToken(m.to));
  const fcm = messages.filter((m) => !isExpoToken(m.to));
  const results = await Promise.all([
    expo.length ? sendExpo(expo).catch((e) => (console.error('expo push failed', e), { accepted: 0, dead: [] as string[] })) : { accepted: 0, dead: [] as string[] },
    fcm.length ? sendFcm(fcm).catch((e) => (console.error('fcm push failed', e), { accepted: 0, dead: [] as string[] })) : { accepted: 0, dead: [] as string[] },
  ]);
  const dead = results.flatMap((r) => r.dead);
  if (dead.length) await db.from('push_tokens').delete().in('token', dead);
  return results.reduce((n, r) => n + r.accepted, 0);
}

// ---------------------------------------------------------------- Expo (iOS)
type Ticket = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };

async function sendExpo(messages: PushMessage[]) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.Authorization = 'Bearer ' + accessToken;
  const url = Deno.env.get('EXPO_PUSH_URL') ?? 'https://exp.host/--/api/v2/push/send';
  let accepted = 0;
  const dead: string[] = [];
  for (let i = 0; i < messages.length; i += 100) { // Expo takes at most 100 per request
    const batch = messages.slice(i, i + 100);
    const res = await fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify(batch.map((m) => ({ ...m, sound: 'default' }))),
    });
    const result = await res.json().catch(() => null);
    const tickets: Ticket[] = result?.data ?? [];
    tickets.forEach((t, j) => {
      if (t.status === 'ok') accepted++;
      else console.error('expo ticket error', t.message ?? t.details?.error);
      if (t.details?.error === 'DeviceNotRegistered' && batch[j]) dead.push(batch[j].to);
    });
  }
  return { accepted, dead };
}

// ---------------------------------------------------------------- FCM (Android)
type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };
let cachedToken: { value: string; expires: number } | null = null;

function serviceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) return null;
  try {
    const text = raw.trim().startsWith('{') ? raw : atob(raw.trim());
    const sa = JSON.parse(text);
    return sa.client_email && sa.private_key && sa.project_id ? sa : null;
  } catch {
    console.error('FCM_SERVICE_ACCOUNT is not valid JSON');
    return null;
  }
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = (s: string) => b64url(new TextEncoder().encode(s));

/** OAuth access token for FCM from the service account (signed JWT, cached for ~55 minutes). */
async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const tokenUrl = Deno.env.get('GOOGLE_TOKEN_URL') ?? sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64urlText(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: tokenUrl,
    iat: now,
    exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + b64url(signature) }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) throw new Error('google token request failed: ' + res.status + ' ' + JSON.stringify(json));
  cachedToken = { value: json.access_token, expires: Date.now() + (Number(json.expires_in) || 3600) * 1000 };
  return cachedToken.value;
}

async function sendFcm(messages: PushMessage[]) {
  const sa = serviceAccount();
  if (!sa) {
    console.error('FCM_SERVICE_ACCOUNT secret is not set; Android notifications are not sent');
    return { accepted: 0, dead: [] as string[] };
  }
  const token = await accessToken(sa);
  const base = Deno.env.get('FCM_API_URL') ?? 'https://fcm.googleapis.com';
  const url = base + '/v1/projects/' + encodeURIComponent(sa.project_id) + '/messages:send';
  const dead: string[] = [];
  const outcomes = await Promise.all(messages.map(async (m) => {
    const data: Record<string, string> = { title: m.title, message: m.body, body: JSON.stringify(m.data ?? {}) };
    if (m.channelId) data.channelId = m.channelId;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ message: { token: m.to, data, android: { priority: m.priority === 'normal' ? 'NORMAL' : 'HIGH' } } }),
    });
    if (res.ok) return true;
    const err = await res.json().catch(() => null);
    // deno-lint-ignore no-explicit-any
    const code = (err?.error?.details ?? []).map((d: any) => d.errorCode).find(Boolean) ?? err?.error?.status;
    if (code === 'UNREGISTERED') dead.push(m.to);
    else console.error('fcm send error', res.status, code, err?.error?.message);
    return false;
  }));
  return { accepted: outcomes.filter(Boolean).length, dead };
}

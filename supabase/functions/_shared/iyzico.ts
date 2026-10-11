// iyzico REST client: IYZWSv2 (HMAC-SHA256) request signing and response signature checks.
// Docs: https://docs.iyzico.com/en/getting-started/preliminaries/authentication/hmacsha256-auth
//       https://docs.iyzico.com/en/advanced/response-signature-validation
import { env } from './http.ts';

const enc = new TextEncoder();

export async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Builds the Authorization header value for a request. Exported for tests. */
export async function authorizationHeader(apiKey: string, secretKey: string, randomKey: string, path: string, body: string) {
  const signature = await hmacSha256Hex(secretKey, randomKey + path + body);
  return 'IYZWSv2 ' + btoa(`apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`);
}

/** iyzico wants prices like "190.5": strip trailing zeros before signing/comparing. */
export function normalizePrice(v: string | number): string {
  const s = typeof v === 'number' ? v.toFixed(8) : v;
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/** Kuruş → iyzico decimal string. */
export function kurusToPrice(kurus: number): string {
  return normalizePrice((kurus / 100).toFixed(2));
}

export function priceToKurus(v: string | number): number {
  return Math.round(Number(v) * 100);
}

export async function iyzicoPost<T = Record<string, unknown>>(path: string, payload: Record<string, unknown>): Promise<T> {
  const apiKey = env('IYZICO_API_KEY');
  const secretKey = env('IYZICO_SECRET_KEY');
  const base = env('IYZICO_BASE_URL', 'https://sandbox-api.iyzipay.com');
  const body = JSON.stringify(payload);
  const randomKey = `${Date.now()}${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const res = await fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: await authorizationHeader(apiKey, secretKey, randomKey, path, body),
      'x-iyzi-rnd': randomKey,
    },
    body,
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`iyzico ${res.status}: ${text.slice(0, 300)}`);
  }
}

/** True when iyzico's response signature matches the given fields (joined with ":"). */
export async function signatureMatches(fields: Array<string | number | undefined>, signature: unknown): Promise<boolean> {
  if (typeof signature !== 'string' || !signature) return false;
  const data = fields.map((f) => (f === undefined || f === null ? '' : String(f))).join(':');
  const expected = await hmacSha256Hex(env('IYZICO_SECRET_KEY'), data);
  return timingSafeEqual(expected, signature.toLowerCase());
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const CF_INITIALIZE = '/payment/iyzipos/checkoutform/initialize/auth/ecom';
export const CF_RETRIEVE = '/payment/iyzipos/checkoutform/auth/ecom/detail';

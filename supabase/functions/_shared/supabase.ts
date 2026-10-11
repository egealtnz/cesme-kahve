import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.117.2';
import { env } from './http.ts';

const url = () => env('SUPABASE_URL');
const anonKey = () => Deno.env.get('SUPABASE_ANON_KEY') ?? env('SUPABASE_PUBLISHABLE_KEY');
const serviceKey = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? env('SUPABASE_SECRET_KEY');

/** Client with full access. Only use after checking who the caller is. */
export function adminClient(): SupabaseClient {
  return createClient(url(), serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Client acting as the caller, so row level security and auth.uid() apply. */
export function userClient(req: Request): SupabaseClient {
  return createClient(url(), anonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
}

export async function requireUser(req: Request): Promise<User | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

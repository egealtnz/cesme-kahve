// Permanently deletes the caller's account (App Store 5.1.1(v), Google Play account deletion policy).
// Profile, stamps, free coffees and push tokens are deleted; orders are kept without the name for
// accounting records, as the privacy notice explains.
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { adminClient, requireUser } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  const user = await requireUser(req);
  if (!user) return fail('not_authenticated', 401);

  const db = adminClient();
  const { error: anonError } = await db.rpc('anonymize_user', { p_user: user.id });
  if (anonError) return fail('delete_failed', 500, anonError.message);

  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return fail('delete_failed', 500, error.message);
  return json({ ok: true });
});

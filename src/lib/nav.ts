import { router, type Href } from 'expo-router';

/** Only allow in-app paths as "next" targets after sign-in. */
export function goNext(next: string | undefined, fallback: Href = '/profile') {
  const safe = next && /^\/[a-z0-9/_-]*$/i.test(next) ? (next as Href) : fallback;
  router.dismissAll();
  router.replace(safe);
}

// Keeps the signed-in customer's profile language in step with the app (for push notifications).
import { useEffect } from 'react';
import { useAuth } from '@/state/auth';
import { useLang, saveProfileLocale } from '@/state/lang';

export function LocaleSync() {
  const { session } = useAuth();
  const { lang, ready } = useLang();
  const uid = session?.user.id;
  useEffect(() => {
    if (uid && ready) saveProfileLocale(lang);
  }, [uid, lang, ready]);
  return null;
}

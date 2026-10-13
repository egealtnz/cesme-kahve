// Holds the chosen language (stored on the device; the first time it follows the phone's language)
// and remounts the screens when it changes so every text is redrawn. Signed-in customers' choice is
// also saved on their profile so notifications arrive in the same language.
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLang, setCurrentLang, type Lang } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

const KEY = 'ck.lang';
type LangState = { lang: Lang; setLang: (l: Lang) => void; ready: boolean };
const LangContext = createContext<LangState>({ lang: 'tr', setLang: () => undefined, ready: true });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getLang());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'tr' || v === 'en') { setCurrentLang(v); setLangState(v); }
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const setLang = useCallback((l: Lang) => {
    setCurrentLang(l);
    setLangState(l);
    AsyncStorage.setItem(KEY, l).catch(() => undefined);
    saveProfileLocale(l);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, ready }), [lang, setLang, ready]);
  return (
    <LangContext.Provider value={value}>
      {ready ? <Fragment key={lang}>{children}</Fragment> : null}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);

/** Best effort: the profile keeps the language for push notifications. */
export function saveProfileLocale(l: Lang = getLang()) {
  supabase.auth.getSession()
    .then(({ data }) => {
      const id = data.session?.user.id;
      if (id) return supabase.from('profiles').update({ locale: l }).eq('id', id);
    })
    .catch(() => undefined);
}

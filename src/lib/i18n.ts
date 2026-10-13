// Customer-facing language: Turkish (default) or English. Text is written inline as pairs —
// L('Sepet', 'Cart') — so the Turkish stays readable in the code and nothing needs a key file.
// Changing the language remounts the app (see state/lang.tsx), so plain functions can read it too.
// Staff and owner screens stay in Turkish.
export type Lang = 'tr' | 'en';

let current: Lang = deviceLang();

export const getLang = (): Lang => current;
export const setCurrentLang = (l: Lang) => { current = l; };
export const isEn = () => current === 'en';

/** Pick the text for the current language. */
export const L = (tr: string, en: string): string => (current === 'en' ? en : tr);

/** Database content with an optional English column (product names, campaign texts…). */
export const loc = (tr: string, en?: string | null): string => (current === 'en' && en ? en : tr);
export const locN = (tr: string | null | undefined, en?: string | null): string | null => (current === 'en' && en ? en : tr ?? null);

/** Locale for dates and numbers. */
export const localeTag = () => (current === 'en' ? 'en-GB' : 'tr-TR');

export function deviceLang(): Lang {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    return tag.toLowerCase().startsWith('tr') ? 'tr' : 'en';
  } catch {
    return 'tr';
  }
}

import { L, localeTag } from './i18n';

/** Kuruş → "₺95" or "₺97,50" (Turkish formatting). */
export function tl(kurus: number): string {
  const lira = kurus / 100;
  const whole = kurus % 100 === 0;
  return '₺' + lira.toLocaleString(localeTag(), { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

export function trLower(s: string): string {
  return s.toLocaleLowerCase('tr-TR');
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 11) return L('Günaydın', 'Good morning');
  if (h >= 11 && h < 17) return L('İyi günler', 'Good afternoon');
  if (h >= 17 && h < 22) return L('İyi akşamlar', 'Good evening');
  return L('İyi geceler', 'Good evening');
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(localeTag(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' });
}

/** "5321234567" → "532 123 45 67" */
export function formatPhone(digits: string): string {
  const d = digits.slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean).join(' ');
}

/** Local calendar day of a timestamp, for grouping ("2026-10-12"). */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Bugün", "Dün" or "10 Ekim Cumartesi" (with the year when it is not this year). */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  if (diff === 0) return L('Bugün', 'Today');
  if (diff === 1) return L('Dün', 'Yesterday');
  return d.toLocaleDateString(localeTag(), {
    day: 'numeric', month: 'long', weekday: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** "12 Eki" */
export function dayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString(localeTag(), { day: 'numeric', month: 'short' });
}

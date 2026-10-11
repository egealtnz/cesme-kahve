/** Kuruş → "₺95" or "₺97,50" (Turkish formatting). */
export function tl(kurus: number): string {
  const lira = kurus / 100;
  const whole = kurus % 100 === 0;
  return '₺' + lira.toLocaleString('tr-TR', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

export function trLower(s: string): string {
  return s.toLocaleLowerCase('tr-TR');
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 11) return 'Günaydın';
  if (h >= 11 && h < 17) return 'İyi günler';
  if (h >= 17 && h < 22) return 'İyi akşamlar';
  return 'İyi geceler';
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

/** "5321234567" → "532 123 45 67" */
export function formatPhone(digits: string): string {
  const d = digits.slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean).join(' ');
}

// Opening hours, busy mode and pickup times. Turkey has used UTC+3 all year since 2016, so "Turkey time"
// is computed with a fixed offset (the database uses the Europe/Istanbul zone and agrees).
import type { Branch, OpeningHours } from './types';
import { isEn, L } from './i18n';

const TR_OFFSET_MS = 3 * 3600_000;
export const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'] as const;
const DAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
type DayKey = keyof OpeningHours;

/** Turkey-time parts of a moment: ISO weekday (1 = Monday) and minutes since midnight. */
function trParts(d: Date) {
  const t = new Date(d.getTime() + TR_OFFSET_MS);
  const dow = ((t.getUTCDay() + 6) % 7) + 1;
  return { dow, minutes: t.getUTCHours() * 60 + t.getUTCMinutes(), y: t.getUTCFullYear(), m: t.getUTCMonth(), day: t.getUTCDate() };
}
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
/** A Date for the given Turkey-time calendar day (offset in days from `base`) and minutes since midnight. */
function trDate(base: Date, dayOffset: number, minutes: number): Date {
  const p = trParts(base);
  return new Date(Date.UTC(p.y, p.m, p.day + dayOffset, 0, minutes) - TR_OFFSET_MS);
}

/** Same rules as public.branch_open_at in the database. */
export function isOpenAt(hours: OpeningHours | null | undefined, at: Date): boolean {
  if (!hours) return true;
  const { dow, minutes } = trParts(at);
  const today = hours[String(dow) as DayKey];
  if (today) {
    const o = toMin(today[0]), c = toMin(today[1]);
    if (c > o ? minutes >= o && minutes < c : minutes >= o) return true;
  }
  const prev = hours[String(dow === 1 ? 7 : dow - 1) as DayKey];
  if (prev) {
    const o = toMin(prev[0]), c = toMin(prev[1]);
    if (c <= o && minutes < c) return true;
  }
  return false;
}

/** Next moment the branch opens (searching a week ahead), or null if it never does. */
export function nextOpening(hours: OpeningHours | null | undefined, from: Date): Date | null {
  if (!hours) return from;
  for (let d = 0; d <= 7; d++) {
    const dow = ((trParts(from).dow - 1 + d) % 7) + 1;
    const h = hours[String(dow) as DayKey];
    if (!h) continue;
    const at = trDate(from, d, toMin(h[0]));
    if (at > from) return at;
  }
  return null;
}

export type BranchState = {
  /** can order for "as soon as possible" */
  orderNow: boolean;
  /** can order at all (now or later) */
  orderable: boolean;
  kind: 'open' | 'busy' | 'paused' | 'closed' | 'unavailable';
  waitMinutes: number;
  /** short Turkish label: "~8 dk", "Yoğun · ~23 dk", "Kapalı · 08:00'de açılır" */
  label: string;
  pausedUntil?: Date;
  opensAt?: Date | null;
};

export function busyExtra(b: Branch, now = new Date()): number {
  return b.busy_until && Date.parse(b.busy_until) > now.getTime() ? b.busy_extra_minutes ?? 0 : 0;
}

export function branchState(b: Branch, now = new Date()): BranchState {
  const wait = b.prep_minutes + busyExtra(b, now);
  if (b.status === 'coming_soon') return { orderNow: false, orderable: false, kind: 'unavailable', waitMinutes: wait, label: L('Yakında', 'Coming soon') };
  if (b.status !== 'open' || !b.accepts_orders) return { orderNow: false, orderable: false, kind: 'unavailable', waitMinutes: wait, label: L('Sipariş almıyor', 'Not taking orders') };
  if (b.paused_until && Date.parse(b.paused_until) > now.getTime()) {
    const until = new Date(b.paused_until);
    return { orderNow: false, orderable: true, kind: 'paused', waitMinutes: wait, pausedUntil: until, label: L(`Kısa ara · devam: ${clock(until)}`, `Short break · back at ${clock(until)}`) };
  }
  if (!isOpenAt(b.opening_hours, now)) {
    const opensAt = nextOpening(b.opening_hours, now);
    return {
      orderNow: false, orderable: !!opensAt, kind: 'closed', waitMinutes: wait, opensAt,
      label: opensAt ? L(`Kapalı · açılış: ${dayWord(opensAt, now)}${clock(opensAt)}`, `Closed · opens ${dayWord(opensAt, now)}${clock(opensAt)}`)
        : L('Kapalı', 'Closed'),
    };
  }
  const busy = busyExtra(b, now) > 0;
  return { orderNow: true, orderable: true, kind: busy ? 'busy' : 'open', waitMinutes: wait, label: busy ? L(`Yoğun · ~${wait} dk`, `Busy · ~${wait} min`) : L(`~${wait} dk`, `~${wait} min`) };
}

/** "08:00" in Turkey time */
export function clock(d: Date): string {
  const { minutes } = trParts(d);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** "" for today, "yarın " for tomorrow, "Cuma " otherwise (Turkey time). */
export function dayWord(d: Date, now = new Date()): string {
  const a = trParts(d), b = trParts(now);
  const diff = Math.round((Date.UTC(a.y, a.m, a.day) - Date.UTC(b.y, b.m, b.day)) / 86_400_000);
  if (diff === 0) return '';
  if (diff === 1) return L('yarın ', 'tomorrow ');
  return (isEn() ? DAY_NAMES_EN : DAY_NAMES)[a.dow - 1] + ' ';
}

/** "Bugün 15:30", "Yarın 09:15" */
export function pickupLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const w = dayWord(d, now);
  return `${w ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1) : L('Bugün ', 'Today ')}${clock(d)}`;
}

/**
 * Pickup times customers can choose: every 15 minutes, today and tomorrow, while the branch is open,
 * not during a pause, and at least the preparation time (plus a little margin) from now.
 */
export function pickupSlots(b: Branch, now = new Date()): { day: 0 | 1; at: Date }[] {
  const earliest = now.getTime() + (b.prep_minutes + busyExtra(b, now) + 5) * 60_000;
  const pausedUntil = b.paused_until ? Date.parse(b.paused_until) : 0;
  const out: { day: 0 | 1; at: Date }[] = [];
  for (const day of [0, 1] as const) {
    for (let m = 0; m < 24 * 60; m += 15) {
      const at = trDate(now, day, m);
      if (at.getTime() < earliest || at.getTime() < pausedUntil) continue;
      if (at.getTime() > now.getTime() + 2 * 86_400_000 - 3600_000) continue;
      if (!isOpenAt(b.opening_hours, at)) continue;
      out.push({ day, at });
    }
  }
  return out;
}

/** Scheduled orders show up in the "Yeni" column when it is time to start preparing them. */
export function isDueSoon(pickupAt: string | null | undefined, prepMinutes: number, now = new Date()): boolean {
  if (!pickupAt) return true;
  return Date.parse(pickupAt) <= now.getTime() + (prepMinutes + 10) * 60_000;
}

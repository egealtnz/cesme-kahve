// Order export for the accountant: a CSV file Excel opens directly (UTF-8 with BOM, ";" separators as Turkish
// Excel expects, decimal commas). On phones it opens the share sheet (Mail, Drive, WhatsApp…); on the web it downloads.
import { Platform } from 'react-native';
import type { Branch, CompanyStaff, ExportRow } from './types';

const STATUS: Record<string, string> = { collected: 'Teslim edildi', cancelled: 'İptal' };
const PAYMENT: Record<string, string> = { card: 'Kart', store: 'Kasada' };

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (kurus: number) => (kurus / 100).toFixed(2).replace('.', ',');
const trDateTime = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(Date.parse(iso) + 3 * 3600_000);   // Turkey time
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

export function ordersCsv(rows: ExportRow[]): string {
  const head = ['Sipariş no', 'Tarih', 'Teslim alma', 'Şube', 'Müşteri', 'Durum', 'Ödeme', 'Ara toplam (TL)', 'İndirim (TL)',
    'Toplam (TL)', 'Ürünler', 'Değerlendirme', 'Yorum', 'Hazırlayanlar'];
  const lines = rows.map((r) => [
    r.order_no, trDateTime(r.created_at), trDateTime(r.pickup_at), r.branch, r.customer, STATUS[r.status] ?? r.status,
    PAYMENT[r.payment] ?? r.payment, money(r.subtotal), money(r.discount), money(r.total), r.items,
    r.liked === null ? '' : r.liked ? 'Beğendi' : 'Beğenmedi', r.comment ?? '', r.handled_by ?? '',
  ].map(cell).join(';'));
  return '﻿' + [head.map(cell).join(';'), ...lines].join('\r\n');
}

const ROLE: Record<string, string> = { admin: 'Yönetici (tüm şubeler)', manager: 'Şube müdürü', barista: 'Barista' };

/** Staff list for the owner, branch by branch (managers first). Passwords are never stored readable, so none are listed. */
export function staffCsv(staff: CompanyStaff, branches: Pick<Branch, 'id' | 'name' | 'sort'>[]): string {
  const head = ['Şube', 'Görev', 'Ad Soyad', 'E-posta', 'Durum', 'Ekibe katılma', 'Son giriş', 'Giriş'];
  const signIn = 'E-posta + kendi belirlediği şifre (Şifremi unuttum ile yenilenir)';
  const nameOf = (id: string | null) => (id ? branches.find((b) => b.id === id)?.name ?? id : 'Tüm şubeler');
  const order = (id: string | null) => (id ? branches.find((b) => b.id === id)?.sort ?? 999 : -1);
  const rank = (r: string) => (r === 'admin' ? 0 : r === 'manager' ? 1 : 2);
  const rows = [
    ...staff.members.map((m) => ({ b: m.branch_id, r: m.role, cells: [nameOf(m.branch_id), ROLE[m.role],
      [m.first_name, m.last_name === '-' ? null : m.last_name].filter(Boolean).join(' '), m.email, 'Aktif',
      trDateTime(m.since), trDateTime(m.last_sign_in_at), signIn] })),
    ...staff.invites.map((i) => ({ b: i.branch_id, r: i.role, cells: [nameOf(i.branch_id), ROLE[i.role], '', i.email,
      'Davet bekliyor (üye olup e-postasını doğrulayınca katılır)', trDateTime(i.since), '', signIn] })),
  ].sort((x, y) => order(x.b) - order(y.b) || rank(x.r) - rank(y.r));
  return '\uFEFF' + [head.map(cell).join(';'), ...rows.map((x) => x.cells.map(cell).join(';'))].join('\r\n');
}

/** Saves the text as a file and hands it to the share sheet (phone) or downloads it (web). */
export async function shareTextFile(name: string, text: string, mimeType = 'text/csv'): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const { File, Paths } = await import('expo-file-system');
  const Sharing = await import('expo-sharing');
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name, UTI: mimeType === 'text/html' ? 'public.html' : 'public.comma-separated-values-text' });
}

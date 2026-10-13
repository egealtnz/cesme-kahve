// Order export for the accountant: a CSV file Excel opens directly (UTF-8 with BOM, ";" separators as Turkish
// Excel expects, decimal commas). On phones it opens the share sheet (Mail, Drive, WhatsApp…); on the web it downloads.
import { Platform } from 'react-native';
import type { ExportRow } from './types';

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
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name, UTI: 'public.comma-separated-values-text' });
}

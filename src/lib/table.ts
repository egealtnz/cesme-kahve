// Table QR codes. Each table carries "cesmekahve://masa?sube=<branch id>&no=<table>": the phone camera
// opens the app on /masa, and the in-app scanner reads the same text.
import type { Branch } from './types';

export const tableLink = (branchId: string, table: number | string) =>
  `cesmekahve://masa?sube=${encodeURIComponent(branchId)}&no=${encodeURIComponent(String(table))}`;

export function parseTableCode(raw: string): { branchId: string; table: string } | null {
  const text = raw.trim();
  const m = text.match(/[?&]sube=([^&#]+).*?[?&]no=([0-9]{1,3})/i) ?? text.match(/^CK-T:([a-z0-9-]+):([0-9]{1,3})$/i);
  if (!m) return null;
  return { branchId: decodeURIComponent(m[1]).toLowerCase(), table: String(Number(m[2])) };
}

/** Whether the branch serves this table now ("" when fine, otherwise the reason in Turkish/English pair keys). */
export function tableProblem(b: Branch | undefined, table: string): 'no_branch' | 'no_service' | 'no_table' | null {
  if (!b || b.status !== 'open') return 'no_branch';
  if (!b.table_count) return 'no_service';
  const n = Number(table);
  if (!Number.isInteger(n) || n < 1 || n > b.table_count) return 'no_table';
  return null;
}

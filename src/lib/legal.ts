import legal from '@/content/legal.json';
import type { Settings } from './types';

export type LegalDocId = keyof typeof legal.docs;
export type Block = [kind: 'h' | 'p' | 'li', text: string];

export function legalDoc(id: string) {
  return (legal.docs as Record<string, { title: string; updated: string; blocks: string[][] }>)[id];
}

/** Fills {company.*} and loyalty numbers into a legal text. */
export function fill(text: string, settings?: Settings): string {
  const company = { ...legal.company } as Record<string, string>;
  if (settings?.support_email) company.email = settings.support_email;
  if (settings?.support_phone) company.phone = settings.support_phone;
  return text
    .replace(/\{company\.(\w+)\}/g, (_, k) => company[k] ?? '')
    .replace('{stamps_per_reward}', String(settings?.stamps_per_reward ?? 10))
    .replace('{reward_valid_days}', String(settings?.reward_valid_days ?? 90));
}

export const LEGAL_BASE_URL = process.env.EXPO_PUBLIC_LEGAL_BASE_URL ?? 'https://www.cesmekahve.com/uygulama';

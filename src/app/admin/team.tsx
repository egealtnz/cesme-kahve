// Company panel: everyone who works for the company, branch by branch — managers, baristas, pending invites —
// with an Excel (CSV) download of the list. Adding and removing people happens on each branch's Ekip page.
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AlertTriangle, ChevronRight, Download, MailPlus } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Card, Divider, Screen, TopBar } from '@/components/Layout';
import { Stat } from '@/components/Admin';
import { useBranchesLive, useCompanyStaff } from '@/lib/api';
import { shareTextFile, staffCsv } from '@/lib/csv';
import { errorMessage } from '@/lib/errors';
import { dayMonth, shortDate } from '@/lib/format';
import type { CompanyStaffMember } from '@/lib/types';
import { useToast } from '@/state/toast';
import { color, radius, space } from '@/theme/tokens';

const ROLE = { admin: 'Yönetici', manager: 'Şube müdürü', barista: 'Barista' } as const;
const rank = (r: string) => (r === 'admin' ? 0 : r === 'manager' ? 1 : 2);

const nameOf = (m: CompanyStaffMember) =>
  [m.first_name, m.last_name === '-' ? null : m.last_name].filter(Boolean).join(' ').trim() || m.email.split('@')[0];

export default function AdminTeam() {
  const staff = useCompanyStaff();
  const branches = useBranchesLive();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const s = staff.data;

  const doExport = async () => {
    if (!s || !branches.data) return;
    setExporting(true);
    try {
      const day = new Date().toISOString().slice(0, 10);
      await shareTextFile(`cesme-kahve-personel-${day}.csv`, staffCsv(s, branches.data));
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const admins = s?.members.filter((m) => m.role === 'admin') ?? [];
  const managers = s?.members.filter((m) => m.role === 'manager').length ?? 0;
  const baristas = s?.members.filter((m) => m.role === 'barista').length ?? 0;

  return (
    <Screen>
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>Ekip</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>
        Tüm şubelerin çalışanları. Kişi eklemek ya da çıkarmak için şubeye dokun. Şifreler kimseye görünmez; herkes kendi
        şifresiyle girer, unutursa “Şifremi unuttum” ile yeniler.
      </Txt>

      {staff.isLoading || branches.isLoading ? <ActivityIndicator color={color.ink} style={{ marginTop: space[6] }} /> : null}
      {staff.isError ? <Txt variant="bodySm" color="error" style={{ marginTop: space[4] }}>{errorMessage(staff.error)}</Txt> : null}

      {s && branches.data ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[4] }}>
            <Stat label="Şube müdürü" value={String(managers)} />
            <Stat label="Barista" value={String(baristas)} />
            <Stat label="Yönetici" value={String(admins.length)} />
            <Stat label="Bekleyen davet" value={String(s.invites.length)} />
          </View>
          <Button label="Excel'e aktar (CSV)" icon={Download} variant="secondary" size="md" loading={exporting} onPress={doExport}
            style={{ marginTop: space[3] }} />

          <Section title="Yönetim (tüm şubeler)">
            {admins.map((m, i) => <Person key={m.user_id} m={m} first={i === 0} />)}
          </Section>

          {branches.data.map((b) => {
            const people = s.members.filter((m) => m.branch_id === b.id).sort((x, y) => rank(x.role) - rank(y.role) || nameOf(x).localeCompare(nameOf(y), 'tr'));
            const invites = s.invites.filter((x) => x.branch_id === b.id);
            const noManager = b.status === 'open' && !people.some((m) => m.role === 'manager') && !invites.some((x) => x.role === 'manager');
            return (
              <Section key={b.id} title={b.name} sub={b.status === 'coming_soon' ? 'Yakında' : `${people.length} kişi`}
                onPress={() => router.push({ pathname: '/staff/team', params: { branch: b.id } })}>
                {people.length === 0 && invites.length === 0 ? (
                  <View style={styles.warn}>
                    {noManager ? <AlertTriangle size={16} color={color.warning} strokeWidth={1.75} /> : null}
                    <Txt variant="bodySm" color="inkMuted" style={{ flex: 1 }}>Henüz kimse yok{noManager ? ' · şube müdürü atanmadı' : ''}</Txt>
                  </View>
                ) : noManager ? (
                  <View style={[styles.warn, { paddingBottom: 0 }]}>
                    <AlertTriangle size={16} color={color.warning} strokeWidth={1.75} />
                    <Txt variant="caption" style={{ flex: 1 }}>Şube müdürü atanmadı</Txt>
                  </View>
                ) : null}
                {people.map((m, i) => <Person key={m.user_id} m={m} first={i === 0} />)}
                {invites.map((inv, i) => (
                  <View key={inv.email}>
                    {people.length + i > 0 ? <Divider /> : null}
                    <View style={styles.row}>
                      <View style={[styles.avatar, { backgroundColor: color.warningSoft }]}><MailPlus size={18} color={color.warning} strokeWidth={1.75} /></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt variant="body" numberOfLines={1}>{inv.email}</Txt>
                        <Txt variant="caption" color="inkMuted">{ROLE[inv.role]} · davet {shortDate(inv.since)} · üye olması bekleniyor</Txt>
                      </View>
                    </View>
                  </View>
                ))}
              </Section>
            );
          })}
          <View style={{ height: space[8] }} />
        </>
      ) : null}
    </Screen>
  );
}

function Section({ title, sub, onPress, children }: { title: string; sub?: string; onPress?: () => void; children: ReactNode }) {
  return (
    <View style={{ marginTop: space[6] }}>
      <Pressable accessibilityRole={onPress ? 'button' : 'header'} accessibilityLabel={onPress ? `${title} ekibini yönet` : title}
        disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.sectionHead, pressed && { opacity: 0.7 }]}>
        <Txt variant="h5" style={{ flex: 1 }}>{title}</Txt>
        {sub ? <Txt variant="caption" color="inkMuted">{sub}</Txt> : null}
        {onPress ? <><Txt variant="label" color="secondaryInk">Yönet</Txt><ChevronRight size={16} color={color.secondaryInk} strokeWidth={1.75} /></> : null}
      </Pressable>
      <Card style={{ paddingVertical: 0, marginTop: space[2] }}>{children}</Card>
    </View>
  );
}

function Person({ m, first }: { m: CompanyStaffMember; first: boolean }) {
  const n = nameOf(m).split(/\s+/).filter(Boolean);
  const initials = ((n[0]?.[0] ?? '') + (n[1]?.[0] ?? '')).toLocaleUpperCase('tr-TR') || '?';
  return (
    <View>
      {first ? null : <Divider />}
      <View style={styles.row}>
        <View style={styles.avatar}><Txt variant="label">{initials}</Txt></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="body" numberOfLines={1}>{nameOf(m)}{m.is_me ? '  (sen)' : ''}</Txt>
          <Txt variant="caption" color="inkMuted" numberOfLines={1} selectable>{m.email}</Txt>
          <Txt variant="caption" color="inkMuted">
            {m.last_sign_in_at ? `son giriş ${dayMonth(m.last_sign_in_at)}` : 'henüz giriş yapmadı'} · ekipte {shortDate(m.since)}
          </Txt>
        </View>
        <Badge tone={m.role === 'barista' ? 'neutral' : 'fresh'} icon={null} label={ROLE[m.role]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 36 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] },
  avatar: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: color.secondarySoft, alignItems: 'center', justifyContent: 'center' },
  warn: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[3] },
});

// Branch team: managers add and remove their branch's baristas by email; admins also assign managers.
// Someone without an account yet gets an invite that turns into staff access once they sign up and
// confirm that email address (enforced in the database, see migration …_branch_team.sql).
import { useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { MailPlus, UserMinus, UserPlus } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Field } from '@/components/Field';
import { Card, Divider, Screen, TopBar } from '@/components/Layout';
import { addBranchStaff, cancelBranchInvite, canManageBranch, removeBranchStaff, useBranchTeam, useCatalogue } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { shortDate } from '@/lib/format';
import type { TeamInvite, TeamMember } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { useToast } from '@/state/toast';
import { color, radius, space } from '@/theme/tokens';

const ROLE_LABEL = { barista: 'Barista', manager: 'Şube müdürü', admin: 'Yönetici' } as const;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function StaffTeam() {
  const { branch } = useLocalSearchParams<{ branch: string }>();
  const { staff } = useAuth();
  const { data: cat } = useCatalogue();
  const team = useBranchTeam(branch);
  const qc = useQueryClient();
  const toast = useToast();
  const isAdmin = staff.some((s) => s.role === 'admin');

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'barista' | 'manager'>('barista');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null); // user id or invite email awaiting a second tap
  const [busy, setBusy] = useState<string | null>(null);

  if (!branch || !canManageBranch(staff, branch)) return <Redirect href="/staff" />;
  const branchName = cat?.branches.find((b) => b.id === branch)?.name ?? '';
  const refresh = () => qc.invalidateQueries({ queryKey: ['team', branch] });

  const add = async () => {
    const value = email.trim().toLowerCase();
    if (!EMAIL.test(value)) { setEmailError('Geçerli bir e-posta adresi yaz.'); return; }
    setEmailError(undefined);
    setAdding(true);
    try {
      const status = await addBranchStaff(branch, value, isAdmin ? role : 'barista');
      Keyboard.dismiss();
      setEmail('');
      toast(status === 'invited'
        ? 'Davet kaydedildi. Bu e-postayla üye olup doğruladığında ekibe katılır.'
        : status === 'updated' ? 'Görevi güncellendi.' : 'Ekibe eklendi. Uygulamayı bir sonraki açışında Şube sekmesini görür.');
      await refresh();
    } catch (e) {
      setEmailError(errorMessage(e));
    } finally {
      setAdding(false);
    }
  };

  const remove = async (m: TeamMember) => {
    setBusy(m.user_id);
    try {
      await removeBranchStaff(branch, m.user_id);
      toast(`${displayName(m)} ekipten çıkarıldı.`);
      await refresh();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  const cancelInvite = async (i: TeamInvite) => {
    setBusy(i.email);
    try {
      await cancelBranchInvite(branch, i.email);
      toast('Davet geri alındı.');
      await refresh();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  const canRemove = (m: TeamMember) => !m.is_me && (m.role === 'barista' || isAdmin);
  const members = team.data?.members ?? [];
  const invites = team.data?.invites ?? [];

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <TopBar back />
      <Txt variant="overline" color="secondaryInk" style={{ marginTop: space[5] }}>{branchName}</Txt>
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>Ekip</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>
        {isAdmin
          ? 'Şubeye barista ya da şube müdürü ekle. Müdürler kendi şubelerinin baristalarını yönetebilir.'
          : 'Şubene barista ekle ya da çıkar. Baristalar sipariş kuyruğunu, QR okutmayı ve tükenenleri kullanır.'}
      </Txt>

      <Card style={{ marginTop: space[5], gap: space[4] }}>
        <Field
          label="E-posta"
          value={email}
          onChangeText={(t) => { setEmail(t); if (emailError) setEmailError(undefined); }}
          placeholder="ornek@eposta.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          inputMode="email"
          returnKeyType="done"
          onSubmitEditing={add}
          error={emailError}
          hint="Hesabı yoksa davet bekler; bu e-postayla üye olup doğruladığında otomatik eklenir."
        />
        {isAdmin ? (
          <View style={styles.segment} accessibilityRole="radiogroup">
            {(['barista', 'manager'] as const).map((r) => (
              <Pressable key={r} accessibilityRole="radio" accessibilityState={{ checked: role === r }} onPress={() => setRole(r)}
                style={[styles.segmentItem, role === r && styles.segmentOn]}>
                <Txt variant="label" color={role === r ? 'ink' : 'inkMuted'}>{ROLE_LABEL[r]}</Txt>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Button label={isAdmin && role === 'manager' ? 'Müdür olarak ekle' : 'Ekibe ekle'} icon={UserPlus}
          loading={adding} onPress={add} full />
      </Card>

      <View style={styles.sectionHead}>
        <Txt variant="h4" accessibilityRole="header">Ekip</Txt>
        <View style={styles.count}><Txt variant="label">{members.length}</Txt></View>
      </View>
      {team.isLoading ? <ActivityIndicator color={color.ink} style={{ marginTop: space[4] }} /> : null}
      {team.isError ? (
        <Txt variant="bodySm" color="error" style={{ marginTop: space[2] }}>{errorMessage(team.error)}</Txt>
      ) : null}
      {!team.isLoading && !team.isError && members.length === 0 ? (
        <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>Bu şubede henüz kimse yok.</Txt>
      ) : null}
      {members.length ? (
        <Card style={{ paddingVertical: 0, marginTop: space[3] }}>
          {members.map((m, i) => (
            <View key={m.user_id}>
              {i > 0 ? <Divider /> : null}
              <View style={styles.row}>
                <View style={styles.avatar}><Txt variant="label">{initials(m)}</Txt></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="body" numberOfLines={1}>{displayName(m)}{m.is_me ? '  (sen)' : ''}</Txt>
                  <Txt variant="caption" color="inkMuted" numberOfLines={1}>{m.email}</Txt>
                </View>
                <Badge tone={m.role === 'manager' ? 'fresh' : 'neutral'} icon={null} label={ROLE_LABEL[m.role]} />
              </View>
              {canRemove(m) ? (
                confirming === m.user_id ? (
                  <View style={styles.confirm}>
                    <Txt variant="bodySm" style={{ flex: 1 }}>{displayName(m)} ekipten çıkarılsın mı?</Txt>
                    <Button label="Vazgeç" variant="secondary" size="sm" onPress={() => setConfirming(null)} />
                    <Button label="Çıkar" variant="danger" size="sm" loading={busy === m.user_id} onPress={() => remove(m)} />
                  </View>
                ) : (
                  <Pressable accessibilityRole="button" accessibilityLabel={`${displayName(m)} kişisini ekipten çıkar`}
                    onPress={() => setConfirming(m.user_id)} style={styles.removeLink} hitSlop={8}>
                    <UserMinus size={16} color={color.error} strokeWidth={1.75} />
                    <Txt variant="label" color="error">Ekipten çıkar</Txt>
                  </Pressable>
                )
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      {invites.length ? (
        <>
          <View style={styles.sectionHead}>
            <Txt variant="h4" accessibilityRole="header">Bekleyen davetler</Txt>
            <View style={styles.count}><Txt variant="label">{invites.length}</Txt></View>
          </View>
          <Card style={{ paddingVertical: 0, marginTop: space[3] }}>
            {invites.map((inv, i) => (
              <View key={inv.email}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.row}>
                  <View style={[styles.avatar, { backgroundColor: color.warningSoft }]}>
                    <MailPlus size={18} color={color.warning} strokeWidth={1.75} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="body" numberOfLines={1}>{inv.email}</Txt>
                    <Txt variant="caption" color="inkMuted">{ROLE_LABEL[inv.role]} · {shortDate(inv.since)} · üye olması bekleniyor</Txt>
                  </View>
                </View>
                {inv.role === 'barista' || isAdmin ? (
                  confirming === inv.email ? (
                    <View style={styles.confirm}>
                      <Txt variant="bodySm" style={{ flex: 1 }}>Davet geri alınsın mı?</Txt>
                      <Button label="Vazgeç" variant="secondary" size="sm" onPress={() => setConfirming(null)} />
                      <Button label="Geri al" variant="danger" size="sm" loading={busy === inv.email} onPress={() => cancelInvite(inv)} />
                    </View>
                  ) : (
                    <Pressable accessibilityRole="button" accessibilityLabel={`${inv.email} davetini geri al`}
                      onPress={() => setConfirming(inv.email)} style={styles.removeLink} hitSlop={8}>
                      <UserMinus size={16} color={color.error} strokeWidth={1.75} />
                      <Txt variant="label" color="error">Daveti geri al</Txt>
                    </Pressable>
                  )
                ) : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Txt variant="caption" color="inkMuted" style={{ marginTop: space[6], marginBottom: space[8] }}>
        Ekipten çıkarılan kişinin müşteri hesabı ve kahve kartı aynen kalır; yalnızca Şube ekranına erişimi kapanır ve
        yeni sipariş bildirimleri durur.
      </Txt>
    </Screen>
  );
}

function displayName(m: TeamMember): string {
  const name = [m.first_name, m.last_name === '-' ? null : m.last_name].filter(Boolean).join(' ').trim();
  return name || m.email.split('@')[0];
}

function initials(m: TeamMember): string {
  const n = displayName(m).split(/\s+/).filter(Boolean);
  return ((n[0]?.[0] ?? '') + (n[1]?.[0] ?? '')).toLocaleUpperCase('tr-TR') || '?';
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', padding: 4, borderRadius: radius.full, backgroundColor: color.surfaceMuted },
  segmentItem: { flex: 1, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: color.surface, boxShadow: '0px 1px 3px rgba(0, 40, 62, 0.12)' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[6] },
  count: { minWidth: 28, height: 28, paddingHorizontal: 8, borderRadius: radius.full, backgroundColor: color.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingTop: space[3], paddingBottom: space[2] },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.secondarySoft, alignItems: 'center', justifyContent: 'center' },
  removeLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginLeft: 52, paddingBottom: space[3], minHeight: 32 },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingBottom: space[3], marginLeft: 52 },
});

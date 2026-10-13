import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Megaphone, Save } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { ToggleRow } from '@/components/Controls';
import { Card, Screen, TopBar } from '@/components/Layout';
import { BranchList } from '@/components/BranchList';
import { updateProfile, useCatalogue } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatPhone } from '@/lib/format';
import { useAuth } from '@/state/auth';
import { useToast } from '@/state/toast';
import type { Profile } from '@/lib/types';
import { color, space } from '@/theme/tokens';
import { L } from '@/lib/i18n';

export default function EditAccount() {
  const { session, profile } = useAuth();
  if (!session) return <Redirect href="/auth/sign-in" />;
  if (!profile) {
    return <Screen><TopBar back /><ActivityIndicator color={color.ink} style={{ marginTop: space[10] }} /></Screen>;
  }
  // Keyed so the form starts from the saved profile once and is not reset by background refetches.
  return <EditForm key={profile.id} profile={profile} />;
}

function EditForm({ profile }: { profile: Profile }) {
  const { userId, email } = useAuth();
  const { data: cat } = useCatalogue();
  const qc = useQueryClient();
  const toast = useToast();
  const [first, setFirst] = useState(profile.first_name);
  const [last, setLast] = useState(profile.last_name);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [favorite, setFavorite] = useState<string | null>(profile.favorite_branch_id);
  const [marketing, setMarketing] = useState(profile.marketing_opt_in);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (first.trim().length < 2 || last.trim().length < 2) { setError(L('Adını ve soyadını yaz.', 'Enter your first and last name.')); return; }
    if (phone && !/^5\d{9}$/.test(phone)) { setError(L('5 ile başlayan 10 haneli cep numaranı yaz.', 'Enter a 10-digit Turkish mobile number starting with 5.')); return; }
    setBusy(true);
    try {
      await updateProfile(userId!, {
        first_name: first.trim(), last_name: last.trim(), phone: phone || null, favorite_branch_id: favorite, marketing_opt_in: marketing,
      });
      await qc.invalidateQueries({ queryKey: ['profile', userId] });
      toast('Bilgilerin kaydedildi.');
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<View style={{ gap: space[2] }}>{error ? <Txt variant="bodySm" color="error">{error}</Txt> : null}<Button label={L('Kaydet', 'Save')} icon={Save} loading={busy} onPress={save} /></View>}>
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>{L('Hesap bilgileri', 'Account details')}</Txt>
      <View style={{ gap: space[5], marginTop: space[6] }}>
        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <View style={{ flex: 1 }}><Field label={L('Ad', 'First name')} value={first} onChangeText={setFirst} autoComplete="given-name" /></View>
          <View style={{ flex: 1 }}><Field label={L('Soyad', 'Last name')} value={last} onChangeText={setLast} autoComplete="family-name" /></View>
        </View>
        <Field label={L('E-posta', 'Email')} value={email ?? ''} editable={false} hint={L('E-posta adresini değiştirmek için bize yaz.', 'Write to us to change your email address.')} />
        <Field label={L('Cep telefonu', 'Turkish mobile number')} optional prefix="+90" value={formatPhone(phone)} keyboardType="number-pad" autoComplete="tel-national"
          onChangeText={(t) => setPhone(t.replace(/\D/g, '').replace(/^0/, '').slice(0, 10))} />
        <Card style={{ padding: 0 }}>
          <ToggleRow icon={Megaphone} tone="soft" title={L('Kampanya bildirimleri', 'Offers')} body={L('E-posta ve SMS ile fırsatlardan haberdar ol. İstediğin zaman kapatabilirsin.', 'Hear about offers by email and SMS. Turn it off any time.')}
            value={marketing} onChange={setMarketing} />
        </Card>
        <Txt variant="h4" accessibilityRole="header" style={{ marginTop: space[2] }}>{L('Favori şube', 'Favourite branch')}</Txt>
        <Txt variant="bodySm" color="inkMuted" style={{ marginTop: -space[3] }}>{L('Siparişlerinde bu şube önceden seçili gelir.', 'This branch is preselected for your orders.')}</Txt>
        {cat ? <BranchList branches={cat.branches} selectedId={favorite} onSelect={(b) => setFavorite(b.id === favorite ? null : b.id)} /> : null}
      </View>
    </Screen>
  );
}

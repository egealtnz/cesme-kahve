import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen, TopBar } from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { space } from '@/theme/tokens';

export default function Forgot() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { setError('Geçerli bir e-posta adresi yaz.'); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(e);
    setBusy(false);
    if (err) { setError(errorMessage({ code: err.code, message: err.message })); return; }
    router.replace({ pathname: '/auth/reset', params: { email: e } });
  };

  return (
    <Screen>
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>Şifreni sıfırla</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>Hesabının e-posta adresini yaz, sana 6 haneli bir kod gönderelim.</Txt>
      <View style={{ gap: space[5], marginTop: space[6] }}>
        <Field label="E-posta" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
          autoComplete="email" textContentType="emailAddress" error={error ?? undefined} onSubmitEditing={submit} />
        <Button label="Kod gönder" loading={busy} onPress={submit} />
      </View>
    </Screen>
  );
}

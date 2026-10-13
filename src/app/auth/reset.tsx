import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen, TopBar } from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { goNext } from '@/lib/nav';
import { useToast } from '@/state/toast';
import { space } from '@/theme/tokens';
import { DemoNote } from '@/components/Demo';
import { L } from '@/lib/i18n';

export default function Reset() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const submit = async () => {
    setError(null);
    if (code.length !== 6) { setError(L('E-postadaki 6 haneli kodu yaz.', 'Enter the 6-digit code from the email.')); return; }
    if (password.length < 8 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) || !/\d/.test(password)) {
      setError(L('Yeni şifren en az 8 karakter olmalı, harf ve rakam içermeli.', 'Your new password must be at least 8 characters with letters and numbers.')); return;
    }
    setBusy(true);
    const { error: e1 } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
    if (e1) { setBusy(false); setError(errorMessage({ code: e1.code ?? 'otp_expired', message: e1.message })); return; }
    const { error: e2 } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (e2) { setError(errorMessage({ code: e2.code, message: e2.message })); return; }
    toast(L('Şifren güncellendi.', 'Your password was updated.'));
    goNext('/profile');
  };

  return (
    <Screen>
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>{L('Yeni şifre', 'New password')}</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>{L(`${email} adresine gönderdiğimiz kodu ve yeni şifreni yaz.`, `Enter the code we sent to ${email} and your new password.`)}</Txt>
      <View style={{ gap: space[5], marginTop: space[6] }}>
        <DemoNote>{L('Önizlemede e-posta gönderilmez. Kod: 123456', 'No emails in the preview. Code: 123456')}</DemoNote>
        <Field label={L('Kod', 'Code')} value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad"
          autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} />
        <Field label={L('Yeni şifre', 'New password')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password"
          textContentType="newPassword" hint={L('En az 8 karakter, harf ve rakam.', 'At least 8 characters, letters and numbers.')} />
        {error ? <Txt variant="bodySm" color="error" accessibilityLiveRegion="polite">{error}</Txt> : null}
        <Button label={L('Şifremi güncelle', 'Update password')} loading={busy} onPress={submit} />
      </View>
    </Screen>
  );
}

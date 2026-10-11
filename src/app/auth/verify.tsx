import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen, TopBar } from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { goNext } from '@/lib/nav';
import { useToast } from '@/state/toast';
import { color, space } from '@/theme/tokens';
import { DemoNote } from '@/components/Demo';

/** The confirmation e-mail carries a 6-digit code (supabase/templates/confirmation.html). */
export default function Verify() {
  const { email, next } = useLocalSearchParams<{ email: string; next?: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(60);
  const toast = useToast();

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async (value = code) => {
    if (value.length !== 6) { setError('E-postadaki 6 haneli kodu yaz.'); return; }
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.verifyOtp({ email, token: value, type: 'signup' });
    setBusy(false);
    if (e) { setError(errorMessage({ code: e.code ?? 'otp_expired', message: e.message })); return; }
    toast('Hesabın hazır. Hoş geldin!');
    goNext(next);
  };

  return (
    <Screen>
      <TopBar back />
      <View style={{ alignItems: 'center', marginTop: space[8], gap: space[3] }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: color.secondarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <MailCheck size={32} color={color.ink} strokeWidth={1.75} />
        </View>
        <Txt variant="h2" center accessibilityRole="header">E-postanı doğrula</Txt>
        <Txt variant="body" color="inkMuted" center style={{ maxWidth: 320 }}>
          <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }}>{email}</Txt> adresine 6 haneli bir kod gönderdik.
        </Txt>
      </View>
      <View style={{ gap: space[4], marginTop: space[6] }}>
        <DemoNote>Önizlemede e-posta gönderilmez. Kod: 123456</DemoNote>
        <Field
          label="Doğrulama kodu"
          value={code}
          onChangeText={(t) => {
            const d = t.replace(/\D/g, '').slice(0, 6);
            setCode(d);
            if (d.length === 6) submit(d);
          }}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          placeholder="••••••"
          maxLength={6}
          error={error ?? undefined}
          style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center', fontFamily: 'DMSans-Bold' }}
        />
        <Button label="Doğrula" loading={busy} onPress={() => submit()} />
        <Button
          label={wait > 0 ? `Yeni kod iste (${wait})` : 'Yeni kod iste'}
          variant="tertiary"
          size="md"
          disabled={wait > 0}
          style={{ alignSelf: 'center' }}
          onPress={async () => {
            const { error: e } = await supabase.auth.resend({ type: 'signup', email });
            if (e) toast(errorMessage({ code: e.code, message: e.message }));
            else { toast('Yeni kod gönderildi.'); setWait(60); }
          }}
        />
        <Txt variant="caption" color="inkMuted" center>E-posta gelmediyse gereksiz/spam klasörüne bak.</Txt>
      </View>
    </Screen>
  );
}

import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Eye, EyeOff, LogIn } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen, TopBar } from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { goNext } from '@/lib/nav';
import { color, space } from '@/theme/tokens';
import { DemoNote } from '@/components/Demo';
import { DEMO_CUSTOMER, DEMO_STAFF } from '@/lib/demo/constants';

export default function SignIn() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) { setError('E-posta ve şifreni yaz.'); return; }
    setBusy(true);
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (e) {
      if (e.code === 'email_not_confirmed') {
        await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase() });
        router.push({ pathname: '/auth/verify', params: { email: email.trim().toLowerCase(), next } });
        return;
      }
      setError(errorMessage({ code: e.code ?? 'invalid_credentials', message: e.message }));
      return;
    }
    goNext(next);
  };

  return (
    <Screen>
      <TopBar back />
      <Txt variant="overline" color="secondaryInk" style={{ marginTop: space[5] }}>Hoş geldin</Txt>
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>Giriş yap</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>Siparişlerin, damgaların ve hediye kahvelerin hesabında.</Txt>
      <View style={{ gap: space[5], marginTop: space[6] }}>
        <DemoNote actions={<>
          <Button label="Müşteri hesabı" variant="secondary" size="sm" onPress={() => { setEmail(DEMO_CUSTOMER.email); setPassword(DEMO_CUSTOMER.password); }} />
          <Button label="Barista hesabı" variant="secondary" size="sm" onPress={() => { setEmail(DEMO_STAFF.email); setPassword(DEMO_STAFF.password); }} />
        </>}>
          Örnek hesaplardan birini seçip “Giriş yap”a dokun. Barista hesabı Alaçatı şubesinin ekranını açar. Şifre: demo1234
        </DemoNote>
        <Field label="E-posta" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
          autoComplete="email" textContentType="emailAddress" placeholder="ad@ornek.com" />
        <Field
          label="Şifre"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={submit}
          right={
            <Pressable accessibilityRole="button" accessibilityLabel={show ? 'Şifreyi gizle' : 'Şifreyi göster'} onPress={() => setShow(!show)}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              {show ? <EyeOff size={20} color={color.inkMuted} /> : <Eye size={20} color={color.inkMuted} />}
            </Pressable>
          }
        />
        {error ? <Txt variant="bodySm" color="error" accessibilityLiveRegion="polite">{error}</Txt> : null}
        <Button label="Giriş yap" icon={LogIn} loading={busy} onPress={submit} />
        <Button label="Şifremi unuttum" variant="tertiary" size="md" style={{ alignSelf: 'center' }}
          onPress={() => router.push({ pathname: '/auth/forgot', params: { email } })} />
      </View>
      <View style={{ marginTop: space[8], alignItems: 'center', gap: space[3] }}>
        <Txt variant="bodySm" color="inkMuted">Hesabın yok mu?</Txt>
        <Button label="Üye ol" variant="secondary" size="md" onPress={() => router.replace({ pathname: '/auth/sign-up', params: { next } })} />
      </View>
    </Screen>
  );
}

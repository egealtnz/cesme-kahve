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
import { DEMO_CUSTOMER, DEMO_MANAGER, DEMO_OWNER, DEMO_STAFF } from '@/lib/demo/constants';
import { L } from '@/lib/i18n';

export default function SignIn() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) { setError(L('E-posta ve şifreni yaz.', 'Enter your email and password.')); return; }
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
      <Txt variant="overline" color="secondaryInk" style={{ marginTop: space[5] }}>{L('Hoş geldin', 'Welcome')}</Txt>
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>{L('Giriş yap', 'Sign in')}</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>{L('Siparişlerin, damgaların ve hediye kahvelerin hesabında.', 'Your orders, stamps and free coffees live in your account.')}</Txt>
      <View style={{ gap: space[5], marginTop: space[6] }}>
        <DemoNote actions={<>
          <Button label={L('Müşteri hesabı', 'Customer')} variant="secondary" size="sm" onPress={() => { setEmail(DEMO_CUSTOMER.email); setPassword(DEMO_CUSTOMER.password); }} />
          <Button label={L('Barista hesabı', 'Barista')} variant="secondary" size="sm" onPress={() => { setEmail(DEMO_STAFF.email); setPassword(DEMO_STAFF.password); }} />
          <Button label={L('Müdür hesabı', 'Manager')} variant="secondary" size="sm" onPress={() => { setEmail(DEMO_MANAGER.email); setPassword(DEMO_MANAGER.password); }} />
          <Button label={L('İşletme sahibi', 'Owner')} variant="secondary" size="sm" onPress={() => { setEmail(DEMO_OWNER.email); setPassword(DEMO_OWNER.password); }} />
        </>}>
          {L('Örnek hesaplardan birini seçip “Giriş yap”a dokun. Barista ve müdür Alaçatı şubesini görür, müdür ekibi de yönetir; işletme sahibi tüm şubeleri, satış raporunu ve menüyü yönetir. Şifre: demo1234',
             'Pick a sample account and tap “Sign in”. The barista and manager see the Alaçatı branch (the manager also runs the team); the owner runs every branch, sales and the menu. Password: demo1234')}
        </DemoNote>
        <Field label={L('E-posta', 'Email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
          autoComplete="email" textContentType="emailAddress" placeholder={L('ad@ornek.com', 'name@example.com')} />
        <Field
          label={L('Şifre', 'Password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={submit}
          right={
            <Pressable accessibilityRole="button" accessibilityLabel={show ? L('Şifreyi gizle', 'Hide password') : L('Şifreyi göster', 'Show password')} onPress={() => setShow(!show)}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              {show ? <EyeOff size={20} color={color.inkMuted} /> : <Eye size={20} color={color.inkMuted} />}
            </Pressable>
          }
        />
        {error ? <Txt variant="bodySm" color="error" accessibilityLiveRegion="polite">{error}</Txt> : null}
        <Button label={L('Giriş yap', 'Sign in')} icon={LogIn} loading={busy} onPress={submit} />
        <Button label={L('Şifremi unuttum', 'Forgot password')} variant="tertiary" size="md" style={{ alignSelf: 'center' }}
          onPress={() => router.push({ pathname: '/auth/forgot', params: { email } })} />
      </View>
      <View style={{ marginTop: space[8], alignItems: 'center', gap: space[3] }}>
        <Txt variant="bodySm" color="inkMuted">{L('Hesabın yok mu?', 'No account yet?')}</Txt>
        <Button label={L('Üye ol', 'Sign up')} variant="secondary" size="md" onPress={() => router.replace({ pathname: '/auth/sign-up', params: { next } })} />
      </View>
    </Screen>
  );
}

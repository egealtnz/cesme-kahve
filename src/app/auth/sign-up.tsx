import { useMemo, useRef, useState } from 'react';
import { Pressable, View, type TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Bell, Check, Circle, Coffee, Eye, EyeOff, Receipt, UserPlus } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { CheckRow } from '@/components/Controls';
import { Card, Screen, TopBar } from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatPhone } from '@/lib/format';
import { goNext } from '@/lib/nav';
import { useCatalogue } from '@/lib/api';
import { color, space } from '@/theme/tokens';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LETTER = /[A-Za-zÇĞİÖŞÜçğıöşü]/;

type Values = { firstName: string; lastName: string; email: string; phone: string; password: string; birthday: string; terms: boolean; marketing: boolean };

function validate(v: Values) {
  const e: Partial<Record<keyof Values, string>> = {};
  if (v.firstName.trim().length < 2) e.firstName = 'Adını yaz.';
  if (v.lastName.trim().length < 2) e.lastName = 'Soyadını yaz.';
  if (!EMAIL_RE.test(v.email.trim())) e.email = 'Geçerli bir e-posta adresi yaz, örneğin ad@ornek.com.';
  if (!/^5\d{9}$/.test(v.phone)) e.phone = '5 ile başlayan 10 haneli cep numaranı yaz.';
  if (v.password.length < 8 || !LETTER.test(v.password) || !/\d/.test(v.password)) e.password = 'Şifren en az 8 karakter olmalı, harf ve rakam içermeli.';
  if (v.birthday && !/^\d{2}\.\d{2}\.\d{4}$/.test(v.birthday)) e.birthday = 'GG.AA.YYYY biçiminde yaz, örneğin 14.03.1995.';
  if (!v.terms) e.terms = 'Devam etmek için üyelik koşullarını onayla.';
  return e;
}

/** "14.03.1995" → "1995-03-14" (or null if not a real past date). */
function toIsoDate(tr: string): string | null {
  const m = tr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) || d > new Date() ? null : iso;
}

export default function SignUp() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { data: cat } = useCatalogue();
  const [v, setV] = useState<Values>({ firstName: '', lastName: '', email: '', phone: '', password: '', birthday: '', terms: false, marketing: false });
  const [submitted, setSubmitted] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const errors = useMemo(() => validate(v), [v]);
  const err = (k: keyof Values) => (submitted ? errors[k] : undefined);
  const set = <K extends keyof Values>(k: K) => (val: Values[K]) => setV((p) => ({ ...p, [k]: val }));
  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    setSubmitted(true);
    setServerError(null);
    if (Object.keys(errors).length) return;
    const birthday = v.birthday ? toIsoDate(v.birthday) : null;
    if (v.birthday && !birthday) { setServerError('Doğum tarihini kontrol et.'); return; }
    setBusy(true);
    const email = v.email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: v.password,
      options: {
        data: {
          first_name: v.firstName.trim(),
          last_name: v.lastName.trim(),
          phone: v.phone,
          birthday,
          marketing_opt_in: v.marketing,
          terms_accepted: v.terms,
          privacy_notice_ack: true,
        },
      },
    });
    setBusy(false);
    if (error) { setServerError(errorMessage({ code: error.code, message: error.message })); return; }
    if (data.session) goNext(next);
    else router.replace({ pathname: '/auth/verify', params: { email, next } });
  };

  const pwRules = [
    { ok: v.password.length >= 8, label: 'En az 8 karakter' },
    { ok: LETTER.test(v.password) && /\d/.test(v.password), label: 'Harf ve rakam' },
  ];
  const perReward = cat?.settings.stamps_per_reward ?? 10;

  return (
    <Screen>
      <TopBar back />
      <Txt variant="overline" color="secondaryInk" style={{ marginTop: space[5] }}>Üyelik</Txt>
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>Üye ol</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>Bir dakikada hesabını oluştur; damgaların ve siparişlerin seninle gelsin.</Txt>

      <Card tone="soft" style={{ marginTop: space[5], gap: space[2] }}>
        {[
          { icon: Coffee, text: `${perReward} kahvede bir kahve bizden` },
          { icon: Bell, text: 'Siparişin hazır olunca bildirim' },
          { icon: Receipt, text: 'Siparişlerin hesabında saklanır' },
        ].map(({ icon: Icon, text }) => (
          <View key={text} style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={18} color={color.ink} strokeWidth={1.75} />
            </View>
            <Txt variant="bodySm">{text}</Txt>
          </View>
        ))}
      </Card>

      <View style={{ gap: space[5], marginTop: space[6] }}>
        <Txt variant="h4" accessibilityRole="header">Bilgilerin</Txt>
        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <View style={{ flex: 1 }}>
            <Field label="Ad" value={v.firstName} onChangeText={set('firstName')} error={err('firstName')} autoComplete="given-name"
              textContentType="givenName" returnKeyType="next" onSubmitEditing={() => lastNameRef.current?.focus()} />
          </View>
          <View style={{ flex: 1 }}>
            <Field ref={lastNameRef} label="Soyad" value={v.lastName} onChangeText={set('lastName')} error={err('lastName')} autoComplete="family-name"
              textContentType="familyName" returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} />
          </View>
        </View>
        <Field ref={emailRef} label="E-posta" value={v.email} onChangeText={set('email')} error={err('email')} keyboardType="email-address"
          autoCapitalize="none" autoComplete="email" textContentType="emailAddress" placeholder="ad@ornek.com" returnKeyType="next"
          onSubmitEditing={() => phoneRef.current?.focus()} />
        <Field ref={phoneRef} label="Cep telefonu" prefix="+90" value={formatPhone(v.phone)} keyboardType="number-pad" autoComplete="tel-national"
          textContentType="telephoneNumber" placeholder="5XX XXX XX XX" error={err('phone')}
          hint="Kartla ödeme ve sipariş bildirimleri için gerekir."
          onChangeText={(t) => set('phone')(t.replace(/\D/g, '').replace(/^0/, '').slice(0, 10))} />
        <View style={{ gap: space[2] }}>
          <Field
            ref={passwordRef}
            label="Şifre"
            value={v.password}
            onChangeText={set('password')}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder="En az 8 karakter"
            error={err('password')}
            right={
              <Pressable accessibilityRole="button" accessibilityLabel={show ? 'Şifreyi gizle' : 'Şifreyi göster'} onPress={() => setShow(!show)}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                {show ? <EyeOff size={20} color={color.inkMuted} /> : <Eye size={20} color={color.inkMuted} />}
              </Pressable>
            }
          />
          {!err('password') ? (
            <View style={{ flexDirection: 'row', gap: space[4] }}>
              {pwRules.map((r) => (
                <View key={r.label} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  {r.ok ? <Check size={16} color={color.success} /> : <Circle size={16} color={color.inkMuted} />}
                  <Txt variant="bodySm" color={r.ok ? 'success' : 'inkMuted'}>{r.label}</Txt>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <Field label="Doğum tarihi" optional value={v.birthday} placeholder="GG.AA.YYYY" keyboardType="number-pad" error={err('birthday')}
          hint="Doğum gününü kutlayabilmemiz için."
          onChangeText={(t) => {
            const d = t.replace(/\D/g, '').slice(0, 8);
            set('birthday')([d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('.'));
          }} />

        <Card style={{ gap: space[2] }}>
          <CheckRow checked={v.terms} onChange={set('terms')} error={err('terms')}>
            <Txt variant="bodySm">
              <Txt variant="bodySm" style={{ fontFamily: 'DMSans-SemiBold', textDecorationLine: 'underline' }} onPress={() => router.push('/legal/kullanim-kosullari')}>Üyelik ve Kullanım Koşulları</Txt>
              ’nı okudum, kabul ediyorum.
            </Txt>
          </CheckRow>
          <Txt variant="caption" color="inkMuted" style={{ marginLeft: 32 }}>
            Kişisel verilerin{' '}
            <Txt variant="caption" color="ink" style={{ textDecorationLine: 'underline' }} onPress={() => router.push('/legal/kvkk')}>KVKK Aydınlatma Metni</Txt>
            {' '}kapsamında işlenir.
          </Txt>
          <CheckRow checked={v.marketing} onChange={set('marketing')}>
            <Txt variant="bodySm">
              Kampanya ve fırsatlardan e-posta ve SMS ile haberdar olmak istiyorum{' '}
              <Txt variant="bodySm" style={{ textDecorationLine: 'underline' }} onPress={() => router.push('/legal/ticari-ileti')}>(Ticari Elektronik İleti Onayı)</Txt>.{' '}
              <Txt variant="bodySm" color="inkMuted">İsteğe bağlı.</Txt>
            </Txt>
          </CheckRow>
        </Card>

        {serverError ? <Txt variant="bodySm" color="error" accessibilityLiveRegion="polite">{serverError}</Txt> : null}
        {submitted && Object.keys(errors).length ? (
          <Txt variant="bodySm" color="error" accessibilityLiveRegion="polite">Kırmızı ile işaretli alanları kontrol et.</Txt>
        ) : null}
        <Button label="Üye ol" icon={UserPlus} loading={busy} onPress={submit} />
        <View style={{ alignItems: 'center', gap: space[2] }}>
          <Txt variant="bodySm" color="inkMuted">Zaten üye misin?</Txt>
          <Button label="Giriş yap" variant="tertiary" size="md" onPress={() => router.replace({ pathname: '/auth/sign-in', params: { next } })} />
        </View>
      </View>
    </Screen>
  );
}

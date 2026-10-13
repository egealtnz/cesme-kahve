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
import { L } from '@/lib/i18n';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LETTER = /[A-Za-zÇĞİÖŞÜçğıöşü]/;

type Values = { firstName: string; lastName: string; email: string; phone: string; password: string; birthday: string; terms: boolean; marketing: boolean };

function validate(v: Values) {
  const e: Partial<Record<keyof Values, string>> = {};
  if (v.firstName.trim().length < 2) e.firstName = L('Adını yaz.', 'Enter your first name.');
  if (v.lastName.trim().length < 2) e.lastName = L('Soyadını yaz.', 'Enter your last name.');
  if (!EMAIL_RE.test(v.email.trim())) e.email = L('Geçerli bir e-posta adresi yaz, örneğin ad@ornek.com.', 'Enter a valid email address, e.g. name@example.com.');
  if (v.phone && !/^5\d{9}$/.test(v.phone)) e.phone = L('5 ile başlayan 10 haneli cep numaranı yaz.', 'Enter a 10-digit Turkish mobile number starting with 5, or leave it empty.');
  if (v.password.length < 8 || !LETTER.test(v.password) || !/\d/.test(v.password)) e.password = L('Şifren en az 8 karakter olmalı, harf ve rakam içermeli.', 'Your password must be at least 8 characters with letters and numbers.');
  if (v.birthday && !/^\d{2}\.\d{2}\.\d{4}$/.test(v.birthday)) e.birthday = L('GG.AA.YYYY biçiminde yaz, örneğin 14.03.1995.', 'Use DD.MM.YYYY, e.g. 14.03.1995.');
  if (!v.terms) e.terms = L('Devam etmek için üyelik koşullarını onayla.', 'Accept the membership terms to continue.');
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
    if (v.birthday && !birthday) { setServerError(L('Doğum tarihini kontrol et.', 'Check your date of birth.')); return; }
    setBusy(true);
    const email = v.email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: v.password,
      options: {
        data: {
          first_name: v.firstName.trim(),
          last_name: v.lastName.trim(),
          phone: v.phone || null,
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
    { ok: v.password.length >= 8, label: L('En az 8 karakter', 'At least 8 characters') },
    { ok: LETTER.test(v.password) && /\d/.test(v.password), label: L('Harf ve rakam', 'Letters and numbers') },
  ];
  const perReward = cat?.settings.stamps_per_reward ?? 10;

  return (
    <Screen>
      <TopBar back />
      <Txt variant="overline" color="secondaryInk" style={{ marginTop: space[5] }}>{L('Üyelik', 'Membership')}</Txt>
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>{L('Üye ol', 'Sign up')}</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>{L('Bir dakikada hesabını oluştur; damgaların ve siparişlerin seninle gelsin.', 'Create your account in a minute; your stamps and orders go with you.')}</Txt>

      <Card tone="soft" style={{ marginTop: space[5], gap: space[2] }}>
        {[
          { icon: Coffee, text: L(`${perReward} kahvede bir kahve bizden`, `Every ${perReward}th coffee is on us`) },
          { icon: Bell, text: L('Siparişin hazır olunca bildirim', 'A notification when your order is ready') },
          { icon: Receipt, text: L('Siparişlerin hesabında saklanır', 'Your orders are kept in your account') },
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
        <Txt variant="h4" accessibilityRole="header">{L('Bilgilerin', 'Your details')}</Txt>
        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <View style={{ flex: 1 }}>
            <Field label={L('Ad', 'First name')} value={v.firstName} onChangeText={set('firstName')} error={err('firstName')} autoComplete="given-name"
              textContentType="givenName" returnKeyType="next" onSubmitEditing={() => lastNameRef.current?.focus()} />
          </View>
          <View style={{ flex: 1 }}>
            <Field ref={lastNameRef} label={L('Soyad', 'Last name')} value={v.lastName} onChangeText={set('lastName')} error={err('lastName')} autoComplete="family-name"
              textContentType="familyName" returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} />
          </View>
        </View>
        <Field ref={emailRef} label={L('E-posta', 'Email')} value={v.email} onChangeText={set('email')} error={err('email')} keyboardType="email-address"
          autoCapitalize="none" autoComplete="email" textContentType="emailAddress" placeholder={L('ad@ornek.com', 'name@example.com')} returnKeyType="next"
          onSubmitEditing={() => phoneRef.current?.focus()} />
        <Field ref={phoneRef} label={L('Cep telefonu', 'Turkish mobile number')} optional prefix="+90" value={formatPhone(v.phone)} keyboardType="number-pad" autoComplete="tel-national"
          textContentType="telephoneNumber" placeholder="5XX XXX XX XX" error={err('phone')}
          hint={L('Kartla ödeme için gerekir.', 'Needed only to pay by card in the app.')}
          onChangeText={(t) => set('phone')(t.replace(/\D/g, '').replace(/^0/, '').slice(0, 10))} />
        <View style={{ gap: space[2] }}>
          <Field
            ref={passwordRef}
            label={L('Şifre', 'Password')}
            value={v.password}
            onChangeText={set('password')}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder={L('En az 8 karakter', 'At least 8 characters')}
            error={err('password')}
            right={
              <Pressable accessibilityRole="button" accessibilityLabel={show ? L('Şifreyi gizle', 'Hide password') : L('Şifreyi göster', 'Show password')} onPress={() => setShow(!show)}
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
        <Field label={L('Doğum tarihi', 'Date of birth')} optional value={v.birthday} placeholder={L('GG.AA.YYYY', 'DD.MM.YYYY')} keyboardType="number-pad" error={err('birthday')}
          hint={L('Doğum gününü kutlayabilmemiz için.', 'So we can treat you on your birthday.')}
          onChangeText={(t) => {
            const d = t.replace(/\D/g, '').slice(0, 8);
            set('birthday')([d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('.'));
          }} />

        <Card style={{ gap: space[2] }}>
          <CheckRow checked={v.terms} onChange={set('terms')} error={err('terms')}>
            <Txt variant="bodySm">
              <Txt variant="bodySm" style={{ fontFamily: 'DMSans-SemiBold', textDecorationLine: 'underline' }} onPress={() => router.push('/legal/kullanim-kosullari')}>{L('Üyelik ve Kullanım Koşulları', 'Membership and Terms of Use')}</Txt>
              {L('’nı okudum, kabul ediyorum.', ': I have read and accept them.')}
            </Txt>
          </CheckRow>
          <Txt variant="caption" color="inkMuted" style={{ marginLeft: 32 }}>
            {L('Kişisel verilerin', 'Your personal data is processed under the')}{' '}
            <Txt variant="caption" color="ink" style={{ textDecorationLine: 'underline' }} onPress={() => router.push('/legal/kvkk')}>{L('KVKK Aydınlatma Metni', 'KVKK data notice')}</Txt>
            {' '}{L('kapsamında işlenir.', '(in Turkish).')}
          </Txt>
          <CheckRow checked={v.marketing} onChange={set('marketing')}>
            <Txt variant="bodySm">
              {L('Kampanya ve fırsatlardan e-posta ve SMS ile haberdar olmak istiyorum', 'I would like to hear about offers by email and SMS')}{' '}
              <Txt variant="bodySm" style={{ textDecorationLine: 'underline' }} onPress={() => router.push('/legal/ticari-ileti')}>{L('(Ticari Elektronik İleti Onayı)', '(commercial message consent)')}</Txt>.{' '}
              <Txt variant="bodySm" color="inkMuted">{L('İsteğe bağlı.', 'Optional.')}</Txt>
            </Txt>
          </CheckRow>
        </Card>

        {serverError ? <Txt variant="bodySm" color="error" accessibilityLiveRegion="polite">{serverError}</Txt> : null}
        {submitted && Object.keys(errors).length ? (
          <Txt variant="bodySm" color="error" accessibilityLiveRegion="polite">{L('Kırmızı ile işaretli alanları kontrol et.', 'Check the fields marked in red.')}</Txt>
        ) : null}
        <Button label={L('Üye ol', 'Sign up')} icon={UserPlus} loading={busy} onPress={submit} />
        <View style={{ alignItems: 'center', gap: space[2] }}>
          <Txt variant="bodySm" color="inkMuted">{L('Zaten üye misin?', 'Already a member?')}</Txt>
          <Button label={L('Giriş yap', 'Sign in')} variant="tertiary" size="md" onPress={() => router.replace({ pathname: '/auth/sign-in', params: { next } })} />
        </View>
      </View>
    </Screen>
  );
}

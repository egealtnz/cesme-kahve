// Owner: rules that apply to every branch — loyalty card, automatic discounts, birthday coffee, win-back.
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Cake, Coffee, HeartHandshake, Percent, Recycle } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { ToggleRow } from '@/components/Controls';
import { Card, Screen, TopBar } from '@/components/Layout';
import { Chips } from '@/components/Admin';
import { saveSettings, useCatalogue } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { Settings } from '@/lib/types';
import { useToast } from '@/state/toast';
import { color, space } from '@/theme/tokens';

export default function AdminSettings() {
  const { data: cat } = useCatalogue();
  if (!cat) return <Screen><TopBar back /></Screen>;
  return <SettingsForm settings={cat.settings} />;
}

function SettingsForm({ settings: s }: { settings: Settings }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [stamps, setStamps] = useState(s.stamps_per_reward);
  const [second, setSecond] = useState(s.second_coffee_active);
  const [secondPct, setSecondPct] = useState(s.second_coffee_pct);
  const [cup, setCup] = useState(String(s.own_cup_discount / 100));
  const [birthday, setBirthday] = useState(s.birthday_reward_enabled ?? true);
  const [birthdayDays, setBirthdayDays] = useState(s.birthday_reward_days ?? 14);
  const [winback, setWinback] = useState(s.winback_enabled ?? false);
  const [winbackDays, setWinbackDays] = useState(s.winback_after_days ?? 30);
  const [winbackTitle, setWinbackTitle] = useState(s.winback_title ?? 'Seni özledik ☕');
  const [winbackBody, setWinbackBody] = useState(s.winback_body ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const cupTl = Number(cup.replace(',', '.'));
    if (!Number.isFinite(cupTl) || cupTl < 0 || cupTl > 500) { setError('Kendi bardağın indirimini ₺ olarak yaz (0 = kapalı).'); return; }
    if (winback && (!winbackTitle.trim() || !winbackBody.trim())) { setError('“Seni özledik” başlığını ve mesajını yaz.'); return; }
    setError(null);
    setSaving(true);
    try {
      await saveSettings({
        stamps_per_reward: stamps, second_coffee_active: second, second_coffee_pct: secondPct,
        own_cup_discount: Math.round(cupTl * 100),
        birthday_reward_enabled: birthday, birthday_reward_days: birthdayDays,
        winback_enabled: winback, winback_after_days: winbackDays, winback_title: winbackTitle.trim(), winback_body: winbackBody.trim(),
      });
      await qc.invalidateQueries({ queryKey: ['catalogue'] });
      toast('Ayarlar kaydedildi.');
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen keyboardShouldPersistTaps="handled" footer={
      <View style={{ gap: space[2] }}>
        {error ? <Txt variant="bodySm" color="error">{error}</Txt> : null}
        <Button label="Kaydet" loading={saving} onPress={save} />
      </View>
    }>
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>Ayarlar</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>Tüm şubeler için geçerlidir.</Txt>

      <Txt variant="h5" accessibilityRole="header" style={{ marginTop: space[6], marginBottom: space[2] }}>Kahve kartı</Txt>
      <Card style={{ gap: space[3] }}>
        <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
          <Coffee size={20} color={color.ink} strokeWidth={1.75} />
          <Txt variant="body" style={{ flex: 1 }}>Kaç kahvede bir hediye?</Txt>
        </View>
        <Chips options={[5, 6, 8, 10, 12].map((n) => ({ value: n, label: `${n}` }))} value={stamps} onChange={setStamps} label="Damga sayısı" />
      </Card>

      <Txt variant="h5" accessibilityRole="header" style={{ marginTop: space[6], marginBottom: space[2] }}>Otomatik indirimler</Txt>
      <Card style={{ gap: space[4] }}>
        <ToggleRow icon={Percent} tone="soft" title="İkinci kahve indirimi" body="Sepetteki her iki kahveden ucuz olanına uygulanır." value={second} onChange={setSecond} />
        {second ? <Chips options={[20, 30, 50].map((n) => ({ value: n, label: `%${n}` }))} value={secondPct} onChange={setSecondPct} label="İndirim oranı" /> : null}
        <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
          <Recycle size={20} color={color.ink} strokeWidth={1.75} style={{ marginTop: 34 }} />
          <View style={{ flex: 1 }}>
            <Field label="Kendi bardağını getirene indirim" value={cup} onChangeText={setCup} keyboardType="decimal-pad" prefix="₺"
              hint="0 yazarsan seçenek sepette görünmez." />
          </View>
        </View>
      </Card>

      <Txt variant="h5" accessibilityRole="header" style={{ marginTop: space[6], marginBottom: space[2] }}>Müşteriyle bağ</Txt>
      <Card style={{ gap: space[4] }}>
        <ToggleRow icon={Cake} tone="soft" title="Doğum günü kahvesi"
          body="Doğum gününü yazan müşteriye o sabah bir hediye kahve ve bildirim gider (yılda bir)." value={birthday} onChange={setBirthday} />
        {birthday ? (
          <View style={{ gap: space[2] }}>
            <Txt variant="caption" color="inkMuted">Kullanma süresi</Txt>
            <Chips options={[7, 14, 30].map((n) => ({ value: n, label: `${n} gün` }))} value={birthdayDays} onChange={setBirthdayDays} label="Kullanma süresi" />
          </View>
        ) : null}
        <ToggleRow icon={HeartHandshake} tone="soft" title="“Seni özledik” bildirimi"
          body="Kampanya iletisine izin veren ve bir süredir sipariş vermeyen müşterilere bir kez hatırlatma gider." value={winback} onChange={setWinback} />
        {winback ? (
          <View style={{ gap: space[3] }}>
            <Txt variant="caption" color="inkMuted">Kaç gün sipariş vermeyince?</Txt>
            <Chips options={[14, 30, 45, 60].map((n) => ({ value: n, label: `${n} gün` }))} value={winbackDays} onChange={setWinbackDays} label="Gün" />
            <Field label="Başlık" value={winbackTitle} onChangeText={setWinbackTitle} maxLength={60} />
            <Field label="Mesaj" value={winbackBody} onChangeText={setWinbackBody} maxLength={180} multiline style={{ minHeight: 64, textAlignVertical: 'top', paddingTop: 12 }} />
          </View>
        ) : null}
      </Card>
      <View style={{ height: space[8] }} />
    </Screen>
  );
}

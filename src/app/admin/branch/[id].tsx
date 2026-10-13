// Owner: one branch — open/closed, app orders, preparation time, opening hours per weekday, team.
import { useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, Printer, ShoppingBag, Users, Utensils } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Field } from '@/components/Field';
import { shareTextFile } from '@/lib/csv';
import { tableSheetHtml } from '@/lib/tableSheet';
import { Button } from '@/components/Button';
import { ToggleRow } from '@/components/Controls';
import { Card, Divider, Screen, TopBar } from '@/components/Layout';
import { Chips, NavRow } from '@/components/Admin';
import { saveBranch, useBranchesLive } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { DAY_NAMES } from '@/lib/hours';
import type { Branch, OpeningHours } from '@/lib/types';
import { useToast } from '@/state/toast';
import { color, font, radius, space } from '@/theme/tokens';

type Day = keyof OpeningHours;
const DAYS: Day[] = ['1', '2', '3', '4', '5', '6', '7'];
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const PREP = [3, 5, 6, 8, 10, 12, 15, 20, 30].map((m) => ({ value: m, label: `${m} dk` }));

export default function AdminBranch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const branches = useBranchesLive();
  const branch = branches.data?.find((b) => b.id === id);
  if (!branch) return <Screen><TopBar back /></Screen>;
  return <BranchForm key={branch.id} branch={branch} />;
}

function BranchForm({ branch }: { branch: Branch }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState(branch.status);
  const [accepts, setAccepts] = useState(branch.accepts_orders);
  const [prep, setPrep] = useState(branch.prep_minutes);
  const [tables, setTables] = useState(branch.table_count ?? 0);
  const [tableText, setTableText] = useState(String(branch.table_count || 20));
  const [limited, setLimited] = useState(!!branch.opening_hours);
  const [hours, setHours] = useState<Record<Day, { open: boolean; from: string; to: string }>>(() => {
    const h = branch.opening_hours ?? {};
    return Object.fromEntries(DAYS.map((d) => [d, { open: branch.opening_hours ? !!h[d] : true, from: h[d]?.[0] ?? '08:00', to: h[d]?.[1] ?? '22:00' }])) as never;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setDay = (d: Day, patch: Partial<{ open: boolean; from: string; to: string }>) => setHours((h) => ({ ...h, [d]: { ...h[d], ...patch } }));
  const copyMonday = () => setHours((h) => Object.fromEntries(DAYS.map((d) => [d, { ...h['1'] }])) as never);

  const save = async () => {
    let opening: OpeningHours | null = null;
    if (limited) {
      opening = {};
      for (const d of DAYS) {
        const x = hours[d];
        if (!x.open) continue;
        if (!TIME.test(x.from) || !TIME.test(x.to)) { setError(`${DAY_NAMES[Number(d) - 1]}: saatleri SS:DD biçiminde yaz (ör. 08:00).`); return; }
        if (x.from === x.to) { setError(`${DAY_NAMES[Number(d) - 1]}: açılış ve kapanış aynı olamaz.`); return; }
        opening[d] = [x.from, x.to];
      }
    }
    setError(null);
    setSaving(true);
    try {
      await saveBranch(branch.id, { status, accepts_orders: accepts, prep_minutes: prep, opening_hours: opening, table_count: tables });
      await Promise.all([qc.invalidateQueries({ queryKey: ['branches-live'] }), qc.invalidateQueries({ queryKey: ['catalogue'] })]);
      toast('Şube kaydedildi.');
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
      <Txt variant="overline" color="secondaryInk" style={{ marginTop: space[5] }}>{branch.district} · {branch.city}</Txt>
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>{branch.name}</Txt>

      <Txt variant="label" style={{ marginTop: space[5], marginBottom: space[2] }}>Durum</Txt>
      <Chips options={[{ value: 'open' as const, label: 'Açık' }, { value: 'coming_soon' as const, label: 'Yakında' }, { value: 'closed' as const, label: 'Kapalı' }]}
        value={status} onChange={setStatus} label="Şube durumu" />

      <Card style={{ marginTop: space[4], gap: space[4] }}>
        <ToggleRow icon={ShoppingBag} tone="soft" title="Uygulamadan sipariş al" body="Kapatınca şube listede görünür ama sipariş alınmaz." value={accepts} onChange={setAccepts} />
      </Card>

      <Txt variant="label" style={{ marginTop: space[5], marginBottom: space[2] }}>Hazırlık süresi (müşteriye gösterilen)</Txt>
      <Chips options={PREP} value={prep} onChange={setPrep} label="Hazırlık süresi" />

      <Txt variant="h5" accessibilityRole="header" style={{ marginTop: space[6], marginBottom: space[2] }}>Çalışma saatleri</Txt>
      <Card style={{ gap: space[3] }}>
        <ToggleRow icon={Clock} tone="soft" title="Saatlere göre sipariş al"
          body={limited ? 'Kapalı saatlerde müşteriler yalnızca ileri saate sipariş verebilir.' : 'Kapalıyken saat sınırı yoktur.'}
          value={limited} onChange={setLimited} />
        {limited ? (
          <>
            <Divider />
            {DAYS.map((d) => (
              <View key={d} style={styles.dayRow}>
                <Txt variant="label" style={{ width: 92 }}>{DAY_NAMES[Number(d) - 1]}</Txt>
                <Switch accessibilityLabel={`${DAY_NAMES[Number(d) - 1]} açık`} value={hours[d].open} onValueChange={(v) => setDay(d, { open: v })}
                  trackColor={{ false: color.lineStrong, true: color.success }} thumbColor={color.surface} />
                {hours[d].open ? (
                  <View style={styles.times}>
                    <TimeInput value={hours[d].from} onChange={(t) => setDay(d, { from: t })} label={`${DAY_NAMES[Number(d) - 1]} açılış`} />
                    <Txt variant="body" color="inkMuted">–</Txt>
                    <TimeInput value={hours[d].to} onChange={(t) => setDay(d, { to: t })} label={`${DAY_NAMES[Number(d) - 1]} kapanış`} />
                  </View>
                ) : <Txt variant="bodySm" color="inkMuted" style={{ flex: 1, textAlign: 'right' }}>Kapalı</Txt>}
              </View>
            ))}
            <Button label="Pazartesi saatlerini tüm günlere uygula" variant="tertiary" size="sm" onPress={copyMonday} style={{ alignSelf: 'flex-start' }} />
            <Txt variant="caption" color="inkMuted">Gece yarısından sonra kapanıyorsa kapanışı ertesi günün saatiyle yaz (ör. 08:00 – 01:00).</Txt>
          </>
        ) : null}
      </Card>

      <Txt variant="h5" accessibilityRole="header" style={{ marginTop: space[6], marginBottom: space[2] }}>Masaya servis</Txt>
      <Card style={{ gap: space[3] }}>
        <ToggleRow icon={Utensils} tone="soft" title="Masadan sipariş al"
          body={tables ? `Masalardaki QR kodla sipariş verilir; ekip siparişi masaya götürür (${tables} masa).` : 'Açınca her masaya bir QR kod konur; müşteri oturduğu yerden sipariş verir.'}
          value={tables > 0} onChange={(v) => setTables(v ? Math.max(1, Math.min(200, Number(tableText) || 20)) : 0)} />
        {tables > 0 ? (
          <>
            <Field label="Masa sayısı" value={tableText} keyboardType="number-pad" maxLength={3}
              onChangeText={(t) => { const d = t.replace(/\D/g, '').slice(0, 3); setTableText(d); const n = Number(d); if (n >= 1 && n <= 200) setTables(n); }}
              hint="1 ile 200 arası. Değiştirince kaydetmeyi unutma." />
            <Button label={`${tables} masa için QR kodlarını hazırla`} icon={Printer} variant="secondary" size="md"
              onPress={() => shareTextFile(`masa-qr-${branch.id}.html`, tableSheetHtml(branch, tables), 'text/html').catch((e) => toast(errorMessage(e)))} />
            <Txt variant="caption" color="inkMuted">
              Dosyayı bilgisayarda açıp yazdır; her sayfada 6 masa kartı olur. Kodlar Çeşme Kahve uygulamasını açar; müşterinin uygulamayı yüklemiş olması gerekir.
            </Txt>
          </>
        ) : null}
      </Card>

      <View style={{ marginTop: space[5], marginBottom: space[8] }}>
        <NavRow icon={Users} title="Ekip" body="Şube müdürü ve barista ekle ya da çıkar"
          onPress={() => router.push({ pathname: '/staff/team', params: { branch: branch.id } })} />
      </View>
    </Screen>
  );
}

function TimeInput({ value, onChange, label }: { value: string; onChange: (t: string) => void; label: string }) {
  const ok = TIME.test(value);
  return (
    <TextInput
      value={value}
      onChangeText={(t) => {
        const digits = t.replace(/\D/g, '').slice(0, 4);
        onChange(digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);
      }}
      accessibilityLabel={label}
      keyboardType="number-pad"
      maxLength={5}
      placeholder="08:00"
      placeholderTextColor={color.inkMuted}
      style={[styles.time, !ok && { borderColor: color.error }]}
    />
  );
}

const styles = StyleSheet.create({
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44 },
  times: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  time: {
    width: 64, height: 40, borderWidth: 1.5, borderColor: color.lineStrong, borderRadius: radius.sm, textAlign: 'center',
    fontFamily: font.regular, fontSize: 16, color: color.ink, backgroundColor: color.surface, fontVariant: ['tabular-nums'],
  },
});

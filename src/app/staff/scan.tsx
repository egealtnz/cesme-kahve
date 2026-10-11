import { useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Camera, Check, Coffee, Gift, Keyboard } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Stepper } from '@/components/Stepper';
import { Card, Screen, TopBar } from '@/components/Layout';
import { staffAddStamps, staffRedeemReward, useCatalogue } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useAuth } from '@/state/auth';
import { color, radius, space } from '@/theme/tokens';
import { DemoNote } from '@/components/Demo';

type Result = { kind: 'reward' | 'stamps'; title: string; body: string } | { kind: 'error'; title: string; body: string };

/**
 * Barista scanner:
 *  CK-R:XXXXXX      → redeem a free coffee
 *  CK-M:XXXXXXXXXX  → member card: add stamps for coffees bought at the counter
 */
export default function StaffScan() {
  const { branch } = useLocalSearchParams<{ branch: string }>();
  const { isStaff } = useAuth();
  const { data: cat } = useCatalogue();
  const [permission, requestPermission] = useCameraPermissions();
  const [member, setMember] = useState<string | null>(null);
  const [coffees, setCoffees] = useState(1);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const locked = useRef(false);
  if (!isStaff || !branch) return <Redirect href="/profile" />;
  const max = cat?.settings.max_counter_stamps ?? 10;

  const handle = async (raw: string) => {
    if (locked.current) return;
    locked.current = true;
    const value = raw.trim().toUpperCase();
    try {
      if (value.startsWith('CK-M:') || /^[A-HJ-NP-Z2-9]{10}$/.test(value)) {
        setMember(value);
        setCoffees(1);
        return;
      }
      setBusy(true);
      const r = await staffRedeemReward(value, branch);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setResult({ kind: 'reward', title: 'Hediye kahve kullanıldı', body: `${r.first_name} için bir kahve hazırla. Kod: ${r.code}` });
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setResult({ kind: 'error', title: 'Kullanılamadı', body: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const addStamps = async () => {
    if (!member) return;
    setBusy(true);
    try {
      const r = await staffAddStamps(member, branch, coffees);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setResult({
        kind: 'stamps',
        title: `${coffees} damga eklendi`,
        body: r.rewards_earned
          ? `${r.first_name} kartını doldurdu ve ${r.rewards_earned} hediye kahve kazandı!`
          : `${r.first_name} şimdi ${r.stamps} damgada.`,
      });
    } catch (e) {
      setResult({ kind: 'error', title: 'Damga eklenemedi', body: errorMessage(e) });
    } finally {
      setMember(null);
      setBusy(false);
    }
  };

  const reset = () => { setResult(null); setMember(null); setCode(''); locked.current = false; };

  return (
    <Screen>
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>QR okut</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>Müşterinin kahve kartı ya da hediye kahve QR kodunu okut.</Txt>

      {result ? (
        <Card tone={result.kind === 'error' ? 'surface' : 'eco'} style={{ marginTop: space[6], alignItems: 'center', gap: space[3], paddingVertical: space[8] }}>
          <View style={[styles.resultIcon, { backgroundColor: result.kind === 'error' ? color.errorSoft : color.surface }]}>
            {result.kind === 'reward' ? <Gift size={32} color={color.success} /> : result.kind === 'stamps' ? <Coffee size={32} color={color.success} /> : <Txt variant="h2" color="error">!</Txt>}
          </View>
          <Txt variant="h3" center accessibilityLiveRegion="assertive">{result.title}</Txt>
          <Txt variant="body" center>{result.body}</Txt>
          <Button label="Yeni okutma" icon={Camera} onPress={reset} />
        </Card>
      ) : member ? (
        <Card style={{ marginTop: space[6], gap: space[4] }}>
          <Txt variant="h4">Kasadan kaç kahve aldı?</Txt>
          <Txt variant="bodySm" color="inkMuted">Hediye kahveyle alınanları sayma.</Txt>
          <Stepper value={coffees} onChange={(n) => setCoffees(Math.max(1, Math.min(max, n)))} name="kahve" min={1} max={max} />
          <Button label={`${coffees} damga ekle`} icon={Check} loading={busy} onPress={addStamps} />
          <Button label="Vazgeç" variant="tertiary" size="md" onPress={reset} />
        </Card>
      ) : manual || Platform.OS === 'web' ? (
        <View style={{ gap: space[4], marginTop: space[6] }}>
          <DemoNote>Örnek kodlar: Deniz’in kahve kartı A3VTLQBSR6 · hediye kahvesi K7M2QX</DemoNote>
          <Field label="Kod" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false}
            hint="Hediye kahve: 6 karakter · Kahve kartı: 10 karakter" />
          <Button label="Devam" loading={busy} disabled={code.trim().length < 6} onPress={() => handle(code)} />
          {Platform.OS !== 'web' ? <Button label="Kamerayla okut" variant="tertiary" size="md" onPress={() => setManual(false)} /> : null}
        </View>
      ) : !permission ? null : !permission.granted ? (
        <Card style={{ marginTop: space[6], gap: space[3] }}>
          <Txt variant="body">QR kodları okutmak için kameraya izin ver.</Txt>
          <Button label="Kameraya izin ver" icon={Camera} onPress={requestPermission} />
          <Button label="Kodu elle yaz" icon={Keyboard} variant="tertiary" size="md" onPress={() => setManual(true)} />
        </Card>
      ) : (
        <View style={{ marginTop: space[6], gap: space[3] }}>
          <View style={styles.camera}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={busy ? undefined : ({ data }) => handle(data)}
            />
            <View style={styles.frame} pointerEvents="none" />
          </View>
          <Button label="Kodu elle yaz" icon={Keyboard} variant="tertiary" size="md" style={{ alignSelf: 'center' }} onPress={() => setManual(true)} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  camera: { height: 340, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  frame: { position: 'absolute', left: '18%', right: '18%', top: '18%', bottom: '18%', borderWidth: 3, borderColor: color.secondary, borderRadius: radius.lg },
  resultIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});

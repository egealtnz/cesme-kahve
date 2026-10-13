// Customer: scan the QR code on the table (or type the table number) to have the order brought over.
import { useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Camera, Keyboard, Utensils } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Card, Screen, TopBar } from '@/components/Layout';
import { Chips } from '@/components/Admin';
import { FadeIn, Pulse } from '@/components/Motion';
import { useBranchesLive } from '@/lib/api';
import { L } from '@/lib/i18n';
import { parseTableCode } from '@/lib/table';
import { useCart } from '@/state/cart';
import { color, radius, space } from '@/theme/tokens';

export default function TableScan() {
  const [permission, requestPermission] = useCameraPermissions();
  const branches = useBranchesLive();
  const cart = useCart();
  const [manual, setManual] = useState(Platform.OS === 'web');
  const [error, setError] = useState<string | null>(null);
  const withTables = (branches.data ?? []).filter((b) => b.status === 'open' && (b.table_count ?? 0) > 0);
  const [branchId, setBranchId] = useState<string | null>(cart.branchId);
  const [table, setTable] = useState('');
  const locked = useRef(false);
  const chosen = withTables.find((b) => b.id === branchId) ?? withTables[0];

  const open = (branch: string, no: string) => router.replace({ pathname: '/masa', params: { sube: branch, no } });

  const onScan = (data: string) => {
    if (locked.current) return;
    const t = parseTableCode(data);
    if (!t) { setError(L('Bu bir Çeşme Kahve masa kodu değil.', 'This is not a Çeşme Kahve table code.')); return; }
    locked.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    open(t.branchId, t.table);
  };

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <TopBar back />
      <FadeIn>
        <Txt variant="overline" color="secondaryInk" style={{ marginTop: space[5] }}>{L('Masaya servis', 'Table service')}</Txt>
        <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>{L('Masadaki QR kodu okut', 'Scan the QR code on your table')}</Txt>
        <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>
          {L('Siparişini ver, hazır olunca masana getirelim. Ödemeyi masada ya da kasada yapabilirsin.',
             'Order from your seat and we bring it over when it is ready. Pay at the table or the counter.')}
        </Txt>
      </FadeIn>

      {manual ? (
        <FadeIn style={{ gap: space[4], marginTop: space[6] }}>
          {withTables.length === 0 ? (
            <Card tone="soft"><Txt variant="bodySm">{L('Şu an masaya servis yapan şube yok.', 'No branch offers table service right now.')}</Txt></Card>
          ) : (
            <>
              <Txt variant="label">{L('Şube', 'Branch')}</Txt>
              <Chips options={withTables.map((b) => ({ value: b.id as string | null, label: b.name }))} value={chosen?.id ?? null} onChange={setBranchId} label={L('Şube', 'Branch')} />
              <Field label={L('Masa numarası', 'Table number')} value={table} onChangeText={(t) => setTable(t.replace(/\D/g, '').slice(0, 3))}
                keyboardType="number-pad" placeholder="5" hint={chosen ? L(`1–${chosen.table_count} arası`, `Between 1 and ${chosen.table_count}`) : undefined} />
              <Button label={L('Devam', 'Continue')} icon={Utensils} disabled={!chosen || !table} onPress={() => chosen && open(chosen.id, table)} />
            </>
          )}
          {Platform.OS !== 'web' ? <Button label={L('Kamerayla okut', 'Use the camera')} icon={Camera} variant="tertiary" size="md" onPress={() => setManual(false)} /> : null}
        </FadeIn>
      ) : !permission ? null : !permission.granted ? (
        <Card style={{ marginTop: space[6], gap: space[3] }}>
          <Txt variant="body">{L('QR kodu okutmak için kameraya izin ver.', 'Allow the camera to scan the QR code.')}</Txt>
          <Button label={L('Kameraya izin ver', 'Allow camera')} icon={Camera} onPress={requestPermission} />
          <Button label={L('Masa numarasını yaz', 'Type the table number')} icon={Keyboard} variant="tertiary" size="md" onPress={() => setManual(true)} />
        </Card>
      ) : (
        <FadeIn style={{ marginTop: space[6], gap: space[3] }}>
          <View style={styles.camera}>
            <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => onScan(data)} />
            <Pulse style={styles.frame} min={0.5}><View /></Pulse>
          </View>
          {error ? <Txt variant="bodySm" color="error" center>{error}</Txt> : null}
          <Button label={L('Masa numarasını yaz', 'Type the table number')} icon={Keyboard} variant="tertiary" size="md" style={{ alignSelf: 'center' }} onPress={() => setManual(true)} />
        </FadeIn>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  camera: { height: 340, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  frame: { position: 'absolute', left: '18%', right: '18%', top: '18%', bottom: '18%', borderWidth: 3, borderColor: color.secondary, borderRadius: radius.lg },
});

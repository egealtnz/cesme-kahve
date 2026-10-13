// Opened by the QR code on a table (cesmekahve://masa?sube=…&no=…): seats the customer at that table
// and takes them to the menu. Orders are then brought to the table.
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { QrCode, Utensils } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Screen, TopBar } from '@/components/Layout';
import { Pop } from '@/components/Motion';
import { useBranchesLive } from '@/lib/api';
import { L } from '@/lib/i18n';
import { tableProblem } from '@/lib/table';
import { useCart } from '@/state/cart';
import { useToast } from '@/state/toast';
import { color, space } from '@/theme/tokens';

export default function TableLink() {
  const { sube, no } = useLocalSearchParams<{ sube?: string; no?: string }>();
  const branches = useBranchesLive();
  const cart = useCart();
  const toast = useToast();
  const branch = branches.data?.find((b) => b.id === sube);
  const p = branches.data ? tableProblem(branch, String(no ?? '')) : null;
  const problem = !p ? null
    : p === 'no_service' ? L('Bu şubede masaya servis şu an yok. Siparişini tezgahtan alabilirsin.', 'This branch has no table service right now. You can pick up at the counter.')
    : p === 'no_table' ? L('Bu masa numarası geçerli değil. Masadaki QR kodu yeniden okut.', 'This table number is not valid. Scan the QR code on the table again.')
    : L('Bu şubeyi bulamadık.', 'We could not find this branch.');

  useEffect(() => {
    if (!branches.data || tableProblem(branch, String(no ?? ''))) return;
    cart.setTable(branch!.id, String(Number(no)));
    toast(L(`Masa ${Number(no)} · ${branch!.name}: siparişin masana gelecek.`, `Table ${Number(no)} · ${branch!.name}: we will bring your order to you.`));
    router.replace('/');
  }, [branches.data, branch, no, cart, toast]);

  return (
    <Screen>
      <TopBar back={() => router.replace('/')} />
      {problem ? (
        <View style={{ marginTop: space[10], alignItems: 'center', gap: space[3] }}>
          <Pop><Utensils size={48} color={color.secondary} strokeWidth={1.5} /></Pop>
          <Txt variant="h3" center>{L('Masaya servis', 'Table service')}</Txt>
          <Txt variant="body" color="inkMuted" center style={{ maxWidth: 300 }}>{problem}</Txt>
          <Button label={L('Yeniden okut', 'Scan again')} icon={QrCode} style={{ marginTop: space[4] }} onPress={() => router.replace('/table-scan')} />
          <Button label={L('Menüye git', 'Go to the menu')} variant="tertiary" size="md" onPress={() => router.replace('/')} />
        </View>
      ) : (
        <ActivityIndicator color={color.ink} style={{ marginTop: space[10] }} />
      )}
    </Screen>
  );
}

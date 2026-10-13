// Company panel: find any order in any branch — by number, customer name, e-mail or phone.
import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { Field } from '@/components/Field';
import { Card, Divider, Screen, TopBar } from '@/components/Layout';
import { Chips } from '@/components/Admin';
import { AdminOrderRow } from '@/components/AdminOrderRow';
import { useCatalogue, useOrderSearch } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useDebounced } from '@/lib/useDebounced';
import { color, space } from '@/theme/tokens';

type Status = 'open' | 'collected' | 'cancelled' | null;
const STATUSES: { value: Status; label: string }[] = [
  { value: null, label: 'Tümü' }, { value: 'open', label: 'Açık' }, { value: 'collected', label: 'Teslim edilen' }, { value: 'cancelled', label: 'İptal' },
];

export default function AdminOrders() {
  const { data: cat } = useCatalogue();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const query = useDebounced(text.trim());
  const orders = useOrderSearch(query, branchId, status);
  const branchName = useMemo(() => new Map(cat?.branches.map((b) => [b.id, b.name]) ?? []), [cat]);
  const branchOptions = [{ value: null as string | null, label: 'Tüm şubeler' },
    ...(cat?.branches.filter((b) => b.status === 'open').map((b) => ({ value: b.id as string | null, label: b.name })) ?? [])];

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>Siparişler</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>
        Tüm şubelerdeki siparişler, en yeniler üstte. Bir siparişe dokunarak ayrıntısını gör, durumunu değiştir ya da iptal et.
      </Txt>
      <View style={{ marginTop: space[4] }}>
        <Field label="Ara" value={text} onChangeText={setText} placeholder="Sipariş no, müşteri adı, e-posta ya da telefon"
          autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
      </View>
      <View style={{ gap: space[2], marginTop: space[3] }}>
        <Chips options={STATUSES} value={status} onChange={setStatus} label="Durum" />
        <Chips options={branchOptions} value={branchId} onChange={setBranchId} label="Şube" />
      </View>

      {orders.isError ? <Txt variant="bodySm" color="error" style={{ marginTop: space[4] }}>{errorMessage(orders.error)}</Txt> : null}
      <Card style={{ paddingVertical: 0, marginTop: space[4], marginBottom: space[8] }}>
        {orders.isLoading ? <ActivityIndicator color={color.ink} style={{ marginVertical: space[4] }} /> : null}
        {orders.data && orders.data.length === 0 ? (
          <Txt variant="bodySm" color="inkMuted" style={{ paddingVertical: space[3] }}>Bu aramaya uyan sipariş yok.</Txt>
        ) : null}
        {orders.data?.map((o, i) => (
          <View key={o.id}>
            {i > 0 ? <Divider /> : null}
            <AdminOrderRow o={{ ...o, branch: branchName.get(o.branch_id) ?? o.branch_id }} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}

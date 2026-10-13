// Company panel: one branch right now — state and busy/pause controls, open orders, quick links.
import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MonitorPlay, PackageX, Settings2, Users } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Card, Divider, Screen, TopBar } from '@/components/Layout';
import { NavRow, Stat } from '@/components/Admin';
import { BranchLoad } from '@/components/BranchLoad';
import { AdminOrderRow } from '@/components/AdminOrderRow';
import { StateBadge } from '@/components/LiveBranches';
import { useBranchesLive, useBranchQueue, useLiveOverview } from '@/lib/api';
import { tl } from '@/lib/format';
import { branchState } from '@/lib/hours';
import { color, space } from '@/theme/tokens';

export default function AdminLiveBranch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const branches = useBranchesLive();
  const live = useLiveOverview();
  const queue = useBranchQueue(id ?? null);
  const b = branches.data?.find((x) => x.id === id);
  const l = live.data?.branches.find((x) => x.branch_id === id);
  if (!b) return <Screen><TopBar back />{branches.isLoading ? <ActivityIndicator color={color.ink} style={{ marginTop: space[6] }} /> : null}</Screen>;

  const orders = [...(queue.data ?? [])].sort((x, y) => x.created_at.localeCompare(y.created_at));
  return (
    <Screen>
      <TopBar back />
      <Txt variant="overline" color="secondaryInk" style={{ marginTop: space[5] }}>Şu an</Txt>
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>{b.name}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[2] }}>
        <StateBadge branch={b} />
        <Txt variant="bodySm" color="inkMuted" style={{ flex: 1 }}>{branchState(b).label}</Txt>
      </View>

      {b.status === 'open' ? <BranchLoad branch={b} /> : null}

      {l ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[4] }}>
          <Stat label="Bekleyen" value={String(l.waiting)} sub={l.scheduled ? `+${l.scheduled} ileri saat` : undefined} />
          <Stat label="Hazırlanıyor / hazır" value={`${l.preparing} / ${l.ready}`} />
          <Stat label="Bugünkü ciro" value={tl(l.today_revenue)} sub={`${l.today_orders} sipariş${l.today_cancelled ? ` · ${l.today_cancelled} iptal` : ''}`} />
          <Stat label="Tükenen ürün" value={String(l.sold_out)} sub={`${l.staff} kişilik ekip`} />
        </View>
      ) : null}

      <Txt variant="h5" accessibilityRole="header" style={{ marginTop: space[6], marginBottom: space[2] }}>Açık siparişler</Txt>
      <Card style={{ paddingVertical: 0 }}>
        {queue.isLoading ? <ActivityIndicator color={color.ink} style={{ marginVertical: space[4] }} /> : null}
        {!queue.isLoading && orders.length === 0 ? (
          <Txt variant="bodySm" color="inkMuted" style={{ paddingVertical: space[3] }}>Şu an açık sipariş yok.</Txt>
        ) : null}
        {orders.map((o, i) => (
          <View key={o.id}>
            {i > 0 ? <Divider /> : null}
            <AdminOrderRow o={{ ...o, branch: null, items: o.order_items?.map((x) => `${x.quantity}× ${x.product_name}`).join(', ') }} />
          </View>
        ))}
      </Card>

      <View style={{ gap: space[2], marginTop: space[6], marginBottom: space[8] }}>
        <NavRow icon={MonitorPlay} title="Tezgah ekranı" body="Siparişleri bu şubenin ekranındaki gibi gör ve ilerlet"
          onPress={() => router.push({ pathname: '/staff/board', params: { branch: b.id } })} />
        <NavRow icon={PackageX} title="Tükenenler" body="Bu şubede biten ürünleri işaretle"
          onPress={() => router.push({ pathname: '/staff/menu', params: { branch: b.id } })} />
        <NavRow icon={Users} title="Ekip" body="Müdür ve barista ekle, çıkar"
          onPress={() => router.push({ pathname: '/staff/team', params: { branch: b.id } })} />
        <NavRow icon={Settings2} title="Şube ayarları" body="Çalışma saatleri, hazırlık süresi, sipariş alma"
          onPress={() => router.push({ pathname: '/admin/branch/[id]', params: { id: b.id } })} />
      </View>
    </Screen>
  );
}

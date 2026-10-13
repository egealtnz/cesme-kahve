// Owner: every branch with its status today.
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { Store } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Screen, TopBar } from '@/components/Layout';
import { NavRow } from '@/components/Admin';
import { useBranchesLive } from '@/lib/api';
import { branchState } from '@/lib/hours';
import { color, space } from '@/theme/tokens';

export default function AdminBranches() {
  const branches = useBranchesLive();
  return (
    <Screen>
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>Şubeler</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>Çalışma saatleri, hazırlık süresi, sipariş alma ve ekip.</Txt>
      {branches.isLoading ? <ActivityIndicator color={color.ink} style={{ marginTop: space[6] }} /> : null}
      <View style={{ gap: space[2], marginTop: space[5], marginBottom: space[8] }}>
        {branches.data?.map((b) => (
          <NavRow key={b.id} icon={Store} title={b.name}
            body={`${b.district} · ${b.city} · ${b.status === 'coming_soon' ? 'Yakında' : branchState(b).label}${b.opening_hours ? '' : ' · saat sınırı yok'}`}
            onPress={() => router.push({ pathname: '/admin/branch/[id]', params: { id: b.id } })} />
        ))}
      </View>
    </Screen>
  );
}

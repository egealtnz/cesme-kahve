// Owner: campaign cards on the home screen (including hidden ones).
import { ActivityIndicator, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Megaphone, Plus } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Screen, TopBar } from '@/components/Layout';
import { NavRow } from '@/components/Admin';
import { saveCampaign, useAdminCatalogue } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useToast } from '@/state/toast';
import { color, space } from '@/theme/tokens';

export default function AdminCampaigns() {
  const data = useAdminCatalogue(true);
  const qc = useQueryClient();
  const toast = useToast();
  const toggle = async (id: string, on: boolean) => {
    try {
      await saveCampaign(id, { is_active: on });
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin-catalogue'] }), qc.invalidateQueries({ queryKey: ['catalogue'] })]);
    } catch (e) {
      toast(errorMessage(e));
    }
  };
  return (
    <Screen>
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>Kampanya kartları</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>
        Ana sayfadaki kartlar bilgilendirme amaçlıdır. Otomatik indirimler (ör. ikinci kahve %50) Ayarlar’dan yönetilir.
      </Txt>
      <Button label="Yeni kart ekle" icon={Plus} size="md" style={{ marginTop: space[4], alignSelf: 'flex-start' }}
        onPress={() => router.push({ pathname: '/admin/campaign/[id]', params: { id: 'new' } })} />
      {data.isLoading ? <ActivityIndicator color={color.ink} style={{ marginTop: space[6] }} /> : null}
      <View style={{ gap: space[2], marginTop: space[5], marginBottom: space[8] }}>
        {data.data?.campaigns.map((c) => (
          <NavRow key={c.id} icon={Megaphone} title={c.title} body={`${c.eyebrow ?? ''}${c.is_active === false ? ' · gizli' : ''}`}
            onPress={() => router.push({ pathname: '/admin/campaign/[id]', params: { id: c.id } })}
            right={<Switch accessibilityLabel={`${c.title} yayında`} value={c.is_active !== false} onValueChange={(v) => toggle(c.id, v)}
              trackColor={{ false: color.lineStrong, true: color.success }} thumbColor={color.surface} />} />
        ))}
      </View>
    </Screen>
  );
}

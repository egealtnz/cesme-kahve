// Owner: the whole menu, including hidden products. Tap to edit; the switch hides/shows a product everywhere.
import { ActivityIndicator, Pressable, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Card, Divider, Screen, TopBar } from '@/components/Layout';
import { ProductPhoto } from '@/components/Product';
import { saveProduct, useAdminCatalogue } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { tl } from '@/lib/format';
import { useToast } from '@/state/toast';
import { color, space } from '@/theme/tokens';

export default function AdminMenu() {
  const data = useAdminCatalogue(true);
  const qc = useQueryClient();
  const toast = useToast();

  const toggle = async (id: string, active: boolean) => {
    try {
      await saveProduct(id, { is_active: active });
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin-catalogue'] }), qc.invalidateQueries({ queryKey: ['catalogue'] })]);
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  return (
    <Screen>
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>Menü ve fiyatlar</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>
        Değişiklikler müşterilerin uygulamasına birkaç dakika içinde yansır. Kapalı ürünler menüde görünmez, geçmiş siparişler etkilenmez.
      </Txt>
      <Button label="Yeni ürün ekle" icon={Plus} size="md" style={{ marginTop: space[4], alignSelf: 'flex-start' }}
        onPress={() => router.push({ pathname: '/admin/product/[id]', params: { id: 'new' } })} />
      {data.isLoading ? <ActivityIndicator color={color.ink} style={{ marginTop: space[6] }} /> : null}
      {data.data?.categories.map((c) => {
        const items = data.data.products.filter((p) => p.category_id === c.id);
        return (
          <View key={c.id} style={{ marginTop: space[6] }}>
            <Txt variant="h5" accessibilityRole="header" style={{ marginBottom: space[2] }}>{c.name}{c.is_active === false ? ' (gizli)' : ''}</Txt>
            <Card style={{ paddingVertical: 0 }}>
              {items.length === 0 ? <Txt variant="bodySm" color="inkMuted" style={{ paddingVertical: space[3] }}>Bu kategoride ürün yok.</Txt> : null}
              {items.map((p, i) => (
                <View key={p.id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable accessibilityRole="button" accessibilityLabel={`${p.name}, ${tl(p.price)}, düzenle`}
                    onPress={() => router.push({ pathname: '/admin/product/[id]', params: { id: p.id } })}
                    style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] }, pressed && { opacity: 0.7 }]}>
                    <ProductPhoto product={p} size={44} soldOut={p.is_active === false} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt variant="body" numberOfLines={1} color={p.is_active === false ? 'inkMuted' : 'ink'}>{p.name}</Txt>
                      <Txt variant="caption" color={p.is_active === false ? 'error' : 'inkMuted'}>
                        {tl(p.price)}{p.is_active === false ? ' · menüde gizli' : ''}
                      </Txt>
                    </View>
                    <Switch accessibilityLabel={`${p.name} menüde`} value={p.is_active !== false}
                      onValueChange={(v) => toggle(p.id, v)} trackColor={{ false: color.lineStrong, true: color.success }} thumbColor={color.surface} />
                  </Pressable>
                </View>
              ))}
            </Card>
          </View>
        );
      })}
      <View style={{ height: space[8] }} />
    </Screen>
  );
}

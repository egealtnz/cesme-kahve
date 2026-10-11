import { Switch, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Txt } from '@/components/Txt';
import { Card, Divider, Screen, TopBar } from '@/components/Layout';
import { ProductPhoto } from '@/components/Product';
import { staffSetSoldOut, useCatalogue, useSoldOut } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useAuth } from '@/state/auth';
import { useToast } from '@/state/toast';
import { color, space } from '@/theme/tokens';

/** Baristas switch products off when they run out; customers see "Tükendi" at once. */
export default function StaffMenu() {
  const { branch } = useLocalSearchParams<{ branch: string }>();
  const { isStaff } = useAuth();
  const { data: cat } = useCatalogue();
  const soldOut = useSoldOut(branch);
  const qc = useQueryClient();
  const toast = useToast();
  if (!isStaff || !branch) return <Redirect href="/profile" />;

  const toggle = async (productId: string, available: boolean) => {
    try {
      await staffSetSoldOut(branch, productId, !available);
      await qc.invalidateQueries({ queryKey: ['sold-out', branch] });
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  return (
    <Screen>
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>Tükenenler</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>Biten ürünü kapat; uygulamada hemen “Tükendi” görünür.</Txt>
      {cat?.categories.map((c) => {
        const items = cat.products.filter((p) => p.category_id === c.id);
        return (
          <View key={c.id} style={{ marginTop: space[6] }}>
            <Txt variant="h5" accessibilityRole="header" style={{ marginBottom: space[2] }}>{c.name}</Txt>
            <Card style={{ paddingVertical: 0 }}>
              {items.map((p, i) => {
                const available = !soldOut.data?.has(p.id);
                return (
                  <View key={p.id}>
                    {i > 0 ? <Divider /> : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] }}>
                      <ProductPhoto product={p} size={40} soldOut={!available} />
                      <View style={{ flex: 1 }}>
                        <Txt variant="body">{p.name}</Txt>
                        <Txt variant="caption" color={available ? 'success' : 'error'}>{available ? 'Satışta' : 'Tükendi'}</Txt>
                      </View>
                      <Switch
                        accessibilityLabel={`${p.name} satışta`}
                        value={available}
                        onValueChange={(v) => toggle(p.id, v)}
                        trackColor={{ false: color.lineStrong, true: color.success }}
                        thumbColor={color.surface}
                      />
                    </View>
                  </View>
                );
              })}
            </Card>
          </View>
        );
      })}
    </Screen>
  );
}

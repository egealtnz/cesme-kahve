// Company panel: milk options (extra price, show/hide) and menu categories (show/hide). Prices are in ₺;
// the server keeps kuruş. Changes reach customers within a few minutes; past orders keep their prices.
import { useState } from 'react';
import { ActivityIndicator, Switch, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Card, Divider, Screen, TopBar } from '@/components/Layout';
import { saveCategory, saveMilk, useAdminCatalogue, useAllMilks } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { Milk } from '@/lib/types';
import { useToast } from '@/state/toast';
import { color, space } from '@/theme/tokens';

export default function AdminOptions() {
  const milks = useAllMilks(true);
  const cat = useAdminCatalogue(true);
  const qc = useQueryClient();
  const toast = useToast();

  const refresh = () => Promise.all(['admin-milks', 'admin-catalogue', 'catalogue'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  const toggleCategory = async (id: string, active: boolean) => {
    try {
      await saveCategory(id, { is_active: active });
      await refresh();
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>Süt seçenekleri ve kategoriler</Txt>

      <Txt variant="h5" accessibilityRole="header" style={{ marginTop: space[6], marginBottom: space[2] }}>Süt seçenekleri</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginBottom: space[3] }}>
        Fiyat farkı, sütlü içeceğin fiyatına eklenir. Kapalı seçenek sepette görünmez; varsayılan süt kapatılamaz.
      </Txt>
      {milks.isLoading ? <ActivityIndicator color={color.ink} /> : null}
      <Card style={{ paddingVertical: 0 }}>
        {milks.data?.map((m, i) => (
          <View key={m.id}>
            {i > 0 ? <Divider /> : null}
            <MilkRow milk={m} onSaved={refresh} />
          </View>
        ))}
      </Card>

      <Txt variant="h5" accessibilityRole="header" style={{ marginTop: space[6], marginBottom: space[2] }}>Kategoriler</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginBottom: space[3] }}>
        Gizlenen kategorinin ürünleri menüde görünmez (ör. sezonluk soğuk içecekler).
      </Txt>
      <Card style={{ paddingVertical: 0, marginBottom: space[8] }}>
        {cat.data?.categories.map((c, i) => (
          <View key={c.id}>
            {i > 0 ? <Divider /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] }}>
              <View style={{ flex: 1 }}>
                <Txt variant="body" color={c.is_active === false ? 'inkMuted' : 'ink'}>{c.name}</Txt>
                <Txt variant="caption" color="inkMuted">
                  {cat.data.products.filter((p) => p.category_id === c.id).length} ürün{c.is_active === false ? ' · menüde gizli' : ''}
                </Txt>
              </View>
              <Switch accessibilityLabel={`${c.name} menüde`} value={c.is_active !== false} onValueChange={(v) => toggleCategory(c.id, v)}
                trackColor={{ false: color.lineStrong, true: color.success }} thumbColor={color.surface} />
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function MilkRow({ milk, onSaved }: { milk: Milk; onSaved: () => Promise<unknown> }) {
  const toast = useToast();
  const [price, setPrice] = useState(String(milk.extra_price / 100).replace('.', ','));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const parsed = Number(price.replace(',', '.'));
  const changed = Number.isFinite(parsed) && Math.round(parsed * 100) !== milk.extra_price;

  const save = async (patch: Partial<Milk>) => {
    setSaving(true);
    try {
      await saveMilk(milk.id, patch);
      await onSaved();
      if ('extra_price' in patch) toast(`${milk.label} fiyat farkı kaydedildi.`);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  const savePrice = () => {
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 500) { setError('0 ile 500 arasında bir tutar yaz.'); return; }
    setError(undefined);
    save({ extra_price: Math.round(parsed * 100) });
  };

  return (
    <View style={{ paddingVertical: space[3], gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View style={{ flex: 1 }}>
          <Txt variant="body" color={milk.is_active === false ? 'inkMuted' : 'ink'}>{milk.label}</Txt>
          <Txt variant="caption" color="inkMuted">
            {[milk.is_default && 'varsayılan', milk.is_plant && 'bitkisel', milk.is_active === false && 'sepette gizli'].filter(Boolean).join(' · ') || ' '}
          </Txt>
        </View>
        <Switch accessibilityLabel={`${milk.label} sepette`} value={milk.is_active !== false} disabled={milk.is_default || saving}
          onValueChange={(v) => save({ is_active: v })} trackColor={{ false: color.lineStrong, true: color.success }} thumbColor={color.surface} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2] }}>
        <View style={{ flex: 1 }}>
          <Field label="Fiyat farkı" value={price} onChangeText={(t) => { setPrice(t); setError(undefined); }} keyboardType="decimal-pad" prefix="₺" error={error} />
        </View>
        {changed ? <Button label="Kaydet" size="md" loading={saving} onPress={savePrice} style={{ marginBottom: error ? 28 : 0 }} /> : null}
      </View>
    </View>
  );
}

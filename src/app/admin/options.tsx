// Company panel: drink options (size, extra shot, syrup, decaf, sugar…), milk options and menu
// categories — prices, English names, show/hide. Prices are typed in ₺; the server keeps kuruş.
// Changes reach customers within a few minutes; past orders keep their prices.
import { useState } from 'react';
import { ActivityIndicator, Switch, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Card, Divider, Screen, TopBar } from '@/components/Layout';
import { saveCategory, saveMilk, saveOptionGroup, saveOptionValue, useAdminCatalogue, useAllMilks } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { Category, Milk, OptionGroup, OptionValue } from '@/lib/types';
import { useToast } from '@/state/toast';
import { color, space } from '@/theme/tokens';

const toTl = (k: number) => String(k / 100).replace('.', ',');
const parseTl = (t: string) => { const n = Number(t.replace(',', '.')); return Number.isFinite(n) && n >= 0 && n <= 1000 ? Math.round(n * 100) : null; };
const slug = (s: string) => s.toLocaleLowerCase('tr-TR')
  .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'secenek';

export default function AdminOptions() {
  const milks = useAllMilks(true);
  const cat = useAdminCatalogue(true);
  const qc = useQueryClient();
  const refresh = () => Promise.all(['admin-milks', 'admin-catalogue', 'catalogue'].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>Süt ve içecek seçenekleri</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>
        Fiyat farkları ürün fiyatına eklenir. İngilizce adlar, uygulamayı İngilizce kullanan müşterilere görünür (boşsa Türkçesi).
      </Txt>

      <Txt variant="h5" accessibilityRole="header" style={{ marginTop: space[6], marginBottom: space[2] }}>İçecek seçenekleri</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginBottom: space[3] }}>
        Hangi ürünün hangi seçenekleri sunacağını ürün sayfasında seçersin. Zorunlu gruplarda (ör. Türk kahvesinde şeker) müşteri mutlaka birini seçer.
      </Txt>
      {cat.isLoading ? <ActivityIndicator color={color.ink} /> : null}
      {cat.data?.optionGroups.map((g) => (
        <GroupCard key={g.id} group={g} values={cat.data.optionValues.filter((v) => v.group_id === g.id)}
          products={cat.data.productGroups.filter((l) => l.group_id === g.id).length} onSaved={refresh} />
      ))}

      <Txt variant="h5" accessibilityRole="header" style={{ marginTop: space[6], marginBottom: space[2] }}>Süt seçenekleri</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginBottom: space[3] }}>Kapalı seçenek sepette görünmez; varsayılan süt kapatılamaz.</Txt>
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
      <Txt variant="bodySm" color="inkMuted" style={{ marginBottom: space[3] }}>Gizlenen kategorinin ürünleri menüde görünmez (ör. sezonluk soğuk içecekler).</Txt>
      <Card style={{ paddingVertical: 0, marginBottom: space[8] }}>
        {cat.data?.categories.map((c, i) => (
          <View key={c.id}>
            {i > 0 ? <Divider /> : null}
            <CategoryRow category={c} count={cat.data.products.filter((p) => p.category_id === c.id).length} onSaved={refresh} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function useSaver(onSaved: () => Promise<unknown>) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setSaving(true);
    try { await fn(); await onSaved(); if (done) toast(done); } catch (e) { toast(errorMessage(e)); } finally { setSaving(false); }
  };
  return { saving, run };
}

function GroupCard({ group, values, products, onSaved }: { group: OptionGroup; values: OptionValue[]; products: number; onSaved: () => Promise<unknown> }) {
  const { saving, run } = useSaver(onSaved);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [labelEn, setLabelEn] = useState('');
  const [price, setPrice] = useState('0');
  const add = () => {
    const p = parseTl(price);
    if (!label.trim() || p === null) return;
    run(async () => {
      await saveOptionValue(null, { id: `${slug(label)}-${Math.random().toString(36).slice(2, 5)}`, group_id: group.id, label: label.trim(),
        label_en: labelEn.trim() || null, extra_price: p, sort: values.length });
      setAdding(false); setLabel(''); setLabelEn(''); setPrice('0');
    }, `${label.trim()} eklendi.`);
  };
  return (
    <Card style={{ marginBottom: space[3], gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View style={{ flex: 1 }}>
          <Txt variant="h6" color={group.is_active === false ? 'inkMuted' : 'ink'}>{group.name}{group.name_en ? ` · ${group.name_en}` : ''}</Txt>
          <Txt variant="caption" color="inkMuted">
            {[group.multi ? 'birden fazla seçilebilir' : 'tek seçim', group.required && 'zorunlu', `${products} üründe`, group.is_active === false && 'kapalı'].filter(Boolean).join(' · ')}
          </Txt>
        </View>
        <Switch accessibilityLabel={`${group.name} açık`} value={group.is_active !== false} disabled={saving}
          onValueChange={(v) => run(() => saveOptionGroup(group.id, { is_active: v }))}
          trackColor={{ false: color.lineStrong, true: color.success }} thumbColor={color.surface} />
      </View>
      {values.map((v) => <ValueRow key={v.id} value={v} onSaved={onSaved} />)}
      {adding ? (
        <View style={{ gap: space[3], paddingTop: space[2] }}>
          <Divider />
          <Field label="Yeni seçenek" value={label} onChangeText={setLabel} maxLength={40} placeholder="ör. Lavanta" />
          <Field label="İngilizce adı" optional value={labelEn} onChangeText={setLabelEn} maxLength={40} placeholder="e.g. Lavender" />
          <Field label="Fiyat farkı" value={price} onChangeText={setPrice} keyboardType="decimal-pad" prefix="₺" />
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Button label="Vazgeç" variant="secondary" size="md" onPress={() => setAdding(false)} />
            <Button label="Ekle" size="md" loading={saving} disabled={!label.trim() || parseTl(price) === null} onPress={add} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <Button label="Seçenek ekle" icon={Plus} variant="tertiary" size="sm" style={{ alignSelf: 'flex-start' }} onPress={() => setAdding(true)} />
      )}
    </Card>
  );
}

function ValueRow({ value: v, onSaved }: { value: OptionValue; onSaved: () => Promise<unknown> }) {
  const { saving, run } = useSaver(onSaved);
  const [price, setPrice] = useState(toTl(v.extra_price));
  const [labelEn, setLabelEn] = useState(v.label_en ?? '');
  const p = parseTl(price);
  const changed = (p !== null && p !== v.extra_price) || labelEn.trim() !== (v.label_en ?? '');
  return (
    <View style={{ paddingVertical: space[2], gap: space[2], borderTopWidth: 1, borderTopColor: color.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <Txt variant="body" style={{ flex: 1 }} color={v.is_active === false ? 'inkMuted' : 'ink'}>
          {v.label}{v.is_default ? ' (varsayılan)' : ''}
        </Txt>
        <Switch accessibilityLabel={`${v.label} açık`} value={v.is_active !== false} disabled={saving || v.is_default}
          onValueChange={(on) => run(() => saveOptionValue(v.id, { is_active: on }))}
          trackColor={{ false: color.lineStrong, true: color.success }} thumbColor={color.surface} />
      </View>
      <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-end' }}>
        <View style={{ width: 120 }}><Field label="Fiyat farkı" value={price} onChangeText={setPrice} keyboardType="decimal-pad" prefix="₺" /></View>
        <View style={{ flex: 1 }}><Field label="İngilizce" value={labelEn} onChangeText={setLabelEn} maxLength={40} /></View>
      </View>
      {changed ? (
        <Button label="Kaydet" size="sm" loading={saving} disabled={p === null} style={{ alignSelf: 'flex-start' }}
          onPress={() => run(() => saveOptionValue(v.id, { extra_price: p!, label_en: labelEn.trim() || null }), `${v.label} kaydedildi.`)} />
      ) : null}
    </View>
  );
}

function MilkRow({ milk, onSaved }: { milk: Milk; onSaved: () => Promise<unknown> }) {
  const { saving, run } = useSaver(onSaved);
  const [price, setPrice] = useState(toTl(milk.extra_price));
  const [labelEn, setLabelEn] = useState(milk.label_en ?? '');
  const p = parseTl(price);
  const changed = (p !== null && p !== milk.extra_price) || labelEn.trim() !== (milk.label_en ?? '');

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
          onValueChange={(v) => run(() => saveMilk(milk.id, { is_active: v }))} trackColor={{ false: color.lineStrong, true: color.success }} thumbColor={color.surface} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2] }}>
        <View style={{ width: 120 }}><Field label="Fiyat farkı" value={price} onChangeText={setPrice} keyboardType="decimal-pad" prefix="₺" /></View>
        <View style={{ flex: 1 }}><Field label="İngilizce" value={labelEn} onChangeText={setLabelEn} maxLength={60} /></View>
      </View>
      {changed ? (
        <Button label="Kaydet" size="sm" loading={saving} disabled={p === null} style={{ alignSelf: 'flex-start' }}
          onPress={() => run(() => saveMilk(milk.id, { extra_price: p!, label_en: labelEn.trim() || null }), `${milk.label} kaydedildi.`)} />
      ) : null}
    </View>
  );
}

function CategoryRow({ category: c, count, onSaved }: { category: Category; count: number; onSaved: () => Promise<unknown> }) {
  const { saving, run } = useSaver(onSaved);
  const [nameEn, setNameEn] = useState(c.name_en ?? '');
  const changed = nameEn.trim() !== (c.name_en ?? '');
  return (
    <View style={{ paddingVertical: space[3], gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View style={{ flex: 1 }}>
          <Txt variant="body" color={c.is_active === false ? 'inkMuted' : 'ink'}>{c.name}</Txt>
          <Txt variant="caption" color="inkMuted">{count} ürün{c.is_active === false ? ' · menüde gizli' : ''}</Txt>
        </View>
        <Switch accessibilityLabel={`${c.name} menüde`} value={c.is_active !== false} disabled={saving}
          onValueChange={(v) => run(() => saveCategory(c.id, { is_active: v }))} trackColor={{ false: color.lineStrong, true: color.success }} thumbColor={color.surface} />
      </View>
      <Field label="İngilizce adı" value={nameEn} onChangeText={setNameEn} maxLength={60} />
      {changed ? (
        <Button label="Kaydet" size="sm" loading={saving} style={{ alignSelf: 'flex-start' }}
          onPress={() => run(() => saveCategory(c.id, { name_en: nameEn.trim() || null }), `${c.name} kaydedildi.`)} />
      ) : null}
    </View>
  );
}

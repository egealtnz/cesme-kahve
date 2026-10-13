// Owner: add or edit a product — photo, name, description, price, category and options.
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Coffee, Eye, Milk, Wheat } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { ToggleRow } from '@/components/Controls';
import { Card, Screen, TopBar } from '@/components/Layout';
import { ProductPhoto } from '@/components/Product';
import { Chips } from '@/components/Admin';
import { saveProduct, uploadProductPhoto, useAdminCatalogue } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { IS_DEMO } from '@/lib/supabase';
import type { Product } from '@/lib/types';
import { useToast } from '@/state/toast';
import { space } from '@/theme/tokens';

const slug = (s: string) => s.toLocaleLowerCase('tr-TR')
  .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'urun';

/** "135" or "97,50" → kuruş */
function parsePrice(text: string): number | null {
  const t = text.trim().replace(/\s|₺/g, '').replace(',', '.');
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return null;
  const v = Math.round(parseFloat(t) * 100);
  return v > 0 ? v : null;
}

export default function AdminProduct() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useAdminCatalogue(true);
  const existing = id !== 'new' ? data.data?.products.find((p) => p.id === id) : undefined;
  if (data.isLoading || (id !== 'new' && !existing)) {
    return <Screen><TopBar back />{!data.isLoading ? <Txt variant="body" style={{ marginTop: space[6] }}>Ürün bulunamadı.</Txt> : null}</Screen>;
  }
  return <ProductForm key={existing?.id ?? 'new'} product={existing} categories={data.data?.categories ?? []} />;
}

function ProductForm({ product, categories }: { product?: Product; categories: { id: string; name: string; is_drink: boolean }[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? (product.price / 100).toFixed(product.price % 100 ? 2 : 0).replace('.', ',') : '');
  const [category, setCategory] = useState(product?.category_id ?? categories[0]?.id ?? '');
  const [isCoffee, setIsCoffee] = useState(product?.is_coffee ?? false);
  const [milk, setMilk] = useState(product?.has_milk_options ?? false);
  const [fresh, setFresh] = useState(product?.badge === 'fresh');
  const [active, setActive] = useState(product?.is_active ?? true);
  const [imagePath, setImagePath] = useState<string | null>(product?.image_path ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  const [newId] = useState(() => `${slug(product?.name ?? 'urun')}-${Math.random().toString(36).slice(2, 6)}`);
  const productId = product?.id ?? newId;

  const pickPhoto = async () => {
    if (IS_DEMO) { toast('Önizlemede fotoğraf yüklenemez.'); return; }
    try {
      const ImagePicker = await import('expo-image-picker');
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setUploading(true);
      let bytes: Uint8Array;
      if (Platform.OS === 'web') {
        bytes = new Uint8Array(await (await fetch(asset.uri)).arrayBuffer());
      } else {
        const { File } = await import('expo-file-system');
        bytes = await new File(asset.uri).bytes();
      }
      if (bytes.byteLength > 2 * 1024 * 1024) { toast('Fotoğraf 2 MB’tan büyük. Daha küçük bir fotoğraf seç.'); return; }
      const type = asset.mimeType && /^image\/(jpeg|png|webp)$/.test(asset.mimeType) ? asset.mimeType : 'image/jpeg';
      const path = await uploadProductPhoto(productId, bytes, type);
      setImagePath(path);
      toast('Fotoğraf yüklendi. Kaydetmeyi unutma.');
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const kurus = parsePrice(price);
    const next = {
      name: !name.trim() ? 'Ürün adını yaz.' : undefined,
      price: kurus === null ? 'Fiyatı ₺ cinsinden yaz, ör. 135 ya da 97,50.' : undefined,
    };
    setErrors(next);
    if (next.name || next.price || !category) return;
    setSaving(true);
    try {
      const patch = {
        name: name.trim(), description: description.trim() || null, price: kurus!, category_id: category,
        is_coffee: isCoffee, has_milk_options: milk, badge: fresh ? 'fresh' as const : null, is_active: active, image_path: imagePath,
      };
      await saveProduct(product?.id ?? null, product ? patch : { ...patch, id: productId, sort: 900 });
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin-catalogue'] }), qc.invalidateQueries({ queryKey: ['catalogue'] })]);
      toast(product ? 'Ürün güncellendi.' : 'Ürün menüye eklendi.');
      router.back();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const drinkCategory = categories.find((c) => c.id === category)?.is_drink;

  return (
    <Screen keyboardShouldPersistTaps="handled" footer={<Button label={product ? 'Değişiklikleri kaydet' : 'Ürünü ekle'} loading={saving} onPress={save} />}>
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>{product ? 'Ürünü düzenle' : 'Yeni ürün'}</Txt>

      <Card style={{ marginTop: space[5], flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
        <ProductPhoto product={{ image_path: imagePath }} size={88} />
        <View style={{ flex: 1, gap: space[2] }}>
          <Txt variant="bodySm" color="inkMuted">Kare, aydınlık bir fotoğraf en iyi sonucu verir (en fazla 2 MB).</Txt>
          <Button label={imagePath ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'} icon={Camera} variant="secondary" size="sm"
            loading={uploading} onPress={pickPhoto} style={{ alignSelf: 'flex-start' }} />
        </View>
      </Card>

      <View style={{ gap: space[4], marginTop: space[5] }}>
        <Field label="Ürün adı" value={name} onChangeText={setName} error={errors.name} maxLength={60} placeholder="ör. Fındıklı Latte" />
        <Field label="Açıklama" optional value={description} onChangeText={setDescription} maxLength={200} multiline
          placeholder="Menüde ürün adının altında görünür" style={{ minHeight: 72, textAlignVertical: 'top', paddingTop: 12 }} />
        <Field label="Fiyat" value={price} onChangeText={setPrice} error={errors.price} keyboardType="decimal-pad" prefix="₺" placeholder="135" />
        <View style={{ gap: space[2] }}>
          <Txt variant="label">Kategori</Txt>
          <Chips options={categories.map((c) => ({ value: c.id, label: c.name }))} value={category} onChange={setCategory} label="Kategori" />
        </View>
      </View>

      <Card style={{ marginTop: space[5], gap: space[4] }}>
        <ToggleRow icon={Eye} tone="soft" title="Menüde göster" body="Kapalıyken müşteriler bu ürünü görmez." value={active} onChange={setActive} />
        <ToggleRow icon={Coffee} tone="soft" title="Kahve kartına damga" body="Ücretli her adet bir damga kazandırır; hediye kahve olarak da kullanılabilir." value={isCoffee} onChange={setIsCoffee} />
        <ToggleRow icon={Milk} tone="soft" title="Süt seçimi" body={drinkCategory ? 'Müşteri süt türünü seçer (bitkisel sütler ücretli).' : 'Genelde yalnızca içecekler için.'} value={milk} onChange={setMilk} />
        <ToggleRow icon={Wheat} tone="soft" title="“Bugün fırından” etiketi" value={fresh} onChange={setFresh} />
      </Card>
      <View style={{ height: space[6] }} />
    </Screen>
  );
}

// Owner: add or edit a home-screen campaign card, with a live preview of the colour.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, Trash2 } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { ToggleRow } from '@/components/Controls';
import { Card, Screen, TopBar } from '@/components/Layout';
import { Chips } from '@/components/Admin';
import { deleteCampaign, saveCampaign, useAdminCatalogue } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { Campaign } from '@/lib/types';
import { useToast } from '@/state/toast';
import { color, radius, space } from '@/theme/tokens';

const TONES: { value: Campaign['tone']; label: string }[] = [
  { value: 'primary', label: 'Lacivert' }, { value: 'copper', label: 'Bakır' }, { value: 'eco', label: 'Yeşil' }, { value: 'surface', label: 'Beyaz' },
];

export default function AdminCampaign() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useAdminCatalogue(true);
  const existing = id !== 'new' ? data.data?.campaigns.find((c) => c.id === id) : undefined;
  if (data.isLoading || (id !== 'new' && !existing)) return <Screen><TopBar back /></Screen>;
  return <CampaignForm key={existing?.id ?? 'new'} campaign={existing} />;
}

function CampaignForm({ campaign }: { campaign?: Campaign }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [tone, setTone] = useState<Campaign['tone']>(campaign?.tone ?? 'primary');
  const [eyebrow, setEyebrow] = useState(campaign?.eyebrow ?? '');
  const [title, setTitle] = useState(campaign?.title ?? '');
  const [body, setBody] = useState(campaign?.body ?? '');
  const [active, setActive] = useState(campaign?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [titleError, setTitleError] = useState<string | undefined>();

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['admin-catalogue'] }), qc.invalidateQueries({ queryKey: ['catalogue'] })]);

  const save = async () => {
    if (!title.trim()) { setTitleError('Başlık yaz.'); return; }
    setSaving(true);
    try {
      const patch = { tone, eyebrow: eyebrow.trim() || null, title: title.trim(), body: body.trim() || null, is_active: active };
      await saveCampaign(campaign?.id ?? null, campaign ? patch : { ...patch, id: `kampanya-${Date.now().toString(36)}`, sort: 50 });
      await refresh();
      toast('Kampanya kartı kaydedildi.');
      router.back();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!campaign) return;
    try {
      await deleteCampaign(campaign.id);
      await refresh();
      toast('Kampanya kartı silindi.');
      router.back();
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const bg = { primary: color.primary, eco: color.successSoft, copper: color.secondarySoft, surface: color.surface }[tone];
  const fg = tone === 'primary' ? 'onPrimary' : 'ink';

  return (
    <Screen keyboardShouldPersistTaps="handled" footer={<Button label="Kaydet" loading={saving} onPress={save} />}>
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>{campaign ? 'Kartı düzenle' : 'Yeni kampanya kartı'}</Txt>

      <View style={[styles.preview, { backgroundColor: bg }]} accessibilityLabel="Önizleme">
        {eyebrow ? <Txt variant="overline" color={tone === 'primary' ? 'onPrimary' : 'secondaryInk'}>{eyebrow}</Txt> : null}
        <Txt variant="h5" color={fg} style={{ marginTop: 4 }}>{title || 'Başlık'}</Txt>
        {body ? <Txt variant="caption" color={fg} style={{ marginTop: space[2] }}>{body}</Txt> : null}
      </View>

      <View style={{ gap: space[4], marginTop: space[5] }}>
        <View style={{ gap: space[2] }}>
          <Txt variant="label">Renk</Txt>
          <Chips options={TONES} value={tone} onChange={setTone} label="Renk" />
        </View>
        <Field label="Üst yazı" optional value={eyebrow} onChangeText={setEyebrow} maxLength={30} placeholder="ör. Bu hafta" />
        <Field label="Başlık" value={title} onChangeText={(t) => { setTitle(t); setTitleError(undefined); }} error={titleError} maxLength={60} placeholder="ör. Soğuk kahvelerde %20" />
        <Field label="Açıklama" optional value={body} onChangeText={setBody} maxLength={120} placeholder="Kısa bir cümle" />
      </View>
      <Card style={{ marginTop: space[5] }}>
        <ToggleRow icon={Eye} tone="soft" title="Ana sayfada göster" value={active} onChange={setActive} />
      </Card>

      {campaign ? (
        confirmDelete ? (
          <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center', marginTop: space[5], marginBottom: space[8] }}>
            <Txt variant="bodySm" style={{ flex: 1 }}>Bu kart silinsin mi?</Txt>
            <Button label="Vazgeç" variant="secondary" size="sm" onPress={() => setConfirmDelete(false)} />
            <Button label="Sil" variant="danger" size="sm" onPress={remove} />
          </View>
        ) : (
          <Button label="Kartı sil" icon={Trash2} variant="tertiary" size="sm" style={{ marginTop: space[5], marginBottom: space[8], alignSelf: 'flex-start' }}
            onPress={() => setConfirmDelete(true)} />
        )
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { marginTop: space[5], width: 272, minHeight: 120, borderRadius: radius.lg, padding: space[4], boxShadow: '0px 2px 8px rgba(0, 40, 62, 0.10)' },
});

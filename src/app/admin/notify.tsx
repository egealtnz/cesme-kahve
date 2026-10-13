// Owner: send an offer as a push notification to customers who agreed to marketing messages.
import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Send, Users } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Card, Divider, Screen, TopBar } from '@/components/Layout';
import { adminStyles, Chips } from '@/components/Admin';
import { sendPushCampaign, useCatalogue, usePushAudience, usePushCampaigns } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { shortDate, timeOf } from '@/lib/format';
import { useToast } from '@/state/toast';
import { color, space } from '@/theme/tokens';

export default function AdminNotify() {
  const { data: cat } = useCatalogue();
  const qc = useQueryClient();
  const toast = useToast();
  const [branchId, setBranchId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audience = usePushAudience(branchId);
  const history = usePushCampaigns();

  const options = [{ value: null as string | null, label: 'Tüm müşteriler' },
    ...(cat?.branches.filter((b) => b.status === 'open').map((b) => ({ value: b.id as string | null, label: `${b.name} müdavimleri` })) ?? [])];
  const reachable = audience.data?.reachable ?? 0;

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const r = await sendPushCampaign(title, body, branchId);
      toast(`Bildirim ${r.recipients} müşteriye gönderiliyor.`);
      setTitle(''); setBody(''); setConfirm(false);
      qc.invalidateQueries({ queryKey: ['push-campaigns'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const ready = title.trim().length > 0 && body.trim().length > 0;

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>Bildirim gönder</Txt>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>
        Yalnızca kampanya iletisine izin veren ve bildirimleri açık olan müşterilere gider. Aynı anda birden fazla göndermemek için iki bildirim arasında en az 10 dakika olmalı.
      </Txt>

      <Txt variant="label" style={{ marginTop: space[5], marginBottom: space[2] }}>Kime?</Txt>
      <Chips options={options} value={branchId} onChange={(v) => { setBranchId(v); setConfirm(false); }} label="Hedef kitle" />
      <Card tone="soft" style={{ marginTop: space[3], flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <Users size={20} color={color.ink} strokeWidth={1.75} />
        <Txt variant="bodySm" style={{ flex: 1 }}>
          {audience.isLoading ? 'Hesaplanıyor…'
            : `${reachable} müşteriye ulaşır${audience.data && audience.data.opted_in > reachable ? ` (izin veren ${audience.data.opted_in} kişiden bildirimi açık olanlar)` : ''}.`}
        </Txt>
      </Card>

      <View style={{ gap: space[4], marginTop: space[5] }}>
        <Field label="Başlık" value={title} onChangeText={(t) => { setTitle(t); setConfirm(false); }} maxLength={60}
          placeholder="ör. Soğuk kahvelerde %20 ☀️" hint={`${title.length}/60`} />
        <Field label="Mesaj" value={body} onChangeText={(t) => { setBody(t); setConfirm(false); }} maxLength={180} multiline
          placeholder="ör. Bugün saat 18:00'e kadar tüm şubelerde." hint={`${body.length}/180`}
          style={{ minHeight: 72, textAlignVertical: 'top', paddingTop: 12 }} />
      </View>

      {ready ? (
        <View style={[adminStyles.card, { marginTop: space[5], gap: 4 }]} accessibilityLabel="Bildirim önizlemesi">
          <Txt variant="caption" color="inkMuted">Önizleme</Txt>
          <Txt variant="label">{title}</Txt>
          <Txt variant="bodySm">{body}</Txt>
        </View>
      ) : null}

      {error ? <Txt variant="bodySm" color="error" style={{ marginTop: space[3] }}>{error}</Txt> : null}
      {confirm ? (
        <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center', marginTop: space[4] }}>
          <Txt variant="bodySm" style={{ flex: 1 }}>{reachable} müşteriye şimdi gönderilsin mi?</Txt>
          <Button label="Vazgeç" variant="secondary" size="sm" onPress={() => setConfirm(false)} />
          <Button label="Gönder" icon={Send} size="sm" loading={sending} onPress={send} />
        </View>
      ) : (
        <Button label="Gönder" icon={Send} disabled={!ready || reachable === 0} style={{ marginTop: space[4] }} onPress={() => setConfirm(true)} />
      )}

      <Txt variant="h5" accessibilityRole="header" style={adminStyles.h}>Gönderilenler</Txt>
      <Card style={{ paddingVertical: 0, marginBottom: space[8] }}>
        {history.data?.length ? history.data.map((c, i) => (
          <View key={c.id}>
            {i > 0 ? <Divider /> : null}
            <View style={{ paddingVertical: space[3], gap: 2 }}>
              <Txt variant="label">{c.title}</Txt>
              <Txt variant="bodySm" color="inkMuted" numberOfLines={2}>{c.body}</Txt>
              <Txt variant="caption" color="inkMuted">
                {shortDate(c.created_at)} {timeOf(c.created_at)} · {c.recipients} kişi{c.branch_id ? ` · ${cat?.branches.find((b) => b.id === c.branch_id)?.name ?? ''}` : ''}
              </Txt>
            </View>
          </View>
        )) : <Txt variant="bodySm" color="inkMuted" style={{ paddingVertical: space[3] }}>Henüz bildirim gönderilmedi.</Txt>}
      </Card>
    </Screen>
  );
}

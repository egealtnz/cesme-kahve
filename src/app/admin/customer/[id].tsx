// Company panel: one customer — contact, coffee card, free coffees, recent orders — and two owner actions:
// send a free coffee (the customer gets a notification) and correct the stamps on the card.
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Gift, Mail, Minus, Phone, Plus, Stamp } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Field } from '@/components/Field';
import { Card, Divider, Screen, TopBar } from '@/components/Layout';
import { Chips, Stat } from '@/components/Admin';
import { AdminOrderRow } from '@/components/AdminOrderRow';
import { adjustStamps, giftReward, useCatalogue, useCustomerDetail } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatPhone, shortDate, tl } from '@/lib/format';
import { useToast } from '@/state/toast';
import { color, radius, space } from '@/theme/tokens';

const REASON = { stamps: 'Kart doldu', birthday: 'Doğum günü', gift: 'Hediye' } as const;
const ROLE = { admin: 'Yönetici', manager: 'Şube müdürü', barista: 'Barista' } as const;

export default function AdminCustomer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useCustomerDetail(id);
  const { data: cat } = useCatalogue();
  const qc = useQueryClient();
  const toast = useToast();
  const [giftOpen, setGiftOpen] = useState(false);
  const [days, setDays] = useState(30);
  const [message, setMessage] = useState('');
  const [delta, setDelta] = useState(0);
  const [busy, setBusy] = useState<'gift' | 'stamps' | null>(null);
  const c = detail.data;

  if (!c) {
    return (
      <Screen>
        <TopBar back />
        {detail.isLoading ? <ActivityIndicator color={color.ink} style={{ marginTop: space[6] }} /> : null}
        {detail.isError ? <Txt variant="bodySm" color="error" style={{ marginTop: space[6] }}>{errorMessage(detail.error)}</Txt> : null}
      </Screen>
    );
  }
  const per = cat?.settings.stamps_per_reward ?? 10;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['admin-customer', id] }), qc.invalidateQueries({ queryKey: ['admin-customers'] })]);

  const sendGift = async () => {
    setBusy('gift');
    try {
      await giftReward(c.id, days, message.trim() || null);
      toast(`${c.first_name} için hediye kahve eklendi; bildirim gönderiliyor.`);
      setGiftOpen(false); setMessage('');
      await refresh();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const saveStamps = async () => {
    setBusy('stamps');
    try {
      const r = await adjustStamps(c.id, delta);
      toast(r.rewards_earned ? `Kart doldu: ${r.rewards_earned} hediye kahve eklendi. Kartta ${r.stamps} damga var.` : `Kartta artık ${r.stamps} damga var.`);
      setDelta(0);
      await refresh();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <TopBar back />
      <Txt variant="overline" color="secondaryInk" style={{ marginTop: space[5] }}>Müşteri · üye {shortDate(c.created_at)}</Txt>
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>{c.first_name} {c.last_name === '-' ? '' : c.last_name}</Txt>
      <View style={{ gap: 6, marginTop: space[3] }}>
        {c.email ? <Line icon={Mail} text={c.email} /> : null}
        {c.phone ? <Line icon={Phone} text={`0${formatPhone(c.phone)}`} /> : null}
        <Txt variant="caption" color="inkMuted">
          Üye kodu {c.member_code}{c.favorite_branch ? ` · favori şube: ${c.favorite_branch}` : ''}
          {c.birthday ? ' · doğum günü kayıtlı' : ''} · kampanya iletisi: {c.marketing_opt_in ? 'izin verdi' : 'izin yok'}
        </Txt>
        {c.staff.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {c.staff.map((s) => (
              <Badge key={`${s.branch_id}-${s.role}`} tone="fresh" icon={null}
                label={`${ROLE[s.role]}${s.branch_id ? ` · ${cat?.branches.find((b) => b.id === s.branch_id)?.name ?? s.branch_id}` : ''}`} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[5] }}>
        <Stat label="Teslim edilen sipariş" value={String(c.stats.orders)} sub={c.stats.cancelled ? `${c.stats.cancelled} iptal` : undefined} />
        <Stat label="Toplam harcama" value={tl(c.stats.spent)} sub={c.stats.orders ? `ort. ${tl(Math.round(c.stats.spent / c.stats.orders))}` : undefined} />
        <Stat label="Kahve kartı" value={`${c.stamps}/${per}`} />
        <Stat label="Hediye kahve" value={String(c.rewards.length)} />
      </View>

      {/* free coffees */}
      <Txt variant="h5" accessibilityRole="header" style={styles.h}>Hediye kahveler</Txt>
      <Card style={{ gap: space[3] }}>
        {c.rewards.length === 0 ? <Txt variant="bodySm" color="inkMuted">Kullanılmamış hediye kahvesi yok.</Txt> : null}
        {c.rewards.map((r) => (
          <View key={r.code} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <Gift size={18} color={color.secondaryInk} strokeWidth={1.75} />
            <Txt variant="bodySm" style={{ flex: 1 }}>{REASON[r.reason] ?? r.reason} · kod {r.code}</Txt>
            <Txt variant="caption" color="inkMuted">son gün {shortDate(r.expires_at)}</Txt>
          </View>
        ))}
        {giftOpen ? (
          <View style={{ gap: space[3] }}>
            <Divider />
            <Txt variant="label">Kaç gün geçerli olsun?</Txt>
            <Chips options={[7, 30, 90].map((n) => ({ value: n, label: `${n} gün` }))} value={days} onChange={setDays} label="Geçerlilik" />
            <Field label="Bildirim mesajı" optional value={message} onChangeText={setMessage} maxLength={160} multiline
              placeholder="ör. Bugünkü bekleme için özür dileriz, bir kahve bizden."
              hint="Boş bırakırsan standart mesaj gider." style={{ minHeight: 64, textAlignVertical: 'top', paddingTop: 12 }} />
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Button label="Vazgeç" variant="secondary" size="md" onPress={() => setGiftOpen(false)} />
              <Button label="Hediye kahveyi gönder" icon={Gift} size="md" loading={busy === 'gift'} onPress={sendGift} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <Button label="Hediye kahve gönder" icon={Gift} variant="secondary" size="md" onPress={() => setGiftOpen(true)} />
        )}
      </Card>

      {/* stamps */}
      <Txt variant="h5" accessibilityRole="header" style={styles.h}>Damga düzelt</Txt>
      <Card style={{ gap: space[3] }}>
        <Txt variant="bodySm" color="inkMuted">
          Okutulmayan bir alışveriş ya da yanlış damga için. {per} damga dolunca otomatik olarak hediye kahveye dönüşür.
        </Txt>
        <View style={styles.stepper}>
          <StepButton icon={Minus} label="Bir damga eksilt" disabled={c.stamps + delta <= 0} onPress={() => setDelta((d) => d - 1)} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Txt variant="h3" style={{ fontVariant: ['tabular-nums'] }}>{delta > 0 ? `+${delta}` : delta}</Txt>
            <Txt variant="caption" color="inkMuted">kartta {c.stamps} → {c.stamps + delta}</Txt>
          </View>
          <StepButton icon={Plus} label="Bir damga ekle" disabled={delta >= 50} onPress={() => setDelta((d) => d + 1)} />
        </View>
        <Button label="Kaydet" icon={Stamp} size="md" disabled={delta === 0} loading={busy === 'stamps'} onPress={saveStamps} />
      </Card>

      {/* orders */}
      <Txt variant="h5" accessibilityRole="header" style={styles.h}>Son siparişler</Txt>
      <Card style={{ paddingVertical: 0, marginBottom: space[8] }}>
        {c.orders.length === 0 ? <Txt variant="bodySm" color="inkMuted" style={{ paddingVertical: space[3] }}>Henüz sipariş yok.</Txt> : null}
        {c.orders.map((o, i) => (
          <View key={o.id}>
            {i > 0 ? <Divider /> : null}
            <AdminOrderRow o={o} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function Line({ icon: Icon, text }: { icon: typeof Mail; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <Icon size={16} color={color.inkMuted} strokeWidth={1.75} />
      <Txt variant="bodySm" selectable>{text}</Txt>
    </View>
  );
}

function StepButton({ icon: Icon, label, onPress, disabled }: { icon: typeof Plus; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} hitSlop={6}
      style={({ pressed }) => [styles.step, (pressed || disabled) && { opacity: disabled ? 0.35 : 0.7 }]}>
      <Icon size={20} color={color.ink} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  h: { marginTop: space[6], marginBottom: space[2] },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  step: { width: 48, height: 48, borderRadius: radius.full, backgroundColor: color.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
});

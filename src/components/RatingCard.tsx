// "Nasıldı?" — a thumbs up / down and an optional note after pickup (within 7 days). The branch sees it.
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ThumbsDown, ThumbsUp } from 'lucide-react-native';
import { Txt } from './Txt';
import { Button } from './Button';
import { Card } from './Layout';
import { rateOrder } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { Order } from '@/lib/types';
import { useToast } from '@/state/toast';
import { color, font, radius, space } from '@/theme/tokens';
import { L } from '@/lib/i18n';

export function canRate(o: Order): boolean {
  return o.status === 'collected' && !!o.collected_at && Date.parse(o.collected_at) > Date.now() - 7 * 86_400_000;
}

export function RatingCard({ order, compact }: { order: Order; compact?: boolean }) {
  const existing = order.order_ratings ?? null;
  const [liked, setLiked] = useState<boolean | null>(existing?.liked ?? null);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!existing);
  const qc = useQueryClient();
  const toast = useToast();

  const save = async (value: boolean, note: string) => {
    setSaving(true);
    try {
      await rateOrder(order.id, value, note.trim() || null);
      setSaved(true);
      qc.invalidateQueries({ queryKey: ['order', order.id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      toast(L('Teşekkürler! Görüşün şubeye iletildi.', 'Thank you! Your feedback went to the branch.'));
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const pick = (value: boolean) => {
    setLiked(value);
    setSaved(false);
    if (value && !comment.trim()) save(true, '');   // a thumbs up needs no note
  };

  return (
    <Card style={{ gap: space[3] }}>
      <View>
        <Txt variant="h6" accessibilityRole="header">{saved ? L('Değerlendirmen için teşekkürler', 'Thanks for your feedback') : compact ? L(`#${order.order_no} nasıldı?`, `How was #${order.order_no}?`) : L('Siparişin nasıldı?', 'How was your order?')}</Txt>
        <Txt variant="bodySm" color="inkMuted">{L('Görüşün doğrudan şubeye iletilir.', 'Your feedback goes straight to the branch.')}</Txt>
      </View>
      <View style={styles.row}>
        {([true, false] as const).map((v) => {
          const on = liked === v;
          const Icon = v ? ThumbsUp : ThumbsDown;
          return (
            <Pressable key={String(v)} accessibilityRole="radio" accessibilityState={{ selected: on }}
              accessibilityLabel={v ? L('Beğendim', 'Liked it') : L('Beğenmedim', 'Didn’t like it')} onPress={() => pick(v)}
              style={[styles.thumb, on && (v ? styles.up : styles.down)]}>
              <Icon size={22} color={on ? color.onPrimary : color.ink} strokeWidth={1.75} />
              <Txt variant="label" color={on ? 'onPrimary' : 'ink'}>{v ? L('Beğendim', 'Liked it') : L('Beğenmedim', 'Didn’t like it')}</Txt>
            </Pressable>
          );
        })}
      </View>
      {liked !== null && (liked === false || comment || !saved) ? (
        <>
          <TextInput
            value={comment}
            onChangeText={(t) => { setComment(t); setSaved(false); }}
            placeholder={liked ? L('Eklemek istediğin bir şey var mı? (isteğe bağlı)', 'Anything to add? (optional)') : L('Ne olmadı? Anlatırsan şube düzeltsin.', 'What went wrong? Tell us so the branch can fix it.')}
            placeholderTextColor={color.inkMuted}
            multiline
            maxLength={500}
            accessibilityLabel={L('Yorum', 'Comment')}
            style={styles.input}
          />
          {!saved ? (
            <Button label={L('Gönder', 'Send')} size="md" loading={saving} onPress={() => save(liked, comment)} style={{ alignSelf: 'flex-start' }} />
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space[2] },
  thumb: {
    flex: 1, flexDirection: 'row', gap: space[2], alignItems: 'center', justifyContent: 'center', minHeight: 48,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: color.lineStrong,
  },
  up: { backgroundColor: color.success, borderColor: color.success },
  down: { backgroundColor: color.error, borderColor: color.error },
  input: {
    minHeight: 72, borderWidth: 1.5, borderColor: color.lineStrong, borderRadius: radius.sm, padding: space[3],
    fontFamily: font.regular, fontSize: 16, color: color.ink, textAlignVertical: 'top', backgroundColor: color.surface,
  },
});

import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { Coffee, Gift, QrCode as QrIcon, ShoppingBag } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { QrCode, StampRow } from '@/components/Qr';
import { Card, Screen, TopBar } from '@/components/Layout';
import { useCatalogue, useRewards } from '@/lib/api';
import { shortDate } from '@/lib/format';
import { useAuth } from '@/state/auth';
import { useCart } from '@/state/cart';
import { color, radius, space } from '@/theme/tokens';
import { FadeIn, Pop, PressableScale } from '@/components/Motion';
import { L } from '@/lib/i18n';

export default function LoyaltyScreen() {
  const qc = useQueryClient();
  useFocusEffect(useCallback(() => {
    for (const key of [['profile'], ['rewards']]) qc.invalidateQueries({ queryKey: key });
  }, [qc]));
  const { session, userId, profile } = useAuth();
  const { data: cat } = useCatalogue();
  const rewards = useRewards(userId);
  const cart = useCart();
  const [shown, setShown] = useState<string | null>(null);   // reward id whose QR is open
  if (!session) return <Redirect href={{ pathname: '/auth/sign-in', params: { next: '/loyalty' } }} />;

  const perReward = cat?.settings.stamps_per_reward ?? 10;
  const days = cat?.settings.reward_valid_days ?? 90;
  const stamps = profile?.stamps ?? 0;
  const list = rewards.data ?? [];
  const reward = list.find((r) => r.id === shown) ?? null;

  return (
    <Screen>
      <TopBar back />
      <Txt variant="overline" color="secondaryInk" style={{ marginTop: space[5] }}>{L('Sadakat', 'Loyalty')}</Txt>
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>{L('Kahve kartın', 'Your coffee card')}</Txt>

      <Card tone="soft" style={{ marginTop: space[6], gap: space[2] }}>
        <View style={styles.between}>
          <Txt variant="h5">{L(`${stamps} / ${perReward} damga`, `${stamps} / ${perReward} stamps`)}</Txt>
          <Coffee size={20} color={color.ink} strokeWidth={1.75} />
        </View>
        <Txt variant="bodySm">{L(`${perReward - stamps} kahve daha, sonraki kahve bizden.`, `${perReward - stamps} more and the next coffee is on us.`)}</Txt>
        <View style={{ marginTop: space[1] }}><StampRow filled={stamps} total={perReward} /></View>
      </Card>

      <Card style={{ marginTop: space[4], alignItems: 'center', gap: space[3] }}>
        <Txt variant="h6" center>{L('Kasada okut, damganı topla', 'Scan at the counter, collect your stamp')}</Txt>
        {profile ? <Pop from={0.85} delay={80}><QrCode value={`CK-M:${profile.member_code}`} size={180} label={L('Kahve kartı QR kodu', 'Coffee card QR code')} /></Pop> : null}
        <Txt variant="label" style={{ letterSpacing: 3, fontVariant: ['tabular-nums'] }}>{profile?.member_code.replace(/(.{5})/, '$1 ')}</Txt>
        <Txt variant="caption" color="inkMuted" center>{L('Kasadan aldığın kahveler için bu kodu baristaya göster.', 'Show this code to the barista for coffees you buy at the counter.')}</Txt>
      </Card>

      <Txt variant="h4" accessibilityRole="header" style={{ marginTop: space[8], marginBottom: space[3] }}>
        {L('Hediye kahvelerin', 'Your free coffees')}{list.length ? ` · ${list.length}` : ''}
      </Txt>
      {list.length === 0 ? (
        <Card><Txt variant="bodySm" color="inkMuted">{L('Henüz hediye kahven yok. Kartın dolunca burada görünecek.', 'No free coffees yet. They appear here when your card is full.')}</Txt></Card>
      ) : (
        <View style={{ gap: space[2] }}>
          {list.map((r, i) => (
            <FadeIn key={r.id} index={i}>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={L(`Hediye kahve, son kullanma ${shortDate(r.expires_at)}. Kasada kullanmak için QR kodu göster`, `Free coffee, use by ${shortDate(r.expires_at)}. Show the QR code at the counter`)}
                onPress={() => setShown(shown === r.id ? null : r.id)}
                style={styles.reward}
              >
                <View style={styles.rewardDisc}><Coffee size={18} color={color.onSecondary} strokeWidth={1.75} /></View>
                <View style={{ flex: 1 }}>
                  <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }}>{r.reason === 'birthday' ? L('Doğum günü kahven 🎂', 'Your birthday coffee 🎂') : r.reason === 'gift' ? L('Bizden bir kahve ☕', 'A coffee on us ☕') : L('Hediye kahve', 'Free coffee')}</Txt>
                  <Txt variant="caption" color="inkMuted">{L('Son kullanma', 'Use by')} {shortDate(r.expires_at)}</Txt>
                </View>
                <QrIcon size={22} color={color.ink} strokeWidth={1.75} />
              </PressableScale>
              {reward?.id === r.id ? (
                <FadeIn>
                <Card style={{ alignItems: 'center', gap: space[3], marginTop: space[2] }}>
                  <Txt variant="h6">{L('Kasada kullan', 'Use at the counter')}</Txt>
                  <Pop from={0.8}><QrCode value={`CK-R:${r.code}`} size={200} label={L(`Hediye kahve QR kodu, kod ${r.code}`, `Free coffee QR code, code ${r.code}`)} /></Pop>
                  <Txt variant="h3" style={{ letterSpacing: 6 }}>{r.code.slice(0, 3)} {r.code.slice(3)}</Txt>
                  <Txt variant="caption" color="inkMuted" center>{L('Baristaya göster. Okutulduğunda hediye kahven hesabından düşer.', 'Show it to the barista. Once scanned, the free coffee is used up.')}</Txt>
                </Card>
                </FadeIn>
              ) : null}
            </FadeIn>
          ))}
          <Button label={L('Siparişte kullan', 'Use in an order')} icon={ShoppingBag} style={{ marginTop: space[2] }}
            onPress={() => { cart.setUseRewards(Math.max(cart.useRewards, 1)); router.navigate(cart.lines.length ? '/cart' : '/'); }} />
        </View>
      )}

      <Txt variant="h4" accessibilityRole="header" style={{ marginTop: space[8], marginBottom: space[3] }}>{L('Nasıl çalışır?', 'How it works')}</Txt>
      <Card style={{ gap: space[2] }}>
        {[
          L('Ödediğin her kahve kartına 1 damga ekler.', 'Every coffee you pay for adds 1 stamp.'),
          L(`${perReward} damgada 1 hediye kahve kazanırsın; ${days} gün geçerlidir.`, `${perReward} stamps earn a free coffee, valid for ${days} days.`),
          L('Hediye kahve menüdeki tüm kahvelerde geçerli, süt seçimi dahil.', 'A free coffee works for any coffee on the menu, milk and extras included.'),
          L('Uygulamadan siparişte ya da kasada QR kodla kullanabilirsin.', 'Use it in an app order or with the QR code at the counter.'),
          L('Hediye kahveden damga kazanılmaz; “İkinci kahve” indirimiyle aynı kahvede birleşmez.', 'Free coffees earn no stamps and do not combine with the “second coffee” discount on the same coffee.'),
          L('Kasada ödediğin siparişlerin damgası, siparişi teslim aldığında eklenir.', 'For pay-at-counter orders, stamps are added when you get your order.'),
        ].map((t) => (
          <View key={t} style={{ flexDirection: 'row', gap: space[2] }}>
            <Gift size={16} color={color.secondaryInk} strokeWidth={1.75} style={{ marginTop: 3 }} />
            <Txt variant="bodySm" style={{ flex: 1 }}>{t}</Txt>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reward: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.md, backgroundColor: color.surface },
  rewardDisc: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.secondary, alignItems: 'center', justifyContent: 'center' },
});

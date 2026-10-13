import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
      <Txt variant="overline" color="secondaryInk" style={{ marginTop: space[5] }}>Sadakat</Txt>
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>Kahve kartın</Txt>

      <Card tone="soft" style={{ marginTop: space[6], gap: space[2] }}>
        <View style={styles.between}>
          <Txt variant="h5">{stamps} / {perReward} damga</Txt>
          <Coffee size={20} color={color.ink} strokeWidth={1.75} />
        </View>
        <Txt variant="bodySm">{perReward - stamps} kahve daha, sonraki kahve bizden.</Txt>
        <View style={{ marginTop: space[1] }}><StampRow filled={stamps} total={perReward} /></View>
      </Card>

      <Card style={{ marginTop: space[4], alignItems: 'center', gap: space[3] }}>
        <Txt variant="h6" center>Kasada okut, damganı topla</Txt>
        {profile ? <QrCode value={`CK-M:${profile.member_code}`} size={180} label="Kahve kartı QR kodu" /> : null}
        <Txt variant="label" style={{ letterSpacing: 3, fontVariant: ['tabular-nums'] }}>{profile?.member_code.replace(/(.{5})/, '$1 ')}</Txt>
        <Txt variant="caption" color="inkMuted" center>Kasadan aldığın kahveler için bu kodu baristaya göster.</Txt>
      </Card>

      <Txt variant="h4" accessibilityRole="header" style={{ marginTop: space[8], marginBottom: space[3] }}>
        Hediye kahvelerin{list.length ? ` · ${list.length}` : ''}
      </Txt>
      {list.length === 0 ? (
        <Card><Txt variant="bodySm" color="inkMuted">Henüz hediye kahven yok. Kartın dolunca burada görünecek.</Txt></Card>
      ) : (
        <View style={{ gap: space[2] }}>
          {list.map((r) => (
            <View key={r.id}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Hediye kahve, son kullanma ${shortDate(r.expires_at)}. Kasada kullanmak için QR kodu göster`}
                onPress={() => setShown(shown === r.id ? null : r.id)}
                style={({ pressed }) => [styles.reward, pressed && { opacity: 0.9 }]}
              >
                <View style={styles.rewardDisc}><Coffee size={18} color={color.onSecondary} strokeWidth={1.75} /></View>
                <View style={{ flex: 1 }}>
                  <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }}>{r.reason === 'birthday' ? 'Doğum günü kahven 🎂' : 'Hediye kahve'}</Txt>
                  <Txt variant="caption" color="inkMuted">Son kullanma {shortDate(r.expires_at)}</Txt>
                </View>
                <QrIcon size={22} color={color.ink} strokeWidth={1.75} />
              </Pressable>
              {reward?.id === r.id ? (
                <Card style={{ alignItems: 'center', gap: space[3], marginTop: space[2] }}>
                  <Txt variant="h6">Kasada kullan</Txt>
                  <QrCode value={`CK-R:${r.code}`} size={200} label={`Hediye kahve QR kodu, kod ${r.code}`} />
                  <Txt variant="h3" style={{ letterSpacing: 6 }}>{r.code.slice(0, 3)} {r.code.slice(3)}</Txt>
                  <Txt variant="caption" color="inkMuted" center>Baristaya göster. Okutulduğunda hediye kahven hesabından düşer.</Txt>
                </Card>
              ) : null}
            </View>
          ))}
          <Button label="Siparişte kullan" icon={ShoppingBag} style={{ marginTop: space[2] }}
            onPress={() => { cart.setUseRewards(Math.max(cart.useRewards, 1)); router.navigate(cart.lines.length ? '/cart' : '/'); }} />
        </View>
      )}

      <Txt variant="h4" accessibilityRole="header" style={{ marginTop: space[8], marginBottom: space[3] }}>Nasıl çalışır?</Txt>
      <Card style={{ gap: space[2] }}>
        {[
          'Ödediğin her kahve kartına 1 damga ekler.',
          `${perReward} damgada 1 hediye kahve kazanırsın; ${days} gün geçerlidir.`,
          'Hediye kahve menüdeki tüm kahvelerde geçerli, süt seçimi dahil.',
          'Uygulamadan siparişte ya da kasada QR kodla kullanabilirsin.',
          'Hediye kahveden damga kazanılmaz; “İkinci kahve” indirimiyle aynı kahvede birleşmez.',
          'Kasada ödediğin siparişlerin damgası, siparişi teslim aldığında eklenir.',
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

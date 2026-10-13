import { useCallback } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Bell, Briefcase, ChevronRight, CircleHelp, FileText, Gift, LogIn, LogOut, MapPin, Receipt, Shield, Store, Trash2, UserPen, UserPlus } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { StampRow } from '@/components/Qr';
import { Card, ListRow, TopBar } from '@/components/Layout';
import { useCatalogue, useMyOrders, useRewards } from '@/lib/api';
import { IS_DEMO } from '@/lib/supabase';
import { DemoNote } from '@/components/Demo';
import { tl, timeOf, shortDate } from '@/lib/format';
import type { Order } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { useCart } from '@/state/cart';
import { useToast } from '@/state/toast';
import { notificationsAllowed, registerForOrderNotifications } from '@/lib/notifications';
import { color, radius, space } from '@/theme/tokens';

const STATUS_LABEL: Record<Order['status'], string> = {
  awaiting_payment: 'Ödeme bekleniyor', placed: 'Alındı', preparing: 'Hazırlanıyor', ready: 'Hazır', collected: 'Teslim alındı', cancelled: 'İptal edildi',
};

export default function ProfileScreen() {
  const qc = useQueryClient();
  useFocusEffect(useCallback(() => {
    for (const key of [['profile'], ['rewards'], ['orders']]) qc.invalidateQueries({ queryKey: key });
  }, [qc]));
  const insets = useSafeAreaInsets();
  const { session, userId, email, profile, isStaff, staff, signOut } = useAuth();
  const isAdmin = staff.some((s) => s.role === 'admin');
  const { data: cat } = useCatalogue();
  const rewards = useRewards(userId);
  const orders = useMyOrders(userId);
  const cart = useCart();
  const toast = useToast();
  const perReward = cat?.settings.stamps_per_reward ?? 10;
  const resetPreview = async () => {
    if (process.env.EXPO_PUBLIC_DEMO !== '1') return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    await require('@/lib/demo/client').resetDemo();
    cart.clear();
    qc.clear();
  };
  const favorite = cat?.branches.find((b) => b.id === (profile?.favorite_branch_id ?? cart.branchId));
  const legal = (
    <>
      <Txt variant="h4" accessibilityRole="header" style={styles.h}>Yardım ve yasal</Txt>
      <Card style={{ padding: 0 }}>
        <ListRow icon={CircleHelp} label="Yardım ve iletişim" onPress={() => router.push('/legal/yardim')} />
        <ListRow icon={Shield} label="KVKK Aydınlatma Metni" onPress={() => router.push('/legal/kvkk')} />
        <ListRow icon={Shield} label="Gizlilik Politikası" onPress={() => router.push('/legal/gizlilik')} />
        <ListRow icon={FileText} label="Kullanım Koşulları" onPress={() => router.push('/legal/kullanim-kosullari')} last />
      </Card>
    </>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 64 + insets.bottom + space[8] }} showsVerticalScrollIndicator={false}>
        <TopBar />
        <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[4] }}>Profil</Txt>

        {!session ? (
          <>
            <Card tone="primary" style={{ marginTop: space[6], gap: space[2], overflow: 'hidden' }}>
              <Txt variant="overline" color="onPrimary">Üyelik</Txt>
              <Txt variant="h4" color="onPrimary" style={{ maxWidth: 240 }}>Üye ol, kahve kartın seninle gelsin</Txt>
              <Txt variant="bodySm" color="onPrimary" style={{ maxWidth: 270 }}>
                Ödediğin her kahve bir damga; {perReward} damgada bir kahve bizden. Siparişlerin her cihazda.
              </Txt>
              <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[3] }}>
                <Button label="Üye ol" variant="accent" size="md" icon={UserPlus} onPress={() => router.push('/auth/sign-up')} />
                <Pressable accessibilityRole="button" onPress={() => router.push('/auth/sign-in')} style={styles.ghost}>
                  <LogIn size={20} color={color.onPrimary} strokeWidth={1.75} />
                  <Txt variant="button" color="onPrimary">Giriş yap</Txt>
                </Pressable>
              </View>
              <View style={styles.ring} />
              <View style={styles.disc} />
            </Card>
            {legal}
          </>
        ) : (
          <>
            <View style={styles.who}>
              <View style={styles.avatar}>
                <Txt variant="h4">{profile ? `${profile.first_name[0] ?? ''}${profile.last_name[0] ?? ''}`.toLocaleUpperCase('tr-TR') : ''}</Txt>
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="h4">{profile ? `${profile.first_name} ${profile.last_name}` : ''}</Txt>
                <Txt variant="bodySm" color="inkMuted" numberOfLines={1}>{email}</Txt>
              </View>
            </View>

            <Pressable accessibilityRole="button" accessibilityLabel="Kahve kartın" onPress={() => router.push('/loyalty')}>
              <Card tone="soft" style={{ marginTop: space[6], gap: space[2] }}>
                <View style={styles.between}>
                  <Txt variant="h5">Kahve kartın</Txt>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Txt variant="label" style={{ fontVariant: ['tabular-nums'] }}>{profile?.stamps ?? 0} / {perReward}</Txt>
                    <ChevronRight size={18} color={color.ink} strokeWidth={1.75} />
                  </View>
                </View>
                <Txt variant="bodySm">{perReward - (profile?.stamps ?? 0)} kahve daha, sonraki kahve bizden.</Txt>
                <View style={{ marginTop: space[1] }}><StampRow filled={profile?.stamps ?? 0} total={perReward} /></View>
                {rewards.data?.length ? <View style={{ marginTop: space[2] }}><Badge tone="gift" label={`${rewards.data.length} hediye kahven var`} /></View> : null}
                <Txt variant="caption" style={{ marginTop: space[1] }}>Kasada okutmak için dokun</Txt>
              </Card>
            </Pressable>

            {isStaff ? (
              <Button label="Şube ekranını aç" icon={Store} variant="secondary" size="md" style={{ marginTop: space[4] }} onPress={() => router.navigate('/staff')} />
            ) : null}
            {isAdmin ? (
              <Button label="İşletme yönetimi" icon={Briefcase} variant="secondary" size="md" style={{ marginTop: space[2] }} onPress={() => router.push('/admin')} />
            ) : null}

            <Txt variant="h4" accessibilityRole="header" style={styles.h}>Siparişlerim</Txt>
            {orders.data?.length ? (
              <Card style={{ padding: 0 }}>
                {orders.data.slice(0, 10).map((o, i, arr) => (
                  <Pressable
                    key={o.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Sipariş ${o.order_no}, ${STATUS_LABEL[o.status]}, ${tl(o.total)}`}
                    onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}
                    style={({ pressed }) => [styles.order, i < arr.length - 1 && styles.line, pressed && { backgroundColor: color.surfaceMuted }]}
                  >
                    <Receipt size={20} color={color.inkMuted} strokeWidth={1.75} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={styles.between}>
                        <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }}>#{o.order_no}</Txt>
                        <Txt variant="h6" style={{ fontVariant: ['tabular-nums'] }}>{tl(o.total)}</Txt>
                      </View>
                      <Txt variant="bodySm" color="inkMuted" numberOfLines={1}>
                        {o.order_items?.map((it) => `${it.quantity}× ${it.product_name}`).join(', ')}
                      </Txt>
                      <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center', marginTop: 2 }}>
                        <Badge tone={o.status === 'ready' ? 'success' : o.status === 'collected' || o.status === 'cancelled' ? 'neutral' : 'warning'}
                          label={STATUS_LABEL[o.status]} />
                        <Txt variant="caption" color="inkMuted">{o.branch?.name} · {shortDate(o.created_at)} {timeOf(o.created_at)}</Txt>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </Card>
            ) : (
              <Card><Txt variant="bodySm" color="inkMuted">Henüz sipariş vermedin. İlk siparişinle kahve kartına damga eklenir.</Txt></Card>
            )}

            <Txt variant="h4" accessibilityRole="header" style={styles.h}>Hesap</Txt>
            <Card style={{ padding: 0 }}>
              <ListRow icon={UserPen} label="Hesap bilgileri" onPress={() => router.push('/account/edit')} />
              <ListRow icon={MapPin} label="Favori şube" value={favorite?.name ?? 'Seçilmedi'} onPress={() => router.push('/account/edit')} />
              <ListRow icon={Bell} label="Bildirimler" onPress={async () => {
                if (Platform.OS === 'web') return;
                if (await notificationsAllowed()) { Linking.openSettings(); return; }
                const r = userId ? await registerForOrderNotifications(userId) : 'unavailable';
                if (r === 'granted') toast('Bildirimler açıldı. Siparişin hazır olunca haber vereceğiz.');
                else Linking.openSettings();
              }} />
              <ListRow icon={Gift} label="Kahve kartı" onPress={() => router.push('/loyalty')} last />
            </Card>
            {legal}
            <Card style={{ padding: 0, marginTop: space[6] }}>
              <ListRow icon={LogOut} label="Çıkış yap" onPress={signOut} />
              <ListRow icon={Trash2} label="Hesabımı sil" danger onPress={() => router.push('/account/delete')} last />
            </Card>
          </>
        )}
        {IS_DEMO ? (
          <View style={{ marginTop: space[8] }}>
            <DemoNote actions={<Button label="Önizlemeyi sıfırla" variant="secondary" size="sm" onPress={resetPreview} />}>
              Bu bir önizleme: veriler yalnızca bu cihazda tutulur, gerçek sipariş ve ödeme yapılmaz.
            </DemoNote>
          </View>
        ) : null}
        <Txt variant="caption" color="inkMuted" center style={{ marginTop: space[8] }}>Çeşme Kahve · sürüm 1.0.0</Txt>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  h: { marginTop: space[8], marginBottom: space[3] },
  ghost: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, paddingHorizontal: space[3] },
  ring: { position: 'absolute', right: -32, top: -32, width: 112, height: 112, borderRadius: 56, borderWidth: 3, borderColor: color.secondary },
  disc: { position: 'absolute', right: -8, top: 24, width: 48, height: 48, borderRadius: 24, backgroundColor: color.secondary },
  who: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginTop: space[6] },
  avatar: { width: 56, height: 56, borderRadius: radius.full, backgroundColor: color.secondarySoft, alignItems: 'center', justifyContent: 'center' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  order: { flexDirection: 'row', gap: space[3], padding: space[4] },
  line: { borderBottomWidth: 1, borderBottomColor: color.line },
});

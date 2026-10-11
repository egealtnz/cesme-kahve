import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChefHat, Leaf, ListChecks, PackageCheck, Recycle, ScanLine, X } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Card, TopBar } from '@/components/Layout';
import { staffSetStatus, useBranchQueue, useCatalogue } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { timeOf, tl } from '@/lib/format';
import type { Order, OrderStatus } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { useToast } from '@/state/toast';
import { color, radius, space } from '@/theme/tokens';

const STAFF_BRANCH_KEY = 'ck.staff.branch';

const NEXT: Partial<Record<OrderStatus, { status: OrderStatus; label: string; icon: typeof Check }>> = {
  placed: { status: 'preparing', label: 'Hazırlamaya başla', icon: ChefHat },
  preparing: { status: 'ready', label: 'Hazır', icon: Check },
  ready: { status: 'collected', label: 'Teslim edildi', icon: PackageCheck },
};
const COLUMNS: { status: OrderStatus; title: string }[] = [
  { status: 'placed', title: 'Yeni' },
  { status: 'preparing', title: 'Hazırlanıyor' },
  { status: 'ready', title: 'Hazır' },
];

export default function StaffScreen() {
  const insets = useSafeAreaInsets();
  const { isStaff, staff } = useAuth();
  const { data: cat } = useCatalogue();
  const qc = useQueryClient();
  const toast = useToast();
  const isAdmin = staff.some((s) => s.role === 'admin');
  const branchOptions = useMemo(() => {
    if (!cat) return [];
    return isAdmin ? cat.branches.filter((b) => b.status === 'open') : cat.branches.filter((b) => staff.some((s) => s.branch_id === b.id));
  }, [cat, staff, isAdmin]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const queue = useBranchQueue(branchId);
  const lastNew = useRef<number | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STAFF_BRANCH_KEY).then((saved) => {
      if (saved && branchOptions.some((b) => b.id === saved)) setBranchId(saved);
      else if (branchOptions[0]) setBranchId(branchOptions[0].id);
    });
  }, [branchOptions]);

  // New order arrived: buzz the barista's phone.
  const newCount = queue.data?.filter((o) => o.status === 'placed').length ?? 0;
  useEffect(() => {
    if (lastNew.current !== null && newCount > lastNew.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      toast('Yeni sipariş geldi');
    }
    lastNew.current = queue.data ? newCount : lastNew.current;
  }, [newCount, queue.data, toast]);

  if (!isStaff) return <Redirect href="/profile" />;
  const branch = cat?.branches.find((b) => b.id === branchId);

  const advance = async (o: Order, status: OrderStatus) => {
    setBusyId(o.id);
    try {
      await staffSetStatus(o.id, status);
      await qc.invalidateQueries({ queryKey: ['queue', branchId] });
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 64 + insets.bottom + space[8] }}
        refreshControl={<RefreshControl refreshing={queue.isRefetching} onRefresh={() => queue.refetch()} />}
      >
        <TopBar />
        <Txt variant="overline" color="secondaryInk" style={{ marginTop: space[4] }}>Şube ekranı</Txt>
        <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>{branch?.name ?? 'Şube'}</Txt>

        {branchOptions.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingVertical: space[3] }}>
            {branchOptions.map((b) => (
              <Pressable key={b.id} accessibilityRole="tab" accessibilityState={{ selected: b.id === branchId }}
                onPress={() => { setBranchId(b.id); AsyncStorage.setItem(STAFF_BRANCH_KEY, b.id); }}
                style={[styles.chip, b.id === branchId && { backgroundColor: color.primary }]}>
                <Txt variant="label" color={b.id === branchId ? 'onPrimary' : 'ink'}>{b.name}</Txt>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.tools}>
          <Button label="QR okut" icon={ScanLine} size="md" style={{ flex: 1 }}
            onPress={() => branchId && router.push({ pathname: '/staff/scan', params: { branch: branchId } })} />
          <Button label="Tükenenler" icon={ListChecks} variant="secondary" size="md" style={{ flex: 1 }}
            onPress={() => branchId && router.push({ pathname: '/staff/menu', params: { branch: branchId } })} />
        </View>

        {queue.isLoading ? <ActivityIndicator color={color.ink} style={{ marginTop: space[8] }} /> : null}
        {COLUMNS.map((col) => {
          const orders = queue.data?.filter((o) => o.status === col.status) ?? [];
          return (
            <View key={col.status} style={{ marginTop: space[6] }}>
              <View style={styles.colHead}>
                <Txt variant="h4" accessibilityRole="header">{col.title}</Txt>
                <View style={styles.count}><Txt variant="label">{orders.length}</Txt></View>
              </View>
              {orders.length === 0 ? (
                <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>Şu an yok.</Txt>
              ) : orders.map((o) => {
                const next = NEXT[o.status];
                const cancellable = o.payment_status !== 'paid' || o.total === 0;
                return (
                  <Card key={o.id} style={[styles.order, o.status === 'ready' && { backgroundColor: color.successSoft }]}>
                    <View style={styles.orderHead}>
                      <Txt variant="h3" style={{ fontVariant: ['tabular-nums'] }}>#{o.order_no}</Txt>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }}>{o.customer_name ?? 'Misafir'}</Txt>
                        <Txt variant="caption" color="inkMuted">{timeOf(o.created_at)}</Txt>
                      </View>
                    </View>
                    <View style={{ gap: 4, marginTop: space[2] }}>
                      {o.order_items?.map((i) => (
                        <View key={i.id} style={{ flexDirection: 'row', gap: space[2] }}>
                          <Txt variant="bodyLg" style={{ width: 32, fontFamily: 'DMSans-Bold' }}>{i.quantity}×</Txt>
                          <View style={{ flex: 1 }}>
                            <Txt variant="bodyLg">{i.product_name}</Txt>
                            {i.milk_label ? <Txt variant="bodySm" color="inkMuted">{i.milk_label}</Txt> : null}
                            {i.free_quantity ? <Txt variant="bodySm" color="success">{i.free_quantity} adet hediye kahve</Txt> : null}
                          </View>
                        </View>
                      ))}
                    </View>
                    <View style={styles.tags}>
                      {o.own_cup ? <Badge tone="eco" icon={Recycle} label="Kendi bardağı" /> : null}
                      {o.eco_packaging ? <Badge tone="eco" icon={Leaf} label="Çevre dostu ambalaj" /> : <Badge label="Standart ambalaj" />}
                      {o.payment_status === 'paid'
                        ? <Badge tone="success" label={o.total === 0 ? 'Hediye' : 'Kartla ödendi'} />
                        : <Badge tone="warning" label={`Kasada ${tl(o.total)} alınacak`} />}
                    </View>
                    <View style={styles.actions}>
                      {next ? (
                        <Button label={next.label} icon={next.icon} style={{ flex: 1 }} loading={busyId === o.id}
                          onPress={() => advance(o, next.status)} />
                      ) : null}
                      {cancellable ? (
                        <Button variant="danger" icon={X} accessibilityLabel={`#${o.order_no} siparişini iptal et`}
                          disabled={busyId === o.id} onPress={() => advance(o, 'cancelled')} />
                      ) : null}
                    </View>
                  </Card>
                );
              })}
            </View>
          );
        })}
        <Txt variant="caption" color="inkMuted" style={{ marginTop: space[8] }}>
          Kartla ödenmiş siparişlerin iptali için önce iyzico panelinden iade yap.
        </Txt>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  chip: { height: 36, paddingHorizontal: space[4], borderRadius: radius.full, backgroundColor: color.surfaceMuted, justifyContent: 'center' },
  tools: { flexDirection: 'row', gap: space[3], marginTop: space[4] },
  colHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  count: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 8, backgroundColor: color.secondarySoft, alignItems: 'center', justifyContent: 'center' },
  order: { marginTop: space[3] },
  orderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[3] },
  actions: { flexDirection: 'row', gap: space[2], marginTop: space[4] },
});

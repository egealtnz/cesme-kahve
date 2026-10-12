import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { BellOff, Check, ChefHat, ChevronRight, Leaf, ListChecks, PackageCheck, Recycle, ScanLine, UserRound, Users, X } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Card, TopBar } from '@/components/Layout';
import { StaffHistory } from '@/components/StaffHistory';
import { canManageBranch, handlers, staffSetStatus, useBranchQueue, useCatalogue } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { registerForStaffNotifications } from '@/lib/notifications';
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
  const { isStaff, staff, userId } = useAuth();
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
  const [view, setView] = useState<'queue' | 'history'>('queue');
  const queue = useBranchQueue(branchId);
  const lastNew = useRef<number | null>(null);
  const [push, setPush] = useState<'granted' | 'denied' | 'unavailable' | null>(null);

  // New orders reach the barista's phone as notifications even when the app is closed. Registers this
  // phone for the signed-in staff account, and again when they come back from system settings.
  useEffect(() => {
    if (!isStaff || !userId) return;
    let alive = true;
    const register = () => registerForStaffNotifications(userId).then((r) => { if (alive) setPush(r); }).catch(() => undefined);
    register();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') register(); });
    return () => { alive = false; sub.remove(); };
  }, [isStaff, userId]);

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
      if (status === 'collected' || status === 'cancelled') qc.invalidateQueries({ queryKey: ['history', branchId] });
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
        refreshControl={<RefreshControl refreshing={queue.isRefetching}
          onRefresh={() => (view === 'queue' ? queue.refetch() : qc.invalidateQueries({ queryKey: ['history', branchId] }))} />}
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

        {push === 'denied' ? (
          <Pressable accessibilityRole="button" onPress={() => Linking.openSettings().catch(() => undefined)}
            style={styles.pushOff}>
            <BellOff size={20} color={color.ink} strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Txt variant="label">Bildirimler kapalı</Txt>
              <Txt variant="bodySm" color="inkMuted">Uygulama kapalıyken yeni siparişlerden haberdar olmak için ayarlardan aç.</Txt>
            </View>
          </Pressable>
        ) : null}

        <View style={styles.tools}>
          <Button label="QR okut" icon={ScanLine} size="md" style={{ flex: 1 }}
            onPress={() => branchId && router.push({ pathname: '/staff/scan', params: { branch: branchId } })} />
          <Button label="Tükenenler" icon={ListChecks} variant="secondary" size="md" style={{ flex: 1 }}
            onPress={() => branchId && router.push({ pathname: '/staff/menu', params: { branch: branchId } })} />
        </View>

        {branchId && canManageBranch(staff, branchId) ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Ekip: barista ekle ya da çıkar"
            onPress={() => router.push({ pathname: '/staff/team', params: { branch: branchId } })}
            style={({ pressed }) => [styles.teamRow, pressed && { backgroundColor: color.surfaceMuted }]}>
            <View style={styles.teamIcon}><Users size={20} color={color.secondaryInk} strokeWidth={1.75} /></View>
            <View style={{ flex: 1 }}>
              <Txt variant="label">Ekip</Txt>
              <Txt variant="bodySm" color="inkMuted">{isAdmin ? 'Müdür ve barista ekle ya da çıkar' : 'Barista ekle ya da çıkar'}</Txt>
            </View>
            <ChevronRight size={20} color={color.inkMuted} strokeWidth={1.75} />
          </Pressable>
        ) : null}

        <View style={styles.segment} accessibilityRole="tablist">
          {([['queue', 'Sıradakiler' + (queue.data?.length ? ' (' + queue.data.length + ')' : '')], ['history', 'Geçmiş']] as const).map(([key, label]) => (
            <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: view === key }} onPress={() => setView(key)}
              style={[styles.segmentItem, view === key && styles.segmentOn]}>
              <Txt variant="label" color={view === key ? 'ink' : 'inkMuted'}>{label}</Txt>
            </Pressable>
          ))}
        </View>

        {view === 'history' ? <StaffHistory branchId={branchId} /> : null}
        {view === 'queue' && queue.isLoading ? <ActivityIndicator color={color.ink} style={{ marginTop: space[8] }} /> : null}
        {view === 'queue' && COLUMNS.map((col) => {
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
                    <HandledBy order={o} />
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
        {view === 'queue' ? (
          <Txt variant="caption" color="inkMuted" style={{ marginTop: space[8] }}>
            Kartla ödenmiş siparişlerin iptali için önce iyzico panelinden iade yap.
          </Txt>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** In the queue: who picked the order up ("Ece K. hazırlıyor") and who marked it ready. */
function HandledBy({ order }: { order: Order }) {
  const h = handlers(order);
  const text = order.status === 'preparing' && h.preparing ? `${h.preparing.name} hazırlıyor`
    : order.status === 'ready' && h.ready ? `Hazırlayan: ${h.ready.name}`
    : null;
  if (!text) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space[1] }}>
      <UserRound size={14} color={color.inkMuted} strokeWidth={1.75} />
      <Txt variant="caption" color="inkMuted">{text}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  chip: { height: 36, paddingHorizontal: space[4], borderRadius: radius.full, backgroundColor: color.surfaceMuted, justifyContent: 'center' },
  tools: { flexDirection: 'row', gap: space[3], marginTop: space[4] },
  teamRow: {
    flexDirection: 'row', alignItems: 'center', gap: space[3], marginTop: space[3], padding: space[3],
    borderRadius: radius.md, backgroundColor: color.surface, boxShadow: '0px 1px 3px rgba(0, 40, 62, 0.10)',
  },
  teamIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.secondarySoft, alignItems: 'center', justifyContent: 'center' },
  pushOff: {
    flexDirection: 'row', alignItems: 'center', gap: space[3], marginTop: space[4], padding: space[4],
    borderRadius: radius.lg, backgroundColor: color.warningSoft,
  },
  segment: { flexDirection: 'row', marginTop: space[6], padding: 4, borderRadius: radius.full, backgroundColor: color.surfaceMuted },
  segmentItem: { flex: 1, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: color.surface, boxShadow: '0px 1px 3px rgba(0, 40, 62, 0.12)' },
  colHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  count: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 8, backgroundColor: color.secondarySoft, alignItems: 'center', justifyContent: 'center' },
  order: { marginTop: space[3] },
  orderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[3] },
  actions: { flexDirection: 'row', gap: space[2], marginTop: space[4] },
});

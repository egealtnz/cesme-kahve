// Counter board for a tablet: the whole queue in big type, one tap per step, the screen stays on and a
// chime sounds for every new order (and again every 45 seconds while a new order is waiting).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, ChefHat, PackageCheck, Recycle, Volume2, VolumeX, X } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { BranchLoad } from '@/components/BranchLoad';
import { handlers, staffSetStatus, useBranchesLive, useBranchQueue } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { timeOf, tl } from '@/lib/format';
import { clock, isDueSoon, pickupLabel } from '@/lib/hours';
import type { Order, OrderStatus } from '@/lib/types';
import { useAuth } from '@/state/auth';
import { useToast } from '@/state/toast';
import { color, radius, space } from '@/theme/tokens';
import { counterExtras, deliveredLabel, NoteBox, TableTag } from '@/components/StaffOrderBits';

const CHIME = require('../../../assets/sounds/new-order.wav');
const NEXT: Partial<Record<OrderStatus, { status: OrderStatus; label: string; icon: typeof Check; bg: string }>> = {
  placed: { status: 'preparing', label: 'Başla', icon: ChefHat, bg: color.primary },
  preparing: { status: 'ready', label: 'Hazır', icon: Check, bg: color.secondary },
  ready: { status: 'collected', label: 'Teslim edildi', icon: PackageCheck, bg: color.success },
};

export default function CounterBoard() {
  useKeepAwake();
  const { branch: branchId } = useLocalSearchParams<{ branch: string }>();
  const { isStaff } = useAuth();
  const queue = useBranchQueue(branchId ?? null);
  const live = useBranchesLive();
  const qc = useQueryClient();
  const toast = useToast();
  // measured, not the window: side-by-side columns only when the board itself is tablet-wide
  const [width, setWidth] = useState(0);
  const wide = width >= 860;
  const player = useAudioPlayer(CHIME);
  const [sound, setSound] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [busyId, setBusyId] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);

  const branch = live.data?.find((b) => b.id === branchId);
  const prep = branch?.prep_minutes ?? 6;

  useEffect(() => { setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined); }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const columns = useMemo(() => {
    const list = queue.data ?? [];
    const due = (o: Order) => isDueSoon(o.pickup_at, prep, now);
    return {
      fresh: list.filter((o) => o.status === 'placed' && due(o)),
      preparing: list.filter((o) => o.status === 'preparing'),
      ready: list.filter((o) => o.status === 'ready'),
      later: list.filter((o) => o.status === 'placed' && !due(o)).sort((a, b) => Date.parse(a.pickup_at!) - Date.parse(b.pickup_at!)),
    };
  }, [queue.data, prep, now]);

  const chime = () => {
    if (!sound) return;
    try { player.seekTo(0); player.play(); } catch { /* audio not available */ }
  };

  // chime for orders we have not seen before (not on first load)
  useEffect(() => {
    if (!queue.data) return;
    const ids = new Set(columns.fresh.map((o) => o.id));
    if (seen.current && [...ids].some((id) => !seen.current!.has(id))) chime();
    seen.current = ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.fresh, queue.data]);

  // reminder while a new order has been waiting more than a minute
  const waiting = columns.fresh.some((o) => now.getTime() - Date.parse(o.created_at) > 60_000);
  useEffect(() => {
    if (!waiting || !sound) return;
    const t = setInterval(() => { try { player.seekTo(0); player.play(); } catch { /* ignore */ } }, 45_000);
    return () => clearInterval(t);
  }, [waiting, sound, player]);

  if (!isStaff || !branchId) return <Redirect href="/staff" />;

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

  const col = (title: string, orders: Order[], tone: string) => (
    <View style={[styles.col, wide && { flex: 1 }]}>
      <View style={[styles.colHead, { borderBottomColor: tone }]}>
        <Txt variant="h3" accessibilityRole="header">{title}</Txt>
        <View style={[styles.count, { backgroundColor: tone }]}><Txt variant="h5" color="onPrimary">{orders.length}</Txt></View>
      </View>
      {orders.length === 0 ? <Txt variant="body" color="inkMuted" style={{ marginTop: space[3] }}>Şu an yok.</Txt> : null}
      {orders.map((o) => <BoardCard key={o.id} order={o} busy={busyId === o.id} onAdvance={advance} />)}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Tezgah ekranından çık" onPress={() => (router.canGoBack() ? router.back() : router.replace('/staff'))} style={styles.iconBtn}>
          <X size={24} color={color.ink} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Txt variant="overline" color="secondaryInk">Tezgah ekranı</Txt>
          <Txt variant="h2">{branch?.name ?? ''}</Txt>
        </View>
        <Txt variant="h2" style={{ fontVariant: ['tabular-nums'] }}>{clock(now)}</Txt>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: sound }} accessibilityLabel="Sesli uyarı"
          onPress={() => { const next = !sound; setSound(next); if (next) { try { player.seekTo(0); player.play(); } catch { /* ignore */ } } }}
          style={[styles.iconBtn, !sound && { backgroundColor: color.errorSoft }]}>
          {sound ? <Volume2 size={24} color={color.ink} strokeWidth={2} /> : <VolumeX size={24} color={color.error} strokeWidth={2} />}
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: space[4], paddingTop: 0, paddingBottom: space[8] }}>
        {branch ? <BranchLoad branch={branch} large /> : null}
        <View style={[wide ? styles.rowCols : styles.stackCols, { marginTop: space[4] }]}>
          {col('Yeni', columns.fresh, color.primary)}
          {col('Hazırlanıyor', columns.preparing, color.secondary)}
          {col('Hazır', columns.ready, color.success)}
        </View>
        {columns.later.length ? (
          <View style={{ marginTop: space[6] }}>
            <Txt variant="h4" accessibilityRole="header">Planlı siparişler</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[3] }}>
              {columns.later.map((o) => (
                <View key={o.id} style={styles.later}>
                  <CalendarClock size={18} color={color.warning} strokeWidth={1.75} />
                  <Txt variant="label">{pickupLabel(o.pickup_at!)} · #{o.order_no} {o.customer_name ?? ''}{o.note ? ' · notlu' : ''}</Txt>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function BoardCard({ order: o, busy, onAdvance }: { order: Order; busy: boolean; onAdvance: (o: Order, s: OrderStatus) => void }) {
  const next = NEXT[o.status];
  const h = handlers(o);
  const who = o.status === 'preparing' ? h.preparing?.name : o.status === 'ready' ? h.ready?.name : null;
  return (
    <View style={[styles.card, o.status === 'ready' && { backgroundColor: color.successSoft }]}>
      <View style={styles.cardHead}>
        <Txt variant="h1" style={{ fontVariant: ['tabular-nums'] }}>#{o.order_no}</Txt>
        <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
          <Txt variant="h4" numberOfLines={1}>{o.customer_name ?? 'Misafir'}</Txt>
          <Txt variant="bodySm" color="inkMuted">{timeOf(o.created_at)}{who ? ` · ${who}` : ''}</Txt>
        </View>
      </View>
      {o.table_label ? <View style={{ marginTop: space[2] }}><TableTag table={o.table_label} large /></View> : null}
      {o.pickup_at ? (
        <View style={styles.badge}>
          <CalendarClock size={18} color={color.warning} strokeWidth={1.75} />
          <Txt variant="label" color="warning">{`Teslim: ${pickupLabel(o.pickup_at)}`}</Txt>
        </View>
      ) : null}
      <View style={{ gap: 6, marginTop: space[3] }}>
        {o.order_items?.map((i) => (
          <View key={i.id} style={{ flexDirection: 'row', gap: space[3] }}>
            <Txt variant="h4" style={{ width: 40 }}>{i.quantity}×</Txt>
            <View style={{ flex: 1 }}>
              <Txt variant="h4">{i.product_name}</Txt>
              {counterExtras(i) ? <Txt variant="bodyLg" color="secondaryInk" style={{ fontFamily: 'DMSans-SemiBold' }}>{counterExtras(i)}</Txt> : null}
            </View>
          </View>
        ))}
      </View>
      {o.note ? <NoteBox note={o.note} large /> : null}
      <View style={styles.meta}>
        {o.own_cup ? <View style={styles.badge}><Recycle size={16} color={color.success} strokeWidth={1.75} /><Txt variant="label" color="success">Kendi bardağı</Txt></View> : null}
        <Txt variant="label" color={o.payment_status === 'paid' ? 'success' : 'warning'}>
          {o.payment_status === 'paid' ? (o.total === 0 ? 'Hediye' : 'Kartla ödendi') : `Kasada ${tl(o.total)}`}
        </Txt>
      </View>
      {next ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`#${o.order_no}: ${next.status === 'collected' ? deliveredLabel(o.table_label) : next.label}`} disabled={busy}
          onPress={() => onAdvance(o, next.status)}
          style={({ pressed }) => [styles.big, { backgroundColor: next.bg }, (pressed || busy) && { opacity: 0.75 }]}>
          <next.icon size={26} color={color.onPrimary} strokeWidth={2} />
          <Txt variant="h4" color="onPrimary">{busy ? 'Bekleyin…' : next.status === 'collected' ? deliveredLabel(o.table_label) : next.label}</Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  top: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] },
  iconBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' },
  rowCols: { flexDirection: 'row', gap: space[4], alignItems: 'flex-start' },
  stackCols: { gap: space[6] },
  col: { gap: space[3] },
  colHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: space[2], borderBottomWidth: 3 },
  count: { minWidth: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[2] },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space[4], boxShadow: '0px 2px 8px rgba(0, 40, 62, 0.10)' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[3] },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space[2] },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[3], marginTop: space[3] },
  big: { marginTop: space[4], minHeight: 64, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[3] },
  later: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.full, backgroundColor: color.warningSoft },
});

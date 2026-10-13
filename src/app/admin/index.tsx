// Company panel (admins): every branch right now, the management areas, and sales with export.
import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { Bell, Coffee, Download, Megaphone, Milk, Receipt, Settings2, Store, ThumbsDown, ThumbsUp, UserRound, Users } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Screen, TopBar } from '@/components/Layout';
import { adminStyles, Bar, Chips, NavRow, Stat } from '@/components/Admin';
import { LiveBranches } from '@/components/LiveBranches';
import { exportOrders, useAdminReport, useCatalogue } from '@/lib/api';
import { ordersCsv, shareTextFile } from '@/lib/csv';
import { errorMessage } from '@/lib/errors';
import { tl } from '@/lib/format';
import { useToast } from '@/state/toast';
import { color, space } from '@/theme/tokens';

const RANGES = [
  { value: 1, label: 'Bugün' },
  { value: 7, label: 'Son 7 gün' },
  { value: 30, label: 'Son 30 gün' },
  { value: 90, label: 'Son 3 ay' },
];

function rangeOf(days: number) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));
  const to = new Date();
  to.setHours(24, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function AdminHome() {
  const { data: cat } = useCatalogue();
  const toast = useToast();
  const [days, setDays] = useState(7);
  const [branchId, setBranchId] = useState<string | null>(null);
  const { from, to } = useMemo(() => rangeOf(days), [days]);
  const report = useAdminReport(from, to, branchId);
  const [exporting, setExporting] = useState(false);
  const r = report.data;

  const branchOptions = useMemo(() => [{ value: null as string | null, label: 'Tüm şubeler' },
    ...(cat?.branches.filter((b) => b.status === 'open').map((b) => ({ value: b.id as string | null, label: b.name })) ?? [])], [cat]);

  const doExport = async () => {
    setExporting(true);
    try {
      const rows = await exportOrders(from, to, branchId);
      if (!rows.length) { toast('Bu dönemde dışa aktarılacak sipariş yok.'); return; }
      const day = from.slice(0, 10);
      await shareTextFile(`cesme-kahve-siparisler-${day}-${days}gun.csv`, ordersCsv(rows));
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const satisfaction = r && r.totals.likes + r.totals.dislikes > 0
    ? `%${Math.round((r.totals.likes / (r.totals.likes + r.totals.dislikes)) * 100)}` : '—';
  const maxHour = Math.max(1, ...(r?.by_hour.map((h) => h.orders) ?? [0]));
  const maxBranch = Math.max(1, ...(r?.by_branch.map((b) => b.revenue) ?? [0]));
  const maxProduct = Math.max(1, ...(r?.top_products.map((p) => p.qty) ?? [0]));

  return (
    <Screen>
      <TopBar back />
      <Txt variant="overline" color="secondaryInk" style={{ marginTop: space[5] }}>İşletme yönetimi</Txt>
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>Şirket paneli</Txt>

      <Txt variant="h4" accessibilityRole="header" style={{ marginTop: space[6] }}>Şu an</Txt>
      <LiveBranches part="summary" />

      <Txt variant="h4" accessibilityRole="header" style={{ marginTop: space[8] }}>Yönet</Txt>
      <View style={{ gap: space[2], marginTop: space[3] }}>
        <NavRow icon={Receipt} title="Siparişler" body="Tüm şubelerde sipariş ara, durumunu değiştir, iptal et" onPress={() => router.push('/admin/orders')} />
        <NavRow icon={UserRound} title="Müşteriler" body="Müşteri ara, kahve kartı, hediye kahve, damga düzeltme" onPress={() => router.push('/admin/customers')} />
        <NavRow icon={Users} title="Ekip" body="Tüm şubelerin müdür ve baristaları, Excel listesi" onPress={() => router.push('/admin/team')} />
        <NavRow icon={Coffee} title="Menü ve fiyatlar" body="Ürün ekle, fiyat ve fotoğraf değiştir, menüden kaldır" onPress={() => router.push('/admin/menu')} />
        <NavRow icon={Milk} title="Süt seçenekleri ve kategoriler" body="Süt fiyat farkları, kategorileri gizle/göster" onPress={() => router.push('/admin/options')} />
        <NavRow icon={Store} title="Şubeler ve çalışma saatleri" body="Açılış-kapanış saatleri, hazırlık süresi, sipariş alma" onPress={() => router.push('/admin/branches')} />
        <NavRow icon={Megaphone} title="Kampanya kartları" body="Ana sayfadaki kampanyalar" onPress={() => router.push('/admin/campaigns')} />
        <NavRow icon={Bell} title="Bildirim gönder" body="İzin veren müşterilere kampanya duyurusu" onPress={() => router.push('/admin/notify')} />
        <NavRow icon={Settings2} title="Ayarlar" body="Sadakat kartı, indirimler, doğum günü kahvesi, “Seni özledik”" onPress={() => router.push('/admin/settings')} />
      </View>

      <Txt variant="h4" accessibilityRole="header" style={{ marginTop: space[8] }}>Şubeler şu an</Txt>
      <LiveBranches part="list" />

      <Txt variant="h4" accessibilityRole="header" style={{ marginTop: space[8] }}>Satışlar</Txt>
      <View style={{ gap: space[2], marginTop: space[3] }}>
        <Chips options={RANGES} value={days} onChange={setDays} label="Dönem" />
        <Chips options={branchOptions} value={branchId} onChange={setBranchId} label="Şube" />
      </View>

      {report.isLoading ? <ActivityIndicator color={color.ink} style={{ marginTop: space[6] }} /> : null}
      {report.isError ? <Txt variant="bodySm" color="error" style={{ marginTop: space[4] }}>{errorMessage(report.error)}</Txt> : null}

      {r ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[4] }}>
            <Stat label="Ciro" value={tl(r.totals.revenue)} />
            <Stat label="Teslim edilen sipariş" value={String(r.totals.orders)} sub={r.totals.cancelled ? `${r.totals.cancelled} iptal` : undefined} />
            <Stat label="Ortalama sepet" value={tl(r.totals.avg_ticket)} />
            <Stat label="Satılan kahve" value={String(r.totals.coffees)} />
            <Stat label="Müşteri" value={String(r.totals.customers)} sub={r.totals.scheduled ? `${r.totals.scheduled} ileri saat siparişi` : undefined} />
            <Stat label="Memnuniyet" value={satisfaction} sub={`${r.totals.likes} 👍 · ${r.totals.dislikes} 👎`} />
          </View>
          <Button label="Excel'e aktar (CSV)" icon={Download} variant="secondary" size="md" loading={exporting} onPress={doExport}
            style={{ marginTop: space[3] }} />

          {!branchId && r.by_branch.length ? (
            <>
              <Txt variant="h5" accessibilityRole="header" style={adminStyles.h}>Şubeler</Txt>
              <View style={[adminStyles.card, { gap: space[3] }]}>
                {r.by_branch.map((b) => (
                  <View key={b.branch_id} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[2] }}>
                      <Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>{b.name}</Txt>
                      <Txt variant="label" style={{ fontVariant: ['tabular-nums'] }}>{tl(b.revenue)}</Txt>
                    </View>
                    <Bar value={b.revenue} max={maxBranch} />
                    <Txt variant="caption" color="inkMuted">
                      {b.orders} sipariş{b.likes + b.dislikes ? ` · ${b.likes} 👍 ${b.dislikes} 👎` : ''}
                    </Txt>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {r.top_products.length ? (
            <>
              <Txt variant="h5" accessibilityRole="header" style={adminStyles.h}>En çok satanlar</Txt>
              <View style={[adminStyles.card, { gap: space[3] }]}>
                {r.top_products.map((p, i) => (
                  <View key={p.name} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[2] }}>
                      <Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>{i + 1}. {p.name}</Txt>
                      <Txt variant="caption" color="inkMuted" style={{ fontVariant: ['tabular-nums'] }}>{p.qty} adet · {tl(p.revenue)}</Txt>
                    </View>
                    <Bar value={p.qty} max={maxProduct} tone={color.primary} />
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {r.by_hour.length ? (
            <>
              <Txt variant="h5" accessibilityRole="header" style={adminStyles.h}>Yoğun saatler</Txt>
              <View style={[adminStyles.card, { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 140 }]}
                accessibilityLabel={`En yoğun saat ${r.by_hour.reduce((a, b) => (b.orders > a.orders ? b : a)).hour}:00`}>
                {Array.from({ length: 24 }, (_, h) => {
                  const n = r.by_hour.find((x) => x.hour === h)?.orders ?? 0;
                  return (
                    <View key={h} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                      <View style={{ width: '100%', height: `${Math.max(n ? 6 : 0, (n / maxHour) * 80)}%`, backgroundColor: color.secondary, borderRadius: 3 }} />
                      {h % 3 === 0 ? <Txt variant="caption" color="inkMuted" style={{ fontSize: 10, marginTop: 2 }}>{h}</Txt> : <View style={{ height: 16 }} />}
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}

          {r.comments.length ? (
            <>
              <Txt variant="h5" accessibilityRole="header" style={adminStyles.h}>Müşteri yorumları</Txt>
              <View style={[adminStyles.card, { gap: space[3] }]}>
                {r.comments.map((c) => (
                  <View key={`${c.order_no}`} style={{ flexDirection: 'row', gap: space[2] }}>
                    {c.liked ? <ThumbsUp size={16} color={color.success} strokeWidth={1.75} style={{ marginTop: 2 }} />
                      : <ThumbsDown size={16} color={color.error} strokeWidth={1.75} style={{ marginTop: 2 }} />}
                    <View style={{ flex: 1 }}>
                      <Txt variant="bodySm">“{c.comment}”</Txt>
                      <Txt variant="caption" color="inkMuted">{c.branch} · #{c.order_no}</Txt>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </>
      ) : null}

      <View style={{ height: space[8] }} />
    </Screen>
  );
}

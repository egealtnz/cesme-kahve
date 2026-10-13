// Company panel: customers — how many, who is new, and search by name, e-mail, phone or member code.
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Badge } from '@/components/Badge';
import { Field } from '@/components/Field';
import { Card, Divider, Screen, TopBar } from '@/components/Layout';
import { Stat } from '@/components/Admin';
import { useCustomerSearch } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { dayMonth, shortDate, tl } from '@/lib/format';
import { useDebounced } from '@/lib/useDebounced';
import { color, space } from '@/theme/tokens';

export default function AdminCustomers() {
  const [text, setText] = useState('');
  const query = useDebounced(text.trim());
  const search = useCustomerSearch(query);
  const d = search.data;

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>Müşteriler</Txt>
      {d ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[4] }}>
          <Stat label="Üye müşteri" value={String(d.total)} />
          <Stat label="Son 7 günde katılan" value={String(d.new_7d)} />
          <Stat label="Kampanya iletisine izin veren" value={String(d.opted_in)} />
        </View>
      ) : null}
      <View style={{ marginTop: space[4] }}>
        <Field label="Müşteri ara" value={text} onChangeText={setText} placeholder="Ad, e-posta, telefon ya da üye kodu"
          autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
      </View>
      <Txt variant="caption" color="inkMuted" style={{ marginTop: space[3] }}>
        {query ? 'Arama sonuçları' : 'En yeni üyeler'}
      </Txt>

      {search.isError ? <Txt variant="bodySm" color="error" style={{ marginTop: space[3] }}>{errorMessage(search.error)}</Txt> : null}
      <Card style={{ paddingVertical: 0, marginTop: space[2], marginBottom: space[8] }}>
        {search.isLoading ? <ActivityIndicator color={color.ink} style={{ marginVertical: space[4] }} /> : null}
        {d && d.results.length === 0 ? <Txt variant="bodySm" color="inkMuted" style={{ paddingVertical: space[3] }}>Bu aramaya uyan müşteri yok.</Txt> : null}
        {d?.results.map((c, i) => (
          <View key={c.id}>
            {i > 0 ? <Divider /> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={`${c.first_name} ${c.last_name}, ${c.orders} sipariş`}
              onPress={() => router.push({ pathname: '/admin/customer/[id]', params: { id: c.id } })}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] }, pressed && { opacity: 0.7 }]}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                  <Txt variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>{c.first_name} {c.last_name === '-' ? '' : c.last_name}</Txt>
                  {c.is_staff ? <Badge tone="fresh" icon={null} label="Personel" /> : null}
                </View>
                <Txt variant="caption" color="inkMuted" numberOfLines={1}>{c.email}</Txt>
                <Txt variant="caption" color="inkMuted">
                  {c.orders} sipariş · {tl(c.spent)} · {c.stamps} damga{c.rewards ? ` · ${c.rewards} hediye kahve` : ''}
                  {c.last_order_at ? ` · son: ${dayMonth(c.last_order_at)}` : ` · üyelik: ${shortDate(c.created_at)}`}
                </Txt>
              </View>
              <ChevronRight size={18} color={color.inkMuted} strokeWidth={1.75} />
            </Pressable>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

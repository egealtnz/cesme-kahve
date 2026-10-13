import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Check, ChevronRight, Clock, Search, Store } from 'lucide-react-native';
import { Txt } from './Txt';
import { Badge } from './Badge';
import { trLower } from '@/lib/format';
import { branchState } from '@/lib/hours';
import type { Branch } from '@/lib/types';
import { color, font, radius, shadow, space } from '@/theme/tokens';

type Props = { branches: Branch[]; selectedId: string | null; onSelect: (b: Branch) => void; showChevron?: boolean };

export function BranchList({ branches, selectedId, onSelect, showChevron }: Props) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = trLower(query.trim());
    const match = (b: Branch) => !q || trLower(`${b.name} ${b.district} ${b.city}`).includes(q);
    const cities: string[] = [];
    branches.forEach((b) => { if (!cities.includes(b.city)) cities.push(b.city); });
    return cities.map((city) => ({ city, items: branches.filter((b) => b.city === city && match(b)) })).filter((g) => g.items.length);
  }, [branches, query]);

  return (
    <View>
      <View style={styles.search}>
        <Search size={20} color={color.inkMuted} strokeWidth={1.75} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Şube, ilçe ya da şehir ara"
          placeholderTextColor={color.inkMuted}
          accessibilityLabel="Şube ara"
          style={styles.input}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>
      <View style={{ gap: space[6], marginTop: space[6] }}>
        {groups.length === 0 ? (
          <View style={styles.none}><Txt variant="bodySm" color="inkMuted">“{query}” ile eşleşen bir şube bulamadık. İlçe ya da şehir adıyla dene.</Txt></View>
        ) : groups.map((g) => (
          <View key={g.city}>
            <Txt variant="h6" accessibilityRole="header">{g.city}</Txt>
            <View style={{ gap: space[2], marginTop: space[3] }}>
              {g.items.map((b) => {
                const selected = b.id === selectedId;
                const st = branchState(b);
                const closed = !st.orderable;
                const note = st.kind === 'paused' || st.kind === 'closed' ? st.label : null;
                return (
                  <Pressable
                    key={b.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: closed }}
                    accessibilityLabel={`${b.name}, ${b.district}, ${b.city}, ${closed ? 'şu an sipariş almıyor' : note ?? `yaklaşık ${st.waitMinutes} dakika`}`}
                    disabled={closed}
                    onPress={() => onSelect(b)}
                    style={({ pressed }) => [styles.row, closed && styles.rowClosed, selected && styles.rowOn, pressed && { opacity: 0.9 }]}
                  >
                    <View style={[styles.disc, closed && { backgroundColor: color.surfaceMuted }]}>
                      <Store size={22} color={closed ? color.inkMuted : color.ink} strokeWidth={1.75} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontFamily: 'DMSans-SemiBold' }} color={closed ? 'inkMuted' : 'ink'}>{b.name}</Txt>
                      <Txt variant="bodySm" color="inkMuted">{b.district} · {b.city}</Txt>
                      {note ? <Txt variant="caption" color="warning" style={{ marginTop: 2 }}>{note} · ileri saate sipariş verilebilir</Txt> : null}
                    </View>
                    {b.status === 'coming_soon' ? <Badge label="Yakında" /> : closed ? <Badge label="Kapalı" /> : selected ? (
                      <View style={styles.check}><Check size={16} color={color.onPrimary} strokeWidth={2} /></View>
                    ) : (
                      <View style={styles.meta}>
                        <Clock size={16} color={st.kind === 'busy' ? color.warning : color.inkMuted} strokeWidth={1.75} />
                        <Txt variant="caption" color={st.kind === 'busy' ? 'warning' : 'inkMuted'}>
                          {st.kind === 'busy' ? `Yoğun · ~${st.waitMinutes} dk` : st.orderNow ? `~${st.waitMinutes} dk` : 'İleri saat'}
                        </Txt>
                        {showChevron ? <ChevronRight size={20} color={color.inkMuted} strokeWidth={1.75} /> : null}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: space[2], height: 48, borderRadius: radius.sm, backgroundColor: color.surfaceMuted, paddingHorizontal: space[3] },
  input: { flex: 1, height: 48, fontFamily: font.regular, fontSize: 16, color: color.ink },
  none: { backgroundColor: color.surface, borderRadius: radius.md, padding: space[4] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], backgroundColor: color.surface, borderRadius: radius.lg, boxShadow: shadow.sm, borderWidth: 2, borderColor: 'transparent' },
  rowClosed: { backgroundColor: 'transparent', boxShadow: 'none', borderWidth: 1, borderStyle: 'dashed', borderColor: color.line },
  rowOn: { borderColor: color.primary },
  disc: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: color.secondarySoft, alignItems: 'center', justifyContent: 'center' },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});

// Bits the counter needs to see at a glance: the table to bring an order to, and the customer's note.
// Staff screens are Turkish.
import { StyleSheet, View } from 'react-native';
import { MessageSquare, Utensils } from 'lucide-react-native';
import { Txt } from './Txt';
import { Pop } from './Motion';
import type { OrderItem } from '@/lib/types';
import { color, radius, space } from '@/theme/tokens';

export function TableTag({ table, large }: { table: string; large?: boolean }) {
  return (
    <Pop from={0.7}>
      <View style={[styles.table, large && styles.tableLarge]} accessibilityLabel={`Masaya servis, masa ${table}`}>
        <Utensils size={large ? 22 : 16} color={color.onSecondary} strokeWidth={2} />
        <Txt variant={large ? 'h4' : 'label'} color="onSecondary">Masa {table}</Txt>
      </View>
    </Pop>
  );
}

export function NoteBox({ note, large }: { note: string; large?: boolean }) {
  return (
    <View style={[styles.note, large && { padding: space[3] }]} accessibilityLabel={`Müşteri notu: ${note}`}>
      <MessageSquare size={large ? 20 : 16} color={color.warning} strokeWidth={1.75} style={{ marginTop: 2 }} />
      <Txt variant={large ? 'bodyLg' : 'bodySm'} style={{ flex: 1, fontFamily: 'DMSans-SemiBold' }}>“{note}”</Txt>
    </View>
  );
}

/** "Badem sütü · Büyük · Ekstra shot" for the counter (always Turkish). */
export const counterExtras = (i: Pick<OrderItem, 'milk_label' | 'options_label'>) => [i.milk_label, i.options_label].filter(Boolean).join(' · ');

/** "Teslim edildi" or, for table orders, "Masaya götürüldü". */
export const deliveredLabel = (table?: string | null) => (table ? 'Masaya götürüldü' : 'Teslim edildi');

const styles = StyleSheet.create({
  table: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: space[3], height: 32, borderRadius: radius.full, backgroundColor: color.secondary },
  tableLarge: { height: 44, paddingHorizontal: space[4] },
  note: { flexDirection: 'row', gap: space[2], padding: space[2], borderRadius: radius.sm, backgroundColor: color.warningSoft, marginTop: space[2] },
});

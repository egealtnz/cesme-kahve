import { Pressable, StyleSheet, View } from 'react-native';
import { Minus, Plus, Trash2 } from 'lucide-react-native';
import { Txt } from './Txt';
import { color, radius } from '@/theme/tokens';

type Props = { value: number; onChange: (n: number) => void; name: string; min?: number; max?: number; removable?: boolean };

export function Stepper({ value, onChange, name, min = 1, max = 20, removable = false }: Props) {
  const trash = removable && value === 1;
  const minusDisabled = !removable && value <= min;
  return (
    <View style={styles.wrap} accessibilityRole="adjustable" accessibilityLabel={`${name} adedi`} accessibilityValue={{ now: value, min, max }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={trash ? `${name} ürününü sepetten çıkar` : `Bir ${name} azalt`}
        disabled={minusDisabled}
        hitSlop={4}
        onPress={() => onChange(value - 1)}
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      >
        {trash ? <Trash2 size={18} color={color.ink} strokeWidth={1.75} /> : <Minus size={18} color={minusDisabled ? color.inkDisabled : color.ink} strokeWidth={1.75} />}
      </Pressable>
      <Txt variant="label" style={styles.value}>{value}</Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Bir ${name} daha ekle`}
        disabled={value >= max}
        hitSlop={4}
        onPress={() => onChange(value + 1)}
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      >
        <Plus size={18} color={value >= max ? color.inkDisabled : color.ink} strokeWidth={1.75} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', height: 36, borderRadius: radius.full, backgroundColor: color.secondarySoft, alignSelf: 'flex-start' },
  btn: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: color.secondary },
  value: { minWidth: 20, textAlign: 'center', fontVariant: ['tabular-nums'], fontFamily: 'DMSans-Bold', fontSize: 15 },
});

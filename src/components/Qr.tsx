import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import qrcode from 'qrcode-generator';
import { Coffee } from 'lucide-react-native';
import { color } from '@/theme/tokens';

export function QrCode({ value, size = 200, label }: { value: string; size?: number; label: string }) {
  const { d, n } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) path += `M${c + 2} ${r + 2}h1v1h-1z`;
    return { d: path, n: count + 4 };
  }, [value]);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ backgroundColor: '#ffffff', padding: 8, borderRadius: 16 }}>
      <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`}>
        <Rect width={n} height={n} fill="#ffffff" />
        <Path d={d} fill={color.ink} />
      </Svg>
    </View>
  );
}

export function StampRow({ filled, total }: { filled: number; total: number }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${total} damgadan ${filled} damga`}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.stamp, i < filled ? styles.on : styles.off]}>
          {i < filled ? <Coffee size={14} color={color.onSecondary} strokeWidth={1.75} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  stamp: { flex: 1, aspectRatio: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: color.secondary },
  off: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.lineStrong },
});

import { StyleSheet, View } from 'react-native';
import { Check, Clock, Gift, Leaf, Wheat, X, type LucideIcon } from 'lucide-react-native';
import { Txt } from './Txt';
import { color, radius, space, type ColorName } from '@/theme/tokens';

export type BadgeTone = 'fresh' | 'eco' | 'success' | 'warning' | 'error' | 'neutral' | 'gift';
const TONES: Record<BadgeTone, { bg: ColorName; fg: ColorName; icon: LucideIcon | null }> = {
  fresh: { bg: 'secondarySoft', fg: 'secondaryInk', icon: Wheat },
  eco: { bg: 'successSoft', fg: 'success', icon: Leaf },
  success: { bg: 'successSoft', fg: 'success', icon: Check },
  gift: { bg: 'successSoft', fg: 'success', icon: Gift },
  warning: { bg: 'warningSoft', fg: 'warning', icon: Clock },
  error: { bg: 'errorSoft', fg: 'error', icon: X },
  neutral: { bg: 'surfaceMuted', fg: 'inkMuted', icon: null },
};

export function Badge({ tone = 'neutral', label, icon }: { tone?: BadgeTone; label: string; icon?: LucideIcon | null }) {
  const t = TONES[tone];
  const Icon = icon === undefined ? t.icon : icon;
  return (
    <View style={[styles.badge, { backgroundColor: color[t.bg], paddingLeft: Icon ? 6 : space[2] }]}>
      {Icon ? <Icon size={16} color={color[t.fg]} strokeWidth={1.75} /> : null}
      <Txt variant="caption" color={t.fg} style={{ fontFamily: 'DMSans-SemiBold' }} numberOfLines={1}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: space[1], alignSelf: 'flex-start', minHeight: 24, paddingRight: space[2], borderRadius: radius.xs },
});

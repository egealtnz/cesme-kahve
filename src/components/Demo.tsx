// Labels and shortcuts that appear only in preview builds (EXPO_PUBLIC_DEMO=1); production renders nothing.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './Txt';
import { IS_DEMO } from '@/lib/supabase';
import { color, radius, space } from '@/theme/tokens';

/** Small fixed "ÖNİZLEME" tag so a demo is never mistaken for the live app. */
export function DemoBadge() {
  const insets = useSafeAreaInsets();
  if (!IS_DEMO) return null;
  return (
    <View pointerEvents="none" style={[styles.badgeRow, { top: insets.top }]}>
      <View style={styles.badge}>
        <Txt color="onPrimary" style={{ fontFamily: 'DMSans-Bold', fontSize: 9, lineHeight: 12, letterSpacing: 1 }}>ÖNİZLEME</Txt>
      </View>
    </View>
  );
}

/** A hint card explaining how the preview behaves on this screen. */
export function DemoNote({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  if (!IS_DEMO) return null;
  return (
    <View style={styles.note}>
      <Txt variant="overline" color="secondaryInk">Önizleme</Txt>
      <Txt variant="bodySm">{children}</Txt>
      {actions ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[1] }}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badgeRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 50 },
  badge: {
    paddingHorizontal: space[2], paddingVertical: 1, backgroundColor: color.secondary,
    borderBottomLeftRadius: radius.xs, borderBottomRightRadius: radius.xs,
  },
  note: {
    gap: space[1], padding: space[4], borderRadius: radius.md,
    backgroundColor: color.secondarySoft, borderWidth: 1, borderColor: color.secondary,
  },
});

// Over-the-air updates (EAS Update): new app versions download in the background and this banner offers
// to restart into them. Checks on launch (expo-updates ON_LOAD) and again whenever the app returns to the
// foreground. Does nothing on web, in development and in builds without expo-updates.
import { useEffect, useRef } from 'react';
import { AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshCw } from 'lucide-react-native';
import { Txt } from './Txt';
import { color, radius, space } from '@/theme/tokens';

const enabled = Platform.OS !== 'web' && !__DEV__ && Updates.isEnabled;

export function UpdateBanner() {
  return enabled ? <PendingUpdate /> : null;
}

function PendingUpdate() {
  const { isUpdatePending } = Updates.useUpdates();
  const insets = useSafeAreaInsets();
  const checking = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (checking.current) return;
      checking.current = true;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // offline or update server unreachable: try again next time the app is opened
      } finally {
        checking.current = false;
      }
    };
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, []);

  if (!isUpdatePending) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 72 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Yeni sürüm hazır. Yenilemek için dokun."
        onPress={() => { Updates.reloadAsync().catch(() => undefined); }} style={styles.banner}>
        <RefreshCw size={18} color={color.onPrimary} strokeWidth={2} />
        <Txt variant="label" color="onPrimary" style={{ flex: 1 }}>Yeni sürüm hazır</Txt>
        <Txt variant="label" color="onPrimary" style={{ textDecorationLine: 'underline' }}>Yenile</Txt>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space[4], right: space[4], zIndex: 60 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingHorizontal: space[4],
    borderRadius: radius.full, backgroundColor: color.primary, boxShadow: '0px 8px 24px rgba(0, 40, 62, 0.25)',
  },
});

// Shown instead of a blank screen when a screen crashes (Expo Router error boundary).
// Uses only plain React Native so it works even if fonts or providers failed to load.
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { color, radius, space } from '@/theme/tokens';

export function CrashScreen({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { console.error('[crash]', error); }, [error]);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.background }} contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>Bir şeyler ters gitti</Text>
      <Text style={styles.body}>Bu ekran açılırken bir hata oluştu. Tekrar dene ya da ana sayfaya dön.</Text>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={() => { retry(); }} style={[styles.btn, { backgroundColor: color.primary }]}>
          <Text style={[styles.btnText, { color: color.onPrimary }]}>Tekrar dene</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => { try { router.replace('/'); } catch { /* router unavailable */ } retry(); }}
          style={[styles.btn, { borderWidth: 1, borderColor: color.primary }]}>
          <Text style={[styles.btnText, { color: color.primary }]}>Ana sayfa</Text>
        </Pressable>
      </View>
      <Text selectable style={styles.detail}>{String(error?.message ?? error)}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: space[6], gap: space[3] },
  title: { fontSize: 24, fontWeight: '700', color: color.ink },
  body: { fontSize: 16, lineHeight: 24, color: color.ink },
  row: { flexDirection: 'row', gap: space[3], marginTop: space[2] },
  btn: { minHeight: 48, paddingHorizontal: space[5], borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 16, fontWeight: '600' },
  detail: { marginTop: space[6], fontSize: 12, color: color.inkMuted, fontFamily: 'monospace' },
});

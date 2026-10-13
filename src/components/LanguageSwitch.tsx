// Türkçe / English switch. Shown in both languages so anyone can find it.
import { Pressable, StyleSheet, View } from 'react-native';
import { Languages } from 'lucide-react-native';
import { Txt } from './Txt';
import { useLang } from '@/state/lang';
import type { Lang } from '@/lib/i18n';
import { color, radius, space } from '@/theme/tokens';

const OPTIONS: { value: Lang; label: string }[] = [{ value: 'tr', label: 'Türkçe' }, { value: 'en', label: 'English' }];

export function LanguageSwitch() {
  const { lang, setLang } = useLang();
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Languages size={20} color={color.ink} strokeWidth={1.75} />
        <Txt variant="body" style={{ flex: 1 }}>Dil · Language</Txt>
      </View>
      <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel="Dil · Language">
        {OPTIONS.map((o) => (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected: lang === o.value }}
            onPress={() => { if (lang !== o.value) setLang(o.value); }}
            style={[styles.item, lang === o.value && styles.on]}>
            <Txt variant="label" color={lang === o.value ? 'ink' : 'inkMuted'}>{o.label}</Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[3], padding: space[4] },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  segment: { flexDirection: 'row', padding: 4, borderRadius: radius.full, backgroundColor: color.surfaceMuted },
  item: { flex: 1, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: color.surface, boxShadow: '0px 1px 3px rgba(0, 40, 62, 0.12)' },
});

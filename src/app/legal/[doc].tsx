import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Txt } from '@/components/Txt';
import { Card, Screen, TopBar } from '@/components/Layout';
import { useCatalogue } from '@/lib/api';
import { fill, legalDoc } from '@/lib/legal';
import { space } from '@/theme/tokens';
import { L } from '@/lib/i18n';

export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const { data: cat } = useCatalogue();
  const d = legalDoc(doc);
  if (!d) return <Screen><TopBar back /><Txt variant="body" style={{ marginTop: space[6] }}>{L('Metin bulunamadı.', 'Document not found.')}</Txt></Screen>;
  return (
    <Screen>
      <TopBar back />
      <Txt variant="h2" accessibilityRole="header" style={{ marginTop: space[5] }}>{d.title}</Txt>
      <Txt variant="caption" color="inkMuted" style={{ marginTop: space[1] }}>{L('Son güncelleme', 'Last updated')}: {d.updated}{L('', ' · in Turkish')}</Txt>
      <Card style={{ marginTop: space[5], gap: space[3] }}>
        {d.blocks.map(([kind, text], i) =>
          kind === 'h' ? (
            <Txt key={i} variant="h6" accessibilityRole="header" style={{ marginTop: i ? space[2] : 0 }}>{fill(text, cat?.settings)}</Txt>
          ) : kind === 'li' ? (
            <View key={i} style={{ flexDirection: 'row', gap: space[2] }}>
              <Txt variant="bodySm">•</Txt>
              <Txt variant="bodySm" style={{ flex: 1 }}>{fill(text, cat?.settings)}</Txt>
            </View>
          ) : (
            <Txt key={i} variant="bodySm">{fill(text, cat?.settings)}</Txt>
          ),
        )}
      </Card>
    </Screen>
  );
}

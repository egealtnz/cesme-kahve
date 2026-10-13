import { router } from 'expo-router';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Screen, TopBar } from '@/components/Layout';
import { space } from '@/theme/tokens';
import { L } from '@/lib/i18n';

export default function NotFound() {
  return (
    <Screen>
      <TopBar />
      <Txt variant="h2" style={{ marginTop: space[8] }}>{L('Bu sayfa bulunamadı', 'Page not found')}</Txt>
      <Button label={L('Ana sayfaya dön', 'Back to home')} style={{ marginTop: space[6] }} onPress={() => router.replace('/')} />
    </Screen>
  );
}

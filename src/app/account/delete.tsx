import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Card, Screen, TopBar } from '@/components/Layout';
import { deleteMyAccount, useRewards } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useAuth } from '@/state/auth';
import { useCart } from '@/state/cart';
import { useToast } from '@/state/toast';
import { space } from '@/theme/tokens';

/** In-app account deletion (App Store 5.1.1(v) and Google Play account deletion requirements). */
export default function DeleteAccount() {
  const { session, userId, profile } = useAuth();
  const rewards = useRewards(userId);
  const cart = useCart();
  const toast = useToast();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!session) return <Redirect href="/profile" />;

  const ok = confirm.trim().toLocaleUpperCase('tr-TR') === 'SİL';

  return (
    <Screen>
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>Hesabını sil</Txt>
      <Txt variant="body" style={{ marginTop: space[3] }}>Hesabını silersen bunlar kalıcı olarak silinir ve geri alınamaz:</Txt>
      <Card style={{ marginTop: space[4], gap: space[2] }}>
        {[
          'Ad, soyad, e-posta, telefon ve doğum tarihin',
          `Kahve kartındaki ${profile?.stamps ?? 0} damgan`,
          `${rewards.data?.length ?? 0} hediye kahven`,
          'Bildirim ayarların ve kayıtlı cihazların',
        ].map((t) => <Txt key={t} variant="bodySm">• {t}</Txt>)}
      </Card>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[4] }}>
        Vergi mevzuatı gereği geçmiş siparişlerin tutar ve ürün bilgileri, adınla ilişkisi kesilerek yasal süre boyunca saklanır.
      </Txt>
      <View style={{ gap: space[4], marginTop: space[6] }}>
        <Field label="Onaylamak için SİL yaz" value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} />
        {error ? <Txt variant="bodySm" color="error">{error}</Txt> : null}
        <Button
          label="Hesabımı kalıcı olarak sil"
          variant="danger"
          icon={Trash2}
          disabled={!ok}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await deleteMyAccount();
              cart.clear();
              toast('Hesabın silindi.');
              router.dismissAll();
              router.replace('/');
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button label="Vazgeç" variant="tertiary" size="md" style={{ alignSelf: 'center' }} onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

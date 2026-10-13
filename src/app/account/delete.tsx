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
import { L } from '@/lib/i18n';

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

  const word = L('SİL', 'DELETE');
  const ok = confirm.trim().toLocaleUpperCase('tr-TR') === word || confirm.trim().toUpperCase() === word;

  return (
    <Screen>
      <TopBar back />
      <Txt variant="h1" accessibilityRole="header" style={{ marginTop: space[5] }}>{L('Hesabını sil', 'Delete your account')}</Txt>
      <Txt variant="body" style={{ marginTop: space[3] }}>{L('Hesabını silersen bunlar kalıcı olarak silinir ve geri alınamaz:', 'Deleting your account permanently removes the following, and it cannot be undone:')}</Txt>
      <Card style={{ marginTop: space[4], gap: space[2] }}>
        {[
          L('Ad, soyad, e-posta, telefon ve doğum tarihin', 'Your name, email, phone and date of birth'),
          L(`Kahve kartındaki ${profile?.stamps ?? 0} damgan`, `The ${profile?.stamps ?? 0} stamps on your coffee card`),
          L(`${rewards.data?.length ?? 0} hediye kahven`, `Your ${rewards.data?.length ?? 0} free coffees`),
          L('Bildirim ayarların ve kayıtlı cihazların', 'Your notification settings and devices'),
        ].map((t) => <Txt key={t} variant="bodySm">• {t}</Txt>)}
      </Card>
      <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[4] }}>
        {L('Vergi mevzuatı gereği geçmiş siparişlerin tutar ve ürün bilgileri, adınla ilişkisi kesilerek yasal süre boyunca saklanır.', 'Tax law requires us to keep the amounts and items of past orders for the legal period, no longer linked to your name.')}
      </Txt>
      <View style={{ gap: space[4], marginTop: space[6] }}>
        <Field label={L('Onaylamak için SİL yaz', 'Type DELETE to confirm')} value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} />
        {error ? <Txt variant="bodySm" color="error">{error}</Txt> : null}
        <Button
          label={L('Hesabımı kalıcı olarak sil', 'Delete my account permanently')}
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
              toast(L('Hesabın silindi.', 'Your account was deleted.'));
              router.dismissAll();
              router.replace('/');
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button label={L('Vazgeç', 'Cancel')} variant="tertiary" size="md" style={{ alignSelf: 'center' }} onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

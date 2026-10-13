import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { ArrowRight, MapPin } from 'lucide-react-native';
import { Txt } from '@/components/Txt';
import { Button } from '@/components/Button';
import { Screen, TopBar } from '@/components/Layout';
import { BranchList } from '@/components/BranchList';
import { useBranchesLive, useCatalogue } from '@/lib/api';
import { branchState } from '@/lib/hours';
import { useAuth } from '@/state/auth';
import { useCart } from '@/state/cart';
import { color, space } from '@/theme/tokens';
import { L } from '@/lib/i18n';

/** Always shown between the cart and payment: the customer confirms where they will collect. */
export default function CheckoutBranch() {
  const { data: cat } = useCatalogue();
  const live = useBranchesLive();
  const branches = live.data ?? cat?.branches;
  const { session, profile } = useAuth();
  const cart = useCart();
  const initial = cart.branchId ?? profile?.favorite_branch_id ?? null;
  const [selected, setSelected] = useState<string | null>(initial);
  if (!session) return <Redirect href={{ pathname: '/auth/sign-in', params: { next: '/checkout/branch' } }} />;
  if (cart.lines.length === 0) return <Redirect href="/cart" />;

  const branch = branches?.find((b) => b.id === selected && branchState(b).orderable) ?? null;
  const st = branch ? branchState(branch) : null;

  return (
    <Screen
      footer={
        <View style={{ gap: space[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <MapPin size={18} color={color.inkMuted} strokeWidth={1.75} />
            <Txt variant="bodySm" color="inkMuted" style={{ flex: 1 }}>
              {branch && st ? <>{L('Teslim alınacak şube: ', 'Pick up at: ')}<Txt variant="bodySm" style={{ fontFamily: 'DMSans-SemiBold' }}>{branch.name}</Txt> · {st.orderNow ? L(`~${st.waitMinutes} dk`, `~${st.waitMinutes} min`) : st.label}</> : L('Devam etmek için bir şube seç.', 'Choose a branch to continue.')}
            </Txt>
          </View>
          <Button
            label={L('Bu şubeyle devam et', 'Continue with this branch')}
            icon={ArrowRight}
            disabled={!branch}
            onPress={() => { if (branch) { cart.setBranch(branch.id); router.push('/checkout/confirm'); } }}
          />
        </View>
      }
    >
      <TopBar back backLabel={L('Sepete dön', 'Back to cart')} />
      <View style={{ marginTop: space[5], marginBottom: space[6] }}>
        <Txt variant="overline" color="secondaryInk">{L('Ödeme öncesi · Şube seçimi', 'Before paying · Branch')}</Txt>
        <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>{L('Siparişini hangi şubeden teslim alacaksın?', 'Where will you pick up your order?')}</Txt>
        <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>
          {L('Siparişini seçtiğin şubede hazırlayacağız. Ödemeye geçmeden önce şubeni onayla.', 'We prepare your order at the branch you choose. Confirm it before paying.')}
        </Txt>
      </View>
      {branches ? <BranchList branches={branches} selectedId={selected} onSelect={(b) => setSelected(b.id)} /> : <ActivityIndicator color={color.ink} />}
    </Screen>
  );
}

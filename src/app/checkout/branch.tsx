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
              {branch && st ? <>Teslim alınacak şube: <Txt variant="bodySm" style={{ fontFamily: 'DMSans-SemiBold' }}>{branch.name}</Txt> · {st.orderNow ? `~${st.waitMinutes} dk` : st.label}</> : 'Devam etmek için bir şube seç.'}
            </Txt>
          </View>
          <Button
            label="Bu şubeyle devam et"
            icon={ArrowRight}
            disabled={!branch}
            onPress={() => { if (branch) { cart.setBranch(branch.id); router.push('/checkout/confirm'); } }}
          />
        </View>
      }
    >
      <TopBar back backLabel="Sepete dön" />
      <View style={{ marginTop: space[5], marginBottom: space[6] }}>
        <Txt variant="overline" color="secondaryInk">Ödeme öncesi · Şube seçimi</Txt>
        <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>Siparişini hangi şubeden teslim alacaksın?</Txt>
        <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>
          Siparişini seçtiğin şubede hazırlayacağız. Ödemeye geçmeden önce şubeni onayla.
        </Txt>
      </View>
      {branches ? <BranchList branches={branches} selectedId={selected} onSelect={(b) => setSelected(b.id)} /> : <ActivityIndicator color={color.ink} />}
    </Screen>
  );
}

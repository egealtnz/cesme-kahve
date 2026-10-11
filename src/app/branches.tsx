import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { Txt } from '@/components/Txt';
import { Screen, TopBar } from '@/components/Layout';
import { BranchList } from '@/components/BranchList';
import { useCatalogue } from '@/lib/api';
import { useCart } from '@/state/cart';
import { color, space } from '@/theme/tokens';

export default function BranchesScreen() {
  const { data: cat } = useCatalogue();
  const cart = useCart();
  return (
    <Screen>
      <TopBar back />
      <View style={{ marginTop: space[5], marginBottom: space[6] }}>
        <Txt variant="overline" color="secondaryInk">Şube seçimi</Txt>
        <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>Siparişini hangi şubeden teslim alacaksın?</Txt>
        <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>
          {cart.count > 0 ? 'Sepetindeki ürünler korunur.' : 'Menüde, seçtiğin şubede tükenen ürünleri gösteririz.'}
        </Txt>
      </View>
      {cat ? (
        <BranchList
          branches={cat.branches}
          selectedId={cart.branchId}
          showChevron
          onSelect={(b) => { cart.setBranch(b.id); router.back(); }}
        />
      ) : <ActivityIndicator color={color.ink} />}
    </Screen>
  );
}

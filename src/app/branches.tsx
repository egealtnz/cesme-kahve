import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { Txt } from '@/components/Txt';
import { Screen, TopBar } from '@/components/Layout';
import { BranchList } from '@/components/BranchList';
import { useCatalogue } from '@/lib/api';
import { useCart } from '@/state/cart';
import { color, space } from '@/theme/tokens';
import { L } from '@/lib/i18n';

export default function BranchesScreen() {
  const { data: cat } = useCatalogue();
  const cart = useCart();
  return (
    <Screen>
      <TopBar back />
      <View style={{ marginTop: space[5], marginBottom: space[6] }}>
        <Txt variant="overline" color="secondaryInk">{L('Şube seçimi', 'Branch')}</Txt>
        <Txt variant="h1" accessibilityRole="header" style={{ marginTop: 4 }}>{L('Siparişini hangi şubeden teslim alacaksın?', 'Where will you pick up your order?')}</Txt>
        <Txt variant="bodySm" color="inkMuted" style={{ marginTop: space[2] }}>
          {cart.count > 0 ? L('Sepetindeki ürünler korunur.', 'Your cart stays as it is.') : L('Menüde, seçtiğin şubede tükenen ürünleri gösteririz.', 'The menu shows what is sold out at the branch you choose.')}
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

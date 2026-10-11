import { StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { House, ShoppingBag, Store, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from '@/components/Txt';
import { useAuth } from '@/state/auth';
import { useCart } from '@/state/cart';
import { color, font, radius, shadow } from '@/theme/tokens';

function TabIcon({ Icon, focused, count }: { Icon: typeof House; focused: boolean; count?: number }) {
  return (
    <View style={[styles.pill, focused && { backgroundColor: color.secondarySoft }]}>
      <Icon size={24} color={focused ? color.ink : color.inkMuted} strokeWidth={1.75} />
      {count ? (
        <View style={styles.count}>
          <Txt variant="caption" color="onSecondary" style={{ fontFamily: font.bold, fontSize: 11, lineHeight: 14 }}>{count > 9 ? '9+' : count}</Txt>
        </View>
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  const { isStaff } = useAuth();
  const { count } = useCart();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.ink,
        tabBarInactiveTintColor: color.inkMuted,
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 12 },
        tabBarStyle: {
          backgroundColor: color.surface,
          borderTopWidth: 0,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          height: 64 + insets.bottom,
          paddingTop: 8,
          position: 'absolute',
          boxShadow: shadow.md,
        },
        sceneStyle: { backgroundColor: color.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Ana sayfa', tabBarIcon: ({ focused }) => <TabIcon Icon={House} focused={focused} /> }} />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Sepet',
          tabBarAccessibilityLabel: count ? `Sepet, ${count} ürün` : 'Sepet',
          tabBarIcon: ({ focused }) => <TabIcon Icon={ShoppingBag} focused={focused} count={count} />,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: ({ focused }) => <TabIcon Icon={User} focused={focused} /> }} />
      <Tabs.Screen
        name="staff"
        options={{ title: 'Şube', href: isStaff ? undefined : null, tabBarIcon: ({ focused }) => <TabIcon Icon={Store} focused={focused} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  pill: { width: 56, height: 32, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  count: {
    position: 'absolute', top: -4, right: 6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9,
    backgroundColor: color.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: color.surface,
  },
});

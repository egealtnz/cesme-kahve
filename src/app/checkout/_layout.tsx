import { Stack } from 'expo-router';
import { color } from '@/theme/tokens';

export default function CheckoutLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.background } }} />;
}

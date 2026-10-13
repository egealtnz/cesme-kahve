import { Stack } from 'expo-router';
import { AdminOnly } from '@/components/Admin';
import { color } from '@/theme/tokens';

export default function AdminLayout() {
  return (
    <AdminOnly>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.background } }} />
    </AdminOnly>
  );
}

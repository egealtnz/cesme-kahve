import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/state/auth';
import { CartProvider, useCart } from '@/state/cart';
import { ToastProvider } from '@/state/toast';
import { useNotificationRouting } from '@/lib/notifications';
import { color } from '@/theme/tokens';
import { DemoBadge } from '@/components/Demo';
import { CrashScreen } from '@/components/CrashScreen';

/** Any screen that crashes shows a recoverable error screen instead of a blank page. */
export const ErrorBoundary = CrashScreen;

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Refetch stale data (stamps, orders, sold-out items) when the app comes back to the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 } },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Fraunces-SemiBold': require('../../assets/fonts/Fraunces-SemiBold.ttf'),
    'Fraunces-Display': require('../../assets/fonts/Fraunces-Display.ttf'),
    'DMSans-Regular': require('../../assets/fonts/DMSans-Regular.ttf'),
    'DMSans-Medium': require('../../assets/fonts/DMSans-Medium.ttf'),
    'DMSans-SemiBold': require('../../assets/fonts/DMSans-SemiBold.ttf'),
    'DMSans-Bold': require('../../assets/fonts/DMSans-Bold.ttf'),
  });

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CartProvider>
            <ToastProvider>
              <StatusBar style="dark" />
              {fontsLoaded ? <Navigator /> : null}
              {fontsLoaded ? <DemoBadge /> : null}
            </ToastProvider>
          </CartProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function Navigator() {
  const { ready } = useAuth();
  const cart = useCart();
  useNotificationRouting();

  useEffect(() => {
    if (ready && cart.hydrated) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready, cart.hydrated]);
  if (!ready || !cart.hydrated) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.background },
        animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'default',
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="product/[id]"
        options={{ presentation: Platform.OS === 'web' ? 'modal' : 'formSheet', sheetAllowedDetents: [0.92], sheetGrabberVisible: true, sheetCornerRadius: 28 }}
      />
      <Stack.Screen name="auth" />
      <Stack.Screen name="checkout" />
      <Stack.Screen name="order/[id]" />
      <Stack.Screen name="loyalty" />
      <Stack.Screen name="branches" />
      <Stack.Screen name="account" />
      <Stack.Screen name="legal/[doc]" />
      <Stack.Screen name="staff" />
      <Stack.Screen name="odeme-sonucu" />
    </Stack>
  );
}

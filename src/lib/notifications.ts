import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/** Asks for permission (call after the customer has agreed in our own prompt) and stores the token. */
export async function registerForOrderNotifications(userId: string): Promise<'granted' | 'denied' | 'unavailable'> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unavailable';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'Sipariş durumu',
      description: 'Siparişin hazır olduğunda haber verir.',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#CA812A',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!granted) {
    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.granted;
  }
  if (!granted) return 'denied';

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId || String(projectId).startsWith('REPLACE')) return 'unavailable';
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('push_tokens').upsert(
      { token, user_id: userId, platform: Platform.OS as 'ios' | 'android', updated_at: new Date().toISOString() },
      { onConflict: 'token' },
    );
    return 'granted';
  } catch {
    return 'unavailable';
  }
}

export async function notificationsAllowed(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const p = await Notifications.getPermissionsAsync();
  return p.granted;
}

/** Tapping an "order ready" notification opens that order. */
export function useNotificationRouting() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (n: Notifications.Notification | undefined) => {
      const orderId = n?.request.content.data?.orderId;
      if (typeof orderId === 'string') router.push(`/order/${orderId}`);
    };
    Notifications.getLastNotificationResponseAsync().then((r) => open(r?.notification)).catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification));
    return () => sub.remove();
  }, []);
}

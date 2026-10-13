import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

const TOKEN_KEY = 'ck.push.token';

/** Android shows notifications per channel; the user can mute each one separately in system settings. */
async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('orders', {
    name: 'Sipariş durumu',
    description: 'Siparişin hazır olduğunda haber verir.',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#CA812A',
  });
  await Notifications.setNotificationChannelAsync('rewards', {
    name: 'Hediye kahveler',
    description: 'Doğum günü kahven gibi hesabına eklenen hediyeler.',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#CA812A',
  });
  await Notifications.setNotificationChannelAsync('offers', {
    name: 'Kampanyalar',
    description: 'İzin verdiysen kampanya ve fırsat duyuruları.',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#CA812A',
  });
}

async function ensureStaffChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('new-orders', {
    name: 'Yeni siparişler (şube)',
    description: 'Şubene yeni sipariş geldiğinde haber verir.',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 300, 200, 300],
    lightColor: '#CA812A',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/** Asks for permission (if not given yet) and stores this phone's push token for the signed-in user. */
async function registerDevice(userId: string): Promise<'granted' | 'denied' | 'unavailable'> {
  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!granted) {
    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.granted;
  }
  if (!granted) return 'denied';

  try {
    // Android: the phone's Firebase token (our server sends through FCM directly).
    // iOS: an Expo push token (sent through Expo's push service, which uses APNs).
    let token: string;
    if (Platform.OS === 'android') {
      token = String((await Notifications.getDevicePushTokenAsync()).data);
    } else {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (!projectId || String(projectId).startsWith('REPLACE')) return 'unavailable';
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    }
    const { error } = await supabase.from('push_tokens').upsert(
      { token, user_id: userId, platform: Platform.OS as 'ios' | 'android', updated_at: new Date().toISOString() },
      { onConflict: 'token' },
    );
    if (error) return 'unavailable';
    await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => undefined);
    return 'granted';
  } catch {
    return 'unavailable';
  }
}

/** For customers: call after they agreed in our own prompt ("Hazır olunca haber verelim mi?"). */
export async function registerForOrderNotifications(userId: string): Promise<'granted' | 'denied' | 'unavailable'> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unavailable';
  await ensureChannels();
  return registerDevice(userId);
}

/** For baristas: new orders of their branch arrive as notifications, even when the app is closed. */
export async function registerForStaffNotifications(userId: string): Promise<'granted' | 'denied' | 'unavailable'> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unavailable';
  await ensureChannels();
  await ensureStaffChannel();
  return registerDevice(userId);
}

/** On sign-out: stop sending this account's notifications to this phone. Needs the session, so call before signing out. */
export async function forgetThisDevice(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await supabase.from('push_tokens').delete().eq('token', token);
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // offline: the token is replaced when the next account registers on this phone
  }
}

export async function notificationsAllowed(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const p = await Notifications.getPermissionsAsync();
  return p.granted;
}

/** Tapping a notification opens the order (customers) or the branch queue (staff, new order). */
export function useNotificationRouting() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (n: Notifications.Notification | undefined) => {
      const data = n?.request.content.data;
      if (data?.screen === 'staff') router.navigate('/staff');
      else if (data?.screen === 'loyalty') router.push('/loyalty');
      else if (data?.screen === 'home') router.navigate('/');
      else if (typeof data?.orderId === 'string') router.push(`/order/${data.orderId}`);
    };
    Notifications.getLastNotificationResponseAsync().then((r) => open(r?.notification)).catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification));
    return () => sub.remove();
  }, []);
}

import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import aesjs from 'aes-js';
import { bundledMenuImages } from './menu/images';

/**
 * Preview builds (EXPO_PUBLIC_DEMO=1) run on a built-in demo backend with sample data — see lib/demo/.
 * The value is inlined at build time, so production bundles contain none of the demo code.
 */
export const IS_DEMO = process.env.EXPO_PUBLIC_DEMO === '1';

const url = IS_DEMO ? 'https://demo.invalid' : process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = IS_DEMO ? 'demo' : process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set (see .env.example).');
}

/**
 * Sessions are larger than the 2 KB Keychain/Keystore limit, so the session is AES-encrypted and
 * stored in AsyncStorage while its key lives in SecureStore (Supabase's recommended pattern).
 */
class LargeSecureStore {
  private async encrypt(key: string, value: string) {
    const encryptionKey = Crypto.getRandomBytes(32);
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encrypted);
  }

  private async decrypt(key: string, value: string) {
    const keyHex = await SecureStore.getItemAsync(key);
    if (!keyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(keyHex), new aesjs.Counter(1));
    return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(value)));
  }

  async getItem(key: string) {
    const encrypted = await AsyncStorage.getItem(key);
    return encrypted ? this.decrypt(key, encrypted) : null;
  }

  async setItem(key: string, value: string) {
    await AsyncStorage.setItem(key, await this.encrypt(key, value));
  }

  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }
}

// The literal env check (not IS_DEMO) lets the bundler drop the demo backend from production builds.
export const supabase: SupabaseClient = process.env.EXPO_PUBLIC_DEMO === '1'
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? (require('./demo/client').createDemoClient() as unknown as SupabaseClient)
  : createClient(url, anonKey, {
    auth: {
      storage: Platform.OS === 'web' ? undefined : new LargeSecureStore(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

// Refresh tokens only while the app is in the foreground (Supabase guidance for React Native).
if (Platform.OS !== 'web' && !IS_DEMO) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const SUPABASE_URL = url;

/** Image source for a menu photo: the copy shipped in the app, otherwise the public "menu" storage bucket. */
export function menuImageSource(path: string | null | undefined): number | { uri: string } | undefined {
  if (!path) return undefined;
  return bundledMenuImages[path] ?? (IS_DEMO ? undefined : { uri: `${url}/storage/v1/object/public/${path}` });
}

/** Calls an edge function and turns `{ error: code }` responses into thrown errors. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // FunctionsHttpError carries the response; our functions answer { error: "<code>" }.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const payload = await ctx.json().catch(() => null);
      if (payload?.error) throw new Error(payload.error);
    }
    throw error;
  }
  return data as T;
}

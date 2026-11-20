// Device storage for the session token (VGStack vg-mobile).
// - SecureStore keys only accept [A-Za-z0-9._-]: `tenace:token` breaks on the device and works on the web. Use dots.
// - WHEN_UNLOCKED_THIS_DEVICE_ONLY: never goes to backups or to another restored device.
// - SecureStore does not exist on the web (Expo web, UI checks): falls back to localStorage.
// - Passwords are NEVER stored; only the session token, the cached profile and preferences.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { KeyValueStore } from './queue';

const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const web = Platform.OS === 'web';

export const deviceStore: KeyValueStore = {
  async get(key) {
    if (web) return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
    return SecureStore.getItemAsync(key, options);
  },
  async set(key, value) {
    if (web) return void window.localStorage.setItem(key, value);
    await SecureStore.setItemAsync(key, value, options);
  },
  async remove(key) {
    if (web) return void window.localStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key, options);
  },
};

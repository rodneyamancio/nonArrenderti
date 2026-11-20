// Where the app finds the API. EXPO_PUBLIC_* is compiled INTO the installed app and anyone can read it:
// never put a secret here. The app talks to the same `/api` the portal uses (the web proxies it).
//
// Without the variable only development (__DEV__) falls back to the local machine; a build or OTA shipped
// without it points to PRODUCTION instead of sending everyone's app to look for the API on their own phone.
// After changing EXPO_PUBLIC_*, run with --clear: Metro may reuse a cached bundle with the old URL.
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const development = typeof __DEV__ !== 'undefined' && __DEV__;
export const PRODUCTION_PORTAL_URL = 'https://tenace.amancio.family';
const DEV_WEB_PORT = 3310;

// Physical phone (Expo Go): localhost is the phone itself, so follow the Metro host (the dev machine).
// Android emulator: the machine is 10.0.2.2. iOS simulator: localhost is the Mac.
function devPortalUrl(): string {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:${DEV_WEB_PORT}`;
  if (Platform.OS === 'android') return `http://10.0.2.2:${DEV_WEB_PORT}`;
  return `http://localhost:${DEV_WEB_PORT}`;
}

const clean = (v: string) => v.trim().replace(/\/+$/, '');

/** Portal origin: invite links, "abrir no portal". */
export const portalUrl = clean(process.env.EXPO_PUBLIC_PORTAL_URL || (development ? devPortalUrl() : PRODUCTION_PORTAL_URL));
/** API base: the portal's same-origin proxy. */
export const apiUrl = clean(process.env.EXPO_PUBLIC_API_URL || `${portalUrl}/api`);

export function validApiUrl(value: string = apiUrl): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (development && url.protocol === 'http:');
  } catch {
    return false;
  }
}

// OTA updates (expo-updates / EAS Update), VGStack vg-mobile — origin CalebePay.
// Checks when the app opens and when it comes back (at most every 30 min), downloads in the
// background and NEVER reloads by itself: an action in progress is never interrupted. The new
// version starts on the next cold start; `onDownloaded` shows "Atualizar agora" for the impatient.
// Updates.isEnabled is false in Expo Go and in __DEV__ (nothing happens there).
import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

const minIntervalMs = 30 * 60_000;

export function useAutoUpdate(onDownloaded: (reload: () => void) => void): void {
  const last = useRef(0);
  useEffect(() => {
    if (!Updates.isEnabled) return;
    const check = async () => {
      const now = Date.now();
      if (now - last.current < minIntervalMs) return;
      last.current = now;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;
        await Updates.fetchUpdateAsync();
        onDownloaded(() => void Updates.reloadAsync());
      } catch {
        // Offline or update server down: keep the current version.
      }
    };
    void check();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void check();
    });
    return () => subscription.remove();
  }, [onDownloaded]);
}

/** "1.0.0 · OTA 3f9a1c2 · production" for the profile screen (helps support). */
export function versionLabel(appVersion: string | undefined): string {
  const parts = [appVersion ?? ''];
  if (Updates.isEnabled) {
    parts.push(Updates.isEmbeddedLaunch ? 'build' : `OTA ${(Updates.updateId ?? '').slice(0, 7)}`);
    if (Updates.channel) parts.push(Updates.channel);
  }
  return parts.filter(Boolean).join(' · ');
}

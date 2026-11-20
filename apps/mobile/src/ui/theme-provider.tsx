import { StatusBar } from 'expo-status-bar';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { KEYS } from '@/lib/queue';
import { deviceStore } from '@/lib/storage';
import { dark, light, type Palette } from './theme';

export type ThemePref = 'light' | 'dark' | 'system';

interface ThemeValue {
  c: Palette;
  scheme: 'light' | 'dark';
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

const ThemeCtx = createContext<ThemeValue | null>(null);

/** Claro / Escuro / Sistema — same choice as the portal, remembered on this device. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>('system');

  useEffect(() => {
    deviceStore
      .get(KEYS.theme)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') setPrefState(v);
      })
      .catch(() => undefined);
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const scheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
    return {
      c: scheme === 'dark' ? dark : light,
      scheme,
      pref,
      setPref: (p) => {
        setPrefState(p);
        void deviceStore.set(KEYS.theme, p).catch(() => undefined);
      },
    };
  }, [pref, system]);

  return (
    <ThemeCtx.Provider value={value}>
      <StatusBar style={value.scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}

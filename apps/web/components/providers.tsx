'use client';
import { ThemeProvider } from 'next-themes';
import { ToastProvider } from '@/components/ui';

/** next-themes writes data-theme before first paint (no flash). "system" follows the device. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem storageKey="tenace.theme" disableTransitionOnChange>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}

import type { Metadata } from 'next';
import { AppShell } from '@/components/app/shell';

/** Signed-in area: never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

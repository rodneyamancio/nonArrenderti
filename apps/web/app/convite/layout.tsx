import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Convite para um grupo', description: 'Você foi convidado para um grupo de metas no Tenace.', robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

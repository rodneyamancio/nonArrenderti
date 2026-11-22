import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Criar conta grátis',
  description: 'Crie sua conta no Tenace em 30 segundos e monte um grupo de metas semanais com seus amigos. Grátis para começar.',
  alternates: { canonical: '/criar-conta' },
  openGraph: { url: '/criar-conta', title: 'Crie sua conta grátis no Tenace' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Entrar',
  description: 'Entre no Tenace para registrar suas atividades, ver a semana do seu grupo e pagar as cotas.',
  alternates: { canonical: '/entrar' },
  openGraph: { url: '/entrar', title: 'Entrar no Tenace' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

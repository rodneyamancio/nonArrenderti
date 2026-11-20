import Link from 'next/link';
import { TenaceLogo } from '@/components/brand';

/** Split layout for auth screens: brand panel on desktop, compact on phones. */
export function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="tone-violet tone-bg relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-white/10" aria-hidden />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-[#ff7a1a]/30 blur-3xl" aria-hidden />
        <Link href="/" className="relative">
          <TenaceLogo tagline inverted />
        </Link>
        <div className="relative max-w-md">
          <h1 className="text-4xl leading-tight font-extrabold">Compromisso com você mesmo. Com um empurrãozinho do grupo.</h1>
          <p className="mt-4 text-lg text-white/80">Metas semanais, cotas de verdade e um caixa para quem não cumprir. Cumpriu tudo? A semana fecha no zero.</p>
        </div>
        <p className="relative text-sm font-medium text-white/70">non arrenderti — não desista 💜</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-block lg:hidden">
            <TenaceLogo tagline />
          </Link>
          <h2 className="text-2xl font-extrabold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </section>
    </main>
  );
}

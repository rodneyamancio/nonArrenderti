import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { TenaceLogo, TenaceMark } from '@/components/brand';

export default function Landing() {
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <TenaceLogo />
        <nav className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          {/* Phones: "Já tenho conta" is right below in the hero; the header keeps the theme switch. */}
          <Link href="/entrar" className="hidden rounded-md px-3 py-2 text-sm font-semibold whitespace-nowrap hover:bg-accent sm:inline-block">
            Entrar
          </Link>
          <Link href="/criar-conta" className="rounded-md bg-primary px-4 py-2 text-sm font-bold whitespace-nowrap text-primary-foreground shadow-xs hover:bg-primary-hover">
            Criar conta
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-spark-soft px-3 py-1 text-sm font-semibold text-spark">🔥 non arrenderti — não desista</p>
            <h1 className="mt-5 text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-6xl">
              Suas metas. <span className="bg-[linear-gradient(135deg,#6d3bff,#ff7a1a)] bg-clip-text text-transparent">Seu grupo.</span> Seu bolso.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Monte um grupo, defina metas semanais (ler, treinar, correr…) e um valor por cota. A semana começa no negativo — cada atividade cumprida paga uma cota. Fechou no zero? Parabéns. Faltou? Vai pro caixa do grupo.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/criar-conta" className="inline-flex h-12 items-center rounded-md bg-primary px-6 text-base font-bold text-primary-foreground shadow-md hover:bg-primary-hover">
                Começar grátis
              </Link>
              <Link href="/entrar" className="inline-flex h-12 items-center rounded-md border border-border-strong bg-card px-6 text-base font-semibold hover:bg-accent">
                Já tenho conta
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -top-8 -right-6 h-40 w-40 rounded-full bg-[#ff7a1a]/25 blur-3xl" aria-hidden />
            <div className="absolute -bottom-10 -left-8 h-48 w-48 rounded-full bg-[#6d3bff]/25 blur-3xl" aria-hidden />
            <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <div className="tone-violet tone-bg flex items-center gap-3 px-5 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 text-xl">🔥</span>
                <div>
                  <p className="font-extrabold">Clube do Foco</p>
                  <p className="text-xs text-white/80">4 pessoas · fecha em 2d 6h</p>
                </div>
              </div>
              <div className="flex flex-col gap-4 p-5">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Sua semana</p>
                    <p className="text-2xl font-extrabold tabular-nums">-R$ 5,00</p>
                  </div>
                  <p className="text-sm text-muted-foreground">falta 1 cota</p>
                </div>
                {[
                  { e: '🏋️', n: 'Academia', s: 3, a: 3 },
                  { e: '📚', n: 'Leitura', s: 3, a: 2 },
                ].map((g) => (
                  <div key={g.n} className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-xl">{g.e}</span>
                    <div className="flex-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold">{g.n}</span>
                        <span className="text-xs text-muted-foreground">
                          {g.a}/{g.s} · R$ {g.a * 5},00
                        </span>
                      </div>
                      <div className="mt-1.5 flex gap-1">
                        {Array.from({ length: g.s }, (_, i) => (
                          <span key={i} className={`h-2.5 flex-1 rounded-full ${i < g.a ? (g.a === g.s ? 'bg-success-solid' : 'bg-brand-solid') : 'bg-muted'}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="rounded-lg bg-success-soft px-4 py-3 text-sm font-semibold text-success">+R$ 5,00 · cota paga! 🔥</div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-card">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-3">
            {[
              { n: '1', t: 'Crie o grupo', d: 'Dê um nome, escolha quem participa e para onde vai o dinheiro (a caixinha do churrasco, uma doação…).' },
              { n: '2', t: 'Defina as metas', d: '10 páginas por dia, academia 3× por semana. Cada meta vira cotas com um valor — ex.: R$ 5.' },
              { n: '3', t: 'Registre e zere', d: 'A semana abre em −R$ 30. Cada registro paga uma cota. O que faltar no domingo vira multa para o caixa.' },
            ].map((s) => (
              <div key={s.n}>
                <span className="tone-violet tone-bg flex h-10 w-10 items-center justify-center rounded-full text-lg font-extrabold">{s.n}</span>
                <h2 className="mt-4 text-lg font-extrabold">{s.t}</h2>
                <p className="mt-2 text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { e: '👥', t: 'Vários grupos', d: 'Um com os amigos da academia, outro com o clube do livro.' },
              { e: '📒', t: 'Conta corrente', d: 'Extrato de cada pessoa e o caixa do grupo, transparentes.' },
              { e: '💸', t: 'PIX na hora', d: 'QR Code e copia-e-cola gerados para pagar a multa.' },
              { e: '⚖️', t: 'Justo', d: 'Foto opcional e contestação: o grupo decide o que vale.' },
            ].map((f) => (
              <div key={f.t} className="rounded-xl border border-border bg-card p-5 shadow-xs">
                <span className="text-2xl">{f.e}</span>
                <h3 className="mt-3 font-extrabold">{f.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span className="flex items-center gap-2">
            <TenaceMark className="h-6 w-6" /> Tenace · non arrenderti
          </span>
          <span>O Tenace só registra os valores — o dinheiro circula por PIX, entre vocês.</span>
        </div>
      </footer>
    </div>
  );
}

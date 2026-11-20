import Link from 'next/link';
import { TenaceMark } from '@/components/brand';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <TenaceMark className="h-14 w-14" />
      <h1 className="text-2xl font-extrabold">Página não encontrada</h1>
      <p className="text-muted-foreground">Mas não desista — volte para o início.</p>
      <Link href="/inicio" className="font-semibold text-brand">
        Ir para o início
      </Link>
    </main>
  );
}

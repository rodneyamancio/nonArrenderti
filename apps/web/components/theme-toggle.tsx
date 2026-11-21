'use client';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cx } from '@/lib/format';

/**
 * One tap switches light ↔ dark (from whatever is showing, including "system").
 * Perfil › Aparência still offers Claro / Escuro / Sistema.
 */
export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === 'dark';
  const label = dark ? 'Tema claro' : 'Tema escuro';
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
      title={dark ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]',
        withLabel ? 'h-10 px-3 text-sm font-semibold text-muted-foreground hover:text-foreground' : 'h-10 w-10',
        className,
      )}
    >
      {/* Same size before mount: no layout jump, no hydration mismatch. */}
      {!mounted ? <span className="h-5 w-5" aria-hidden /> : dark ? <Sun className="h-5 w-5 text-spark-solid" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
      {withLabel && <span>{mounted ? label : 'Tema'}</span>}
    </button>
  );
}

import { useId } from 'react';
import { cx } from '@/lib/format';

/**
 * Tenace mark: a "T" whose bar rises to the right (progress) with an orange spark (effort).
 * Same geometry as docs/brand/tenace-mark.svg.
 */
export function TenaceMark({ className, title = 'Tenace' }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={title}>
      <defs>
        <linearGradient id={`tg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8A5CFF" />
          <stop offset="1" stopColor="#5524E0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill={`url(#tg-${id})`} />
      <path d="M16 26.5 L42 20" stroke="#fff" strokeWidth="8" strokeLinecap="round" fill="none" />
      <path d="M29.5 23.4 V47" stroke="#fff" strokeWidth="8" strokeLinecap="round" fill="none" />
      <circle cx="50" cy="15" r="5" fill="#FF7A1A" />
    </svg>
  );
}

export function TenaceLogo({ className, tagline = false, inverted = false }: { className?: string; tagline?: boolean; inverted?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <TenaceMark className="h-9 w-9 shrink-0" />
      <span className="flex flex-col leading-none">
        <span className={cx('text-[1.4rem] font-extrabold tracking-[-0.04em]', inverted ? 'text-white' : 'text-foreground')}>tenace</span>
        {tagline && <span className={cx('mt-1 text-[0.7rem] font-medium tracking-wide', inverted ? 'text-white/70' : 'text-muted-foreground')}>non arrenderti</span>}
      </span>
    </span>
  );
}

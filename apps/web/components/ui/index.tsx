'use client';
import { AlertTriangle, CheckCircle2, Info, Loader2, RotateCw, X } from 'lucide-react';
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { errorMessage } from '@/lib/api';
import { cx, formatCents, initials } from '@/lib/format';
import { parseMoneyToCents } from '@tenace/rules';

// ------------------------------------------------------------------ Button
type Variant = 'primary' | 'brand' | 'outline' | 'ghost' | 'danger' | 'soft';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover shadow-xs',
  brand: 'bg-brand-solid text-on-brand hover:bg-brand-solid-hover shadow-xs',
  outline: 'border border-border-strong bg-card text-foreground hover:bg-accent',
  ghost: 'text-foreground hover:bg-accent',
  danger: 'bg-danger-solid text-on-solid hover:opacity-90',
  soft: 'bg-brand-soft text-brand hover:opacity-90',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, ...rest },
  ref,
) {
  const sizes = { sm: 'h-9 px-3 text-sm gap-1.5', md: 'h-[var(--ui-control-height)] px-4 text-[0.9375rem] gap-2', lg: 'h-12 px-6 text-base gap-2', icon: 'h-10 w-10 justify-center' };
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'touch-target inline-flex shrink-0 items-center justify-center rounded-md font-semibold whitespace-nowrap transition-colors duration-[var(--ui-duration)] disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

// ------------------------------------------------------------------ Inputs
const control =
  'w-full rounded-md border border-input bg-card px-3 text-[0.9375rem] text-foreground placeholder:text-subtle transition-shadow duration-[var(--ui-duration)] focus:border-ring focus:shadow-[var(--ui-focus-ring)] focus:outline-none disabled:opacity-60 aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(control, 'h-[var(--ui-control-height)]', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(control, 'min-h-24 py-2.5 leading-relaxed', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx(control, 'h-[var(--ui-control-height)] cursor-pointer pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

export function Field({ label, hint, error, children, className, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Field with an auto id wired to its control. */
export function useFieldId(prefix = 'f') {
  return `${prefix}-${useId().replace(/:/g, '')}`;
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useFieldId('sw');
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-[var(--ui-duration)] disabled:opacity-50', checked ? 'bg-brand-solid' : 'bg-border-strong')}
      >
        <span className={cx('inline-block h-5 w-5 rounded-full bg-card shadow-sm transition-transform duration-[var(--ui-duration)]', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ Surfaces
export function Card({ children, className, title, description, actions, footer, padded = true }: { children?: ReactNode; className?: string; title?: ReactNode; description?: ReactNode; actions?: ReactNode; footer?: ReactNode; padded?: boolean }) {
  return (
    <section className={cx('min-w-0 rounded-lg border border-border bg-card shadow-xs', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
      {footer && <footer className="border-t border-border px-5 py-3">{footer}</footer>}
    </section>
  );
}

const TONES = {
  neutral: 'bg-muted text-muted-foreground',
  brand: 'bg-brand-soft text-brand',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  spark: 'bg-spark-soft text-spark',
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', TONES[tone], className)}>{children}</span>;
}


// ------------------------------------------------------------------ States
export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon && <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </div>
      <p className="text-sm text-muted-foreground">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw className="h-4 w-4" aria-hidden /> Tentar de novo
        </Button>
      )}
    </div>
  );
}

export function Notice({ tone = 'info', children, title }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode; title?: string }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-md px-4 py-3 text-sm', TONES[tone])}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className="text-foreground/85">{children}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Dialog
export function Dialog({ open, onClose, title, description, children, footer, wide, sheet = true }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; wide?: boolean; sheet?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx('m-auto w-[calc(100%-1.5rem)] rounded-xl border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-overlay', wide ? 'max-w-3xl' : 'max-w-lg', sheet && 'sheet')}
      aria-labelledby="dialog-title"
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-1rem)] flex-col sm:max-h-[85vh]">
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 id="dialog-title" className="text-lg font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
              <X className="h-4 w-4" />
            </Button>
          </header>
          <div className="overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
          {footer && <footer className="pb-safe flex flex-col-reverse gap-2 border-t border-border px-5 py-3 sm:flex-row sm:justify-end">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

// ------------------------------------------------------------------ Toast
interface ToastItem {
  id: number;
  tone: 'success' | 'danger' | 'info';
  message: string;
}
const ToastCtx = createContext<(message: string, tone?: ToastItem['tone']) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, tone: ToastItem['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, tone, message }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-24 left-4 z-[60] flex flex-col items-center gap-2 sm:left-auto sm:items-end lg:bottom-4">
        {items.map((t) => (
          <div key={t.id} role={t.tone === 'danger' ? 'alert' : 'status'} className={cx('animate-in pointer-events-auto flex max-w-sm items-center gap-2 rounded-md border border-border bg-card px-4 py-3 text-sm font-medium shadow-md')}>
            {t.tone === 'danger' ? <AlertTriangle className="h-4 w-4 text-danger" aria-hidden /> : <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ------------------------------------------------------------------ Misc
export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-xs">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl leading-tight font-bold break-words tabular-nums xl:text-2xl">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-md border border-border bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('shrink-0 rounded-[7px] px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors', value === o.value ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Tenace extras
const AVATAR_TONES: Record<string, string> = { violet: 'tone-violet', spark: 'tone-spark', mint: 'tone-mint', sky: 'tone-sky', rose: 'tone-rose', sun: 'tone-sun', ink: 'tone-ink' };

export function Avatar({ name, color = 'violet', size = 'md', className }: { name: string; color?: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = { sm: 'h-7 w-7 text-[0.65rem]', md: 'h-9 w-9 text-xs', lg: 'h-14 w-14 text-lg' }[size];
  return (
    <span aria-hidden className={cx('tone-bg inline-flex shrink-0 items-center justify-center rounded-full font-bold', AVATAR_TONES[color] ?? 'tone-violet', s, className)}>
      {initials(name)}
    </span>
  );
}

export function toneClass(color: string): string {
  return AVATAR_TONES[color] ?? 'tone-violet';
}

/** Slot bar: one segment per slot, filled when paid. */
export function SlotBar({ slots, achieved, className }: { slots: number; achieved: number; className?: string }) {
  if (slots > 14) {
    const pct = Math.round((achieved / Math.max(1, slots)) * 100);
    return (
      <div className={cx('h-2.5 w-full overflow-hidden rounded-full bg-muted', className)} role="progressbar" aria-valuenow={achieved} aria-valuemax={slots} aria-label="Cotas pagas">
        <div className="h-full rounded-full bg-brand-solid transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    );
  }
  return (
    <div className={cx('flex w-full gap-1', className)} role="progressbar" aria-valuenow={achieved} aria-valuemax={slots} aria-label="Cotas pagas">
      {Array.from({ length: slots }, (_, i) => (
        <span key={i} className={cx('h-2.5 flex-1 rounded-full transition-colors duration-500', i < achieved ? (achieved === slots ? 'bg-success-solid' : 'bg-brand-solid') : 'bg-muted')} />
      ))}
    </div>
  );
}

/** Circular progress ring (0..1). */
export function Ring({ value, size = 56, stroke = 6, children, done }: { value: number; size?: number; stroke?: number; children?: ReactNode; done?: boolean }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-[var(--ui-surface-sunken)]" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} className={cx('transition-[stroke-dashoffset] duration-700', done ? 'stroke-[var(--ui-success-solid)]' : 'stroke-[var(--ui-brand-solid)]')} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums">{children}</span>
    </div>
  );
}

/** Money as text with sign color. */
export function Money({ cents, signed, className }: { cents: number; signed?: boolean; className?: string }) {
  const tone = !signed || cents === 0 ? '' : cents > 0 ? 'text-success' : 'text-danger';
  return <span className={cx('tabular-nums', tone, className)}>{signed && cents > 0 ? '+' : ''}{formatCents(cents)}</span>;
}

/** Money input in reais (accepts "5", "5,50", "1.234,56"). */
export function MoneyInput({ value, onChange, id, placeholder = '0,00', ...rest }: { value: number | null; onChange: (cents: number | null) => void; id?: string; placeholder?: string; 'aria-invalid'?: boolean }) {
  const [text, setText] = useState(value != null ? (value / 100).toFixed(2).replace('.', ',') : '');
  useEffect(() => {
    if (value == null) return;
    const parsed = parseMoneyToCents(text);
    if (parsed !== value) setText((value / 100).toFixed(2).replace('.', ','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
      <Input
        id={id}
        inputMode="decimal"
        placeholder={placeholder}
        className="pl-10 tabular-nums"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseMoneyToCents(e.target.value));
        }}
        {...rest}
      />
    </div>
  );
}

export function Chip({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'touch-target inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors',
        active ? 'border-brand-solid bg-brand-soft text-brand' : 'border-border bg-card text-foreground hover:bg-accent',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function CopyButton({ text, label = 'Copiar', className }: { text: string; label?: string; className?: string }) {
  const toast = useToast();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast('Copiado!');
        } catch {
          toast('Não foi possível copiar', 'danger');
        }
      }}
    >
      {label}
    </Button>
  );
}

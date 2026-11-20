// Tenace UI kit for the app: the portal's components (components/ui) rebuilt on React Native, same roles,
// same labels. Screens never write raw colors: they read the palette from useTheme().
import { formatCents, parseMoneyToCents } from '@tenace/rules';
import { errorMessage } from '@tenace/api-client';
import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ComponentType, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { initials } from '@/lib/format';
import { fonts, radius, tone as toneOf, type Palette } from './theme';
import { useTheme } from './theme-provider';

type IconType = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
type Weight = keyof typeof fonts;
type Tone = 'default' | 'muted' | 'subtle' | 'brand' | 'success' | 'danger' | 'warning' | 'spark' | 'onBrand';

const toneColor = (c: Palette, t: Tone): string =>
  ({ default: c.text, muted: c.textMuted, subtle: c.textSubtle, brand: c.brand, success: c.success, danger: c.danger, warning: c.warning, spark: c.spark, onBrand: '#ffffff' })[t];

// ------------------------------------------------------------------ text
export function T({
  children,
  size = 15,
  weight = 'regular',
  tone = 'default',
  style,
  numberOfLines,
  center,
  ...rest
}: {
  children?: ReactNode;
  size?: number;
  weight?: Weight;
  tone?: Tone;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  center?: boolean;
  accessibilityRole?: 'header' | 'text';
}) {
  const { c } = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ fontFamily: fonts[weight], fontSize: size, lineHeight: Math.round(size * 1.35), color: toneColor(c, tone), fontVariant: ['tabular-nums'] }, center && { textAlign: 'center' }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}

export function Overline({ children, tone = 'muted' }: { children: ReactNode; tone?: Tone }) {
  return (
    <T size={11} weight="bold" tone={tone} style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
      {children}
    </T>
  );
}

// ------------------------------------------------------------------ layout
/** Scrollable page with pull-to-refresh and room for the tab bar. */
export function Screen({ children, onRefresh, refreshing = false, padded = true, bottomInset = true, contentStyle }: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean; padded?: boolean; bottomInset?: boolean; contentStyle?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[{ padding: padded ? 16 : 0, paddingBottom: (bottomInset ? insets.bottom : 0) + 32, gap: 16 }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brandSolid} colors={[c.brandSolid]} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Row({ children, gap = 8, style, wrap }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, wrap && { flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Card({ title, description, children, padded = true, style, right }: { title?: string; description?: string; children?: ReactNode; padded?: boolean; style?: StyleProp<ViewStyle>; right?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[{ backgroundColor: c.surface, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.lg, overflow: 'hidden' }, style]}>
      {(title || description) && (
        <Row style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: padded ? 0 : 12, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 2 }}>
            {title && (
              <T size={16} weight="bold" accessibilityRole="header">
                {title}
              </T>
            )}
            {description && (
              <T size={13} tone="muted">
                {description}
              </T>
            )}
          </View>
          {right}
        </Row>
      )}
      {children !== undefined && <View style={padded ? { padding: 16, gap: 12 } : undefined}>{children}</View>}
    </View>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.border }} />;
}

/** Gradient block in a group tone (`.tone-bg` in the portal). */
export function ToneBox({ color, children, style, radiusSize = radius.lg }: { color?: string | null; children?: ReactNode; style?: StyleProp<ViewStyle>; radiusSize?: number }) {
  const [a, b] = toneOf(color);
  const id = `tone${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={[{ borderRadius: radiusSize, overflow: 'hidden' }, style]}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={a} />
            <Stop offset="1" stopColor={b} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {children}
    </View>
  );
}

// ------------------------------------------------------------------ buttons
type Variant = 'primary' | 'outline' | 'ghost' | 'soft' | 'danger' | 'white';
const SIZES = { sm: { h: 38, px: 12, fs: 14 }, md: { h: 46, px: 16, fs: 15 }, lg: { h: 54, px: 20, fs: 16 } } as const;

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading,
  disabled,
  full,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: keyof typeof SIZES;
  icon?: IconType;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const s = SIZES[size];
  const palette: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: c.action, fg: c.onAction },
    outline: { bg: c.surface, fg: c.text, border: c.borderStrong },
    ghost: { bg: 'transparent', fg: c.text },
    soft: { bg: c.brandSoft, fg: c.brand },
    danger: { bg: c.dangerSolid, fg: '#ffffff' },
    white: { bg: '#ffffff', fg: '#17142B' },
  };
  const p = palette[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        { minHeight: s.h, paddingHorizontal: s.px, borderRadius: radius.md, backgroundColor: p.bg, borderWidth: p.border ? 1 : 0, borderColor: p.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: off ? 0.55 : pressed ? 0.85 : 1 },
        full && { alignSelf: 'stretch' },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={p.fg} /> : Icon ? <Icon size={s.fs + 2} color={p.fg} /> : null}
      <Text style={{ color: p.fg, fontFamily: fonts.bold, fontSize: s.fs }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({ icon: Icon, label, onPress, variant = 'ghost', color, size = 44, disabled }: { icon: IconType; label: string; onPress?: () => void; variant?: 'ghost' | 'soft' | 'outline'; color?: string; size?: number; disabled?: boolean }) {
  const { c } = useTheme();
  const bg = variant === 'soft' ? c.brandSoft : variant === 'outline' ? c.surface : 'transparent';
  const fg = color ?? (variant === 'soft' ? c.brand : c.textMuted);
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, borderWidth: variant === 'outline' ? 1 : 0, borderColor: c.borderStrong, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}
    >
      <Icon size={20} color={fg} />
    </Pressable>
  );
}

export function LinkText({ children, onPress, tone = 'brand', size = 14 }: { children: ReactNode; onPress: () => void; tone?: Tone; size?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8}>
      <T size={size} weight="semibold" tone={tone}>
        {children}
      </T>
    </Pressable>
  );
}

// ------------------------------------------------------------------ form
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <T size={14} weight="semibold">
        {label}
      </T>
      {children}
      {error ? (
        <T size={12} tone="danger">
          {error}
        </T>
      ) : hint ? (
        <T size={12} tone="muted">
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function Input({ style, invalid, multiline, ref, ...rest }: TextInputProps & { invalid?: boolean; ref?: Ref<React.ComponentRef<typeof TextInput>> }) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={c.textSubtle}
      selectionColor={c.brandSolid}
      multiline={multiline}
      onFocus={(e) => {
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        rest.onBlur?.(e);
      }}
      style={[
        {
          minHeight: multiline ? 80 : 48,
          borderWidth: focused ? 2 : 1,
          borderColor: invalid ? c.dangerSolid : focused ? c.focus : c.borderInput,
          borderRadius: radius.md,
          paddingHorizontal: focused ? 13 : 14,
          paddingVertical: multiline ? 12 : 0,
          backgroundColor: c.surface,
          color: c.text,
          fontFamily: fonts.medium,
          fontSize: 16,
          textAlignVertical: multiline ? 'top' : 'center',
        },
        style,
      ]}
      {...rest}
    />
  );
}

/** Money in reais ("5", "5,50", "1.234,56") → integer cents, like the portal's MoneyInput. */
export function MoneyInput({ value, onChange, placeholder = '0,00', accessibilityLabel }: { value: number | null; onChange: (cents: number | null) => void; placeholder?: string; accessibilityLabel?: string }) {
  const { c } = useTheme();
  const [text, setText] = useState(value != null ? (value / 100).toFixed(2).replace('.', ',') : '');
  useEffect(() => {
    if (value == null) return;
    if (parseMoneyToCents(text) !== value) setText((value / 100).toFixed(2).replace('.', ','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <View style={{ justifyContent: 'center' }}>
      <T size={15} tone="muted" style={{ position: 'absolute', left: 14, zIndex: 1 }}>
        R$
      </T>
      <Input
        keyboardType="decimal-pad"
        placeholder={placeholder}
        accessibilityLabel={accessibilityLabel}
        value={text}
        style={{ paddingLeft: 44, color: c.text }}
        onChangeText={(t) => {
          setText(t);
          onChange(parseMoneyToCents(t));
        }}
      />
    </View>
  );
}

/** Whole number with − / + (slots, quantity). Empty while typing (0); never snaps back mid-edit. */
export function Stepper({ value, onChange, min = 1, max = 10000, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  const { c } = useTheme();
  return (
    <Row>
      <StepButton label={`Menos — ${label}`} sign="−" onPress={() => onChange(Math.max(min, (value || min) - 1))} />
      <Input
        accessibilityLabel={label}
        keyboardType="number-pad"
        value={value === 0 ? '' : String(value)}
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, '');
          onChange(digits === '' ? 0 : Math.min(max, Number(digits)));
        }}
        style={{ width: 88, textAlign: 'center', fontFamily: fonts.bold, fontSize: 18, color: c.text }}
      />
      <StepButton label={`Mais — ${label}`} sign="+" onPress={() => onChange(Math.min(max, (value || min - 1) + 1))} />
    </Row>
  );
}

function StepButton({ label, sign, onPress }: { label: string; sign: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ fontSize: 22, color: c.text, fontFamily: fonts.bold }}>{sign}</Text>
    </Pressable>
  );
}

export function Chip({ active, onPress, children, accessibilityLabel }: { active?: boolean; onPress?: () => void; children: ReactNode; accessibilityLabel?: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: active ? c.brandSolid : c.border, backgroundColor: active ? c.brandSoft : c.surface, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.8 : 1 })}
    >
      {typeof children === 'string' ? (
        <T size={14} weight="semibold" tone={active ? 'brand' : 'default'}>
          {children}
        </T>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function Segmented<V extends string>({ options, value, onChange, label }: { options: readonly { value: V; label: string }[]; value: V; onChange: (v: V) => void; label: string }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: 'row', backgroundColor: c.surfaceSunken, borderRadius: radius.md, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flex: 1, minHeight: 40, borderRadius: radius.sm, backgroundColor: on ? c.surface : 'transparent', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
            <T size={13} weight={on ? 'bold' : 'semibold'} tone={on ? 'default' : 'muted'} numberOfLines={1}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ status
type NoticeTone = 'info' | 'success' | 'warning' | 'danger';
export function Notice({ tone = 'info', title, children }: { tone?: NoticeTone; title?: string; children?: ReactNode }) {
  const { c } = useTheme();
  const bg = { info: c.infoSoft, success: c.successSoft, warning: c.warningSoft, danger: c.dangerSoft }[tone];
  const fg: Tone = tone === 'info' ? 'default' : tone;
  return (
    <View accessibilityRole={tone === 'danger' ? 'alert' : undefined} style={{ backgroundColor: bg, borderRadius: radius.md, padding: 14, gap: 4 }}>
      {title && (
        <T size={14} weight="bold" tone={fg}>
          {title}
        </T>
      )}
      {typeof children === 'string' ? (
        <T size={14} tone={tone === 'info' ? 'default' : fg}>
          {children}
        </T>
      ) : (
        children
      )}
    </View>
  );
}

type BadgeTone = 'neutral' | 'brand' | 'spark' | 'success' | 'danger' | 'warning' | 'info';
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  const { c } = useTheme();
  const map: Record<BadgeTone, [string, string]> = {
    neutral: [c.surfaceSunken, c.textMuted],
    brand: [c.brandSoft, c.brand],
    spark: [c.sparkSoft, c.spark],
    success: [c.successSoft, c.success],
    danger: [c.dangerSoft, c.danger],
    warning: [c.warningSoft, c.warning],
    info: [c.infoSoft, c.info],
  };
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontFamily: fonts.bold, fontSize: 12 }}>{children}</Text>
    </View>
  );
}

export function CountBadge({ n }: { n: number }) {
  const { c } = useTheme();
  if (!n) return null;
  return (
    <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.sparkSolid, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 11 }}>{n > 99 ? '99+' : n}</Text>
    </View>
  );
}

export function Avatar({ name, color, size = 40 }: { name: string; color?: string | null; size?: number }) {
  return (
    <ToneBox color={color} radiusSize={size / 2} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: size * 0.38 }}>{initials(name || '?')}</Text>
    </ToneBox>
  );
}

export function Money({ cents, signed, size = 15, weight = 'bold', tone }: { cents: number; signed?: boolean; size?: number; weight?: Weight; tone?: Tone }) {
  const t: Tone = tone ?? (!signed || cents === 0 ? 'default' : cents > 0 ? 'success' : 'danger');
  return (
    <T size={size} weight={weight} tone={t}>
      {signed && cents > 0 ? '+' : ''}
      {formatCents(cents)}
    </T>
  );
}

export function SlotBar({ slots, achieved }: { slots: number; achieved: number }) {
  const { c } = useTheme();
  const done = achieved >= slots && slots > 0;
  if (slots > 14) {
    const pct = Math.round((achieved / Math.max(1, slots)) * 100);
    return (
      <View accessibilityRole="progressbar" accessibilityLabel="Cotas pagas" accessibilityValue={{ min: 0, max: slots, now: achieved }} style={{ height: 10, borderRadius: 5, backgroundColor: c.surfaceSunken, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', borderRadius: 5, backgroundColor: done ? c.successSolid : c.brandSolid }} />
      </View>
    );
  }
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Cotas pagas" accessibilityValue={{ min: 0, max: slots, now: achieved }} style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: slots }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: i < achieved ? (done ? c.successSolid : c.brandSolid) : c.surfaceSunken }} />
      ))}
    </View>
  );
}

/** Circular progress ring (0..1). */
export function Ring({ value, size = 56, stroke = 6, done, children }: { value: number; size?: number; stroke?: number; done?: boolean; children?: ReactNode }) {
  const { c } = useTheme();
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.surfaceSunken} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={done ? c.successSolid : c.brandSolid} strokeWidth={stroke} fill="none" strokeDasharray={`${len} ${len}`} strokeDashoffset={len * (1 - v)} strokeLinecap="round" />
      </Svg>
      {typeof children === 'string' || typeof children === 'number' ? (
        <T size={size > 60 ? 15 : 12} weight="extrabold">
          {children}
        </T>
      ) : (
        children
      )}
    </View>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 140, backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 4 }}>
      <Overline>{label}</Overline>
      {typeof value === 'string' ? (
        <T size={20} weight="extrabold">
          {value}
        </T>
      ) : (
        value
      )}
      {hint && (
        <T size={12} tone="muted">
          {hint}
        </T>
      )}
    </View>
  );
}

// ------------------------------------------------------------------ states
export function Loading({ label = 'Carregando…' }: { label?: string }) {
  const { c } = useTheme();
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0.5, duration: 650, useNativeDriver: true })]));
    a.start();
    return () => a.stop();
  }, [pulse]);
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" style={{ gap: 12, padding: 16 }}>
      {[120, 84, 84].map((h, i) => (
        <Animated.View key={i} style={{ height: h, borderRadius: radius.lg, backgroundColor: c.surfaceSunken, opacity: pulse }} />
      ))}
    </View>
  );
}

export function EmptyState({ emoji = '✨', title, description, action }: { emoji?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 16 }}>
      <Text style={{ fontSize: 36 }}>{emoji}</Text>
      <T size={17} weight="bold" center>
        {title}
      </T>
      {description && (
        <T size={14} tone="muted" center>
          {description}
        </T>
      )}
      {action}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 32, paddingHorizontal: 24 }}>
      <Text style={{ fontSize: 36 }}>😕</Text>
      <T size={16} weight="bold" center>
        {errorMessage(error)}
      </T>
      {onRetry && <Button label="Tentar de novo" variant="outline" onPress={onRetry} />}
    </View>
  );
}

// ------------------------------------------------------------------ toast
type ToastTone = 'success' | 'danger';
const ToastCtx = createContext<(msg: string, tone?: ToastTone) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<{ text: string; tone: ToastTone; id: number } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (text: string, t: ToastTone = 'success') => {
      if (timer.current) clearTimeout(timer.current);
      setMsg({ text, tone: t, id: Date.now() });
      void Haptics.notificationAsync(t === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true }).start();
      timer.current = setTimeout(() => Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMsg(null)), 2800);
    },
    [anim],
  );

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            top: insets.top + 8,
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
            backgroundColor: msg.tone === 'danger' ? c.dangerSolid : c.text,
            borderRadius: radius.md,
            paddingVertical: 12,
            paddingHorizontal: 16,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 6,
          }}
        >
          <Text style={{ color: msg.tone === 'danger' ? '#fff' : c.bg, fontFamily: fonts.semibold, fontSize: 14 }}>{msg.text}</Text>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

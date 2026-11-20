// Tenace design tokens for the app — the SAME role tokens as the portal (apps/web/app/globals.css).
// test/parity.test.mjs reads that file and fails if a value here drifts.
// Pure module (no React Native import) so the parity test can load it in Node.

export const light = {
  bg: '#f6f4fb',
  surface: '#ffffff',
  surfaceMuted: '#fbfaff',
  surfaceSunken: '#efecf7',
  surfaceHover: '#f3f0fa',
  overlay: 'rgba(23, 20, 43, 0.5)',
  border: '#e6e2f0',
  borderStrong: '#d3cde3',
  borderInput: '#8a84a0',
  text: '#17142b',
  textMuted: '#5e5975',
  textSubtle: '#6c6784',
  action: '#6d3bff',
  actionHover: '#5a2be6',
  onAction: '#ffffff',
  brand: '#5b2ee5',
  brandStrong: '#4a1fd1',
  brandSolid: '#6d3bff',
  brandSoft: '#efe9ff',
  spark: '#b84d00',
  sparkSolid: '#ff7a1a',
  sparkSoft: '#fff0e3',
  success: '#12804f',
  successSolid: '#14935a',
  successSoft: '#e4f6ec',
  warning: '#8f5207',
  warningSoft: '#fff4dc',
  danger: '#c42f44',
  dangerSolid: '#d2364a',
  dangerSoft: '#fdebee',
  info: '#2f5fd0',
  infoSoft: '#e9f0ff',
  focus: '#6d3bff',
};

export type Palette = typeof light;

export const dark: Palette = {
  bg: '#0e0c15',
  surface: '#16131f',
  surfaceMuted: '#1a1724',
  surfaceSunken: '#201c2c',
  surfaceHover: '#241f31',
  overlay: 'rgba(0, 0, 0, 0.62)',
  border: '#2a2538',
  borderStrong: '#3a3450',
  borderInput: '#8f89a8',
  text: '#f3f1fa',
  textMuted: '#b4aecb',
  textSubtle: '#a19bba',
  action: '#7b52ff',
  actionHover: '#8b66ff',
  onAction: '#ffffff',
  brand: '#b8a2ff',
  brandStrong: '#cbbaff',
  brandSolid: '#7b52ff',
  brandSoft: '#231b3f',
  spark: '#ffa866',
  sparkSolid: '#ff8a33',
  sparkSoft: '#2e1e12',
  success: '#4fd493',
  successSolid: '#1b8a55',
  successSoft: '#10271c',
  warning: '#f0bd62',
  warningSoft: '#2b2213',
  danger: '#ff8a99',
  dangerSolid: '#d2364a',
  dangerSoft: '#2e1419',
  info: '#93b2ff',
  infoSoft: '#17203a',
  focus: '#b8a2ff',
};

/** Group tones: gradient pairs, white text on top (`.tone-*` in the portal). */
export const TONES: Record<string, readonly [string, string]> = {
  violet: ['#6d3bff', '#a47bff'],
  spark: ['#e85d04', '#ff9f43'],
  mint: ['#0b8a62', '#34c99a'],
  sky: ['#0b6fb8', '#38b6f5'],
  rose: ['#d0264a', '#ff7a93'],
  sun: ['#b7791f', '#f2c94c'],
  ink: ['#2b2640', '#5a5373'],
};
export const tone = (color: string | null | undefined): readonly [string, string] => TONES[color ?? ''] ?? TONES.violet!;

export const radius = { sm: 10, md: 12, lg: 18, xl: 24 } as const;
export const space = (n: number) => n * 4;

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

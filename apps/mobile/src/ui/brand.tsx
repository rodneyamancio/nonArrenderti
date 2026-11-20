import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { T } from './kit';

/** The Tenace mark (docs/brand/tenace-mark.svg). */
export function TenaceMark({ size = 40 }: { size?: number }) {
  const id = `tg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Tenace">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#8A5CFF" />
          <Stop offset="1" stopColor="#5524E0" />
        </LinearGradient>
      </Defs>
      <Rect width="64" height="64" rx="18" fill={`url(#${id})`} />
      <Path d="M19 28.5 L45 22" stroke="#fff" strokeWidth={8} strokeLinecap="round" fill="none" />
      <Path d="M32.5 25.4 V49" stroke="#fff" strokeWidth={8} strokeLinecap="round" fill="none" />
      <Circle cx="32.5" cy="12.5" r="5" fill="#FF7A1A" />
    </Svg>
  );
}

export function TenaceLogo({ size = 40, tagline }: { size?: number; tagline?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <TenaceMark size={size} />
      <View>
        <T size={size * 0.6} weight="extrabold" style={{ letterSpacing: -0.5 }}>
          tenace
        </T>
        {tagline && (
          <T size={11} weight="semibold" tone="muted" style={{ marginTop: -4 }}>
            non arrenderti
          </T>
        )}
      </View>
    </View>
  );
}

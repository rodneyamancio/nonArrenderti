import QRCode from 'qrcode';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

/** QR code drawn as one SVG path (no canvas on the phone). */
export function QrCode({ value, size = 224 }: { value: string; size?: number }) {
  const { path, count } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
    return { path: d, count: n };
  }, [value]);
  const margin = 2;
  return (
    <Svg width={size} height={size} viewBox={`${-margin} ${-margin} ${count + margin * 2} ${count + margin * 2}`} accessibilityLabel="QR Code PIX">
      <Rect x={-margin} y={-margin} width={count + margin * 2} height={count + margin * 2} fill="#ffffff" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}

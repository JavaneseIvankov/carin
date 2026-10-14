import type { ColorValue } from 'react-native';

/** Resolves NativeWind's space-separated CSS HSL channels to a native color value. */
export function cssColorToNativeColor(value: unknown): ColorValue {
  if (typeof value !== 'string') return 'transparent';

  const hsl = value.match(/^(-?[\d.]+)(?:deg)?\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!hsl) return value as ColorValue;

  const hue = ((Number(hsl[1]) % 360) + 360) % 360;
  const saturation = Number(hsl[2]) / 100;
  const lightness = Number(hsl[3]) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const channels =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const offset = lightness - chroma / 2;
  const rgb = channels.map((channel) => Math.round((channel + offset) * 255));

  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

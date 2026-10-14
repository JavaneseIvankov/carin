// @ts-expect-error Expo's app types omit Node declarations; Vitest provides these at runtime.
import { readFileSync } from 'node:fs';
// @ts-expect-error Expo's app types omit Node declarations; Vitest provides these at runtime.
import { createRequire } from 'node:module';
// @ts-expect-error Expo's app types omit Node declarations; Vitest provides these at runtime.
import { fileURLToPath } from 'node:url';
import { cssColorToNativeColor } from '@/lib/css-color';
import { describe, expect, it } from 'vitest';

const globalCss = readFileSync(fileURLToPath(new URL('../global.css', import.meta.url)), 'utf8');
const require = createRequire(import.meta.url);
const tailwindColors = require('../tailwind.config.js').theme.extend.colors;

function readTheme(selector: string): Record<string, [number, number, number]> {
  const block = globalCss.match(new RegExp(`${selector}\\s*\\{([^}]+)\\}`))?.[1];
  if (!block) throw new Error(`Missing ${selector} theme block`);

  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*;/g)].map((match) => [
      match[1],
      [Number(match[2]), Number(match[3]), Number(match[4])],
    ])
  );
}

function relativeLuminance([hue, saturation, lightness]: [number, number, number]) {
  const h = hue / 360;
  const s = saturation / 100;
  const l = lightness / 100;
  const channel = (offset: number) => {
    const k = (offset + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return color <= 0.04045 ? color / 12.92 : ((color + 0.055) / 1.055) ** 2.4;
  };

  const [red, green, blue] = [channel(0), channel(8), channel(4)];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: [number, number, number], background: [number, number, number]) {
  const luminances = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a
  );
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

describe('Carin theme contrast contract', () => {
  it.each([
    [':root', 'light'],
    ['.dark:root', 'dark'],
  ] as const)(
    '%s provides readable text on every dashboard surface in %s mode',
    (selector, _mode) => {
      const theme = readTheme(selector);
      const textSurfaces = [
        'background',
        'card',
        'muted',
        'carin-olive-soft',
        'carin-butter',
        'carin-peach',
      ];

      for (const surface of textSurfaces) {
        expect(theme[surface], `${selector} is missing --${surface}`).toBeDefined();
        expect(
          contrastRatio(theme.foreground, theme[surface]),
          `${selector} foreground on ${surface}`
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(theme['muted-foreground'], theme[surface]),
          `${selector} muted-foreground on ${surface}`
        ).toBeGreaterThanOrEqual(4.5);
      }

      for (const [foreground, background] of [
        ['card-foreground', 'card'],
        ['popover-foreground', 'popover'],
        ['primary-foreground', 'primary'],
        ['secondary-foreground', 'secondary'],
        ['accent-foreground', 'accent'],
        ['destructive-foreground', 'destructive'],
      ]) {
        expect(theme[foreground], `${selector} is missing --${foreground}`).toBeDefined();
        expect(theme[background], `${selector} is missing --${background}`).toBeDefined();
        expect(
          contrastRatio(theme[foreground], theme[background]),
          `${selector} ${foreground} on ${background}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  );

  it.each([
    [':root', 'light'],
    ['.dark:root', 'dark'],
  ] as const)(
    '%s keeps focus boundaries visible on the page and paper surfaces in %s mode',
    (selector, _mode) => {
      const theme = readTheme(selector);

      for (const surface of ['background', 'card']) {
        expect(
          contrastRatio(theme.ring, theme[surface]),
          `${selector} ring on ${surface}`
        ).toBeGreaterThanOrEqual(3);
        expect(
          contrastRatio(theme.input, theme[surface]),
          `${selector} input boundary on ${surface}`
        ).toBeGreaterThanOrEqual(3);
      }
    }
  );

  it.each([
    [':root', 'light'],
    ['.dark:root', 'dark'],
  ] as const)('%s keeps the olive action text readable in %s mode', (selector, _mode) => {
    const theme = readTheme(selector);

    for (const surface of ['background', 'card', 'carin-olive-soft']) {
      expect(
        contrastRatio(theme.primary, theme[surface]),
        `${selector} primary on ${surface}`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('maps every dashboard tint utility to its semantic CSS variable', () => {
    for (const token of ['carin-olive-soft', 'carin-butter', 'carin-peach']) {
      expect(tailwindColors[token]).toBe(`hsl(var(--${token}))`);
    }
  });

  it('converts the CSS olive action token to an equivalent native color value', () => {
    const olive = readTheme(':root').primary;
    const nativeColor = cssColorToNativeColor(`${olive[0]} ${olive[1]}% ${olive[2]}%`);

    expect(nativeColor).toBe('rgb(80, 107, 53)');
  });
});

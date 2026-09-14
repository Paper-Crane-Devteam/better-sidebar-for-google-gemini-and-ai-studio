/**
 * Small color helpers for the custom color picker.
 *
 * Only what the picker needs: hex <-> HSV round-trips plus a lenient hex
 * parser so users can paste `#abc`, `abc` or `#AABBCC` from anywhere.
 */

export interface HSV {
  /** 0-360 */
  h: number;
  /** 0-1 */
  s: number;
  /** 0-1 */
  v: number;
}

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

export const clamp01 = (n: number) => clamp(n, 0, 1);

/**
 * Normalize loose user input into a `#rrggbb` string.
 * Returns null when the input is not a usable hex color.
 */
export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const [r, g, b] = raw;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw}`.toUpperCase();
  }
  return null;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const int = parseInt(normalized.slice(1), 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toPart = (n: number) =>
    clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${toPart(r)}${toPart(g)}${toPart(b)}`.toUpperCase();
}

export function hsvToHex({ h, s, v }: HSV): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp01(s);
  const val = clamp01(v);

  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;

  const sector = Math.floor(hue / 60) % 6;
  const table: [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = table[sector];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/**
 * Convert a hex color to HSV. Returns null for unparseable input.
 * Hue is preserved as 0 for achromatic colors (callers keep their own hue).
 */
export function hexToHsv(hex: string): HSV | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }

  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

import { converter, modeOklab, modeRgb, useMode, type Oklab } from "culori/fn";

import {
  applyLightnessBand,
  formatLavaColor,
  type LavaTheme,
} from "../../src/app/lib/lava.ts";

useMode(modeRgb);
useMode(modeOklab);
const toOklab = converter("oklab");

export type CoverColor = Oklab;

/** A cover color from sRGB bytes, the form extractPalette returns. */
export function coverColor(r: number, g: number, b: number): CoverColor {
  return toOklab({ mode: "rgb", r: r / 255, g: g / 255, b: b / 255 });
}

/** The CSS strings the lava stores for a cover palette. */
export function paletteStrings(colors: readonly CoverColor[]): string[] {
  return colors.map(formatLavaColor);
}

/** The CSS strings the lava stores for a banded cover palette. */
export function bandedPalette(colors: readonly CoverColor[], theme: LavaTheme): string[] {
  return paletteStrings(applyLightnessBand(colors, theme));
}

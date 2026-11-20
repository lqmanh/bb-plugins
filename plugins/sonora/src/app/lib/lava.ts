import { experimental_useCodeTheme } from "@get-bb/plugin-sdk/app";
import {
  clampChroma,
  converter,
  differenceEuclidean,
  formatRgb,
  modeOklab,
  modeOklch,
  modeRgb,
  useMode,
  type Oklab,
} from "culori/fn";
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

import { TRACK_FADE_MS } from "./constants.ts";
import { usePageVisible, usePrefersReducedMotion } from "./motion.ts";

/** The lava lamp draws at most this often; it is a background texture. */
const FRAME_INTERVAL_MS = 1_000 / 30;
const SPEED_SETTLE_MS = 250;
const COVER_SAMPLE_SIZE = 32;
/** At mid-depth, in px. */
const LAVA_BLOB = { radius: 24, travelX: 96, travelY: 48 };
/** How far a home spot strays from its slot center, as a share of the slot. */
const LAVA_HOME_JITTER = 0.05;
/**
 * Seeded per blob, anywhere in each range: how fast it moves along its path,
 * and how fast it drifts nearer and farther, relative to that speed.
 */
const LAVA_SPEED = [0.15, 0.3] as const;
const LAVA_DEPTH_RATE = [0.8, 1.2] as const;
/**
 * A slower wave mixed into each blob's loop so it keeps changing shape.
 * `weight` is its share of the travel; `rateX`/`rateY` its speed relative to
 * the main wave. Keep the rates different, and not simple fractions: p/q
 * repeats the path every q laps.
 */
const LAVA_SLOW_WAVE = { weight: 0.3, rateX: 0.37, rateY: 0.53 } as const;
/**
 * The main wave runs this much faster down than across, so each loop keeps
 * morphing (round, tilted, flat, the other tilt) instead of tracing one ellipse.
 */
const LAVA_MAIN_RATE_Y = 1.13;
/**
 * Each blob's speed sways by up to `amount` either side, at `rate` relative to
 * its main wave, so it sometimes lingers and sometimes hurries.
 */
const LAVA_SPEED_SWAY = { amount: 0.45, rate: 0.79 } as const;
/**
 * Far to near. One `scale` drives both size and travel, as in a real
 * perspective view; opacity and blur are atmosphere, so they tune separately.
 */
const LAVA_DEPTH = {
  scale: [0.5, 1.5],
  opacity: [0.35, 0.65],
  blur: [4, 0],
} as const;

function lerp([from, to]: readonly [number, number], t: number): number {
  return from + (to - from) * t;
}
/**
 * Moving blobs stretch along their motion by up to this much at full drift
 * speed (and narrow across it by 60% of that); a paused blob is a circle.
 */
const LAVA_STRETCH = 0.5;
/** How fast the drift phase advances while playing, per second. */
const LAVA_DRIFT_RATE = 0.8;
const MIN_PALETTE_COLORS = 2;
const MAX_PALETTE_COLORS = 5;
const THEME_LAVA_TOKENS = [
  "--timeline-accent",
  "--success",
  "--warning",
  "--pr-merged",
  "--attention",
  "--foreground",
] as const;
/**
 * OKLab lightness bands that keep a cover color readable on each surface.
 * Exported so the two ranges can be tuned without touching the banding code.
 */
export const LAVA_DARK_LIGHTNESS = [0.62, 0.82] as const;
export const LAVA_LIGHT_LIGHTNESS = [0.42, 0.66] as const;

export type LavaTheme = "dark" | "light";
export type LavaColor = string | Oklab;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

useMode(modeRgb);
useMode(modeOklab);
useMode(modeOklch);

const toOklab = converter("oklab");
const colorDistance = differenceEuclidean("oklab");
/** OKLab distance below which two cover colors are too close to keep both. */
const PALETTE_DISTANCE = 0.1;

export function formatLavaColor(color: LavaColor): string {
  return typeof color === "string" ? color : formatRgb(color);
}

/**
 * Keep each cover color's OKLab hue and chroma, clamping only its lightness
 * into the band that reads on the current surface. Colors pushed outside sRGB
 * are gamut-mapped through OKLCH instead of clipped per channel.
 */
export function applyLightnessBand(colors: readonly Oklab[], theme: LavaTheme): Oklab[] {
  const [min, max] = theme === "dark" ? LAVA_DARK_LIGHTNESS : LAVA_LIGHT_LIGHTNESS;
  return colors.map((color) => {
    const l = Math.min(max, Math.max(min, color.l));
    if (l === color.l) return color;
    return clampChroma({ ...color, l }, "oklch", "rgb");
  });
}

function averageColor(bucket: Rgb & { count: number }): Rgb {
  return {
    r: Math.round(bucket.r / bucket.count),
    g: Math.round(bucket.g / bucket.count),
    b: Math.round(bucket.b / bucket.count),
  };
}

function averageOklab(bucket: Rgb & { count: number }): Oklab {
  const { r, g, b } = averageColor(bucket);
  return toOklab({ mode: "rgb", r: r / 255, g: g / 255, b: b / 255 });
}

/** A darker or lighter companion so a one-color cover still gets two blobs. */
function companionColor(color: Oklab): Oklab {
  const shift = color.l > 0.5 ? -0.2 : 0.2;
  return clampChroma(
    { ...color, l: Math.min(1, Math.max(0, color.l + shift)) },
    "oklch",
    "rgb",
  );
}

/**
 * Pick 2–5 distinct, reasonably saturated colors from sampled cover pixels.
 * Near-black and near-white pixels are ignored so a dark cover edge does not
 * become a blob. A usable but low-variety cover is filled out to two colors.
 */
export function extractPalette(data: Uint8ClampedArray): Oklab[] {
  const buckets = new Map<number, Rgb & { count: number; weight: number }>();

  for (let index = 0; index + 3 < data.length; index += 4) {
    const alpha = data[index + 3] ?? 0;
    if (alpha < 128) continue;

    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    const maxChannel = Math.max(r, g, b);
    const minChannel = Math.min(r, g, b);
    const lightness = (maxChannel + minChannel) / 2;
    if (lightness < 16 || lightness > 239) continue;

    const saturation =
      maxChannel === minChannel
        ? 0
        : (maxChannel - minChannel) / (255 - Math.abs(maxChannel + minChannel - 255));
    const key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5);
    const bucket = buckets.get(key) ?? {
      r: 0,
      g: 0,
      b: 0,
      count: 0,
      weight: 0,
    };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    bucket.weight += 1 + saturation * 3;
    buckets.set(key, bucket);
  }

  const sorted = [...buckets.values()].sort((a, b) => b.weight - a.weight);
  const picked: Oklab[] = [];
  for (const bucket of sorted) {
    if (picked.length >= MAX_PALETTE_COLORS) break;
    const color = averageOklab(bucket);
    if (picked.every((existing) => colorDistance(existing, color) >= PALETTE_DISTANCE)) {
      picked.push(color);
    }
  }
  if (picked.length === 1) {
    const [only] = picked;
    if (only !== undefined) picked.push(companionColor(only));
  }

  return picked;
}

/**
 * The lava's colors when the cover has no usable palette, so it still matches
 * the theme.
 */
export function themePalette(element: HTMLElement): string[] {
  const style = getComputedStyle(element);
  const colors: string[] = [];
  for (const token of THEME_LAVA_TOKENS) {
    const value = style.getPropertyValue(token).trim();
    if (value.length > 0 && !colors.includes(value)) colors.push(value);
    if (colors.length >= MAX_PALETTE_COLORS) break;
  }

  const foreground = style.color.trim();
  if (colors.length === 0) {
    colors.push(foreground.length > 0 ? foreground : "CanvasText");
  }

  if (colors.length < MIN_PALETTE_COLORS) {
    if (foreground.length > 0 && !colors.includes(foreground)) {
      colors.push(foreground);
    }
  }

  if (colors.length < MIN_PALETTE_COLORS) {
    const [only] = colors;
    if (only !== undefined) {
      colors.push(`color-mix(in oklab, ${only} 68%, black)`);
    }
  }

  return colors;
}

function loadCover(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The cover failed to load"));
    image.src = url;
  });
}

/**
 * Draw the cover small and read its pixels back. Spotify's image server sends
 * CORS headers, so an anonymous read is enough; a local file cover without
 * them rejects and the caller uses the theme palette.
 */
export async function sampleCoverPalette(url: string): Promise<Oklab[]> {
  const image = await loadCover(url);

  const canvas = document.createElement("canvas");
  canvas.width = COVER_SAMPLE_SIZE;
  canvas.height = COVER_SAMPLE_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) throw new Error("Canvas is unavailable");

  context.drawImage(image, 0, 0, COVER_SAMPLE_SIZE, COVER_SAMPLE_SIZE);
  const { data } = context.getImageData(0, 0, COVER_SAMPLE_SIZE, COVER_SAMPLE_SIZE);
  const palette = extractPalette(data);
  if (palette.length === 0) throw new Error("The cover has no usable colors");
  return palette;
}

/** The current track's sample; `colors` is `null` for the theme fallback, unset while pending. */
interface SampledPalette {
  key: string;
  colors?: Oklab[] | null;
}

/**
 * Shared so a cover is decoded once however many surfaces show it. Only the
 * current track is kept, so the cache never grows over a long session.
 */
let currentPalette: SampledPalette | null = null;
const paletteListeners = new Set<() => void>();

function paletteKey(seed: string, cover: string | null): string {
  return `${seed}\u0000${cover ?? ""}`;
}

function subscribePalettes(listener: () => void): () => void {
  paletteListeners.add(listener);
  return () => paletteListeners.delete(listener);
}

/** Test seam: cover sampling, theme fallback, and the shared palette cache. */
export const lavaSources = {
  sample: sampleCoverPalette,
  theme: themePalette,
  clearPalettes() {
    currentPalette = null;
  },
};

function requestPaletteSample(seed: string, cover: string | null): void {
  const key = paletteKey(seed, cover);
  if (currentPalette?.key === key) return;

  const entry: SampledPalette = { key };
  currentPalette = entry;
  const settle = (colors: Oklab[] | null) => {
    if (entry !== currentPalette) return;
    entry.colors = colors;
    for (const listener of paletteListeners) listener();
  };

  if (cover === null) {
    settle(null);
    return;
  }
  lavaSources.sample(cover).then(
    (colors) => settle(colors.length === 0 ? null : colors),
    () => settle(null),
  );
}

export interface LavaPalette {
  seed: string;
  colors: readonly LavaColor[];
}

const EMPTY_LAVA_PALETTE: LavaPalette = { seed: "", colors: [] };

/**
 * The palette for one track, from its cover. Cover colors keep their hue and
 * chroma but have their OKLab lightness banded for the current surface, so the
 * same cover reads on light and dark. When the cover has no usable colors
 * (missing, failed, unreadable), the lava uses the host theme colors instead.
 * Both follow bb's theme live; a cover is never re-sampled for a theme change.
 * `active` is false off screen, so a hidden surface does no work.
 */
function useLavaPalette(
  cover: string | null,
  /** Stable per track (its id, or title); seeds each blob's traits. */
  seed: string,
  elementRef: RefObject<HTMLElement | null>,
  active: boolean,
): LavaPalette {
  const [palette, setPalette] = useState<LavaPalette>(EMPTY_LAVA_PALETTE);
  const key = paletteKey(seed, cover);
  const sampled = useSyncExternalStore(
    subscribePalettes,
    () => (currentPalette?.key === key ? currentPalette.colors : undefined),
    () => undefined,
  );
  const theme = experimental_useCodeTheme();

  useEffect(() => {
    if (!active) return;
    requestPaletteSample(seed, cover);
  }, [active, cover, seed]);

  useEffect(() => {
    // Until the new cover's colors are in, the old track's lava stays as it
    // is, so a track change is one cross-fade, not one for the new seed and
    // another for the new colors.
    if (!active || sampled === undefined) return;
    const element = elementRef.current;
    if (element === null) return;

    const show = (colors: readonly LavaColor[]) => {
      setPalette((current) =>
        current.seed === seed && sameColors(current.colors, colors)
          ? current
          : { seed, colors },
      );
    };

    if (sampled !== null) {
      show(applyLightnessBand(sampled, theme.mode));
      return;
    }

    // bb applies new palette tokens in a passive effect, so read after the CSS lands.
    const frame = requestAnimationFrame(() => {
      show(lavaSources.theme(element));
    });
    return () => cancelAnimationFrame(frame);
  }, [active, sampled, seed, theme.mode, theme.name, elementRef]);

  return palette;
}

/**
 * Whether a canvas is actually shown. The host may hide a surface without
 * unmounting it, so this watches the canvas itself rather than trusting mounts.
 */
function useLavaCanvasVisible(
  elementRef: RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!enabled || element === null) {
      setVisible(false);
      return;
    }

    let intersecting = false;
    let sized = element.clientWidth > 0 && element.clientHeight > 0;
    const update = () => setVisible(intersecting && sized);
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry?.isIntersecting === true;
      update();
    });
    const resizer = new ResizeObserver(() => {
      sized = element.clientWidth > 0 && element.clientHeight > 0;
      update();
    });
    observer.observe(element);
    resizer.observe(element);

    return () => {
      observer.disconnect();
      resizer.disconnect();
    };
  }, [elementRef, enabled]);

  return visible;
}

/** `enabled` is the surface's own switch: the setting, plus the banner's open state. */
export function useLavaSurface(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  {
    cover,
    seed,
    playing,
    enabled,
  }: {
    cover: string | null;
    seed: string;
    playing: boolean;
    enabled: boolean;
  },
): void {
  const active = useLavaCanvasVisible(canvasRef, enabled) && enabled;
  const palette = useLavaPalette(cover, seed, canvasRef, active);

  useLavaLamp(canvasRef, palette, playing, active);
}

/** One blob's fixed traits, derived from the track so the layout is stable. */
export interface LavaBlob {
  color: LavaColor;
  slot: number;
  count: number;
  /** Seeded offsets within the home slot, 0–1. */
  jitterX: number;
  jitterY: number;
  speed: number;
  phaseX: number;
  phaseY: number;
  /** Phase of the slower second wave that keeps paths from tracing loops. */
  phaseSlow: number;
  phaseZ: number;
  /** How fast the blob drifts nearer and farther, relative to its speed. */
  depthRate: number;
  phaseSpeed: number;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Small deterministic PRNG (mulberry32). */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function slotOffset(value: number, slotSize: number): number {
  return (value - 0.5) * 2 * LAVA_HOME_JITTER * slotSize;
}

export interface LavaHomeGrid {
  columns: number;
  rows: number;
}

/** Shaped by the aspect, so a wide banner gets one row and a taller surface fills its height. */
export function lavaHomeGrid(count: number, width: number, height: number): LavaHomeGrid {
  if (count <= 0) return { columns: 0, rows: 0 };
  const aspect = height > 0 ? width / height : 1;
  const columns = Math.min(count, Math.max(1, Math.round(Math.sqrt(count * aspect))));
  return { columns, rows: Math.ceil(count / columns) };
}

export function lavaHomePosition(
  blob: LavaBlob,
  width: number,
  height: number,
): { x: number; y: number } {
  const { columns, rows } = lavaHomeGrid(blob.count, width, height);
  const column = blob.slot % columns;
  const row = Math.floor(blob.slot / columns);
  const slotWidth = width / columns;
  const slotHeight = height / rows;
  return {
    x: (column + 0.5) * slotWidth + slotOffset(blob.jitterX, slotWidth),
    y: (row + 0.5) * slotHeight + slotOffset(blob.jitterY, slotHeight),
  };
}

/**
 * The order in which blobs claim the home slots. It uses its own stream so the
 * dominant cover color can move off the first slot without changing any other
 * per-blob trait.
 */
export function lavaHomeOrder(seed: string, count: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  const random = seededRandom(hashSeed(`${seed}:order`));
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const current = order[index]!;
    order[index] = order[swap]!;
    order[swap] = current;
  }
  return order;
}

/**
 * All traits come from `seed` (the track), so the same track always gets the
 * same arrangement and remounting never reshuffles it.
 */
export function lavaBlobs(seed: string, palette: readonly LavaColor[]): LavaBlob[] {
  const random = seededRandom(hashSeed(seed));
  const order = lavaHomeOrder(seed, palette.length);
  return palette.map((color, index) => {
    const slot = order[index] ?? index;
    return {
      color,
      slot,
      count: palette.length,
      jitterX: random(),
      speed: lerp(LAVA_SPEED, random()),
      phaseX: random() * Math.PI * 2,
      phaseY: random() * Math.PI * 2,
      phaseSlow: random() * Math.PI * 2,
      phaseZ: random() * Math.PI * 2,
      depthRate: lerp(LAVA_DEPTH_RATE, random()),
      jitterY: random(),
      phaseSpeed: random() * Math.PI * 2,
    };
  });
}

interface LavaState {
  seed: string;
  palette: LavaColor[];
  current: LavaBlob[];
  previous: LavaBlob[];
  fade: number;
  phase: number;
  speed: number;
}

function sameColor(a: LavaColor, b: LavaColor): boolean {
  if (typeof a === "string" || typeof b === "string") return a === b;
  return a.l === b.l && a.a === b.a && a.b === b.b && a.alpha === b.alpha;
}

function sameColors(a: readonly LavaColor[], b: readonly LavaColor[]): boolean {
  return a.length === b.length && a.every((color, index) => sameColor(color, b[index]!));
}

function wave(main: number, slowRate: number, along: number, phaseSlow: number): number {
  const { weight } = LAVA_SLOW_WAVE;
  return (1 - weight) * main + weight * Math.sin(along * slowRate + phaseSlow);
}

function blobPosition(
  blob: LavaBlob,
  width: number,
  height: number,
  phase: number,
): { x: number; y: number; depth: number } {
  // The swaying speed is integrated over the phase, so the motion stays smooth.
  const { amount, rate } = LAVA_SPEED_SWAY;
  const steady = phase * blob.speed;
  const along =
    steady -
    (amount / rate) *
      (Math.cos(steady * rate + blob.phaseSpeed) - Math.cos(blob.phaseSpeed));
  const depth = 0.5 + 0.5 * Math.sin(along * blob.depthRate + blob.phaseZ);
  const perspective = lerp(LAVA_DEPTH.scale, depth);
  const home = lavaHomePosition(blob, width, height);
  const x =
    home.x +
    LAVA_BLOB.travelX *
      perspective *
      wave(Math.sin(along + blob.phaseX), LAVA_SLOW_WAVE.rateX, along, blob.phaseSlow);
  /** -1 at the top of the blob's travel, +1 at the bottom. */
  const lift = wave(
    Math.cos(along * LAVA_MAIN_RATE_Y + blob.phaseY),
    LAVA_SLOW_WAVE.rateY,
    along,
    blob.phaseSlow,
  );
  return { x, y: home.y + LAVA_BLOB.travelY * perspective * lift, depth };
}

export interface LavaBlobFrame {
  x: number;
  y: number;
  /** 0 far … 1 near. */
  depth: number;
  radius: number;
  opacity: number;
  /** Extra blur in px, on top of the canvas's own. */
  blur: number;
  /** 0 when still; up to `LAVA_STRETCH` along `angle`. */
  stretch: number;
  angle: number;
}

/**
 * One blob at `phase`. `motion` is how fast the lava is drifting right now
 * (0 paused, 1 full speed), so a paused blob settles back into a circle.
 */
export function lavaBlobFrame(
  blob: LavaBlob,
  width: number,
  height: number,
  phase: number,
  motion = 1,
): LavaBlobFrame {
  const { x, y, depth } = blobPosition(blob, width, height, phase);
  const radius = Math.max(0, LAVA_BLOB.radius * lerp(LAVA_DEPTH.scale, depth));
  const look = {
    x,
    y,
    depth,
    radius,
    opacity: lerp(LAVA_DEPTH.opacity, depth),
    blur: lerp(LAVA_DEPTH.blur, depth),
  };

  // Relative to the blob's own radius, so stretch looks the same at any size.
  const lookback = 0.15 * Math.max(0, Math.min(1, motion));
  if (lookback === 0 || height <= 0 || look.radius <= 0) {
    return { ...look, stretch: 0, angle: 0 };
  }
  const before = blobPosition(blob, width, height, phase - lookback);
  const dx = x - before.x;
  const dy = y - before.y;
  const stretch = LAVA_STRETCH * Math.min(1, Math.hypot(dx, dy) / (look.radius * 0.6));
  return { ...look, stretch, angle: Math.atan2(dy, dx) };
}

/** Far to near, so near blobs sit on top. `alpha` fades a whole palette on a change. */
export function drawLavaBlobs(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  blobs: readonly LavaBlob[],
  phase: number,
  alpha: number,
  motion = 1,
): void {
  if (blobs.length === 0 || alpha <= 0) return;

  const frames = blobs
    .map((blob) => ({
      color: blob.color,
      frame: lavaBlobFrame(blob, width, height, phase, motion),
    }))
    .sort((a, b) => a.frame.depth - b.frame.depth);

  for (const { color, frame } of frames) {
    if (frame.radius <= 0) continue;

    context.save();
    context.globalAlpha = Math.min(1, alpha * frame.opacity);
    context.filter = frame.blur > 0.05 ? `blur(${frame.blur}px)` : "none";
    if (frame.stretch > 0) {
      context.translate(frame.x, frame.y);
      context.rotate(frame.angle);
      context.scale(1 + frame.stretch, 1 - frame.stretch * 0.6);
      context.rotate(-frame.angle);
      context.translate(-frame.x, -frame.y);
    }
    context.fillStyle = formatLavaColor(color);
    context.beginPath();
    context.arc(frame.x, frame.y, frame.radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

/**
 * Under reduced motion the blobs rest as when paused. Once at rest the loop
 * stops scheduling frames, so a still lamp costs nothing. CSS-pixel size is
 * enough because the canvas is blurred anyway.
 */
export function useLavaLamp(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { seed, colors: palette }: LavaPalette,
  playing: boolean,
  visible: boolean,
): void {
  const stateRef = useRef<LavaState>({
    seed: "",
    palette: [],
    current: [],
    previous: [],
    fade: 1,
    phase: 0,
    speed: 0,
  });
  const state = stateRef.current;
  const pageVisible = usePageVisible();
  const reducedMotion = usePrefersReducedMotion();
  const drifting = playing && !reducedMotion;
  const frameRef = useRef<number | null>(null);
  const lastDrawRef = useRef(0);

  useEffect(() => {
    if (state.seed === seed && sameColors(state.palette, palette)) return;
    state.previous = state.current;
    state.seed = seed;
    state.palette = [...palette];
    state.current = lavaBlobs(seed, palette);
    state.fade = state.current.length === 0 ? 1 : 0;

    const canvas = canvasRef.current;
    if (canvas !== null) {
      canvas.dataset.sonoraLavaSeed = seed;
      canvas.dataset.sonoraLavaPalette = JSON.stringify(palette.map(formatLavaColor));
    }
  }, [canvasRef, palette, seed, state]);

  useEffect(() => {
    if (!visible || !pageVisible || palette.length === 0) return;

    const canvas = canvasRef.current;
    if (canvas === null) return;
    let context: CanvasRenderingContext2D | null;
    try {
      context = canvas.getContext("2d");
    } catch {
      return;
    }
    if (context === null) return;

    const stop = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width <= 0 || height <= 0) return;

      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      context.clearRect(0, 0, width, height);
      // Smoothstep, close to the backdrop's CSS `ease-in-out`.
      const fade = state.fade * state.fade * (3 - 2 * state.fade);
      if (state.previous.length > 0 && state.fade < 1) {
        drawLavaBlobs(
          context,
          width,
          height,
          state.previous,
          state.phase,
          1 - fade,
          state.speed,
        );
      }
      drawLavaBlobs(
        context,
        width,
        height,
        state.current,
        state.phase,
        fade,
        state.speed,
      );
    };

    const frame = (now: number) => {
      frameRef.current = null;

      const elapsed = lastDrawRef.current === 0 ? 0 : now - lastDrawRef.current;
      if (lastDrawRef.current !== 0 && elapsed < FRAME_INTERVAL_MS) {
        frameRef.current = requestAnimationFrame(frame);
        return;
      }
      lastDrawRef.current = now;

      const delta = Math.min(elapsed / 1_000, 0.1);
      const target = drifting ? 1 : 0;
      const ease = 1 - Math.exp(-delta / (SPEED_SETTLE_MS / 1_000));
      state.speed += (target - state.speed) * ease;
      if (target === 0 && state.speed < 0.01) state.speed = 0;
      state.phase += delta * state.speed * LAVA_DRIFT_RATE;
      state.fade = Math.min(1, state.fade + delta / (TRACK_FADE_MS / 1_000));

      draw();

      if (!drifting && state.speed === 0 && state.fade >= 1) return;
      frameRef.current = requestAnimationFrame(frame);
    };

    lastDrawRef.current = 0;
    frameRef.current = requestAnimationFrame(frame);

    return stop;
  }, [canvasRef, drifting, pageVisible, palette, state, visible]);
}

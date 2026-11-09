import { useEffect, useRef, useState, type RefObject } from "react";

import { TRACK_FADE_MS } from "./constants.ts";
import { usePageVisible } from "./motion.ts";

/** The lava lamp draws at most this often; it is a background texture. */
const FRAME_INTERVAL_MS = 1_000 / 30;
const SPEED_SETTLE_MS = 250;
const COVER_SAMPLE_SIZE = 32;
/** Base blob radius as a share of the canvas height. */
const LAVA_RADIUS = 0.6;
/**
 * How far a blob wanders from its home spot, as a share of the canvas height,
 * either side. Both directions are measured against the height so the motion
 * looks the same however wide the strip is.
 */
const LAVA_TRAVEL_X = 2;
const LAVA_TRAVEL_Y = 1;
/**
 * Each blob drifts nearer and farther. Its depth runs from 0 (far) to 1
 * (near) and sets, from far to near: its size, its opacity, how much extra
 * blur it gets on top of the canvas's own, and how far it travels sideways
 * (parallax). Far blobs are drawn first, so near ones sit on top.
 */
const LAVA_DEPTH = {
  size: [0.5, 1.5],
  opacity: [0.35, 0.65],
  blur: [4, 0],
  travel: [0.6, 1.4],
} as const;

function lerp([far, near]: readonly [number, number], depth: number): number {
  return far + (near - far) * depth;
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

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function distance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function averageColor(bucket: Rgb & { count: number }): Rgb {
  return {
    r: Math.round(bucket.r / bucket.count),
    g: Math.round(bucket.g / bucket.count),
    b: Math.round(bucket.b / bucket.count),
  };
}

/** A darker or lighter companion so a one-color cover still gets two blobs. */
function companionColor(color: Rgb): Rgb {
  const lightness = (color.r + color.g + color.b) / 3;
  const target = lightness > 140 ? 0 : 255;
  const amount = 0.28;
  return {
    r: Math.round(color.r + (target - color.r) * amount),
    g: Math.round(color.g + (target - color.g) * amount),
    b: Math.round(color.b + (target - color.b) * amount),
  };
}

/**
 * Pick 2–5 distinct, reasonably saturated colors from sampled cover pixels.
 * Near-black and near-white pixels are ignored so a dark album edge does not
 * become a blob. A usable but low-variety cover is filled out to two colors.
 */
export function extractPalette(data: Uint8ClampedArray): string[] {
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
  // Strongest buckets first, skipping any too close to a color already taken.
  const picked: Rgb[] = [];
  for (const bucket of sorted) {
    if (picked.length >= MAX_PALETTE_COLORS) break;
    const color = averageColor(bucket);
    if (picked.every((existing) => distance(existing, color) >= 48)) {
      picked.push(color);
    }
  }
  if (picked.length === 1) {
    const [only] = picked;
    if (only !== undefined) picked.push(companionColor(only));
  }

  return picked.map(({ r, g, b }) => `rgb(${r} ${g} ${b})`);
}

/**
 * Theme colors for the lava when the cover has no usable palette. Returns up
 * to five host tokens, with a companion color if the theme resolves only one.
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
export async function sampleCoverPalette(url: string): Promise<string[]> {
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

/** Test seam: cover sampling and theme fallback. */
export const lavaSources = {
  sample: sampleCoverPalette,
  theme: themePalette,
};

/**
 * A counter that changes whenever bb's theme might have: light/dark or palette
 * changes on `<html>` or `<body>` (classes, attributes, inline variables), a
 * stylesheet added, removed or replaced in `<head>`, or the system color scheme.
 */
export function useThemeVersion(enabled = true): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const bump = () => setVersion((current) => current + 1);

    const isStylesheet = (node: Node) =>
      node instanceof HTMLStyleElement || node instanceof HTMLLinkElement;
    const touchesTheme = (record: MutationRecord) =>
      record.type === "attributes" ||
      isStylesheet(record.target) ||
      Array.from(record.addedNodes).some(isStylesheet) ||
      Array.from(record.removedNodes).some(isStylesheet);

    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver((records) => {
        if (records.some(touchesTheme)) bump();
      });
      observer.observe(document.documentElement, { attributes: true });
      if (document.body !== null) {
        observer.observe(document.body, { attributes: true });
      }
      if (document.head !== null) {
        // Subtree, so a <style> whose text is replaced is noticed too.
        observer.observe(document.head, { childList: true, subtree: true });
      }
    }

    const scheme =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    scheme?.addEventListener?.("change", bump);

    return () => {
      observer?.disconnect();
      scheme?.removeEventListener?.("change", bump);
    };
  }, [enabled]);

  return version;
}

/** A track's lava colors, with the seed that lays its blobs out. */
export interface LavaPalette {
  seed: string;
  colors: readonly string[];
}

const EMPTY_LAVA_PALETTE: LavaPalette = { seed: "", colors: [] };

/**
 * The palette for one track, from its cover. When the cover has no usable
 * colors (missing, failed, unreadable), the lava uses the host theme colors
 * instead, and follows bb's theme live: switching light/dark or palette
 * re-reads them. The seed changes only together with the colors.
 */
export function useLavaPalette(
  cover: string | null,
  /** Stable per track (its id, or title); seeds each blob's traits. */
  seed: string,
  elementRef: RefObject<HTMLElement | null>,
): LavaPalette {
  const [palette, setPalette] = useState<LavaPalette>(EMPTY_LAVA_PALETTE);
  /** Colors sampled from `cover`, or `null` when the theme fallback is in use. */
  const [sampled, setSampled] = useState<{
    cover: string | null;
    colors: string[] | null;
  } | null>(null);
  const ready = sampled !== null && sampled.cover === cover;
  const themeVersion = useThemeVersion(ready && sampled.colors === null);

  useEffect(() => {
    let live = true;

    if (cover === null) {
      setSampled({ cover, colors: null });
      return () => {
        live = false;
      };
    }

    lavaSources.sample(cover).then(
      (colors) => {
        if (live) setSampled({ cover, colors: colors.length === 0 ? null : colors });
      },
      () => {
        if (live) setSampled({ cover, colors: null });
      },
    );

    return () => {
      live = false;
    };
  }, [cover]);

  useEffect(() => {
    // Until the new cover's colors are in, the old track's lava stays as it
    // is, so a track change is one cross-fade, not one for the new seed and
    // another for the new colors.
    if (!ready) return;
    const element = elementRef.current;
    if (element === null) return;
    const colors = sampled.colors ?? lavaSources.theme(element);
    setPalette((current) =>
      current.seed === seed && sameColors(current.colors, colors)
        ? current
        : { seed, colors },
    );
  }, [ready, sampled, seed, themeVersion, elementRef]);

  return palette;
}

/** One blob's fixed traits, derived from the track so the layout is stable. */
export interface LavaBlob {
  color: string;
  /** Home spot across the canvas width, 0–1; blobs are spread out evenly. */
  home: number;
  speed: number;
  phaseX: number;
  phaseY: number;
  /** Phase of the slower second wave that keeps paths from tracing loops. */
  phaseSlow: number;
  phaseZ: number;
  /** How fast the blob drifts nearer and farther, relative to its speed. */
  depthRate: number;
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

/**
 * Give each palette color a blob with its own speed, path and depth rhythm.
 * Size, opacity and blur come from depth as it moves.
 * The traits come from `seed` (the track), so the same track always gets the
 * same arrangement and remounting never reshuffles it mid-song.
 */
export function lavaBlobs(seed: string, palette: readonly string[]): LavaBlob[] {
  const random = seededRandom(hashSeed(seed));
  return palette.map((color, index) => ({
    color,
    home: (index + 0.5) / palette.length + (random() - 0.5) * 0.08,
    speed: 0.14 + random() * 0.16,
    phaseX: random() * Math.PI * 2,
    phaseY: random() * Math.PI * 2,
    phaseSlow: random() * Math.PI * 2,
    phaseZ: random() * Math.PI * 2,
    depthRate: 0.6 + random() * 0.5,
  }));
}

interface LavaState {
  seed: string;
  palette: string[];
  current: LavaBlob[];
  previous: LavaBlob[];
  fade: number;
  phase: number;
  speed: number;
}

function sameColors(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((color, index) => color === b[index]);
}

function blobPosition(
  blob: LavaBlob,
  width: number,
  height: number,
  phase: number,
): { x: number; y: number; depth: number } {
  // Each blob rises, sinks and wanders around its own home spot, and drifts
  // nearer and farther. A slower second wave in each direction keeps the
  // paths organic; near blobs travel further sideways (parallax).
  const along = phase * blob.speed;
  const depth = 0.5 + 0.5 * Math.sin(along * blob.depthRate + blob.phaseZ);
  const x =
    width * blob.home +
    height *
      LAVA_TRAVEL_X *
      lerp(LAVA_DEPTH.travel, depth) *
      (0.7 * Math.sin(along + blob.phaseX) +
        0.3 * Math.sin(along * 0.37 + blob.phaseSlow));
  /** -1 at the top of the blob's travel, +1 at the bottom. */
  const lift =
    0.75 * Math.cos(along + blob.phaseY) + 0.25 * Math.sin(along * 0.53 + blob.phaseSlow);
  return { x, y: height * 0.5 + height * LAVA_TRAVEL_Y * lift, depth };
}

/** Where one blob is, how near, how big, and how it stretches as it moves. */
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
  const radius = Math.max(0, height * LAVA_RADIUS * lerp(LAVA_DEPTH.size, depth));
  const look = {
    x,
    y,
    depth,
    radius,
    opacity: lerp(LAVA_DEPTH.opacity, depth),
    blur: lerp(LAVA_DEPTH.blur, depth),
  };

  // Measure the motion over a short look back along the path. A blob that
  // covers 30% of the height in that span is fully stretched.
  const lookback = 0.15 * Math.max(0, Math.min(1, motion));
  if (lookback === 0 || height <= 0) {
    return { ...look, stretch: 0, angle: 0 };
  }
  const before = blobPosition(blob, width, height, phase - lookback);
  const dx = x - before.x;
  const dy = y - before.y;
  const stretch = LAVA_STRETCH * Math.min(1, Math.hypot(dx, dy) / (height * 0.3));
  return { ...look, stretch, angle: Math.atan2(dy, dx) };
}

/**
 * Paint the blobs far to near, so near ones sit on top. Each blob's depth sets
 * its size, opacity and extra blur; the canvas adds a shared soft blur on top.
 * Sizes follow the canvas height, so blobs look the same however wide the
 * strip is. `alpha` fades a whole palette in or out on a change.
 */
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
    context.fillStyle = color;
    context.beginPath();
    context.arc(frame.x, frame.y, frame.radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

/**
 * Drift the lava while `playing` and the strip is visible. The loop eases the
 * drift to a stop, then stops scheduling frames entirely; it also stops when
 * the page is hidden and on unmount. The canvas is drawn at CSS-pixel size,
 * capped at about 30 fps.
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
      canvas.dataset.sonoraLavaPalette = JSON.stringify(palette);
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
      const target = playing ? 1 : 0;
      const ease = 1 - Math.exp(-delta / (SPEED_SETTLE_MS / 1_000));
      state.speed += (target - state.speed) * ease;
      if (target === 0 && state.speed < 0.01) state.speed = 0;
      state.phase += delta * state.speed * LAVA_DRIFT_RATE;
      state.fade = Math.min(1, state.fade + delta / (TRACK_FADE_MS / 1_000));

      draw();

      if (!playing && state.speed === 0 && state.fade >= 1) return;
      frameRef.current = requestAnimationFrame(frame);
    };

    lastDrawRef.current = 0;
    frameRef.current = requestAnimationFrame(frame);

    return stop;
  }, [canvasRef, pageVisible, palette, playing, state, visible]);
}

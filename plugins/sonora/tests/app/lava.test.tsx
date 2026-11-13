// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyLightnessBand,
  drawLavaBlobs,
  extractPalette,
  lavaBlobFrame,
  lavaBlobs,
  lavaHomeOrder,
  sampleCoverPalette,
  themePalette,
  useLavaLamp,
  type LavaBlob,
} from "../../src/app/lib/lava.ts";
import {
  fakeContext,
  installCanvasContext,
  type FakeContext,
} from "../support/canvas.ts";
import { coverColor, paletteStrings } from "../support/lava.ts";
import { advance } from "../support/render.ts";

const PALETTE = ["rgb(1 2 3)", "rgb(4 5 6)"];

function pixelData(
  colors: ReadonlyArray<readonly [number, number, number, number?]>,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(colors.length * 4);
  colors.forEach(([r, g, b, a = 255], index) => {
    data.set([r, g, b, a], index * 4);
  });
  return data;
}

const OriginalImage = globalThis.Image;

function nonHomeTraits(blob: LavaBlob): Omit<LavaBlob, "homeX"> {
  const { homeX, ...traits } = blob;
  return traits;
}

describe("lava palette", () => {
  it("takes distinct colors from cover pixels", () => {
    const data = pixelData([
      [255, 0, 0],
      [255, 0, 0],
      [0, 0, 255],
      [0, 0, 255],
    ]);

    const palette = extractPalette(data);
    expect(paletteStrings(palette)).toEqual(["rgb(255, 0, 0)", "rgb(0, 0, 255)"]);
    expect(palette.every((color) => color.mode === "oklab")).toBe(true);
  });

  it("ignores transparent, near-black, and near-white pixels", () => {
    const data = pixelData([
      [255, 0, 0],
      [0, 255, 0, 0],
      [255, 255, 255],
      [0, 0, 0],
    ]);

    expect(paletteStrings(extractPalette(data))).toEqual([
      "rgb(255, 0, 0)",
      "rgb(153, 0, 0)",
    ]);
  });

  it("returns no colors when every pixel is unusable", () => {
    const data = pixelData([
      [0, 255, 0, 0],
      [255, 255, 255],
      [0, 0, 0],
    ]);

    expect(extractPalette(data)).toEqual([]);
  });

  it("caps the palette at five colors", () => {
    const data = pixelData([
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0],
      [255, 0, 255],
      [0, 255, 255],
    ]);

    expect(extractPalette(data)).toHaveLength(5);
  });

  it.each([
    {
      theme: "dark" as const,
      source: { r: 70, g: 90, b: 120 },
      range: [0.62, 0.82] as const,
    },
    {
      theme: "light" as const,
      source: { r: 230, g: 240, b: 250 },
      range: [0.42, 0.66] as const,
    },
  ])("bands a $theme cover color while keeping its hue", ({ theme, source, range }) => {
    const original = coverColor(source.r, source.g, source.b);
    const [banded] = applyLightnessBand([original], theme);
    expect(banded!.l).toBeGreaterThanOrEqual(range[0] - 0.01);
    expect(banded!.l).toBeLessThanOrEqual(range[1] + 0.01);
    expect(Math.hypot(banded!.a - original.a, banded!.b - original.b)).toBeLessThan(0.02);
  });

  it("leaves a color already inside the band alone", () => {
    const color = coverColor(180, 180, 180);
    expect(applyLightnessBand([color], "dark")).toEqual([color]);
  });

  it("reads up to five host theme colors, never the background, and fills to two", () => {
    const element = document.createElement("div");
    element.style.setProperty("--timeline-accent", "rgb(1 2 3)");
    element.style.setProperty("--success", "rgb(4 5 6)");
    element.style.setProperty("--warning", "rgb(7 8 9)");
    element.style.setProperty("--pr-merged", "rgb(10 11 12)");
    element.style.setProperty("--attention", "rgb(13 14 15)");
    element.style.setProperty("--foreground", "rgb(16 17 18)");
    element.style.setProperty("--background", "rgb(19 20 21)");
    document.body.append(element);

    expect(themePalette(element)).toEqual([
      "rgb(1 2 3)",
      "rgb(4 5 6)",
      "rgb(7 8 9)",
      "rgb(10 11 12)",
      "rgb(13 14 15)",
    ]);

    const minimal = document.createElement("div");
    minimal.style.setProperty("--foreground", "rgb(30 31 32)");
    minimal.style.setProperty("--background", "rgb(33 34 35)");
    document.body.append(minimal);
    const minimalPalette = themePalette(minimal);
    expect(minimalPalette).toHaveLength(2);
    expect(minimalPalette[0]).toBe("rgb(30 31 32)");
    expect(minimalPalette).not.toContain("rgb(33 34 35)");

    const plain = document.createElement("div");
    plain.style.color = "red";
    document.body.append(plain);
    const fallback = themePalette(plain);
    expect(fallback).toHaveLength(2);
    expect(fallback[0]).toBe("rgb(255, 0, 0)");
    expect(fallback[1]).toContain("color-mix");

    element.remove();
    minimal.remove();
    plain.remove();
  });
});

describe("sampleCoverPalette", () => {
  let images: Array<{
    crossOrigin: string | null;
    referrerPolicy: string;
    onload: (() => void) | null;
    onerror: (() => void) | null;
    src: string;
  }>;

  beforeEach(() => {
    images = [];
    class FakeImage {
      crossOrigin: string | null = null;
      referrerPolicy = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      #source = "";

      constructor() {
        images.push(this);
      }

      get src(): string {
        return this.#source;
      }

      set src(value: string) {
        this.#source = value;
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);
  });

  afterEach(() => {
    vi.stubGlobal("Image", OriginalImage);
  });

  it("loads anonymously and extracts the cover colors", async () => {
    const context = fakeContext();
    context.getImageData.mockReturnValue({
      data: pixelData([
        [255, 0, 0],
        [0, 0, 255],
      ]),
    } as ImageData);
    installCanvasContext(context);

    const palette = await sampleCoverPalette("https://example.test/cover.jpg");
    expect(paletteStrings(palette)).toEqual(["rgb(255, 0, 0)", "rgb(0, 0, 255)"]);

    expect(images[0]?.crossOrigin).toBe("anonymous");
    expect(images[0]?.referrerPolicy).toBe("no-referrer");
    expect(context.drawImage).toHaveBeenCalled();
  });

  it("rejects when the canvas pixels cannot be read", async () => {
    const context = fakeContext();
    context.getImageData.mockImplementation(() => {
      throw new DOMException("Tainted canvas", "SecurityError");
    });
    installCanvasContext(context);

    await expect(sampleCoverPalette("https://example.test/local.jpg")).rejects.toThrow(
      "Tainted canvas",
    );
  });

  it("rejects when the cover has no usable colors", async () => {
    const context = fakeContext();
    context.getImageData.mockReturnValue({
      data: pixelData([]),
    } as ImageData);
    installCanvasContext(context);

    await expect(sampleCoverPalette("https://example.test/blank.jpg")).rejects.toThrow(
      "no usable colors",
    );
  });
});

describe("lava blobs", () => {
  it("gives the same track the same arrangement, and other tracks another", () => {
    expect(lavaBlobs("track-a", PALETTE)).toEqual(lavaBlobs("track-a", PALETTE));
    expect(lavaBlobs("track-a", PALETTE)).not.toEqual(lavaBlobs("track-b", PALETTE));
  });

  it("gives each palette color one blob, in palette order", () => {
    const palette = ["#111", "#222", "#333", "#444", "#555"];
    expect(lavaBlobs("a", palette).map((blob) => blob.color)).toEqual(palette);
  });

  it("seeds a deterministic home-slot permutation per track", () => {
    const order = lavaHomeOrder("track-a", 5);
    expect(lavaHomeOrder("track-a", 5)).toEqual(order);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(lavaHomeOrder("track-b", 5)).not.toEqual(order);
  });

  it("leaves every other blob trait unchanged by the home order", () => {
    const palette = ["#111", "#222", "#333", "#444", "#555"];
    const blobs = lavaBlobs("track-a", palette);
    const order = lavaHomeOrder("track-a", palette.length);
    blobs.forEach((blob, index) => {
      expect(
        Math.abs(blob.homeX - (order[index]! + 0.5) / palette.length),
      ).toBeLessThanOrEqual(0.05);
    });

    const short = lavaBlobs("track-a", palette.slice(0, 2));
    short.forEach((blob, index) => {
      expect(nonHomeTraits(blobs[index]!)).toEqual(nonHomeTraits(blob));
    });
  });
});

describe("lava painting", () => {
  it("paints one blob per palette color, far to near", () => {
    const context = fakeContext();
    const drawn: { color: unknown; alpha: number; filter: string }[] = [];
    context.fill.mockImplementation(() =>
      drawn.push({
        color: context.fillStyle,
        alpha: context.globalAlpha,
        filter: context.filter,
      }),
    );
    const blobs = lavaBlobs("track-a", PALETTE);
    const phase = 7;

    drawLavaBlobs(
      context as unknown as CanvasRenderingContext2D,
      400,
      44,
      blobs,
      phase,
      1,
    );

    const frames = blobs
      .map((blob) => ({ blob, frame: lavaBlobFrame(blob, 400, 44, phase) }))
      .sort((a, b) => a.frame.depth - b.frame.depth);
    expect(drawn.map((entry) => entry.color)).toEqual(
      frames.map(({ blob }) => blob.color),
    );
    drawn.forEach((entry, index) => {
      expect(entry.alpha).toBeCloseTo(frames[index]!.frame.opacity);
    });
  });

  it("fades a whole palette with alpha", () => {
    const context = fakeContext();
    const alphas: number[] = [];
    context.fill.mockImplementation(() => alphas.push(context.globalAlpha));
    const [blob] = lavaBlobs("track-a", ["#111"]);

    drawLavaBlobs(
      context as unknown as CanvasRenderingContext2D,
      400,
      44,
      [blob!],
      3,
      0.4,
    );

    expect(alphas[0]).toBeCloseTo(0.4 * lavaBlobFrame(blob!, 400, 44, 3).opacity);
  });

  it("makes near blobs bigger, more opaque and sharper than far ones", () => {
    const height = 44;
    const [blob] = lavaBlobs("track-a", ["#111"]);
    const frames = [];
    for (let phase = 0; phase < 600; phase += 1.3) {
      frames.push(lavaBlobFrame(blob!, 680, height, phase));
    }

    const nearest = frames.reduce((a, b) => (b.depth > a.depth ? b : a));
    const farthest = frames.reduce((a, b) => (b.depth < a.depth ? b : a));
    expect(nearest.radius).toBeGreaterThan(farthest.radius);
    expect(nearest.opacity).toBeGreaterThan(farthest.opacity);
    expect(nearest.blur).toBeLessThan(farthest.blur);

    for (const frame of frames) {
      expect(frame.depth).toBeGreaterThanOrEqual(0);
      expect(frame.depth).toBeLessThanOrEqual(1);
    }
  });

  it("sizes blobs from the canvas height, not its width", () => {
    const [blob] = lavaBlobs("track-a", PALETTE);
    for (let phase = 0; phase < 50; phase += 2.3) {
      expect(lavaBlobFrame(blob!, 200, 44, phase).radius).toBeCloseTo(
        lavaBlobFrame(blob!, 1200, 44, phase).radius,
      );
    }
  });

  it("moves near blobs further sideways than far ones (parallax)", () => {
    const width = 680;
    const height = 44;
    const blobs = lavaBlobs("track-a", ["#111", "#222", "#333", "#444"]);

    for (let phase = 0; phase < 300; phase += 3.7) {
      for (const blob of blobs) {
        const frame = lavaBlobFrame(blob, width, height, phase);
        // Sideways reach scales from 0.6× (far) to 1.4× (near) of ±200%.
        const reach = height * 2 * (0.6 + 0.8 * frame.depth);
        expect(Math.abs(frame.x - width * blob.homeX)).toBeLessThanOrEqual(reach + 1e-9);
        expect(Math.abs(frame.y - height * blob.homeY)).toBeLessThanOrEqual(
          height + 1e-9,
        );
      }
    }
  });

  it("stretches moving blobs along their motion, and not when paused", () => {
    const [blob] = lavaBlobs("track-a", ["#111"]);
    let stretched = 0;
    for (let phase = 0; phase < 100; phase += 1.7) {
      const moving = lavaBlobFrame(blob!, 680, 44, phase, 1);
      expect(moving.stretch).toBeGreaterThanOrEqual(0);
      expect(moving.stretch).toBeLessThanOrEqual(0.35);
      if (moving.stretch > 0) stretched += 1;
      expect(lavaBlobFrame(blob!, 680, 44, phase, 0).stretch).toBe(0);
    }
    expect(stretched).toBeGreaterThan(0);
  });

  it("spreads blob home spots evenly across the width, around the middle", () => {
    const blobs = lavaBlobs("track-a", ["#1", "#2", "#3", "#4"]);
    const order = lavaHomeOrder("track-a", blobs.length);
    blobs.forEach((blob, index) => {
      expect(
        Math.abs(blob.homeX - (order[index]! + 0.5) / blobs.length),
      ).toBeLessThanOrEqual(0.05);
      expect(Math.abs(blob.homeY - 0.5)).toBeLessThanOrEqual(0.05);
    });
    expect(new Set(blobs.map((blob) => blob.homeY)).size).toBeGreaterThan(1);
  });
});

function LavaLoop({
  visible,
  playing,
  palette,
}: {
  visible: boolean;
  playing: boolean;
  palette: string[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLavaLamp(ref, { seed: "test", colors: palette }, playing, visible);
  return <canvas ref={ref} />;
}

describe("lava animation loop", () => {
  let context: FakeContext;
  let rafSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    context = fakeContext();
    installCanvasContext(context);
    rafSpy = vi.spyOn(window, "requestAnimationFrame");
  });

  afterEach(() => {
    Reflect.deleteProperty(document, "visibilityState");
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("runs while playing, stops after a pause settles, and stops on unmount", async () => {
    const view = render(<LavaLoop visible playing palette={PALETTE} />);
    await advance(100);

    expect(rafSpy.mock.calls.length).toBeGreaterThan(0);
    expect(
      view.container.querySelector("canvas")?.getAttribute("data-sonora-lava-palette"),
    ).toBe(JSON.stringify(PALETTE));

    view.rerender(<LavaLoop visible playing={false} palette={PALETTE} />);
    await advance(2_500);
    const settled = rafSpy.mock.calls.length;
    await advance(500);
    expect(rafSpy.mock.calls.length).toBe(settled);

    view.rerender(<LavaLoop visible playing palette={PALETTE} />);
    await advance(100);
    expect(rafSpy.mock.calls.length).toBeGreaterThan(settled);

    view.unmount();
    const unmounted = rafSpy.mock.calls.length;
    await advance(500);
    expect(rafSpy.mock.calls.length).toBe(unmounted);
  });

  it("stops when hidden and resumes when shown", async () => {
    const view = render(<LavaLoop visible playing palette={PALETTE} />);
    await advance(100);

    view.rerender(<LavaLoop visible={false} playing palette={PALETTE} />);
    await advance(100);
    const hidden = rafSpy.mock.calls.length;
    await advance(500);
    expect(rafSpy.mock.calls.length).toBe(hidden);

    view.rerender(<LavaLoop visible playing palette={PALETTE} />);
    await advance(100);
    expect(rafSpy.mock.calls.length).toBeGreaterThan(hidden);
  });

  it("stops while the page is hidden and resumes when visible", async () => {
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });

    const view = render(<LavaLoop visible playing palette={PALETTE} />);
    await advance(100);

    visibility = "hidden";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(100);
    const hidden = rafSpy.mock.calls.length;
    await advance(500);
    expect(rafSpy.mock.calls.length).toBe(hidden);

    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(100);
    expect(rafSpy.mock.calls.length).toBeGreaterThan(hidden);

    view.unmount();
  });
});

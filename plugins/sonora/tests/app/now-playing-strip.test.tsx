// @vitest-environment jsdom
import { fireEvent, render, renderHook } from "@testing-library/react";
import type { PluginComposerScope } from "@get-bb/plugin-sdk/app";
import {
  loadPluginApp,
  renderSlot,
  type CapturedPluginApp,
  type RenderedSlot,
} from "@get-bb/plugin-sdk/testing/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarqueeText } from "../../src/app/components/marquee.tsx";
import app from "../../src/app/index.tsx";
import { lavaSources } from "../../src/app/lib/lava.ts";
import { useRunGrace } from "../../src/app/lib/run-grace.ts";
import {
  NOW_PLAYING_RPC_TAG,
  emptyNowPlaying,
  nowPlayingRpcContract,
} from "../../src/shared/now-playing.ts";
import { installCanvasContext } from "../support/canvas.ts";
import { nextReceivedAt, playing, track, type RpcHandler } from "../support/fixtures.ts";
import { advance, backdropCovers, settle } from "../support/render.ts";

const CLIENT_START = 1_700_000_000_000;

type ComposerCustomization = CapturedPluginApp["composerCustomizations"][number];
type BannerRegistration = NonNullable<ComposerCustomization["banners"]>[number];

let slots: RenderedSlot[] = [];

async function renderStrip(
  nowPlaying: RpcHandler,
  options: {
    settings?: Record<string, string | number | boolean>;
    isRunning?: boolean;
    scope?: PluginComposerScope;
  } = {},
): Promise<{
  slot: RenderedSlot;
  customization: ComposerCustomization;
  banner: BannerRegistration;
}> {
  const captured = await loadPluginApp(app);
  const customization = captured.composerCustomizations.find(
    (entry) => entry.id === "now-playing-strip",
  );
  if (customization === undefined) {
    throw new Error("now-playing strip was not registered");
  }
  const banner = customization.banners?.find((entry) => entry.id === "now-playing");
  if (banner === undefined) {
    throw new Error("now-playing strip banner was not registered");
  }

  const slot = renderSlot(
    banner,
    {},
    {
      rpc: { nowPlaying },
      experimental_rpcContract: nowPlayingRpcContract,
      settings: options.settings,
      composer: {
        scope: options.scope ?? { kind: "thread", threadId: "thread-1" },
        isRunning: options.isRunning ?? true,
      },
      pluginId: "sonora",
    },
  );
  slots.push(slot);
  await settle();
  await advance(50);
  return { slot, customization, banner };
}

function strip(slot: RenderedSlot): Element {
  const element = slot.container.querySelector("[data-sonora-strip]");
  if (element === null) throw new Error("the strip was not rendered");
  return element;
}

function canvas(slot: RenderedSlot): HTMLCanvasElement {
  const element = slot.container.querySelector("canvas");
  if (element === null) throw new Error("the lava canvas was not rendered");
  return element;
}

function lavaSeed(slot: RenderedSlot): string | undefined {
  return canvas(slot).dataset.sonoraLavaSeed;
}

function lavaPalette(slot: RenderedSlot): string[] {
  return JSON.parse(
    canvas(slot).getAttribute("data-sonora-lava-palette") ?? "[]",
  ) as string[];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(CLIENT_START);
  installCanvasContext();
  vi.spyOn(lavaSources, "sample").mockResolvedValue(["rgb(10 20 30)"]);
  vi.spyOn(lavaSources, "theme").mockReturnValue(["rgb(30 40 50)"]);
});

afterEach(() => {
  for (const slot of slots.splice(0)) slot.unmount();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Sonora now-playing strip", () => {
  it("registers a bare banner scoped to threads", async () => {
    const { customization, banner } = await renderStrip(() => playing());

    expect(customization).toMatchObject({
      id: "now-playing-strip",
      scopes: ["thread"],
    });
    expect(banner).toMatchObject({ id: "now-playing", chrome: "bare" });
  });

  it("shows by default with the track, time, backdrop, record, and empty controls slot", async () => {
    const { slot } = await renderStrip(() => playing());

    strip(slot);
    const title = slot.getByText("Night Drive");
    expect(title.className).toContain("text-xs");
    expect(title.className).toContain("font-medium");
    // The strip sits on a card: its text takes the card's color, never the sidebar's.
    expect(title.className).not.toContain("sidebar");
    const meta = slot.getByText(/A, B · Album/);
    expect(meta.className).toContain("text-2xs");
    expect(meta.className).toContain("text-subtle-foreground");
    expect(slot.getByText("0:42 / 3:33")).toBeTruthy();
    expect(backdropCovers(slot.container)).toEqual(["https://example.test/cover.jpg"]);
    const record = slot.container.querySelector("[data-sonora-record]");
    const disc = record?.querySelector("[data-sonora-record-disc]");
    const recordCover = record?.querySelector("img");
    expect(record?.className).not.toContain("bg-foreground");
    expect(recordCover?.className).toContain("size-full");
    // Only the disc carries the cover and turns; sheen, rim and hole stay still on top.
    expect(recordCover?.parentElement).toBe(disc);
    for (const part of ["sheen", "rim", "hole"]) {
      const element = record?.querySelector(`[data-sonora-record-${part}]`);
      expect(element?.parentElement).toBe(record);
    }
    expect(record?.querySelector("[data-sonora-record-hole]")?.className).toContain(
      "size-[var(--sonora-record-hole)]",
    );
    expect(slot.container.querySelector('[data-sonora-record="playing"]')).not.toBeNull();
    expect(slot.container.querySelector("[data-sonora-controls-slot]")?.textContent).toBe(
      "",
    );
    expect(slot.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("42");
  });

  it("advances the time with the shared client clock", async () => {
    const { slot } = await renderStrip(() => playing());
    expect(slot.getByText("0:42 / 3:33")).toBeTruthy();

    await advance(1_000);

    expect(slot.getByText("0:43 / 3:33")).toBeTruthy();
  });

  it("hides when the setting is off", async () => {
    const { slot } = await renderStrip(() => playing(), {
      settings: { nowPlayingStrip: false },
    });

    expect(slot.container.querySelector("[data-sonora-strip]")).toBeNull();
    expect(backdropCovers(slot.container)).toEqual([]);
  });

  it("hides when the agent is not running, unless debug mode is on", async () => {
    const { slot } = await renderStrip(() => playing(), { isRunning: false });
    expect(slot.container.querySelector("[data-sonora-strip]")).toBeNull();

    localStorage.setItem("sonora:debug", "1");
    try {
      const debug = await renderStrip(() => playing(), { isRunning: false });
      expect(debug.slot.container.querySelector("[data-sonora-strip]")).not.toBeNull();
    } finally {
      localStorage.removeItem("sonora:debug");
    }
  });

  it("never renders on the New thread screen", async () => {
    const { slot } = await renderStrip(() => playing(), {
      scope: { kind: "new-thread", projectId: "project-1" },
    });

    expect(slot.container.querySelector("[data-sonora-strip]")).toBeNull();
  });

  it.each([
    {
      name: "there is no track",
      make: () => emptyNowPlaying("running", nextReceivedAt()),
    },
    {
      name: "Sonora is not running",
      make: () => emptyNowPlaying("not-running", nextReceivedAt()),
    },
    {
      name: "Sonora is unavailable",
      make: () => emptyNowPlaying("unavailable", nextReceivedAt()),
    },
  ])("hides when $name", async ({ make }) => {
    const { slot } = await renderStrip(make);

    expect(slot.container.querySelector("[data-sonora-strip]")).toBeNull();
  });

  it("shows a still strip while paused", async () => {
    const { slot } = await renderStrip(() => playing({ state: "paused" }));

    strip(slot);
    expect(slot.container.querySelector('[data-sonora-record="paused"]')).not.toBeNull();
    expect(slot.getByText("0:42 / 3:33")).toBeTruthy();

    await advance(2_000);

    expect(slot.getByText("0:42 / 3:33")).toBeTruthy();
  });

  it("does not take focus from the prompt box on pointer down", async () => {
    const prompt = document.createElement("textarea");
    document.body.append(prompt);
    prompt.focus();

    const { slot } = await renderStrip(() => playing());

    expect(fireEvent.pointerDown(strip(slot))).toBe(false);
    expect(document.activeElement).toBe(prompt);

    prompt.remove();
  });
});

describe("now-playing strip marquee", () => {
  it("scrolls only while hovered", () => {
    const text = "A very long track title";
    const view = render(<MarqueeText text={text} />);
    const truncated = view.getByTitle(text);
    Object.defineProperty(truncated, "scrollWidth", {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(truncated, "clientWidth", {
      configurable: true,
      value: 100,
    });

    const line = view.container.querySelector("p");
    if (line === null) throw new Error("marquee line was not rendered");

    fireEvent.mouseEnter(line);
    expect(view.queryByTitle(text)).toBeNull();
    expect(view.container.querySelector(".inline-flex")).not.toBeNull();

    fireEvent.mouseLeave(line);
    expect(view.getByTitle(text)).toBeTruthy();
    expect(view.container.querySelector(".inline-flex")).toBeNull();

    view.unmount();
  });
});

describe("now-playing strip run grace", () => {
  it("bridges a short dip, hides after a second, and shows immediately again", async () => {
    const { result, rerender } = renderHook(
      ({ running }: { running: boolean }) => useRunGrace(running),
      { initialProps: { running: true } },
    );

    expect(result.current).toBe(true);

    rerender({ running: false });
    await advance(500);
    expect(result.current).toBe(true);

    rerender({ running: true });
    await advance(100);
    expect(result.current).toBe(true);

    rerender({ running: false });
    await advance(999);
    expect(result.current).toBe(true);
    await advance(1);
    expect(result.current).toBe(false);

    rerender({ running: true });
    await advance(16);
    expect(result.current).toBe(true);
  });
});

describe("now-playing strip lava palette", () => {
  it("takes the palette from a readable cover and switches it with the track once sampled", async () => {
    let current = playing({
      track: track({
        id: "track-a",
        cover: "https://example.test/cover-a.jpg",
      }),
    });
    vi.mocked(lavaSources.sample).mockResolvedValue(["rgb(1 2 3)"]);

    const { slot } = await renderStrip(() => current);

    expect(lavaPalette(slot)).toEqual(["rgb(1 2 3)"]);
    expect(lavaSeed(slot)).toBe("track-a");
    expect(vi.mocked(lavaSources.sample)).toHaveBeenCalledWith(
      "https://example.test/cover-a.jpg",
    );

    let resolveSample: (colors: string[]) => void = () => {};
    vi.mocked(lavaSources.sample).mockReturnValue(
      new Promise((resolve) => {
        resolveSample = resolve;
      }),
    );
    current = playing({
      track: track({
        id: "track-b",
        cover: "https://example.test/cover-b.jpg",
      }),
    });
    await slot.behavior.experimental_invalidateRpc([NOW_PLAYING_RPC_TAG]);
    await settle();
    await advance(50);

    // The old track's lava holds until the new colors are in.
    expect(lavaSeed(slot)).toBe("track-a");
    expect(lavaPalette(slot)).toEqual(["rgb(1 2 3)"]);

    resolveSample(["rgb(4 5 6)"]);
    await settle();
    await advance(50);

    expect(lavaSeed(slot)).toBe("track-b");
    expect(lavaPalette(slot)).toEqual(["rgb(4 5 6)"]);
    expect(vi.mocked(lavaSources.sample)).toHaveBeenCalledWith(
      "https://example.test/cover-b.jpg",
    );
  });

  it("falls back to theme colors when the cover is missing", async () => {
    const { slot } = await renderStrip(() => playing({ track: track({ cover: null }) }));

    expect(vi.mocked(lavaSources.sample)).not.toHaveBeenCalled();
    expect(lavaPalette(slot)).toEqual(["rgb(30 40 50)"]);
  });

  it.each([
    {
      name: "fails to load",
      error: new Error("The cover failed to load"),
    },
    {
      name: "cannot be read",
      error: new DOMException("Tainted canvas", "SecurityError"),
    },
  ])("falls back to theme colors when the cover $name", async ({ error }) => {
    vi.mocked(lavaSources.sample).mockRejectedValue(error);

    const { slot } = await renderStrip(() => playing());

    expect(vi.mocked(lavaSources.sample)).toHaveBeenCalled();
    expect(lavaPalette(slot)).toEqual(["rgb(30 40 50)"]);
  });

  it("follows bb's theme live while using the theme fallback", async () => {
    const { slot } = await renderStrip(() => playing({ track: track({ cover: null }) }));
    expect(lavaPalette(slot)).toEqual(["rgb(30 40 50)"]);

    vi.mocked(lavaSources.theme).mockReturnValue(["rgb(200 210 220)"]);
    // A page-title change is not a theme change.
    document.title = "Another thread";
    await settle();
    await advance(50);
    expect(lavaPalette(slot)).toEqual(["rgb(30 40 50)"]);

    document.documentElement.classList.add("dark");
    try {
      await settle();
      await advance(50);
      expect(lavaPalette(slot)).toEqual(["rgb(200 210 220)"]);
    } finally {
      document.documentElement.classList.remove("dark");
    }
  });

  it("keeps cover colors when bb's theme changes", async () => {
    vi.mocked(lavaSources.sample).mockResolvedValue(["rgb(1 2 3)"]);
    const { slot } = await renderStrip(() => playing());
    expect(lavaPalette(slot)).toEqual(["rgb(1 2 3)"]);

    vi.mocked(lavaSources.theme).mockReturnValue(["rgb(200 210 220)"]);
    document.documentElement.classList.add("dark");
    try {
      await settle();
      await advance(50);
      expect(lavaPalette(slot)).toEqual(["rgb(1 2 3)"]);
    } finally {
      document.documentElement.classList.remove("dark");
    }
  });
});

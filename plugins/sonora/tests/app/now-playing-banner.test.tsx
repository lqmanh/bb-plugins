// @vitest-environment jsdom
import { act, fireEvent, render, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PluginComposerScope } from "@get-bb/plugin-sdk/app";
import {
  loadPluginApp,
  renderSlot,
  type CapturedPluginApp,
  type PluginRpcTestHandlers,
  type RenderedSlot,
} from "@get-bb/plugin-sdk/testing/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarqueeText } from "../../src/app/components/marquee.tsx";
import app from "../../src/app/index.tsx";
import { DEBUG_STORAGE_KEY, isDebugMode, setDebugMode } from "../../src/app/lib/debug.ts";
import { lavaSources } from "../../src/app/lib/lava.ts";
import { useRunGrace } from "../../src/app/lib/run-grace.ts";
import {
  NOW_PLAYING_RPC_TAG,
  emptyNowPlaying,
  nowPlayingRpcContract,
} from "../../src/shared/now-playing.ts";
import { installCanvasContext } from "../support/canvas.ts";
import { installCodeThemeRuntime, setCodeTheme } from "../support/code-theme.ts";
import {
  BARE_SONORA_CALL,
  nextReceivedAt,
  OPEN_SONORA_CALL,
  playing,
  track,
  type ControlHandler,
  type RpcHandler,
} from "../support/fixtures.ts";
import { bandedPalette, coverColor, type CoverColor } from "../support/lava.ts";
import { NO_BADGE_PROVIDERS, PROVIDER_BADGES } from "../support/providers.ts";
import { advance, backdropCovers, settle } from "../support/render.ts";

const CLIENT_START = 1_700_000_000_000;
const BADGE_CASES = PROVIDER_BADGES.map((badge) => ({
  ...badge,
  make: () => playing({ provider: badge.provider }),
}));
const NO_BADGE_CASES = NO_BADGE_PROVIDERS.map(({ name, provider }) => ({
  name,
  make: () => playing({ provider }),
}));

type ComposerCustomization = CapturedPluginApp["composerCustomizations"][number];
type BannerRegistration = NonNullable<ComposerCustomization["banners"]>[number];

let slots: RenderedSlot[] = [];

async function renderBanner(
  nowPlaying: RpcHandler,
  options: {
    settings?: Record<string, string | number | boolean>;
    isRunning?: boolean;
    scope?: PluginComposerScope;
    control?: ControlHandler;
  } = {},
): Promise<{
  slot: RenderedSlot;
  customization: ComposerCustomization;
  banner: BannerRegistration;
}> {
  const captured = await loadPluginApp(app);
  const customization = captured.composerCustomizations.find(
    (entry) => entry.id === "now-playing-banner",
  );
  if (customization === undefined) {
    throw new Error("now-playing banner was not registered");
  }
  const banner = customization.banners?.find((entry) => entry.id === "now-playing");
  if (banner === undefined) {
    throw new Error("now-playing banner was not registered");
  }

  const rpc: PluginRpcTestHandlers<typeof nowPlayingRpcContract> = {
    nowPlaying,
    control: options.control ?? (() => null),
  };
  const slot = renderSlot(
    banner,
    {},
    {
      rpc,
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

function banner(slot: RenderedSlot): Element {
  const element = slot.container.querySelector("[data-sonora-banner]");
  if (element === null) throw new Error("the banner was not rendered");
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
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(CLIENT_START);
  installCanvasContext();
  installCodeThemeRuntime();
  vi.spyOn(lavaSources, "sample").mockResolvedValue([coverColor(10, 20, 30)]);
  vi.spyOn(lavaSources, "theme").mockReturnValue(["rgb(30 40 50)"]);
});

afterEach(() => {
  for (const slot of slots.splice(0)) slot.unmount();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Sonora now-playing banner", () => {
  it("registers a bare banner scoped to threads", async () => {
    const { customization, banner } = await renderBanner(() => playing());

    expect(customization).toMatchObject({
      id: "now-playing-banner",
      scopes: ["thread"],
    });
    expect(banner).toMatchObject({ id: "now-playing", chrome: "bare" });
  });

  it("shows by default with the track, time, backdrop, record, controls, and seek bar", async () => {
    const { slot } = await renderBanner(() => playing());

    banner(slot);
    const title = slot.getByText("Night Drive");
    expect(title.className).toContain("text-xs");
    expect(title.className).toContain("font-medium");
    // The banner sits on a card: its text takes the card's color, never the sidebar's.
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
    // Only the disc carries the cover and turns; sheen, rim and spindle hole stay still on top.
    expect(recordCover?.parentElement).toBe(disc);
    for (const part of ["sheen", "rim", "hole"]) {
      const element = record?.querySelector(`[data-sonora-record-${part}]`);
      expect(element?.parentElement).toBe(record);
    }
    expect(record?.querySelector("[data-sonora-record-hole]")?.className).toContain(
      "size-[var(--sonora-record-hole)]",
    );
    expect(slot.container.querySelector('[data-sonora-record="playing"]')).not.toBeNull();
    expect(
      slot.container.querySelectorAll("[data-sonora-controls-slot] button"),
    ).toHaveLength(3);
    expect(slot.getByRole("button", { name: "Previous track" })).toBeTruthy();
    expect(slot.getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(slot.getByRole("button", { name: "Next track" })).toBeTruthy();
    const seek = slot.getByRole("slider");
    // The surface owns the position, so the bar is not a flex item in the row.
    expect(seek.className).toContain("absolute");
    expect(seek.className).not.toContain("relative");
    expect(seek.getAttribute("aria-valuenow")).toBe("42");
  });

  it("advances the time with the shared client clock", async () => {
    const { slot } = await renderBanner(() => playing());
    expect(slot.getByText("0:42 / 3:33")).toBeTruthy();

    await advance(1_000);

    expect(slot.getByText("0:43 / 3:33")).toBeTruthy();
  });

  it("redraws the shared clock every fifth of a second", async () => {
    const { slot } = await renderBanner(() => playing());
    const fill = slot.container.querySelector<HTMLElement>(".sonora-seek-fill");
    if (fill === null) throw new Error("seek fill was not rendered");
    const before = fill.style.width;

    // renderBanner advances 50 ms, so 150 ms more reaches the first 200 ms tick.
    await advance(150);

    expect(fill.style.width).not.toBe(before);
    expect(slot.getByText("0:42 / 3:33")).toBeTruthy();
  });

  it("hides when the setting is off", async () => {
    const { slot } = await renderBanner(() => playing(), {
      settings: { nowPlayingBanner: false },
    });

    expect(slot.container.querySelector("[data-sonora-banner]")).toBeNull();
    expect(backdropCovers(slot.container)).toEqual([]);
  });

  it("hides when the agent is not running, unless debug mode is on", async () => {
    const { slot } = await renderBanner(() => playing(), { isRunning: false });
    expect(slot.container.querySelector("[data-sonora-banner]")).toBeNull();

    act(() => setDebugMode(true));
    await settle();
    await advance(50);
    expect(slot.container.querySelector("[data-sonora-banner]")).not.toBeNull();

    act(() => setDebugMode(false));
    await settle();
    await advance(200);
    expect(slot.container.querySelector("[data-sonora-banner]")).toBeNull();
  });

  it("reads debug mode from sessionStorage", async () => {
    sessionStorage.setItem(DEBUG_STORAGE_KEY, "1");

    const { slot } = await renderBanner(() => playing(), { isRunning: false });

    expect(slot.container.querySelector("[data-sonora-banner]")).not.toBeNull();
    expect(localStorage.getItem(DEBUG_STORAGE_KEY)).toBeNull();
  });

  it("treats storage that throws as debug mode off", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const { slot } = await renderBanner(() => playing(), { isRunning: false });

    expect(isDebugMode()).toBe(false);
    expect(slot.container.querySelector("[data-sonora-banner]")).toBeNull();
  });

  it("does not toggle debug mode from the record", async () => {
    const { slot } = await renderBanner(() => playing());
    const record = slot.container.querySelector("[data-sonora-record]");
    if (record === null) throw new Error("the record was not rendered");

    fireEvent.doubleClick(record, { altKey: true });

    expect(isDebugMode()).toBe(false);
  });

  it("never renders on the New thread screen", async () => {
    const { slot } = await renderBanner(() => playing(), {
      scope: { kind: "new-thread", projectId: "project-1" },
    });

    expect(slot.container.querySelector("[data-sonora-banner]")).toBeNull();
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
    const { slot } = await renderBanner(make);

    expect(slot.container.querySelector("[data-sonora-banner]")).toBeNull();
  });

  it("shows a still banner with controls while paused", async () => {
    const { slot } = await renderBanner(() => playing({ state: "paused" }));

    banner(slot);
    expect(slot.container.querySelector('[data-sonora-record="paused"]')).not.toBeNull();
    expect(slot.getByText("0:42 / 3:33")).toBeTruthy();
    expect(slot.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(slot.getByRole("slider")).toBeTruthy();

    await advance(2_000);

    expect(slot.getByText("0:42 / 3:33")).toBeTruthy();
  });

  it("opens Sonora from the record", async () => {
    const { slot } = await renderBanner(() => playing());
    const record = slot.getByRole("button", { name: "Open in Sonora (Spotify)" });

    expect(record.getAttribute("type")).toBe("button");
    fireEvent.click(record);

    expect(slot.navigateCalls).toEqual([OPEN_SONORA_CALL]);
  });

  it("opens Sonora once from a double-click on the record", async () => {
    const { slot } = await renderBanner(() => playing());
    const record = slot.getByRole("button", { name: "Open in Sonora (Spotify)" });

    fireEvent.click(record, { detail: 1 });
    fireEvent.click(record, { detail: 2 });

    expect(slot.navigateCalls).toEqual([OPEN_SONORA_CALL]);
    expect(isDebugMode()).toBe(false);
  });

  it("does not open Sonora on an Alt-click on the record", async () => {
    const { slot } = await renderBanner(() => playing());
    const record = slot.getByRole("button", { name: "Open in Sonora (Spotify)" });

    fireEvent.click(record, { altKey: true, detail: 1 });

    expect(slot.navigateCalls).toEqual([]);
  });

  it("opens the bare Sonora link when the track has none", async () => {
    const { slot } = await renderBanner(() => playing({ track: track({ id: null }) }));

    fireEvent.click(slot.getByRole("button", { name: "Open in Sonora (Spotify)" }));

    expect(slot.navigateCalls).toEqual([BARE_SONORA_CALL]);
  });

  it.each(BADGE_CASES)(
    "shows the $label badge on the record",
    async ({ provider, label, icon, shape, make }) => {
      const { slot } = await renderBanner(make);
      const button = slot.getByRole("button", { name: `Open in Sonora (${label})` });
      const badge = button.querySelector(`[data-sonora-provider-badge="${provider}"]`);
      const record = slot.container.querySelector("[data-sonora-record]");
      if (badge === null) throw new Error("the provider badge was not rendered");
      if (record === null) throw new Error("the record was not rendered");

      expect(badge.getAttribute("aria-hidden")).toBe("true");
      expect(badge.className).not.toContain("pointer-events-none");
      expect(badge.querySelector(`[data-icon="${icon}"]`)).not.toBeNull();
      expect(record.className).toContain(`sonora-record-gap-${shape}`);
      expect(record.contains(badge)).toBe(false);
      expect(record.querySelector("[data-sonora-record-disc]")?.contains(badge)).toBe(
        false,
      );
    },
  );

  it.each(NO_BADGE_CASES)("shows no badge on the record for $name", async ({ make }) => {
    const { slot } = await renderBanner(make);
    const button = slot.getByRole("button", { name: "Open in Sonora" });
    const record = slot.container.querySelector("[data-sonora-record]");
    if (record === null) throw new Error("the record was not rendered");

    expect(button.querySelector("[data-sonora-provider-badge]")).toBeNull();
    expect(record.className).not.toContain("sonora-record-gap");
  });

  it("opens Sonora from the record's provider badge", async () => {
    const { slot } = await renderBanner(() => playing());
    const badge = slot.container.querySelector('[data-sonora-provider-badge="spotify"]');
    if (badge === null) throw new Error("the provider badge was not rendered");
    expect(badge.className).not.toContain("pointer-events-none");
    vi.useRealTimers();
    const user = userEvent.setup();

    await user.click(badge);

    expect(slot.navigateCalls).toEqual([OPEN_SONORA_CALL]);
  });

  it("keeps the controls while a track loads and offers pause", async () => {
    const { slot } = await renderBanner(() => playing({ state: "loading" }));

    banner(slot);
    expect(slot.getByRole("button", { name: "Previous track" })).toBeTruthy();
    expect(slot.getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(slot.getByRole("button", { name: "Next track" })).toBeTruthy();
  });

  it("sends the unrounded shown time on pause", async () => {
    const control = vi.fn<ControlHandler>(() => null);
    const { slot } = await renderBanner(() => playing(), { control });

    // renderBanner advances 50 ms, so 150 ms more reaches the first 200 ms tick.
    await advance(150);
    expect(slot.getByText("0:42 / 3:33")).toBeTruthy();
    fireEvent.click(slot.getByRole("button", { name: "Pause" }));
    await settle();

    expect(control).toHaveBeenCalledWith({ action: "pause", position: 42.2 });
  });

  it("shows no message when a control fails", async () => {
    const control = vi.fn<ControlHandler>(() => Promise.reject(new Error("offline")));
    const { slot } = await renderBanner(() => playing(), { control });

    fireEvent.click(slot.getByRole("button", { name: "Pause" }));
    // The optimistic pause snaps back; the banner has no room for an error line.
    expect(slot.getByRole("button", { name: "Play" })).toBeTruthy();
    await settle();

    expect(slot.getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(slot.queryByRole("status")).toBeNull();
    expect(slot.container.textContent).not.toContain("Couldn't");
  });

  it("does not take focus from the prompt box on pointer down", async () => {
    const prompt = document.createElement("textarea");
    document.body.append(prompt);
    prompt.focus();

    const { slot } = await renderBanner(() => playing());
    const record = slot.getByRole("button", { name: "Open in Sonora (Spotify)" });

    expect(fireEvent.pointerDown(banner(slot))).toBe(false);
    expect(fireEvent.mouseDown(record)).toBe(false);
    expect(document.activeElement).toBe(prompt);

    prompt.remove();
  });
});

function renderMarquee(text: string) {
  const view = render(<MarqueeText text={text} />);
  const line = view.container.querySelector("p");
  if (line === null) throw new Error("marquee line was not rendered");
  return { view, line, truncated: view.getByTitle(text) };
}

/** Report the line as wider than the box so hover scrolling is enabled. */
function mockOverflow(element: HTMLElement): void {
  Object.defineProperty(element, "scrollWidth", {
    configurable: true,
    value: 200,
  });
  Object.defineProperty(element, "clientWidth", {
    configurable: true,
    value: 100,
  });
}

describe("now-playing banner marquee", () => {
  it("scrolls only while hovered", () => {
    const text = "A very long track title";
    const { view, line, truncated } = renderMarquee(text);
    mockOverflow(truncated);

    fireEvent.mouseEnter(line);
    expect(view.queryByTitle(text)).toBeNull();
    expect(view.container.querySelector(".inline-flex")).not.toBeNull();

    fireEvent.mouseLeave(line);
    expect(view.getByTitle(text)).toBeTruthy();
    expect(view.container.querySelector(".inline-flex")).toBeNull();

    view.unmount();
  });

  it.each([
    { copyWidth: 300, duration: "7500ms" },
    { copyWidth: 900, duration: "22500ms" },
  ])(
    "scrolls a $copyWidth px line at the same constant speed",
    ({ copyWidth, duration }) => {
      const { view, line, truncated } = renderMarquee("A very long track title");
      mockOverflow(truncated);
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
        new DOMRect(0, 0, copyWidth * 2, 0),
      );

      fireEvent.mouseEnter(line);
      const track = view.container.querySelector<HTMLElement>(".inline-flex");
      expect(track?.style.animationDuration).toBe(duration);

      view.unmount();
    },
  );

  it("fades a clipped line instead of an ellipsis", () => {
    const text = "A very long track title";
    const { view, line, truncated } = renderMarquee(text);
    // The line clips cleanly, and a line that fits gets no fade.
    expect(truncated.className).toBe("block overflow-hidden");
    expect(line.className).not.toContain("sonora-marquee-fade");

    mockOverflow(truncated);
    // A prop change re-measures the line and turns the fade on.
    view.rerender(<MarqueeText text={`${text} `} />);

    expect(line.className).toContain("sonora-marquee-fade");

    view.unmount();
  });
});

describe("now-playing banner run grace", () => {
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

describe("now-playing banner lava palette", () => {
  it("takes the palette from a readable cover and switches it with the track once sampled", async () => {
    let current = playing({
      track: track({
        id: "track-a",
        cover: "https://example.test/cover-a.jpg",
      }),
    });
    vi.mocked(lavaSources.sample).mockResolvedValue([coverColor(1, 2, 3)]);

    const { slot } = await renderBanner(() => current);

    const firstTrack = bandedPalette([coverColor(1, 2, 3)], "light");
    expect(lavaPalette(slot)).toEqual(firstTrack);
    expect(lavaSeed(slot)).toBe("track-a");
    expect(vi.mocked(lavaSources.sample)).toHaveBeenCalledWith(
      "https://example.test/cover-a.jpg",
    );

    let resolveSample: (colors: CoverColor[]) => void = () => {};
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
    expect(lavaPalette(slot)).toEqual(firstTrack);

    resolveSample([coverColor(4, 5, 6)]);
    await settle();
    await advance(50);

    expect(lavaSeed(slot)).toBe("track-b");
    expect(lavaPalette(slot)).toEqual(bandedPalette([coverColor(4, 5, 6)], "light"));
    expect(vi.mocked(lavaSources.sample)).toHaveBeenCalledWith(
      "https://example.test/cover-b.jpg",
    );
  });

  it("falls back to theme colors when the cover is missing", async () => {
    const { slot } = await renderBanner(() => playing({ track: track({ cover: null }) }));

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

    const { slot } = await renderBanner(() => playing());

    expect(vi.mocked(lavaSources.sample)).toHaveBeenCalled();
    expect(lavaPalette(slot)).toEqual(["rgb(30 40 50)"]);
  });

  it("follows bb's theme live while using the theme fallback", async () => {
    const { slot } = await renderBanner(() => playing({ track: track({ cover: null }) }));
    expect(lavaPalette(slot)).toEqual(["rgb(30 40 50)"]);

    vi.mocked(lavaSources.theme).mockReturnValue(["rgb(200 210 220)"]);
    // A page-title change is not a theme change.
    document.title = "Another thread";
    await settle();
    await advance(50);
    expect(lavaPalette(slot)).toEqual(["rgb(30 40 50)"]);

    await setCodeTheme({ mode: "dark", name: "pierre-dark" });
    await settle();
    await advance(50);
    expect(lavaPalette(slot)).toEqual(["rgb(200 210 220)"]);
  });

  it("re-bands cover colors when bb's theme changes without re-sampling", async () => {
    vi.mocked(lavaSources.sample).mockResolvedValue([coverColor(1, 2, 3)]);
    const { slot } = await renderBanner(() => playing());

    const light = bandedPalette([coverColor(1, 2, 3)], "light");
    expect(lavaPalette(slot)).toEqual(light);
    const seed = lavaSeed(slot);
    expect(vi.mocked(lavaSources.sample)).toHaveBeenCalledTimes(1);

    await setCodeTheme({ mode: "dark", name: "pierre-dark" });
    await settle();
    await advance(50);

    const dark = bandedPalette([coverColor(1, 2, 3)], "dark");
    expect(dark).not.toEqual(light);
    expect(lavaPalette(slot)).toEqual(dark);
    expect(lavaSeed(slot)).toBe(seed);
    expect(vi.mocked(lavaSources.sample)).toHaveBeenCalledTimes(1);
  });
});

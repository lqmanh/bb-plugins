// @vitest-environment jsdom
import { act, fireEvent } from "@testing-library/react";
import {
  loadPluginApp,
  renderSlot,
  type CapturedPluginApp,
  type RenderedSlot,
} from "@get-bb/plugin-sdk/testing/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import app from "../../src/app/index.tsx";
import {
  NOW_PLAYING_TICK_MS,
  SONORA_ICONS,
} from "../../src/app/constants.ts";
import {
  NOW_PLAYING_RPC_TAG,
  emptyNowPlaying,
  nowPlayingRpcContract,
  type NowPlaying,
} from "../../src/shared/now-playing.ts";
import {
  nowPlaying as baseNowPlaying,
  track,
} from "../support/fixtures.ts";

const CLIENT_START = 1_700_000_000_000;

let receivedAtCounter = 10_000;
let slots: RenderedSlot[] = [];

function nextReceivedAt(): number {
  receivedAtCounter += 1;
  return receivedAtCounter;
}

function playing(overrides: Partial<NowPlaying> = {}): NowPlaying {
  return { ...baseNowPlaying(), receivedAt: nextReceivedAt(), ...overrides };
}

type RpcHandler = () => NowPlaying | Promise<NowPlaying>;

type DisclosureRegistration = Extract<
  CapturedPluginApp["experimentalSidebarFooterItems"][number],
  { kind: "disclosure" }
>;

interface RenderedDisclosure {
  slot: RenderedSlot;
  registration: DisclosureRegistration;
}

async function renderDisclosure(
  nowPlaying: RpcHandler,
): Promise<RenderedDisclosure> {
  const captured = await loadPluginApp(app);
  const registration = captured.experimentalSidebarFooterItems.find(
    (item): item is DisclosureRegistration =>
      item.id === "now-playing" && item.kind === "disclosure",
  );
  if (registration === undefined) {
    throw new Error("now-playing disclosure was not registered");
  }

  const slot = renderSlot(
    registration,
    { dismiss: vi.fn() },
    {
      rpc: { nowPlaying },
      experimental_rpcContract: nowPlayingRpcContract,
    },
  );
  slots.push(slot);
  await settle();
  return { slot, registration };
}

/** Let the query's promise chain, scheduler timers, and React effects settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

function sonoraGlyph(slot: RenderedSlot): Element | null {
  return slot.container.querySelector(
    `[data-icon="${SONORA_ICONS.audioLines}"]`,
  );
}

function backdropImages(slot: RenderedSlot): HTMLImageElement[] {
  const backdrop = slot.container.querySelector(
    "[data-sonora-backdrop-layer]",
  );
  if (backdrop === null) return [];
  return Array.from(backdrop.querySelectorAll("img"));
}

function backdropCovers(slot: RenderedSlot): string[] {
  return backdropImages(slot).map(
    (image) => image.getAttribute("src") ?? "",
  );
}

function expectPlaybackTime(
  slot: RenderedSlot,
  position: string,
  duration: string,
): void {
  expect(slot.getByText(position)).toBeTruthy();
  expect(slot.getByText(duration)).toBeTruthy();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(CLIENT_START);
});

afterEach(() => {
  for (const slot of slots.splice(0)) slot.unmount();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Sonora sidebar footer disclosure", () => {
  it("shows a quiet loading row before the first snapshot arrives", async () => {
    const { slot } = await renderDisclosure(() => new Promise(() => {}));

    expect(slot.getByRole("status").textContent).toMatch(/loading/i);
    expect(backdropCovers(slot)).toEqual([]);
  });

  it("shows a short error with a retry when the first read fails", async () => {
    let failFirstRead = true;
    const { slot } = await renderDisclosure(() => {
      if (failFirstRead) {
        failFirstRead = false;
        throw new Error("offline");
      }
      return playing();
    });

    expect(slot.getByRole("alert").textContent).toContain(
      "Couldn't load now playing.",
    );
    expect(backdropCovers(slot)).toEqual([]);
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    await settle();

    expect(slot.getByText("Night Drive")).toBeTruthy();
  });

  it.each([
    {
      name: "unavailable",
      make: () => emptyNowPlaying("unavailable", nextReceivedAt()),
      message: "Can't reach Sonora",
    },
    {
      name: "not-running",
      make: () => emptyNowPlaying("not-running", nextReceivedAt()),
      message: "Sonora is not running",
    },
    {
      name: "running with no track",
      make: () => emptyNowPlaying("running", nextReceivedAt()),
      message: "Nothing playing",
    },
  ])("renders the $name state", async ({ make, message }) => {
    const { slot } = await renderDisclosure(make);

    expect(slot.getByRole("status").textContent).toBe(message);
    expect(backdropCovers(slot)).toEqual([]);
  });

  it("renders a running track", async () => {
    const { slot } = await renderDisclosure(() => playing());

    expect(slot.getByText("Night Drive")).toBeTruthy();
    expect(slot.getByText("A, B")).toBeTruthy();
    expect(slot.getByText("Album")).toBeTruthy();
    expect(slot.getByText("Playing")).toBeTruthy();
    expect(backdropCovers(slot)).toEqual(["https://example.test/cover.jpg"]);

    const [backdropImage] = backdropImages(slot);
    expect(backdropImage?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(backdropImage?.className).not.toContain("sonora-backdrop-in");
  });

  it("interpolates position while playing and clamps it to the duration", async () => {
    const { slot } = await renderDisclosure(() =>
      playing({ position: 210, track: track({ duration: 213 }) }),
    );
    expectPlaybackTime(slot, "3:30", "3:33");

    await advance(NOW_PLAYING_TICK_MS);
    expectPlaybackTime(slot, "3:31", "3:33");
    expect(
      slot.getByRole("progressbar").getAttribute("aria-valuenow"),
    ).toBe("211");

    await advance(4_000);
    expect(slot.getAllByText("3:33")).toHaveLength(2);
    expect(
      slot.getByRole("progressbar").getAttribute("aria-valuenow"),
    ).toBe("213");
  });

  it("freezes the position while paused", async () => {
    const { slot } = await renderDisclosure(() =>
      playing({ state: "paused", position: 42 }),
    );
    expect(slot.getByText("Paused")).toBeTruthy();
    expect(backdropCovers(slot)).toEqual(["https://example.test/cover.jpg"]);

    await advance(5_000);
    expectPlaybackTime(slot, "0:42", "3:33");
  });

  it("keeps the stored anchor across a remount and ignores clock skew", async () => {
    const snapshot = playing({ position: 42 });
    let calls = 0;
    const { slot, registration } = await renderDisclosure(() => {
      calls += 1;
      return calls === 1 ? snapshot : new Promise<NowPlaying>(() => {});
    });
    expectPlaybackTime(slot, "0:42", "3:33");

    await advance(10_000);
    expectPlaybackTime(slot, "0:52", "3:33");

    slot.rerender(null);
    await advance(5_000);
    slot.rerender(<registration.component dismiss={() => {}} />);
    await settle();

    expectPlaybackTime(slot, "0:57", "3:33");
    expect(backdropImages(slot)[0]?.className).not.toContain(
      "sonora-backdrop-in",
    );
  });

  it("refreshes when the snapshot is invalidated", async () => {
    let current = playing({ position: 42 });
    const { slot } = await renderDisclosure(() => current);
    expect(slot.getByText("Night Drive")).toBeTruthy();

    current = playing({
      position: 50,
      track: track({ title: "Other" }),
      receivedAt: nextReceivedAt(),
    });
    await slot.behavior.experimental_invalidateRpc([NOW_PLAYING_RPC_TAG]);
    await settle();

    expect(slot.getByText("Other")).toBeTruthy();
    expectPlaybackTime(slot, "0:50", "3:33");
  });

  it("keeps the last backdrop when a refresh fails", async () => {
    let calls = 0;
    const snapshot = playing({
      track: track({ cover: "https://example.test/cover-a.jpg" }),
    });
    const { slot } = await renderDisclosure(() => {
      calls += 1;
      if (calls === 1) return snapshot;
      throw new Error("offline");
    });
    expect(backdropCovers(slot)).toEqual([
      "https://example.test/cover-a.jpg",
    ]);

    await slot.behavior.experimental_invalidateRpc([NOW_PLAYING_RPC_TAG]);
    await settle();

    expect(slot.queryByRole("alert")).toBeNull();
    expect(slot.getByText("Night Drive")).toBeTruthy();
    expect(backdropCovers(slot)).toEqual([
      "https://example.test/cover-a.jpg",
    ]);
  });

  it("guards a zero duration without dividing by zero", async () => {
    const { slot } = await renderDisclosure(() =>
      playing({ position: 0, track: track({ duration: 0 }) }),
    );

    const progress = slot.getByRole("progressbar");
    expect(progress.getAttribute("aria-valuemin")).toBe("0");
    expect(progress.getAttribute("aria-valuemax")).toBeNull();
    expect(progress.getAttribute("aria-valuenow")).toBeNull();
    expect(progress.firstElementChild?.getAttribute("style")).toContain(
      "width: 0%",
    );
  });

  it("falls back to the Sonora glyph when the cover is missing", async () => {
    const { slot } = await renderDisclosure(() =>
      playing({ track: track({ cover: null }) }),
    );

    expect(slot.queryByRole("img")).toBeNull();
    expect(sonoraGlyph(slot)).not.toBeNull();
    expect(backdropCovers(slot)).toEqual([]);
  });

  it("cross-fades the backdrop when the cover changes", async () => {
    let current = playing({
      track: track({ cover: "https://example.test/cover-a.jpg" }),
    });
    const { slot } = await renderDisclosure(() => current);
    expect(backdropCovers(slot)).toEqual([
      "https://example.test/cover-a.jpg",
    ]);

    current = playing({
      track: track({ cover: "https://example.test/cover-b.jpg" }),
      receivedAt: nextReceivedAt(),
    });
    await slot.behavior.experimental_invalidateRpc([NOW_PLAYING_RPC_TAG]);
    await settle();

    expect(backdropCovers(slot)).toEqual([
      "https://example.test/cover-a.jpg",
      "https://example.test/cover-b.jpg",
    ]);

    const [outgoing, incoming] = backdropImages(slot);
    if (outgoing === undefined || incoming === undefined) {
      throw new Error("expected both backdrop layers");
    }
    expect(outgoing.className).toContain("sonora-backdrop-out");
    expect(incoming.className).toContain("sonora-backdrop-in");
    expect(outgoing.getAttribute("src")).toBe(
      "https://example.test/cover-a.jpg",
    );
    fireEvent.animationEnd(outgoing);
    await act(async () => {});

    expect(backdropCovers(slot)).toEqual([
      "https://example.test/cover-b.jpg",
    ]);
  });

  it("falls back to the Sonora glyph when the cover fails to load", async () => {
    const { slot } = await renderDisclosure(() => playing());

    const image = slot.getByRole("img", { name: "Night Drive cover" });
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(backdropCovers(slot)).toEqual(["https://example.test/cover.jpg"]);

    fireEvent.error(image);
    await act(async () => {});

    expect(slot.queryByRole("img")).toBeNull();
    expect(sonoraGlyph(slot)).not.toBeNull();
    expect(backdropCovers(slot)).toEqual([]);
  });
});

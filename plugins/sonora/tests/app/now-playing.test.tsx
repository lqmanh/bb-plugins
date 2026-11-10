// @vitest-environment jsdom
import { act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  loadPluginApp,
  renderSlot,
  type CapturedPluginApp,
  type PluginRpcTestHandlers,
  type RenderedSlot,
} from "@get-bb/plugin-sdk/testing/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import app from "../../src/app/index.tsx";
import { SONORA_ICONS } from "../../src/app/lib/constants.ts";
import { PLAYBACK_ERROR_CLEAR_MS } from "../../src/app/lib/playback-control.ts";
import {
  NOW_PLAYING_RPC_TAG,
  emptyNowPlaying,
  nowPlayingRpcContract,
  type NowPlaying,
} from "../../src/shared/now-playing.ts";
import {
  BARE_SONORA_CALL,
  nextReceivedAt,
  OPEN_SONORA_CALL,
  playing,
  track,
  type ControlHandler,
  type RpcHandler,
} from "../support/fixtures.ts";
import { advance, backdropCovers, backdropImages, settle } from "../support/render.ts";

const CLIENT_START = 1_700_000_000_000;
const OPEN_SONORA_CASES = [
  { name: "cover", make: () => playing() },
  { name: "placeholder", make: () => playing({ track: track({ cover: null }) }) },
] as const;

let slots: RenderedSlot[] = [];

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
  control: ControlHandler = () => null,
): Promise<RenderedDisclosure> {
  const captured = await loadPluginApp(app);
  const registration = captured.experimentalSidebarFooterItems.find(
    (item): item is DisclosureRegistration =>
      item.id === "now-playing" && item.kind === "disclosure",
  );
  if (registration === undefined) {
    throw new Error("now-playing disclosure was not registered");
  }

  const rpc: PluginRpcTestHandlers<typeof nowPlayingRpcContract> = {
    nowPlaying,
    control,
  };
  const slot = renderSlot(
    registration,
    { dismiss: vi.fn() },
    {
      rpc,
      experimental_rpcContract: nowPlayingRpcContract,
    },
  );
  slots.push(slot);
  await settle();
  return { slot, registration };
}

function sonoraGlyph(slot: RenderedSlot): Element | null {
  return slot.container.querySelector(`[data-icon="${SONORA_ICONS.audioLines}"]`);
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
    expect(backdropCovers(slot.container)).toEqual([]);
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

    expect(slot.getByRole("alert").textContent).toContain("Couldn't load now playing.");
    expect(backdropCovers(slot.container)).toEqual([]);
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
    expect(backdropCovers(slot.container)).toEqual([]);
    // Controls only exist while a track does.
    expect(slot.queryByRole("button")).toBeNull();
    expect(slot.queryByRole("slider")).toBeNull();
  });

  it("renders a running track", async () => {
    const { slot } = await renderDisclosure(() => playing());

    expect(slot.getByText("Night Drive")).toBeTruthy();
    expect(slot.getByText("A, B")).toBeTruthy();
    expect(slot.getByText("Album")).toBeTruthy();
    expect(slot.getByRole("button", { name: "Previous track" })).toBeTruthy();
    expect(slot.getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(slot.getByRole("button", { name: "Next track" })).toBeTruthy();
    expect(
      slot.getByRole("button", { name: "Previous track" }).parentElement?.className,
    ).toContain("justify-center");
    expect(slot.getByRole("slider")).toBeTruthy();
    // The play/pause button owns the state now, not a badge.
    expect(slot.queryByText("Playing")).toBeNull();
    expect(backdropCovers(slot.container)).toEqual(["https://example.test/cover.jpg"]);

    const [backdropImage] = backdropImages(slot.container);
    expect(backdropImage?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(backdropImage?.className).not.toContain("sonora-backdrop-in");
  });

  it.each(OPEN_SONORA_CASES)("opens Sonora from the $name", async ({ make }) => {
    const { slot } = await renderDisclosure(make);
    const button = slot.getByRole("button", { name: "Open in Sonora" });

    expect(button.getAttribute("type")).toBe("button");
    fireEvent.click(button);

    expect(slot.navigateCalls).toEqual([OPEN_SONORA_CALL]);
  });

  it("opens the bare Sonora link when the track has none", async () => {
    const { slot } = await renderDisclosure(() =>
      playing({ track: track({ id: null }) }),
    );

    fireEvent.click(slot.getByRole("button", { name: "Open in Sonora" }));

    expect(slot.navigateCalls).toEqual([BARE_SONORA_CALL]);
  });

  it("activates the cover with Enter and Space", async () => {
    const { slot } = await renderDisclosure(() => playing());
    const button = slot.getByRole("button", { name: "Open in Sonora" });
    vi.useRealTimers();
    const user = userEvent.setup();

    button.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(slot.navigateCalls).toEqual([OPEN_SONORA_CALL, OPEN_SONORA_CALL]);
  });

  it("does not take focus from the prompt on mousedown", async () => {
    const prompt = document.createElement("textarea");
    document.body.append(prompt);
    prompt.focus();
    const { slot } = await renderDisclosure(() => playing());
    const button = slot.getByRole("button", { name: "Open in Sonora" });

    expect(fireEvent.mouseDown(button)).toBe(false);
    expect(document.activeElement).toBe(prompt);

    prompt.remove();
  });

  it.each([
    {
      state: "playing" as const,
      label: "Pause",
      input: { action: "pause", position: 42 },
    },
    {
      state: "loading" as const,
      label: "Pause",
      input: { action: "pause", position: 42 },
    },
    { state: "paused" as const, label: "Play", input: { action: "play" } },
    { state: "idle" as const, label: "Play", input: { action: "play" } },
    { state: "unknown" as const, label: "Play", input: { action: "play" } },
  ])("sends $input.action from the $state state", async ({ state, label, input }) => {
    const control = vi.fn<ControlHandler>(() => null);
    const { slot } = await renderDisclosure(() => playing({ state }), control);

    fireEvent.click(slot.getByRole("button", { name: label }));
    await settle();

    expect(control).toHaveBeenCalledWith(input);
  });

  it("keeps the displayed time steady on a fractional optimistic pause", async () => {
    let release: () => void = () => {};
    const control = vi.fn<ControlHandler>(
      () =>
        new Promise<null>((resolve) => {
          release = () => resolve(null);
        }),
    );
    const { slot } = await renderDisclosure(() => playing({ position: 42 }), control);
    expectPlaybackTime(slot, "0:42", "3:33");

    await advance(1_400);
    expectPlaybackTime(slot, "0:43", "3:33");

    fireEvent.click(slot.getByRole("button", { name: "Pause" }));
    await settle();

    // The snapshot still says 0:42; the optimistic pause keeps the unrounded time.
    expectPlaybackTime(slot, "0:43", "3:33");
    expect(control).toHaveBeenCalledWith({ action: "pause", position: 43.4 });

    release();
    await settle();
    await advance(2_000);
    expectPlaybackTime(slot, "0:43", "3:33");
  });

  it("keeps the controls while a track loads and offers pause", async () => {
    const { slot } = await renderDisclosure(() => playing({ state: "loading" }));

    expect(slot.getByRole("button", { name: "Previous track" })).toBeTruthy();
    expect(slot.getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(slot.getByRole("button", { name: "Next track" })).toBeTruthy();
    expect(slot.getByRole("slider")).toBeTruthy();
  });

  it("switches play/pause optimistically and keeps the confirmed state", async () => {
    let current = playing({ state: "paused", position: 42 });
    let release: () => void = () => {};
    const control = vi.fn<ControlHandler>(
      () =>
        new Promise<null>((resolve) => {
          release = () => resolve(null);
        }),
    );
    const { slot } = await renderDisclosure(() => current, control);

    fireEvent.click(slot.getByRole("button", { name: "Play" }));
    // The optimistic read switches before Sonora confirms it.
    expect(slot.getByRole("button", { name: "Pause" })).toBeTruthy();
    expectPlaybackTime(slot, "0:42", "3:33");
    await settle();
    expect(control).toHaveBeenCalledWith({ action: "play" });

    // Sonora confirms the real state and position; the prediction gives way.
    current = playing({ state: "playing", position: 50 });
    release();
    await settle();
    await slot.behavior.experimental_invalidateRpc([NOW_PLAYING_RPC_TAG]);
    await settle();

    expect(slot.getByRole("button", { name: "Pause" })).toBeTruthy();
    expectPlaybackTime(slot, "0:50", "3:33");
  });

  it("restores the state and names the failed action, then clears it", async () => {
    let failPause = true;
    const control = vi.fn<ControlHandler>(async (input) => {
      if (input.action === "pause" && failPause) throw new Error("offline");
      return null;
    });
    const { slot } = await renderDisclosure(() => playing(), control);

    fireEvent.click(slot.getByRole("button", { name: "Pause" }));
    expect(slot.getByRole("button", { name: "Play" })).toBeTruthy();
    await settle();

    expect(slot.getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(slot.getByRole("status").textContent).toBe("Couldn't pause.");

    // The next action owns the line, so a success clears the old failure.
    failPause = false;
    fireEvent.click(slot.getByRole("button", { name: "Next track" }));
    await settle();
    expect(slot.queryByRole("status")).toBeNull();
  });

  it("clears a failed action after a few seconds", async () => {
    const control = vi.fn<ControlHandler>(() => Promise.reject(new Error("offline")));
    const { slot } = await renderDisclosure(() => playing(), control);

    fireEvent.click(slot.getByRole("button", { name: "Pause" }));
    await settle();
    expect(slot.getByRole("status").textContent).toBe("Couldn't pause.");

    await advance(PLAYBACK_ERROR_CLEAR_MS);
    expect(slot.queryByRole("status")).toBeNull();
  });

  it("jumps to a clicked point and snaps back when the seek fails", async () => {
    let rejectSeek: (error: Error) => void = () => {};
    const control = vi.fn<ControlHandler>(
      () =>
        new Promise<null>((_resolve, reject) => {
          rejectSeek = reject;
        }),
    );
    const { slot } = await renderDisclosure(() => playing({ position: 42 }), control);
    const trackElement = slot.container.querySelector("[data-sonora-seek-track]");
    if (!(trackElement instanceof HTMLElement)) {
      throw new Error("seek track was not rendered");
    }
    vi.spyOn(trackElement, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 0, 200, 4),
    );
    const slider = slot.getByRole("slider");

    fireEvent.pointerDown(slider, { button: 0, clientX: 200 });
    fireEvent.pointerUp(slider);
    await settle();

    expect(control).toHaveBeenCalledWith({ action: "seek", position: 107 });
    expectPlaybackTime(slot, "1:47", "3:33");

    rejectSeek(new Error("offline"));
    await settle();

    expectPlaybackTime(slot, "0:42", "3:33");
    expect(slot.getByRole("status").textContent).toBe("Couldn't seek.");
  });

  it("interpolates position while playing and clamps it to the duration", async () => {
    const { slot } = await renderDisclosure(() =>
      playing({ position: 210, track: track({ duration: 213 }) }),
    );
    expectPlaybackTime(slot, "3:30", "3:33");

    await advance(1_000);
    expectPlaybackTime(slot, "3:31", "3:33");
    expect(slot.getByRole("slider").getAttribute("aria-valuenow")).toBe("211");

    await advance(4_000);
    expect(slot.getAllByText("3:33")).toHaveLength(2);
    expect(slot.getByRole("slider").getAttribute("aria-valuenow")).toBe("213");
  });

  it("freezes the position while paused", async () => {
    const { slot } = await renderDisclosure(() =>
      playing({ state: "paused", position: 42 }),
    );
    expect(slot.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(slot.queryByText("Paused")).toBeNull();
    expect(backdropCovers(slot.container)).toEqual(["https://example.test/cover.jpg"]);

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
    expect(backdropImages(slot.container)[0]?.className).not.toContain(
      "sonora-backdrop-in",
    );
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
    expect(backdropCovers(slot.container)).toEqual(["https://example.test/cover-a.jpg"]);

    await slot.behavior.experimental_invalidateRpc([NOW_PLAYING_RPC_TAG]);
    await settle();

    expect(slot.queryByRole("alert")).toBeNull();
    expect(slot.getByText("Night Drive")).toBeTruthy();
    expect(backdropCovers(slot.container)).toEqual(["https://example.test/cover-a.jpg"]);
  });

  it("hides the seek bar when the duration is zero", async () => {
    const { slot } = await renderDisclosure(() =>
      playing({ position: 0, track: track({ duration: 0 }) }),
    );

    expect(slot.queryByRole("slider")).toBeNull();
    expect(slot.getAllByText("0:00")).toHaveLength(2);
    expect(slot.getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("falls back to the Sonora glyph when the cover is missing", async () => {
    const { slot } = await renderDisclosure(() =>
      playing({ track: track({ cover: null }) }),
    );

    expect(slot.queryByRole("img")).toBeNull();
    expect(sonoraGlyph(slot)).not.toBeNull();
    expect(backdropCovers(slot.container)).toEqual([]);
  });

  it("cross-fades the backdrop when the cover changes", async () => {
    let current = playing({
      track: track({ cover: "https://example.test/cover-a.jpg" }),
    });
    const { slot } = await renderDisclosure(() => current);
    expect(backdropCovers(slot.container)).toEqual(["https://example.test/cover-a.jpg"]);

    current = playing({
      track: track({ cover: "https://example.test/cover-b.jpg" }),
      receivedAt: nextReceivedAt(),
    });
    await slot.behavior.experimental_invalidateRpc([NOW_PLAYING_RPC_TAG]);
    await settle();

    expect(backdropCovers(slot.container)).toEqual([
      "https://example.test/cover-a.jpg",
      "https://example.test/cover-b.jpg",
    ]);

    const [outgoing, incoming] = backdropImages(slot.container);
    if (outgoing === undefined || incoming === undefined) {
      throw new Error("expected both backdrop layers");
    }
    expect(outgoing.className).toContain("sonora-backdrop-out");
    expect(incoming.className).toContain("sonora-backdrop-in");
    expect(outgoing.getAttribute("src")).toBe("https://example.test/cover-a.jpg");
    fireEvent.animationEnd(outgoing);
    await act(async () => {});

    expect(backdropCovers(slot.container)).toEqual(["https://example.test/cover-b.jpg"]);
  });

  it("falls back to the Sonora glyph when the cover fails to load", async () => {
    const { slot } = await renderDisclosure(() => playing());

    const image = slot.getByRole("img", { name: "Night Drive cover" });
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(backdropCovers(slot.container)).toEqual(["https://example.test/cover.jpg"]);

    fireEvent.error(image);
    await act(async () => {});

    expect(slot.queryByRole("img")).toBeNull();
    expect(sonoraGlyph(slot)).not.toBeNull();
    expect(backdropCovers(slot.container)).toEqual([]);
  });
});

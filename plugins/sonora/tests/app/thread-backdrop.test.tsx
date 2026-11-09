// @vitest-environment jsdom
import {
  loadPluginApp,
  renderSlot,
  type RenderedSlot,
} from "@get-bb/plugin-sdk/testing/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import app from "../../src/app/index.tsx";
import {
  NOW_PLAYING_RPC_TAG,
  emptyNowPlaying,
  nowPlayingRpcContract,
} from "../../src/shared/now-playing.ts";
import { nextReceivedAt, playing, track, type RpcHandler } from "../support/fixtures.ts";
import { backdropCovers, settle } from "../support/render.ts";

const THREAD_PANEL_ID = "thread-detail-timeline-panel";
const COMPOSE_PANEL_ID = "root-compose-main-panel";
const ROOT_ATTRIBUTE = "data-sonora-backdrop";

let slots: RenderedSlot[] = [];
let panels: HTMLElement[] = [];

function appendPanel(id: string): HTMLElement {
  const panel = document.createElement("div");
  panel.id = id;
  document.body.append(panel);
  panels.push(panel);
  return panel;
}

async function renderOverlay(
  nowPlaying: RpcHandler,
  settings?: Record<string, string | number | boolean>,
): Promise<RenderedSlot> {
  const captured = await loadPluginApp(app);
  const registration = captured.appOverlays.find(
    (overlay) => overlay.id === "thread-backdrop",
  );
  if (registration === undefined) {
    throw new Error("thread backdrop overlay was not registered");
  }

  const slot = renderSlot(
    registration,
    {},
    {
      rpc: { nowPlaying },
      experimental_rpcContract: nowPlayingRpcContract,
      settings,
      pluginId: "sonora",
    },
  );
  slots.push(slot);
  await settle();
  return slot;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const slot of slots.splice(0)) slot.unmount();
  for (const panel of panels.splice(0)) panel.remove();
  document.documentElement.removeAttribute(ROOT_ATTRIBUTE);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Sonora thread backdrop", () => {
  it("draws nothing while the setting is off", async () => {
    const thread = appendPanel(THREAD_PANEL_ID);
    const compose = appendPanel(COMPOSE_PANEL_ID);

    await renderOverlay(() => playing(), { threadBackdrop: false });

    expect(backdropCovers(thread)).toEqual([]);
    expect(backdropCovers(compose)).toEqual([]);
    expect(document.documentElement.hasAttribute(ROOT_ATTRIBUTE)).toBe(false);
  });

  it("draws the cover in both panels when the setting is on", async () => {
    const thread = appendPanel(THREAD_PANEL_ID);
    const compose = appendPanel(COMPOSE_PANEL_ID);

    await renderOverlay(() => playing(), { threadBackdrop: true });

    expect(backdropCovers(thread)).toEqual(["https://example.test/cover.jpg"]);
    expect(backdropCovers(compose)).toEqual(["https://example.test/cover.jpg"]);
    expect(
      thread.querySelector(".sonora-surface-backdrop")?.getAttribute("data-bb-plugin"),
    ).toBe("sonora");
    expect(document.documentElement.hasAttribute(ROOT_ATTRIBUTE)).toBe(true);
  });

  it.each([
    {
      name: "the cover is missing",
      make: () => playing({ track: track({ cover: null }) }),
    },
    {
      name: "there is no track",
      make: () => emptyNowPlaying("running", nextReceivedAt()),
    },
    {
      name: "Sonora is not running",
      make: () => emptyNowPlaying("not-running", nextReceivedAt()),
    },
  ])("draws nothing when $name", async ({ make }) => {
    const thread = appendPanel(THREAD_PANEL_ID);
    const compose = appendPanel(COMPOSE_PANEL_ID);

    await renderOverlay(make, { threadBackdrop: true });

    expect(backdropCovers(thread)).toEqual([]);
    expect(backdropCovers(compose)).toEqual([]);
    expect(document.documentElement.hasAttribute(ROOT_ATTRIBUTE)).toBe(false);
  });

  it("ends the backdrop at the composer overflow fade", async () => {
    const thread = appendPanel(THREAD_PANEL_ID);
    const footer = document.createElement("div");
    footer.dataset.scrollFooter = "";
    const composer = document.createElement("div");
    composer.className = "relative shrink-0 bg-background";
    const fade = document.createElement("div");
    fade.dataset.overflowFade = "above";
    composer.append(fade);
    footer.append(composer);
    thread.append(footer);

    vi.spyOn(thread, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 100, 1_000, 800),
    );
    vi.spyOn(fade, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 650, 1_000, 24),
    );

    await renderOverlay(() => playing(), { threadBackdrop: true });

    const wrapper = thread.querySelector<HTMLElement>(".sonora-surface-backdrop");
    expect(wrapper?.style.getPropertyValue("--sonora-surface-backdrop-bottom")).toBe(
      "250px",
    );
  });

  it("swaps the cover when the track changes", async () => {
    const thread = appendPanel(THREAD_PANEL_ID);
    let current = playing({
      track: track({ cover: "https://example.test/cover-a.jpg" }),
    });
    const slot = await renderOverlay(() => current, { threadBackdrop: true });
    expect(backdropCovers(thread)).toEqual(["https://example.test/cover-a.jpg"]);

    current = playing({
      track: track({ cover: "https://example.test/cover-b.jpg" }),
    });
    await slot.behavior.experimental_invalidateRpc([NOW_PLAYING_RPC_TAG]);
    await settle();

    expect(backdropCovers(thread).sort()).toEqual([
      "https://example.test/cover-a.jpg",
      "https://example.test/cover-b.jpg",
    ]);
  });

  it("follows a panel bb recreates", async () => {
    const thread = appendPanel(THREAD_PANEL_ID);
    await renderOverlay(() => playing(), { threadBackdrop: true });
    expect(backdropCovers(thread)).toEqual(["https://example.test/cover.jpg"]);

    thread.remove();
    const recreated = appendPanel(THREAD_PANEL_ID);
    await settle();

    expect(backdropCovers(recreated)).toEqual(["https://example.test/cover.jpg"]);
    expect(document.documentElement.hasAttribute(ROOT_ATTRIBUTE)).toBe(true);
  });

  it("removes the backdrop, clears the attribute, and stops observing on unmount", async () => {
    const thread = appendPanel(THREAD_PANEL_ID);
    const compose = appendPanel(COMPOSE_PANEL_ID);
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const slot = await renderOverlay(() => playing(), { threadBackdrop: true });
    expect(backdropCovers(thread)).toEqual(["https://example.test/cover.jpg"]);
    expect(backdropCovers(compose)).toEqual(["https://example.test/cover.jpg"]);

    slot.unmount();
    slots = slots.filter((entry) => entry !== slot);
    expect(document.querySelector("[data-sonora-backdrop-layer]")).toBeNull();
    expect(document.documentElement.hasAttribute(ROOT_ATTRIBUTE)).toBe(false);
    expect(disconnect).toHaveBeenCalled();

    thread.remove();
    const recreated = appendPanel(THREAD_PANEL_ID);
    await settle();

    expect(backdropCovers(recreated)).toEqual([]);
  });
});

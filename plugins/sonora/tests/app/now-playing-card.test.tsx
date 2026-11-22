// @vitest-environment jsdom
import { loadPluginApp, type RenderedSlot } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import app from "../../src/app/index.tsx";
import { setDebugMode } from "../../src/app/lib/debug.ts";
import { playing } from "../support/fixtures.ts";
import { backdropCovers } from "../support/render.ts";
import { renderNowPlayingSlot, unmountSlots } from "../support/slot.ts";

async function renderCard(
  settings: Record<string, boolean>,
  isRunning = true,
): Promise<RenderedSlot> {
  const captured = await loadPluginApp(app);
  const registration = captured.threadContextCardSections.find(
    (entry) => entry.id === "now-playing",
  );
  if (registration === undefined) {
    throw new Error("now-playing card section was not registered");
  }
  return renderNowPlayingSlot(
    registration,
    { threadId: "thread-1", projectId: "project-1", environment: null },
    {
      nowPlaying: () => playing(),
      settings,
      composer: { scope: { kind: "thread", threadId: "thread-1" }, isRunning },
    },
  );
}

beforeEach(() => {
  setDebugMode(false);
  vi.useFakeTimers();
});

afterEach(() => {
  unmountSlots();
  vi.useRealTimers();
});

// The player itself is covered in now-playing-body.test.tsx.
describe("Sonora thread context card", () => {
  it("renders nothing when the context card setting is off", async () => {
    const slot = await renderCard({ contextCard: false });

    expect(slot.container.textContent).toBe("");
  });

  it("shows the player on the card surface, whatever the banner and agent do", async () => {
    const slot = await renderCard({ contextCard: true, composerBanner: false }, false);

    expect(slot.getByText("Night Drive")).toBeTruthy();
    const body = slot.container.firstElementChild as HTMLElement | null;
    expect(body?.classList.contains("rounded-md")).toBe(true);
    expect(body?.classList.contains("border")).toBe(true);
    expect(body?.classList.contains("border-border")).toBe(true);
    expect(body?.style.getPropertyValue("--sonora-backdrop-wash-color")).toBe(
      "var(--popover)",
    );
  });

  it("renders no lava canvas when the lamp is off", async () => {
    const slot = await renderCard({ contextCard: true, lavaLamp: false });

    expect(slot.container.querySelector("canvas")).toBeNull();
    expect(backdropCovers(slot.container)).toEqual(["https://example.test/cover.jpg"]);
  });
});

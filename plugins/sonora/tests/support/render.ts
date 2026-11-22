import { act } from "@testing-library/react";
import { vi } from "vitest";

/** Let the query's promise chain, scheduler timers, and React effects settle. */
export async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

export async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

export function backdropImages(container: ParentNode): HTMLImageElement[] {
  const backdrop = container.querySelector("[data-sonora-backdrop-layer]");
  if (backdrop === null) return [];
  return Array.from(backdrop.querySelectorAll("img"));
}

export function backdropCovers(container: ParentNode): string[] {
  return backdropImages(container).map((image) => image.getAttribute("src") ?? "");
}

export function cover(container: ParentNode): Element {
  const element = container.querySelector("[data-sonora-cover]");
  if (element === null) throw new Error("the cover was not rendered");
  return element;
}

/** Pin a slider track's width so pointer math is deterministic. */
export function mockBarTrack(root: ParentNode): HTMLElement {
  const track = root.querySelector(".sonora-slider-track");
  if (!(track instanceof HTMLElement)) throw new Error("slider track was not rendered");
  vi.spyOn(track, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 0, 200, 4));
  return track;
}

// @vitest-environment jsdom
import { fireEvent, render, within } from "@testing-library/react";
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlaybackControls } from "../../src/app/components/playback-controls.tsx";
import {
  KEY_SEEK_DEBOUNCE_MS,
  SeekBar,
  type SeekBarProps,
} from "../../src/app/components/seek-bar.tsx";
import { advance } from "../support/render.ts";

beforeEach(() => {
  installTestPluginRuntime();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("PlaybackControls", () => {
  it.each([
    { state: "playing" as const, name: "Previous track", input: { action: "prev" } },
    {
      state: "playing" as const,
      name: "Pause",
      input: { action: "pause", position: 42 },
    },
    { state: "playing" as const, name: "Next track", input: { action: "next" } },
    {
      state: "loading" as const,
      name: "Pause",
      input: { action: "pause", position: 42 },
    },
    { state: "paused" as const, name: "Play", input: { action: "play" } },
    { state: "idle" as const, name: "Play", input: { action: "play" } },
    { state: "unknown" as const, name: "Play", input: { action: "play" } },
    { state: null, name: "Play", input: { action: "play" } },
  ])("sends $input.action from the $state state", ({ state, name, input }) => {
    const control = vi.fn();
    const view = render(
      <PlaybackControls state={state} position={42} control={control} />,
    );

    fireEvent.click(within(view.container).getByRole("button", { name }));

    expect(control).toHaveBeenCalledWith(input);
    view.unmount();
  });

  it("keeps all three controls while a track is loading", () => {
    const view = render(
      <PlaybackControls state="loading" position={42} control={() => {}} />,
    );

    expect(
      within(view.container).getByRole("button", { name: "Previous track" }),
    ).toBeTruthy();
    expect(within(view.container).getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(
      within(view.container).getByRole("button", { name: "Next track" }),
    ).toBeTruthy();
    view.unmount();
  });

  it("does not take focus on mousedown", () => {
    const prompt = document.createElement("textarea");
    document.body.append(prompt);
    prompt.focus();
    const view = render(
      <PlaybackControls state="playing" position={0} control={() => {}} />,
    );

    expect(
      fireEvent.mouseDown(within(view.container).getByRole("button", { name: "Pause" })),
    ).toBe(false);
    expect(document.activeElement).toBe(prompt);

    prompt.remove();
    view.unmount();
  });
});

function renderSeekBar(overrides: Partial<SeekBarProps> = {}) {
  const onSeek = vi.fn();
  const onScrub = vi.fn();
  const view = render(
    <SeekBar
      current={30}
      duration={100}
      onSeek={onSeek}
      onScrub={onScrub}
      {...overrides}
    />,
  );
  const slider = within(view.container).getByRole("slider");
  const track = view.container.querySelector("[data-sonora-seek-track]");
  if (!(track instanceof HTMLElement)) {
    throw new Error("seek track was not rendered");
  }
  vi.spyOn(track, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 0, 200, 12));
  return { view, slider, track, onSeek, onScrub };
}

describe("SeekBar", () => {
  it.each([
    { clientX: 100, seconds: 0 },
    { clientX: 150, seconds: 25 },
    { clientX: 300, seconds: 100 },
  ])("maps a click at $clientX px to $seconds seconds", ({ clientX, seconds }) => {
    const { slider, onSeek } = renderSeekBar();

    fireEvent.pointerDown(slider, { button: 0, clientX });
    fireEvent.pointerUp(slider);

    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(seconds);
  });

  it("scrubs while dragging and sends one seek on release", () => {
    const { slider, onSeek, onScrub } = renderSeekBar();

    fireEvent.pointerDown(slider, { button: 0, clientX: 120 });
    expect(onScrub).toHaveBeenLastCalledWith(10);
    fireEvent.pointerMove(window, { clientX: 220 });
    expect(onSeek).not.toHaveBeenCalled();
    expect(slider.getAttribute("aria-valuetext")).toBe("1:00");

    fireEvent.pointerUp(window, { clientX: 220 });

    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(60);
    expect(onScrub).toHaveBeenLastCalledWith(null);
    expect(slider.getAttribute("aria-valuetext")).toBe("0:30");
  });

  it("sends nothing when a drag is cancelled", () => {
    const { slider, onSeek } = renderSeekBar();

    fireEvent.pointerDown(slider, { button: 0, clientX: 150 });
    fireEvent.pointerCancel(window);

    expect(onSeek).not.toHaveBeenCalled();
    expect(slider.getAttribute("aria-valuetext")).toBe("0:30");
  });

  it("clamps a backward arrow at 0:00", async () => {
    const { slider, onSeek } = renderSeekBar({ current: 2 });

    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(slider.getAttribute("aria-valuetext")).toBe("0:00");
    expect(onSeek).not.toHaveBeenCalled();
    await advance(KEY_SEEK_DEBOUNCE_MS);
    expect(onSeek).toHaveBeenLastCalledWith(0);
  });

  it("seeks five seconds per arrow key and clamps at the end", async () => {
    const { slider, onSeek } = renderSeekBar({ current: 98 });

    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider.getAttribute("aria-valuetext")).toBe("1:40");
    await advance(KEY_SEEK_DEBOUNCE_MS);
    expect(onSeek).toHaveBeenLastCalledWith(100);
  });

  it("sends one seek 200 ms after the last repeated key", async () => {
    const { slider, onSeek } = renderSeekBar();

    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    await advance(KEY_SEEK_DEBOUNCE_MS - 100);
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    await advance(KEY_SEEK_DEBOUNCE_MS - 100);

    expect(onSeek).not.toHaveBeenCalled();
    await advance(100);
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(40);
  });

  it("seeks Home to 0:00 and End to the duration", async () => {
    const { slider, onSeek } = renderSeekBar({ current: 55 });

    slider.focus();
    fireEvent.keyDown(slider, { key: "Home" });
    await advance(KEY_SEEK_DEBOUNCE_MS);
    expect(onSeek).toHaveBeenLastCalledWith(0);

    fireEvent.keyDown(slider, { key: "End" });
    await advance(KEY_SEEK_DEBOUNCE_MS);
    expect(onSeek).toHaveBeenLastCalledWith(100);
  });

  it("sets the slider attributes from the current position", () => {
    const { slider } = renderSeekBar({ current: 30, duration: 213 });

    expect(slider.getAttribute("aria-valuemin")).toBe("0");
    expect(slider.getAttribute("aria-valuemax")).toBe("213");
    expect(slider.getAttribute("aria-valuenow")).toBe("30");
    expect(slider.getAttribute("aria-valuetext")).toBe("0:30");
    expect(slider.getAttribute("tabindex")).toBe("0");
  });

  it("thickens, shows a knob, and labels the time under the pointer on hover", () => {
    const { slider, track } = renderSeekBar();
    // The track, not the surface-owned root, anchors the knob and label.
    expect(track.className).toContain("relative");
    expect(track.style.height).toBe("2px");
    expect(slider.querySelector("[data-sonora-seek-knob]")).toBeNull();

    fireEvent.pointerMove(slider, { clientX: 150 });

    expect(track.style.height).toBe("4px");
    expect(slider.querySelector("[data-sonora-seek-knob]")).not.toBeNull();
    expect(slider.querySelector("[data-sonora-seek-label]")?.textContent).toBe("0:25");

    fireEvent.pointerLeave(slider);
    expect(track.style.height).toBe("2px");
    expect(slider.querySelector("[data-sonora-seek-knob]")).toBeNull();
    expect(slider.querySelector("[data-sonora-seek-label]")).toBeNull();
  });

  it("eases clock corrections but follows scrubbing instantly", () => {
    const { slider } = renderSeekBar();
    const fill = slider.querySelector(".sonora-seek-fill");
    if (!(fill instanceof HTMLElement)) throw new Error("seek fill was not rendered");
    expect(fill.className).toContain("sonora-seek-ease-fill");

    fireEvent.pointerMove(slider, { clientX: 150 });
    expect(slider.querySelector("[data-sonora-seek-knob]")?.className).toContain(
      "sonora-seek-ease-knob",
    );

    fireEvent.pointerDown(slider, { button: 0, clientX: 150 });
    expect(fill.className).not.toContain("sonora-seek-ease-fill");
    expect(slider.querySelector("[data-sonora-seek-knob]")?.className).not.toContain(
      "sonora-seek-ease-knob",
    );

    fireEvent.pointerUp(window);
    expect(fill.className).toContain("sonora-seek-ease-fill");

    // The keyboard preview also tracks each press without a transition.
    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(fill.className).not.toContain("sonora-seek-ease-fill");
    expect(slider.querySelector("[data-sonora-seek-knob]")?.className).not.toContain(
      "sonora-seek-ease-knob",
    );
  });

  it("does not take focus on mousedown or drag", () => {
    const prompt = document.createElement("textarea");
    document.body.append(prompt);
    prompt.focus();
    const { slider } = renderSeekBar();

    expect(fireEvent.mouseDown(slider)).toBe(false);
    fireEvent.pointerDown(slider, { button: 0, clientX: 150 });
    expect(document.activeElement).toBe(prompt);
    fireEvent.pointerUp(window);

    prompt.remove();
  });

  it("renders nothing without a duration", () => {
    const view = render(<SeekBar current={0} duration={0} onSeek={() => {}} />);
    expect(view.container.firstChild).toBeNull();
  });
});

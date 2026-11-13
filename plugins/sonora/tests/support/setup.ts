import { afterEach } from "vitest";

import { fakeMatchMedia, setPrefersReducedMotion } from "./media.ts";

/**
 * Real bb always provides these; jsdom does not. Stub them once for every test
 * file instead of keeping feature guards in the app.
 */
class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
}

function fakeAnimation(): Animation {
  const animation = {
    playbackRate: 1,
    playState: "running",
    pause() {
      animation.playState = "paused";
    },
    play() {
      animation.playState = "running";
    },
    cancel() {
      animation.playState = "idle";
    },
  };
  return animation as unknown as Animation;
}

if (typeof Element !== "undefined" && typeof Element.prototype.animate !== "function") {
  Element.prototype.animate = () => fakeAnimation();
}

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = fakeMatchMedia;
}

afterEach(() => {
  setPrefersReducedMotion(false);
});

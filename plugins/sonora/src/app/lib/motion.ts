import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";

/** How long a running animation takes to ease to a stop, and back up again. */
const MOTION_EASE_MS = 1_000;

let pageVisible =
  typeof document === "undefined" ? true : document.visibilityState !== "hidden";
const pageVisibleListeners = new Set<() => void>();

function subscribePageVisible(listener: () => void): () => void {
  pageVisibleListeners.add(listener);
  return () => pageVisibleListeners.delete(listener);
}

function getPageVisible(): boolean {
  return pageVisible;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    const next = document.visibilityState !== "hidden";
    if (next === pageVisible) return;
    pageVisible = next;
    for (const listener of pageVisibleListeners) listener();
  });
}

/** Whether the page is visible, shared by every motion subscriber. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribePageVisible, getPageVisible, () => true);
}

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

let reducedMotionQuery: MediaQueryList | null = null;

function getReducedMotionQuery(): MediaQueryList {
  reducedMotionQuery ??= window.matchMedia(REDUCED_MOTION_QUERY);
  return reducedMotionQuery;
}

function subscribeReducedMotion(listener: () => void): () => void {
  const query = getReducedMotionQuery();
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => getReducedMotionQuery().matches,
    () => false,
  );
}

/**
 * Play an infinite keyframe animation at full speed while `active`, easing its
 * playback rate to a stop (and back up) so motion settles over about a second
 * instead of freezing mid-frame.
 */
export function useEasedAnimation(
  elementRef: RefObject<HTMLElement | null>,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
  active: boolean,
): void {
  const animationRef = useRef<Animation | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (element === null) return;

    const animation = element.animate(keyframes, options);
    animationRef.current = animation;
    if (!active) {
      animation.playbackRate = 0;
      animation.pause();
    }

    return () => {
      animationRef.current = null;
      animation.cancel();
    };
    // `active` is handled by the rate effect below; creating again on every
    // pause would restart the animation from the top.
  }, [elementRef, keyframes, options]);

  useEffect(() => {
    const animation = animationRef.current;
    if (animation === null || animation.playState === "idle") return;

    if (active && animation.playState === "paused") animation.play();

    const target = active ? 1 : 0;
    if (animation.playbackRate === target) return;

    const startRate = animation.playbackRate;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / MOTION_EASE_MS);
      const eased = 1 - (1 - progress) ** 2;
      animation.playbackRate = startRate + (target - startRate) * eased;

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }

      if (!active) {
        animation.playbackRate = 0;
        animation.pause();
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, keyframes, options]);
}

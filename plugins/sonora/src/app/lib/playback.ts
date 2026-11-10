import { useEffect, useState } from "react";

export { formatTime } from "../../shared/time.ts";

/** How often the shared client-side playback clock advances. */
export const NOW_PLAYING_TICK_MS = 200;

/**
 * Client arrival time of the current snapshot, keyed by the server's
 * `receivedAt`. It lives outside the component because surfaces unmount while
 * closed: a per-mount anchor would jump the position forward on every reopen.
 */
let arrivalAnchor: { receivedAt: number; arrivedAt: number } | null = null;

function clientArrivedAt(receivedAt: number): number {
  if (arrivalAnchor?.receivedAt !== receivedAt) {
    arrivalAnchor = { receivedAt, arrivedAt: Date.now() };
  }
  return arrivalAnchor.arrivedAt;
}

function displayPosition(
  isPlaying: boolean,
  basePosition: number | null,
  duration: number,
  clientNow: number,
  arrivedAt: number,
): number {
  const base = basePosition ?? 0;
  const elapsed = isPlaying ? Math.max(0, (clientNow - arrivedAt) / 1_000) : 0;
  // Sonora reports whole seconds, so the client clock only fills the gaps.
  return Math.min(duration, base + elapsed);
}

function useClientClock(isPlaying: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(() => setNow(Date.now()), NOW_PLAYING_TICK_MS);
    return () => clearInterval(timer);
  }, [isPlaying]);

  return now;
}

/** The shared client-side playback clock used by every now-playing surface. */
export function usePlaybackPosition(
  isPlaying: boolean,
  position: number | null,
  duration: number,
  receivedAt: number,
): number {
  const clock = useClientClock(isPlaying && duration > 0);
  const arrivedAt = clientArrivedAt(receivedAt);
  return displayPosition(isPlaying, position, duration, clock, arrivedAt);
}

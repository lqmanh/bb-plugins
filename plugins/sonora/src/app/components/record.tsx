import { useRef, type ReactNode } from "react";

import { useEasedAnimation, usePageVisible } from "../lib/motion.ts";

const RECORD_KEYFRAMES: Keyframe[] = [
  { transform: "rotate(0deg)" },
  { transform: "rotate(360deg)" },
];
const RECORD_OPTIONS: KeyframeAnimationOptions = {
  duration: 10_000,
  iterations: Infinity,
  easing: "linear",
};

/**
 * The cover as a rotating disc. Only the disc turns; the sheen, the outer rim
 * and the center hole stay still on top, the way light sits on a real record.
 * The hole is cut out with a mask (`.sonora-record` in app.css), so whatever
 * is behind the record shows through it.
 */
export function Record({
  cover,
  playing,
  fallback,
  onCoverError,
}: {
  cover: string | null;
  playing: boolean;
  fallback?: ReactNode;
  onCoverError?: () => void;
}) {
  const discRef = useRef<HTMLDivElement>(null);
  const pageVisible = usePageVisible();

  useEasedAnimation(discRef, RECORD_KEYFRAMES, RECORD_OPTIONS, playing && pageVisible);

  return (
    <div
      aria-hidden="true"
      data-sonora-record={playing ? "playing" : "paused"}
      className="sonora-record relative size-7 shrink-0 overflow-hidden rounded-full"
    >
      <div
        ref={discRef}
        data-sonora-record-disc=""
        className="absolute inset-0 rounded-full"
      >
        {cover === null ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-muted text-subtle-foreground">
            {fallback}
          </span>
        ) : (
          <img
            src={cover}
            alt=""
            draggable={false}
            referrerPolicy="no-referrer"
            onError={onCoverError}
            className="size-full rounded-full object-cover"
          />
        )}
      </div>
      {cover === null ? null : (
        <span
          data-sonora-record-sheen=""
          className="sonora-record-sheen pointer-events-none absolute inset-0 rounded-full"
        />
      )}
      <span
        data-sonora-record-rim=""
        className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-card-foreground/20"
      />
      <span
        data-sonora-record-hole=""
        className="absolute left-1/2 top-1/2 size-[var(--sonora-record-hole)] -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-card-foreground/20"
      />
    </div>
  );
}

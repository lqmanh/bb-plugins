import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { FOCUS_RING_CLASS_NAME } from "../lib/constants.ts";
import { formatTime } from "../lib/playback.ts";

/** How far one arrow key seeks. */
export const KEY_SEEK_SECONDS = 5;
/** One seek follows this many milliseconds of continuous key presses. */
export const KEY_SEEK_DEBOUNCE_MS = 200;

/** Tall enough to hit without aiming at the thin line. */
const HIT_AREA_HEIGHT = 8;

/** The only per-surface colors; the shared rules apply the opacities. */
const SEEK_TONES = {
  card: { track: "var(--border)", fill: "var(--card-foreground)" },
  sidebar: { track: "var(--sidebar-border)", fill: "var(--sidebar-foreground)" },
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface SeekBarProps {
  /** The displayed position in seconds: the shared clock or a scrub preview. */
  current: number;
  duration: number;
  onSeek(position: number): void;
  /** Receives the scrub preview in seconds, or null when it ends. */
  onScrub?(position: number | null): void;
  className?: string;
  /** Which surface's border and foreground pair the bar draws from. */
  tone?: keyof typeof SEEK_TONES;
  restHeight?: number;
  activeHeight?: number;
  /** Center the line in the hit area, or pin it to the bottom. */
  align?: "center" | "end";
}

/**
 * The shared seek bar: a click jumps, a drag scrubs with one seek on release,
 * and the keyboard seeks five seconds per arrow press behind a short debounce.
 */
export function SeekBar({
  current,
  duration,
  onSeek,
  onScrub,
  className,
  tone = "card",
  restHeight = 2,
  activeHeight = 4,
  align = "center",
}: SeekBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragSecondsRef = useRef<number | null>(null);
  const keyTimerRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  const end = Math.round(duration);
  const displayed = preview ?? current;
  const ratio = duration > 0 ? clamp(displayed / duration, 0, 1) : 0;
  const active = dragging || focused || hoverRatio !== null;
  // Clock corrections glide; dragging and the keyboard preview track instantly.
  const scrubEase = !dragging && preview === null;

  function ratioAt(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width <= 0) return 0;
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  }

  function secondsAt(clientX: number): number {
    return clamp(Math.round(ratioAt(clientX) * duration), 0, end);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    // A click or drag never moves focus; only Tab does.
    event.preventDefault();
    const seconds = secondsAt(event.clientX);
    dragSecondsRef.current = seconds;
    setDragging(true);
    setPreview(seconds);
    onScrub?.(seconds);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragging) return;
    setHoverRatio(ratioAt(event.clientX));
  }

  function handlePointerLeave() {
    if (!dragging) setHoverRatio(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const base = Math.round(preview ?? current);
    let target: number;
    switch (event.key) {
      case "ArrowLeft":
        target = clamp(base - KEY_SEEK_SECONDS, 0, end);
        break;
      case "ArrowRight":
        target = clamp(base + KEY_SEEK_SECONDS, 0, end);
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = end;
        break;
      default:
        return;
    }

    event.preventDefault();
    setPreview(target);
    onScrub?.(target);
    if (keyTimerRef.current !== null) window.clearTimeout(keyTimerRef.current);
    keyTimerRef.current = window.setTimeout(() => {
      keyTimerRef.current = null;
      setPreview(null);
      onScrub?.(null);
      onSeek(target);
    }, KEY_SEEK_DEBOUNCE_MS);
  }

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (event: PointerEvent) => {
      const seconds = secondsAt(event.clientX);
      dragSecondsRef.current = seconds;
      setPreview(seconds);
      onScrub?.(seconds);
    };
    const endDrag = (commit: boolean) => {
      const seconds = dragSecondsRef.current;
      dragSecondsRef.current = null;
      setDragging(false);
      setPreview(null);
      onScrub?.(null);
      if (commit && seconds !== null) onSeek(seconds);
    };
    const handleUp = () => endDrag(true);
    const handleCancel = () => endDrag(false);

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
    // secondsAt and onScrub are recreated with the surface that owns them.
  }, [dragging, duration, onSeek, onScrub]);

  useEffect(
    () => () => {
      if (keyTimerRef.current !== null) window.clearTimeout(keyTimerRef.current);
    },
    [],
  );

  if (duration <= 0) return null;

  const labelRatio = dragging ? ratio : hoverRatio;
  const labelSeconds = dragging ? displayed : (labelRatio ?? 0) * duration;

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={Math.floor(displayed)}
      aria-valuetext={formatTime(displayed)}
      data-sonora-seek=""
      style={
        {
          height: HIT_AREA_HEIGHT,
          "--sonora-seek-track-color": SEEK_TONES[tone].track,
          "--sonora-seek-color": SEEK_TONES[tone].fill,
        } as CSSProperties
      }
      className={`flex cursor-pointer touch-none select-none ${FOCUS_RING_CLASS_NAME} ${
        align === "end" ? "items-end" : "items-center"
      } ${className ?? ""}`}
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <div
        ref={trackRef}
        data-sonora-seek-track=""
        style={{ height: active ? activeHeight : restHeight }}
        className="sonora-seek-track relative w-full rounded-full transition-[height] duration-150 ease-out"
      >
        <div
          className={`sonora-seek-fill absolute inset-y-0 left-0 rounded-full ${
            scrubEase ? "sonora-seek-ease-fill" : ""
          }`}
          style={{ width: `${ratio * 100}%` }}
        />
        {active ? (
          <span
            data-sonora-seek-knob=""
            className={`sonora-seek-knob pointer-events-none absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-xs ${
              scrubEase ? "sonora-seek-ease-knob" : ""
            }`}
            style={{ left: `${ratio * 100}%` }}
          />
        ) : null}
        {labelRatio === null ? null : (
          <span
            data-sonora-seek-label=""
            className="pointer-events-none absolute bottom-full mb-1 whitespace-nowrap rounded-sm bg-popover px-1.5 py-0.5 text-2xs text-popover-foreground shadow-xs"
            style={{ left: `${labelRatio * 100}%`, transform: "translateX(-50%)" }}
          >
            {formatTime(labelSeconds)}
          </span>
        )}
      </div>
    </div>
  );
}

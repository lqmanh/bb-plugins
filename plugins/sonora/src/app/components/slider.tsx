import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { FOCUS_RING_CLASS_NAME } from "../lib/constants.ts";

/** Tall enough to hit without aiming at the thin line. */
const HIT_AREA_HEIGHT = 8;

/** The only per-surface colors; the shared rules apply the opacities. */
const BAR_TONES = {
  banner: { track: "var(--border)", fill: "var(--card-foreground)" },
  card: { track: "var(--border)", fill: "var(--popover-foreground)" },
  sidebar: { track: "var(--sidebar-border)", fill: "var(--sidebar-foreground)" },
} as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type SliderChangeSource = "keyboard" | "pointer";

export interface SliderProps {
  value: number;
  max: number;
  /** How far one arrow key moves. */
  step: number;
  onChange(value: number, source: SliderChangeSource): void;
  /** Receives the drag or keyboard preview, or null when it ends. */
  onPreview?(value: number | null): void;
  formatLabel(value: number): string;
  ariaLabel: string;
  className?: string;
  /** Which surface's border and foreground pair the bar draws from. */
  tone?: keyof typeof BAR_TONES;
  restHeight?: number;
  activeHeight?: number;
  /** Center the line in the hit area, or pin it to the bottom. */
  align?: "center" | "end";
}

/**
 * A clickable, draggable slider shared by seeking and volume. A click jumps,
 * a drag previews and commits once, and keyboard steps commit immediately for
 * the caller to debounce.
 */
export function Slider({
  value,
  max,
  step,
  onChange,
  onPreview,
  formatLabel,
  ariaLabel,
  className,
  tone = "banner",
  restHeight = 2,
  activeHeight = 4,
  align = "center",
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragValueRef = useRef<number | null>(null);
  const pointerOverRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  const end = Math.round(max);
  const displayed = preview ?? value;
  const ratio = max > 0 ? clamp(displayed / max, 0, 1) : 0;
  const active = dragging || focused || hoverRatio !== null;
  // Changes the bar makes on its own glide; dragging and the keyboard preview track instantly.
  const ease = !dragging && preview === null;
  const labelRatio = dragging ? ratio : hoverRatio;
  const labelText =
    labelRatio === null ? null : formatLabel(dragging ? displayed : labelRatio * max);
  const easeClass = ease ? "sonora-slider-ease" : "";

  function ratioAt(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width <= 0) return 0;
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  }

  function valueAt(clientX: number): number {
    return clamp(Math.round(ratioAt(clientX) * max), 0, end);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    // A click or drag never moves focus; only Tab does.
    event.preventDefault();
    const next = valueAt(event.clientX);
    dragValueRef.current = next;
    pointerOverRef.current = true;
    setDragging(true);
    setPreview(next);
    onPreview?.(next);
  }

  function handlePointerEnter() {
    pointerOverRef.current = true;
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    pointerOverRef.current = true;
    if (dragging) return;
    setHoverRatio(ratioAt(event.clientX));
  }

  function handlePointerLeave() {
    pointerOverRef.current = false;
    if (!dragging) setHoverRatio(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const base = Math.round(preview ?? value);
    let target: number;
    switch (event.key) {
      case "ArrowLeft":
        target = clamp(base - step, 0, end);
        break;
      case "ArrowRight":
        target = clamp(base + step, 0, end);
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
    onPreview?.(target);
    onChange(target, "keyboard");
  }

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (event: PointerEvent) => {
      const next = valueAt(event.clientX);
      dragValueRef.current = next;
      setPreview(next);
      onPreview?.(next);
    };
    const endDrag = (commit: boolean, event: PointerEvent) => {
      const next = dragValueRef.current;
      dragValueRef.current = null;
      setDragging(false);
      setPreview(null);
      setHoverRatio(pointerOverRef.current ? ratioAt(event.clientX) : null);
      onPreview?.(null);
      if (commit && next !== null) onChange(next, "pointer");
    };
    const handleUp = (event: PointerEvent) => endDrag(true, event);
    const handleCancel = (event: PointerEvent) => endDrag(false, event);

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
    // valueAt and onPreview are recreated with the surface that owns them.
  }, [dragging, max, onChange, onPreview]);

  useEffect(() => {
    if (preview !== null && value === preview) setPreview(null);
  }, [preview, value]);

  if (max <= 0) return null;

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.floor(displayed)}
      aria-valuetext={formatLabel(displayed)}
      style={
        {
          height: HIT_AREA_HEIGHT,
          "--sonora-slider-track-color": BAR_TONES[tone].track,
          "--sonora-slider-color": BAR_TONES[tone].fill,
        } as CSSProperties
      }
      className={`flex cursor-pointer touch-none select-none ${FOCUS_RING_CLASS_NAME} ${
        align === "end" ? "items-end" : "items-center"
      } ${className ?? ""}`}
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <div
        ref={trackRef}
        style={{ height: active ? activeHeight : restHeight }}
        className="sonora-slider-track relative w-full rounded-full"
      >
        <div
          className={`sonora-slider-fill absolute inset-y-0 left-0 rounded-full ${easeClass}`}
          style={{ width: `${ratio * 100}%` }}
        />
        {active ? (
          <span
            className={`sonora-slider-knob pointer-events-none absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-xs ${easeClass}`}
            style={{ left: `${ratio * 100}%` }}
          />
        ) : null}
        {labelRatio === null ? null : (
          <span
            className="pointer-events-none absolute bottom-full mb-1 whitespace-nowrap rounded-sm bg-popover px-1.5 py-0.5 text-2xs text-popover-foreground shadow-xs"
            style={{
              left: `${labelRatio * 100}%`,
              transform: "translateX(-50%)",
            }}
          >
            {labelText}
          </span>
        )}
      </div>
    </div>
  );
}

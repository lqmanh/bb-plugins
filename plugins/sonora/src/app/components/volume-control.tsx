import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import type { PlaybackControl } from "../../shared/now-playing.ts";
import { SONORA_ICONS } from "../lib/constants.ts";
import { useTrailingCommit } from "../lib/trailing-commit.ts";
import { IconButton } from "./icon-button.tsx";
import { clamp, Slider, type SliderChangeSource } from "./slider.tsx";

const VOLUME_STEP = 5;
export const HIDE_DELAY_MS = 200;
/** Pixels of wheel travel that make one volume step. */
const WHEEL_NOTCH_PX = 50;

/**
 * The speaker and its hover bar. The shared optimistic read owns the level;
 * this only holds a level still being adjusted, and an unmute waiting for
 * Sonora to report the level it restores.
 */
export const VolumeControl = memo(function VolumeControl({
  volume,
  control,
  className,
}: {
  volume: number;
  control(input: PlaybackControl): Promise<boolean>;
  className?: string;
}) {
  const [adjusting, setAdjusting] = useState<number | null>(null);
  const [unmutePending, setUnmutePending] = useState(false);
  const [open, setOpen] = useState(false);
  const level = adjusting ?? volume;
  const muted = level === 0 && !unmutePending;
  // The wheel listener is bound once, so it reads the level from here.
  const levelRef = useRef(level);
  const rootRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
  const pointerTypeRef = useRef("");
  const wheelTravelRef = useRef(0);

  levelRef.current = level;

  useEffect(() => setUnmutePending(false), [volume]);

  const { schedule, commitNow, cancel } = useTrailingCommit({
    commit: (value) => {
      void control({ action: "volume", level: value }).finally(() =>
        setAdjusting((current) => (current === value ? null : current)),
      );
    },
    flushOnUnmount: true,
  });

  const changeLevel = useCallback(
    (next: number, immediate = false) => {
      const value = clamp(Math.round(next), 0, 100);
      setAdjusting(value);
      setUnmutePending(false);
      if (immediate) commitNow(value);
      else schedule(value);
    },
    [commitNow, schedule],
  );

  const handleBarChange = useCallback(
    (value: number, source: SliderChangeSource) =>
      changeLevel(value, source === "pointer"),
    [changeLevel],
  );

  const toggleMute = () => {
    cancel();
    setAdjusting(null);
    if (!muted) {
      void control({ action: "mute", muted: true });
      return;
    }
    setUnmutePending(true);
    void control({ action: "mute", muted: false }).then((ok) => {
      if (!ok) setUnmutePending(false);
    });
  };

  const cancelHide = () => {
    if (hideTimerRef.current === null) return;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  };

  const show = () => {
    cancelHide();
    setOpen(true);
  };

  const hide = () => {
    cancelHide();
    setOpen(false);
  };

  const scheduleHide = () => {
    cancelHide();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      if (!focusedRef.current) setOpen(false);
    }, HIDE_DELAY_MS);
  };

  useEffect(() => {
    const element = rootRef.current;
    if (element === null) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      event.preventDefault();

      // A trackpad sends many small events; step once per notch of travel.
      wheelTravelRef.current +=
        event.deltaMode === 0 ? event.deltaY : event.deltaY * WHEEL_NOTCH_PX;
      if (Math.abs(wheelTravelRef.current) < WHEEL_NOTCH_PX) return;

      const direction = wheelTravelRef.current < 0 ? 1 : -1;
      wheelTravelRef.current = 0;
      changeLevel(levelRef.current + direction * VOLUME_STEP);
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [changeLevel]);

  useEffect(() => {
    if (!open) return;

    // Touch has no hover leave, so a press outside closes.
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => cancelHide, []);

  const icon = muted
    ? SONORA_ICONS.volumeMuted
    : level < 50
      ? SONORA_ICONS.volumeLow
      : SONORA_ICONS.volumeHigh;

  return (
    <div
      ref={rootRef}
      className={`relative ${className ?? ""}`}
      onPointerDownCapture={(event) => {
        // React's click is a MouseEvent, so remember the pointer type here.
        pointerTypeRef.current = event.pointerType;
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        hoveredRef.current = true;
        show();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        hoveredRef.current = false;
        wheelTravelRef.current = 0;
        scheduleHide();
      }}
      onFocusCapture={() => {
        focusedRef.current = true;
        show();
      }}
      onBlurCapture={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        ) {
          return;
        }
        focusedRef.current = false;
        if (!hoveredRef.current) hide();
      }}
    >
      <IconButton
        label="Volume"
        ariaExpanded={open}
        className="touch-manipulation"
        onClick={(event) => {
          if (event.detail !== 1 || pointerTypeRef.current !== "touch") return;
          if (open) hide();
          else show();
        }}
        onDoubleClick={toggleMute}
      >
        <Icon name={icon} aria-hidden="true" className="size-4" />
      </IconButton>
      <div
        aria-hidden={!open}
        inert={!open}
        className={`absolute bottom-full left-0 z-20 pb-1.5 transition-[opacity,transform] duration-100 ease-out ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-1 opacity-0"
        }`}
      >
        <div className="flex w-40 items-center gap-2 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-md">
          <IconButton
            label="Volume down"
            onClick={() => changeLevel(level - VOLUME_STEP)}
          >
            <Icon name={SONORA_ICONS.volumeDown} aria-hidden="true" className="size-4" />
          </IconButton>
          <Slider
            value={level}
            max={100}
            step={VOLUME_STEP}
            onChange={handleBarChange}
            formatLabel={(value) => `${Math.round(value)}%`}
            ariaLabel="Volume"
            tone="card"
            restHeight={4}
            activeHeight={6}
            className="min-w-0 flex-1"
          />
          <IconButton label="Volume up" onClick={() => changeLevel(level + VOLUME_STEP)}>
            <Icon name={SONORA_ICONS.volumeUp} aria-hidden="true" className="size-4" />
          </IconButton>
        </div>
      </div>
    </div>
  );
});

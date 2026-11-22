import { useCallback } from "react";

import { formatTime } from "../lib/playback.ts";
import { useTrailingCommit } from "../lib/trailing-commit.ts";
import { Slider, type SliderChangeSource, type SliderProps } from "./slider.tsx";

/** How far one arrow key seeks. */
export const KEY_SEEK_SECONDS = 5;

export interface SeekBarProps extends Pick<
  SliderProps,
  "className" | "tone" | "restHeight" | "activeHeight" | "align"
> {
  /** The displayed position in seconds: the shared clock or a scrub preview. */
  current: number;
  duration: number;
  onSeek(position: number): void;
  /** Receives the scrub preview in seconds, or null when it ends. */
  onScrub?(position: number | null): void;
}

/**
 * The shared seek bar: a click jumps, a drag scrubs with one seek on release,
 * and the keyboard seeks five seconds per arrow press behind a short debounce.
 */
export function SeekBar({ current, duration, onSeek, onScrub, ...rest }: SeekBarProps) {
  const { schedule, commitNow } = useTrailingCommit({
    commit: (position) => {
      onScrub?.(null);
      onSeek(position);
    },
  });
  // Stable, so a drag's window listeners aren't rebound on every scrub render.
  const handleChange = useCallback(
    (value: number, source: SliderChangeSource) =>
      source === "pointer" ? commitNow(value) : schedule(value),
    [commitNow, schedule],
  );

  return (
    <Slider
      value={current}
      max={duration}
      step={KEY_SEEK_SECONDS}
      onChange={handleChange}
      onPreview={onScrub}
      formatLabel={formatTime}
      ariaLabel="Seek"
      {...rest}
    />
  );
}

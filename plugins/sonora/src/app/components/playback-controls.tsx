import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import type { MouseEvent, ReactNode } from "react";

import type { PlaybackControl, PlaybackState } from "../../shared/now-playing.ts";
import { FOCUS_RING_CLASS_NAME, SONORA_ICONS } from "../lib/constants.ts";

const CONTROL_BUTTON_CLASS_NAME = `flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-subtle-foreground transition-colors hover:text-foreground ${FOCUS_RING_CLASS_NAME}`;

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={CONTROL_BUTTON_CLASS_NAME}
      onMouseDown={(event: MouseEvent<HTMLButtonElement>) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Play/pause, previous, and next, driven by the shared control hook. */
export function PlaybackControls({
  state,
  position,
  control,
  className,
}: {
  state: PlaybackState | null;
  /** The displayed position in seconds; pause freezes here optimistically. */
  position: number;
  control: (input: PlaybackControl) => void;
  className?: string;
}) {
  // A loading track is on its way to playing, so it offers pause.
  const pausing = state === "playing" || state === "loading";
  const label = pausing ? "Pause" : "Play";

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <ControlButton label="Previous track" onClick={() => control({ action: "prev" })}>
        <Icon name={SONORA_ICONS.skipBack} aria-hidden="true" className="size-4" />
      </ControlButton>
      <ControlButton
        label={label}
        onClick={() =>
          control(pausing ? { action: "pause", position } : { action: "play" })
        }
      >
        <Icon name={label} aria-hidden="true" className="size-4" />
      </ControlButton>
      <ControlButton label="Next track" onClick={() => control({ action: "next" })}>
        <Icon name={SONORA_ICONS.skipForward} aria-hidden="true" className="size-4" />
      </ControlButton>
    </div>
  );
}

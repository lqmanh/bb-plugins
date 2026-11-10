import type { MouseEvent, ReactNode } from "react";

import { FOCUS_RING_CLASS_NAME } from "../lib/constants.ts";

const PLAYBACK_BUTTON_TONE_CLASS_NAME = "text-subtle-foreground hover:text-foreground";
const CONTROL_BUTTON_CLASS_NAME = `flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm transition-[color,opacity] ${FOCUS_RING_CLASS_NAME}`;

/** The 24 px icon button shared by playback controls and the debug button. */
export function ControlButton({
  label,
  onClick,
  toneClassName = PLAYBACK_BUTTON_TONE_CLASS_NAME,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  /** Color and opacity classes; defaults to the playback-control tone. */
  toneClassName?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`${CONTROL_BUTTON_CLASS_NAME} ${toneClassName} ${className ?? ""}`}
      onMouseDown={(event: MouseEvent<HTMLButtonElement>) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

import type { MouseEvent, ReactNode } from "react";

import { FOCUS_RING_CLASS_NAME } from "../lib/constants.ts";

const DEFAULT_ICON_TONE_CLASS_NAME = "text-subtle-foreground hover:text-foreground";
const ICON_BUTTON_CLASS_NAME = `flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm transition-[color,opacity] ${FOCUS_RING_CLASS_NAME}`;

/** The 24 px icon button shared by playback controls, the speaker, and the debug button. */
export function IconButton({
  label,
  onClick,
  onDoubleClick,
  ariaExpanded,
  toneClassName = DEFAULT_ICON_TONE_CLASS_NAME,
  className,
  children,
}: {
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onDoubleClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  ariaExpanded?: boolean;
  /** Color and opacity classes; defaults to the subtle icon tone. */
  toneClassName?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={ariaExpanded}
      className={`${ICON_BUTTON_CLASS_NAME} ${toneClassName} ${className ?? ""}`}
      onMouseDown={(event: MouseEvent<HTMLButtonElement>) => event.preventDefault()}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {children}
    </button>
  );
}

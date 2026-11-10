import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import type { ReactNode } from "react";

import { FOCUS_RING_CLASS_NAME } from "../lib/constants.ts";

/** A focus-friendly button that opens the current track in Sonora. */
export function OpenSonoraButton({
  url,
  className,
  children,
}: {
  url: string;
  className?: string;
  children: ReactNode;
}) {
  const navigate = useBbNavigate();

  return (
    <button
      type="button"
      aria-label="Open in Sonora"
      className={`cursor-pointer ${FOCUS_RING_CLASS_NAME} ${className ?? ""}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => navigate.openUrl(url)}
    >
      {children}
    </button>
  );
}

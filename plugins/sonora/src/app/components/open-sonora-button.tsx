import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import type { ReactNode } from "react";

import { FOCUS_RING_CLASS_NAME } from "../lib/constants.ts";
import type { BadgePlacement, ProviderBadgeInfo } from "../lib/providers.ts";
import { ProviderBadge } from "./provider-badge.tsx";

/** A focus-friendly button that opens the current track in Sonora. */
export function OpenSonoraButton({
  url,
  badge,
  placement,
  className,
  children,
}: {
  url: string;
  badge: ProviderBadgeInfo | null;
  placement: BadgePlacement;
  className?: string;
  children: ReactNode;
}) {
  const navigate = useBbNavigate();
  const label = badge === null ? "Open in Sonora" : `Open in Sonora (${badge.label})`;

  return (
    <button
      type="button"
      aria-label={label}
      className={`relative cursor-pointer ${FOCUS_RING_CLASS_NAME} ${className ?? ""}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => navigate.openUrl(url)}
    >
      {children}
      {badge === null ? null : <ProviderBadge badge={badge} placement={placement} />}
    </button>
  );
}

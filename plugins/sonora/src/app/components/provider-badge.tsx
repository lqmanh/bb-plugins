import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import type { CSSProperties } from "react";

import type { BadgePlacement, ProviderBadgeInfo } from "../lib/providers.ts";

const PLACEMENT_CLASSES = {
  disclosure: {
    box: "size-4 -right-1 -bottom-1",
    square: "rounded-[4px]",
    plate: "bg-sidebar",
    tone: "text-sidebar-foreground",
  },
  banner: {
    box: "size-3 -right-[3px] -bottom-[3px]",
    square: "rounded-[3px]",
    plate: "bg-card",
    tone: "text-card-foreground",
  },
} as const;

/**
 * A provider badge with the provider's icon, pinned to the bottom-right corner
 * of the cover or record. The surrounding cover or record cuts the matching
 * gap (see app.css) so the backdrop shows through.
 */
export function ProviderBadge({
  badge,
  placement,
}: {
  badge: ProviderBadgeInfo;
  placement: BadgePlacement;
}) {
  const placementClasses = PLACEMENT_CLASSES[placement];
  const shape = badge.shape === "round" ? "rounded-full" : placementClasses.square;
  const plate = badge.plate === "surface" ? placementClasses.plate : "";
  const tone = badge.color === null ? placementClasses.tone : "";
  const iconClassName = badge.plate === "surface" ? "size-[64%]" : "size-full";
  const iconStyle: CSSProperties | undefined =
    badge.color === null ? undefined : { color: badge.color };

  return (
    <span
      aria-hidden="true"
      data-sonora-provider-badge={badge.provider}
      className={`absolute flex items-center justify-center overflow-hidden ${placementClasses.box} ${shape} ${plate} ${tone}`}
    >
      <Icon name={badge.icon} className={iconClassName} style={iconStyle} />
    </span>
  );
}

import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";

import { SONORA_ICONS } from "../lib/constants.ts";
import { setDebugMode, useDebugMode } from "../lib/debug.ts";
import { ControlButton } from "./control-button.tsx";

/** Turns debug mode off; rendered only while debug mode is on. */
export function DebugButton({ className }: { className?: string }) {
  const debug = useDebugMode();
  if (!debug) return null;

  return (
    <ControlButton
      label="Turn off debug mode"
      onClick={() => setDebugMode(false)}
      toneClassName="text-warning-text opacity-75 hover:opacity-100"
      className={className}
    >
      <Icon name={SONORA_ICONS.bug} aria-hidden="true" className="size-4" />
    </ControlButton>
  );
}

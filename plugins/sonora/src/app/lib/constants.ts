/** Shared focus treatment for the plugin's interactive controls. */
export const FOCUS_RING_CLASS_NAME =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring";

/** Plugin-owned icons declared in `bb.branding.experimental_icons`. */
export const SONORA_ICONS = {
  audioLines: "sonora/audio-lines",
  skipBack: "sonora/skip-back",
  skipForward: "sonora/skip-forward",
} as const;

/**
 * How long a track change cross-fades, everywhere: the cover backdrops (as
 * `--sonora-track-fade`) and the strip's lava.
 */
export const TRACK_FADE_MS = 2_000;

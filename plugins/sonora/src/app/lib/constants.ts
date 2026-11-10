/** Shared focus treatment for the plugin's interactive controls. */
export const FOCUS_RING_CLASS_NAME =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring";

/** Plugin-owned icons declared in `bb.branding.experimental_icons`. */
export const SONORA_ICONS = {
  appleMusic: "sonora/apple-music",
  audioLines: "sonora/audio-lines",
  deezer: "sonora/deezer",
  skipBack: "sonora/skip-back",
  skipForward: "sonora/skip-forward",
  spotify: "sonora/spotify",
  tidal: "sonora/tidal",
  youtubeMusic: "sonora/youtube-music",
} as const;

/**
 * How long a track change cross-fades, everywhere: the cover backdrops (as
 * `--sonora-track-fade`) and the banner's lava.
 */
export const TRACK_FADE_MS = 2_000;

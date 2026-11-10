import type { ProviderBadgeInfo } from "../../src/app/lib/providers.ts";

/** The expected badge metadata from Simple Icons 16.37.0. */
export const PROVIDER_BADGES: readonly ProviderBadgeInfo[] = [
  {
    provider: "spotify",
    label: "Spotify",
    icon: "sonora/spotify",
    color: "#1ED760",
    shape: "round",
    plate: "none",
  },
  {
    provider: "apple",
    label: "Apple Music",
    icon: "sonora/apple-music",
    color: "#FA243C",
    shape: "square",
    plate: "none",
  },
  {
    provider: "deezer",
    label: "Deezer",
    icon: "sonora/deezer",
    color: "#A238FF",
    shape: "round",
    plate: "surface",
  },
  {
    provider: "tidal",
    label: "Tidal",
    icon: "sonora/tidal",
    color: null,
    shape: "round",
    plate: "surface",
  },
  {
    provider: "youtube",
    label: "YouTube Music",
    icon: "sonora/youtube-music",
    color: "#FF0000",
    shape: "round",
    plate: "none",
  },
];

export const NO_BADGE_PROVIDERS = [
  { name: "a local track", provider: "local" },
  { name: "a subsonic track", provider: "subsonic" },
  { name: "an unknown provider", provider: "pandora" },
  { name: "a missing provider", provider: null },
] as const;

import type { ProviderBadgeInfo } from "../../src/app/lib/providers.ts";

/** The expected badge metadata from Simple Icons 16.37.0 and Sonora's app assets. */
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
  {
    provider: "jellyfin",
    label: "Jellyfin",
    icon: "sonora/jellyfin",
    color: "#00A4DC",
    shape: "round",
    plate: "surface",
  },
  {
    provider: "subsonic",
    label: "Subsonic",
    icon: "sonora/subsonic",
    color: "#FFA31A",
    shape: "round",
    plate: "surface",
  },
];

export const NO_BADGE_PROVIDERS = [
  { name: "a local track", provider: "local" },
  { name: "an unknown provider", provider: "pandora" },
  { name: "a missing provider", provider: null },
] as const;

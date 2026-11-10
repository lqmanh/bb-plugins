import { SONORA_ICONS } from "./constants.ts";

export type ProviderBadgeShape = "round" | "square";
export type BadgePlacement = "disclosure" | "banner";

export interface ProviderBadgeInfo {
  provider: string;
  label: string;
  /** The declared bb icon for this provider. */
  icon: string;
  /** `null` draws the icon in the surface's text color. */
  color: string | null;
  shape: ProviderBadgeShape;
  /** Free-standing icons sit on a round plate; filled icons stay transparent. */
  plate: "none" | "surface";
}

/**
 * Icons and brand colors come from Simple Icons 16.37.0. Its SVGs are
 * monochrome; each color is the `hex` field in its `data/simple-icons.json`.
 */
const BADGES: Record<string, ProviderBadgeInfo> = {
  spotify: {
    provider: "spotify",
    label: "Spotify",
    icon: SONORA_ICONS.spotify,
    color: "#1ED760",
    shape: "round",
    plate: "none",
  },
  apple: {
    provider: "apple",
    label: "Apple Music",
    icon: SONORA_ICONS.appleMusic,
    color: "#FA243C",
    shape: "square",
    plate: "none",
  },
  deezer: {
    provider: "deezer",
    label: "Deezer",
    icon: SONORA_ICONS.deezer,
    color: "#A238FF",
    shape: "round",
    plate: "surface",
  },
  tidal: {
    provider: "tidal",
    label: "Tidal",
    icon: SONORA_ICONS.tidal,
    color: null,
    shape: "round",
    plate: "surface",
  },
  youtube: {
    provider: "youtube",
    label: "YouTube Music",
    icon: SONORA_ICONS.youtubeMusic,
    color: "#FF0000",
    shape: "round",
    plate: "none",
  },
};

/** The badge for a supported provider, or none for local/unknown providers. */
export function providerBadge(provider: string | null): ProviderBadgeInfo | null {
  if (provider === null || !Object.hasOwn(BADGES, provider)) return null;
  return BADGES[provider] ?? null;
}

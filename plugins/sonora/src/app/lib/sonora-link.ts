/** Apple library ids (`i.`, `l.`, `r.`, `p.`) only mean something on this account. */
const APPLE_LIBRARY_ID = /^[ilrp]\./;

/**
 * The provider page for a track, using Sonora's own share link patterns. A
 * library-only or unsupported track has no link others can open.
 */
export function sonoraTrackLink(
  provider: string | null,
  trackId: string | null,
): string | null {
  if (provider === null || trackId === null || trackId.length === 0) return null;

  switch (provider) {
    case "spotify":
      return `https://open.spotify.com/track/${encodeURIComponent(trackId)}`;
    case "apple":
      return APPLE_LIBRARY_ID.test(trackId)
        ? null
        : `https://music.apple.com/us/song/${encodeURIComponent(trackId)}`;
    case "deezer":
      return `https://www.deezer.com/track/${encodeURIComponent(trackId)}`;
    case "tidal":
      return `https://tidal.com/browse/track/${encodeURIComponent(trackId)}`;
    case "youtube":
      return `https://music.youtube.com/watch?v=${encodeURIComponent(trackId)}`;
    default:
      return null;
  }
}

/** The Sonora link that opens a track's page, or the bare app link. */
export function sonoraOpenUrl(provider: string | null, trackId: string | null): string {
  const link = sonoraTrackLink(provider, trackId);
  return link === null ? "sonora://" : `sonora://open?url=${encodeURIComponent(link)}`;
}

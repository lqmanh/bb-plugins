import { describe, expect, it } from "vitest";

import { sonoraOpenUrl, sonoraTrackLink } from "../../src/app/lib/sonora-link.ts";

const ID = "a b/c?d";
const ENCODED_ID = encodeURIComponent(ID);

describe("sonoraTrackLink", () => {
  it.each([
    {
      provider: "spotify",
      link: `https://open.spotify.com/track/${ENCODED_ID}`,
    },
    {
      provider: "apple",
      link: `https://music.apple.com/us/song/${ENCODED_ID}`,
    },
    {
      provider: "deezer",
      link: `https://www.deezer.com/track/${ENCODED_ID}`,
    },
    {
      provider: "tidal",
      link: `https://tidal.com/browse/track/${ENCODED_ID}`,
    },
    {
      provider: "youtube",
      link: `https://music.youtube.com/watch?v=${ENCODED_ID}`,
    },
  ])("builds the $provider track link with an escaped id", ({ provider, link }) => {
    expect(sonoraTrackLink(provider, ID)).toBe(link);
  });

  it.each(["i.123", "l.123", "r.123", "p.123"])(
    "has no Apple link for library id %s",
    (id) => {
      expect(sonoraTrackLink("apple", id)).toBeNull();
    },
  );

  it.each([
    { name: "a local track", provider: "local", id: "track-1" },
    { name: "a subsonic track", provider: "subsonic", id: "track-1" },
    { name: "an unknown provider", provider: "pandora", id: "track-1" },
    { name: "a missing provider", provider: null, id: "track-1" },
    { name: "a missing id", provider: "spotify", id: null },
    { name: "an empty id", provider: "spotify", id: "" },
  ])("has no link for $name", ({ provider, id }) => {
    expect(sonoraTrackLink(provider, id)).toBeNull();
  });
});

describe("sonoraOpenUrl", () => {
  it("asks Sonora to open the encoded track link", () => {
    const link = `https://open.spotify.com/track/${ENCODED_ID}`;
    expect(sonoraOpenUrl("spotify", ID)).toBe(
      `sonora://open?url=${encodeURIComponent(link)}`,
    );
  });

  it("falls back to the bare app link without a track link", () => {
    expect(sonoraOpenUrl("local", "track-1")).toBe("sonora://");
  });
});

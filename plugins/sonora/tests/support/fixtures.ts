import type { SonoraSnapshot } from "../../src/shared/now-playing.ts";

export const NOT_RUNNING_STDERR = "sonora: Sonora is not running\n";

export function snapshot(
  overrides: Partial<SonoraSnapshot> = {},
): SonoraSnapshot {
  return {
    state: "playing",
    track: {
      id: "track-1",
      title: "Night Drive",
      artists: ["A", "B"],
      album: "Album",
      cover: "https://example.test/cover.jpg",
      duration: 213,
    },
    position: 42,
    volume: 70,
    shuffle: false,
    repeat: "off",
    provider: "spotify",
    liked: true,
    origin: { kind: "album", id: "album-1", name: "Album" },
    ...overrides,
  };
}

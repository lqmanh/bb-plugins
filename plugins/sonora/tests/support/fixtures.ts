import type {
  NowPlaying,
  NowPlayingTrack,
  PlaybackControl,
  SonoraSnapshot,
} from "../../src/shared/now-playing.ts";

export const NOT_RUNNING_STDERR = "sonora: Sonora is not running\n";
export const OPEN_SONORA_CALL = {
  method: "openUrl",
  url: "sonora://open?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2Ftrack-1",
} as const;
export const BARE_SONORA_CALL = { method: "openUrl", url: "sonora://" } as const;

export function track(overrides: Partial<NowPlayingTrack> = {}): NowPlayingTrack {
  return {
    id: "track-1",
    title: "Night Drive",
    artists: ["A", "B"],
    album: "Album",
    cover: "https://example.test/cover.jpg",
    duration: 213,
    ...overrides,
  };
}

export function snapshot(overrides: Partial<SonoraSnapshot> = {}): SonoraSnapshot {
  return {
    state: "playing",
    track: track(),
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

export function nowPlaying(overrides: Partial<NowPlaying> = {}): NowPlaying {
  return {
    ...snapshot(),
    state: "playing",
    status: "running",
    receivedAt: 0,
    ...overrides,
  };
}

let receivedAtCounter = 10_000;

export function nextReceivedAt(): number {
  receivedAtCounter += 1;
  return receivedAtCounter;
}

export function playing(overrides: Partial<NowPlaying> = {}): NowPlaying {
  return { ...nowPlaying(), receivedAt: nextReceivedAt(), ...overrides };
}

export type RpcHandler = () => NowPlaying | Promise<NowPlaying>;

export type ControlHandler = (input: PlaybackControl) => null | Promise<null>;

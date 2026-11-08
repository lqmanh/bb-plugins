import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** RPC cache tag invalidated whenever the now-playing snapshot changes. */
export const NOW_PLAYING_RPC_TAG = "now-playing";

/** Playback states Sonora documents, plus a fallback for values added later. */
export const playbackStateSchema = z.enum([
  "playing",
  "paused",
  "loading",
  "idle",
  "unknown",
]);
export type PlaybackState = z.infer<typeof playbackStateSchema>;

/** Whether the watcher currently has a usable Sonora connection. */
export const nowPlayingStatusSchema = z.enum([
  "running",
  "not-running",
  "unavailable",
]);
export type NowPlayingStatus = z.infer<typeof nowPlayingStatusSchema>;

const trackFields = {
  id: z.string().nullable().default(null),
  title: z.string(),
  artists: z.array(z.string()).default([]),
  album: z.string().nullable().default(null),
  cover: z.string().nullable().default(null),
  duration: z.number().nonnegative(),
};

/** Wire track shape. Unknown fields are stripped; `Track.id` is an Option. */
export const sonoraTrackSchema = z.object(trackFields);
export type SonoraTrack = z.infer<typeof sonoraTrackSchema>;

const originFields = {
  kind: z.string(),
  id: z.string(),
  name: z.string().nullable().default(null),
};

/** `Origin.name` is an Option; `Current.origin` itself is optional. */
export const sonoraOriginSchema = z.object(originFields);
export type SonoraOrigin = z.infer<typeof sonoraOriginSchema>;

/**
 * One `Current` payload. `null` is the valid "nothing loaded" answer
 * (`Value::Current(None)`), so the wire type is nullable.
 *
 * `volume`, `shuffle`, and `repeat` are required by the wire but are not part
 * of this plugin's display scope; they are tolerated as optional so a missing
 * value never rejects the whole snapshot.
 */
export const sonoraSnapshotSchema = z.object({
  state: z.string(),
  track: sonoraTrackSchema,
  position: z.number().nonnegative(),
  volume: z.number().nullable().default(null),
  shuffle: z.boolean().nullable().default(null),
  repeat: z.string().nullable().default(null),
  provider: z.string().nullable().default(null),
  liked: z.boolean().nullable().default(null),
  origin: sonoraOriginSchema.nullable().default(null),
});
export type SonoraSnapshot = z.infer<typeof sonoraSnapshotSchema>;

/** The wire answer: a snapshot or the top-level null for "nothing loaded". */
export const sonoraCurrentSchema = sonoraSnapshotSchema.nullable();
export type SonoraCurrent = z.infer<typeof sonoraCurrentSchema>;

/** The normalized track the frontend renders. */
export const nowPlayingTrackSchema = z.object(trackFields).strict();
export type NowPlayingTrack = z.infer<typeof nowPlayingTrackSchema>;

export const nowPlayingOriginSchema = z.object(originFields).strict();
export type NowPlayingOrigin = z.infer<typeof nowPlayingOriginSchema>;

/** The RPC response. Always present; `track` is null when nothing is loaded. */
export const nowPlayingSchema = z
  .object({
    status: nowPlayingStatusSchema,
    state: playbackStateSchema.nullable().default(null),
    track: nowPlayingTrackSchema.nullable().default(null),
    position: z.number().nonnegative().nullable().default(null),
    volume: z.number().nullable().default(null),
    shuffle: z.boolean().nullable().default(null),
    repeat: z.string().nullable().default(null),
    provider: z.string().nullable().default(null),
    liked: z.boolean().nullable().default(null),
    origin: nowPlayingOriginSchema.nullable().default(null),
    /** Server wall-clock time the snapshot was received, for client clocks. */
    receivedAt: z.number().int().nonnegative(),
  })
  .strict();
export type NowPlaying = z.infer<typeof nowPlayingSchema>;

export const nowPlayingRpcContract = defineRpcContract({
  nowPlaying: {
    input: z.null(),
    output: nowPlayingSchema,
    tags: () => [NOW_PLAYING_RPC_TAG],
  },
});

/** A snapshot with no track, used before the first reading and on disconnect. */
export function emptyNowPlaying(
  status: NowPlayingStatus,
  receivedAt: number,
): NowPlaying {
  return nowPlayingSchema.parse({ status, receivedAt });
}

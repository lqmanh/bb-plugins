import { experimental_useRpcQuery } from "@get-bb/plugin-sdk/app";

import {
  nowPlayingRpcContract,
  type NowPlayingTrack,
  type PlaybackState,
} from "../../shared/now-playing.ts";

/**
 * The shared now-playing read. `track` and `state` are only set while Sonora
 * is running, so no surface re-derives "is playing" from the raw status.
 */
export function useNowPlaying(enabled = true) {
  const query = experimental_useRpcQuery({
    contract: nowPlayingRpcContract,
    method: "nowPlaying",
    input: null,
    enabled,
  });

  const { data } = query;
  let track: NowPlayingTrack | null = null;
  let state: PlaybackState | null = null;
  if (data?.status === "running") {
    track = data.track;
    state = data.state;
  }

  return { ...query, track, state };
}

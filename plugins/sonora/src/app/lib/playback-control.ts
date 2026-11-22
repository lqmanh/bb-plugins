import { experimental_useRpcMutation } from "@get-bb/plugin-sdk/app";
import { useCallback, useEffect, useState } from "react";

import {
  nowPlayingRpcContract,
  type NowPlaying,
  type PlaybackControl,
} from "../../shared/now-playing.ts";

/** How long a failed action stays on the disclosure before clearing itself. */
export const PLAYBACK_ERROR_CLEAR_MS = 4_000;

export function playbackControlErrorMessage(input: PlaybackControl): string {
  switch (input.action) {
    case "play":
      return "Couldn't play.";
    case "pause":
      return "Couldn't pause.";
    case "next":
      return "Couldn't skip to the next track.";
    case "prev":
      return "Couldn't skip to the previous track.";
    case "seek":
      return "Couldn't seek.";
    case "volume":
      return "Couldn't change the volume.";
    case "mute":
      return input.muted ? "Couldn't mute." : "Couldn't unmute.";
  }
}

/**
 * Predict the shared now-playing read. Play and pause set the state directly;
 * pause also freezes at the position the surface showed, since the snapshot
 * itself may be up to a second stale. Seek and volume move their fields; mute
 * on is volume 0, because that is how Sonora reports it. Mute off waits for
 * Sonora's report. All re-anchor the client clock on a new `receivedAt`
 * derived from the current one, so the update stays pure.
 */
function optimisticNowPlaying(current: NowPlaying, input: PlaybackControl): NowPlaying {
  if (current.track === null) return current;

  const base = {
    ...current,
    receivedAt: current.receivedAt + 1,
  };

  switch (input.action) {
    case "play":
      return { ...base, state: "playing" };
    case "pause":
      return { ...base, state: "paused", position: input.position };
    case "seek":
      return { ...base, position: input.position };
    case "volume":
      return { ...base, volume: input.level };
    case "mute":
      return input.muted ? { ...base, volume: 0 } : base;
    default:
      return current;
  }
}

export interface PlaybackControlApi {
  control(input: PlaybackControl): Promise<boolean>;
  /** The shared seek path, so every surface sends whole seconds the same way. */
  seek(position: number): Promise<boolean>;
  /** The last failed control, phrased for the player, or null. */
  errorMessage: string | null;
}

/** One shared mutation around `control`, with optimistic now-playing updates. */
export function usePlaybackControl(): PlaybackControlApi {
  const [failedControl, setFailedControl] = useState<PlaybackControl | null>(null);
  const { mutate } = experimental_useRpcMutation({
    contract: nowPlayingRpcContract,
    method: "control",
    optimistic(input, cache) {
      cache.update("nowPlaying", null, (current) => optimisticNowPlaying(current, input));
    },
  });

  const control = useCallback(
    async (input: PlaybackControl) => {
      // A new action owns the error line, whether or not it succeeds.
      setFailedControl(null);
      try {
        await mutate(input);
        return true;
      } catch {
        // The SDK rolls the optimistic read back on rejection.
        setFailedControl(input);
        return false;
      }
    },
    [mutate],
  );

  const seek = useCallback(
    (position: number) => control({ action: "seek", position }),
    [control],
  );

  useEffect(() => {
    if (failedControl === null) return;
    const timer = setTimeout(() => setFailedControl(null), PLAYBACK_ERROR_CLEAR_MS);
    return () => clearTimeout(timer);
  }, [failedControl]);

  return {
    control,
    seek,
    errorMessage:
      failedControl === null ? null : playbackControlErrorMessage(failedControl),
  };
}

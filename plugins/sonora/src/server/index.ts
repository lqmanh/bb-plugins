import type { BbPluginApi } from "@get-bb/plugin-sdk";

import {
  SONORA_NOW_PLAYING_CHANNEL,
  emptyNowPlaying,
  nowPlayingRpcContract,
  type NowPlaying,
  type SonoraSnapshot,
} from "../shared/now-playing.ts";
import {
  isMeaningfulChange,
  runWatcher,
  toNowPlaying,
  type WatcherDeps,
} from "./watcher.ts";

/** Test seam: the watcher's process and clock dependencies. */
export type SonoraPluginDeps = Partial<WatcherDeps>;

/**
 * Server entry. The watcher owns the only child process; RPC and realtime read
 * the snapshot it keeps in memory. No UI, CLI, or agent surface lives here.
 */
export default function plugin(
  bb: BbPluginApi,
  overrides: SonoraPluginDeps = {},
) {
  const now = overrides.now ?? Date.now;
  let latest: NowPlaying = emptyNowPlaying("unavailable", 0);
  /** `undefined` means no baseline yet; `null` means the last payload was empty. */
  let previous: SonoraSnapshot | null | undefined;

  function publish(status: NowPlaying["status"]) {
    bb.realtime.publish(SONORA_NOW_PLAYING_CHANNEL, { status });
  }

  bb.rpc.register(nowPlayingRpcContract, {
    nowPlaying() {
      return latest;
    },
  });

  bb.background.service("watcher", {
    async start(signal) {
      const log: WatcherDeps["log"] =
        overrides.log ??
        ((level, message) => {
          bb.log[level](message);
        });

      await runWatcher({
        signal,
        onStatus(status) {
          if (status === "running") {
            // The seed snapshot follows in the same tick and owns `latest`.
            return;
          }
          previous = undefined;
          const changed = latest.status !== status;
          latest = emptyNowPlaying(status, now());
          if (changed) publish(status);
        },
        onSnapshot(snapshot, receivedAt) {
          const hadSnapshot = previous !== undefined;
          const changed =
            !hadSnapshot || isMeaningfulChange(previous ?? null, snapshot);
          previous = snapshot;
          latest = toNowPlaying(snapshot, receivedAt);
          if (changed) publish("running");
        },
        deps: { ...overrides, log },
      });
    },
  });

  bb.log.info("registered Sonora now-playing");
}

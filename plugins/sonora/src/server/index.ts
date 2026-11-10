import type { BbPluginApi } from "@get-bb/plugin-sdk";

import {
  NOW_PLAYING_RPC_TAG,
  emptyNowPlaying,
  nowPlayingRpcContract,
  type NowPlaying,
  type PlaybackControl,
  type SonoraSnapshot,
} from "../shared/now-playing.ts";
import {
  DEFAULT_BINARY,
  formatSeekPosition,
  isMeaningfulChange,
  runControl,
  runWatcher,
  toNowPlaying,
  type WatcherDeps,
} from "./watcher.ts";

/** Test seam: the watcher's process and clock dependencies. */
export type SonoraPluginDeps = Partial<WatcherDeps>;

/** Only these fixed commands are built here; nothing else reaches the CLI. */
function controlArgs(control: PlaybackControl): string[] {
  return control.action === "seek"
    ? ["seek", formatSeekPosition(control.position)]
    : [control.action];
}

export default function plugin(bb: BbPluginApi, overrides: SonoraPluginDeps = {}) {
  const now = overrides.now ?? Date.now;
  let latest: NowPlaying = emptyNowPlaying("unavailable", 0);
  /** `undefined` means no baseline yet; `null` means the last payload was empty. */
  let previous: SonoraSnapshot | null | undefined;
  /** The binary the watcher last probed, so controls use the same CLI. */
  let binary: string | null = null;

  bb.settings.define({
    threadBackdrop: {
      type: "boolean",
      label: "Album art behind threads",
      description:
        "Show the current track's cover behind threads and the New thread screen.",
      default: false,
    },
    nowPlayingBanner: {
      type: "boolean",
      label: "Show what's playing above the prompt box",
      description: "Show the current track above the prompt box while the agent works.",
      default: true,
    },
  });

  function invalidate() {
    bb.rpc.experimental_invalidate([NOW_PLAYING_RPC_TAG]);
  }

  bb.rpc.register(nowPlayingRpcContract, {
    nowPlaying() {
      return latest;
    },
    async control(input) {
      await runControl(binary ?? DEFAULT_BINARY, controlArgs(input), overrides);
      return null;
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
        onBinary(found) {
          binary = found;
        },
        onStatus(status) {
          if (status === "running") {
            // The seed snapshot follows in the same tick and owns `latest`.
            return;
          }
          previous = undefined;
          const changed = latest.status !== status;
          latest = emptyNowPlaying(status, now());
          if (changed) invalidate();
        },
        onSnapshot(snapshot, receivedAt) {
          const hadSnapshot = previous !== undefined;
          const changed = !hadSnapshot || isMeaningfulChange(previous ?? null, snapshot);
          previous = snapshot;
          latest = toNowPlaying(snapshot, receivedAt);
          if (changed) invalidate();
        },
        deps: { ...overrides, log },
      });
    },
  });

  bb.log.info("registered Sonora now-playing");
}

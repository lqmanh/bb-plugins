import type { CSSProperties, ReactNode } from "react";
import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";

import { type PlaybackState } from "../shared/now-playing.ts";
import { CoverBackdrop } from "./components/cover-backdrop.tsx";
import { MarqueeText } from "./components/marquee.tsx";
import { PlaybackProgressBar } from "./components/playback-progress.tsx";
import { SONORA_ICONS } from "./lib/constants.ts";
import { useCoverSource } from "./lib/cover.ts";
import { useNowPlaying } from "./lib/now-playing.ts";
import { formatTime, usePlaybackPosition } from "./lib/playback.ts";

const PLAYBACK_LABELS: Record<PlaybackState, string> = {
  playing: "Playing",
  paused: "Paused",
  loading: "Loading",
  idle: "Idle",
  unknown: "Unknown",
};

const STATE_ROW_CLASS_NAME = "px-2.5 py-2 text-2xs text-subtle-foreground";
const DISCLOSURE_BACKDROP_STYLE = {
  "--sonora-backdrop-wash-color": "var(--sidebar)",
} as CSSProperties;

function StatusRow({ children }: { children: ReactNode }) {
  return (
    <div role="status" className={STATE_ROW_CLASS_NAME}>
      {children}
    </div>
  );
}

function ErrorRow({ retry }: { retry: () => Promise<void> }) {
  return (
    <div
      role="alert"
      className={`flex min-w-0 items-center gap-1.5 ${STATE_ROW_CLASS_NAME}`}
    >
      <span className="min-w-0 flex-1">Couldn&apos;t load now playing.</span>
      <button
        type="button"
        className="shrink-0 rounded-sm text-sidebar-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        onClick={() => void retry()}
      >
        Retry
      </button>
    </div>
  );
}

function PlaybackProgress({
  isPlaying,
  position,
  duration,
  receivedAt,
}: {
  isPlaying: boolean;
  position: number | null;
  duration: number;
  receivedAt: number;
}) {
  const current = usePlaybackPosition(isPlaying, position, duration, receivedAt);

  return (
    <div className="flex items-center gap-2 text-2xs tabular-nums text-subtle-foreground">
      <span className="min-w-8 shrink-0 text-left">{formatTime(current)}</span>
      <PlaybackProgressBar
        current={current}
        duration={duration}
        className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-sidebar-border"
        fillClassName="h-full rounded-full bg-sidebar-foreground"
      />
      <span className="min-w-8 shrink-0 text-right">{formatTime(duration)}</span>
    </div>
  );
}

export function NowPlayingDisclosure() {
  const { data, track, state, error, isLoading, refetch } = useNowPlaying();
  const { cover: coverUrl, onError: handleCoverError } = useCoverSource(
    track?.cover ?? null,
  );

  if (data === undefined && error !== null) {
    return <ErrorRow retry={refetch} />;
  }

  if (data === undefined) {
    return isLoading ? <StatusRow>Loading now playing&hellip;</StatusRow> : null;
  }

  if (data.status === "unavailable") {
    return <StatusRow>Can&apos;t reach Sonora</StatusRow>;
  }

  if (data.status === "not-running") {
    return <StatusRow>Sonora is not running</StatusRow>;
  }

  if (track === null) {
    return <StatusRow>Nothing playing</StatusRow>;
  }

  const artists = track.artists.length > 0 ? track.artists.join(", ") : null;

  return (
    <div
      className="relative overflow-hidden p-2.5 text-sidebar-foreground"
      style={DISCLOSURE_BACKDROP_STYLE}
    >
      {coverUrl === null ? null : (
        <CoverBackdrop cover={coverUrl} onError={handleCoverError} />
      )}
      <div className="relative flex flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {coverUrl === null ? (
            <div
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-subtle-foreground"
            >
              <Icon name={SONORA_ICONS.audioLines} className="size-5" />
            </div>
          ) : (
            <img
              src={coverUrl}
              alt={`${track.title} cover`}
              referrerPolicy="no-referrer"
              className="size-10 shrink-0 rounded-md border border-sidebar-border object-cover"
              onError={handleCoverError}
            />
          )}
          <div className="min-w-0 flex-1">
            <MarqueeText text={track.title} className="text-xs font-medium" />
            {artists === null ? null : (
              <MarqueeText text={artists} className="text-2xs text-subtle-foreground" />
            )}
            {track.album === null || track.album.length === 0 ? null : (
              <MarqueeText
                text={track.album}
                className="text-2xs text-subtle-foreground"
              />
            )}
          </div>
          <span className="shrink-0 self-start rounded-sm border border-sidebar-border px-1.5 py-0.5 text-2xs leading-none text-sidebar-foreground">
            {PLAYBACK_LABELS[state ?? "unknown"]}
          </span>
        </div>
        <PlaybackProgress
          isPlaying={state === "playing"}
          position={data.position}
          duration={track.duration}
          receivedAt={data.receivedAt}
        />
      </div>
    </div>
  );
}

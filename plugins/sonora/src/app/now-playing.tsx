import { useState, type CSSProperties, type ReactNode } from "react";
import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";

import { CoverBackdrop } from "./components/cover-backdrop.tsx";
import { MarqueeText } from "./components/marquee.tsx";
import { OpenSonoraButton } from "./components/open-sonora-button.tsx";
import { PlaybackControls } from "./components/playback-controls.tsx";
import { SeekBar } from "./components/seek-bar.tsx";
import { FOCUS_RING_CLASS_NAME, SONORA_ICONS } from "./lib/constants.ts";
import { useCoverSource } from "./lib/cover.ts";
import { useNowPlaying } from "./lib/now-playing.ts";
import { usePlaybackControl } from "./lib/playback-control.ts";
import { formatTime, usePlaybackPosition } from "./lib/playback.ts";
import { sonoraOpenUrl } from "./lib/sonora-link.ts";

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
      <span className="min-w-0 flex-1 text-destructive-text">
        Couldn&apos;t load now playing.
      </span>
      <button
        type="button"
        className={`shrink-0 cursor-pointer rounded-sm text-sidebar-foreground underline-offset-2 hover:underline ${FOCUS_RING_CLASS_NAME}`}
        onClick={() => void retry()}
      >
        Retry
      </button>
    </div>
  );
}

export function NowPlayingDisclosure() {
  const { data, track, state, error, isLoading, refetch } = useNowPlaying();
  const { control, seek, errorMessage } = usePlaybackControl();
  const [scrub, setScrub] = useState<number | null>(null);
  const current = usePlaybackPosition(
    state === "playing",
    data?.position ?? null,
    track?.duration ?? 0,
    data?.receivedAt ?? 0,
  );
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
  const openUrl = sonoraOpenUrl(data.provider, track.id);
  const shown = scrub ?? current;

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
          <OpenSonoraButton
            url={openUrl}
            className={`size-11 shrink-0 rounded-md ${
              coverUrl === null
                ? "flex items-center justify-center bg-sidebar-accent text-subtle-foreground"
                : ""
            }`}
          >
            {coverUrl === null ? (
              <Icon
                name={SONORA_ICONS.audioLines}
                aria-hidden="true"
                className="size-5"
              />
            ) : (
              <img
                src={coverUrl}
                alt={`${track.title} cover`}
                referrerPolicy="no-referrer"
                className="size-full rounded-md border border-sidebar-border object-cover"
                onError={handleCoverError}
              />
            )}
          </OpenSonoraButton>
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
        </div>
        <div className="flex items-center gap-2 text-2xs tabular-nums text-subtle-foreground">
          <span className="min-w-8 shrink-0 text-left">{formatTime(shown)}</span>
          <SeekBar
            current={shown}
            duration={track.duration}
            onSeek={seek}
            onScrub={setScrub}
            className="min-w-0 flex-1"
            tone="sidebar"
            restHeight={4}
            activeHeight={6}
          />
          <span className="min-w-8 shrink-0 text-right">
            {formatTime(track.duration)}
          </span>
        </div>
        <PlaybackControls
          state={state}
          position={shown}
          control={control}
          className="justify-center"
        />
        {errorMessage === null ? null : (
          <p role="status" className="text-2xs text-destructive-text">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}

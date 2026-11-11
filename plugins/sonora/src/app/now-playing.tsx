import { experimental_Icon as Icon, useBbNavigate } from "@get-bb/plugin-sdk/app";
import { useState, type CSSProperties, type ReactNode } from "react";

import { CoverBackdrop } from "./components/cover-backdrop.tsx";
import { DebugButton } from "./components/debug-button.tsx";
import { MarqueeText } from "./components/marquee.tsx";
import { OpenSonoraButton } from "./components/open-sonora-button.tsx";
import { PlaybackControls } from "./components/playback-controls.tsx";
import { SeekBar } from "./components/seek-bar.tsx";
import { FOCUS_RING_CLASS_NAME, SONORA_ICONS } from "./lib/constants.ts";
import { useCoverSource } from "./lib/cover.ts";
import { cycleDebugProvider, toggleDebugMode, useDebugProvider } from "./lib/debug.ts";
import { useNowPlaying } from "./lib/now-playing.ts";
import { usePlaybackControl } from "./lib/playback-control.ts";
import { formatTime, usePlaybackPosition } from "./lib/playback.ts";
import { providerBadge } from "./lib/providers.ts";
import { sonoraOpenUrl } from "./lib/sonora-link.ts";

const STATE_ROW_CLASS_NAME = "px-2.5 py-2 text-2xs text-subtle-foreground";
const STATUS_ACTION_CLASS_NAME = `shrink-0 cursor-pointer rounded-sm text-sidebar-foreground underline-offset-2 hover:underline ${FOCUS_RING_CLASS_NAME}`;
const DISCLOSURE_BACKDROP_STYLE = {
  "--sonora-backdrop-wash-color": "var(--sidebar)",
} as CSSProperties;

function StatusActionButton({
  children,
  onClick,
  keepFocus = false,
}: {
  children: ReactNode;
  onClick: () => void;
  keepFocus?: boolean;
}) {
  return (
    <button
      type="button"
      className={STATUS_ACTION_CLASS_NAME}
      onMouseDown={keepFocus ? (event) => event.preventDefault() : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function StatusRow({
  children,
  role = "status",
  messageClassName,
  action,
}: {
  children: ReactNode;
  role?: "status" | "alert";
  messageClassName?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role={role}
      className={`flex min-w-0 items-center gap-1 ${STATE_ROW_CLASS_NAME}`}
    >
      <span className={`min-w-0 flex-1 ${messageClassName ?? ""}`}>{children}</span>
      {action}
      <DebugButton />
    </div>
  );
}

function ErrorRow({ retry }: { retry: () => Promise<void> }) {
  return (
    <StatusRow
      role="alert"
      messageClassName="text-destructive-text"
      action={<StatusActionButton onClick={() => void retry()}>Retry</StatusActionButton>}
    >
      Couldn&apos;t load now playing.
    </StatusRow>
  );
}

export function NowPlayingDisclosure() {
  const { data, track, state, error, isLoading, refetch } = useNowPlaying();
  const { control, seek, errorMessage } = usePlaybackControl();
  const navigate = useBbNavigate();
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
  const provider = useDebugProvider(data?.provider ?? null);

  if (data === undefined && error !== null) {
    return <ErrorRow retry={refetch} />;
  }

  if (data === undefined) {
    return isLoading ? <StatusRow>Loading now playing&hellip;</StatusRow> : null;
  }

  if (data.status === "unavailable") {
    return <StatusRow>Couldn&apos;t reach Sonora.</StatusRow>;
  }

  if (data.status === "not-running") {
    return (
      <StatusRow
        action={
          <StatusActionButton
            keepFocus
            onClick={() => navigate.openUrl(sonoraOpenUrl(null, null))}
          >
            Open
          </StatusActionButton>
        }
      >
        Sonora isn&apos;t running.
      </StatusRow>
    );
  }

  if (track === null) {
    return <StatusRow>Nothing is playing.</StatusRow>;
  }

  const artists = track.artists.length > 0 ? track.artists.join(", ") : null;
  const badge = providerBadge(provider);
  const gapClass = badge === null ? "" : `sonora-cover-gap-${badge.shape}`;
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
            badge={badge}
            placement="disclosure"
            className="size-11 shrink-0 rounded-md"
            onAltClick={() => cycleDebugProvider(data.provider)}
          >
            <span
              data-sonora-cover=""
              className={`flex size-full items-center justify-center overflow-hidden rounded-md ${
                coverUrl === null ? "bg-sidebar-accent text-subtle-foreground" : ""
              } ${gapClass}`}
              onDoubleClick={(event) => {
                if (event.altKey) toggleDebugMode();
              }}
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
                  className="size-full border border-sidebar-border object-cover"
                  onError={handleCoverError}
                />
              )}
            </span>
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
        <div className="grid grid-cols-[1fr_auto_1fr] items-center">
          <PlaybackControls
            state={state}
            position={shown}
            control={control}
            className="col-start-2"
          />
          <DebugButton className="col-start-3 justify-self-end" />
        </div>
        {errorMessage === null ? null : (
          <p role="status" className="text-2xs text-destructive-text">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}

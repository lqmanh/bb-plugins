import { experimental_Icon as Icon, useBbNavigate } from "@get-bb/plugin-sdk/app";
import { useState, type CSSProperties, type ReactNode } from "react";

import { FOCUS_RING_CLASS_NAME, SONORA_ICONS } from "../lib/constants.ts";
import { useCoverSource } from "../lib/cover.ts";
import { cycleDebugProvider, toggleDebugMode, useDebugProvider } from "../lib/debug.ts";
import { useNowPlaying } from "../lib/now-playing.ts";
import { usePlaybackControl } from "../lib/playback-control.ts";
import { formatTime, usePlaybackPosition } from "../lib/playback.ts";
import { providerBadge } from "../lib/providers.ts";
import { sonoraOpenUrl } from "../lib/sonora-link.ts";
import { CoverBackdrop } from "./cover-backdrop.tsx";
import { DebugButton } from "./debug-button.tsx";
import { LavaCanvas } from "./lava-canvas.tsx";
import { MarqueeText } from "./marquee.tsx";
import { OpenSonoraButton } from "./open-sonora-button.tsx";
import { PlaybackControls } from "./playback-controls.tsx";
import { SeekBar } from "./seek-bar.tsx";
import { VolumeControl } from "./volume-control.tsx";

export type PlayerSurface = "sidebar" | "card";

const SURFACES = {
  sidebar: {
    text: "text-sidebar-foreground",
    placeholder: "bg-sidebar-accent text-subtle-foreground",
    coverBorder: "border-sidebar-border",
    backdrop: { "--sonora-backdrop-wash-color": "var(--sidebar)" } as CSSProperties,
    frame: "",
  },
  card: {
    text: "text-popover-foreground",
    placeholder: "bg-accent text-subtle-foreground",
    coverBorder: "border-border",
    backdrop: { "--sonora-backdrop-wash-color": "var(--popover)" } as CSSProperties,
    frame: "rounded-md border border-border",
  },
} as const;

const STATE_ROW_CLASS_NAME = "p-2 text-2xs text-subtle-foreground";
const STATUS_ACTION_CLASS_NAME = `shrink-0 cursor-pointer rounded-sm underline-offset-2 hover:underline ${FOCUS_RING_CLASS_NAME}`;

function StatusActionButton({
  surface,
  children,
  onClick,
  keepFocus = false,
}: {
  surface: PlayerSurface;
  children: ReactNode;
  onClick: () => void;
  keepFocus?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${STATUS_ACTION_CLASS_NAME} ${SURFACES[surface].text}`}
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

function ErrorRow({
  retry,
  surface,
}: {
  retry: () => Promise<void>;
  surface: PlayerSurface;
}) {
  return (
    <StatusRow
      role="alert"
      messageClassName="text-destructive-text"
      action={
        <StatusActionButton surface={surface} onClick={() => void retry()}>
          Retry
        </StatusActionButton>
      }
    >
      Couldn&apos;t load now playing.
    </StatusRow>
  );
}

/** Shared by the disclosure and the card, so the two stay identical apart from surface colors. */
export function NowPlayingBody({ surface }: { surface: PlayerSurface }) {
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
    return <ErrorRow retry={refetch} surface={surface} />;
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
            surface={surface}
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

  const styles = SURFACES[surface];
  const artists = track.artists.length > 0 ? track.artists.join(", ") : null;
  const badge = providerBadge(provider);
  const gapClass = badge === null ? "" : `sonora-cover-gap-${badge.shape}`;
  const openUrl = sonoraOpenUrl(data.provider, track.id);
  const shown = scrub ?? current;

  return (
    <div
      className={`relative overflow-hidden p-2 ${styles.frame} ${styles.text}`}
      style={styles.backdrop}
    >
      {coverUrl === null ? null : (
        <CoverBackdrop cover={coverUrl} onError={handleCoverError} />
      )}
      <LavaCanvas
        cover={coverUrl}
        seed={track.id ?? track.title}
        playing={state === "playing"}
      />
      <div className="relative flex flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <OpenSonoraButton
            url={openUrl}
            badge={badge}
            placement={surface}
            className="size-11 shrink-0 rounded-md"
            onAltClick={() => cycleDebugProvider(data.provider)}
          >
            <span
              data-sonora-cover=""
              className={`flex size-full items-center justify-center overflow-hidden rounded-md ${
                coverUrl === null ? styles.placeholder : ""
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
                  className={`size-full border object-cover ${styles.coverBorder}`}
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
            tone={surface}
            restHeight={4}
            activeHeight={6}
          />
          <span className="min-w-8 shrink-0 text-right">
            {formatTime(track.duration)}
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center">
          {data.volume === null ? null : (
            <VolumeControl
              className="col-start-1 justify-self-start"
              volume={data.volume}
              control={control}
            />
          )}
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

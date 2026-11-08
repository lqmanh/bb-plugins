import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  experimental_Icon as Icon,
  experimental_useRpcQuery,
} from "@get-bb/plugin-sdk/app";

import {
  nowPlayingRpcContract,
  type PlaybackState,
} from "../shared/now-playing.ts";
import { CoverBackdrop, useCoverSource } from "./backdrop.tsx";
import { NOW_PLAYING_TICK_MS, SONORA_ICONS } from "./constants.ts";

/**
 * Client arrival time of the current snapshot, keyed by the server's
 * `receivedAt`. It lives outside the component because the disclosure unmounts
 * while closed: a per-mount anchor would jump the position forward on every
 * reopen.
 */
let arrivalAnchor: { receivedAt: number; arrivedAt: number } | null = null;

function clientArrivedAt(receivedAt: number): number {
  if (arrivalAnchor?.receivedAt !== receivedAt) {
    arrivalAnchor = { receivedAt, arrivedAt: Date.now() };
  }
  return arrivalAnchor.arrivedAt;
}

function formatTime(seconds: number): string {
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

function displayPosition(
  isPlaying: boolean,
  basePosition: number | null,
  duration: number,
  clientNow: number,
  arrivedAt: number,
): number {
  const base = basePosition ?? 0;
  const elapsed = isPlaying ? Math.max(0, (clientNow - arrivedAt) / 1_000) : 0;
  // Sonora reports whole seconds, so the client clock only fills the gaps.
  return Math.min(duration, base + elapsed);
}

function progressPercent(position: number, duration: number): number {
  if (duration <= 0) return 0;
  return (position / duration) * 100;
}

const PLAYBACK_LABELS: Record<PlaybackState, string> = {
  playing: "Playing",
  paused: "Paused",
  loading: "Loading",
  idle: "Idle",
  unknown: "Unknown",
};

function useClientClock(isPlaying: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(() => setNow(Date.now()), NOW_PLAYING_TICK_MS);
    return () => clearInterval(timer);
  }, [isPlaying]);

  return now;
}

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

function MarqueeText({
  text,
  className,
}: {
  text: string;
  className: string;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [scrollingText, setScrollingText] = useState<string | null>(null);
  const scrolling = scrollingText === text;

  function handleMouseEnter() {
    const element = textRef.current;
    if (element !== null && element.scrollWidth > element.clientWidth) {
      setScrollingText(text);
    }
  }

  return (
    <p
      className={`block overflow-hidden whitespace-nowrap ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setScrollingText(null)}
    >
      {scrolling ? (
        <span className="inline-flex w-max animate-[sonora-marquee_10s_linear_infinite]">
          <span className="pe-8">{text}</span>
          <span aria-hidden="true" className="pe-8">
            {text}
          </span>
        </span>
      ) : (
        <span ref={textRef} title={text} className="block truncate">
          {text}
        </span>
      )}
    </p>
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
  const clock = useClientClock(isPlaying && duration > 0);
  const arrivedAt = clientArrivedAt(receivedAt);
  const current = displayPosition(
    isPlaying,
    position,
    duration,
    clock,
    arrivedAt,
  );
  const percent = progressPercent(current, duration);
  const hasDuration = duration > 0;

  return (
    <div className="flex items-center gap-2 text-2xs tabular-nums text-subtle-foreground">
      <span className="min-w-8 shrink-0 text-left">{formatTime(current)}</span>
      <div
        role="progressbar"
        aria-label="Playback progress"
        aria-valuemin={0}
        aria-valuemax={hasDuration ? duration : undefined}
        aria-valuenow={hasDuration ? Math.floor(current) : undefined}
        className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-sidebar-border"
      >
        <div
          className="h-full rounded-full bg-sidebar-foreground"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="min-w-8 shrink-0 text-right">
        {formatTime(duration)}
      </span>
    </div>
  );
}

export function NowPlayingDisclosure() {
  const { data, error, isLoading, refetch } = experimental_useRpcQuery({
    contract: nowPlayingRpcContract,
    method: "nowPlaying",
    input: null,
  });
  const { cover: coverUrl, onError: handleCoverError } = useCoverSource(
    data?.track?.cover ?? null,
  );

  const isPlaying =
    data?.status === "running" &&
    data.state === "playing" &&
    data.track !== null;

  if (data === undefined && error !== null) {
    return <ErrorRow retry={refetch} />;
  }

  if (data === undefined) {
    return isLoading ? (
      <StatusRow>Loading now playing&hellip;</StatusRow>
    ) : null;
  }

  if (data.status === "unavailable") {
    return <StatusRow>Can&apos;t reach Sonora</StatusRow>;
  }

  if (data.status === "not-running") {
    return <StatusRow>Sonora is not running</StatusRow>;
  }

  const track = data.track;
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
        <CoverBackdrop
          cover={coverUrl}
          onError={handleCoverError}
        />
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
            <MarqueeText
              text={track.title}
              className="text-xs font-medium"
            />
            {artists === null ? null : (
              <MarqueeText
                text={artists}
                className="text-2xs text-subtle-foreground"
              />
            )}
            {track.album === null || track.album.length === 0 ? null : (
              <MarqueeText
                text={track.album}
                className="text-2xs text-subtle-foreground"
              />
            )}
          </div>
          <span className="shrink-0 self-start rounded-sm border border-sidebar-border px-1.5 py-0.5 text-2xs leading-none text-sidebar-foreground">
            {PLAYBACK_LABELS[data.state ?? "unknown"]}
          </span>
        </div>
        <PlaybackProgress
          isPlaying={isPlaying}
          position={data.position}
          duration={track.duration}
          receivedAt={data.receivedAt}
        />
      </div>
    </div>
  );
}

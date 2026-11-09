import {
  experimental_Icon as Icon,
  useComposer,
  useSettings,
} from "@get-bb/plugin-sdk/app";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { type NowPlayingTrack, type PlaybackState } from "../shared/now-playing.ts";
import { CoverBackdrop } from "./components/cover-backdrop.tsx";
import { MarqueeText } from "./components/marquee.tsx";
import { PlaybackProgressBar } from "./components/playback-progress.tsx";
import { Record } from "./components/record.tsx";
import { SONORA_ICONS } from "./lib/constants.ts";
import { useCoverSource } from "./lib/cover.ts";
import { isDebugMode } from "./lib/debug.ts";
import { useLavaLamp, useLavaPalette } from "./lib/lava.ts";
import { useNowPlaying } from "./lib/now-playing.ts";
import { formatTime, usePlaybackPosition } from "./lib/playback.ts";
import { useRunGrace } from "./lib/run-grace.ts";

/** Injected as `--sonora-strip-collapse` so the CSS transition matches. */
const COLLAPSE_MS = 200;
const DEFAULT_GAP_PX = 8;
/** The strip sits on a card, so its backdrop wash blends into the card color. */
const STRIP_BACKDROP_STYLE = {
  "--sonora-backdrop-wash-color": "var(--card)",
} as CSSProperties;

/** Keep the content mounted while the strip fades and collapses. */
function useCollapse(visible: boolean): { mounted: boolean; open: boolean } {
  const [mounted, setMounted] = useState(visible);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Paint one closed frame so the browser has a height to ease from.
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setOpen(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }

    setOpen(false);
    const timer = setTimeout(() => setMounted(false), COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  return { mounted, open };
}

export function NowPlayingStrip() {
  const { values } = useSettings();
  const composer = useComposer();
  const settingOn = values?.nowPlayingStrip !== false;
  const inThread = composer.scope.kind === "thread";
  const runShown = useRunGrace(composer.isRunning) || isDebugMode();
  const { data, track, state } = useNowPlaying(settingOn);

  const [lastTrack, setLastTrack] = useState<NowPlayingTrack | null>(track);
  useEffect(() => {
    if (track !== null) setLastTrack(track);
  }, [track]);

  const shouldShow = settingOn && inThread && runShown && track !== null;
  const { mounted, open } = useCollapse(shouldShow);
  const displayTrack = track ?? lastTrack;

  const rootRef = useRef<HTMLDivElement>(null);
  const [gap, setGap] = useState(DEFAULT_GAP_PX);
  useLayoutEffect(() => {
    if (!mounted) return;

    let element = rootRef.current?.parentElement ?? null;
    while (element !== null && getComputedStyle(element).display === "contents") {
      element = element.parentElement;
    }
    if (element === null) return;

    const next = Number.parseFloat(getComputedStyle(element).rowGap);
    if (Number.isFinite(next)) setGap(next);
  }, [mounted]);

  if (!mounted || displayTrack === null) return null;

  return (
    <div
      ref={rootRef}
      aria-hidden={open ? undefined : true}
      inert={!open}
      style={
        {
          "--sonora-strip-collapse": `${COLLAPSE_MS}ms`,
          height: open ? "var(--sonora-strip-height)" : 0,
          opacity: open ? 1 : 0,
          marginBottom: open ? 0 : -gap,
        } as CSSProperties
      }
      className="sonora-strip-collapse overflow-hidden"
    >
      <StripContent
        track={displayTrack}
        state={state}
        position={data?.position ?? null}
        receivedAt={data?.receivedAt ?? 0}
        visible={shouldShow}
      />
    </div>
  );
}

function StripContent({
  track,
  state,
  position,
  receivedAt,
  visible,
}: {
  track: NowPlayingTrack;
  state: PlaybackState | null;
  position: number | null;
  receivedAt: number;
  visible: boolean;
}) {
  const { cover, onError: handleCoverError } = useCoverSource(track.cover);
  const playing = state === "playing";
  const current = usePlaybackPosition(playing, position, track.duration, receivedAt);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = useLavaPalette(cover, track.id ?? track.title, canvasRef);

  useLavaLamp(canvasRef, palette, playing, visible);

  const artists = track.artists.length > 0 ? track.artists.join(", ") : null;
  const meta = [artists, track.album]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(" · ");
  const text = meta.length > 0 ? `${track.title} · ${meta}` : track.title;
  const content = (
    <>
      <span className="text-xs font-medium">{track.title}</span>
      {meta.length === 0 ? null : (
        <span className="text-2xs text-subtle-foreground"> · {meta}</span>
      )}
    </>
  );

  return (
    <div
      role="group"
      aria-label="Now playing"
      data-sonora-strip=""
      style={STRIP_BACKDROP_STYLE}
      onPointerDown={(event) => event.preventDefault()}
      className="relative flex h-[var(--sonora-strip-height)] items-center gap-4 overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xs"
    >
      {cover === null ? null : <CoverBackdrop cover={cover} onError={handleCoverError} />}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full blur-[8px] saturate-150"
      />

      <div className="relative z-10 flex min-w-0 flex-1 items-center gap-4 ps-3">
        <Record
          cover={cover}
          playing={playing}
          onCoverError={handleCoverError}
          fallback={<Icon name={SONORA_ICONS.audioLines} className="size-3" />}
        />
        <MarqueeText text={text} content={content} className="min-w-0 flex-1" />
      </div>

      <span className="relative z-10 shrink-0 text-2xs tabular-nums text-subtle-foreground">
        {formatTime(current)} / {formatTime(track.duration)}
      </span>

      <div
        data-sonora-controls-slot=""
        className="relative z-10 flex shrink-0 items-center pe-3"
      />

      {/* Inset by the corner radius so the strip's rounded corners never clip the ends. */}
      <PlaybackProgressBar
        current={current}
        duration={track.duration}
        className="absolute inset-x-2 bottom-0 z-10 h-0.5 overflow-hidden rounded-full bg-border/60"
        fillClassName="h-full bg-card-foreground/80"
      />
    </div>
  );
}

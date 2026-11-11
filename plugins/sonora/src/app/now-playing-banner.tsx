import {
  experimental_Icon as Icon,
  useComposer,
  useSettings,
} from "@get-bb/plugin-sdk/app";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { type NowPlayingTrack, type PlaybackState } from "../shared/now-playing.ts";
import { CoverBackdrop } from "./components/cover-backdrop.tsx";
import { MarqueeText } from "./components/marquee.tsx";
import { OpenSonoraButton } from "./components/open-sonora-button.tsx";
import { PlaybackControls } from "./components/playback-controls.tsx";
import { Record } from "./components/record.tsx";
import { SeekBar } from "./components/seek-bar.tsx";
import { SONORA_ICONS } from "./lib/constants.ts";
import { useCoverSource } from "./lib/cover.ts";
import { useDebugMode, useDebugProvider } from "./lib/debug.ts";
import { useLavaLamp, useLavaPalette } from "./lib/lava.ts";
import { useNowPlaying } from "./lib/now-playing.ts";
import { usePlaybackControl } from "./lib/playback-control.ts";
import { formatTime, usePlaybackPosition } from "./lib/playback.ts";
import { providerBadge } from "./lib/providers.ts";
import { useRunGrace } from "./lib/run-grace.ts";
import { sonoraOpenUrl } from "./lib/sonora-link.ts";

/** Injected as `--sonora-banner-collapse` so the CSS transition matches. */
const COLLAPSE_MS = 200;
const DEFAULT_GAP_PX = 8;
/** The banner sits on a card, so its backdrop wash blends into the card color. */
const BANNER_BACKDROP_STYLE = {
  "--sonora-backdrop-wash-color": "var(--card)",
} as CSSProperties;

/** Keep the content mounted while the banner fades and collapses. */
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

export function NowPlayingBanner() {
  const { values } = useSettings();
  const composer = useComposer();
  const settingOn = values?.nowPlayingBanner !== false;
  const inThread = composer.scope.kind === "thread";
  const debug = useDebugMode();
  const runShown = useRunGrace(composer.isRunning) || debug;
  const { data, track, state } = useNowPlaying(settingOn);

  const [lastTrack, setLastTrack] = useState<NowPlayingTrack | null>(track);
  useEffect(() => {
    if (track !== null) setLastTrack(track);
  }, [track]);

  const shouldShow = settingOn && inThread && runShown && track !== null;
  const { mounted, open } = useCollapse(shouldShow);
  const displayTrack = track ?? lastTrack;
  const provider = data?.provider ?? null;

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
          "--sonora-banner-collapse": `${COLLAPSE_MS}ms`,
          height: open ? "var(--sonora-banner-height)" : 0,
          opacity: open ? 1 : 0,
          marginBottom: open ? 0 : -gap,
        } as CSSProperties
      }
      className="sonora-banner-collapse overflow-hidden"
    >
      <BannerContent
        track={displayTrack}
        state={state}
        openUrl={sonoraOpenUrl(provider, displayTrack.id)}
        provider={provider}
        position={data?.position ?? null}
        receivedAt={data?.receivedAt ?? 0}
        visible={shouldShow}
      />
    </div>
  );
}

function BannerContent({
  track,
  state,
  openUrl,
  provider,
  position,
  receivedAt,
  visible,
}: {
  track: NowPlayingTrack;
  state: PlaybackState | null;
  openUrl: string;
  provider: string | null;
  position: number | null;
  receivedAt: number;
  visible: boolean;
}) {
  const effectiveProvider = useDebugProvider(provider);
  const badge = providerBadge(effectiveProvider);
  const { cover, onError: handleCoverError } = useCoverSource(track.cover);
  const { control, seek } = usePlaybackControl();
  const [scrub, setScrub] = useState<number | null>(null);
  const playing = state === "playing";
  const current = usePlaybackPosition(playing, position, track.duration, receivedAt);
  const shown = scrub ?? current;
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
      data-sonora-banner=""
      style={BANNER_BACKDROP_STYLE}
      onPointerDown={(event) => event.preventDefault()}
      className="relative flex h-[var(--sonora-banner-height)] items-center gap-4 overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xs"
    >
      {cover === null ? null : <CoverBackdrop cover={cover} onError={handleCoverError} />}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full blur-[8px] saturate-150"
      />

      <div className="relative z-10 flex min-w-0 flex-1 items-center gap-4 ps-3">
        <OpenSonoraButton
          url={openUrl}
          badge={badge}
          placement="banner"
          className="size-7 shrink-0 rounded-full"
        >
          <Record
            cover={cover}
            playing={playing}
            badgeGap={badge?.shape}
            onCoverError={handleCoverError}
            fallback={<Icon name={SONORA_ICONS.audioLines} className="size-3" />}
          />
        </OpenSonoraButton>
        <MarqueeText
          text={text}
          content={content}
          className="min-w-0 flex-1 text-xs leading-4"
        />
      </div>

      <span className="relative z-10 shrink-0 text-2xs leading-4 tabular-nums text-subtle-foreground">
        {formatTime(shown)} / {formatTime(track.duration)}
      </span>

      {/* The button box keeps the same 12 px inset as the record on the left. */}
      <div
        data-sonora-controls-slot=""
        className="relative z-10 flex shrink-0 items-center pe-3"
      >
        <PlaybackControls state={state} position={shown} control={control} />
      </div>

      {/* Inset by the corner radius so the banner's rounded corners never clip the ends. */}
      <SeekBar
        current={shown}
        duration={track.duration}
        onSeek={seek}
        onScrub={setScrub}
        align="end"
        className="absolute inset-x-2 bottom-0 z-10"
      />
    </div>
  );
}

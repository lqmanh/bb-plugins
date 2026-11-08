import { useCallback, useEffect, useRef, useState } from "react";

function BackdropLayer({
  cover,
  outgoing = false,
  animateIn = false,
  onError,
  onFadeEnd,
}: {
  cover: string;
  outgoing?: boolean;
  animateIn?: boolean;
  onError?: () => void;
  onFadeEnd?: () => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const animation = outgoing
    ? "animate-[sonora-backdrop-out_var(--sonora-backdrop-fade)_ease-out_forwards]"
    : animateIn
      ? "animate-[sonora-backdrop-in_var(--sonora-backdrop-fade)_ease-out]"
      : "";

  useEffect(() => {
    if (!outgoing || onFadeEnd === undefined) return;

    const image = imageRef.current;
    if (image === null) return;

    image.addEventListener("animationend", onFadeEnd);
    return () => image.removeEventListener("animationend", onFadeEnd);
  }, [outgoing, onFadeEnd]);

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 opacity-[var(--sonora-backdrop-opacity)]"
    >
      <img
        ref={imageRef}
        src={cover}
        alt=""
        referrerPolicy="no-referrer"
        onError={onError}
        className={`size-full scale-[var(--sonora-backdrop-scale)] object-cover blur-[var(--sonora-backdrop-blur)] saturate-[var(--sonora-backdrop-saturation)] ${animation}`}
      />
    </div>
  );
}

export interface CoverCrossfade {
  current: string;
  previous: string | null;
  finishFade: (cover: string) => void;
}

/**
 * Tracks the outgoing cover until its cross-fade animation ends. The fade
 * duration lives in CSS (`--sonora-backdrop-fade`), so callers only need to
 * report `animationend` for the outgoing layer.
 */
export function useCoverCrossfade(cover: string): CoverCrossfade {
  const [layers, setLayers] = useState<{
    current: string;
    previous: string | null;
  }>({ current: cover, previous: null });

  if (layers.current !== cover) {
    // Keep the old cover underneath while the new one fades in.
    setLayers({ current: cover, previous: layers.current });
  }

  const finishFade = useCallback((finishedCover: string) => {
    setLayers((state) =>
      state.previous === finishedCover ? { ...state, previous: null } : state,
    );
  }, []);

  return { ...layers, finishFade };
}

export interface CoverSource {
  cover: string | null;
  onError: () => void;
}

/**
 * Resolve a track's cover to a usable URL. Null and failed covers mean
 * "no cover". Empty covers are already null here.
 */
export function useCoverSource(rawCover: string | null): CoverSource {
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const cover = rawCover !== null && failedCover !== rawCover ? rawCover : null;
  const onError = useCallback(() => {
    if (rawCover !== null) setFailedCover(rawCover);
  }, [rawCover]);

  return { cover, onError };
}

/**
 * Blurred cover art behind a surface, with a cross-fade between covers.
 * Effect values live in `app.css` so other surfaces can reuse the same look.
 */
export function CoverBackdrop({
  cover,
  onError,
}: {
  cover: string;
  onError: () => void;
}) {
  const { current, previous, finishFade } = useCoverCrossfade(cover);

  return (
    <div
      aria-hidden="true"
      data-sonora-backdrop-layer=""
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {previous === null ? null : (
        <BackdropLayer
          key={previous}
          cover={previous}
          outgoing
          onFadeEnd={() => finishFade(previous)}
        />
      )}
      <BackdropLayer
        key={current}
        cover={current}
        animateIn={previous !== null}
        onError={onError}
      />
      <div className="sonora-backdrop-wash absolute inset-0" />
    </div>
  );
}

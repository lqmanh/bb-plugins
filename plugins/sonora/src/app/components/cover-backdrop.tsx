import { useEffect, useRef, type CSSProperties } from "react";

import { TRACK_FADE_MS } from "../lib/constants.ts";
import { useCoverCrossfade } from "../lib/cover.ts";

const TRACK_FADE_STYLE = {
  "--sonora-track-fade": `${TRACK_FADE_MS}ms`,
} as CSSProperties;

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
    ? "animate-[sonora-backdrop-out_var(--sonora-track-fade)_ease-in-out_forwards]"
    : animateIn
      ? "animate-[sonora-backdrop-in_var(--sonora-track-fade)_ease-in-out]"
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

/**
 * Blurred cover behind a surface, with a cross-fade between covers.
 * Effect values live in `app.css` so other surfaces can reuse the same look;
 * the fade takes `TRACK_FADE_MS`, like the lava.
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
      style={TRACK_FADE_STYLE}
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

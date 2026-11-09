import { useCallback, useState } from "react";

export interface CoverCrossfade {
  current: string;
  previous: string | null;
  finishFade: (cover: string) => void;
}

/**
 * Tracks the outgoing cover until its cross-fade animation ends. The fade
 * runs in CSS (`--sonora-track-fade`), so callers only need to report
 * `animationend` for the outgoing layer.
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

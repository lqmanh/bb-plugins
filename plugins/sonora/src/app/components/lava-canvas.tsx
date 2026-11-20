import { useSettings } from "@get-bb/plugin-sdk/app";
import { useRef } from "react";

import { useLavaSurface } from "../lib/lava.ts";

interface LavaCanvasProps {
  cover: string | null;
  seed: string;
  playing: boolean;
  /** Off while the surface is collapsing, so a closing banner stops drawing. */
  active?: boolean;
}

/** The lava layer over a surface's cover backdrop, when the setting allows it. */
export function LavaCanvas(props: LavaCanvasProps) {
  const { values } = useSettings();
  return values?.lavaLamp === false ? null : <LavaCanvasLayer {...props} />;
}

function LavaCanvasLayer({ cover, seed, playing, active = true }: LavaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLavaSurface(canvasRef, { cover, seed, playing, enabled: active });

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full blur-[8px] saturate-150"
    />
  );
}

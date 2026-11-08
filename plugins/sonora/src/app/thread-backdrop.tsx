import {
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  experimental_usePluginId,
  experimental_useRpcQuery,
  useSettings,
} from "@get-bb/plugin-sdk/app";

import { nowPlayingRpcContract } from "../shared/now-playing.ts";
import { CoverBackdrop, useCoverSource } from "./backdrop.tsx";

const PANEL_IDS = [
  "thread-detail-timeline-panel",
  "root-compose-main-panel",
] as const;
const ROOT_ATTRIBUTE = "data-sonora-backdrop";

function panelsInDocument(): HTMLElement[] {
  const panels: HTMLElement[] = [];
  for (const id of PANEL_IDS) {
    const panel = document.getElementById(id);
    if (panel !== null) panels.push(panel);
  }
  return panels;
}

function samePanels(
  current: readonly HTMLElement[],
  next: readonly HTMLElement[],
): boolean {
  return (
    current.length === next.length &&
    current.every((panel, index) => panel === next[index])
  );
}

/** Follows the panels bb recreates on navigation while a cover is shown. */
function useBackdropPanels(enabled: boolean): HTMLElement[] {
  const [panels, setPanels] = useState<HTMLElement[]>(panelsInDocument);

  useEffect(() => {
    if (!enabled) return;

    const sync = () => {
      const next = panelsInDocument();
      setPanels((current) => (samePanels(current, next) ? current : next));
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [enabled]);

  return panels;
}

const HEADER_HEIGHT_PX = 48;

/**
 * bb fades the thread content into the composer with a 24px overflow
 * gradient. The backdrop should end at the top of that gradient so the two
 * fades do not overlap. The New thread composer has no overflow fade, so the
 * backdrop runs to the bottom of the panel there.
 */
const COMPOSER_FADE_SELECTOR = '[data-overflow-fade="above"]';

function composerFades(panel: HTMLElement): HTMLElement[] {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(COMPOSER_FADE_SELECTOR),
  );
}

function composerFadeTop(panel: HTMLElement): number | null {
  let top: number | null = null;
  for (const fade of composerFades(panel)) {
    const rect = fade.getBoundingClientRect();
    if (rect.height === 0) continue;
    if (top === null || rect.top > top) top = rect.top;
  }
  return top;
}

function backdropBottom(panel: HTMLElement): number {
  const panelRect = panel.getBoundingClientRect();
  const fadeTop = composerFadeTop(panel);
  if (fadeTop === null) return 0;

  const bottom = panelRect.bottom - fadeTop;
  const maxBottom = Math.max(0, panelRect.height - HEADER_HEIGHT_PX);
  return Math.min(Math.max(0, bottom), maxBottom);
}

function sameBottoms(
  current: Readonly<Record<string, number>>,
  next: Readonly<Record<string, number>>,
): boolean {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);
  return (
    currentKeys.length === nextKeys.length &&
    currentKeys.every((key) => current[key] === next[key])
  );
}

function useBackdropBottoms(
  panels: readonly HTMLElement[],
  enabled: boolean,
): Record<string, number> {
  const [bottoms, setBottoms] = useState<Record<string, number>>({});

  useLayoutEffect(() => {
    if (!enabled) return;

    const update = () => {
      const next: Record<string, number> = {};
      for (const panel of panels) next[panel.id] = backdropBottom(panel);
      setBottoms((current) => (sameBottoms(current, next) ? current : next));
    };

    update();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }

    const observer = new ResizeObserver(update);
    for (const panel of panels) {
      observer.observe(panel);
      for (const fade of composerFades(panel)) {
        if (fade.parentElement !== null) observer.observe(fade.parentElement);
      }
    }

    return () => observer.disconnect();
  }, [panels, enabled]);

  return bottoms;
}

export function ThreadBackdrop() {
  const { values } = useSettings();
  return values?.threadBackdrop === true ? <ThreadBackdropActive /> : null;
}

function ThreadBackdropActive() {
  const pluginId = experimental_usePluginId();
  const { data } = experimental_useRpcQuery({
    contract: nowPlayingRpcContract,
    method: "nowPlaying",
    input: null,
  });
  const rawCover =
    data?.status === "running" && data.track !== null
      ? data.track.cover
      : null;
  const { cover, onError: handleCoverError } = useCoverSource(rawCover);
  const enabled = cover !== null;
  const panels = useBackdropPanels(enabled);
  const bottoms = useBackdropBottoms(panels, enabled);
  const show = enabled && panels.length > 0;

  useLayoutEffect(() => {
    if (!show) return;

    const root = document.documentElement;
    root.setAttribute(ROOT_ATTRIBUTE, "");
    return () => root.removeAttribute(ROOT_ATTRIBUTE);
  }, [show]);

  if (!show) return null;

  return (
    <>
      {panels.map((panel) =>
        createPortal(
          <div
            className="sonora-surface-backdrop"
            data-bb-plugin={pluginId}
            style={
              {
                "--sonora-surface-backdrop-bottom": `${bottoms[panel.id] ?? 0}px`,
              } as CSSProperties
            }
          >
            <CoverBackdrop
              cover={cover}
              onError={handleCoverError}
            />
          </div>,
          panel,
          panel.id,
        ),
      )}
    </>
  );
}

import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { experimental_usePluginId, useSettings } from "@get-bb/plugin-sdk/app";

import { CoverBackdrop } from "./components/cover-backdrop.tsx";
import { useCoverSource } from "./lib/cover.ts";
import { useNowPlaying } from "./lib/now-playing.ts";

const PANEL_IDS = ["thread-detail-timeline-panel", "root-compose-main-panel"] as const;
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
const TOP_FADE_SELECTOR = '[data-detail-scroll-fade="above"]';
const COMPOSER_FADE_SELECTOR = '[data-overflow-fade="above"]';

interface BackdropInsets {
  top: number;
  bottom: number;
}

function panelFades(panel: HTMLElement, selector: string): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(selector));
}

function topFadeBottom(panel: HTMLElement): number | null {
  let bottom: number | null = null;
  for (const fade of panelFades(panel, TOP_FADE_SELECTOR)) {
    const rect = fade.getBoundingClientRect();
    if (rect.height === 0) continue;
    if (bottom === null || rect.bottom > bottom) bottom = rect.bottom;
  }
  return bottom;
}

function composerFadeTop(panel: HTMLElement): number | null {
  let top: number | null = null;
  for (const fade of panelFades(panel, COMPOSER_FADE_SELECTOR)) {
    const rect = fade.getBoundingClientRect();
    if (rect.height === 0) continue;
    if (top === null || rect.top > top) top = rect.top;
  }
  return top;
}

function backdropInsets(panel: HTMLElement): BackdropInsets {
  const panelRect = panel.getBoundingClientRect();
  const fadeBottom = topFadeBottom(panel);
  const fadeTop = composerFadeTop(panel);

  const top =
    fadeBottom === null
      ? HEADER_HEIGHT_PX
      : Math.max(HEADER_HEIGHT_PX, fadeBottom - panelRect.top);
  const bottom = fadeTop === null ? 0 : panelRect.bottom - fadeTop;
  const maxBottom = Math.max(0, panelRect.height - top);

  return { top, bottom: Math.min(Math.max(0, bottom), maxBottom) };
}

function sameInsets(
  current: Readonly<Record<string, BackdropInsets>>,
  next: Readonly<Record<string, BackdropInsets>>,
): boolean {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);
  return (
    currentKeys.length === nextKeys.length &&
    currentKeys.every(
      (key) =>
        current[key]?.top === next[key]?.top &&
        current[key]?.bottom === next[key]?.bottom,
    )
  );
}

function useBackdropInsets(
  panels: readonly HTMLElement[],
  enabled: boolean,
): Record<string, BackdropInsets> {
  const [insets, setInsets] = useState<Record<string, BackdropInsets>>({});

  useLayoutEffect(() => {
    if (!enabled) return;

    const update = () => {
      const next: Record<string, BackdropInsets> = {};
      for (const panel of panels) next[panel.id] = backdropInsets(panel);
      setInsets((current) => (sameInsets(current, next) ? current : next));
    };

    update();

    const observer = new ResizeObserver(update);
    for (const panel of panels) {
      observer.observe(panel);
      for (const fade of panelFades(
        panel,
        `${TOP_FADE_SELECTOR}, ${COMPOSER_FADE_SELECTOR}`,
      )) {
        if (fade.parentElement !== null) observer.observe(fade.parentElement);
      }
    }

    return () => observer.disconnect();
  }, [panels, enabled]);

  return insets;
}

export function ThreadBackdrop() {
  const { values } = useSettings();
  return values?.threadBackdrop === true ? <ThreadBackdropActive /> : null;
}

function ThreadBackdropActive() {
  const pluginId = experimental_usePluginId();
  const { track } = useNowPlaying();
  const rawCover = track === null ? null : track.cover;
  const { cover, onError: handleCoverError } = useCoverSource(rawCover);
  const enabled = cover !== null;
  const panels = useBackdropPanels(enabled);
  const insets = useBackdropInsets(panels, enabled);
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
                "--sonora-surface-backdrop-top": `${insets[panel.id]?.top ?? HEADER_HEIGHT_PX}px`,
                "--sonora-surface-backdrop-bottom": `${insets[panel.id]?.bottom ?? 0}px`,
              } as CSSProperties
            }
          >
            <CoverBackdrop cover={cover} onError={handleCoverError} />
          </div>,
          panel,
          panel.id,
        ),
      )}
    </>
  );
}

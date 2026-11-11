import { useSyncExternalStore } from "react";

import { nextProvider } from "./providers.ts";

export const DEBUG_STORAGE_KEY = "sonora:debug";
const listeners = new Set<() => void>();

function readStorage(): boolean {
  try {
    return localStorage.getItem(DEBUG_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

let debugMode = readStorage();
/** `undefined` follows the real provider; `null` means no badge. */
let providerOverride: string | null | undefined;

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * The Sonora plugin's debug mode. It covers the plugin's frontend (`src/app/`) only.
 *
 * Turn it on by Alt+double-clicking the disclosure's cover, and off with the
 * debug button. It lasts across reloads and windows until turned off; any
 * value in local storage counts as on.
 */
export function isDebugMode(): boolean {
  return debugMode;
}

function updateDebugMode(): void {
  const next = readStorage();
  if (next === debugMode) return;

  debugMode = next;
  if (!next) providerOverride = undefined;
  notify();
}

export function setDebugMode(on: boolean): void {
  try {
    if (on) {
      localStorage.setItem(DEBUG_STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(DEBUG_STORAGE_KEY);
    }
  } catch {
    // Storage is unavailable, so debug mode stays off.
  }

  updateDebugMode();
}

export function toggleDebugMode(): void {
  setDebugMode(!debugMode);
}

/** The provider to draw: the debug override while active, otherwise the real one. */
function debugProvider(realProvider: string | null): string | null {
  return providerOverride === undefined ? realProvider : providerOverride;
}

/** Advance the shared debug provider override; only the disclosure calls this. */
export function cycleDebugProvider(realProvider: string | null): void {
  if (!debugMode) return;

  providerOverride = nextProvider(debugProvider(realProvider));
  notify();
}

/** Read the shared debug provider override in React. */
export function useDebugProvider(realProvider: string | null): string | null {
  return useSyncExternalStore(
    subscribe,
    () => debugProvider(realProvider),
    () => debugProvider(realProvider),
  );
}

function subscribe(listener: () => void): () => void {
  // Pick up a value written before this store first mounted, such as a reload.
  updateDebugMode();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Read debug mode in React; the value updates when the store changes. */
export function useDebugMode(): boolean {
  return useSyncExternalStore(subscribe, isDebugMode, isDebugMode);
}

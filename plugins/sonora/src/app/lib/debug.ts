import { useSyncExternalStore } from "react";

export const DEBUG_STORAGE_KEY = "sonora:debug";
const listeners = new Set<() => void>();

function readStorage(): boolean {
  try {
    return sessionStorage.getItem(DEBUG_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

let debugMode = readStorage();

/**
 * The Sonora plugin's debug mode. It covers the plugin's frontend (`src/app/`) only.
 *
 * Turn it on by Alt+double-clicking the disclosure's cover, and off with the
 * debug button. It lasts through reloads and ends when the window closes; any
 * value in session storage counts as on.
 */
export function isDebugMode(): boolean {
  return debugMode;
}

function updateDebugMode(): void {
  const next = readStorage();
  if (next === debugMode) return;

  debugMode = next;
  for (const listener of listeners) listener();
}

export function setDebugMode(on: boolean): void {
  try {
    if (on) {
      sessionStorage.setItem(DEBUG_STORAGE_KEY, "1");
    } else {
      sessionStorage.removeItem(DEBUG_STORAGE_KEY);
    }
  } catch {
    // Storage is unavailable, so debug mode stays off.
  }

  updateDebugMode();
}

export function toggleDebugMode(): void {
  setDebugMode(!debugMode);
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

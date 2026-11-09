const DEBUG_STORAGE_KEY = "sonora:debug";

/**
 * The Sonora plugin's debug mode. It covers the plugin's frontend (`src/app/`) only.
 *
 * Turn it on from devtools (top frame) with
 * `localStorage.setItem("sonora:debug", "1")`, and off by removing the key;
 * any value counts as on.
 */
export function isDebugMode(): boolean {
  try {
    return localStorage.getItem(DEBUG_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

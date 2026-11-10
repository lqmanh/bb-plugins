import { act } from "@testing-library/react";
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import { useSyncExternalStore } from "react";

export interface TestCodeTheme {
  mode: "dark" | "light";
  name: string;
  theme: null;
}

let current: TestCodeTheme = {
  mode: "light",
  name: "pierre-light",
  theme: null,
};
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useTestCodeTheme(): TestCodeTheme {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}

type RuntimeHost = {
  __bbPluginRuntime?: {
    pluginSdkApp?: Record<string, unknown>;
  };
};

/**
 * Point the SDK's code-theme hook at a mutable test store. The test runtime
 * reuses one pluginSdkApp object, so replacing its hook survives later
 * `installTestPluginRuntime()` calls.
 */
export function installCodeThemeRuntime(theme: Partial<TestCodeTheme> = {}): void {
  current = { mode: "light", name: "pierre-light", theme: null, ...theme };
  listeners.clear();
  installTestPluginRuntime();

  const runtime = (globalThis as RuntimeHost).__bbPluginRuntime;
  if (runtime?.pluginSdkApp === undefined) {
    throw new Error("test plugin runtime was not installed");
  }
  runtime.pluginSdkApp.experimental_useCodeTheme = useTestCodeTheme;
}

/** Change the theme exactly as the SDK hook would when bb switches. */
export async function setCodeTheme(theme: Partial<TestCodeTheme>): Promise<void> {
  await act(async () => {
    current = { ...current, ...theme };
    for (const listener of listeners) listener();
  });
}

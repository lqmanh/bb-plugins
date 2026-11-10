import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import plugin from "../../src/server/index.ts";
import type { WatcherDeps } from "../../src/server/watcher.ts";
import { NOW_PLAYING_RPC_TAG, type NowPlaying } from "../../src/shared/now-playing.ts";
import { FakeProcess } from "../support/fake-process.ts";
import { NOT_RUNNING_STDERR, snapshot } from "../support/fixtures.ts";
import { ScriptedExecFile } from "../support/scripted-exec-file.ts";
import { ScriptedSpawn } from "../support/scripted-spawn.ts";

const hosts: Array<ReturnType<typeof createFakePluginHost>> = [];

afterEach(async () => {
  for (const host of hosts.splice(0)) {
    await host.harness.lifecycle.dispose();
  }
});

function current(process: FakeProcess, value: unknown, code = 0): void {
  if (code === 3) process.stderr.send(NOT_RUNNING_STDERR);
  else process.stdout.send(`${JSON.stringify(value)}\n`);
  process.emit("close", code, null);
}

function watchLine(process: FakeProcess, value: unknown): void {
  process.stdout.send(`${JSON.stringify(value)}\n`);
}

function deps(
  script: ScriptedSpawn,
  overrides: Partial<WatcherDeps> = {},
): Partial<WatcherDeps> {
  return {
    spawn: script.spawn,
    delay: async () => {},
    now: () => 1_000,
    platform: "linux",
    home: "/home/test",
    exists: () => false,
    ...overrides,
  };
}

async function control(
  host: ReturnType<typeof createFakePluginHost>,
  input: unknown,
): Promise<null> {
  return (await host.harness.behavior.callRpc("control", input)) as null;
}

async function nowPlaying(
  host: ReturnType<typeof createFakePluginHost>,
): Promise<NowPlaying> {
  return (await host.harness.behavior.callRpc("nowPlaying", null)) as NowPlaying;
}

function invalidations(
  host: ReturnType<typeof createFakePluginHost>,
): ReadonlyArray<readonly string[] | null> {
  return host.harness.inspection.experimental_rpcInvalidations;
}

describe("Sonora plugin", () => {
  it("declares the thread backdrop and now-playing banner settings", async () => {
    const host = createFakePluginHost({ pluginId: "sonora" });
    hosts.push(host);

    await plugin(host.bb);

    expect(
      host.harness.inspection.registrations.settingsDescriptors.threadBackdrop,
    ).toMatchObject({
      type: "boolean",
      label: "Album art behind threads",
      default: false,
    });
    expect(
      host.harness.inspection.registrations.settingsDescriptors.nowPlayingBanner,
    ).toMatchObject({
      type: "boolean",
      label: "Show what's playing above the prompt box",
      default: true,
    });
  });

  it("serves null and nullable wire shapes, invalidates on change only, and logs", async () => {
    const host = createFakePluginHost({ pluginId: "sonora" });
    hosts.push(host);

    const script = new ScriptedSpawn([
      (process) => current(process, null),
      // Keep the watch stream empty so the running-with-no-track state is observable.
      () => {},
    ]);

    await plugin(host.bb, deps(script));

    expect(host.harness.inspection.registrations.rpcMethods).toContain("nowPlaying");
    expect(
      host.harness.inspection.registrations.services.map((service) => service.name),
    ).toContain("watcher");
    expect(await nowPlaying(host)).toMatchObject({
      status: "unavailable",
      track: null,
      receivedAt: 0,
    });

    const service = host.harness.behavior.runService("watcher");

    await vi.waitFor(async () => {
      const value = await nowPlaying(host);
      expect(value.status).toBe("running");
      expect(value.track).toBeNull();
    });
    expect(invalidations(host)).toContainEqual([NOW_PLAYING_RPC_TAG]);

    await vi.waitFor(() => expect(script.processes.length).toBe(2));
    const watch = script.processes[1]!;

    const base = snapshot();
    const nullable = snapshot({
      track: { ...base.track, id: null },
      origin: { kind: "radio", id: "radio-1", name: null },
      provider: null,
    });

    watchLine(watch, nullable);
    await vi.waitFor(async () => {
      const value = await nowPlaying(host);
      expect(value.track?.title).toBe("Night Drive");
      expect(value.track?.id).toBeNull();
      expect(value.origin?.name).toBeNull();
      expect(value.provider).toBeNull();
    });

    const invalidationsAfterTrack = invalidations(host).length;

    watchLine(watch, { ...nullable, position: 43 });
    expect(invalidations(host).length).toBe(invalidationsAfterTrack);

    watchLine(watch, {
      ...nullable,
      track: { ...nullable.track, id: "track-2", title: "Other" },
    });
    expect(invalidations(host).length).toBe(invalidationsAfterTrack + 1);

    expect(
      host.harness.inspection.logEntries.some((entry) =>
        entry.message.includes("Watching Sonora"),
      ),
    ).toBe(true);

    service.controller.abort();
    await service.done;
  });

  it("moves to not-running on a normal quit and back to running after relaunch", async () => {
    const host = createFakePluginHost({ pluginId: "sonora" });
    hosts.push(host);

    const gates: Array<() => void> = [];
    const script = new ScriptedSpawn([
      (process) => current(process, snapshot()),
      (process) => {
        watchLine(process, snapshot());
        process.emit("close", 0, null);
      },
      (process) => current(process, null, 3),
      (process) => current(process, snapshot({ position: 43 })),
      (process) => watchLine(process, snapshot({ position: 43 })),
    ]);

    await plugin(
      host.bb,
      deps(script, {
        delay: (ms, signal) => {
          if (ms === 500) return Promise.resolve();
          return new Promise<void>((resolve) => {
            if (signal.aborted) return resolve();
            const gate = () => {
              signal.removeEventListener("abort", gate);
              resolve();
            };
            gates.push(gate);
            signal.addEventListener("abort", gate, { once: true });
          });
        },
      }),
    );

    const service = host.harness.behavior.runService("watcher");

    await vi.waitFor(async () => {
      expect((await nowPlaying(host)).status).toBe("not-running");
    });

    expect(invalidations(host)).toHaveLength(2);

    expect(gates.length).toBe(1);
    gates.shift()!();

    await vi.waitFor(async () => {
      const value = await nowPlaying(host);
      expect(value.status).toBe("running");
      expect(value.track?.title).toBe("Night Drive");
      expect(value.position).toBe(43);
    });

    expect(invalidations(host)).toHaveLength(3);

    service.controller.abort();
    await service.done;
  });

  it("runs each playback command with the shared Sonora binary", async () => {
    const host = createFakePluginHost({ pluginId: "sonora" });
    hosts.push(host);

    const commands = [
      { input: { action: "play" }, args: ["play"] },
      // Pause's unrounded position only feeds the optimistic display, never the CLI.
      { input: { action: "pause", position: 42.75 }, args: ["pause"] },
      { input: { action: "next" }, args: ["next"] },
      { input: { action: "prev" }, args: ["prev"] },
    ] as const;
    const exec = new ScriptedExecFile(
      commands.map(() => (callback) => callback(null, "", "")),
    );
    await plugin(host.bb, { execFile: exec.execFile });

    for (const { input } of commands) {
      expect(await control(host, input)).toBeNull();
    }

    expect(exec.calls).toEqual(
      commands.map(({ args }) => ({
        file: "sonora",
        args,
        options: { timeout: 5_000, encoding: "utf8" },
      })),
    );
  });

  it("passes seek positions as m:ss or h:mm:ss, never bare seconds", async () => {
    const host = createFakePluginHost({ pluginId: "sonora" });
    hosts.push(host);

    const cases = [
      [0, "0:00"],
      [59, "0:59"],
      [90, "1:30"],
      [3_599, "59:59"],
      [3_600, "1:00:00"],
      [3_661, "1:01:01"],
    ] as const;
    const exec = new ScriptedExecFile(
      cases.map(() => (callback) => callback(null, "", "")),
    );
    await plugin(host.bb, { execFile: exec.execFile });

    for (const [position] of cases) {
      await control(host, { action: "seek", position });
    }

    expect(exec.calls).toEqual(
      cases.map(([, formatted]) => ({
        file: "sonora",
        args: ["seek", formatted],
        options: { timeout: 5_000, encoding: "utf8" },
      })),
    );
  });

  it.each([
    ["a negative seek position", { action: "seek", position: -1 }],
    ["a fractional seek position", { action: "seek", position: 1.5 }],
    ["a non-number seek position", { action: "seek", position: "10" }],
    ["a pause without a position", { action: "pause" }],
    ["a negative pause position", { action: "pause", position: -1 }],
    ["an infinite pause position", { action: "pause", position: Infinity }],
    ["a NaN pause position", { action: "pause", position: NaN }],
    ["a non-number pause position", { action: "pause", position: "10" }],
    ["an unknown action", { action: "toggle" }],
    ["extra fields", { action: "play", position: 10 }],
  ])("rejects %s without running a command", async (_name, input) => {
    const host = createFakePluginHost({ pluginId: "sonora" });
    hosts.push(host);

    const exec = new ScriptedExecFile([]);
    await plugin(host.bb, { execFile: exec.execFile });

    await expect(host.harness.behavior.callRpc("control", input)).rejects.toThrow();
    expect(exec.calls).toEqual([]);
  });

  it("reports a failed command with the CLI's message", async () => {
    const host = createFakePluginHost({ pluginId: "sonora" });
    hosts.push(host);

    const exec = new ScriptedExecFile([
      (callback) =>
        callback(
          Object.assign(new Error(NOT_RUNNING_STDERR.trim()), { code: 3 }),
          "",
          NOT_RUNNING_STDERR,
        ),
    ]);
    await plugin(host.bb, { execFile: exec.execFile });

    await expect(control(host, { action: "pause", position: 42 })).rejects.toThrow(
      NOT_RUNNING_STDERR.trim(),
    );
  });

  it.each([
    {
      name: "an exit code when stderr is empty",
      error: { code: 2 },
      message: "sonora play exited 2",
    },
    {
      name: "a timeout",
      error: { killed: true },
      message: "sonora play timed out",
    },
  ])("reports $name", async ({ error, message }) => {
    const host = createFakePluginHost({ pluginId: "sonora" });
    hosts.push(host);

    const exec = new ScriptedExecFile([
      (callback) => callback(Object.assign(new Error("Command failed"), error), "", ""),
    ]);
    await plugin(host.bb, { execFile: exec.execFile });

    await expect(control(host, { action: "play" })).rejects.toThrow(message);
  });

  it("uses the binary the watcher probed", async () => {
    const host = createFakePluginHost({ pluginId: "sonora" });
    hosts.push(host);

    const appBinary = "/Applications/Sonora.app/Contents/MacOS/sonora";
    const script = new ScriptedSpawn([
      (process) =>
        process.emit(
          "error",
          Object.assign(new Error("spawn sonora ENOENT"), { code: "ENOENT" }),
        ),
      (process) => current(process, snapshot()),
      (process) => watchLine(process, snapshot()),
    ]);
    const exec = new ScriptedExecFile([(callback) => callback(null, "", "")]);
    await plugin(
      host.bb,
      deps(script, {
        platform: "darwin",
        exists: (path) => path === appBinary,
        execFile: exec.execFile,
      }),
    );

    const service = host.harness.behavior.runService("watcher");
    await vi.waitFor(async () => {
      expect((await nowPlaying(host)).status).toBe("running");
    });

    expect(await control(host, { action: "next" })).toBeNull();
    expect(exec.calls[0]).toMatchObject({ file: appBinary, args: ["next"] });

    service.controller.abort();
    await service.done;
  });
});

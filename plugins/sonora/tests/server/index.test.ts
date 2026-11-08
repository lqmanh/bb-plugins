import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import plugin from "../../src/server/index.ts";
import {
  NOW_PLAYING_RPC_TAG,
  type NowPlaying,
} from "../../src/shared/now-playing.ts";
import { FakeProcess } from "../support/fake-process.ts";
import { NOT_RUNNING_STDERR, snapshot } from "../support/fixtures.ts";
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

async function nowPlaying(
  host: ReturnType<typeof createFakePluginHost>,
): Promise<NowPlaying> {
  return (await host.harness.behavior.callRpc(
    "nowPlaying",
    null,
  )) as NowPlaying;
}

function invalidations(
  host: ReturnType<typeof createFakePluginHost>,
): ReadonlyArray<readonly string[] | null> {
  return host.harness.inspection.experimental_rpcInvalidations;
}

describe("Sonora plugin", () => {
  it("serves null and nullable wire shapes, invalidates on change only, and logs", async () => {
    const host = createFakePluginHost({ pluginId: "sonora" });
    hosts.push(host);

    const script = new ScriptedSpawn([
      (process) => current(process, null),
      (process) => watchLine(process, snapshot()),
    ]);

    await plugin(host.bb, {
      spawn: script.spawn,
      delay: async () => {},
      now: () => 1_000,
      platform: "linux",
      home: "/home/test",
      exists: () => false,
    });

    expect(host.harness.inspection.registrations.rpcMethods).toContain(
      "nowPlaying",
    );
    expect(
      host.harness.inspection.registrations.services.map(
        (service) => service.name,
      ),
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

    await plugin(host.bb, {
      spawn: script.spawn,
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
      now: () => 1_000,
      platform: "linux",
      home: "/home/test",
      exists: () => false,
    });

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
});

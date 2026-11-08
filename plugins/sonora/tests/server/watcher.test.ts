import { describe, expect, it, vi } from "vitest";

import {
  binaryCandidates,
  errorBackoffDelay,
  isMeaningfulChange,
  normalizePlaybackState,
  notRunningBackoffDelay,
  parseCurrentLine,
  runWatcher,
  splitWatchLines,
  toNowPlaying,
  type SpawnWatcherProcess,
  type WatcherDeps,
} from "../../src/server/watcher.ts";
import {
  nowPlayingSchema,
  type NowPlayingStatus,
  type SonoraSnapshot,
} from "../../src/shared/now-playing.ts";
import { FakeProcess } from "../support/fake-process.ts";
import { NOT_RUNNING_STDERR, snapshot } from "../support/fixtures.ts";

function deps(overrides: Partial<WatcherDeps> = {}): Partial<WatcherDeps> {
  return {
    delay: async () => {},
    now: () => 1_000,
    platform: "linux",
    home: "/home/test",
    exists: () => false,
    log: () => {},
    ...overrides,
  };
}

describe("parseCurrentLine", () => {
  it("parses a snapshot, ignores blank lines, and accepts top-level null", () => {
    expect(parseCurrentLine(JSON.stringify(snapshot()))).toEqual({
      kind: "snapshot",
      snapshot: snapshot(),
    });
    expect(parseCurrentLine("  ")).toEqual({ kind: "blank" });
    expect(parseCurrentLine("null")).toEqual({ kind: "empty" });
  });

  it("accepts null track.id, origin.name, and provider", () => {
    const wire = {
      ...snapshot(),
      track: { ...snapshot().track, id: null },
      origin: { kind: "radio", id: "radio-1", name: null },
      provider: null,
    };
    const parsed = parseCurrentLine(JSON.stringify(wire));
    expect(parsed.kind).toBe("snapshot");
    if (parsed.kind !== "snapshot") return;
    expect(parsed.snapshot.track.id).toBeNull();
    expect(parsed.snapshot.origin?.name).toBeNull();
    expect(parsed.snapshot.provider).toBeNull();
  });

  it("accepts missing optional fields", () => {
    const wire = {
      state: "paused",
      track: { title: "No id", artists: [], album: "Album", duration: 10 },
      position: 0,
    };
    const parsed = parseCurrentLine(JSON.stringify(wire));
    expect(parsed.kind).toBe("snapshot");
    if (parsed.kind !== "snapshot") return;
    expect(parsed.snapshot.track.id).toBeNull();
    expect(parsed.snapshot.track.cover).toBeNull();
    expect(parsed.snapshot.origin).toBeNull();
    expect(parsed.snapshot.provider).toBeNull();
    expect(parsed.snapshot.volume).toBeNull();
  });

  it("normalizes an empty cover to null", () => {
    const wire = {
      ...snapshot(),
      track: { ...snapshot().track, cover: "" },
    };
    const parsed = parseCurrentLine(JSON.stringify(wire));
    expect(parsed.kind).toBe("snapshot");
    if (parsed.kind !== "snapshot") return;
    expect(parsed.snapshot.track.cover).toBeNull();
  });

  it("rejects malformed JSON, missing required fields, and track: null", () => {
    expect(parseCurrentLine("{")).toEqual({ kind: "malformed" });
    expect(parseCurrentLine(JSON.stringify({ state: "playing" }))).toEqual({
      kind: "malformed",
    });
    expect(
      parseCurrentLine(JSON.stringify({ ...snapshot(), track: null })),
    ).toEqual({ kind: "malformed" });
  });
});

describe("splitWatchLines", () => {
  it("keeps a trailing partial line", () => {
    expect(splitWatchLines('{"a":1}\n{"b":2}\n{"c"')).toEqual({
      lines: ['{"a":1}', '{"b":2}'],
      rest: '{"c"',
    });
  });
});

describe("normalizePlaybackState", () => {
  it("keeps documented states and maps new ones to unknown", () => {
    expect(normalizePlaybackState("playing")).toBe("playing");
    expect(normalizePlaybackState("paused")).toBe("paused");
    expect(normalizePlaybackState("buffering")).toBe("unknown");
  });
});

describe("toNowPlaying", () => {
  it("normalizes null fields and validates against the RPC schema", () => {
    const result = toNowPlaying(
      snapshot({
        track: { ...snapshot().track, id: null, album: null, cover: null },
        origin: { kind: "radio", id: "radio-1", name: null },
        provider: null,
        state: "paused",
      }),
      1_234,
    );

    expect(result).toMatchObject({
      status: "running",
      state: "paused",
      receivedAt: 1_234,
      provider: null,
      track: { id: null, album: null, cover: null },
      origin: { kind: "radio", id: "radio-1", name: null },
    });
    expect(nowPlayingSchema.safeParse(result).success).toBe(true);
  });

  it("turns a top-level null into running with no track", () => {
    const result = toNowPlaying(null, 10);
    expect(result).toMatchObject({
      status: "running",
      state: null,
      track: null,
      receivedAt: 10,
    });
    expect(nowPlayingSchema.safeParse(result).success).toBe(true);
  });
});

describe("isMeaningfulChange", () => {
  it("detects the first snapshot, empty transitions, track changes, and seeks", () => {
    expect(isMeaningfulChange(null, snapshot())).toBe(true);
    expect(isMeaningfulChange(snapshot(), null)).toBe(true);
    expect(isMeaningfulChange(null, null)).toBe(false);
    expect(isMeaningfulChange(snapshot(), snapshot({ position: 60 }))).toBe(true);
    expect(isMeaningfulChange(snapshot(), snapshot({ state: "paused" }))).toBe(true);
    expect(
      isMeaningfulChange(
        snapshot(),
        snapshot({ track: { ...snapshot().track, title: "Other" } }),
      ),
    ).toBe(true);
  });

  it("ignores clock ticks and future passthrough fields", () => {
    expect(isMeaningfulChange(snapshot(), snapshot({ position: 43 }))).toBe(false);

    const first = { ...snapshot(), futureTick: 1 } as SonoraSnapshot;
    const second = { ...snapshot(), futureTick: 2 } as SonoraSnapshot;
    expect(isMeaningfulChange(first, second)).toBe(false);
  });
});

describe("binaryCandidates", () => {
  it("tries PATH first, then macOS app bundles that exist", () => {
    expect(
      binaryCandidates({
        platform: "darwin",
        home: "/Users/test",
        exists: () => false,
      }),
    ).toEqual(["sonora"]);

    expect(
      binaryCandidates({
        platform: "darwin",
        home: "/Users/test",
        exists: () => true,
      }),
    ).toEqual([
      "sonora",
      "/Applications/Sonora.app/Contents/MacOS/sonora",
      "/Users/test/Applications/Sonora.app/Contents/MacOS/sonora",
    ]);

    expect(
      binaryCandidates({
        platform: "linux",
        home: "/home/test",
        exists: () => true,
      }),
    ).toEqual(["sonora"]);
  });
});

describe("backoff", () => {
  it("caps error and not-running delays separately", () => {
    expect(errorBackoffDelay(0)).toBe(1_000);
    expect(errorBackoffDelay(5)).toBe(30_000);
    expect(errorBackoffDelay(99)).toBe(30_000);

    expect(notRunningBackoffDelay(0)).toBe(1_000);
    expect(notRunningBackoffDelay(1)).toBe(2_000);
    expect(notRunningBackoffDelay(2)).toBe(4_000);
    expect(notRunningBackoffDelay(3)).toBe(5_000);
    expect(notRunningBackoffDelay(99)).toBe(5_000);
  });
});

describe("runWatcher", () => {
  it("treats top-level null as running with no track and starts watch", async () => {
    const current = new FakeProcess();
    const watch = new FakeProcess();
    const spawn = vi
      .fn()
      .mockReturnValueOnce(current.asProcess())
      .mockReturnValueOnce(watch.asProcess());
    const controller = new AbortController();
    const statuses: NowPlayingStatus[] = [];
    const snapshots: Array<SonoraSnapshot | null> = [];

    const done = runWatcher({
      signal: controller.signal,
      onStatus: (status) => statuses.push(status),
      onSnapshot: (value) => snapshots.push(value),
      deps: deps({ spawn: spawn as SpawnWatcherProcess }),
    });

    queueMicrotask(() => {
      current.stdout.send("null\n");
      current.emit("close", 0, null);
    });

    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
    expect(current.stdout.encoding).toBe("utf8");
    expect(current.stderr.encoding).toBe("utf8");
    expect(watch.stdout.encoding).toBe("utf8");
    expect(spawn).toHaveBeenNthCalledWith(2, "sonora", [
      "watch",
      "--json",
      "--position",
    ]);

    watch.stdout.send(`${JSON.stringify(snapshot())}\n`);
    controller.abort();
    await done;

    expect(statuses).toEqual(["running"]);
    expect(snapshots.map((value) => value?.track.title ?? null)).toEqual([
      null,
      "Night Drive",
    ]);
    expect(watch.signals).toContain("SIGTERM");
  });

  it("re-probes after watch exits 0 without reporting unavailable", async () => {
    const current1 = new FakeProcess();
    const watch1 = new FakeProcess();
    const current2 = new FakeProcess();
    const processes = [current1, watch1, current2];
    const spawn = vi.fn(() => processes.shift()!.asProcess());
    const controller = new AbortController();
    const statuses: NowPlayingStatus[] = [];
    const delays: number[] = [];
    let snapshots = 0;

    const done = runWatcher({
      signal: controller.signal,
      onStatus: (status) => statuses.push(status),
      onSnapshot: () => {
        snapshots += 1;
      },
      deps: deps({
        spawn: spawn as SpawnWatcherProcess,
        delay: async (ms) => {
          delays.push(ms);
          if (ms === 1_000) controller.abort();
        },
      }),
    });

    queueMicrotask(() => {
      current1.stdout.send(`${JSON.stringify(snapshot())}\n`);
      current1.emit("close", 0, null);
    });

    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
    watch1.stdout.send(`${JSON.stringify(snapshot({ position: 43 }))}\n`);
    watch1.emit("close", 0, null);

    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(3));
    current2.stderr.send(NOT_RUNNING_STDERR);
    current2.emit("close", 3, null);

    await done;
    expect(statuses).toEqual(["running", "not-running"]);
    expect(delays).toEqual([500, 1_000]);
    expect(snapshots).toBe(2);
  });

  it("backs off when watch keeps failing before delivering a line", async () => {
    let spawnCount = 0;
    const spawn = vi.fn(() => {
      const process = new FakeProcess();
      const index = spawnCount++;
      if (index % 2 === 0) {
        queueMicrotask(() => {
          process.stdout.send(`${JSON.stringify(snapshot())}\n`);
          process.emit("close", 0, null);
        });
      } else {
        queueMicrotask(() => process.emit("close", 1, null));
      }
      return process.asProcess();
    });
    const controller = new AbortController();
    const delays: number[] = [];
    const statuses: NowPlayingStatus[] = [];

    const done = runWatcher({
      signal: controller.signal,
      onStatus: (status) => statuses.push(status),
      onSnapshot: () => {},
      deps: deps({
        spawn: spawn as SpawnWatcherProcess,
        delay: async (ms) => {
          delays.push(ms);
          if (delays.length === 3) controller.abort();
        },
      }),
    });

    await done;
    expect(delays).toEqual([1_000, 2_000, 4_000]);
    expect(statuses).toEqual([
      "running",
      "unavailable",
      "running",
      "unavailable",
      "running",
      "unavailable",
    ]);
  });

  it("resets the failure backoff after watch delivers a line", async () => {
    let spawnCount = 0;
    const spawn = vi.fn(() => {
      const process = new FakeProcess();
      const index = spawnCount++;
      if (index % 2 === 0) {
        queueMicrotask(() => {
          process.stdout.send(`${JSON.stringify(snapshot())}\n`);
          process.emit("close", 0, null);
        });
      } else {
        queueMicrotask(() => {
          process.stdout.send(`${JSON.stringify(snapshot({ position: 43 }))}\n`);
          process.emit("close", 1, null);
        });
      }
      return process.asProcess();
    });
    const controller = new AbortController();
    const delays: number[] = [];

    const done = runWatcher({
      signal: controller.signal,
      onStatus: () => {},
      onSnapshot: () => {},
      deps: deps({
        spawn: spawn as SpawnWatcherProcess,
        delay: async (ms) => {
          delays.push(ms);
          if (delays.length === 2) controller.abort();
        },
      }),
    });

    await done;
    expect(delays).toEqual([1_000, 1_000]);
  });

  it("caps not-running retries at five seconds", async () => {
    const spawn = vi.fn(() => {
      const process = new FakeProcess();
      queueMicrotask(() => {
        process.stderr.send(NOT_RUNNING_STDERR);
        process.emit("close", 3, null);
      });
      return process.asProcess();
    });
    const controller = new AbortController();
    const delays: number[] = [];

    const done = runWatcher({
      signal: controller.signal,
      onStatus: () => {},
      onSnapshot: () => {},
      deps: deps({
        spawn: spawn as SpawnWatcherProcess,
        delay: async (ms) => {
          delays.push(ms);
          if (delays.length === 5) controller.abort();
        },
      }),
    });

    await done;
    expect(delays).toEqual([1_000, 2_000, 4_000, 5_000, 5_000]);
  });

  it("falls back to the app bundle when PATH has no sonora", async () => {
    const missing = new FakeProcess();
    const current = new FakeProcess();
    const spawn = vi
      .fn()
      .mockReturnValueOnce(missing.asProcess())
      .mockReturnValueOnce(current.asProcess());
    const controller = new AbortController();
    const statuses: NowPlayingStatus[] = [];
    const delays: number[] = [];

    const done = runWatcher({
      signal: controller.signal,
      onStatus: (status) => statuses.push(status),
      onSnapshot: () => {},
      deps: deps({
        spawn: spawn as SpawnWatcherProcess,
        platform: "darwin",
        exists: (path) =>
          path === "/Applications/Sonora.app/Contents/MacOS/sonora",
        delay: async (ms) => {
          delays.push(ms);
          controller.abort();
        },
      }),
    });

    queueMicrotask(() => {
      missing.emit(
        "error",
        Object.assign(new Error("not found"), { code: "ENOENT" }),
      );
    });

    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
    expect(spawn).toHaveBeenNthCalledWith(
      2,
      "/Applications/Sonora.app/Contents/MacOS/sonora",
      ["current", "--json"],
    );

    current.stderr.send(NOT_RUNNING_STDERR);
    current.emit("close", 3, null);
    await done;

    expect(statuses).toEqual(["not-running"]);
    expect(delays).toEqual([1_000]);
  });
});

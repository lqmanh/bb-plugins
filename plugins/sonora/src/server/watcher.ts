import { spawn as nodeSpawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  emptyNowPlaying,
  playbackStateSchema,
  sonoraCurrentSchema,
  type NowPlaying,
  type NowPlayingStatus,
  type PlaybackState,
  type SonoraOrigin,
  type SonoraSnapshot,
  type SonoraTrack,
} from "../shared/now-playing.ts";

/** Position deltas above this are treated as a seek, not a clock tick. */
const POSITION_JUMP_SECONDS = 2.5;
const ERROR_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];
const NOT_RUNNING_BACKOFF_CAP_MS = 5_000;
const WATCH_ENDED_DELAY_MS = 500;
const CURRENT_TIMEOUT_MS = 5_000;
const KILL_GRACE_MS = 3_000;

const playbackStateWithFallback = playbackStateSchema.catch("unknown");

export interface WatcherStream {
  on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  setEncoding?(encoding: BufferEncoding): unknown;
}

export interface WatcherProcess {
  stdout: WatcherStream | null;
  stderr: WatcherStream | null;
  on(event: "error", listener: (error: NodeJS.ErrnoException) => void): unknown;
  on(
    event: "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export type SpawnWatcherProcess = (command: string, args: string[]) => WatcherProcess;

export interface WatcherDeps {
  spawn: SpawnWatcherProcess;
  delay: (ms: number, signal: AbortSignal) => Promise<void>;
  now: () => number;
  platform: NodeJS.Platform;
  home: string;
  exists: (path: string) => boolean;
  log: (level: "debug" | "info" | "warn", message: string) => void;
}

export interface RunWatcherOptions {
  signal: AbortSignal;
  onStatus(status: NowPlayingStatus): void;
  /** `null` means Sonora is running with nothing loaded. */
  onSnapshot(snapshot: SonoraSnapshot | null, receivedAt: number): void;
  deps?: Partial<WatcherDeps>;
}

export type ParsedCurrentLine =
  | { kind: "blank" }
  | { kind: "empty" }
  | { kind: "snapshot"; snapshot: SonoraSnapshot }
  | { kind: "malformed" };

type ProbeResult =
  | { kind: "ok"; snapshot: SonoraSnapshot | null }
  | { kind: "not-running" }
  | { kind: "missing" }
  | { kind: "error"; message: string };

interface WatchResult {
  delivered: boolean;
  exit: "ended" | "not-running" | "error";
  message?: string;
}

/** Normalize a wire state value without rejecting values added later. */
export function normalizePlaybackState(value: string): PlaybackState {
  return playbackStateWithFallback.parse(value);
}

/** Convert the wire snapshot into the stable RPC shape. */
export function toNowPlaying(
  snapshot: SonoraSnapshot | null,
  receivedAt: number,
): NowPlaying {
  if (snapshot === null) {
    return emptyNowPlaying("running", receivedAt);
  }

  return {
    status: "running",
    state: normalizePlaybackState(snapshot.state),
    track: { ...snapshot.track },
    position: snapshot.position,
    volume: snapshot.volume,
    shuffle: snapshot.shuffle,
    repeat: snapshot.repeat,
    provider: snapshot.provider,
    liked: snapshot.liked,
    origin: snapshot.origin ? { ...snapshot.origin } : null,
    receivedAt,
  };
}

/**
 * Parse one `sonora current` output or `sonora watch` line. `null` is the
 * valid "nothing loaded" payload; blank lines are separate from malformed ones
 * so `watch` can ignore keepalive spacing without logging a warning.
 */
export function parseCurrentLine(line: string): ParsedCurrentLine {
  const trimmed = line.trim();
  if (!trimmed) return { kind: "blank" };

  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return { kind: "malformed" };
  }

  const parsed = sonoraCurrentSchema.safeParse(value);
  if (!parsed.success) return { kind: "malformed" };
  return parsed.data === null
    ? { kind: "empty" }
    : { kind: "snapshot", snapshot: parsed.data };
}

/** Split a stdout buffer into complete lines, keeping the trailing partial. */
export function splitWatchLines(buffer: string): {
  lines: string[];
  rest: string;
} {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  return { lines, rest };
}

function sameTrack(a: SonoraTrack, b: SonoraTrack): boolean {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.album === b.album &&
    a.cover === b.cover &&
    a.duration === b.duration &&
    a.artists.length === b.artists.length &&
    a.artists.every((artist, index) => artist === b.artists[index])
  );
}

function sameOrigin(a: SonoraOrigin | null, b: SonoraOrigin | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.id === b.id && a.name === b.name;
}

/**
 * True when the change is worth waking every client for. Only normalized,
 * displayed fields are compared, so a future field that changes every tick
 * cannot turn this into a 1 Hz broadcast.
 */
export function isMeaningfulChange(
  previous: SonoraSnapshot | null,
  next: SonoraSnapshot | null,
): boolean {
  if (previous === null && next === null) return false;
  if (previous === null || next === null) return true;

  if (!sameTrack(previous.track, next.track)) return true;
  if (!sameOrigin(previous.origin, next.origin)) return true;
  if (previous.state !== next.state) return true;
  if (previous.volume !== next.volume) return true;
  if (previous.shuffle !== next.shuffle) return true;
  if (previous.repeat !== next.repeat) return true;
  if (previous.provider !== next.provider) return true;
  if (previous.liked !== next.liked) return true;
  // Clock ticks move position by about a second; anything larger is a seek.
  if (Math.abs(next.position - previous.position) > POSITION_JUMP_SECONDS) {
    return true;
  }
  return false;
}

function cappedDelay(table: readonly number[], attempt: number): number {
  return table[Math.min(Math.max(attempt, 0), table.length - 1)]!;
}

/** Capped exponential delay for hard failures (including a missing binary). */
export function errorBackoffDelay(attempt: number): number {
  return cappedDelay(ERROR_BACKOFF_MS, attempt);
}

/** Not-running is normal, so it is noticed within five seconds at most. */
export function notRunningBackoffDelay(attempt: number): number {
  return Math.min(errorBackoffDelay(attempt), NOT_RUNNING_BACKOFF_CAP_MS);
}

/**
 * Commands to try in order: the CLI on PATH first, then the macOS app bundle.
 * Linux and Windows rely on PATH; the socket paths stay inside the CLI.
 */
export function binaryCandidates(
  options: {
    platform?: NodeJS.Platform;
    home?: string;
    exists?: (path: string) => boolean;
  } = {},
): string[] {
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  const exists = options.exists ?? existsSync;
  const candidates = ["sonora"];

  if (platform === "darwin") {
    for (const candidate of [
      "/Applications/Sonora.app/Contents/MacOS/sonora",
      join(home, "Applications/Sonora.app/Contents/MacOS/sonora"),
    ]) {
      if (exists(candidate)) candidates.push(candidate);
    }
  }

  return candidates;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNotRunningExit(code: number | null, stderr: string): boolean {
  return code === 3 || /not running/i.test(stderr);
}

function startChild(binary: string, args: string[], deps: WatcherDeps): WatcherProcess {
  const child = deps.spawn(binary, args);
  child.stdout?.setEncoding?.("utf8");
  child.stderr?.setEncoding?.("utf8");
  return child;
}

function defaultDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    let timer: NodeJS.Timeout;
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });
}

function defaultDeps(): WatcherDeps {
  return {
    spawn: (command, args) =>
      nodeSpawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
      }) as unknown as WatcherProcess,
    delay: defaultDelay,
    now: Date.now,
    platform: process.platform,
    home: homedir(),
    exists: existsSync,
    log: () => {},
  };
}

function runCurrent(
  binary: string,
  signal: AbortSignal,
  deps: WatcherDeps,
): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;
    let onAbort: (() => void) | null = null;
    let child: WatcherProcess;
    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (onAbort) signal.removeEventListener("abort", onAbort);
      resolve(result);
    };

    try {
      child = startChild(binary, ["current", "--json"], deps);
    } catch (error) {
      resolve({ kind: "error", message: errorMessage(error) });
      return;
    }

    timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ kind: "error", message: "sonora current timed out" });
    }, CURRENT_TIMEOUT_MS);
    timeout.unref?.();

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      finish(
        error.code === "ENOENT"
          ? { kind: "missing" }
          : { kind: "error", message: error.message },
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        const parsed = parseCurrentLine(stdout);
        if (parsed.kind === "snapshot") {
          finish({ kind: "ok", snapshot: parsed.snapshot });
        } else if (parsed.kind === "empty") {
          finish({ kind: "ok", snapshot: null });
        } else {
          finish({
            kind: "error",
            message: "sonora current returned invalid JSON",
          });
        }
      } else if (isNotRunningExit(code, stderr)) {
        finish({ kind: "not-running" });
      } else {
        finish({
          kind: "error",
          message: stderr.trim() || `sonora current exited ${code ?? "?"}`,
        });
      }
    });

    onAbort = () => child.kill("SIGTERM");
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}

function runWatch(
  binary: string,
  options: Pick<RunWatcherOptions, "signal" | "onSnapshot">,
  deps: WatcherDeps,
): Promise<WatchResult> {
  return new Promise((resolve) => {
    let buffer = "";
    let stderr = "";
    let delivered = false;
    let settled = false;
    let onAbort: (() => void) | null = null;
    let child: WatcherProcess;
    const finish = (exit: WatchResult["exit"], message?: string) => {
      if (settled) return;
      settled = true;
      if (onAbort) options.signal.removeEventListener("abort", onAbort);
      resolve(message === undefined ? { delivered, exit } : { delivered, exit, message });
    };

    try {
      child = startChild(binary, ["watch", "--json", "--position"], deps);
    } catch (error) {
      resolve({
        delivered: false,
        exit: "error",
        message: errorMessage(error),
      });
      return;
    }

    child.stdout?.on("data", (chunk) => {
      buffer += String(chunk);
      const { lines, rest } = splitWatchLines(buffer);
      buffer = rest;
      for (const line of lines) {
        const parsed = parseCurrentLine(line);
        if (parsed.kind === "blank") continue;
        if (parsed.kind === "malformed") {
          deps.log("warn", "Skipped a malformed line from sonora watch");
          continue;
        }
        options.onSnapshot(parsed.kind === "empty" ? null : parsed.snapshot, deps.now());
        delivered = true;
      }
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      finish("error", errorMessage(error));
    });
    child.on("close", (code) => {
      if (options.signal.aborted) {
        finish("error", "watching stopped");
      } else if (code === 0) {
        // A normal quit closes the stream with success; re-probe instead of
        // reporting unavailable.
        finish("ended");
      } else if (isNotRunningExit(code, stderr)) {
        finish("not-running");
      } else {
        finish("error", stderr.trim() || `sonora watch exited ${code ?? "?"}`);
      }
    });

    onAbort = () => {
      child.kill("SIGTERM");
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish("error", "watching stopped");
      }, KILL_GRACE_MS);
      timer.unref?.();
    };
    if (options.signal.aborted) onAbort();
    else options.signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Keep one `sonora watch --position` child alive until the signal aborts.
 * Sonora being closed is a normal state, not a crash: report it and retry with
 * a short backoff instead of throwing, so the host does not log a crash.
 */
export async function runWatcher(options: RunWatcherOptions): Promise<void> {
  const deps: WatcherDeps = { ...defaultDeps(), ...options.deps };
  let candidates: string[] | null = null;
  let candidateIndex = 0;
  let notRunningAttempt = 0;
  let errorAttempt = 0;

  while (!options.signal.aborted) {
    candidates ??= binaryCandidates({
      platform: deps.platform,
      home: deps.home,
      exists: deps.exists,
    });
    const binary = candidates[Math.min(candidateIndex, candidates.length - 1)]!;

    const probe = await runCurrent(binary, options.signal, deps);
    if (options.signal.aborted) break;

    if (probe.kind === "missing") {
      // Refresh on a miss so an app installed after startup is picked up.
      candidates = binaryCandidates({
        platform: deps.platform,
        home: deps.home,
        exists: deps.exists,
      });
      if (candidateIndex < candidates.length - 1) {
        candidateIndex += 1;
        deps.log("debug", `${binary} was not found; trying the next candidate`);
        continue;
      }
      deps.log("warn", "Could not find the Sonora CLI on PATH or in the app bundle");
      options.onStatus("unavailable");
      await deps.delay(errorBackoffDelay(errorAttempt++), options.signal);
      continue;
    }

    if (probe.kind === "not-running") {
      options.onStatus("not-running");
      await deps.delay(notRunningBackoffDelay(notRunningAttempt++), options.signal);
      continue;
    }

    if (probe.kind === "error") {
      deps.log("warn", `Sonora probe failed: ${probe.message}`);
      options.onStatus("unavailable");
      await deps.delay(errorBackoffDelay(errorAttempt++), options.signal);
      continue;
    }

    notRunningAttempt = 0;
    options.onStatus("running");
    options.onSnapshot(probe.snapshot, deps.now());
    deps.log("info", `Watching Sonora through ${binary}`);

    const result = await runWatch(
      binary,
      { signal: options.signal, onSnapshot: options.onSnapshot },
      deps,
    );
    if (options.signal.aborted) break;

    if (result.delivered) {
      notRunningAttempt = 0;
      errorAttempt = 0;
    }

    if (result.exit === "not-running") {
      options.onStatus("not-running");
      deps.log("info", "Sonora stopped");
      await deps.delay(notRunningBackoffDelay(notRunningAttempt++), options.signal);
      continue;
    }

    if (result.exit === "ended") {
      deps.log("info", "Sonora closed the watch stream; re-probing");
      await deps.delay(
        result.delivered ? WATCH_ENDED_DELAY_MS : errorBackoffDelay(errorAttempt++),
        options.signal,
      );
      continue;
    }

    options.onStatus("unavailable");
    deps.log("warn", `Sonora watch stopped: ${result.message ?? "unknown error"}`);
    await deps.delay(errorBackoffDelay(errorAttempt++), options.signal);
  }
}

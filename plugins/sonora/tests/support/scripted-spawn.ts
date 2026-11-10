import type { SpawnWatcherProcess } from "../../src/server/watcher.ts";
import { FakeProcess } from "./fake-process.ts";

export type Step = (process: FakeProcess) => void;

export interface SpawnCall {
  command: string;
  args: string[];
}

/** A spawn function that walks a fixed script, one process per call. */
export class ScriptedSpawn {
  readonly processes: FakeProcess[] = [];
  readonly calls: SpawnCall[] = [];
  private readonly steps: Step[];

  constructor(steps: Step[]) {
    this.steps = steps;
  }

  spawn: SpawnWatcherProcess = (command, args) => {
    this.calls.push({ command, args: [...args] });
    const step = this.steps.shift();
    if (!step) throw new Error("unexpected spawn");
    const process = new FakeProcess();
    this.processes.push(process);
    queueMicrotask(() => step(process));
    return process.asProcess();
  };
}

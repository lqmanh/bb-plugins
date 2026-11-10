import type {
  ExecFileCallback,
  ExecFileControl,
  ExecFileOptions,
} from "../../src/server/watcher.ts";

export type ExecFileStep = (callback: ExecFileCallback) => void;

export interface ExecFileCall {
  file: string;
  args: string[];
  options: ExecFileOptions;
}

/** A control seam that walks one fixed outcome per `execFile` call. */
export class ScriptedExecFile {
  readonly calls: ExecFileCall[] = [];
  private readonly steps: ExecFileStep[];

  constructor(steps: ExecFileStep[]) {
    this.steps = steps;
  }

  execFile: ExecFileControl = (file, args, options, callback) => {
    this.calls.push({ file, args: [...args], options });
    const step = this.steps.shift();
    if (step === undefined) throw new Error("unexpected execFile");
    queueMicrotask(() => step(callback));
  };
}

import { EventEmitter } from "node:events";

import type { WatcherProcess } from "../../src/server/watcher.ts";

export class FakeStream extends EventEmitter {
  encoding: BufferEncoding | null = null;

  setEncoding(encoding: BufferEncoding): this {
    this.encoding = encoding;
    return this;
  }

  send(value: string): void {
    this.emit("data", value);
  }
}

export class FakeProcess {
  readonly stdout = new FakeStream();
  readonly stderr = new FakeStream();
  readonly signals: NodeJS.Signals[] = [];
  private readonly events = new EventEmitter();

  on(event: string, listener: (...args: unknown[]) => void): this {
    this.events.on(event, listener);
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    return this.events.emit(event, ...args);
  }

  kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
    this.signals.push(signal);
    queueMicrotask(() => this.events.emit("close", null, signal));
    return true;
  }

  asProcess(): WatcherProcess {
    return this as unknown as WatcherProcess;
  }
}

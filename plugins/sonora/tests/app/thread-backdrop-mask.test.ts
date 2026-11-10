import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const APP_CSS = readFileSync(new URL("../../src/app/app.css", import.meta.url), "utf8");

function backdropBlock(): string {
  const block = /\.sonora-surface-backdrop\s*\{([^}]*)\}/.exec(APP_CSS)?.[1];
  if (block === undefined) throw new Error(".sonora-surface-backdrop was not found");
  return block;
}

describe("thread backdrop mask", () => {
  it("is transparent at both fades and strongest in the middle", () => {
    const block = backdropBlock();

    expect(block).toContain("transparent 0%");
    expect(block).toContain("#000 50%");
    expect(block).toContain("transparent 100%");
    // The stops mirror around the middle.
    expect(block).toContain("rgb(0 0 0 / 31%) 10%");
    expect(block).toContain("rgb(0 0 0 / 31%) 90%");
    expect(block).toContain("rgb(0 0 0 / 95%) 40%");
    expect(block).toContain("rgb(0 0 0 / 95%) 60%");
  });
});

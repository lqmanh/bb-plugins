import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const APP_CSS = readFileSync(new URL("../../src/app/app.css", import.meta.url), "utf8");

function squareMask(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(APP_CSS)?.[1];
  if (block === undefined) throw new Error(`${selector} was not found`);

  const encoded = /url\("data:image\/svg\+xml,([^"]+)"\)/.exec(block)?.[1];
  if (encoded === undefined) throw new Error(`${selector} has no inline SVG mask`);
  return decodeURIComponent(encoded);
}

describe("square badge gaps", () => {
  it.each([
    {
      selector: ".sonora-cover-gap-square",
      viewBox: "0 0 44 44",
      radius: 6,
      gapStart: "M36 30",
    },
    {
      selector: ".sonora-record-gap-square",
      viewBox: "0 0 28 28",
      radius: 4.5,
      gapStart: "M22 17.5",
    },
  ])("$selector cuts a rounded gap mask", ({ selector, viewBox, radius, gapStart }) => {
    const svg = squareMask(selector);

    expect(svg).toContain(`viewBox="${viewBox}"`);
    expect(svg).not.toContain('fill="transparent"');
    expect(svg).not.toContain("<rect");
    expect(svg).toContain('fill-rule="evenodd"');

    const path = /<path\b[^>]*\bd="([^"]+)"/.exec(svg)?.[1];
    if (path === undefined) throw new Error(`${selector} has no path`);

    // The outer rectangle and the gap are two subpaths; evenodd cuts the gap.
    expect(path.match(/[Mm]/g)).toHaveLength(2);
    expect(path).toContain(gapStart);
    expect(path).toContain(`A${radius} ${radius}`);
  });
});

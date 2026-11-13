// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Record } from "../../src/app/components/record.tsx";
import { setPrefersReducedMotion } from "../support/media.ts";

function renderRecord() {
  const animate = vi.spyOn(Element.prototype, "animate");
  const view = render(<Record cover={null} playing />);
  expect(animate).toHaveBeenCalledTimes(1);
  return { view, animation: animate.mock.results[0]?.value as Animation };
}

describe("Record", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("spins while playing", () => {
    const { view, animation } = renderRecord();
    expect(animation.playState).toBe("running");
    view.unmount();
  });

  it("holds still while playing when the system asks for reduced motion", () => {
    setPrefersReducedMotion(true);
    const { view, animation } = renderRecord();
    expect(animation.playState).toBe("paused");
    expect(animation.playbackRate).toBe(0);
    view.unmount();
  });
});

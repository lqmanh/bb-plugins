import { vi } from "vitest";

export interface FakeContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  globalCompositeOperation: string;
  filter: string;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  arc: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  translate: ReturnType<typeof vi.fn>;
  rotate: ReturnType<typeof vi.fn>;
  scale: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  getImageData: ReturnType<typeof vi.fn>;
}

export function fakeContext(): FakeContext {
  return {
    fillStyle: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    filter: "none",
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(),
  };
}

export function installCanvasContext(context: FakeContext = fakeContext()): FakeContext {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  return context;
}

/** jsdom has no layout; give canvases a size so the lava draws. Returns the restore. */
export function stubCanvasSize(width = 400, height = 44): () => void {
  const prototype = HTMLCanvasElement.prototype;
  Object.defineProperty(prototype, "clientWidth", {
    configurable: true,
    get: () => width,
  });
  Object.defineProperty(prototype, "clientHeight", {
    configurable: true,
    get: () => height,
  });
  return () => {
    Reflect.deleteProperty(prototype, "clientWidth");
    Reflect.deleteProperty(prototype, "clientHeight");
  };
}

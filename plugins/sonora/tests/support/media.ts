import { REDUCED_MOTION_QUERY } from "../../src/app/lib/motion.ts";

let reducedMotion = false;

export function setPrefersReducedMotion(on: boolean): void {
  reducedMotion = on;
}

/** jsdom has no `matchMedia`. Only the reduced-motion query can match, and only when set. */
export function fakeMatchMedia(query: string): MediaQueryList {
  return {
    get matches() {
      return query === REDUCED_MOTION_QUERY && reducedMotion;
    },
    addEventListener() {},
    removeEventListener() {},
  } as unknown as MediaQueryList;
}

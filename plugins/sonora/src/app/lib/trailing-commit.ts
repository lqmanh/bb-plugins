import { useCallback, useEffect, useRef } from "react";

/** How long input must pause before a debounced value is committed. */
export const COMMIT_DELAY_MS = 200;

/** Keep one value and commit it once input settles, or right away with `commitNow`. */
export function useTrailingCommit({
  commit,
  flushOnUnmount = false,
}: {
  commit(value: number): void;
  flushOnUnmount?: boolean;
}) {
  const pendingRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const commitRef = useRef(commit);

  commitRef.current = commit;

  const clear = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const run = useCallback(() => {
    clear();
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending !== null) commitRef.current(pending);
  }, [clear]);

  const schedule = useCallback(
    (value: number) => {
      pendingRef.current = value;
      clear();
      timerRef.current = window.setTimeout(run, COMMIT_DELAY_MS);
    },
    [clear, run],
  );

  const commitNow = useCallback(
    (value: number) => {
      clear();
      pendingRef.current = null;
      commitRef.current(value);
    },
    [clear],
  );

  const cancel = useCallback(() => {
    clear();
    pendingRef.current = null;
  }, [clear]);

  useEffect(
    () => () => {
      if (flushOnUnmount) run();
      else cancel();
    },
    [cancel, flushOnUnmount, run],
  );

  return { schedule, commitNow, cancel };
}

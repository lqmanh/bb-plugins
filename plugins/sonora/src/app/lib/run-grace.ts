import { useEffect, useState } from "react";

/** `isRunning` dips briefly between turns; wait this long before closing. */
const RUN_GRACE_MS = 1_000;

/** Keep the strip open through the composer's short turn-boundary dip. */
export function useRunGrace(isRunning: boolean): boolean {
  const [shown, setShown] = useState(isRunning);

  useEffect(() => {
    if (isRunning) {
      setShown(true);
      return;
    }

    const timer = setTimeout(() => setShown(false), RUN_GRACE_MS);
    return () => clearTimeout(timer);
  }, [isRunning]);

  return shown;
}

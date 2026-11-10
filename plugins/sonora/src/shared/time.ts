/**
 * Format a position as `m:ss`, or `h:mm:ss` when asked and the value reaches an
 * hour. A bare number is not a valid Sonora seek position, so the CLI always
 * asks for the hours form when needed.
 */
export function formatTime(seconds: number, options: { hours?: boolean } = {}): string {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3_600);
  const minutes = Math.floor((whole % 3_600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  if (options.hours === true && hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${rest}`;
  }
  return `${hours * 60 + minutes}:${rest}`;
}

/** The shared accessible playback bar used by the strip and disclosure. */
export function PlaybackProgressBar({
  current,
  duration,
  className,
  fillClassName,
}: {
  current: number;
  duration: number;
  className: string;
  fillClassName: string;
}) {
  const hasDuration = duration > 0;
  const percent = hasDuration ? (current / duration) * 100 : 0;

  return (
    <div
      role="progressbar"
      aria-label="Playback progress"
      aria-valuemin={0}
      aria-valuemax={hasDuration ? duration : undefined}
      aria-valuenow={hasDuration ? Math.floor(current) : undefined}
      className={className}
    >
      <div className={fillClassName} style={{ width: `${percent}%` }} />
    </div>
  );
}

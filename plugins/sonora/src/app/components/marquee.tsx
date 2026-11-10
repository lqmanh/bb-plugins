import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** How fast a marquee line scrolls; the duration follows the line width. */
const SCROLL_SPEED_PX_PER_SECOND = 40;

/** One line that scrolls on hover when the text does not fit. */
export function MarqueeText({
  text,
  content,
  className = "",
}: {
  text: string;
  content?: ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLParagraphElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const [scrollingText, setScrollingText] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [overflowing, setOverflowing] = useState(false);
  const scrolling = scrollingText === text;
  const line = content ?? text;

  // The fade marks a line that does not fit; re-measure when the text or the
  // available width changes.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const update = () => {
      const textSpan = textRef.current;
      if (textSpan === null) return;
      setOverflowing(textSpan.scrollWidth > textSpan.clientWidth);
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [text, scrolling]);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (track === null) return;
    // The track holds two copies of the line; one copy is one cycle.
    const copyWidth = track.getBoundingClientRect().width / 2;
    setDurationMs(Math.round((copyWidth / SCROLL_SPEED_PX_PER_SECOND) * 1_000));
  }, [scrollingText]);

  function handleMouseEnter() {
    const textSpan = textRef.current;
    if (textSpan !== null && textSpan.scrollWidth > textSpan.clientWidth) {
      setScrollingText(text);
    }
  }

  function handleMouseLeave() {
    setScrollingText(null);
  }

  return (
    <p
      ref={containerRef}
      className={`block overflow-hidden whitespace-nowrap ${
        overflowing ? "sonora-marquee-fade" : ""
      } ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {scrolling ? (
        <span
          ref={trackRef}
          style={durationMs > 0 ? { animationDuration: `${durationMs}ms` } : undefined}
          className="inline-flex w-max animate-[sonora-marquee_10s_linear_infinite]"
        >
          <span className="pe-8">{line}</span>
          <span aria-hidden="true" className="pe-8">
            {line}
          </span>
        </span>
      ) : (
        <span ref={textRef} title={text} className="block overflow-hidden">
          {line}
        </span>
      )}
    </p>
  );
}

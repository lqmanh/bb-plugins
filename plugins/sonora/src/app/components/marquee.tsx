import { useRef, useState, type ReactNode } from "react";

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
  const textRef = useRef<HTMLSpanElement>(null);
  const [scrollingText, setScrollingText] = useState<string | null>(null);
  const scrolling = scrollingText === text;
  const line = content ?? text;

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
      className={`block overflow-hidden whitespace-nowrap ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {scrolling ? (
        <span className="inline-flex w-max animate-[sonora-marquee_10s_linear_infinite]">
          <span className="pe-8">{line}</span>
          <span aria-hidden="true" className="pe-8">
            {line}
          </span>
        </span>
      ) : (
        <span ref={textRef} title={text} className="block truncate">
          {line}
        </span>
      )}
    </p>
  );
}

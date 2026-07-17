"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";

export function AutoFitHeading({ children, className, style }: { children: string; className?: string; style?: CSSProperties }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const heading = headingRef.current;
    if (!heading) return;

    const fit = () => {
      heading.style.fontSize = "";
      let size = Number.parseFloat(getComputedStyle(heading).fontSize);
      while (heading.scrollWidth > heading.clientWidth && size > 24) {
        size -= 1;
        heading.style.fontSize = `${size}px`;
      }
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(heading);
    return () => observer.disconnect();
  }, []);

  return <h1 className={className} ref={headingRef} style={style}>{children}</h1>;
}

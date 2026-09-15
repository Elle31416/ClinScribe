"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps a scroll container pinned to the newest item, and stops fighting the
 * user the moment they scroll up.
 *
 * Written by hand instead of calling `scrollIntoView({ behavior: "smooth" })` on
 * every caption change: with word-level agent deltas that fires ~15 times per
 * second, and each smooth scroll restarts an animation and forces layout.
 */
export function usePinnedScroll<Element extends HTMLElement>(threshold = 80) {
  const containerRef = useRef<Element | null>(null);
  const pinnedRef = useRef(true);

  const onScroll = () => {
    const element = containerRef.current;
    if (!element) return;
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    pinnedRef.current = distanceFromBottom <= threshold;
  };

  const scrollToEnd = () => {
    const element = containerRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  };

  useEffect(() => {
    if (pinnedRef.current) scrollToEnd();
  });

  return { containerRef, onScroll, scrollToEnd };
}

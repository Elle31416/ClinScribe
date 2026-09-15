"use client";

import { memo } from "react";
import { CaptionRow } from "./CaptionRow";
import { usePinnedScroll } from "./usePinnedScroll";
import type { Caption } from "../../lib/types";

/**
 * Live caption stream. Memoised on the caption array, so state updates that do
 * not touch captions (flagged mentions, action items, status) skip this subtree
 * entirely instead of reconciling the whole transcript.
 */
export const LiveCaptions = memo(function LiveCaptions({
  captions,
}: {
  captions: Caption[];
}) {
  const { containerRef, onScroll } = usePinnedScroll<HTMLDivElement>();

  return (
    <div
      className="captions"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-label="Live captions"
      ref={containerRef}
      onScroll={onScroll}
    >
      {!captions.length && (
        <p className="placeholder">Connecting. The agent will speak first.</p>
      )}
      {captions.map((caption) => (
        <CaptionRow key={caption.id} caption={caption} />
      ))}
    </div>
  );
});

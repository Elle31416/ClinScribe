"use client";

import { memo } from "react";
import { CaptionRow } from "./CaptionRow";
import { finalizeCaptions } from "../../lib/session-state";
import type { Caption } from "../../lib/types";

/**
 * Review transcript. Memoised and derived once per caption list, so editing a
 * SOAP field or ticking a checklist box does not rebuild it.
 */
export const TranscriptView = memo(function TranscriptView({
  captions,
}: {
  captions: Caption[];
}) {
  const finalized = finalizeCaptions(captions);

  if (!finalized.length) {
    return <p className="placeholder">No finalized transcript captured.</p>;
  }

  return (
    <div className="reviewTranscript" role="region" aria-label="Encounter transcript">
      {finalized.map((caption) => (
        <CaptionRow key={caption.id} caption={caption} />
      ))}
    </div>
  );
});

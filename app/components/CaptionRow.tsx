"use client";

import { memo } from "react";
import type { Caption } from "../../lib/types";

export const CaptionRow = memo(function CaptionRow({ caption }: { caption: Caption }) {
  return (
    <article className={`caption ${caption.role} ${caption.final ? "" : "partial"}`}>
      <strong>{caption.role === "user" ? "Patient" : "Agent"}</strong>
      <p>{caption.text}</p>
    </article>
  );
});

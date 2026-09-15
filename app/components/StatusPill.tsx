"use client";

import { memo } from "react";
import type { Status } from "../../lib/types";

/** Announced politely so screen-reader users hear connection state changes. */
export const StatusPill = memo(function StatusPill({ status }: { status: Status }) {
  return (
    <p className={`status ${status}`} role="status" aria-live="polite">
      <span aria-hidden="true" />
      {status.replaceAll("-", " ")}
    </p>
  );
});

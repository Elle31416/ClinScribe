"use client";

import { memo } from "react";
import type { ActionItem } from "../../lib/types";

export const SuggestedActions = memo(function SuggestedActions({
  items,
}: {
  items: ActionItem[];
}) {
  return (
    <section className="card compact" aria-label="Suggested actions">
      <div className="sectionTitle">
        <h2>Suggested actions</h2>
        <span>{items.length}</span>
      </div>
      {!items.length ? (
        <p className="placeholder">No suggested actions yet.</p>
      ) : (
        <ul className="stackList">
          {items.map((item) => (
            <li key={item.id}>{item.item}</li>
          ))}
        </ul>
      )}
    </section>
  );
});

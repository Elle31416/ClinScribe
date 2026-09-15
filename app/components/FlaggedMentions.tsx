"use client";

import { memo } from "react";
import { ENTITY_LABELS } from "../../lib/session-state";
import type { Entity } from "../../lib/types";

export const FlaggedMentions = memo(function FlaggedMentions({
  entities,
}: {
  entities: Entity[];
}) {
  return (
    <section className="card compact" aria-label="Flagged mentions">
      <div className="sectionTitle">
        <h2>Flagged mentions</h2>
        <span>{entities.length}</span>
      </div>
      {!entities.length ? (
        <p className="placeholder">No suggested flags yet.</p>
      ) : (
        <ul className="stackList">
          {entities.map((entity) => (
            <li key={entity.id}>
              <span className="pill">
                {ENTITY_LABELS[entity.entityType] ?? entity.entityType}
              </span>
              <strong>{entity.text}</strong>
              {entity.note && <small>{entity.note}</small>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

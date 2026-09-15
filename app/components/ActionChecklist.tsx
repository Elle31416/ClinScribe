"use client";

import { memo } from "react";
import type { ActionItem } from "../../lib/types";

const ActionRow = memo(function ActionRow({
  item,
  onToggle,
  onEdit,
  onRemove,
}: {
  item: ActionItem;
  onToggle: (id: string) => void;
  onEdit: (id: string, value: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <li>
      <input
        type="checkbox"
        checked={item.done}
        aria-label={`Mark ${item.item} complete`}
        onChange={() => onToggle(item.id)}
      />
      <input
        value={item.item}
        aria-label="Edit suggested action"
        onChange={(event) => onEdit(item.id, event.target.value)}
      />
      <button
        className="iconButton"
        type="button"
        aria-label={`Remove ${item.item}`}
        onClick={() => onRemove(item.id)}
      >
        Remove
      </button>
    </li>
  );
});

/**
 * Memoised per row: editing one item only re-renders that row, because the
 * other item objects keep their identity and the handlers are stable.
 */
export const ActionChecklist = memo(function ActionChecklist({
  items,
  onToggle,
  onEdit,
  onRemove,
}: {
  items: ActionItem[];
  onToggle: (id: string) => void;
  onEdit: (id: string, value: string) => void;
  onRemove: (id: string) => void;
}) {
  if (!items.length) {
    return <p className="placeholder">No suggested action items.</p>;
  }

  return (
    <ul className="checklist">
      {items.map((item) => (
        <ActionRow
          key={item.id}
          item={item}
          onToggle={onToggle}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
});

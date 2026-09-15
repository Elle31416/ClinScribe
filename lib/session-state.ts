import type { ActionItem, Caption, Entity, SoapNote } from "./types";

export const EMPTY_SOAP: SoapNote = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
};

export type EncounterPacket = {
  sessionId: string | null;
  captions: Caption[];
  entities: Entity[];
  soapNote: SoapNote;
  actionItems: ActionItem[];
};

export const ENTITY_LABELS: Record<Entity["entityType"], string> = {
  drug: "Drug",
  medical_condition: "Condition",
  injury: "Injury",
};

export function createId(prefix: string): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}

/** Append a streaming token without producing doubled spaces. */
function appendText(previous: string, next: string): string {
  if (!previous) return next;
  if (!next) return previous;
  const needsSpace = !/\s$/.test(previous) && !/^\s/.test(next);
  return needsSpace ? `${previous} ${next}` : `${previous}${next}`;
}

/**
 * Fold one caption event into the transcript.
 *
 * Field semantics differ by event, and getting them backwards is the classic
 * source of stuttering captions:
 * - `transcript.user.delta` sends the *full* transcript so far for an item, so
 *   partial user captions replace the previous text.
 * - `transcript.agent.delta` sends one word at a time, so partial agent captions
 *   append.
 * - Any final caption (`transcript.user` / `transcript.agent`) supersedes the
 *   partial for that id, including an interrupted reply that was trimmed.
 */
export function mergeCaption(current: Caption[], incoming: Caption): Caption[] {
  const index = current.findIndex((caption) => caption.id === incoming.id);
  if (index < 0) return [...current, incoming];

  const previous = current[index];
  const text =
    incoming.role === "agent" && !incoming.final
      ? appendText(previous.text, incoming.text)
      : incoming.text;

  return current.map((caption, position) =>
    position === index ? { ...incoming, text } : caption,
  );
}

/** Add a flagged entity unless the same mention is already listed. */
export function addEntity(current: Entity[], incoming: Entity): Entity[] {
  const duplicate = current.some(
    (entity) =>
      entity.entityType === incoming.entityType &&
      entity.text.toLowerCase() === incoming.text.toLowerCase(),
  );
  return duplicate ? current : [...current, incoming];
}

/** Add a suggested action unless the same item is already listed. */
export function addActionItem(current: ActionItem[], incoming: ActionItem): ActionItem[] {
  const duplicate = current.some(
    (item) => item.item.toLowerCase() === incoming.item.toLowerCase(),
  );
  return duplicate ? current : [...current, incoming];
}

/** Transcript lines that are safe to show or export: finalized captions only. */
export function finalizeCaptions(captions: Caption[]): Caption[] {
  return captions.filter((caption) => caption.final && caption.text.trim().length > 0);
}

export function buildPacket(
  sessionId: string | null,
  captions: Caption[],
  entities: Entity[],
  soapNote: SoapNote,
  actionItems: ActionItem[],
): EncounterPacket {
  return { sessionId, captions, entities, soapNote, actionItems };
}

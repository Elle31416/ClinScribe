import { ENTITY_LABELS, finalizeCaptions, type EncounterPacket } from "./session-state";

const NOTICE = "Synthetic/demo use only. AI-drafted; clinician review required.";

export function buildTextPacket(packet: EncounterPacket): string {
  const transcript = finalizeCaptions(packet.captions)
    .map((caption) => `${caption.role === "user" ? "Patient" : "Agent"}: ${caption.text}`)
    .join("\n\n");

  const flagged = packet.entities.length
    ? packet.entities.map(
        (entity) =>
          `- ${ENTITY_LABELS[entity.entityType] ?? entity.entityType}: ${entity.text}${
            entity.note ? ` — ${entity.note}` : ""
          }`,
      )
    : ["- None recorded"];

  const actions = packet.actionItems.length
    ? packet.actionItems.map((item) => `- [${item.done ? "x" : " "}] ${item.item}`)
    : ["- None recorded"];

  return [
    "AI VOICE INTAKE SCRIBE — ENCOUNTER PACKET",
    NOTICE,
    `Session: ${packet.sessionId ?? "not available"}`,
    "",
    "=== TRANSCRIPT ===",
    transcript || "No finalized transcript captured.",
    "",
    "=== FLAGGED MENTIONS (SUGGESTED) ===",
    ...flagged,
    "",
    "=== SOAP NOTE (AI-DRAFTED — REVIEW BEFORE USE) ===",
    `Subjective:\n${packet.soapNote.subjective}`,
    `\nObjective:\n${packet.soapNote.objective}`,
    `\nAssessment:\n${packet.soapNote.assessment}`,
    `\nPlan:\n${packet.soapNote.plan}`,
    "",
    "=== ACTION ITEMS (SUGGESTED) ===",
    ...actions,
  ].join("\n");
}

export function buildJsonPacket(packet: EncounterPacket) {
  return {
    notice: NOTICE,
    session_id: packet.sessionId,
    transcript: finalizeCaptions(packet.captions).map(({ role, text }) => ({ role, text })),
    flagged_entities: packet.entities.map(({ entityType, text, note }) => ({
      entity_type: entityType,
      text,
      note,
    })),
    soap_note: packet.soapNote,
    action_items: packet.actionItems.map(({ item, done }) => ({ item, done })),
  };
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  // Firefox only honours the click when the anchor is in the document.
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoke a moment later: Safari can cancel a download whose blob URL is gone.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportText(packet: EncounterPacket) {
  saveBlob(
    new Blob([buildTextPacket(packet)], { type: "text/plain;charset=utf-8" }),
    "encounter-packet.txt",
  );
}

export function exportJson(packet: EncounterPacket) {
  saveBlob(
    new Blob([JSON.stringify(buildJsonPacket(packet), null, 2)], {
      type: "application/json;charset=utf-8",
    }),
    "encounter-packet.json",
  );
}

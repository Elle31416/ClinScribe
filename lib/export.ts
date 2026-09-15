import type { ActionItem, Caption, Entity, SoapNote } from "./types";

type Packet = {
  sessionId: string | null;
  captions: Caption[];
  entities: Entity[];
  soapNote: SoapNote;
  actionItems: ActionItem[];
};

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportText(packet: Packet) {
  const transcript = packet.captions
    .filter((caption) => caption.final)
    .map((caption) => `${caption.role === "user" ? "Patient" : "Agent"}: ${caption.text}`)
    .join("\n\n");

  const flagged = packet.entities.length
    ? packet.entities.map((entity) =>
        `- ${entity.entityType}: ${entity.text}${entity.note ? ` — ${entity.note}` : ""}`,
      )
    : ["- None recorded"];

  const actions = packet.actionItems.length
    ? packet.actionItems.map((item) => `- [${item.done ? "x" : " "}] ${item.item}`)
    : ["- None recorded"];

  const lines = [
    "AI VOICE INTAKE SCRIBE — ENCOUNTER PACKET",
    "Synthetic/demo use only. AI-drafted; clinician review required.",
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
  ];

  saveBlob(
    new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }),
    "encounter-packet.txt",
  );
}

export function exportJson(packet: Packet) {
  const cleanPacket = {
    notice: "Synthetic/demo use only. AI-drafted; clinician review required.",
    session_id: packet.sessionId,
    transcript: packet.captions
      .filter((caption) => caption.final)
      .map(({ role, text }) => ({ role, text })),
    flagged_entities: packet.entities.map(({ entityType, text, note }) => ({
      entity_type: entityType,
      text,
      note,
    })),
    soap_note: packet.soapNote,
    action_items: packet.actionItems.map(({ item, done }) => ({ item, done })),
  };

  saveBlob(
    new Blob([JSON.stringify(cleanPacket, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
    "encounter-packet.json",
  );
}
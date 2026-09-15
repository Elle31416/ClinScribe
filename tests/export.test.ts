import assert from "node:assert/strict";
import test from "node:test";
import { buildJsonPacket, buildTextPacket } from "../lib/export";
import type { EncounterPacket } from "../lib/session-state";

const packet: EncounterPacket = {
  sessionId: "sess_abc123",
  captions: [
    { id: "item_1", role: "user", text: "I have a headache.", final: true },
    { id: "reply_1", role: "agent", text: "How long has that been?", final: true },
    { id: "item_2", role: "user", text: "still talking", final: false },
  ],
  entities: [
    { id: "entity-1", entityType: "drug", text: "20 mg Lisinopril", note: "daily" },
    { id: "entity-2", entityType: "medical_condition", text: "hypertension", note: "" },
  ],
  soapNote: {
    subjective: "Headache for three days.",
    objective: "No measurements reported.",
    assessment: "Reported headache, non-diagnostic.",
    plan: "Clinician review of reported medications.",
  },
  actionItems: [
    { id: "action-1", item: "Review requested renewal", done: false },
    { id: "action-2", item: "Confirm allergy list", done: true },
  ],
};

test("text packet carries the review notice, all sections, and no partial captions", () => {
  const text = buildTextPacket(packet);

  assert.match(text, /AI VOICE INTAKE SCRIBE — ENCOUNTER PACKET/);
  assert.match(text, /clinician review required/);
  assert.match(text, /Session: sess_abc123/);
  assert.match(text, /Patient: I have a headache\./);
  assert.match(text, /Agent: How long has that been\?/);
  assert.doesNotMatch(text, /still talking/, "partial captions must not be exported");
  assert.match(text, /- Drug: 20 mg Lisinopril — daily/);
  assert.match(text, /- Condition: hypertension/);
  assert.match(text, /Subjective:\nHeadache for three days\./);
  assert.match(text, /- \[ \] Review requested renewal/);
  assert.match(text, /- \[x\] Confirm allergy list/);
});

test("text packet degrades gracefully on an empty encounter", () => {
  const text = buildTextPacket({
    ...packet,
    sessionId: null,
    captions: [],
    entities: [],
    actionItems: [],
    soapNote: { subjective: "", objective: "", assessment: "", plan: "" },
  });

  assert.match(text, /Session: not available/);
  assert.match(text, /No finalized transcript captured\./);
  assert.equal(text.match(/- None recorded/g)?.length, 2);
});

test("json packet uses the documented snake_case schema", () => {
  const json = buildJsonPacket(packet);

  assert.equal(json.session_id, "sess_abc123");
  assert.equal(json.transcript.length, 2);
  assert.deepEqual(json.transcript[1], { role: "agent", text: "How long has that been?" });
  assert.deepEqual(json.flagged_entities[0], {
    entity_type: "drug",
    text: "20 mg Lisinopril",
    note: "daily",
  });
  assert.equal(json.soap_note.subjective, "Headache for three days.");
  assert.deepEqual(json.action_items.at(-1), { item: "Confirm allergy list", done: true });
  assert.match(json.notice, /Synthetic\/demo use only/);
});

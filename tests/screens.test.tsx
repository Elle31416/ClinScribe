import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionChecklist } from "../app/components/ActionChecklist";
import { LiveScreen } from "../app/components/LiveScreen";
import { SoapEditor } from "../app/components/SoapEditor";
import { StartScreen } from "../app/components/StartScreen";
import { SummaryScreen } from "../app/components/SummaryScreen";
import { TranscriptView } from "../app/components/TranscriptView";
import { EMPTY_SOAP } from "../lib/session-state";
import type { ActionItem, Caption, Entity } from "../lib/types";

const captions: Caption[] = [
  { id: "item_1", role: "user", text: "I have had a headache for three days.", final: true },
  { id: "reply_1", role: "agent", text: "Any medications?", final: true },
  { id: "item_2", role: "user", text: "still speaking", final: false },
];

const entities: Entity[] = [
  { id: "entity-1", entityType: "drug", text: "20 mg Lisinopril", note: "takes daily" },
  { id: "entity-2", entityType: "injury", text: "twisted ankle", note: "" },
];

const actionItems: ActionItem[] = [
  { id: "action-1", item: "Review requested renewal", done: false },
  { id: "action-2", item: "Confirm allergy list", done: true },
];

const noop = () => {};

test("start screen states the safety boundary and surfaces errors", () => {
  const markup = renderToStaticMarkup(
    <StartScreen error="Connection closed unexpectedly." onStart={noop} />,
  );

  assert.match(markup, /not a diagnostic tool/);
  assert.match(markup, /requires clinician review/);
  assert.match(markup, /role="alert"/);
  assert.match(markup, /Connection closed unexpectedly\./);
  assert.match(markup, /Start conversation/);
});

test("live screen renders captions, flags, actions, and status", () => {
  const markup = renderToStaticMarkup(
    <LiveScreen
      status="ready"
      error=""
      captions={captions}
      entities={entities}
      actionItems={actionItems}
      onEnd={noop}
    />,
  );

  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /I have had a headache for three days\./);
  assert.match(markup, /Patient/);
  assert.match(markup, /Agent/);
  assert.match(markup, /Drug/);
  assert.match(markup, /Injury/);
  assert.match(markup, /20 mg Lisinopril/);
  assert.match(markup, /Review requested renewal/);
  assert.match(markup, /End call/);
});

test("live screen shows an error banner and locks the end button while ending", () => {
  const markup = renderToStaticMarkup(
    <LiveScreen
      status="ending"
      error="Connection closed unexpectedly (code 1006)."
      captions={[]}
      entities={[]}
      actionItems={[]}
      onEnd={noop}
    />,
  );

  assert.match(markup, /role="alert"/);
  assert.match(markup, /Connection closed unexpectedly \(code 1006\)\./);
  assert.match(markup, /Ending…/);
  assert.match(markup, /disabled/);
  assert.match(markup, /Connecting\. The agent will speak first\./);
});

test("summary screen renders the transcript tab with proper tab semantics", () => {
  const markup = renderToStaticMarkup(
    <SummaryScreen
      sessionId="sess_abc123"
      captions={captions}
      soapNote={EMPTY_SOAP}
      actionItems={actionItems}
      onSoapChange={noop}
      onToggleAction={noop}
      onEditAction={noop}
      onRemoveAction={noop}
      onDownloadText={noop}
      onDownloadJson={noop}
      onReset={noop}
    />,
  );

  assert.match(markup, /role="tablist"/);
  assert.match(markup, /role="tab"/);
  assert.match(markup, /aria-selected="true"/);
  assert.match(markup, /role="tabpanel"/);
  assert.match(markup, /Session: sess_abc123/);
  assert.match(markup, /I have had a headache for three days\./);
  assert.doesNotMatch(markup, /still speaking/, "partials are not reviewable content");
  assert.match(markup, /Suggested content only/);
});

test("transcript view explains itself when nothing was finalized", () => {
  const markup = renderToStaticMarkup(<TranscriptView captions={[]} />);
  assert.match(markup, /No finalized transcript captured\./);
});

test("soap editor renders labelled, editable sections", () => {
  const markup = renderToStaticMarkup(
    <SoapEditor
      note={{ ...EMPTY_SOAP, subjective: "Headache for three days." }}
      onChange={noop}
    />,
  );

  for (const label of ["Subjective", "Objective", "Assessment", "Plan"]) {
    assert.match(markup, new RegExp(label));
  }
  assert.match(markup, /Headache for three days\./);
  assert.match(markup, /No plan draft was generated\./);
});

test("action checklist renders checkable, editable rows", () => {
  const markup = renderToStaticMarkup(
    <ActionChecklist
      items={actionItems}
      onToggle={noop}
      onEdit={noop}
      onRemove={noop}
    />,
  );

  assert.match(markup, /type="checkbox"/);
  assert.match(markup, /checked=""|checked/);
  assert.match(markup, /aria-label="Edit suggested action"/);
  assert.match(markup, /aria-label="Remove Confirm allergy list"/);

  const empty = renderToStaticMarkup(
    <ActionChecklist items={[]} onToggle={noop} onEdit={noop} onRemove={noop} />,
  );
  assert.match(empty, /No suggested action items\./);
});

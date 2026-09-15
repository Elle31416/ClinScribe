import assert from "node:assert/strict";
import test from "node:test";
import {
  addActionItem,
  addEntity,
  createId,
  finalizeCaptions,
  mergeCaption,
} from "../lib/session-state";
import type { ActionItem, Caption, Entity } from "../lib/types";

const user = (text: string, final = false): Caption => ({
  id: "item_1",
  role: "user",
  text,
  final,
});

const agent = (text: string, final = false): Caption => ({
  id: "reply_1",
  role: "agent",
  text,
  final,
});

test("user deltas are cumulative and replace the previous partial", () => {
  let captions: Caption[] = [];
  captions = mergeCaption(captions, user("I have had a"));
  captions = mergeCaption(captions, user("I have had a headache"));
  captions = mergeCaption(captions, user("I have had a headache for three days"));

  assert.equal(captions.length, 1);
  assert.equal(captions[0].text, "I have had a headache for three days");
  assert.equal(captions[0].final, false);
});

test("agent deltas are word-level and append", () => {
  let captions: Caption[] = [];
  captions = mergeCaption(captions, agent("Thanks"));
  captions = mergeCaption(captions, agent("for"));
  captions = mergeCaption(captions, agent("sharing."));

  assert.equal(captions[0].text, "Thanks for sharing.");
});

test("a final caption supersedes its partial", () => {
  let captions: Caption[] = [mergeCaption([], agent("I can help with that,"))[0]];
  captions = mergeCaption(captions, agent("I can help with that, let's start.", true));

  assert.equal(captions.length, 1);
  assert.equal(captions[0].final, true);
  assert.equal(captions[0].text, "I can help with that, let's start.");
});

test("interrupted caps of a reply do not duplicate existing text", () => {
  let captions: Caption[] = [];
  captions = mergeCaption(captions, user("wait, stop"));
  captions = mergeCaption(captions, agent("It sounds like"));

  // Interruption trims the agent turn back to what was actually spoken.
  captions = mergeCaption(captions, { ...agent("It sounds like", true), id: "reply_1" });

  assert.equal(captions.length, 2);
  assert.equal(captions[1].text, "It sounds like");
});

test("streaming tokens never produce doubled spaces", () => {
  let captions: Caption[] = [mergeCaption([], agent("Hello"))[0]];
  captions = mergeCaption(captions, agent(" there")); // token already carries the space
  captions = mergeCaption(captions, agent(" ")); // stray whitespace token
  captions = mergeCaption(captions, agent("friend"));

  assert.equal(captions[0].text, "Hello there friend");
});

test("interleaved items stay in arrival order and keep their identity", () => {
  let captions: Caption[] = [];
  captions = mergeCaption(captions, user("Patient one"));
  captions = mergeCaption(captions, agent("Agent reply"));
  captions = mergeCaption(captions, { ...user("Patient one, corrected"), id: "item_1" });

  assert.deepEqual(
    captions.map((caption) => caption.text),
    ["Patient one, corrected", "Agent reply"],
  );
});

test("flagged entities de-duplicate case-insensitively per type", () => {
  const entities: Entity[] = [
    { id: "a", entityType: "drug", text: "Lisinopril", note: "takes daily" },
  ];

  const repeated = addEntity(entities, {
    id: "b",
    entityType: "drug",
    text: "lisinopril",
    note: "repeated mention",
  });
  assert.equal(repeated, entities, "duplicate returns the same array, so React bails out");

  const distinct = addEntity(entities, {
    id: "c",
    entityType: "medical_condition",
    text: "Lisinopril",
    note: "different type",
  });
  assert.equal(distinct.length, 2);
});

test("action items de-duplicate and preserve object identity otherwise", () => {
  const items: ActionItem[] = [{ id: "a", item: "Review renewal", done: false }];

  assert.equal(
    addActionItem(items, { id: "b", item: "review renewal", done: false }),
    items,
  );
  assert.equal(addActionItem(items, { id: "c", item: "Book follow-up", done: false }).length, 2);
});

test("finalizeCaptions drops partials and blank finals", () => {
  const captions: Caption[] = [
    user("partial", false),
    user("complete", true),
    user("   ", true),
    user("agent line", true),
  ];

  assert.deepEqual(
    finalizeCaptions(captions).map((caption) => caption.text),
    ["complete", "agent line"],
  );
});

test("createId produces unique prefixed ids", () => {
  const ids = new Set(Array.from({ length: 50 }, () => createId("entity")));
  assert.equal(ids.size, 50);
  for (const id of ids) assert.match(id, /^entity-/);
});

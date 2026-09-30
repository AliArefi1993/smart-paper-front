import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyIdeaNote, mergeIdeaNotes, readIdeaNotes, restoreIdeaNotes, writeIdeaNotes } from "../src/lib/idea-notes.ts";
import { validateLocalBackup } from "../src/lib/local-import-safety.ts";

const note = (id, body) => ({ id, body, created_at: "2026-09-30T10:00:00.000Z", updated_at: "2026-09-30T10:00:00.000Z", parent_id: null });

test("idea notes save and read without losing branches", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const notes = [note("first", "An unfinished thought"), { ...note("second", "A branch"), parent_id: "first" }];
  writeIdeaNotes(storage, notes);
  assert.deepEqual(readIdeaNotes(storage), notes);
  assert.equal(dailyIdeaNote(notes, "2026-10-01")?.id !== undefined, true);
  assert.equal(dailyIdeaNote(notes, "2026-09-30"), null);
});

test("backup validates notes and merge keeps incoming edits by id", () => {
  const payload = { schema_version: 5, weeks: [], finance: { goal_amount: 0, entries: [] }, idea_notes: [note("one", "New thought")] };
  assert.doesNotThrow(() => validateLocalBackup(payload));
  assert.deepEqual(mergeIdeaNotes([note("one", "Old thought"), note("two", "Keep")], payload.idea_notes).map((item) => item.body), ["New thought", "Keep"]);
  assert.throws(() => validateLocalBackup({ ...payload, idea_notes: [{ ...note("bad", ""), body: "" }] }), /idea notes/);
  assert.throws(() => validateLocalBackup({ ...payload, idea_notes: [note("one", "A"), note("one", "B")] }), /idea notes/);
  assert.deepEqual(restoreIdeaNotes([note("old", "Keep")], undefined, "merge").map((item) => item.id), ["old"]);
  assert.deepEqual(restoreIdeaNotes([note("old", "Remove")], undefined, "replace"), []);
});

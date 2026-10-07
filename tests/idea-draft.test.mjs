import assert from "node:assert/strict";
import { test } from "node:test";
import { commitIdeaDraft, IdeaDraftCommitError, IDEA_DRAFT_KEY, IDEA_DRAFT_PREFIX, ideaDraftIssue, isIdeaDraftDirty, newIdeaDraft, readIdeaDraft, writeIdeaDraft } from "../src/lib/idea-draft.ts";
import { IDEA_NOTES_KEY, readIdeaNotes, writeIdeaNotes } from "../src/lib/idea-notes.ts";

const now = "2026-10-07T10:00:00.000Z";
const note = (id, body) => ({ id, body, created_at: now, updated_at: now, parent_id: null });
function device() {
  const values = new Map();
  return { values, fail: null, getItem(key) { if (this.fail === `read:${key}`) throw Error("device"); return values.get(key) ?? null; },
    setItem(key, value) { if (this.fail === `write:${key}`) throw Error("device"); values.set(key, value); },
    removeItem(key) { if (this.fail === `remove:${key}`) throw Error("device"); values.delete(key); } };
}

test("context and exact whitespace recover in new, edit, branch and legacy drafts", () => {
  const storage = device();
  for (const mode of ["new", "edit", "branch"]) {
    const draft = { ...newIdeaDraft("  فکر\nMixed writing  "), mode, source: mode === "new" ? null : note("original", "Saved") };
    writeIdeaDraft(storage, draft);
    assert.deepEqual(readIdeaDraft(storage), draft);
  }
  storage.setItem(IDEA_DRAFT_KEY, "  legacy فکر\n ");
  assert.deepEqual(readIdeaDraft(storage), newIdeaDraft("  legacy فکر\n "));
  for (const prose of ['[TODO] Think', '{"example":true}', '[1,2]', '  {unfinished']) {
    storage.setItem(IDEA_DRAFT_KEY, prose);
    assert.deepEqual(readIdeaDraft(storage), newIdeaDraft(prose));
  }
  storage.setItem(IDEA_DRAFT_KEY, IDEA_DRAFT_PREFIX + '{"version":1,"mode":"edit"}');
  assert.throws(() => readIdeaDraft(storage));
  assert.equal(storage.getItem(IDEA_DRAFT_KEY), IDEA_DRAFT_PREFIX + '{"version":1,"mode":"edit"}');
});

test("unchanged edit is clean; missing origins and changed saved edit require decisions", () => {
  const source = note("original", "Saved");
  const edit = { ...newIdeaDraft(source.body), mode: "edit", source };
  assert.equal(isIdeaDraftDirty(edit), false);
  assert.equal(isIdeaDraftDirty({ ...edit, body: "changed" }), true);
  assert.equal(ideaDraftIssue(edit, []), "missing");
  assert.equal(ideaDraftIssue({ ...edit, mode: "branch" }, []), "missing");
  assert.equal(ideaDraftIssue(edit, [{ ...source, body: "Newer" }]), "conflict");
  const storage = device();
  writeIdeaNotes(storage, [{ ...source, body: "Newer" }]);
  assert.throws(() => commitIdeaDraft(storage, edit, "new", now), /conflict/);
  assert.equal(readIdeaNotes(storage)[0].body, "Newer");
  commitIdeaDraft(storage, newIdeaDraft("Recovered independently"), "new", now);
  assert.deepEqual(readIdeaNotes(storage).map((item) => item.body), ["Recovered independently", "Newer"]);
});

test("save rereads authoritative collection and retains unrelated newer notes", () => {
  const storage = device();
  const source = note("original", "Saved");
  writeIdeaNotes(storage, [source, note("other", "New elsewhere")]);
  commitIdeaDraft(storage, { ...newIdeaDraft("Edited"), mode: "edit", source }, "unused", now);
  assert.deepEqual(readIdeaNotes(storage).map((item) => item.body), ["Edited", "New elsewhere"]);
});

test("failed receipt write cannot publish a note; failed note write retains recoverable identity", () => {
  const storage = device();
  const draft = newIdeaDraft("Keep this writing");
  storage.fail = `write:${IDEA_DRAFT_KEY}`;
  assert.throws(() => commitIdeaDraft(storage, draft, "stable", now), IdeaDraftCommitError);
  assert.deepEqual(readIdeaNotes(storage), []);
  storage.fail = `write:${IDEA_NOTES_KEY}`;
  let retained;
  try { commitIdeaDraft(storage, draft, "stable", now); } catch (cause) { retained = cause.draft; }
  assert.equal(retained.receipt.id, "stable");
  assert.equal(ideaDraftIssue(readIdeaDraft(storage), readIdeaNotes(storage)), null);
  storage.fail = null;
  commitIdeaDraft(storage, retained, "another-id", now);
  assert.deepEqual(readIdeaNotes(storage).map((item) => item.id), ["stable"]);
});

test("cleanup failure and reload reconcile actual new/edit/branch commits without duplicate writes", () => {
  for (const mode of ["new", "edit", "branch"]) {
    const storage = device();
    const source = note("original", "Saved");
    writeIdeaNotes(storage, [source]);
    const draft = { ...newIdeaDraft("Recovered writing"), mode, source: mode === "new" ? null : source };
    storage.fail = `remove:${IDEA_DRAFT_KEY}`;
    const first = commitIdeaDraft(storage, draft, "stable", now);
    assert.equal(first.cleanupFailed, true);
    const restored = readIdeaDraft(storage);
    assert.equal(ideaDraftIssue(restored, readIdeaNotes(storage)), "committed");
    const count = readIdeaNotes(storage).length;
    storage.fail = `write:${IDEA_NOTES_KEY}`;
    const retry = commitIdeaDraft(storage, restored, "duplicate", now);
    assert.equal(retry.cleanupFailed, false);
    assert.equal(readIdeaNotes(storage).length, count);
    assert.equal(storage.getItem(IDEA_DRAFT_KEY), null);
  }
});

test("malformed receipt cannot falsely acknowledge unrelated saved writing", () => {
  const storage = device();
  const unrelated = note("other", "Other saved writing");
  storage.setItem(IDEA_DRAFT_KEY, IDEA_DRAFT_PREFIX + JSON.stringify({ ...newIdeaDraft("Private draft"), receipt: unrelated }));
  assert.throws(() => readIdeaDraft(storage), /receipt/);
  assert.ok(storage.getItem(IDEA_DRAFT_KEY));
  const edit = { ...newIdeaDraft(unrelated.body), mode: "edit", source: note("original", "Before"), receipt: unrelated };
  storage.setItem(IDEA_DRAFT_KEY, IDEA_DRAFT_PREFIX + JSON.stringify(edit));
  assert.throws(() => readIdeaDraft(storage), /receipt/);
});

test("draft read/write/remove failures propagate and never erase the stored draft", () => {
  const storage = device();
  writeIdeaDraft(storage, newIdeaDraft("Retain"));
  storage.fail = `write:${IDEA_DRAFT_KEY}`;
  assert.throws(() => writeIdeaDraft(storage, newIdeaDraft("Visible newer")));
  storage.fail = `read:${IDEA_DRAFT_KEY}`;
  assert.throws(() => readIdeaDraft(storage));
  storage.fail = `remove:${IDEA_DRAFT_KEY}`;
  assert.throws(() => writeIdeaDraft(storage, newIdeaDraft()));
  storage.fail = null;
  assert.equal(readIdeaDraft(storage).body, "Retain");
});

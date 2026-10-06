import assert from "node:assert/strict";
import { test } from "node:test";
import { PlannerLocalAutosave } from "../src/lib/planner-local-autosave.ts";

const week = (start_date = "2026-10-03", note = "") => ({ start_date, note });

test("loading defaults never writes; each rapid accepted edit is stored before departure", () => {
  const writes = [];
  const owner = new PlannerLocalAutosave((value) => { writes.push(value); return value; });
  owner.load(week());
  assert.equal(writes.length, 0);
  assert.equal(owner.hasSaved(), false);
  for (const note of ["a", "ab", "abc"]) assert.equal(owner.edit(week(undefined, note)), true);
  // A route change or suspension directly after the input handler has no pending work.
  assert.equal(writes.at(-1).note, "abc");
  assert.equal(owner.hasSaved(), true);
  assert.equal(owner.hasFailure(), false);
});

test("storage failure retains newest writing, suspends automatic retries, and retries latest", () => {
  let attempts = 0;
  let fail = true;
  let stored;
  const owner = new PlannerLocalAutosave((value) => {
    attempts += 1;
    if (fail) throw new Error("QuotaExceededError");
    stored = value;
    return value;
  });
  owner.load(week());
  assert.equal(owner.edit(week(undefined, "first")), false);
  assert.equal(owner.edit(week(undefined, "newest")), false);
  assert.equal(attempts, 1);
  assert.equal(owner.recovery().note, "newest");
  // A fresh stored/default load on SPA return cannot displace failed content.
  assert.equal(owner.load(week()).note, "newest");
  assert.equal(owner.retry(), false);
  assert.equal(owner.hasFailure(), true);
  fail = false;
  assert.equal(owner.retry(), true);
  assert.equal(stored.note, "newest");
  assert.equal(owner.recovery(), null);
  assert.equal(owner.hasSaved(), true);
});

test("week identity prevents stale edits and switching away from a failed snapshot", () => {
  const writes = [];
  const owner = new PlannerLocalAutosave((value) => { writes.push(value); return value; });
  owner.load(week());
  owner.edit(week(undefined, "week A"));
  owner.load(week("2026-10-10"));
  assert.throws(() => owner.edit(week(undefined, "stale A")), /loaded week/);
  owner.edit(week("2026-10-10", "week B"));
  assert.deepEqual(writes.map((value) => [value.start_date, value.note]), [["2026-10-03", "week A"], ["2026-10-10", "week B"]]);
  const failed = new PlannerLocalAutosave(() => { throw new Error("SecurityError"); });
  failed.load(week());
  failed.edit(week(undefined, "retain"));
  assert.throws(() => failed.load(week("2026-10-10")), /Retry/);
  assert.equal(failed.recovery().note, "retain");
});

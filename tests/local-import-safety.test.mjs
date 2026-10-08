import assert from "node:assert/strict";
import { test } from "node:test";
import {
  commitStorageChanges,
  parseStoredJson,
  validateLocalBackup,
} from "../src/lib/local-import-safety.ts";

function backup() {
  return {
    schema_version: 4,
    weeks: [{
      start_date: "2026-09-26",
      days: Array.from({ length: 7 }, (_, index) => ({
        date: `2026-${index < 5 ? "09" : "10"}-${String(index < 5 ? 26 + index : index - 4).padStart(2, "0")}`,
        sections: { slot_1: { duration_minutes: 0, goal: "", note: "" } },
      })),
    }],
    finance: { goal_amount: 0, entries: [] },
  };
}

test("accepts a valid backup, including an empty finance ledger", () => {
  assert.doesNotThrow(() => validateLocalBackup(backup()));
});

test("accepts backups with an absent or supported schema version", () => {
  const legacy = backup();
  delete legacy.schema_version;
  assert.doesNotThrow(() => validateLocalBackup(legacy));
  for (const schemaVersion of [1, 2, 3, 4, 5]) {
    assert.doesNotThrow(() => validateLocalBackup({ ...backup(), schema_version: schemaVersion }));
  }
});

test("rejects a future schema version without changing the backup", () => {
  const futureBackup = { ...backup(), schema_version: 6 };
  const before = structuredClone(futureBackup);

  assert.throws(() => validateLocalBackup(futureBackup), /version is not supported/);
  assert.deepEqual(futureBackup, before);
});

test("rejects incomplete data before it can replace saved records", () => {
  const invalid = backup();
  invalid.weeks[0].days[3].sections = null;
  assert.throws(() => validateLocalBackup(invalid), /invalid planner day/);
  assert.throws(() => validateLocalBackup({ weeks: [], finance: {} }), /invalid finance data/);
});

test("rejects entries that would be silently discarded during normalization", () => {
  const invalid = backup();
  invalid.weeks[0].days[0].sections = { unknown: { duration_minutes: 20, goal: "Lost", note: "" } };
  assert.throws(() => validateLocalBackup(invalid), /invalid planner section data/);
  const invalidEvent = backup();
  invalidEvent.weeks[0].days[0].schedule_entries = [{ start_time: "25:00", end_time: "26:00", title: "Lost" }];
  assert.throws(() => validateLocalBackup(invalidEvent), /invalid scheduled event/);
  const wrongDate = backup();
  wrongDate.weeks[0].days[1].date = "2026-10-15";
  assert.throws(() => validateLocalBackup(wrongDate), /outside its planner week/);
  const invalidTemplate = backup();
  invalidTemplate.week_templates = [{ name: "Lost", weekly_goal: "", weekly_note: "", days: [] }];
  assert.throws(() => validateLocalBackup(invalidTemplate), /invalid week template/);
});

test("does not turn damaged saved JSON into empty data", () => {
  assert.deepEqual(parseStoredJson(null, {}), {});
  assert.throws(() => parseStoredJson("{broken", {}), /damaged/);
});

test("restores every earlier key when a storage write fails", () => {
  const values = new Map([["weeks", "old weeks"], ["finance", "old finance"]]);
  let writes = 0;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      writes += 1;
      if (writes === 2) throw new Error("storage full");
      values.set(key, value);
    },
    removeItem: (key) => values.delete(key),
  };

  assert.throws(
    () => commitStorageChanges(storage, { weeks: "new weeks", finance: "new finance" }),
    /storage full/,
  );
  assert.deepEqual(Object.fromEntries(values), {
    weeks: "old weeks",
    finance: "old finance",
  });
});

test("restores mixed present and absent keys after failure at every backup write", () => {
  const changes = { a: "new a", b: "new b", c: "new c", d: "new d", e: "new e" };
  for (let failedWrite = 1; failedWrite <= 5; failedWrite += 1) {
    const values = new Map([["a", "old a"], ["c", "old c"], ["unrelated", "keep"]]);
    let writes = 0;
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem(key, value) {
        writes += 1;
        if (writes === failedWrite) throw new Error("storage full");
        values.set(key, value);
      },
      removeItem: (key) => values.delete(key),
    };

    assert.throws(() => commitStorageChanges(storage, changes), /storage full/);
    assert.deepEqual(Object.fromEntries(values), {
      a: "old a",
      c: "old c",
      unrelated: "keep",
    });
  }
});

test("does not mutate storage when reading the snapshot fails", () => {
  let mutations = 0;
  const storage = {
    getItem: () => { throw new Error("storage unavailable"); },
    setItem: () => { mutations += 1; },
    removeItem: () => { mutations += 1; },
  };

  assert.throws(() => commitStorageChanges(storage, { weeks: "new weeks" }), /storage unavailable/);
  assert.equal(mutations, 0);
});

test("reports when rollback cannot fully restore saved data", () => {
  const values = new Map([["weeks", "old weeks"]]);
  let writes = 0;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      writes += 1;
      if (writes === 2) throw new Error("storage full");
      if (writes === 3) throw new Error("rollback failed");
      values.set(key, value);
    },
    removeItem: (key) => values.delete(key),
  };

  assert.throws(
    () => commitStorageChanges(storage, { weeks: "new weeks", finance: "new finance" }),
    /could not be fully restored/,
  );
});

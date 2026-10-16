import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const libDirectory = resolve("src/lib");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/lib/")) {
      return nextResolve(pathToFileURL(resolve(libDirectory, `${specifier.slice(6)}.ts`)).href, context);
    }
    if (specifier.startsWith("./") && context.parentURL?.startsWith(pathToFileURL(`${libDirectory}/`).href)) {
      const resolved = new URL(specifier, context.parentURL);
      if (!/\.[a-z]+$/i.test(resolved.pathname)) resolved.pathname += ".ts";
      return nextResolve(resolved.href, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  importLocalExportPayload,
  unlockLocalFinanceSession,
  getLocalWeek,
  getLocalWeeks,
  getLocalExportPayload,
  saveLocalWeek,
} = await import("../src/lib/local-store.ts");

const TEMPLATES_KEY = "smart-paper.local.week-templates";
const PRIMARY_KEYS = [
  "smart-paper.local.planner-sections",
  TEMPLATES_KEY,
  "smart-paper.local.weeks",
  "smart-paper.local.finance",
  "smart-paper.local.idea-notes",
];

function template(id, name) {
  return { id, name, weekly_goal: `${name} goal`, weekly_note: "", days: [] };
}

function backup(overrides = {}) {
  return {
    schema_version: 5,
    exported_at: "2026-10-01T00:00:00.000Z",
    weeks: [],
    finance: { goal_amount: 0, total_income: 0, remaining_amount: 0, progress_percent: 0, entries: [] },
    ...overrides,
  };
}

function browserStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  const makeStorage = (storageValues) => ({
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, String(value)),
    removeItem: (key) => storageValues.delete(key),
  });
  const localStorage = makeStorage(values);
  globalThis.window = { localStorage, sessionStorage: makeStorage(new Map()) };
  return { values, localStorage };
}

async function importWithTemplates(savedTemplates, payload, mode = "merge") {
  const { values } = browserStorage({
    [TEMPLATES_KEY]: JSON.stringify(savedTemplates),
  });
  await unlockLocalFinanceSession("1234");
  const result = await importLocalExportPayload(payload, mode);
  assert.deepEqual(JSON.parse(values.get(TEMPLATES_KEY)), result.payload.week_templates);
  return { values, result };
}

test("merge retains saved templates when imported templates are an empty array", async () => {
  const saved = [template(1, "A"), template(2, "B")];
  const { result } = await importWithTemplates(saved, backup({ week_templates: [] }));
  assert.deepEqual(result.payload.week_templates, saved);
});

for (const noteType of ["day", "section"]) {
  test(`merge of an older export preserves a Thursday ${noteType} note saved after export`, async () => {
    browserStorage();
    await unlockLocalFinanceSession("1234");
    const week = await getLocalWeek("2026-10-10");
    week.days[0].day_note = "Saturday writing already in the backup";
    saveLocalWeek(week);
    // Round-trip the real export through JSON, as a downloaded backup file does.
    const olderBackup = JSON.parse(JSON.stringify(await getLocalExportPayload()));
    const note = "Thursday writing added after backup — نوشته پنج‌شنبه";
    const edited = await getLocalWeek(week.start_date);
    const thursday = edited.days.find((day) => day.weekday_name === "Thursday");
    assert.ok(thursday);
    const readNote = (day) => noteType === "day" ? day.day_note : day.sections.slot_1.note;
    assert.equal(readNote(olderBackup.weeks[0].days[5]), "");
    if (noteType === "day") thursday.day_note = note;
    else thursday.sections.slot_1.note = note;
    saveLocalWeek(edited);
    assert.equal(readNote((await getLocalWeek(week.start_date)).days[5]), note);

    const result = await importLocalExportPayload(olderBackup, "merge");

    const restored = await getLocalWeek(week.start_date);
    assert.equal(readNote(restored.days[5]), note, "Merge must retain writing saved after the backup");
    assert.equal(restored.days[0].day_note, week.days[0].day_note);
    assert.equal(readNote(result.payload.weeks[0].days[5]), note);
  });
}

test("merge retains saved templates when the backup omits templates", async () => {
  const saved = [template(1, "A"), template(2, "B")];
  const { result } = await importWithTemplates(saved, backup());
  assert.deepEqual(result.payload.week_templates, saved);
});

test("merge preserves matching templates and adds incoming templates", async () => {
  const saved = [template(1, "A"), template(2, "B")];
  const updatedB = { ...saved[1], weekly_goal: "Updated B goal" };
  const incoming = [updatedB, template(3, "C")];
  const { result } = await importWithTemplates(saved, backup({ week_templates: incoming }));
  assert.deepEqual(result.payload.week_templates, [saved[0], saved[1], incoming[1]]);
  assert.ok(result.merge_conflicts.categories.includes("templates"));
});

test("merge keeps distinct template IDs even when names match", async () => {
  const saved = [template(1, "Shared name")];
  const incoming = [template(2, "Shared name")];
  const { result } = await importWithTemplates(saved, backup({ week_templates: incoming }));

  assert.deepEqual(result.payload.week_templates.map(({ id }) => id), [1, 2]);
});

test("replace clears saved templates when imported templates are empty or omitted", async (t) => {
  for (const payload of [backup({ week_templates: [] }), backup()]) {
    await t.test(payload.week_templates ? "empty array" : "omitted field", async () => {
      const { result } = await importWithTemplates(
        [template(1, "A"), template(2, "B")], payload, "replace",
      );
      assert.deepEqual(result.payload.week_templates, []);
    });
  }
});

test("replace stores only the incoming template", async () => {
  const incoming = [template(3, "C")];
  const { result } = await importWithTemplates(
    [template(1, "A"), template(2, "B")], backup({ week_templates: incoming }), "replace",
  );
  assert.deepEqual(result.payload.week_templates, incoming);
});

test("invalid backup leaves persisted primary records unchanged", async () => {
  const seed = Object.fromEntries(PRIMARY_KEYS.map((key) => [key, `saved:${key}`]));
  const { values } = browserStorage(seed);
  await unlockLocalFinanceSession("1234");
  const before = Object.fromEntries(values);
  const invalid = backup({ week_templates: [template(1, "A")] });
  invalid.finance.entries = "invalid";

  await assert.rejects(importLocalExportPayload(invalid, "replace"), /invalid finance data/);
  assert.deepEqual(Object.fromEntries(values), before);
});

test("storage write failure restores primary records and preserves unrelated data", async () => {
  const seed = Object.fromEntries(PRIMARY_KEYS.map((key) => [key, `saved:${key}`]));
  seed["unrelated.key"] = "leave me";
  const { values, localStorage } = browserStorage(seed);
  await unlockLocalFinanceSession("1234");
  const before = Object.fromEntries(values);
  let failed = false;
  window.localStorage.setItem = (key, value) => {
    if (key === "smart-paper.local.weeks" && !failed) {
      failed = true;
      throw new Error("storage full");
    }
    values.set(key, String(value));
  };

  await assert.rejects(
    importLocalExportPayload(backup({ week_templates: [template(3, "C")] }), "replace"),
    /storage full/,
  );
  assert.deepEqual(Object.fromEntries(values), before);
  assert.equal(localStorage.getItem("unrelated.key"), "leave me");
});

test("archived and future imported weeks join the normal selector without creating intervening weeks", async () => {
  browserStorage();
  await unlockLocalFinanceSession("1234");
  const current = (await getLocalWeeks(0)).current_week_start;
  const old = { ...await getLocalWeek("2001-01-06"), weekly_goal: "Archived هدف" };
  const future = { ...await getLocalWeek("2099-01-03"), weekly_goal: "Future هدف" };
  const currentWeek = await getLocalWeek(current);
  await importLocalExportPayload(backup({ weeks: [old, future, currentWeek] }), "merge");
  const result = await getLocalWeeks(0);
  assert.deepEqual(result.weeks.map(week => week.start_date), [old.start_date, current, future.start_date]);
  assert.equal(result.current_week_start, current);
  assert.equal(result.weeks.filter(week => week.is_current).length, 1);
  assert.equal((await getLocalWeeks(8)).weeks.length, 19);
  assert.equal((await getLocalWeek(old.start_date)).weekly_goal, old.weekly_goal);
  assert.equal((await getLocalWeek(future.start_date)).weekly_goal, future.weekly_goal);
  await importLocalExportPayload(backup({ weeks: [future] }), "replace");
  assert.deepEqual((await getLocalWeeks(0)).weeks.map(week => week.start_date), [current, future.start_date]);
});

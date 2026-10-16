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
const store = await import("../src/lib/local-store.ts");
const keys = {
  weeks: "smart-paper.local.weeks", sections: "smart-paper.local.planner-sections",
  templates: "smart-paper.local.week-templates", ideas: "smart-paper.local.idea-notes",
  finance: "smart-paper.local.finance",
};
const clone = (value) => JSON.parse(JSON.stringify(value));
async function setup(seed = {}) {
  const values = new Map(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]));
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  globalThis.window = { localStorage: storage, sessionStorage: storage };
  await store.unlockLocalFinanceSession("1234");
  return { values, storage };
}
async function savedWeek() {
  return store.saveLocalWeek(await store.getLocalWeek("2026-10-10"));
}
const exported = async () => clone(await store.getLocalExportPayload());
const categories = (result) => result.merge_conflicts?.categories ?? [];
const event = (id, title = "Plan") => ({ id, title, start_time: "09:00", end_time: "10:00", note: "", section_id: null, order: 0 });
const idea = (id, body, parent_id = null) => ({ id, body, parent_id, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-02T00:00:00Z" });
const template = (id, name) => ({ id, name, weekly_goal: "", weekly_note: "", days: [] });

test("safe Merge fills independent blank planner fields and preserves exact current writing and positive minutes", async () => {
  await setup();
  const current = await savedWeek();
  current.weekly_goal = "  Keep my goal  ";
  current.days[5].day_note = "Thursday saved writing";
  current.days[5].sections.slot_1 = { goal: "Current goal", note: "", duration_minutes: 20 };
  current.days[4].day_note = "   ";
  store.saveLocalWeek(current);
  const incoming = await exported();
  const week = incoming.weeks[0];
  week.weekly_goal = "Incoming conflicting goal";
  week.weekly_note = "Incoming weekly note";
  week.days[5].day_note = "Old Thursday writing";
  week.days[5].sections.slot_1 = { goal: "", note: "Incoming section note", duration_minutes: 30 };
  week.days[4].day_note = "Restore Wednesday";
  week.days[4].sections.slot_1.duration_minutes = 15;
  const result = await store.importLocalExportPayload(incoming, "merge");
  const actual = await store.getLocalWeek(current.start_date);
  assert.equal(actual.weekly_goal, current.weekly_goal);
  assert.equal(actual.weekly_note, "Incoming weekly note");
  assert.equal(actual.days[5].day_note, current.days[5].day_note);
  assert.deepEqual(actual.days[5].sections.slot_1, { goal: "Current goal", note: "Incoming section note", duration_minutes: 20 });
  assert.equal(actual.days[4].day_note, "Restore Wednesday");
  assert.equal(actual.days[4].sections.slot_1.duration_minutes, 15);
  assert.equal(actual.totals.week_total_minutes, 35);
  assert.ok(categories(result).includes("planner"));
  assert.ok(result.merge_conflicts.planner_dates.includes(current.days[5].date));
  const repeated = await store.importLocalExportPayload(incoming, "merge");
  assert.deepEqual(repeated.payload.weeks, result.payload.weeks);
});

test("safe Merge blank incoming planner fields preserve meaningful current values without conflicts", async () => {
  await setup();
  await savedWeek();
  const incoming = await exported();
  const current = await store.getLocalWeek("2026-10-10");
  current.weekly_note = "Keep weekly note";
  current.days[5].sections.slot_1 = { goal: "Keep goal", note: "Keep note", duration_minutes: 15 };
  store.saveLocalWeek(current);
  const result = await store.importLocalExportPayload(incoming, "merge");
  assert.deepEqual((await store.getLocalWeek(current.start_date)).days, current.days);
  assert.equal(result.payload.weeks[0].weekly_note, current.weekly_note);
  assert.deepEqual(categories(result), []);
});

test("safe Merge keeps same-ID schedule conflicts, deduplicates identical content, and adds distinct overlapping events", async () => {
  await setup();
  const current = await savedWeek();
  current.days[5].schedule_entries = [event("saved")];
  store.saveLocalWeek(current);
  const incoming = await exported();
  incoming.weeks[0].days[5].schedule_entries = [event("saved", "Conflicting title"), event("duplicate"), event("overlap", "Another plan")];
  const result = await store.importLocalExportPayload(incoming, "merge");
  const actual = (await store.getLocalWeek(current.start_date)).days[5].schedule_entries;
  assert.equal(actual.length, 2);
  assert.equal(actual.find((entry) => entry.id === "saved").title, "Plan");
  assert.equal(actual.find((entry) => entry.id === "overlap").title, "Another plan");
  assert.ok(categories(result).includes("schedule"));
  await store.importLocalExportPayload(incoming, "merge");
  assert.deepEqual((await store.getLocalWeek(current.start_date)).days[5].schedule_entries, actual);
});

test("safe Merge retains whole current templates on same-ID conflict while adding missing IDs", async () => {
  const kept = template(1, "Device template");
  await setup({ [keys.templates]: [kept] });
  const incoming = await exported();
  incoming.week_templates = [template(1, "Incoming template"), template(2, "New template")];
  const result = await store.importLocalExportPayload(incoming, "merge");
  assert.deepEqual(result.payload.week_templates, [kept, incoming.week_templates[1]]);
  assert.ok(categories(result).includes("templates"));
});

test("safe Merge retains current Idea body and parent conflicts, ignores timestamp-only changes, and adds children", async () => {
  const saved = [idea("body", "Device body"), idea("parent", "Same body"), idea("time", "Same text")];
  await setup({ [keys.ideas]: saved });
  const incoming = await exported();
  incoming.idea_notes = [idea("body", "Backup body"), idea("parent", "Same body", "body"), { ...saved[2], updated_at: "2099-01-01T00:00:00Z" }, idea("child", "New child", "body")];
  const result = await store.importLocalExportPayload(incoming, "merge");
  for (const note of saved) assert.deepEqual(result.payload.idea_notes.find((item) => item.id === note.id), note);
  assert.deepEqual(result.payload.idea_notes.find((item) => item.id === "child"), incoming.idea_notes[3]);
  assert.ok(categories(result).includes("ideas"));
  incoming.idea_notes = [{ ...saved[2], updated_at: "2099-01-01T00:00:00Z" }];
  assert.ok(!categories(await store.importLocalExportPayload(incoming, "merge")).includes("ideas"));
});

test("safe Merge keeps persisted zero Finance goal and conflicting income while legacy idless records import once", async () => {
  const kept = { id: 1, amount: 10, note: "Device income", received_on: "2026-10-10" };
  await setup({ [keys.finance]: { goal_amount: 0, entries: [kept] } });
  const incoming = await exported();
  incoming.finance.goal_amount = 100;
  incoming.finance.entries = [{ ...kept, amount: 999 }, { amount: 25, note: "Legacy", received_on: "2026-10-11" }];
  const result = await store.importLocalExportPayload(incoming, "merge");
  assert.equal(result.payload.finance.goal_amount, 0);
  assert.deepEqual(result.payload.finance.entries.find((entry) => entry.id === 1), kept);
  assert.equal(result.payload.finance.entries.length, 2);
  assert.equal(result.payload.finance.total_income, 35);
  assert.ok(categories(result).includes("income"));
  assert.ok(categories(result).includes("financeGoal"));
  const repeated = await store.importLocalExportPayload(incoming, "merge");
  assert.deepEqual(repeated.payload.finance.entries, result.payload.finance.entries);
});

test("safe Merge initializes never-saved Finance and section configuration from backup", async () => {
  await setup();
  const incoming = await exported();
  incoming.finance.goal_amount = 250;
  incoming.planner_sections[0].label = "Incoming configured label";
  await setup();
  const result = await store.importLocalExportPayload(incoming, "merge");
  assert.equal(result.payload.finance.goal_amount, 250);
  assert.equal(result.payload.planner_sections[0].label, "Incoming configured label");
  assert.deepEqual(categories(result), []);
});

test("legacy duplicate income occurrences remain distinct across repeated Merge and cannot steal a valid incoming ID", async () => {
  await setup();
  const incoming = await exported();
  const legacy = { amount: 25, note: "Two separate identical receipts", received_on: "2026-10-11" };
  const reservedId = 1791676800000;
  const identified = { id: reservedId, amount: 70, note: "Explicit identity", received_on: "2026-10-12" };
  incoming.finance.entries = [clone(legacy), clone(legacy), identified];
  const originalNow = Date.now;
  try {
    Date.now = () => reservedId;
    const first = await store.importLocalExportPayload(incoming, "merge");
    assert.equal(first.payload.finance.entries.length, 3);
    assert.equal(new Set(first.payload.finance.entries.map((entry) => entry.id)).size, 3);
    assert.deepEqual(first.payload.finance.entries.find((entry) => entry.id === reservedId), identified);
    assert.equal(first.payload.finance.entries.filter((entry) => entry.note === legacy.note).length, 2);
    const repeated = await store.importLocalExportPayload(incoming, "merge");
    assert.deepEqual(repeated.payload.finance.entries, first.payload.finance.entries);
    assert.equal(repeated.payload.finance.total_income, 120);
  } finally {
    Date.now = originalNow;
  }
});

test("safe Merge keeps configured section visibility and labels and retains incoming content in inactive slots", async () => {
  await setup();
  await savedWeek();
  const incoming = await exported();
  const configured = clone(incoming.planner_sections);
  configured[0].active = false;
  configured[0].label = "My hidden section";
  await store.saveLocalPlannerSections(configured);
  incoming.weeks[0].days[5].sections.slot_1.note = "Retain hidden writing";
  const result = await store.importLocalExportPayload(incoming, "merge");
  assert.deepEqual(result.payload.planner_sections, configured);
  const actual = await store.getLocalWeek("2026-10-10");
  assert.deepEqual(actual.planner_sections, configured);
  assert.equal(actual.days[5].sections.slot_1.note, "Retain hidden writing");
  assert.ok(categories(result).includes("plannerSections"));
});

test("Replace still uses incoming values and collections instead of safe Merge conflict rules", async () => {
  await setup({ [keys.templates]: [template(1, "Device")], [keys.finance]: { goal_amount: 0, entries: [] }, [keys.ideas]: [idea("device", "Device")] });
  const current = await savedWeek();
  current.days[5].day_note = "Device writing";
  store.saveLocalWeek(current);
  const incoming = await exported();
  incoming.weeks[0].days[5].day_note = "Backup writing";
  incoming.finance.goal_amount = 100;
  incoming.week_templates = [];
  incoming.idea_notes = [];
  const result = await store.importLocalExportPayload(incoming, "replace");
  assert.equal((await store.getLocalWeek(current.start_date)).days[5].day_note, "Backup writing");
  assert.equal(result.payload.finance.goal_amount, 100);
  assert.deepEqual(result.payload.week_templates, []);
  assert.deepEqual(result.payload.idea_notes, []);
  assert.deepEqual(categories(result), []);
});

for (const omitConfig of [false, true]) {
  test(`inactive-slot import is disclosed without inventing conflicts (${omitConfig ? "omitted" : "equal"} configuration)`, async () => {
    await setup();
    await savedWeek();
    const initial = await exported();
    initial.planner_sections[0].active = false;
    await store.saveLocalPlannerSections(initial.planner_sections);
    const incoming = await exported();
    incoming.weeks[0].days[5].sections.slot_1.note = "Imported hidden writing";
    if (omitConfig) delete incoming.planner_sections;
    const result = await store.importLocalExportPayload(incoming, "merge");
    assert.equal(result.hidden_sections_imported, true);
    assert.deepEqual(categories(result), []);
    assert.equal((await store.getLocalWeek("2026-10-10")).days[5].sections.slot_1.note, "Imported hidden writing");
  });
}

test("failed safe Merge restores every persisted primary collection and unrelated storage", async () => {
  const { values, storage } = await setup({ [keys.templates]: [template(1, "Device")], [keys.ideas]: [idea("device", "Device")] });
  await savedWeek();
  const incoming = await exported();
  incoming.weeks[0].weekly_note = "New weekly note";
  incoming.week_templates.push(template(2, "New template"));
  incoming.idea_notes.push(idea("incoming", "New idea"));
  incoming.finance.entries.push({ id: 2, amount: 10, note: "New income", received_on: "2026-10-10" });
  values.set("unrelated", "Keep me");
  const before = new Map(values);
  let failed = false;
  storage.setItem = (key, value) => {
    if (key === keys.ideas && !failed) { failed = true; throw new Error("storage full"); }
    values.set(key, String(value));
  };
  await assert.rejects(store.importLocalExportPayload(incoming, "merge"), /storage full/);
  assert.deepEqual(values, before);
});

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
  getLocalExportPayload,
  getLocalWeek,
  importLocalExportPayload,
  saveLocalWeek,
  unlockLocalFinanceSession,
} = await import("../src/lib/local-store.ts");

const WEEKS_KEY = "smart-paper.local.weeks";
const WEEK_START = "2026-10-10";

function browserStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  const makeStorage = (storageValues) => ({
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, String(value)),
    removeItem: (key) => storageValues.delete(key),
  });
  globalThis.window = { localStorage: makeStorage(values), sessionStorage: makeStorage(new Map()) };
  return values;
}

function event(id, start_time, end_time, title, extra = {}) {
  return {
    id,
    start_time,
    end_time,
    title,
    note: "",
    section_id: null,
    order: 0,
    ...extra,
  };
}

async function withWeek() {
  browserStorage();
  const week = await getLocalWeek(WEEK_START);
  return { ...week, days: week.days.map((day) => ({ ...day })) };
}

test("schedule entries persist through add, edit, and delete week saves", async () => {
  const week = await withWeek();
  week.days[0].schedule_entries = [event("first", "09:00", "10:00", "Read")];
  saveLocalWeek(week);
  assert.deepEqual((await getLocalWeek(WEEK_START)).days[0].schedule_entries.map(({ title }) => title), ["Read"]);

  const editedWeek = await getLocalWeek(WEEK_START);
  editedWeek.days[0].schedule_entries = [event("first", "09:30", "10:30", "Study", { note: "chapter 2" })];
  saveLocalWeek(editedWeek);
  assert.deepEqual((await getLocalWeek(WEEK_START)).days[0].schedule_entries, [
    event("first", "09:30", "10:30", "Study", { note: "chapter 2" }),
  ]);

  const deletedWeek = await getLocalWeek(WEEK_START);
  deletedWeek.days[0].schedule_entries = [];
  saveLocalWeek(deletedWeek);
  assert.deepEqual((await getLocalWeek(WEEK_START)).days[0].schedule_entries, []);
});

test("saved schedules are returned in time order with canonical order values", async () => {
  const week = await withWeek();
  week.days[0].schedule_entries = [
    event("late", "13:00", "14:00", "Later", { order: 0 }),
    event("early", "08:00", "09:00", "Earlier", { order: 1 }),
  ];
  saveLocalWeek(week);

  const saved = (await getLocalWeek(WEEK_START)).days[0].schedule_entries;
  assert.deepEqual(saved.map(({ id, order }) => ({ id, order })), [
    { id: "early", order: 0 },
    { id: "late", order: 1 },
  ]);
});

test("loading stored schedules normalizes valid entries and drops invalid ones", async () => {
  browserStorage({
    [WEEKS_KEY]: JSON.stringify({
      [WEEK_START]: {
        start_date: WEEK_START,
        end_date: "2026-10-16",
        label: "stored week",
        weekly_goal: "",
        weekly_note: "",
        days: [{
          date: WEEK_START,
          weekday_index: 0,
          weekday_name: "Saturday",
          day_note: "",
          sections: {},
          schedule_entries: [
            event("valid", "10:00", "11:00", "  Trimmed title  ", { order: 8, section_id: "unknown" }),
            event("reversed", "12:00", "11:00", "Invalid time"),
            event("untitled", "13:00", "14:00", "   "),
          ],
        }],
      },
    }),
  });

  const loaded = (await getLocalWeek(WEEK_START)).days[0].schedule_entries;
  assert.deepEqual(loaded, [event("valid", "10:00", "11:00", "Trimmed title", { order: 0 })]);
  const persisted = JSON.parse(window.localStorage.getItem(WEEKS_KEY))[WEEK_START];
  assert.deepEqual(persisted.days[0].schedule_entries, loaded);
});

test("JSON export and merge import preserve Persian schedules and unrelated weeks", async () => {
  const source = await withWeek();
  source.days[0].schedule_entries = [
    event("later", "15:00", "16:00", "بعداً", { order: 0, note: "یادداشت فارسی" }),
    event("first", "09:00", "10:00", "  مطالعه  ", { order: 1, section_id: "slot_3", note: "فصل دوم" }),
  ];
  saveLocalWeek(source);
  await unlockLocalFinanceSession("1234");
  const exported = JSON.parse(JSON.stringify(await getLocalExportPayload()));

  browserStorage();
  const unrelated = await getLocalWeek("2026-10-03");
  unrelated.weekly_note = "keep this week";
  saveLocalWeek(unrelated);
  await unlockLocalFinanceSession("1234");
  await importLocalExportPayload(exported, "merge");
  const imported = await getLocalExportPayload();
  const weekByStart = (payload, startDate) => payload.weeks.find((week) => week.start_date === startDate);
  const importedWeek = weekByStart(imported, WEEK_START);

  assert.deepEqual(importedWeek.days[0].schedule_entries, [
    event("first", "09:00", "10:00", "مطالعه", { order: 0, section_id: "slot_3", note: "فصل دوم" }),
    event("later", "15:00", "16:00", "بعداً", { order: 1, note: "یادداشت فارسی" }),
  ]);
  assert.equal(weekByStart(imported, "2026-10-03").weekly_note, "keep this week");
});

test("JSON export and replace import remove unrelated weeks and preserve schedules", async () => {
  const source = await withWeek();
  source.days[0].schedule_entries = [
    event("later", "15:00", "16:00", "بعداً", { order: 0, note: "یادداشت فارسی" }),
    event("first", "09:00", "10:00", "  مطالعه  ", { order: 1, section_id: "slot_3", note: "فصل دوم" }),
  ];
  saveLocalWeek(source);
  await unlockLocalFinanceSession("1234");
  const exported = JSON.parse(JSON.stringify(await getLocalExportPayload()));

  browserStorage();
  const unrelated = await getLocalWeek("2026-10-03");
  unrelated.weekly_note = "remove this week";
  saveLocalWeek(unrelated);
  await unlockLocalFinanceSession("1234");
  await importLocalExportPayload(exported, "replace");
  const imported = await getLocalExportPayload();
  const weekByStart = (payload, startDate) => payload.weeks.find((week) => week.start_date === startDate);

  assert.deepEqual(weekByStart(imported, WEEK_START).days[0].schedule_entries, [
    event("first", "09:00", "10:00", "مطالعه", { order: 0, section_id: "slot_3", note: "فصل دوم" }),
    event("later", "15:00", "16:00", "بعداً", { order: 1, note: "یادداشت فارسی" }),
  ]);
  assert.equal(weekByStart(imported, "2026-10-03"), undefined);
});

test("import normalizes valid but unsorted schedule entries", async () => {
  const source = await withWeek();
  source.days[0].schedule_entries = [
    event("late", "15:00", "16:00", "Later", { order: 0 }),
    event("early", "09:00", "10:00", "Earlier", { order: 1 }),
  ];
  saveLocalWeek(source);
  await unlockLocalFinanceSession("1234");
  const exported = JSON.parse(JSON.stringify(await getLocalExportPayload()));
  exported.weeks[0].days[0].schedule_entries.reverse();

  browserStorage();
  await unlockLocalFinanceSession("1234");
  await importLocalExportPayload(exported, "replace");
  const imported = await getLocalExportPayload();
  assert.deepEqual(imported.weeks[0].days[0].schedule_entries.map(({ id, order }) => ({ id, order })), [
    { id: "early", order: 0 },
    { id: "late", order: 1 },
  ]);
});

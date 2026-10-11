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

const TEMPLATES_KEY = "smart-paper.local.week-templates";
const FIXED_NOW = 2_120_000_000_000;

function installBrowser(t) {
  const originalWindow = globalThis.window;
  const originalNow = Date.now;
  const values = new Map();
  const makeStorage = (storageValues) => ({
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, String(value)),
    removeItem: (key) => storageValues.delete(key),
  });
  globalThis.window = { localStorage: makeStorage(values), sessionStorage: makeStorage(new Map()) };
  let now = FIXED_NOW;
  Date.now = () => now++;
  t.after(() => {
    globalThis.window = originalWindow;
    Date.now = originalNow;
  });
  return values;
}

async function storeInstance() {
  return import(`../src/lib/local-store.ts?week-templates=${Math.random()}`);
}

function fullWeekTemplate() {
  return {
    name: "  برنامه هفتگی  ",
    weekly_goal: "تمرکز روی پایان نامه",
    weekly_note: "یادداشت هفتگی فارسی",
    days: Array.from({ length: 7 }, (_, weekday_index) => ({
      weekday_index,
      day_note: `یادداشت روز ${weekday_index + 1}`,
      sections: {
        slot_1: {
          duration_minutes: 30 + weekday_index,
          goal: `هدف ${weekday_index + 1}`,
          note: `جزئیات ${weekday_index + 1}`,
        },
      },
      schedule_entries: [{
        start_time: "09:15",
        end_time: "10:05",
        title: `مطالعه ${weekday_index + 1}`,
        note: `فصل ${weekday_index + 1}`,
        section_id: "slot_1",
      }],
    })),
  };
}

test("template lifecycle trims names, preserves overwrite IDs, isolates returned data, and deletes one", async (t) => {
  const values = installBrowser(t);
  const store = await storeInstance();
  const original = {
    name: "  مطالعه  ", weekly_goal: "هدف نخست", weekly_note: "یادداشت",
    days: [{
      weekday_index: 0, day_note: "شنبه",
      sections: { slot_1: { duration_minutes: 20, goal: "مطالعه", note: "نکته" } },
      schedule_entries: [{ start_time: "08:00", end_time: "08:30", title: "کتاب", note: "", section_id: "slot_1" }],
    }],
  };

  const firstSave = await store.saveLocalWeekTemplate(original);
  const firstId = firstSave.find((template) => template.name === "مطالعه").id;
  original.days[0].day_note = "input mutation";
  firstSave[0].name = "returned mutation";
  firstSave[0].days[0].sections.slot_1.goal = "returned nested mutation";
  firstSave.push({ id: -1, name: "in-memory only", weekly_goal: "", weekly_note: "", days: [] });

  let persisted = await store.getLocalWeekTemplates();
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].name, "مطالعه");
  assert.equal(persisted[0].days[0].day_note, "شنبه");
  assert.equal(persisted[0].days[0].sections.slot_1.goal, "مطالعه");

  const secondSave = await store.saveLocalWeekTemplate({
    name: "  پروژه  ", weekly_goal: "هدف دوم", weekly_note: "", days: [],
  });
  const secondId = secondSave.find((template) => template.name === "پروژه").id;
  assert.notEqual(firstId, secondId);

  const overwritten = await store.saveLocalWeekTemplate({
    name: " مطالعه ", weekly_goal: "هدف به روز", weekly_note: "یادداشت تازه", days: [],
  });
  const updated = overwritten.find((template) => template.name === "مطالعه");
  assert.equal(updated.id, firstId);
  assert.equal(updated.weekly_goal, "هدف به روز");
  assert.equal(updated.weekly_note, "یادداشت تازه");
  assert.deepEqual(updated.days, []);
  assert.equal(overwritten.length, 2);

  const afterDelete = await store.deleteLocalWeekTemplate(firstId);
  assert.deepEqual(afterDelete.map(({ id, name }) => ({ id, name })), [{ id: secondId, name: "پروژه" }]);
  persisted = await store.getLocalWeekTemplates();
  assert.deepEqual(persisted, afterDelete);
  assert.deepEqual(JSON.parse(values.get(TEMPLATES_KEY)), afterDelete);
});

test("seven-day template survives serialized JSON Replace with Persian content and section schedules", async (t) => {
  const values = installBrowser(t);
  const store = await storeInstance();
  await store.saveLocalPlannerSections((await store.getLocalPlannerSections()).map((section) =>
    section.id === "slot_1" ? { ...section, label: "مطالعه" } : section,
  ));
  const input = fullWeekTemplate();
  await store.saveLocalWeekTemplate(input);
  const savedTemplate = (await store.getLocalWeekTemplates())[0];
  const expected = {
    ...input,
    name: "برنامه هفتگی",
    id: savedTemplate.id,
  };

  await store.unlockLocalFinanceSession("1234");
  const backup = JSON.parse(JSON.stringify(await store.getLocalExportPayload()));
  assert.deepEqual(backup.week_templates, [expected]);

  values.clear();
  const freshRuntime = await storeInstance();
  await freshRuntime.unlockLocalFinanceSession("1234");
  await freshRuntime.importLocalExportPayload(backup, "replace");

  const restored = await freshRuntime.getLocalWeekTemplates();
  assert.deepEqual(restored, [expected]);
  assert.equal(restored[0].days.length, 7);
  for (const [index, day] of restored[0].days.entries()) {
    assert.equal(day.sections.slot_1.duration_minutes, 30 + index);
    assert.equal(day.sections.slot_1.goal, `هدف ${index + 1}`);
    assert.equal(day.schedule_entries[0].section_id, "slot_1");
    assert.equal(day.schedule_entries[0].start_time, "09:15");
    assert.equal(day.schedule_entries[0].end_time, "10:05");
  }
  assert.deepEqual(JSON.parse(values.get(TEMPLATES_KEY)), [expected]);
});

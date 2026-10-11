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
const WEEK_START = "2026-10-10";

function browserStorage() {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  globalThis.window = { localStorage: storage, sessionStorage: { ...storage } };
  return values;
}

async function withPopulatedSlot10() {
  browserStorage();
  const sections = await store.getLocalPlannerSections();
  await store.saveLocalPlannerSections(sections.map((section) =>
    section.id === "slot_10" ? { ...section, active: true, label: "برنامه شخصی", order: 0 } : section,
  ));
  const week = await store.getLocalWeek(WEEK_START);
  week.days[0].sections.slot_10 = {
    duration_minutes: 45,
    goal: "خواندن فصل دوم",
    note: "یادداشت محفوظ",
  };
  store.saveLocalWeek(week);
}

test("planner section settings persist custom Persian labels and slot 10 ordering", async () => {
  browserStorage();
  const sections = await store.getLocalPlannerSections();
  const reordered = sections.map((section) => ({
    ...section,
    ...(section.id === "slot_10" ? { label: "بخش دهم", active: true, order: 0 } : {}),
    ...(section.id === "slot_1" ? { label: "مطالعه", order: 9 } : {}),
  }));

  await store.saveLocalPlannerSections(reordered);

  const loaded = await store.getLocalPlannerSections();
  assert.equal(loaded[0].id, "slot_10");
  assert.equal(loaded[0].label, "بخش دهم");
  assert.equal(loaded.find((section) => section.id === "slot_1").label, "مطالعه");
  assert.equal(loaded.find((section) => section.id === "slot_10").active, true);
});

test("hiding a populated section removes its totals while preserving its stored data", async () => {
  await withPopulatedSlot10();
  const before = await store.getLocalWeek(WEEK_START);
  assert.equal(before.totals.by_section_minutes.slot_10, 45);

  const sections = await store.getLocalPlannerSections();
  await store.saveLocalPlannerSections(sections.map((section) =>
    section.id === "slot_10" ? { ...section, active: false } : section,
  ));

  const hidden = await store.getLocalWeek(WEEK_START);
  assert.equal(hidden.totals.by_section_minutes.slot_10, 0);
  assert.equal(hidden.days[0].sections.slot_10.duration_minutes, 45);
  assert.equal(hidden.days[0].sections.slot_10.goal, "خواندن فصل دوم");
  assert.equal(hidden.days[0].sections.slot_10.note, "یادداشت محفوظ");
});

test("reactivating a populated section restores its totals", async () => {
  await withPopulatedSlot10();
  const active = await store.getLocalPlannerSections();
  await store.saveLocalPlannerSections(active.map((section) =>
    section.id === "slot_10" ? { ...section, active: false } : section,
  ));
  assert.equal((await store.getLocalWeek(WEEK_START)).totals.by_section_minutes.slot_10, 0);

  const hidden = await store.getLocalPlannerSections();
  await store.saveLocalPlannerSections(hidden.map((section) =>
    section.id === "slot_10" ? { ...section, active: true } : section,
  ));

  const restored = await store.getLocalWeek(WEEK_START);
  assert.equal(restored.totals.by_section_minutes.slot_10, 45);
  assert.equal(restored.days[0].sections.slot_10.goal, "خواندن فصل دوم");
});

test("JSON Replace roundtrip preserves section settings and hidden section data", async () => {
  await withPopulatedSlot10();
  const sections = await store.getLocalPlannerSections();
  await store.saveLocalPlannerSections(sections.map((section) =>
    section.id === "slot_10" ? { ...section, active: false } : section,
  ));
  await store.unlockLocalFinanceSession("1234");
  const backup = JSON.parse(JSON.stringify(await store.getLocalExportPayload()));

  browserStorage();
  await store.unlockLocalFinanceSession("1234");
  await store.importLocalExportPayload(backup, "replace");

  const restoredSections = await store.getLocalPlannerSections();
  const restored = await store.getLocalWeek(WEEK_START);
  assert.equal(restoredSections.find((section) => section.id === "slot_10").label, "برنامه شخصی");
  assert.equal(restoredSections.find((section) => section.id === "slot_10").active, false);
  assert.equal(restored.days[0].sections.slot_10.duration_minutes, 45);
  assert.equal(restored.days[0].sections.slot_10.goal, "خواندن فصل دوم");
  assert.equal(restored.days[0].sections.slot_10.note, "یادداشت محفوظ");
  assert.equal(restored.totals.by_section_minutes.slot_10, 0);
});

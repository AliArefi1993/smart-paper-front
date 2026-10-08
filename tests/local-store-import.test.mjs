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

test("merge retains saved templates when the backup omits templates", async () => {
  const saved = [template(1, "A"), template(2, "B")];
  const { result } = await importWithTemplates(saved, backup());
  assert.deepEqual(result.payload.week_templates, saved);
});

test("merge updates matching templates and adds incoming templates", async () => {
  const saved = [template(1, "A"), template(2, "B")];
  const updatedB = { ...saved[1], weekly_goal: "Updated B goal" };
  const incoming = [updatedB, template(3, "C")];
  const { result } = await importWithTemplates(saved, backup({ week_templates: incoming }));
  assert.deepEqual(result.payload.week_templates, [saved[0], updatedB, incoming[1]]);
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

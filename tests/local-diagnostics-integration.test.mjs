import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const libDirectory = resolve("src/lib");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/lib/")) return nextResolve(pathToFileURL(resolve(libDirectory, `${specifier.slice(6)}.ts`)).href, context);
    if (specifier.startsWith("./") && context.parentURL?.startsWith(pathToFileURL(`${libDirectory}/`).href)) {
      const url = new URL(specifier, context.parentURL);
      if (!/\.[a-z]+$/i.test(url.pathname)) url.pathname += ".ts";
      return nextResolve(url.href, context);
    }
    return nextResolve(specifier, context);
  },
});
const store = await import("../src/lib/local-store.ts");
const diagnostics = await import("../src/lib/local-diagnostics.ts");
const WEEK_KEY = "smart-paper.local.weeks";
const PRIVATE_NOTE = "Synthetic private Persian یادداشت / PIN 9321 / amount 87654";
const PRIVATE_FAILURE = "Synthetic private error https://private.invalid/?token=secret filename-private.json";
const EMPTY = { errors: [], usage: [] };
const errorInput = { route: "planner", action: "save", code: "LOCAL_SAVE_FAILED" };

function browser(t, preferences = { errors: true, usage: true }) {
  const originalWindow = globalThis.window;
  const originalMode = process.env.NEXT_PUBLIC_DATA_MODE;
  const values = new Map();
  if (preferences) values.set(diagnostics.DIAGNOSTIC_PREFERENCES_KEY, JSON.stringify(preferences));
  const faults = new Map();
  const localStorage = {
    getItem(key) { const fault = faults.get(`read:${key}`); if (fault) throw fault; return values.get(key) ?? null; },
    setItem(key, value) { const fault = faults.get(`write:${key}`); if (fault) throw fault; values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  globalThis.window = { localStorage, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  process.env.NEXT_PUBLIC_DATA_MODE = "local";
  diagnostics.activateLocalDiagnosticsAfterDisclosure();
  t.after(() => { globalThis.window = originalWindow; if (originalMode === undefined) delete process.env.NEXT_PUBLIC_DATA_MODE; else process.env.NEXT_PUBLIC_DATA_MODE = originalMode; });
  return { values, faults, evidence() { return JSON.parse(values.get(diagnostics.DIAGNOSTIC_DATA_KEY) ?? JSON.stringify(EMPTY)); } };
}
async function weekInput() {
  const week = await store.getLocalWeek("2026-10-10");
  return { ...week, weekly_note: PRIVATE_NOTE, weekly_goal: "Synthetic goal" };
}
function assertNoAutomaticPrivateContent(h) {
  const text = h.values.get(diagnostics.DIAGNOSTIC_DATA_KEY) ?? "";
  assert.ok(!text.includes(PRIVATE_NOTE)); assert.ok(!text.includes(PRIVATE_FAILURE));
}

test("actual Planner save result and persisted note survive every diagnostics read/write failure", async (t) => {
  const h = browser(t); const input = await weekInput();
  const baseline = store.saveLocalWeek(input); const persisted = h.values.get(WEEK_KEY);
  for (const operation of ["read", "write"]) for (const key of [diagnostics.DIAGNOSTIC_PREFERENCES_KEY, diagnostics.DIAGNOSTIC_DATA_KEY]) {
    h.values.delete(diagnostics.DIAGNOSTIC_DATA_KEY);
    if (operation === "write" && key === diagnostics.DIAGNOSTIC_PREFERENCES_KEY) h.values.delete(key);
    else h.values.set(diagnostics.DIAGNOSTIC_PREFERENCES_KEY, JSON.stringify({errors:true,usage:true}));
    h.faults.set(`${operation}:${key}`, new Error(PRIVATE_FAILURE));
    assert.deepEqual(store.saveLocalWeek(input), baseline, `${operation}:${key}`);
    assert.equal(h.values.get(WEEK_KEY), persisted, `${operation}:${key}`);
    assert.equal(JSON.parse(persisted)[input.start_date].weekly_note, PRIVATE_NOTE);
    assertNoAutomaticPrivateContent(h); h.faults.clear();
  }
});

test("actual failed Planner save rethrows identical primary error and records only static evidence", async (t) => {
  const h = browser(t); const input = await weekInput(); store.saveLocalWeek(input);
  const before = h.values.get(WEEK_KEY); const failure = new Error(PRIVATE_FAILURE);
  h.faults.set(`write:${WEEK_KEY}`, failure);
  assert.throws(() => store.saveLocalWeek({...input,weekly_note:"Changed synthetic note"}), error => error === failure);
  assert.equal(h.values.get(WEEK_KEY), before);
  const evidence = h.evidence();
  assert.equal(evidence.errors.at(-1).code,"LOCAL_SAVE_FAILED"); assert.equal(evidence.errors.at(-1).route,"planner");
  assert.equal(evidence.usage[0].flows.save.failed,1); assertNoAutomaticPrivateContent(h);
  h.faults.set(`write:${diagnostics.DIAGNOSTIC_DATA_KEY}`, new Error("Synthetic diagnostics quota"));
  assert.throws(() => store.saveLocalWeek(input), error => error === failure); assert.equal(h.values.get(WEEK_KEY),before);
});

test("actual primary read failure rethrows identical error and records coarse load code", async (t) => {
  const h = browser(t); const failure = new Error(PRIVATE_FAILURE);
  h.faults.set(`read:${WEEK_KEY}`, failure);
  await assert.rejects(store.getLocalWeek("2026-10-10"), error => error === failure);
  assert.deepEqual(h.evidence().errors.map(({route,action,code})=>({route,action,code})),[{route:"planner",action:"load",code:"LOCAL_READ_FAILED"}]);
  assertNoAutomaticPrivateContent(h); assert.equal(h.values.has(WEEK_KEY),false);
});

test("actual JSON backup and AI source exclude diagnostics, report description and private runtime error", async (t) => {
  browser(t); store.saveLocalWeek(await weekInput());
  diagnostics.recordLocalError(errorInput); diagnostics.recordRouteUse("planner");
  const reportDescription="VOLUNTARY synthetic report text never backed up";
  diagnostics.prepareLocalDiagnosticReport({appVersion:"2026.10.22+39",platform:"android",language:"en",description:reportDescription,includeErrors:true,includeUsage:true});
  await store.unlockLocalFinanceSession("1234");
  for (const payload of [await store.getLocalExportPayload(),await store.getLocalAiReportSource()]) {
    const json=JSON.stringify(payload); assert.ok(json.includes(PRIVATE_NOTE));
    for (const forbidden of [diagnostics.DIAGNOSTIC_DATA_KEY,diagnostics.DIAGNOSTIC_PREFERENCES_KEY,"LOCAL_SAVE_FAILED",reportDescription,PRIVATE_FAILURE,"diagnostics"]) assert.ok(!json.includes(forbidden),forbidden);
    assert.equal(payload.weeks[0].weekly_note,PRIVATE_NOTE);
  }
});

test("disabled errors leave real failed-save usage active without collecting private exception", async (t) => {
  const h=browser(t,{errors:false,usage:true}); const input=await weekInput();
  const failure=new Error(PRIVATE_FAILURE); h.faults.set(`write:${WEEK_KEY}`,failure);
  assert.throws(()=>store.saveLocalWeek(input), error=>error===failure);
  assert.deepEqual(h.evidence().errors,[]); assert.equal(h.evidence().usage[0].flows.save.failed,1); assertNoAutomaticPrivateContent(h);
});

test("disabled usage leaves real failed-save error active without flow counts", async (t) => {
  const h=browser(t,{errors:true,usage:false}); const input=await weekInput();
  const failure=new Error(PRIVATE_FAILURE); h.faults.set(`write:${WEEK_KEY}`,failure);
  assert.throws(()=>store.saveLocalWeek(input), error=>error===failure);
  assert.deepEqual(h.evidence().usage,[]); assert.equal(h.evidence().errors[0].code,"LOCAL_SAVE_FAILED"); assertNoAutomaticPrivateContent(h);
});

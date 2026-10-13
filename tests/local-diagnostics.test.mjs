import assert from "node:assert/strict";
import { test } from "node:test";
import * as lib from "../src/lib/local-diagnostics.ts";
const error = { route: "finance", action: "save", code: "LOCAL_SAVE_FAILED" };
const context = { appVersion: "2026.10.22+39", platform: "android", language: "fa" };
function harness() {
  const values = new Map([["primary", "PRIVATE planner prose/PIN 1234/amount 9000"]]);
  let date = new Date("2026-10-13T12:00:00Z");
  const failures = { read: false, write: false, remove: false, silent: false };
  const storage = { getItem(key) { if (failures.read) throw Error("SECRET"); return values.get(key) ?? null; }, setItem(key, value) { if (failures.write) throw Error("quota SECRET"); if (!failures.silent) values.set(key, value); }, removeItem(key) { if (failures.remove) throw Error("SECRET"); if (!failures.silent) values.delete(key); } };
  return { values, failures, api: lib.createLocalDiagnostics(storage, () => date), advance(day) { date = new Date(`${day}T12:00:00Z`); } };
}
test("defaults persist before collection; saved OFF stays OFF and categories are independent", () => {
  const h = harness();
  h.api.recordLocalError(error); assert.deepEqual(JSON.parse(h.values.get(lib.DIAGNOSTIC_PREFERENCES_KEY)), {errors:true,usage:true});
  h.api.setDiagnosticPreference("errors", false); h.api.recordLocalError(error); h.api.recordRouteUse("planner");
  assert.equal(h.api.inspectLocalDiagnostics().errors.length, 1); assert.equal(h.api.inspectLocalDiagnostics().usage[0].routes.planner, 1);
  h.api.setDiagnosticPreference("usage", false); h.api.setDiagnosticPreference("errors", true); h.api.recordLocalError(error); h.api.recordRouteUse("planner");
  assert.equal(h.api.inspectLocalDiagnostics().errors.length, 2); assert.equal(h.api.inspectLocalDiagnostics().usage[0].routes.planner, 1);
  const reopened = lib.createLocalDiagnostics({getItem:k=>h.values.get(k)??null,setItem:(k,v)=>h.values.set(k,v),removeItem:k=>h.values.delete(k)});
  assert.equal(reopened.readDiagnosticPreferences().usage, false);
});
test("invalid/read/write/silent prefs fail closed without overwriting saved choices", () => {
  for (const mode of ["read", "write", "silent", "invalid"]) {
    const h = harness(); if (mode === "invalid") h.values.set(lib.DIAGNOSTIC_PREFERENCES_KEY, '{"errors":true}'); else h.failures[mode] = true;
    assert.deepEqual(h.api.readDiagnosticPreferences(), {errors:false,usage:false,unavailable:true});
    assert.doesNotThrow(() => { h.api.recordLocalError(error); h.api.recordRouteUse("finance"); });
    assert.equal(h.values.has(lib.DIAGNOSTIC_DATA_KEY), false);
  }
});
test("automatic privacy canaries and arbitrary metadata never enter storage or reports", () => {
  const h = harness(); const canary = "SECRET prose https://secret/?token=PIN1234 amount=9000 filename";
  h.api.recordLocalError({...error, message:canary, stack:canary, metadata:{body:canary}, toJSON(){throw Error(canary);}});
  h.api.recordLocalError({route:canary,action:"save",code:"LOCAL_SAVE_FAILED"});
  h.api.recordRouteUse(canary); h.api.recordRouteUse("unknown"); h.api.recordFlowOutcome("share", "chooser-returned");
  const report = h.api.prepareLocalDiagnosticReport({...context, includeErrors:true, includeUsage:true});
  const text = lib.formatLocalDiagnosticReport(report); assert.ok(!text.includes(canary)); assert.equal(report.errors.length, 1); assert.deepEqual(report.usage[0].routes, {});
  h.values.set(lib.DIAGNOSTIC_DATA_KEY, JSON.stringify({errors:[{...error,day:"2026-10-13",secret:canary}],usage:[{day:"2026-10-13",routes:{planner:2,secret:canary},flows:{save:{completed:2,secret:canary}},secret:canary}],secret:canary}));
  assert.ok(!JSON.stringify(h.api.inspectLocalDiagnostics()).includes(canary)); assert.ok(!h.values.get(lib.DIAGNOSTIC_DATA_KEY).includes(canary));
});
test("usage is daily aggregate, closed enums and capped numbers", () => {
  const h = harness(); h.api.recordRouteUse("planner"); h.api.recordRouteUse("planner"); h.api.recordFlowOutcome("save", "completed"); h.api.recordFlowOutcome("save", "chooser-returned");
  const data = h.api.inspectLocalDiagnostics(); assert.equal(data.usage.length,1); assert.equal(data.usage[0].routes.planner,2); assert.deepEqual(data.usage[0].flows.save,{completed:1});
  h.values.set(lib.DIAGNOSTIC_DATA_KEY, JSON.stringify({errors:[],usage:[{day:"2026-10-13",routes:{finance:999999999,ideas:-1,timer:1.5},flows:{share:{failed:Infinity}}}]}));
  assert.deepEqual(h.api.inspectLocalDiagnostics().usage[0].routes, {finance:999999});
});
test("200 errors, byte cap and 14 calendar days enforced at load, append and report", () => {
  const h = harness(); for(let i=0;i<220;i++) h.api.recordLocalError(error);
  assert.equal(h.api.inspectLocalDiagnostics().errors.length,200); assert.ok(Buffer.byteLength(h.values.get(lib.DIAGNOSTIC_DATA_KEY)) <= lib.DIAGNOSTIC_MAX_BYTES);
  h.api.recordRouteUse("ideas"); h.advance("2026-10-26"); assert.equal(h.api.inspectLocalDiagnostics().errors.length,200);
  h.advance("2026-10-27"); const report=h.api.prepareLocalDiagnosticReport({...context,includeErrors:true,includeUsage:true}); assert.deepEqual(report.errors,[]); assert.deepEqual(report.usage,[]);
  const many = {errors: Array.from({length:300},()=>({...error,day:"2026-10-27"})),usage:[]}; h.values.set(lib.DIAGNOSTIC_DATA_KEY,JSON.stringify(many)); assert.equal(h.api.inspectLocalDiagnostics().errors.length,200);
});
test("corrupt/oversized stores report failure explicitly and recording never throws", () => {
  for (const value of ['{broken', '{}', 'x'.repeat(lib.DIAGNOSTIC_MAX_BYTES+1)]) {
    const h=harness(); h.values.set(lib.DIAGNOSTIC_DATA_KEY,value); assert.throws(()=>h.api.inspectLocalDiagnostics()); assert.doesNotThrow(()=>h.api.recordLocalError(error));
    assert.equal(h.values.get("primary"),"PRIVATE planner prose/PIN 1234/amount 9000"); h.api.deleteLocalDiagnostics("all"); assert.equal(h.values.has(lib.DIAGNOSTIC_DATA_KEY),false);
  }
});
test("quota/read/remove/silent failure isolation and truthful inspection/deletion", () => {
  for(const mode of ["read","write","silent","remove"]) {
    const h=harness(); h.api.recordLocalError(error); h.api.recordRouteUse("ideas"); h.failures[mode]=true;
    assert.doesNotThrow(()=>{h.api.recordLocalError(error);h.api.recordRouteUse("finance");h.api.recordFlowOutcome("import","failed");});
    if(mode!=="remove" && mode!=="silent") assert.throws(()=>h.api.inspectLocalDiagnostics());
    if(mode!=="write") assert.throws(()=>h.api.deleteLocalDiagnostics("all"));
    assert.equal(h.values.get("primary"),"PRIVATE planner prose/PIN 1234/amount 9000");
  }
});
test("category deletion preserves other evidence and preferences; disabled records remain inspectable", () => {
  const h=harness(); h.api.recordLocalError(error); h.api.recordRouteUse("timer"); h.api.setDiagnosticPreference("errors",false);
  assert.equal(h.api.inspectLocalDiagnostics().errors.length,1); h.api.deleteLocalDiagnostics("usage"); assert.equal(h.api.inspectLocalDiagnostics().errors.length,1); assert.deepEqual(h.api.inspectLocalDiagnostics().usage,[]);
  h.api.recordRouteUse("planner"); h.api.deleteLocalDiagnostics("errors"); assert.equal(h.api.inspectLocalDiagnostics().usage.length,1); assert.equal(h.api.readDiagnosticPreferences().errors,false);
});
test("immutable explicit report snapshot, independent unchecked attachments, voluntary bounded description", () => {
  const h=harness(); h.api.recordLocalError(error); h.api.recordRouteUse("planner");
  const plain=h.api.prepareLocalDiagnosticReport({...context,description:"Voluntary PRIVATE text"}); assert.equal(plain.errors,undefined); assert.equal(plain.usage,undefined);
  assert.ok(!h.values.get(lib.DIAGNOSTIC_DATA_KEY).includes("Voluntary PRIVATE"));
  const report=h.api.prepareLocalDiagnosticReport({...context,includeErrors:true}); const text=lib.formatLocalDiagnosticReport(report); h.api.recordLocalError(error);
  assert.equal(lib.formatLocalDiagnosticReport(report),text); assert.equal(report.errors.length,1); assert.equal(report.usage,undefined); assert.throws(()=>report.errors.push(error));
  assert.throws(()=>h.api.prepareLocalDiagnosticReport({...context,description:"x".repeat(4001)})); assert.equal(h.api.prepareLocalDiagnosticReport({...context,appVersion:"secret https://url"}).header.appVersion,"unavailable");
});
test("browser wrappers perform no storage I/O before disclosure or outside local mode", () => {
  const before=process.env.NEXT_PUBLIC_DATA_MODE; const old=global.window;
  let touched=0; global.window={get localStorage(){touched++;throw Error("must not access");}};
  try {process.env.NEXT_PUBLIC_DATA_MODE="local"; lib.recordLocalError(error); assert.equal(touched,0); lib.activateLocalDiagnosticsAfterDisclosure(); process.env.NEXT_PUBLIC_DATA_MODE="backend"; lib.recordLocalError(error); lib.recordRouteUse("planner"); lib.readDiagnosticPreferences(); assert.equal(touched,0);} finally {if(before===undefined) delete process.env.NEXT_PUBLIC_DATA_MODE; else process.env.NEXT_PUBLIC_DATA_MODE=before; global.window=old;}
});

test("failed disable latches only its category OFF until successful explicit retry", () => {
  const h=harness(); h.api.recordLocalError(error); h.api.recordRouteUse("planner"); h.failures.write=true;
  assert.throws(()=>h.api.setDiagnosticPreference("errors",false)); h.failures.write=false;
  assert.deepEqual(h.api.readDiagnosticPreferences(),{errors:false,usage:true,unavailable:true});
  h.api.recordLocalError(error); h.api.recordRouteUse("planner");
  assert.equal(h.api.inspectLocalDiagnostics().errors.length,1); assert.equal(h.api.inspectLocalDiagnostics().usage[0].routes.planner,2);
  h.api.setDiagnosticPreference("errors",false); assert.deepEqual(h.api.readDiagnosticPreferences(),{errors:false,usage:true,unavailable:false});
  assert.equal(h.values.get("primary"),"PRIVATE planner prose/PIN 1234/amount 9000");
});
test("quota pressure sheds only diagnostic evidence with bounded retry", () => {
  const h=harness(); h.api.readDiagnosticPreferences(); const original=h.values.get("primary");
  const storage={getItem:k=>h.values.get(k)??null,removeItem:k=>h.values.delete(k),setItem(k,v){if(k===lib.DIAGNOSTIC_DATA_KEY&&v.length>120)throw Error("quota");h.values.set(k,v);}};
  const api=lib.createLocalDiagnostics(storage,()=>new Date("2026-10-13T12:00:00Z"));
  for(let i=0;i<20;i++)api.recordLocalError(error);
  assert.ok(h.values.get(lib.DIAGNOSTIC_DATA_KEY).length<=120); assert.equal(h.values.get("primary"),original);
});

test("explicit corrupt preference repair keeps unknown other OFF and preserves valid saved other OFF", () => {
  for(const raw of ["{broken", '{"errors":"yes","usage":false}']) {
    const h=harness();h.values.set(lib.DIAGNOSTIC_PREFERENCES_KEY,raw);
    assert.equal(h.api.readDiagnosticPreferences().unavailable,true);
    h.api.setDiagnosticPreference("errors",true);
    assert.deepEqual(h.api.readDiagnosticPreferences(),{errors:true,usage:false,unavailable:false});
    h.api.recordRouteUse("planner"); assert.equal(h.values.has(lib.DIAGNOSTIC_DATA_KEY),false);
    assert.equal(h.values.get("primary"),"PRIVATE planner prose/PIN 1234/amount 9000");
  }
});

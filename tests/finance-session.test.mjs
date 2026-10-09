import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { FinanceSessionLifecycle, FINANCE_SESSION_CHECK_MS, watchFinanceSession } from "../src/lib/finance-session.ts";

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
const { checkLocalFinanceSession, getLocalFinance, unlockLocalFinanceSession, addLocalIncome } = await import("../src/lib/local-store.ts");
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function browser(t) {
  const originalWindow = globalThis.window;
  const originalNow = Date.now;
  let now = 1_000_000;
  const values = new Map();
  const intervals = new Map();
  let id = 0;
  const windowTarget = new EventTarget();
  Object.assign(windowTarget, {
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) },
    setInterval(callback, ms) { intervals.set(++id, { callback, ms }); return id; },
    clearInterval(id) { intervals.delete(id); },
  });
  const documentTarget = Object.assign(new EventTarget(), { visibilityState: "visible" });
  globalThis.window = windowTarget;
  Date.now = () => now;
  t.after(() => { globalThis.window = originalWindow; Date.now = originalNow; });
  return { windowTarget, documentTarget, intervals, values, advance: ms => { now += ms; } };
}

function monitor(env, lifecycle, onLock) {
  const generation = lifecycle.current();
  return watchFinanceSession(env.windowTarget, env.documentTarget, async () => {
    await lifecycle.validate(generation, checkLocalFinanceSession, () => { lifecycle.begin(); onLock(); });
  });
}

test("near-expiry mount keeps a 30-second cadence despite the one-hour payload TTL", async t => {
  const env = browser(t);
  await unlockLocalFinanceSession("1234");
  const saved = await addLocalIncome(100, "saved note");
  assert.equal(saved.unlock_ttl_seconds, 3600);
  env.advance(3_600_000 - 1_000);
  const lifecycle = new FinanceSessionLifecycle();
  lifecycle.begin();
  let locked = false;
  const cleanup = monitor(env, lifecycle, () => { locked = true; });
  await tick();
  assert.equal(locked, false);
  const interval = [...env.intervals.values()][0];
  assert.equal(interval.ms, FINANCE_SESSION_CHECK_MS);
  assert.ok(interval.ms <= 30_000);
  const beforeExpiry = new Map(env.values);
  env.advance(interval.ms);
  interval.callback();
  await tick();
  assert.equal(locked, true);
  assert.deepEqual(env.values, beforeExpiry, "relocking must not write or delete saved records");
  cleanup();
});

for (const event of ["focus", "visibilitychange"]) {
  test(`${event} rechecks after suspension; cleanup removes timers and listeners`, async t => {
    const env = browser(t);
    await unlockLocalFinanceSession("1234");
    const lifecycle = new FinanceSessionLifecycle();
    lifecycle.begin();
    let locks = 0;
    const cleanup = monitor(env, lifecycle, () => { locks += 1; });
    await tick();
    env.advance(3_600_001);
    if (event === "focus") env.windowTarget.dispatchEvent(new Event(event));
    else {
      env.documentTarget.visibilityState = "hidden";
      env.documentTarget.dispatchEvent(new Event(event));
      await tick();
      assert.equal(locks, 0, "hiding alone does not force lock");
      env.documentTarget.visibilityState = "visible";
      env.documentTarget.dispatchEvent(new Event(event));
    }
    await tick();
    assert.equal(locks, 1);
    cleanup();
    assert.equal(env.intervals.size, 0);
    lifecycle.begin();
    env.windowTarget.dispatchEvent(new Event("focus"));
    env.documentTarget.dispatchEvent(new Event("visibilitychange"));
    await tick();
    assert.equal(locks, 1);
  });
}

for (const operation of ["read", "mutation"]) {
  test(`delayed ${operation} cannot publish after lock or expiry before polling`, async t => {
    const env = browser(t);
    await unlockLocalFinanceSession("1234");
    const lifecycle = new FinanceSessionLifecycle();
    const generation = lifecycle.begin();
    const delayed = deferred();
    let published = null;
    let locks = 0;
    const authoritative = operation === "read" ? await getLocalFinance() : await addLocalIncome(200, "accepted before expiry");
    const pending = (async () => {
      const payload = await delayed.promise;
      if (await lifecycle.validate(generation, checkLocalFinanceSession, () => { lifecycle.begin(); locks += 1; }) && lifecycle.isCurrent(generation)) published = payload;
    })();
    env.advance(3_600_001);
    delayed.resolve(authoritative);
    await pending;
    assert.equal(published, null);
    assert.equal(locks, 1);
    await unlockLocalFinanceSession("1234");
    const fresh = await getLocalFinance();
    assert.equal(fresh.entries.length, operation === "read" ? 0 : 1, "accepted mutations remain saved");

    const oldGeneration = lifecycle.begin();
    const later = deferred();
    const stale = (async () => {
      const payload = await later.promise;
      if (await lifecycle.validate(oldGeneration, checkLocalFinanceSession, () => { throw new Error("stale lock"); }) && lifecycle.isCurrent(oldGeneration)) published = payload;
    })();
    lifecycle.begin(); // lock/unmount invalidates work immediately, before its response arrives.
    later.resolve(authoritative);
    await stale;
    assert.equal(published, null);
  });
}

test("old session checks cannot lock a fresh unlock; cleanup/setup invalidates old successful checks", async () => {
  const lifecycle = new FinanceSessionLifecycle();
  const old = lifecycle.begin();
  const oldCheck = deferred();
  let locks = 0;
  const pending = lifecycle.validate(old, () => oldCheck.promise, () => { locks += 1; });
  const fresh = lifecycle.begin();
  assert.equal(await lifecycle.validate(fresh, async () => new Response(null, { status: 200 }), () => { locks += 1; }), true);
  oldCheck.resolve(new Response(null, { status: 403 }));
  assert.equal(await pending, false);
  assert.equal(locks, 0);
  const delayed = deferred();
  const currentCheck = lifecycle.validate(fresh, () => delayed.promise, () => { locks += 1; });
  lifecycle.begin(); // effect cleanup
  lifecycle.begin(); // StrictMode effect setup
  delayed.resolve(new Response(null, { status: 200 }));
  assert.equal(await currentCheck, false);
});

test("failed fresh checks never authorize publishing", async () => {
  const lifecycle = new FinanceSessionLifecycle();
  const generation = lifecycle.begin();
  await assert.rejects(lifecycle.validate(generation, async () => new Response(null, { status: 500 }), () => { throw new Error("not expiry"); }), /HTTP 500/);
  await assert.rejects(lifecycle.validate(generation, async () => { throw new Error("offline"); }, () => {}), /offline/);
});

test("FinanceView clears every sensitive draft and pending state on lock and guards every async publication", () => {
  const source = readFileSync(new URL("../src/components/finance-view.tsx", import.meta.url), "utf8");
  const reset = source.slice(source.indexOf("const forceLock"), source.indexOf("}, [session]);"));
  for (const statement of [
    "session.begin()", "setData(null)", 'setGoalInput("")', 'setIncomeInput("")', 'setIncomeNote("")',
    "setEditingEntryId(null)", 'setEditAmountInput("")', 'setEditNoteInput("")', 'setEditDateInput("")',
    'setPinInput("")', "setShowGoalSettings(false)", "setIsUnlocking(false)", "setIsSavingGoal(false)",
    "setIsAddingIncome(false)", "setDeletingEntryId(null)", "setIsSavingEdit(false)", 'setMessage("")', "setError(messageText)",
  ]) assert.ok(reset.includes(statement), `lock cleanup missing ${statement}`);
  for (const handler of ["unlockFinance", "saveGoal", "addIncome", "deleteIncome", "saveEdit"]) {
    const start = source.indexOf(`async function ${handler}(`);
    const end = source.indexOf("\n  }", start);
    const body = source.slice(start, end);
    assert.match(body, /if \(!await canPublish\(generation\)\) return;\s+if \(!session.isCurrent\(generation\)\) return;\s+setData\(payload\)/, `${handler} needs a synchronous post-await generation guard before publishing`);
    assert.ok(body.includes("if (!session.isCurrent(generation)) return;"), `${handler} must guard old catches`);
    assert.match(body, /finally \{\s+if \(session.isCurrent\(generation\)\)/, `${handler} must guard old finally`);
  }
  assert.ok(!source.includes("setSessionCheckIntervalMs"));
  assert.ok(source.includes('aria-label={t("financePin")}'));
  assert.ok(source.includes('tabIndex={-1}'));
});


test("simultaneous successful publication check and expired monitor never publish after lock", async () => {
  const lifecycle = new FinanceSessionLifecycle();
  const generation = lifecycle.begin();
  const success = deferred();
  const expiry = deferred();
  let published = null;
  let validationResult;
  let locks = 0;
  // Match FinanceView's canPublish wrapper: its extra await creates the race.
  async function canPublish() {
    return lifecycle.validate(generation, () => success.promise, () => { lifecycle.begin(); });
  }
  const caller = (async () => {
    validationResult = await canPublish();
    if (!validationResult) return;
    if (!lifecycle.isCurrent(generation)) return;
    published = { entries: ["sensitive"] };
  })();
  const monitor = lifecycle.validate(generation, () => expiry.promise, () => {
    lifecycle.begin();
    locks += 1;
    published = null;
  });
  success.resolve(new Response(null, { status: 200 }));
  expiry.resolve(new Response(null, { status: 403 }));
  await Promise.all([caller, monitor]);
  assert.equal(validationResult, true, "the helper succeeded before the parallel expiry callback");
  assert.equal(locks, 1);
  assert.equal(published, null, "only the synchronous caller guard blocks this race");
});

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import {
  createFinanceVisibilityStore,
  FINANCE_VISIBILITY_KEY,
} from "../src/lib/finance-visibility.ts";
import { FinanceSessionLifecycle, watchFinanceVisibility } from "../src/lib/finance-session.ts";

const FINANCE_KEY = "smart-paper.local.finance";
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

function device(seed = {}) {
  const values = new Map(Object.entries(seed));
  const failures = new Set();
  const storage = {
    getItem(key) {
      if (failures.has(`read:${key}`)) throw new Error("storage unavailable");
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (failures.has(`write:${key}`)) throw new Error("storage full");
      values.set(key, String(value));
    },
  };
  return {
    values,
    failures,
    storage,
    store: createFinanceVisibilityStore(() => storage),
  };
}

test("a fresh install defaults visible and persists the initial choice", () => {
  const { store, values } = device();
  assert.deepEqual(store.initialize(), { initialized: true, visible: true, error: null });
  assert.equal(values.get(FINANCE_VISIBILITY_KEY), "visible");
});

test("the visible default never reads Finance records or depends on their presence", () => {
  for (const savedRecords of [undefined, "", "damaged", "{}"]) {
    const current = device(savedRecords === undefined ? {} : { [FINANCE_KEY]: savedRecords });
    current.failures.add(`read:${FINANCE_KEY}`);
    assert.equal(current.store.initialize().visible, true);
    assert.equal(current.values.get(FINANCE_VISIBILITY_KEY), "visible");
    assert.equal(current.values.get(FINANCE_KEY), savedRecords);
  }
});

test("an explicit choice overrides the visible default and survives a new runtime", () => {
  const first = device({ [FINANCE_KEY]: "{}", [FINANCE_VISIBILITY_KEY]: "hidden" });
  assert.equal(first.store.initialize().visible, false);
  const restarted = createFinanceVisibilityStore(() => first.storage);
  assert.equal(restarted.initialize().visible, false);
});

test("malformed preferences default visible and are repaired only by an explicit retry or choice", () => {
  const current = device({ [FINANCE_KEY]: "{}", [FINANCE_VISIBILITY_KEY]: "broken" });
  assert.deepEqual(current.store.initialize(), { initialized: true, visible: true, error: "malformed" });
  assert.equal(current.values.get(FINANCE_VISIBILITY_KEY), "broken");
  assert.equal(current.store.setVisible(false), true);
  assert.equal(current.values.get(FINANCE_VISIBILITY_KEY), "hidden");
  assert.equal(current.store.getSnapshot().visible, false);
});

test("unreadable storage uses recovery-visible default and Retry persists the held choice", () => {
  const current = device();
  current.failures.add(`read:${FINANCE_VISIBILITY_KEY}`);
  assert.deepEqual(current.store.initialize(), { initialized: true, visible: true, error: "unavailable" });
  current.failures.delete(`read:${FINANCE_VISIBILITY_KEY}`);
  assert.equal(current.store.retry(), true);
  assert.equal(current.values.get(FINANCE_VISIBILITY_KEY), "visible");
});

test("failed initial and explicit writes keep the effective choice and can be retried", () => {
  const current = device();
  current.failures.add(`write:${FINANCE_VISIBILITY_KEY}`);
  assert.deepEqual(current.store.initialize(), { initialized: true, visible: true, error: "save" });
  current.failures.delete(`write:${FINANCE_VISIBILITY_KEY}`);
  assert.equal(current.store.retry(), true);
  assert.equal(current.values.get(FINANCE_VISIBILITY_KEY), "visible");
  assert.equal(current.store.getSnapshot().visible, true);
});

test("Retry commits the attempted choice, while repeated failure retains the prior effective choice", () => {
  const current = device({ [FINANCE_VISIBILITY_KEY]: "hidden" });
  current.store.initialize();
  current.failures.add(`write:${FINANCE_VISIBILITY_KEY}`);
  assert.equal(current.store.setVisible(true), false);
  assert.equal(current.store.getSnapshot().visible, false);
  assert.equal(current.store.retry(), false);
  assert.equal(current.store.getSnapshot().visible, false);
  current.failures.delete(`write:${FINANCE_VISIBILITY_KEY}`);
  assert.equal(current.store.retry(), true);
  assert.equal(current.store.getSnapshot().visible, true);
  assert.equal(current.values.get(FINANCE_VISIBILITY_KEY), "visible");
});

test("a held initial choice is stable across Finance imports and subscriptions receive changes", () => {
  const current = device({ [FINANCE_VISIBILITY_KEY]: "hidden" });
  current.store.initialize();
  let notified = 0;
  const unsubscribe = current.store.subscribe(() => notified++);
  current.values.set(FINANCE_KEY, JSON.stringify({ goal_amount: 20, entries: [] }));
  assert.equal(current.store.getSnapshot().visible, false);
  assert.equal(current.store.setVisible(true), true);
  assert.equal(current.store.getSnapshot().visible, true);
  assert.equal(notified, 1);
  current.values.set(FINANCE_VISIBILITY_KEY, "hidden");
  current.store.syncFromStorage("visible"); // queued event is stale; storage is authoritative
  assert.equal(current.store.getSnapshot().visible, false);
  assert.equal(notified, 2);
  unsubscribe();
});

test("a read failure after a known hidden choice retains hidden recovery state", () => {
  const current = device({ [FINANCE_VISIBILITY_KEY]: "hidden" });
  current.store.initialize();
  current.failures.add(`read:${FINANCE_VISIBILITY_KEY}`);
  assert.equal(current.store.retry(), false);
  assert.deepEqual(current.store.getSnapshot(), { initialized: true, visible: false, error: "unavailable" });
});

test("recovered missing preference retains a known hidden choice", () => {
  const current = device({ [FINANCE_KEY]: "imported", [FINANCE_VISIBILITY_KEY]: "hidden" });
  current.store.initialize();
  current.failures.add(`read:${FINANCE_VISIBILITY_KEY}`);
  assert.equal(current.store.retry(), false);
  current.failures.delete(`read:${FINANCE_VISIBILITY_KEY}`);
  current.values.delete(FINANCE_VISIBILITY_KEY);
  assert.equal(current.store.retry(), true);
  assert.equal(current.store.getSnapshot().visible, false);
  assert.equal(current.values.get(FINANCE_VISIBILITY_KEY), "hidden");
});

test("hiding clears the active Finance lifecycle before expiry and re-enable requires a new lifecycle", async () => {
  const current = device({ [FINANCE_VISIBILITY_KEY]: "visible" });
  const lifecycle = new FinanceSessionLifecycle();
  let visibleContent = "sensitive records";
  let publishedContent = null;
  let clock = 0;
  const sessionExpiresAt = 10;
  const publishAfterSessionCheck = async () => {
    const generation = lifecycle.current();
    await Promise.resolve();
    if (clock < sessionExpiresAt && lifecycle.isCurrent(generation)) {
      publishedContent = visibleContent;
    }
  };
  current.store.initialize();
  const stop = watchFinanceVisibility(
    current.store.getSnapshot,
    current.store.subscribe,
    () => {
      lifecycle.begin();
      visibleContent = "";
      publishedContent = null;
    },
  );
  await publishAfterSessionCheck();
  assert.equal(publishedContent, "sensitive records");
  current.store.setVisible(false);
  assert.equal(visibleContent, "");
  assert.equal(publishedContent, null);
  clock = sessionExpiresAt;
  current.store.setVisible(true);
  assert.equal(publishedContent, null);
  await publishAfterSessionCheck();
  assert.equal(publishedContent, null);
  stop();
});

test("visibility toggles and authorized merge/replace imports preserve the local preference and PIN expiry", async t => {
  const originalWindow = globalThis.window;
  const originalNow = Date.now;
  const values = new Map([
    [FINANCE_KEY, JSON.stringify({ goal_amount: 300, entries: [{ id: 1, amount: 80, note: "saved", received_on: "2026-10-10" }] })],
    [FINANCE_VISIBILITY_KEY, "hidden"],
  ]);
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  globalThis.window = { localStorage: storage, sessionStorage: storage };
  let now = 2_000_000;
  Date.now = () => now;
  t.after(() => { globalThis.window = originalWindow; Date.now = originalNow; });

  const localStore = await import(`../src/lib/local-store.ts?finance-visibility=${Math.random()}`);
  const visibility = createFinanceVisibilityStore(() => storage);
  assert.equal(visibility.initialize().visible, false);
  assert.equal((await localStore.checkLocalFinanceSession()).status, 403);
  await assert.rejects(localStore.getLocalExportPayload(), error => error.status === 403);
  await assert.rejects(localStore.importLocalExportPayload({}, "replace"), error => error.status === 403);

  await localStore.unlockLocalFinanceSession("1234");
  assert.equal((await localStore.checkLocalFinanceSession()).status, 200);
  const financeBeforeToggle = values.get(FINANCE_KEY);
  assert.equal(visibility.setVisible(true), true);
  assert.equal(values.get(FINANCE_KEY), financeBeforeToggle);
  now += 3_599_000;
  assert.equal((await localStore.checkLocalFinanceSession()).status, 200);
  assert.equal(visibility.setVisible(false), true);
  assert.equal(values.get(FINANCE_KEY), financeBeforeToggle);
  now += 1_000;
  assert.equal((await localStore.checkLocalFinanceSession()).status, 403);

  await localStore.unlockLocalFinanceSession("1234");
  const backup = await localStore.getLocalExportPayload();
  assert.equal(backup.schema_version, 5);
  assert.equal(Object.hasOwn(backup, "finance_visibility"), false);
  assert.equal(JSON.stringify(backup).includes(FINANCE_VISIBILITY_KEY), false);
  assert.equal(backup.finance.entries[0].note, "saved");
  await localStore.importLocalExportPayload(backup, "merge");
  assert.equal(values.get(FINANCE_VISIBILITY_KEY), "hidden");
  await localStore.importLocalExportPayload(backup, "replace");
  assert.equal(values.get(FINANCE_VISIBILITY_KEY), "hidden");
  assert.equal(JSON.parse(values.get(FINANCE_KEY)).entries[0].note, "saved");
});


test("explicit saved visibility remains authoritative without Finance records", () => {
  for (const value of ["hidden", "visible"]) {
    const current = device({ [FINANCE_VISIBILITY_KEY]: value });
    current.failures.add(`read:${FINANCE_KEY}`);
    assert.deepEqual(current.store.initialize(), { initialized: true, visible: value === "visible", error: null });
    assert.equal(current.values.get(FINANCE_VISIBILITY_KEY), value);
    assert.equal(createFinanceVisibilityStore(() => current.storage).initialize().visible, value === "visible");
  }
});

test("a malformed initial preference defaults visible without overwriting it until retry", () => {
  const current = device({ [FINANCE_VISIBILITY_KEY]: "invalid" });
  current.failures.add(`read:${FINANCE_KEY}`);
  assert.deepEqual(current.store.initialize(), { initialized: true, visible: true, error: "malformed" });
  assert.equal(current.values.get(FINANCE_VISIBILITY_KEY), "invalid");
  assert.equal(current.store.retry(), true);
  assert.equal(current.values.get(FINANCE_VISIBILITY_KEY), "visible");
});

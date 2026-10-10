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

const FINANCE_KEY = "smart-paper.local.finance";
const LEGACY_UNLOCK_KEY = "smart-paper.local.finance-unlocked-until";
const FIXED_NOW = 2_000_000;

function installBrowser(t, seed = {}) {
  const originalWindow = globalThis.window;
  const originalNow = Date.now;
  const values = new Map(Object.entries(seed));
  globalThis.window = {
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key),
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  let now = FIXED_NOW;
  Date.now = () => now;
  t.after(() => { globalThis.window = originalWindow; Date.now = originalNow; });
  return { values, advance: milliseconds => { now += milliseconds; } };
}

async function storeInstance() {
  return import(`../src/lib/local-store.ts?runtime=${Math.random()}`);
}

test("a future legacy deadline and an incorrect PIN never unlock Finance", async t => {
  const browser = installBrowser(t, {
    [LEGACY_UNLOCK_KEY]: String(FIXED_NOW + 60_000_000),
    [FINANCE_KEY]: JSON.stringify({ goal_amount: 500, entries: [{ id: 7, amount: 125, note: "saved", received_on: "2026-10-10" }] }),
  });
  const store = await storeInstance();

  assert.equal((await store.checkLocalFinanceSession()).status, 403);
  await assert.rejects(store.getLocalFinance(), error => error.status === 403);
  await assert.rejects(store.unlockLocalFinanceSession("wrong"), error => error.status === 403);
  assert.equal((await store.checkLocalFinanceSession()).status, 403);
  assert.equal(browser.values.get(LEGACY_UNLOCK_KEY), String(FIXED_NOW + 60_000_000));
});

test("a fresh module runtime starts locked while saved Finance remains available after PIN", async t => {
  const browser = installBrowser(t, {
    [FINANCE_KEY]: JSON.stringify({ goal_amount: 500, entries: [{ id: 7, amount: 125, note: "saved", received_on: "2026-10-10" }] }),
    [LEGACY_UNLOCK_KEY]: String(FIXED_NOW + 60_000_000),
  });
  const firstRuntime = await storeInstance();
  await firstRuntime.unlockLocalFinanceSession("1234");
  assert.equal((await firstRuntime.checkLocalFinanceSession()).status, 200);
  assert.equal(browser.values.has(LEGACY_UNLOCK_KEY), true);

  const freshRuntime = await storeInstance();
  assert.equal((await freshRuntime.checkLocalFinanceSession()).status, 403);
  await assert.rejects(freshRuntime.getLocalFinance(), error => error.status === 403);
  await freshRuntime.unlockLocalFinanceSession("1234");
  const finance = await freshRuntime.getLocalFinance();
  assert.equal(finance.goal_amount, 500);
  assert.deepEqual(finance.entries.map(entry => entry.amount), [125]);
  assert.equal(browser.values.has(LEGACY_UNLOCK_KEY), true);
});

test("expiry denies Finance reads, mutations and export while saved entries remain intact", async t => {
  const browser = installBrowser(t, {
    [FINANCE_KEY]: JSON.stringify({ goal_amount: 500, entries: [{ id: 7, amount: 125, note: "saved", received_on: "2026-10-10" }] }),
  });
  const store = await storeInstance();
  await store.unlockLocalFinanceSession("1234");
  browser.advance(3_600_001);

  for (const operation of [
    () => store.getLocalFinance(),
    () => store.saveLocalFinanceGoal(900),
    () => store.getLocalExportPayload(),
  ]) await assert.rejects(operation(), error => error.status === 403);
  assert.deepEqual(JSON.parse(browser.values.get(FINANCE_KEY)), {
    goal_amount: 500,
    entries: [{ id: 7, amount: 125, note: "saved", received_on: "2026-10-10" }],
  });
});

test("JSON export and replace import preserve saved Finance records", async t => {
  const browser = installBrowser(t, {
    [FINANCE_KEY]: JSON.stringify({ goal_amount: 500, entries: [{ id: 7, amount: 125, note: "saved", received_on: "2026-10-10" }] }),
  });
  const store = await storeInstance();
  await store.unlockLocalFinanceSession("1234");
  const exported = JSON.parse(JSON.stringify(await store.getLocalExportPayload()));
  assert.deepEqual(exported.finance.entries.map(entry => entry.amount), [125]);
  await store.importLocalExportPayload(exported, "replace");
  assert.deepEqual(JSON.parse(browser.values.get(FINANCE_KEY)).entries.map(entry => entry.amount), [125]);
});

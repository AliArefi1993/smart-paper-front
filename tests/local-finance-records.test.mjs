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
const FIXED_NOW = 2_100_000_000_000;

function installBrowser(t, seed = {}) {
  const originalWindow = globalThis.window;
  const originalNow = Date.now;
  const values = new Map(Object.entries(seed));
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  let now = FIXED_NOW;
  Date.now = () => now++;
  t.after(() => {
    globalThis.window = originalWindow;
    Date.now = originalNow;
  });
  return { values, advance: (milliseconds) => { now += milliseconds; } };
}

async function storeInstance() {
  return import(`../src/lib/local-store.ts?finance-records=${Math.random()}`);
}

test("income CRUD persists with numeric totals and edited Persian records after a fresh runtime", async (t) => {
  const browser = installBrowser(t);
  const store = await storeInstance();
  await store.unlockLocalFinanceSession("1234");
  let finance = await store.saveLocalFinanceGoal(1000);
  assert.deepEqual(
    { goal: finance.goal_amount, total: finance.total_income, remaining: finance.remaining_amount, progress: finance.progress_percent },
    { goal: 1000, total: 0, remaining: 1000, progress: 0 },
  );

  finance = await store.addLocalIncome(250, "هدیه نوروز");
  const firstId = finance.entries[0].id;
  finance = await store.addLocalIncome(125, "پروژه دوم");
  const secondId = finance.entries.find((entry) => entry.id !== firstId).id;
  assert.notEqual(firstId, secondId);
  assert.equal(finance.total_income, 375);
  assert.equal(finance.remaining_amount, 625);
  assert.equal(finance.progress_percent, 37.5);

  finance = await store.editLocalIncome(firstId, 350, "تغییر یافته", "2026-09-14");
  assert.equal(finance.total_income, 475);
  assert.equal(finance.remaining_amount, 525);
  assert.equal(finance.progress_percent, 47.5);
  assert.deepEqual(finance.entries.find((entry) => entry.id === firstId), {
    id: firstId, amount: 350, note: "تغییر یافته", received_on: "2026-09-14",
  });
  assert.equal(finance.entries.find((entry) => entry.id === secondId).note, "پروژه دوم");

  const afterEditRuntime = await storeInstance();
  assert.equal((await afterEditRuntime.checkLocalFinanceSession()).status, 403);
  await afterEditRuntime.unlockLocalFinanceSession("1234");
  const editedReload = await afterEditRuntime.getLocalFinance();
  assert.deepEqual(editedReload.entries.find((entry) => entry.id === firstId), {
    id: firstId, amount: 350, note: "تغییر یافته", received_on: "2026-09-14",
  });
  assert.deepEqual(editedReload.entries.find((entry) => entry.id === secondId), {
    id: secondId, amount: 125, note: "پروژه دوم", received_on: finance.entries.find((entry) => entry.id === secondId).received_on,
  });

  finance = await store.deleteLocalIncome(firstId);
  assert.equal(finance.total_income, 125);
  assert.equal(finance.remaining_amount, 875);
  assert.equal(finance.progress_percent, 12.5);
  assert.deepEqual(finance.entries.map((entry) => entry.id), [secondId]);

  finance = await store.saveLocalFinanceGoal(100);
  assert.equal(finance.total_income, 125);
  assert.equal(finance.remaining_amount, 0);
  assert.equal(finance.progress_percent, 125);
  finance = await store.saveLocalFinanceGoal(1000);
  assert.equal(finance.remaining_amount, 875);

  const freshRuntime = await storeInstance();
  assert.equal((await freshRuntime.checkLocalFinanceSession()).status, 403);
  await freshRuntime.unlockLocalFinanceSession("1234");
  const reloaded = await freshRuntime.getLocalFinance();
  assert.equal(reloaded.goal_amount, 1000);
  assert.deepEqual(reloaded.entries, finance.entries);
  assert.deepEqual(JSON.parse(browser.values.get(FINANCE_KEY)).entries, finance.entries);
});

test("locked add, edit and delete reject without changing Finance storage", async (t) => {
  const saved = { goal_amount: 500, entries: [{ id: 12, amount: 80, note: "محفوظ", received_on: "2026-09-01" }] };
  const browser = installBrowser(t, { [FINANCE_KEY]: JSON.stringify(saved) });
  const store = await storeInstance();
  const before = browser.values.get(FINANCE_KEY);

  for (const operation of [
    () => store.addLocalIncome(30, "new"),
    () => store.editLocalIncome(12, 90, "edited", "2026-09-02"),
    () => store.deleteLocalIncome(12),
  ]) {
    await assert.rejects(operation(), (error) => error.status === 403);
    assert.equal(browser.values.get(FINANCE_KEY), before);
  }
});

test("expired Finance session rejects add, edit and delete without changing storage", async (t) => {
  const saved = { goal_amount: 500, entries: [{ id: 12, amount: 80, note: "محفوظ", received_on: "2026-09-01" }] };
  const browser = installBrowser(t, { [FINANCE_KEY]: JSON.stringify(saved) });
  const store = await storeInstance();
  await store.unlockLocalFinanceSession("1234");
  browser.advance(3_600_001);
  const before = browser.values.get(FINANCE_KEY);

  for (const operation of [
    () => store.addLocalIncome(30, "new"),
    () => store.editLocalIncome(12, 90, "edited", "2026-09-02"),
    () => store.deleteLocalIncome(12),
  ]) {
    await assert.rejects(operation(), (error) => error.status === 403);
    assert.equal(browser.values.get(FINANCE_KEY), before);
  }
});

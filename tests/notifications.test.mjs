import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const libDirectory = resolve("src/lib");
const nativeModule = `data:text/javascript,export const Capacitor={isNativePlatform:()=>globalThis.__notificationNative===true};`;
const localStoreModule = `data:text/javascript,export async function getLocalWeek(start){return globalThis.__notificationWeekLoader(start);}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@capacitor/core") return { url: nativeModule, shortCircuit: true };
    if (specifier === "@capacitor/local-notifications") {
      return { url: "data:text/javascript,export const LocalNotifications={cancel:(...args)=>globalThis.__notificationMock.cancel(...args),checkPermissions:(...args)=>globalThis.__notificationMock.checkPermissions(...args),requestPermissions:(...args)=>globalThis.__notificationMock.requestPermissions(...args),schedule:(...args)=>globalThis.__notificationMock.schedule(...args)};", shortCircuit: true };
    }
    if (specifier === "@/lib/local-store") return { url: localStoreModule, shortCircuit: true };
    if (specifier.startsWith("@/lib/")) {
      return nextResolve(pathToFileURL(resolve(libDirectory, `${specifier.slice(6)}.ts`)).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { syncMorningPlanNotification, getMorningNotificationSettings } =
  await import("../src/lib/notifications.ts");
const baseTime = new Date(2026, 9, 16, 7, 0, 0).getTime();
const storageKey = "smart-paper.local.morning-notification";

function makeWeek(entriesByDate = {}, weekStart = "2026-10-10") {
  const [year, month, dayOfMonth] = weekStart.split("-").map(Number);
  const start = new Date(year, month - 1, dayOfMonth);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return {
      date: iso,
      day_note: "",
      weekly_goal: "",
      schedule_entries: entriesByDate[iso] ?? [],
    };
  });
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start_date: weekStart, end_date: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`, days };
}

function event(title, start_time = "09:00") {
  return { title, start_time };
}

function setup(t, { native = true, enabled = true, time = "08:00", permission = "granted", now = baseTime } = {}) {
  const originalDate = globalThis.Date;
  const originalWindow = globalThis.window;
  const originalNative = globalThis.__notificationNative;
  const originalMock = globalThis.__notificationMock;
  const originalLoader = globalThis.__notificationWeekLoader;
  const originalMode = process.env.NEXT_PUBLIC_DATA_MODE;
  class FixedDate extends originalDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  globalThis.Date = FixedDate;
  globalThis.__notificationNative = native;
  const values = new Map([[storageKey, JSON.stringify({ enabled, time })]]);
  globalThis.window = { localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  } };
  const calls = { cancel: [], check: 0, request: 0, schedule: [], loadedWeeks: [] };
  globalThis.__notificationMock = {
    cancel: async (value) => { calls.cancel.push(value); },
    checkPermissions: async () => { calls.check += 1; return { display: permission }; },
    requestPermissions: async () => { calls.request += 1; return { display: permission }; },
    schedule: async (value) => { calls.schedule.push(value); },
  };
  globalThis.__notificationWeekLoader = async (start) => {
    calls.loadedWeeks.push(start);
    return globalThis.__weekToLoad ?? null;
  };
  delete globalThis.__weekToLoad;
  t.after(() => {
    globalThis.Date = originalDate;
    globalThis.window = originalWindow;
    globalThis.__notificationNative = originalNative;
    globalThis.__notificationMock = originalMock;
    globalThis.__notificationWeekLoader = originalLoader;
    delete globalThis.__weekToLoad;
    if (originalMode === undefined) delete process.env.NEXT_PUBLIC_DATA_MODE;
    else process.env.NEXT_PUBLIC_DATA_MODE = originalMode;
  });
  return { calls, values };
}

const copy = { title: "Today's plan" };

test("empty, missing-day, and missing-week targets cancel without scheduling", async (t) => {
  for (const [name, week] of [
    ["empty day", makeWeek()],
    ["missing day", makeWeek({}, "2026-10-17")],
    ["missing week", null],
  ]) {
    await t.test(name, async (t) => {
      const { calls } = setup(t);
      assert.equal(await syncMorningPlanNotification(week, copy), "empty");
      assert.deepEqual(calls.cancel, [{ notifications: [{ id: 8001 }] }]);
      assert.equal(calls.check, 1, "the existing permission check remains before suppression");
      assert.equal(calls.schedule.length, 0);
    });
  }
});

test("notes and goals alone do not produce a timed-event reminder", async (t) => {
  const { calls } = setup(t);
  const notesOnly = makeWeek();
  notesOnly.days.find(({ date }) => date === "2026-10-16").day_note = "Rest day";
  notesOnly.weekly_goal = "Read more";
  assert.equal(await syncMorningPlanNotification(notesOnly, copy), "empty");
  assert.equal(calls.schedule.length, 0);
});

test("populated target keeps title, selected time, and first four events", async (t) => {
  const { calls } = setup(t);
  const week = makeWeek({ "2026-10-16": [
    event("One", "08:00"), event("Two", "09:00"), event("Three", "10:00"),
    event("Four", "11:00"), event("Five", "12:00"),
  ] });
  assert.equal(await syncMorningPlanNotification(week, copy), "scheduled");
  const notification = calls.schedule[0].notifications[0];
  assert.equal(notification.title, copy.title);
  assert.equal(notification.body, "08:00 One • 09:00 Two • 10:00 Three • 11:00 Four");
  assert.equal(notification.schedule.at.getTime(), new Date(2026, 9, 16, 8, 0, 0).getTime());
});

test("empty today still schedules populated Saturday target", async (t) => {
  const { calls } = setup(t, { time: "06:00" });
  process.env.NEXT_PUBLIC_DATA_MODE = "local";
  globalThis.__weekToLoad = makeWeek({ "2026-10-17": [event("Saturday")] }, "2026-10-17");
  const viewedWeek = makeWeek();
  assert.equal(await syncMorningPlanNotification(viewedWeek, copy), "scheduled");
  assert.deepEqual(calls.loadedWeeks, ["2026-10-17"]);
  assert.equal(calls.schedule[0].notifications[0].body, "09:00 Saturday");
  assert.equal(calls.schedule[0].notifications[0].schedule.at.getDate(), 17);
});

test("today's populated schedule does not schedule when tomorrow is empty", async (t) => {
  const { calls } = setup(t, { time: "06:00" });
  process.env.NEXT_PUBLIC_DATA_MODE = "local";
  globalThis.__weekToLoad = makeWeek({}, "2026-10-17");
  const viewedWeek = makeWeek({ "2026-10-16": [event("Friday")] });
  assert.equal(await syncMorningPlanNotification(viewedWeek, copy), "empty");
  assert.deepEqual(calls.loadedWeeks, ["2026-10-17"]);
  assert.equal(calls.schedule.length, 0);
});

test("Persian title and populated event preview are preserved", async (t) => {
  const { calls } = setup(t);
  assert.equal(await syncMorningPlanNotification(makeWeek({ "2026-10-16": [event("جلسه", "10:30")] }), { title: "برنامه امروز" }), "scheduled");
  const notification = calls.schedule[0].notifications[0];
  assert.equal(notification.title, "برنامه امروز");
  assert.equal(notification.body, "10:30 جلسه");
});

test("removing the last event cancels the preview and adding one later schedules again", async (t) => {
  const { calls, values } = setup(t);
  const savedSettings = values.get(storageKey);
  assert.equal(await syncMorningPlanNotification(makeWeek({ "2026-10-16": [event("Meeting")] }), copy), "scheduled");
  assert.equal(await syncMorningPlanNotification(makeWeek(), copy), "empty");
  assert.equal(await syncMorningPlanNotification(makeWeek({ "2026-10-16": [event("Later")] }), copy), "scheduled");
  assert.equal(calls.cancel.length, 3);
  assert.equal(calls.schedule.length, 2);
  assert.equal(values.get(storageKey), savedSettings);
  assert.deepEqual(getMorningNotificationSettings(), { enabled: true, time: "08:00" });
});

test("disabled settings cancel without checking permission", async (t) => {
  const disabled = setup(t, { enabled: false });
  assert.equal(await syncMorningPlanNotification(makeWeek(), copy), "disabled");
  assert.deepEqual(disabled.calls.cancel, [{ notifications: [{ id: 8001 }] }]);
  assert.equal(disabled.calls.check, 0);
});

test("denied Settings permission keeps the existing request behavior", async (t) => {
  const denied = setup(t, { permission: "denied" });
  assert.equal(await syncMorningPlanNotification(makeWeek(), copy), "denied");
  assert.equal(denied.calls.request, 1, "Settings retains its permission request on empty days");
  assert.equal(denied.calls.schedule.length, 0);
});

test("Planner background sync never requests permission", async (t) => {
  const background = setup(t, { permission: "denied" });
  assert.equal(await syncMorningPlanNotification(makeWeek(), copy, false), "denied");
  assert.equal(background.calls.request, 0, "Planner synchronization never requests permission");
});

test("web behavior skips native notification plugin calls", async (t) => {
  const web = setup(t, { native: false });
  assert.equal(await syncMorningPlanNotification(makeWeek(), copy), "web");
  assert.equal(web.calls.cancel.length, 0);
});

test("Settings disclosure uses the approved English and Persian copy", () => {
  const source = readFileSync("src/lib/i18n.ts", "utf8");
  assert.match(source, /Get a local Android reminder for the day's timed events\. No reminder is sent when that day has no timed events\./);
  assert.match(source, /یک یادآوری محلی اندروید با رویدادهای زمان‌دار آن روز دریافت کنید\. اگر آن روز رویداد زمان‌داری نداشته باشد، اعلانی فرستاده نمی‌شود\./);
  assert.doesNotMatch(source, /fallbackBody/);
});

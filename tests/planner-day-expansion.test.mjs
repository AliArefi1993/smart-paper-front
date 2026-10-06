import assert from "node:assert/strict";
import { test } from "node:test";
import { initialOpenDays, revealDay, toggleDay, phoneOpenDays } from "../src/lib/planner-day-expansion.ts";

const days = ["2026-10-03", "2026-10-04", "2026-10-05"];

test("week initialization uses selected phone day and every wide day", () => {
  assert.deepEqual(initialOpenDays(days, days[1], false), [days[1]]);
  assert.deepEqual(initialOpenDays(days, days[1], true), days);
  assert.deepEqual(initialOpenDays(days, "other-week", false), [days[0]]);
});

test("phone can close every day and rail can reopen an already selected day", () => {
  const closed = toggleDay([days[1]], days[1], false);
  assert.deepEqual(closed, []);
  assert.deepEqual(revealDay(closed, days[1], false), [days[1]]);
  assert.deepEqual(revealDay([days[1]], days[2], false), [days[2]]);
});

test("wide disclosures operate independently without mutating the existing choices", () => {
  const previous = [...days];
  const open = toggleDay(previous, days[1], true);
  assert.deepEqual(open, [days[0], days[2]]);
  assert.deepEqual(previous, days);
  assert.deepEqual(revealDay(open, days[0], true), open);
  assert.deepEqual(days.reduce((open, day) => toggleDay(open, day, true), previous), []);
});

test("wide to phone keeps selected open day, falls back to first open, and preserves all closed", () => {
  assert.deepEqual(phoneOpenDays(days, days[2]), [days[2]]);
  assert.deepEqual(phoneOpenDays([days[0], days[2]], days[1]), [days[0]]);
  assert.deepEqual(phoneOpenDays([], days[1]), []);
  assert.deepEqual(phoneOpenDays([days[2], days[0]], days[1]), [days[0]]);
  const phone = phoneOpenDays(days, days[1]);
  assert.deepEqual(toggleDay(phone, days[2], true), [days[1], days[2]]);
});

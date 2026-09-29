import assert from "node:assert/strict";
import { test } from "node:test";
import {
  advanceTimerPhase,
  createTimerState,
  getTimerRemainingMs,
  normalizeTimerState,
  pauseTimer,
  resetTimer,
  restoreTimerState,
  selectTimerPhase,
  startTimer,
  validateTimerMinutes,
} from "../src/lib/focus-timer.ts";

test("running time follows its deadline after the app is suspended", () => {
  const started = startTimer(createTimerState(25, 5), 1_000_000);
  assert.equal(started.status, "running");
  assert.equal(getTimerRemainingMs(started, 1_000_000 + 10 * 60_000), 15 * 60_000);

  // A persisted timer has no live interval. Reopening it must use wall time.
  const restored = normalizeTimerState(JSON.parse(JSON.stringify(started)), 1_000_000 + 26 * 60_000);
  assert.equal(restored.status, "completed");
  assert.equal(restored.remainingMs, 0);
  assert.equal(restored.deadlineMs, null);
  assert.equal(getTimerRemainingMs(restored, 1_000_000 + 26 * 60_000), 0);
});

test("pause freezes remaining time and resume creates a new deadline", () => {
  const started = startTimer(createTimerState(25, 5), 1_000_000);
  const paused = pauseTimer(started, 1_000_000 + 4 * 60_000);
  assert.equal(paused.status, "paused");
  assert.equal(paused.remainingMs, 21 * 60_000);
  assert.equal(paused.deadlineMs, null);
  assert.equal(getTimerRemainingMs(paused, 1_000_000 + 60 * 60_000), 21 * 60_000);

  const resumed = startTimer(paused, 1_000_000 + 60 * 60_000);
  assert.equal(getTimerRemainingMs(resumed, 1_000_000 + 61 * 60_000), 20 * 60_000);
  assert.equal(normalizeTimerState(resumed, 1_000_000 + 81 * 60_000).status, "completed");
});

test("reset restores the full duration of the current phase", () => {
  const initial = createTimerState(12, 3);
  const reset = resetTimer(pauseTimer(startTimer(initial, 10_000), 70_000));
  assert.equal(reset.phase, "focus");
  assert.equal(reset.status, "idle");
  assert.equal(reset.remainingMs, 12 * 60_000);
  assert.equal(reset.deadlineMs, null);
});

test("phase changes require a fresh start and use the configured rest duration", () => {
  const completedFocus = normalizeTimerState(startTimer(createTimerState(2, 7), 10_000), 130_000);
  assert.equal(completedFocus.status, "completed");
  const rest = advanceTimerPhase(completedFocus);
  assert.equal(rest.phase, "rest");
  assert.equal(rest.status, "idle");
  assert.equal(rest.remainingMs, 7 * 60_000);
  assert.equal(rest.deadlineMs, null);
  const nextFocus = advanceTimerPhase(normalizeTimerState(startTimer(rest, 200_000), 620_000));
  assert.equal(nextFocus.phase, "focus");
  assert.equal(nextFocus.remainingMs, 2 * 60_000);
});

test("manual phase selection resets paused and completed phases but leaves a running timer alone", () => {
  const initial = createTimerState(12, 3);
  const running = startTimer(initial, 10_000);
  assert.deepEqual(selectTimerPhase(running, "rest"), running);

  const paused = pauseTimer(running, 70_000);
  const rest = selectTimerPhase(paused, "rest");
  assert.equal(rest.phase, "rest");
  assert.equal(rest.status, "idle");
  assert.equal(rest.remainingMs, 3 * 60_000);
  assert.equal(rest.deadlineMs, null);

  const completed = normalizeTimerState(startTimer(rest, 100_000), 280_000);
  const focus = selectTimerPhase(completed, "focus");
  assert.equal(focus.phase, "focus");
  assert.equal(focus.status, "idle");
  assert.equal(focus.remainingMs, 12 * 60_000);
  assert.equal(focus.deadlineMs, null);
});

test("duration validation rejects empty, fractional, negative, and out-of-range values", () => {
  assert.equal(validateTimerMinutes("1"), 1);
  assert.equal(validateTimerMinutes("999"), 999);
  for (const value of ["", "0", "-1", "1.5", "1000", "abc"]) {
    assert.equal(validateTimerMinutes(value), null, `accepted ${JSON.stringify(value)}`);
  }
});

test("saved running timers restore from the deadline, including an exact expiry", () => {
  const saved = JSON.parse(JSON.stringify(startTimer(createTimerState(2, 1), 10_000)));
  assert.equal(getTimerRemainingMs(restoreTimerState(saved, 70_000), 70_000), 60_000);
  const expired = restoreTimerState(saved, 130_000);
  assert.equal(expired.status, "completed");
  assert.equal(expired.remainingMs, 0);
  assert.equal(getTimerRemainingMs(expired, 131_000), 0);
});

test("damaged saved timer values recover to safe defaults", () => {
  const saved = startTimer(createTimerState(25, 5), 10_000);
  for (const invalid of [
    null,
    { ...saved, focusMinutes: 0 },
    { ...saved, restMinutes: 1000 },
    { ...saved, remainingMs: -1 },
    { ...saved, deadlineMs: null },
  ]) {
    assert.deepEqual(restoreTimerState(invalid, 20_000), createTimerState());
  }
});

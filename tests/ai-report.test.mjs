import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAiReport, summarizeAiReport } from "../src/lib/ai-report.ts";

const none = {
  weeklyGoals: false,
  weeklyNotes: false,
  sectionActivity: false,
  dayNotes: false,
  scheduledEvents: false,
  financeGoal: false,
  incomeEntries: false,
  incomeNotes: false,
};

function sample() {
  return {
    exported_at: "2026-10-01T12:00:00Z",
    schema_version: 4,
    week_templates: [{ name: "PRIVATE TEMPLATE" }],
    weeks: [{
      start_date: "2026-09-26",
      end_date: "2026-10-02",
      weekly_goal: "WEEK GOAL",
      weekly_note: "WEEK NOTE",
      totals: { week_total_minutes: 9999 },
      planner_sections: [{ id: "slot_1", label: "Study", active: true, order: 1 }],
      days: [
        {
          date: "2026-09-29", weekday_name: "Tuesday", day_note: "EARLY DAY NOTE",
          sections: { slot_1: { duration_minutes: 10, goal: "EARLY GOAL", note: "EARLY SECTION NOTE" } },
          schedule_entries: [{ id: "SECRET EVENT ID", start_time: "09:00", end_time: "10:00", title: "EARLY EVENT", note: "", section_id: "slot_1" }],
        },
        {
          date: "2026-09-30", weekday_name: "Wednesday", day_note: "IN RANGE DAY NOTE",
          sections: { slot_1: { duration_minutes: 25, goal: "IN RANGE GOAL", note: "IN RANGE SECTION NOTE" } },
          schedule_entries: [{ id: "SECRET EVENT ID", start_time: "11:00", end_time: "12:00", title: "IN RANGE EVENT", note: "EVENT NOTE", section_id: "slot_1" }],
        },
        {
          date: "2026-10-01", weekday_name: "Thursday", day_note: "LATE DAY NOTE",
          sections: { slot_1: { duration_minutes: 30, goal: "LATE GOAL", note: "LATE SECTION NOTE" } },
          schedule_entries: [],
        },
      ],
    }],
    finance: {
      goal_amount: 1000, total_income: 9999, remaining_amount: 1234, progress_percent: 99,
      unlock_ttl_seconds: 800,
      entries: [
        { id: 48, amount: 100, note: "EARLY INCOME NOTE", received_on: "2026-09-29" },
        { id: 49, amount: 200, note: "IN RANGE INCOME NOTE", received_on: "2026-09-30" },
        { id: 50, amount: 300, note: "LATE INCOME NOTE", received_on: "2026-10-01" },
      ],
    },
  };
}

test("date boundaries are inclusive and partial-week activity totals use selected days", () => {
  const options = {
    startDate: "2026-09-30", endDate: "2026-09-30",
    include: { ...none, weeklyGoals: true, sectionActivity: true, dayNotes: true, scheduledEvents: true, incomeEntries: true },
  };
  const report = formatAiReport(sample(), options);
  assert.match(report, /2026-09-30 to 2026-09-30 \(inclusive\)/);
  assert.match(report, /WEEK GOAL/);
  assert.match(report, /Selected-day total: 25 min/);
  assert.match(report, /IN RANGE DAY NOTE/);
  assert.match(report, /IN RANGE EVENT/);
  assert.match(report, /Selected-period income total: 200/);
  assert.doesNotMatch(report, /EARLY|LATE|9999|1234|99%|SECRET|PRIVATE|IN RANGE INCOME NOTE/);
  assert.deepEqual(summarizeAiReport(sample(), options), { weeks: 1, days: 1, incomeEntries: 1, hasSelection: true });
});

test("each category can be omitted without leaking its values", () => {
  const options = { include: { ...none, weeklyNotes: true, financeGoal: true } };
  const report = formatAiReport(sample(), options);
  assert.match(report, /WEEK NOTE/);
  assert.match(report, /Current finance goal amount: 1000/);
  assert.doesNotMatch(report, /WEEK GOAL|IN RANGE|EARLY|LATE|income entries|Total minutes|total income|exported_at|Exported at/);
  assert.deepEqual(summarizeAiReport(sample(), options), { weeks: 1, days: 0, incomeEntries: 0, hasSelection: true });
});

test("income notes are optional and only meaningful with income entries", () => {
  const payload = sample();
  const notesOnly = { include: { ...none, incomeNotes: true } };
  assert.deepEqual(summarizeAiReport(payload, notesOnly), { weeks: 0, days: 0, incomeEntries: 0, hasSelection: false });
  assert.doesNotMatch(formatAiReport(payload, notesOnly), /IN RANGE INCOME NOTE|Income entries/);

  const included = { include: { ...none, incomeEntries: true, incomeNotes: true } };
  assert.match(formatAiReport(payload, included), /IN RANGE INCOME NOTE/);
  assert.equal(summarizeAiReport(payload, included).incomeEntries, 3);
});

test("scheduled events do not reveal section labels when section activity is omitted", () => {
  const report = formatAiReport(sample(), {
    startDate: "2026-09-30", endDate: "2026-09-30",
    include: { ...none, scheduledEvents: true },
  });
  assert.match(report, /IN RANGE EVENT/);
  assert.doesNotMatch(report, /Study|IN RANGE GOAL|IN RANGE SECTION NOTE/);
});

test("invalid and incomplete date ranges are rejected", () => {
  const payload = sample();
  for (const [startDate, endDate] of [
    ["2026-09-30", undefined], ["2026-02-30", "2026-03-01"],
    ["2026-10-01", "2026-09-30"], ["09/30/2026", "2026-10-01"],
  ]) {
    const options = { startDate, endDate, include: none };
    assert.throws(() => formatAiReport(payload, options), RangeError);
    assert.throws(() => summarizeAiReport(payload, options), RangeError);
  }
});

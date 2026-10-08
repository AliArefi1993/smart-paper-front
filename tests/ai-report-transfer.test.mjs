import assert from "node:assert/strict";
import { test } from "node:test";
import { copyAiReportText, prepareAiReportTransfer } from "../src/lib/ai-report-transfer.ts";
import { formatAiReport } from "../src/lib/ai-report.ts";

const include = {
  weeklyGoals: true, weeklyNotes: false, sectionActivity: false, dayNotes: false,
  scheduledEvents: false, financeGoal: false, incomeEntries: false, incomeNotes: false,
};

function payload(goal = "Reviewed goal", entries = [], weeks = undefined) {
  return {
    exported_at: "2026-10-08T00:00:00Z", schema_version: 4, week_templates: [],
    weeks: weeks ?? [{ start_date: "2026-10-03", end_date: "2026-10-09", weekly_goal: goal,
      weekly_note: "", totals: { week_total_minutes: 0 }, planner_sections: [], days: [] }],
    finance: { goal_amount: 500, total_income: 0, remaining_amount: 500, progress_percent: 0,
      unlock_ttl_seconds: 0, entries },
  };
}

test("preparation reports changed content and never marks it transfer-ready", async () => {
  const reviewed = "# old preview";
  const result = await prepareAiReportTransfer({ options: { include }, reviewedContent: reviewed,
    readSource: async (withFinance) => { assert.equal(withFinance, false); return payload("Changed goal"); } });
  assert.equal(result.status, "changed");
  assert.match(result.content, /Changed goal/);
  assert.notEqual(result.content, reviewed);
});

test("stable report is ready and preserves selected dates and fields", async () => {
  const options = { startDate: "2026-10-05", endDate: "2026-10-06", include: { ...include, weeklyNotes: true } };
  const source = payload();
  const reviewed = formatAiReport(source, options);
  const result = await prepareAiReportTransfer({ options, reviewedContent: reviewed,
    readSource: async (withFinance) => { assert.equal(withFinance, false); return source; } });
  assert.equal(result.status, "ready");
  assert.equal(result.content, reviewed);
  assert.match(result.content, /2026-10-05 to 2026-10-06/);
  assert.doesNotMatch(result.content, /Current finance goal amount/);
});

test("finance reads are requested only for selected finance fields and empty data is blocked", async () => {
  const options = { include: { ...include, weeklyGoals: false, financeGoal: true } };
  const financeSource = payload();
  const result = await prepareAiReportTransfer({ options, reviewedContent: formatAiReport(financeSource, options),
    readSource: async (withFinance) => { assert.equal(withFinance, true); return financeSource; } });
  assert.equal(result.status, "ready");
  assert.match(result.content, /Current finance goal amount: 500/);
  const noData = await prepareAiReportTransfer({ options: { include }, reviewedContent: "",
    readSource: async (withFinance) => { assert.equal(withFinance, false); return payload("", [], []); } });
  assert.equal(noData.status, "empty");
});

test("no selection and authorization rejection cannot become transfer-ready", async () => {
  const noSelection = await prepareAiReportTransfer({ options: { include: { ...include, weeklyGoals: false } },
    reviewedContent: "", readSource: async () => payload() });
  assert.equal(noSelection.status, "no-selection");
  const forbidden = new Response(null, { status: 403 });
  await assert.rejects(prepareAiReportTransfer({ options: { include: { ...include, financeGoal: true } },
    reviewedContent: "", readSource: async () => { throw forbidden; } }), (error) => error === forbidden);
});

test("clipboard reports success only after write resolves and handles unavailable or denied writes", async () => {
  const writes = [];
  assert.equal(await copyAiReportText("exact report", async (value) => { writes.push(value); }), true);
  assert.deepEqual(writes, ["exact report"]);
  assert.equal(await copyAiReportText("report", undefined), false);
  assert.equal(await copyAiReportText("report", async () => { throw new Error("permission denied"); }), false);
});

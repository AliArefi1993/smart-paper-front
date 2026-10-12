import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildReportWeekHref,
  isCompleteReportDateRange,
  readReportWeekContext,
  plannerReportBlockReason,
} from "../src/lib/report-week-context.ts";

test("report week context accepts one supported Saturday and derives Friday in UTC", () => {
  assert.deepEqual(readReportWeekContext(new URLSearchParams("reportWeek=2026-10-03")), {
    status: "valid",
    startDate: "2026-10-03",
    endDate: "2026-10-09",
  });
  assert.deepEqual(readReportWeekContext(new URLSearchParams("reportWeek=2024-02-24")), {
    status: "valid",
    startDate: "2024-02-24",
    endDate: "2024-03-01",
  });
  assert.equal(buildReportWeekHref("2026-10-03"), "/export?reportWeek=2026-10-03#ai-report");
});

test("absent query preserves ordinary Export entry; malformed context is blocked", () => {
  assert.deepEqual(readReportWeekContext(new URLSearchParams("other=value")), { status: "absent" });
  for (const query of [
    "reportWeek=",
    "reportWeek=2026-10-03&reportWeek=2026-10-10",
    "reportWeek=2026-02-30",
    "reportWeek=2026-10-04",
    "reportWeek=0000-01-01",
    "reportWeek=10000-01-01",
    "reportWeek=9999-12-31",
  ]) {
    assert.deepEqual(readReportWeekContext(new URLSearchParams(query)), { status: "invalid" }, query);
  }
  assert.equal(buildReportWeekHref("2026-10-04"), null);
});

test("date recovery accepts only complete valid ranges", () => {
  assert.equal(isCompleteReportDateRange("2026-10-03", "2026-10-09"), true);
  assert.equal(isCompleteReportDateRange("2026-10-03", ""), false);
  assert.equal(isCompleteReportDateRange("2026-10-10", "2026-10-09"), false);
  assert.equal(isCompleteReportDateRange("2026-02-30", "2026-03-01"), false);
});

test("four-digit calendar bounds include historical dates without the Date.UTC 0–99 year shift", () => {
  assert.deepEqual(readReportWeekContext(new URLSearchParams("reportWeek=0001-01-06")), {
    status: "valid", startDate: "0001-01-06", endDate: "0001-01-12",
  });
  assert.deepEqual(readReportWeekContext(new URLSearchParams("reportWeek=9999-12-18")), {
    status: "valid", startDate: "9999-12-18", endDate: "9999-12-24",
  });
  assert.equal(buildReportWeekHref("9999-12-25"), "/export?reportWeek=9999-12-25#ai-report");
  for (const query of ["reportWeek=2026-10-03&reportWeek=2026-10-03", "reportWeek=2026-1-03", "reportWeek=2026-10-03T00:00:00Z", "reportWeek=%202026-10-03"]) {
    assert.deepEqual(readReportWeekContext(new URLSearchParams(query)), { status: "invalid" });
  }
});

const ready = {
  loading: false, loadFailed: false, saving: false, pendingWeek: false,
  selectedWeekStart: "2026-10-03", loadedWeekStart: "2026-10-03", loadedWeekEnd: "2026-10-09",
  saveFailed: false, unsaved: false, editorOpen: false,
};

test("Planner entry permits an untouched loaded week, and blocks stale selection, saving and editors", () => {
  assert.equal(plannerReportBlockReason(ready), null);
  for (const change of [{ loading: true }, { saving: true }, { pendingWeek: true },
    { loadedWeekStart: null }, { selectedWeekStart: "2026-10-10" }]) {
    assert.equal(plannerReportBlockReason({ ...ready, ...change }), "loading");
  }
  assert.equal(plannerReportBlockReason({ ...ready, loadFailed: true }), "unavailable");
  assert.equal(plannerReportBlockReason({ ...ready, loadedWeekEnd: "2026-10-10" }), "unavailable");
  assert.equal(plannerReportBlockReason({ ...ready, editorOpen: true }), "editor-open");
});

test("failed writing stays blocked until an explicit successful autosave retry", async () => {
  const { PlannerLocalAutosave } = await import("../src/lib/planner-local-autosave.ts");
  let fail = true;
  let stored;
  const owner = new PlannerLocalAutosave((week) => {
    if (fail) throw new Error("quota");
    stored = week;
    return week;
  });
  owner.load({ start_date: ready.loadedWeekStart, note: "" });
  owner.edit({ start_date: ready.loadedWeekStart, note: "retained writing" });
  const reason = () => plannerReportBlockReason({ ...ready, saveFailed: owner.hasFailure() });
  assert.equal(reason(), "save-failed");
  assert.equal(owner.retry(), false);
  assert.equal(reason(), "save-failed");
  fail = false;
  assert.equal(owner.retry(), true);
  assert.equal(reason(), null);
  assert.equal(stored.note, "retained writing");
});

test("existing bilingual Shamsi formatting handles supported modern and upper-bound labels", async () => {
  const { formatReadableShamsiWeekRange } = await import("../src/lib/formatters.ts");
  for (const language of ["en", "fa"]) {
    for (const [start, end] of [["0100-01-02", "0100-01-08"], ["2026-10-03", "2026-10-09"], ["9999-12-25", "9999-12-31"]]) {
      assert.ok(formatReadableShamsiWeekRange(start, end, language).length > 0);
    }
  }
});

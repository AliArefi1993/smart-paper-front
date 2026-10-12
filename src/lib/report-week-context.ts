// The URL contract accepts four-digit Gregorian years, with the entire week in range.
const MIN_SUPPORTED_YEAR = 1;
const MAX_SUPPORTED_YEAR = 9999;

export type ReportWeekContext =
  | { status: "absent" }
  | { status: "invalid" }
  | { status: "valid"; startDate: string; endDate: string };

function parseCalendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

function parseSupportedDate(value: string): Date | null {
  const date = parseCalendarDate(value);
  if (!date || date.getUTCFullYear() < MIN_SUPPORTED_YEAR || date.getUTCFullYear() > MAX_SUPPORTED_YEAR) {
    return null;
  }
  return date;
}

export function readReportWeekContext(params: URLSearchParams): ReportWeekContext {
  if (!params.has("reportWeek")) return { status: "absent" };
  const values = params.getAll("reportWeek");
  if (values.length !== 1) return { status: "invalid" };

  const startDate = values[0];
  const start = parseSupportedDate(startDate);
  if (!start || start.getUTCDay() !== 6) return { status: "invalid" };

  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + 6);
  if (end.getUTCFullYear() > MAX_SUPPORTED_YEAR) return { status: "invalid" };

  return { status: "valid", startDate, endDate: end.toISOString().slice(0, 10) };
}

export function buildReportWeekHref(startDate: string): string | null {
  const parsed = parseSupportedDate(startDate);
  if (!parsed || parsed.getUTCDay() !== 6) return null;
  const end = new Date(parsed.getTime());
  end.setUTCDate(end.getUTCDate() + 6);
  if (end.getUTCFullYear() > MAX_SUPPORTED_YEAR) return null;
  return `/export?reportWeek=${startDate}#ai-report`;
}

export function isCompleteReportDateRange(startDate: string, endDate: string): boolean {
  const start = parseSupportedDate(startDate);
  const end = parseSupportedDate(endDate);
  return !!start && !!end && startDate <= endDate;
}

export type PlannerReportGuard = {
  loading: boolean;
  loadFailed: boolean;
  selectedWeekStart: string;
  loadedWeekStart: string | null;
  loadedWeekEnd: string | null;
  pendingWeek: boolean;
  saving: boolean;
  saveFailed: boolean;
  unsaved: boolean;
  editorOpen: boolean;
};

export function plannerReportBlockReason(state: PlannerReportGuard):
  "loading" | "save-failed" | "editor-open" | "unavailable" | null {
  if (state.loading || state.saving || state.pendingWeek || !state.loadedWeekStart ||
      state.selectedWeekStart !== state.loadedWeekStart) return "loading";
  if (state.loadFailed) return "unavailable";
  if (state.saveFailed || state.unsaved) return "save-failed";
  if (state.editorOpen) return "editor-open";
  const context = readReportWeekContext(new URLSearchParams({ reportWeek: state.loadedWeekStart }));
  if (context.status !== "valid" || context.endDate !== state.loadedWeekEnd) return "unavailable";
  return null;
}

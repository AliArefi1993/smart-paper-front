import type { ExportPayload, WeekDetail } from "./smart-paper-types";

export type AiReportInclude = {
  weeklyGoals: boolean;
  weeklyNotes: boolean;
  sectionActivity: boolean;
  dayNotes: boolean;
  scheduledEvents: boolean;
  financeGoal: boolean;
  incomeEntries: boolean;
  incomeNotes: boolean;
};

export type AiReportOptions = {
  startDate?: string;
  endDate?: string;
  include: AiReportInclude;
};

export type AiReportSummary = {
  weeks: number;
  days: number;
  incomeEntries: number;
  hasSelection: boolean;
};

const scopeLabels: Array<[keyof AiReportInclude, string]> = [
  ["weeklyGoals", "weekly goals"],
  ["weeklyNotes", "weekly notes"],
  ["sectionActivity", "daily section activity"],
  ["dayNotes", "day notes"],
  ["scheduledEvents", "scheduled events"],
  ["financeGoal", "current finance goal"],
  ["incomeEntries", "income entries"],
  ["incomeNotes", "income notes"],
];

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function validateRange(options: AiReportOptions): void {
  const { startDate, endDate } = options;
  if ((startDate === undefined) !== (endDate === undefined)) {
    throw new RangeError("Choose both a start date and an end date.");
  }
  if (startDate === undefined || endDate === undefined) return;
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
    throw new RangeError("Choose a valid date range in YYYY-MM-DD order.");
  }
}

function inRange(date: string, options: AiReportOptions): boolean {
  return (!options.startDate || date >= options.startDate) && (!options.endDate || date <= options.endDate);
}

function plannerSelected(include: AiReportInclude): boolean {
  return include.weeklyGoals || include.weeklyNotes || include.sectionActivity || include.dayNotes || include.scheduledEvents;
}

function daySelected(include: AiReportInclude): boolean {
  return include.sectionActivity || include.dayNotes || include.scheduledEvents;
}

function selectedWeeks(payload: ExportPayload, options: AiReportOptions): WeekDetail[] {
  if (!plannerSelected(options.include)) return [];
  return payload.weeks.filter((week) =>
    (!options.startDate || week.end_date >= options.startDate) &&
    (!options.endDate || week.start_date <= options.endDate),
  );
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function summarizeAiReport(payload: ExportPayload, options: AiReportOptions): AiReportSummary {
  validateRange(options);
  const { include } = options;
  const weeks = selectedWeeks(payload, options);
  return {
    weeks: weeks.length,
    days: daySelected(include)
      ? weeks.reduce((count, week) => count + week.days.filter((day) => inRange(day.date, options)).length, 0)
      : 0,
    incomeEntries: include.incomeEntries
      ? payload.finance.entries.filter((entry) => inRange(entry.received_on, options)).length
      : 0,
    hasSelection: scopeLabels.some(([key]) => include[key] && (key !== "incomeNotes" || include.incomeEntries)),
  };
}

export function formatAiReport(payload: ExportPayload, options: AiReportOptions): string {
  validateRange(options);
  const { include } = options;
  const selected = scopeLabels.filter(([key]) => include[key] && (key !== "incomeNotes" || include.incomeEntries));
  const lines = [
    "# Smart Paper data",
    "",
    `Date range: ${options.startDate ? `${options.startDate} to ${options.endDate} (inclusive)` : "all dates"}`,
    `Included: ${selected.length ? selected.map(([, label]) => label).join(", ") : "nothing selected"}`,
    "",
    "This is a selection of personal planner and finance records. Dates are calendar dates; durations are minutes. Empty items may be omitted.",
  ];

  if (include.financeGoal || include.incomeEntries) {
    lines.push("", "## Finance", "");
    if (include.financeGoal) {
      lines.push(`- Current finance goal amount: ${payload.finance.goal_amount}`);
    }
    if (include.incomeEntries) {
      const entries = payload.finance.entries.filter((entry) => inRange(entry.received_on, options));
      const incomeTotal = entries.reduce((sum, entry) => sum + entry.amount, 0);
      lines.push(`- Selected-period income total: ${incomeTotal}`, "", "### Income entries", "");
      if (entries.length === 0) lines.push("- No income entries in the selected dates.");
      for (const entry of entries) {
        lines.push(`- ${entry.received_on}: ${entry.amount}${include.incomeNotes && entry.note ? `; note: ${clean(entry.note)}` : ""}`);
      }
    }
  }

  const weeks = selectedWeeks(payload, options);
  if (weeks.length) lines.push("", "## Planner weeks", "");
  for (const week of weeks) {
    const weekLines: string[] = [];
    if (include.weeklyGoals && week.weekly_goal) weekLines.push(`- Weekly goal: ${clean(week.weekly_goal)}`);
    if (include.weeklyNotes && week.weekly_note) weekLines.push(`- Weekly note: ${clean(week.weekly_note)}`);
    const days = week.days.filter((day) => inRange(day.date, options));
    const sections = week.planner_sections.filter((section) => section.active).sort((a, b) => a.order - b.order);
    if (include.sectionActivity) {
      const total = days.reduce((sum, day) => sum + sections.reduce((sectionSum, section) =>
        sectionSum + (day.sections[section.id]?.duration_minutes ?? 0), 0), 0);
      weekLines.push(`- Selected-day total: ${total} min`);
    }
    for (const day of days) {
      const dayLines: string[] = [];
      if (include.dayNotes && day.day_note) dayLines.push(`  - Day note: ${clean(day.day_note)}`);
      if (include.scheduledEvents) {
        for (const event of day.schedule_entries) {
          const section = sections.find((item) => item.id === event.section_id);
          dayLines.push(`  - ${event.start_time}-${event.end_time}: ${clean(event.title)}${include.sectionActivity && section ? `; section: ${clean(section.label)}` : ""}${event.note ? `; note: ${clean(event.note)}` : ""}`);
        }
      }
      if (include.sectionActivity) {
        for (const section of sections) {
          const data = day.sections[section.id];
          if (!data || (!data.duration_minutes && !data.goal && !data.note)) continue;
          dayLines.push(`  - ${clean(section.label)}: ${data.duration_minutes} min${data.goal ? `; goal: ${clean(data.goal)}` : ""}${data.note ? `; note: ${clean(data.note)}` : ""}`);
        }
      }
      if (dayLines.length) weekLines.push(`- ${day.weekday_name} ${day.date}`, ...dayLines);
    }
    if (weekLines.length) lines.push(`### ${week.start_date} to ${week.end_date}`, "", ...weekLines, "");
  }

  return `${lines.join("\n").trim()}\n`;
}

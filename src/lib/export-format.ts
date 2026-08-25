import { activePlannerSections } from "@/lib/planner-sections";
import type { ExportPayload } from "@/lib/smart-paper-types";
import * as XLSX from "xlsx";

const CSV_COLUMNS = [
  "record_type",
  "week_start",
  "week_end",
  "date",
  "weekday",
  "section",
  "section_label",
  "start_time",
  "end_time",
  "title",
  "duration_minutes",
  "goal",
  "note",
  "finance_goal_amount",
  "income_id",
  "income_amount",
  "income_note",
  "income_date",
];

type CsvRow = Record<string, string | number | undefined>;

function csvCell(value: string | number | undefined): string {
  const text = value === undefined ? "" : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(row: CsvRow): string {
  return CSV_COLUMNS.map((column) => csvCell(row[column])).join(",");
}

export function formatExportCsv(payload: ExportPayload): string {
  const rows = [CSV_COLUMNS.join(",")];

  for (const week of payload.weeks) {
    rows.push(
      csvRow({
        record_type: "week",
        week_start: week.start_date,
        week_end: week.end_date,
        goal: week.weekly_goal,
        note: week.weekly_note,
      }),
    );

    const sections = activePlannerSections(week.planner_sections);
    for (const day of week.days) {
      for (const entry of day.schedule_entries) {
        const linkedSection = sections.find((section) => section.id === entry.section_id);
        rows.push(
          csvRow({
            record_type: "schedule_entry",
            week_start: week.start_date,
            week_end: week.end_date,
            date: day.date,
            weekday: day.weekday_name,
            section: entry.section_id ?? "",
            section_label: linkedSection?.label,
            start_time: entry.start_time,
            end_time: entry.end_time,
            title: entry.title,
            note: entry.note,
          }),
        );
      }
      for (const section of sections) {
        const sectionData = day.sections[section.id];
        if (!sectionData) continue;
        rows.push(
          csvRow({
            record_type: "day_section",
            week_start: week.start_date,
            week_end: week.end_date,
            date: day.date,
            weekday: day.weekday_name,
            section: section.id,
            section_label: section.label,
            duration_minutes: sectionData.duration_minutes,
            goal: sectionData.goal,
            note: sectionData.note,
          }),
        );
      }
    }
  }

  rows.push(
    csvRow({
      record_type: "finance_summary",
      finance_goal_amount: payload.finance.goal_amount,
      income_amount: payload.finance.total_income,
      note: `Remaining: ${payload.finance.remaining_amount}`,
    }),
  );

  for (const entry of payload.finance.entries) {
    rows.push(
      csvRow({
        record_type: "income",
        income_id: entry.id,
        income_amount: entry.amount,
        income_note: entry.note,
        income_date: entry.received_on,
      }),
    );
  }

  return `${rows.join("\n")}\n`;
}

export function formatExportMarkdown(payload: ExportPayload): string {
  const lines = [
    "# Smart Paper Export",
    "",
    `Exported at: ${payload.exported_at}`,
    "",
    "## AI Feedback Request",
    "",
    "Please review my planner and finance data. Look for patterns, risks, missing follow-through, and practical next actions. Ask clarifying questions if needed.",
    "",
    "## Finance",
    "",
    `- Goal amount: ${payload.finance.goal_amount}`,
    `- Total income: ${payload.finance.total_income}`,
    `- Remaining amount: ${payload.finance.remaining_amount}`,
    `- Progress percent: ${payload.finance.progress_percent}`,
    "",
    "### Income Entries",
    "",
  ];

  if (payload.finance.entries.length > 0) {
    for (const entry of payload.finance.entries) {
      lines.push(`- ${entry.received_on}: ${entry.amount} (${entry.note || "No note"})`);
    }
  } else {
    lines.push("- No income entries.");
  }

  lines.push("", "## Planner Weeks", "");

  for (const week of payload.weeks) {
    lines.push(
      `### ${week.start_date} to ${week.end_date}`,
      "",
      `- Weekly goal: ${week.weekly_goal || "No weekly goal"}`,
      `- Weekly note: ${week.weekly_note || "No weekly note"}`,
      `- Total minutes: ${week.totals.week_total_minutes}`,
      "",
    );

    const sections = activePlannerSections(week.planner_sections);
    for (const day of week.days) {
      const dayLines: string[] = [];
      for (const entry of day.schedule_entries) {
        const linkedSection = sections.find((section) => section.id === entry.section_id);
        dayLines.push(
          `  - Schedule ${entry.start_time}-${entry.end_time}: ${entry.title}${
            linkedSection ? `; section: ${linkedSection.label}` : ""
          }${entry.note ? `; note: ${entry.note}` : ""}`,
        );
      }
      for (const section of sections) {
        const sectionData = day.sections[section.id];
        if (!sectionData) continue;
        if (
          sectionData.duration_minutes === 0 &&
          !sectionData.goal &&
          !sectionData.note
        ) {
          continue;
        }
        dayLines.push(
          `  - ${section.label}: ${sectionData.duration_minutes} min; goal: ${
            sectionData.goal || "none"
          }; note: ${sectionData.note || "none"}`,
        );
      }
      if (dayLines.length === 0) continue;
      lines.push(`- ${day.weekday_name} ${day.date}`, ...dayLines);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

export function formatExportXlsx(payload: ExportPayload): ArrayBuffer {
  const workbook = XLSX.utils.book_new();

  const overviewRows: Array<Array<string | number>> = [
    ["Metric", "Value"],
    ["Exported at", payload.exported_at],
    ["Weeks", payload.weeks.length],
    ["Finance goal", payload.finance.goal_amount],
    ["Total income", payload.finance.total_income],
    ["Remaining", payload.finance.remaining_amount],
    ["Progress percent", payload.finance.progress_percent],
  ];

  const weekRows: Array<Array<string | number>> = [
    [
      "Week start",
      "Week end",
      "Weekly goal",
      "Weekly note",
      "Section",
      "Section minutes",
      "Total minutes",
    ],
  ];
  const dayRows: Array<Array<string | number>> = [
    [
      "Week start",
      "Date",
      "Weekday",
      "Section",
      "Duration minutes",
      "Goal",
      "Note",
    ],
  ];
  const scheduleRows: Array<Array<string | number>> = [
    [
      "Week start",
      "Date",
      "Weekday",
      "Start time",
      "End time",
      "Title",
      "Section",
      "Note",
    ],
  ];

  for (const week of payload.weeks) {
    const sections = activePlannerSections(week.planner_sections);
    for (const section of sections) {
      weekRows.push([
        week.start_date,
        week.end_date,
        week.weekly_goal,
        week.weekly_note,
        section.label,
        week.totals.by_section_minutes[section.id] ?? 0,
        week.totals.week_total_minutes,
      ]);
    }

    for (const day of week.days) {
      for (const entry of day.schedule_entries) {
        const linkedSection = sections.find((section) => section.id === entry.section_id);
        scheduleRows.push([
          week.start_date,
          day.date,
          day.weekday_name,
          entry.start_time,
          entry.end_time,
          entry.title,
          linkedSection?.label ?? entry.section_id ?? "",
          entry.note,
        ]);
      }
      for (const section of sections) {
        const sectionData = day.sections[section.id];
        if (!sectionData) continue;
        dayRows.push([
          week.start_date,
          day.date,
          day.weekday_name,
          section.label,
          sectionData.duration_minutes,
          sectionData.goal,
          sectionData.note,
        ]);
      }
    }
  }

  const incomeRows: Array<Array<string | number>> = [
    ["Date", "Amount", "Note", "Entry ID"],
  ];
  for (const entry of payload.finance.entries) {
    incomeRows.push([entry.received_on, entry.amount, entry.note, entry.id]);
  }

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(overviewRows),
    "Overview",
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(weekRows), "Weeks");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(dayRows),
    "Day Sections",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(scheduleRows),
    "Schedule",
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(incomeRows), "Income");

  return XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

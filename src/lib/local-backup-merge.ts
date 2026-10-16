import type {
  DayData,
  IncomeEntry,
  MergeConflictCategory,
  MergeConflicts,
  PlannerSection,
  ScheduleEntry,
  WeekDetail,
  WeekTemplate,
} from "@/lib/smart-paper-types";
import {
  SECTION_IDS,
  calculateSectionTotals,
  normalizeSectionsRecord,
} from "@/lib/planner-sections";

export function createMergeConflicts(): MergeConflicts {
  return { categories: [], planner_dates: [] };
}

export function recordMergeConflict(
  conflicts: MergeConflicts,
  category: MergeConflictCategory,
  date?: string,
): void {
  if (!conflicts.categories.includes(category)) conflicts.categories.push(category);
  if (date && !conflicts.planner_dates.includes(date)) {
    conflicts.planner_dates.push(date);
    conflicts.planner_dates.sort();
  }
}

function mergeText(
  saved: string,
  incoming: string,
  conflicts: MergeConflicts,
  date: string,
): string {
  if (!incoming.trim()) return saved;
  if (!saved.trim()) return incoming;
  if (saved !== incoming) recordMergeConflict(conflicts, "planner", date);
  return saved;
}

function mergeDuration(
  saved: number,
  incoming: number,
  conflicts: MergeConflicts,
  date: string,
): number {
  if (incoming === 0) return saved;
  if (saved === 0) return incoming;
  if (saved !== incoming) recordMergeConflict(conflicts, "planner", date);
  return saved;
}

function scheduleContent(entry: Omit<ScheduleEntry, "id" | "order">): string {
  return JSON.stringify([
    entry.start_time,
    entry.end_time,
    entry.title,
    entry.note ?? "",
    entry.section_id ?? null,
  ]);
}

function mergeSchedule(
  saved: ScheduleEntry[],
  incoming: ScheduleEntry[],
  conflicts: MergeConflicts,
  date: string,
): ScheduleEntry[] {
  const result = [...saved];
  const byId = new Map(saved.map((entry) => [entry.id, entry]));
  const contents = new Set(saved.map(scheduleContent));
  for (const entry of incoming) {
    const existing = byId.get(entry.id);
    const content = scheduleContent(entry);
    if (existing) {
      if (scheduleContent(existing) !== content) {
        recordMergeConflict(conflicts, "schedule", date);
      }
    } else if (!contents.has(content)) {
      result.push(entry);
      byId.set(entry.id, entry);
      contents.add(content);
    }
  }
  return result;
}

function mergeDay(
  saved: DayData,
  incoming: DayData,
  conflicts: MergeConflicts,
): DayData {
  const savedSections = normalizeSectionsRecord(saved.sections);
  const incomingSections = normalizeSectionsRecord(incoming.sections);
  const sections = normalizeSectionsRecord(saved.sections);
  for (const id of SECTION_IDS) {
    const current = savedSections[id];
    const backup = incomingSections[id];
    sections[id] = {
      goal: mergeText(current.goal, backup.goal, conflicts, saved.date),
      note: mergeText(current.note, backup.note, conflicts, saved.date),
      duration_minutes: mergeDuration(current.duration_minutes, backup.duration_minutes, conflicts, saved.date),
    };
  }
  return {
    ...saved,
    day_note: mergeText(saved.day_note ?? "", incoming.day_note ?? "", conflicts, saved.date),
    sections,
    schedule_entries: mergeSchedule(saved.schedule_entries ?? [], incoming.schedule_entries ?? [], conflicts, saved.date),
  };
}

export function mergePlannerWeek(
  saved: WeekDetail,
  incoming: WeekDetail,
  sections: PlannerSection[],
  conflicts: MergeConflicts,
): WeekDetail {
  const daysByDate = new Map(saved.days.map((day) => [day.date, day]));
  for (const day of incoming.days) {
    const current = daysByDate.get(day.date);
    daysByDate.set(day.date, current ? mergeDay(current, day, conflicts) : {
      ...day,
      day_note: day.day_note ?? "",
      sections: normalizeSectionsRecord(day.sections),
      schedule_entries: day.schedule_entries ?? [],
    });
  }
  const days = [...daysByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    ...saved,
    weekly_goal: mergeText(saved.weekly_goal ?? "", incoming.weekly_goal ?? "", conflicts, saved.start_date),
    weekly_note: mergeText(saved.weekly_note ?? "", incoming.weekly_note ?? "", conflicts, saved.start_date),
    planner_sections: sections,
    days,
    totals: calculateSectionTotals(days, sections.filter((section) => section.active).map((section) => section.id)),
  };
}

function templateContent(template: WeekTemplate): string {
  const days = (template.days ?? []).map((day) => {
    const sections = normalizeSectionsRecord(day.sections);
    return JSON.stringify([
      day.weekday_index,
      day.day_note ?? "",
      SECTION_IDS.map((id) => [id, sections[id].goal, sections[id].note, sections[id].duration_minutes]),
      (day.schedule_entries ?? []).map(scheduleContent).sort(),
    ]);
  }).sort();
  return JSON.stringify([template.name, template.weekly_goal, template.weekly_note, days]);
}

export function sameTemplateContent(saved: WeekTemplate, incoming: WeekTemplate): boolean {
  return templateContent(saved) === templateContent(incoming);
}

function incomeContent(entry: IncomeEntry): string {
  return JSON.stringify([entry.amount, entry.received_on, entry.note ?? ""]);
}

function hasIncomeId(entry: IncomeEntry): boolean {
  return Number.isInteger(entry.id) && entry.id > 0;
}

export function mergeIncomeEntries(
  saved: IncomeEntry[],
  incoming: IncomeEntry[],
  conflicts: MergeConflicts,
): IncomeEntry[] {
  const result = [...saved];
  const byId = new Map(saved.map((entry) => [entry.id, entry]));
  // Reserve incoming identities before assigning IDs to compatible legacy records.
  const reserved = new Set([...saved, ...incoming].filter(hasIncomeId).map((entry) => entry.id));
  for (const entry of incoming.filter(hasIncomeId)) {
    const existing = byId.get(entry.id);
    if (existing) {
      if (incomeContent(existing) !== incomeContent(entry)) recordMergeConflict(conflicts, "income");
    } else {
      const added = { ...entry, note: entry.note ?? "" };
      result.push(added);
      byId.set(entry.id, added);
    }
  }

  const existingCounts = new Map<string, number>();
  for (const entry of result) {
    const content = incomeContent(entry);
    existingCounts.set(content, (existingCounts.get(content) ?? 0) + 1);
  }
  const incomingCounts = new Map<string, number>();
  // The clock supplies an identity only; it never decides which content wins.
  let nextId = Math.max(1, Date.now());
  for (const entry of incoming.filter((candidate) => !hasIncomeId(candidate))) {
    const content = incomeContent(entry);
    const occurrence = (incomingCounts.get(content) ?? 0) + 1;
    incomingCounts.set(content, occurrence);
    if (occurrence <= (existingCounts.get(content) ?? 0)) continue;
    while (reserved.has(nextId)) nextId += 1;
    const added = { ...entry, id: nextId, note: entry.note ?? "" };
    reserved.add(nextId);
    nextId += 1;
    result.push(added);
  }
  return result;
}

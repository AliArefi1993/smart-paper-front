type StorageWriter = Pick<Storage, "getItem" | "setItem" | "removeItem">;
import { validateIdeaNotes } from "./idea-notes.ts";

export function parseStoredJson<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Saved Smart Paper data is damaged. Restore from a JSON backup before changing data.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day;
}

function isSectionData(value: unknown): boolean {
  return isRecord(value) &&
    Number.isInteger(value.duration_minutes) &&
    (value.duration_minutes as number) >= 0 &&
    typeof value.goal === "string" &&
    typeof value.note === "string";
}

function isSectionId(value: string): boolean {
  return /^slot_(?:[1-9]|10)$/.test(value) ||
    ["main", "second", "learning", "exercise"].includes(value);
}

function isScheduleTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isScheduleEntry(value: unknown): boolean {
  return isRecord(value) && typeof value.title === "string" && !!value.title.trim() &&
    isScheduleTime(value.start_time) && isScheduleTime(value.end_time) &&
    value.start_time < value.end_time;
}

export function validateLocalBackup(payload: unknown): void {
  if (!isRecord(payload) || !Array.isArray(payload.weeks) || !isRecord(payload.finance)) {
    throw new Error("Import file must be a Smart Paper JSON backup.");
  }
  if (
    payload.schema_version !== undefined &&
    (!Number.isInteger(payload.schema_version) ||
      (payload.schema_version as number) < 1 ||
      (payload.schema_version as number) > 5)
  ) {
    throw new Error("This backup version is not supported by this app.");
  }
  if (payload.idea_notes !== undefined) validateIdeaNotes(payload.idea_notes);

  const starts = new Set<string>();
  for (const week of payload.weeks) {
    if (!isRecord(week) || !isIsoDate(week.start_date) || !Array.isArray(week.days) || week.days.length !== 7) {
      throw new Error("The backup contains an invalid planner week.");
    }
    if (starts.has(week.start_date)) {
      throw new Error("The backup contains a duplicate planner week.");
    }
    starts.add(week.start_date);
    const dates = new Set<string>();
    for (const [index, day] of week.days.entries()) {
      if (!isRecord(day) || !isIsoDate(day.date) || !isRecord(day.sections)) {
        throw new Error("The backup contains an invalid planner day.");
      }
      const expectedDate = new Date(`${week.start_date}T12:00:00Z`);
      expectedDate.setUTCDate(expectedDate.getUTCDate() + index);
      if (day.date !== expectedDate.toISOString().slice(0, 10)) {
        throw new Error("The backup contains a day outside its planner week.");
      }
      if (dates.has(day.date)) {
        throw new Error("The backup contains a duplicate planner day.");
      }
      dates.add(day.date);
      if (Object.keys(day.sections).length === 0 ||
          !Object.entries(day.sections).every(([id, section]) => isSectionId(id) && isSectionData(section))) {
        throw new Error("The backup contains invalid planner section data.");
      }
      if (day.schedule_entries !== undefined && !Array.isArray(day.schedule_entries)) {
        throw new Error("The backup contains invalid scheduled events.");
      }
      for (const event of day.schedule_entries ?? []) {
        if (!isScheduleEntry(event)) {
          throw new Error("The backup contains an invalid scheduled event.");
        }
      }
    }
  }

  if (payload.planner_sections !== undefined && !Array.isArray(payload.planner_sections)) {
    throw new Error("The backup contains invalid planner sections.");
  }
  for (const section of payload.planner_sections ?? []) {
    const id = isRecord(section) ? section.id ?? section.slot_id : undefined;
    if (!isRecord(section) || typeof id !== "string" || !isSectionId(id) ||
        typeof section.label !== "string" || typeof section.active !== "boolean") {
      throw new Error("The backup contains an invalid planner section.");
    }
  }
  if (payload.week_templates !== undefined && !Array.isArray(payload.week_templates)) {
    throw new Error("The backup contains invalid week templates.");
  }
  for (const template of payload.week_templates ?? []) {
    if (!isRecord(template) || !Number.isInteger(template.id) ||
        typeof template.name !== "string" || !template.name.trim() ||
        typeof template.weekly_goal !== "string" || typeof template.weekly_note !== "string" ||
        (template.days !== undefined && !Array.isArray(template.days))) {
      throw new Error("The backup contains an invalid week template.");
    }
    for (const day of template.days ?? []) {
      if (!isRecord(day) || !Number.isInteger(day.weekday_index) ||
          (day.weekday_index as number) < 0 || (day.weekday_index as number) > 6 ||
          !isRecord(day.sections) ||
          !Object.entries(day.sections).every(([id, section]) => isSectionId(id) && isSectionData(section)) ||
          (day.schedule_entries !== undefined &&
            (!Array.isArray(day.schedule_entries) || !day.schedule_entries.every(isScheduleEntry)))) {
        throw new Error("The backup contains an invalid week template day.");
      }
    }
  }
  if (!Array.isArray(payload.finance.entries) ||
      typeof payload.finance.goal_amount !== "number" ||
      !Number.isInteger(payload.finance.goal_amount) ||
      payload.finance.goal_amount < 0) {
    throw new Error("The backup contains invalid finance data.");
  }
  for (const entry of payload.finance.entries) {
    if (!isRecord(entry) || !Number.isInteger(entry.amount) || (entry.amount as number) <= 0 || !isIsoDate(entry.received_on)) {
      throw new Error("The backup contains an invalid income entry.");
    }
  }
}

export function commitStorageChanges(
  storage: StorageWriter,
  changes: Record<string, string>,
): void {
  const previous = new Map(
    Object.keys(changes).map((key) => [key, storage.getItem(key)]),
  );
  const written: string[] = [];
  try {
    for (const [key, value] of Object.entries(changes)) {
      storage.setItem(key, value);
      written.push(key);
    }
  } catch (error) {
    try {
      for (const key of written.reverse()) {
        const value = previous.get(key);
        if (value === null || value === undefined) storage.removeItem(key);
        else storage.setItem(key, value);
      }
    } catch {
      throw new Error("Import failed and saved data could not be fully restored. Keep your backup file.");
    }
    throw error;
  }
}

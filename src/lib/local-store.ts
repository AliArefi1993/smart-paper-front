import type {
  DayData,
  ExportPayload,
  FinancePayload,
  ImportMode,
  ImportResult,
  IncomeEntry,
  SectionName,
  WeekDetail,
  WeekListPayload,
  WeekSummary,
  WeekSummariesResponse,
  WeekTotals,
} from "@/lib/smart-paper-types";
import {
  SECTION_IDS,
  calculateSectionTotals,
  emptySectionData,
  normalizePlannerSections,
  normalizeWeekDetail,
} from "@/lib/planner-sections";

const WEEKDAY_NAMES = [
  "Saturday",
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
];
const WEEKS_KEY = "smart-paper.local.weeks";
const PLANNER_SECTIONS_KEY = "smart-paper.local.planner-sections";
const FINANCE_KEY = "smart-paper.local.finance";
const FINANCE_UNLOCK_KEY = "smart-paper.local.finance-unlocked-until";
const FINANCE_UNLOCK_TTL_SECONDS = 3600;

type StoredWeeks = Record<string, WeekDetail>;
type StoredFinance = {
  goal_amount: number;
  entries: IncomeEntry[];
};

function requireBrowserStorage(): Storage {
  if (typeof window === "undefined") {
    throw new Error("Local storage is only available in the browser.");
  }
  return window.localStorage;
}

function todayIso(): string {
  return formatIsoDate(new Date());
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getSaturdayStart(date: Date): Date {
  const next = new Date(date);
  const daysSinceSaturday = (next.getDay() + 1) % 7;
  next.setDate(next.getDate() - daysSinceSaturday);
  next.setHours(0, 0, 0, 0);
  return next;
}

function readJson<T>(key: string, fallback: T): T {
  const raw = requireBrowserStorage().getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  requireBrowserStorage().setItem(key, JSON.stringify(value));
}

function createWeek(startDate: string): WeekDetail {
  const start = parseIsoDate(startDate);
  const days: DayData[] = WEEKDAY_NAMES.map((weekdayName, index) => {
    const date = formatIsoDate(addDays(start, index));
    return {
      date,
      weekday_index: index,
      weekday_name: weekdayName,
      sections: Object.fromEntries(
        SECTION_IDS.map((sectionId) => [sectionId, emptySectionData()]),
      ) as Record<SectionName, ReturnType<typeof emptySectionData>>,
      schedule_entries: [],
    };
  });
  const endDate = formatIsoDate(addDays(start, 6));
  return {
    start_date: startDate,
    end_date: endDate,
    label: `${startDate} to ${endDate}`,
    weekly_goal: "",
    weekly_note: "",
    planner_sections: getStoredPlannerSections(),
    days,
    totals: calculateTotals(days),
  };
}

function getStoredWeeks(): StoredWeeks {
  const weeks = readJson<StoredWeeks>(WEEKS_KEY, {});
  let changed = false;
  const normalized = Object.fromEntries(
    Object.entries(weeks).map(([startDate, week]) => {
      const nextWeek = normalizeWeekDetail({
        ...week,
        planner_sections: week.planner_sections ?? getStoredPlannerSections(),
      });
      if (JSON.stringify(nextWeek) !== JSON.stringify(week)) changed = true;
      return [startDate, nextWeek];
    }),
  ) as StoredWeeks;
  if (changed) writeJson(WEEKS_KEY, normalized);
  return normalized;
}

function saveStoredWeek(week: WeekDetail): WeekDetail {
  const weeks = getStoredWeeks();
  const normalized = normalizeWeekDetail({
    ...week,
    planner_sections: getStoredPlannerSections(),
  });
  writeJson(WEEKS_KEY, {
    ...weeks,
    [week.start_date]: normalized,
  });
  return normalized;
}

function clearStoredData(): void {
  const storage = requireBrowserStorage();
  storage.removeItem(WEEKS_KEY);
  storage.removeItem(PLANNER_SECTIONS_KEY);
  storage.removeItem(FINANCE_KEY);
}

function getOrCreateWeek(startDate: string): WeekDetail {
  const weeks = getStoredWeeks();
  return weeks[startDate] ?? createWeek(startDate);
}

function getWeekStartDates(span: number): string[] {
  const current = getSaturdayStart(new Date());
  const dates: string[] = [];
  for (let offset = -span; offset <= span; offset += 1) {
    dates.push(formatIsoDate(addDays(current, offset * 7)));
  }
  return dates;
}

export async function getLocalWeeks(span = 8): Promise<WeekListPayload> {
  const currentWeekStart = formatIsoDate(getSaturdayStart(new Date()));
  const weeks = getWeekStartDates(span).map((startDate) => {
    const endDate = formatIsoDate(addDays(parseIsoDate(startDate), 6));
    return {
      start_date: startDate,
      end_date: endDate,
      label: `${startDate} to ${endDate}`,
      is_current: startDate === currentWeekStart,
    };
  });
  return {
    current_week_start: currentWeekStart,
    weeks,
  };
}

export async function getLocalWeek(startDate: string): Promise<WeekDetail> {
  return normalizeWeekDetail(getOrCreateWeek(startDate));
}

export async function saveLocalWeek(
  week: Pick<WeekDetail, "start_date" | "weekly_goal" | "weekly_note"> & {
    days: DayData[];
  },
): Promise<WeekDetail> {
  const existing = getOrCreateWeek(week.start_date);
  return saveStoredWeek({
    ...existing,
    weekly_goal: week.weekly_goal,
    weekly_note: week.weekly_note,
    days: week.days,
  });
}

export async function getLocalWeekSummaries(
  span = 8,
): Promise<WeekSummariesResponse> {
  const currentWeekStart = formatIsoDate(getSaturdayStart(new Date()));
  const summaries = getWeekStartDates(span).map((startDate) => {
    const week = getOrCreateWeek(startDate);
    return {
      start_date: week.start_date,
      end_date: week.end_date,
      weekly_goal: week.weekly_goal,
      weekly_note: week.weekly_note,
      planner_sections: getStoredPlannerSections(),
      totals: week.totals,
      notes_by_section: collectNotesBySection(week.days),
      details_by_section: collectDetailsBySection(week.days),
      is_current: week.start_date === currentWeekStart,
    };
  });
  return { summaries };
}

function collectNotesBySection(days: DayData[]): Record<SectionName, string[]> {
  const notes = SECTION_IDS.reduce(
    (acc, section) => ({
      ...acc,
      [section]: [],
    }),
    {} as Record<SectionName, string[]>,
  );

  for (const day of days) {
    for (const section of SECTION_IDS) {
      const note = day.sections[section].note.trim();
      if (note) notes[section].push(note);
    }
  }
  return notes;
}

function collectDetailsBySection(days: DayData[]): WeekSummary["details_by_section"] {
  const details = SECTION_IDS.reduce(
    (acc, section) => ({
      ...acc,
      [section]: [],
    }),
    {} as NonNullable<WeekSummary["details_by_section"]>,
  );

  for (const day of days) {
    for (const section of SECTION_IDS) {
      const sectionData = day.sections[section];
      if (
        sectionData.duration_minutes === 0 &&
        !sectionData.goal.trim() &&
        !sectionData.note.trim()
      ) {
        continue;
      }
      details[section].push({
        date: day.date,
        weekday_name: day.weekday_name,
        duration_minutes: sectionData.duration_minutes,
        goal: sectionData.goal.trim(),
        note: sectionData.note.trim(),
      });
    }
  }

  return details;
}

function calculateTotals(days: DayData[]): WeekTotals {
  return calculateSectionTotals(
    days,
    getStoredPlannerSections()
      .filter((section) => section.active)
      .map((section) => section.id),
  );
}

function getStoredPlannerSections() {
  const sections = normalizePlannerSections(readJson(PLANNER_SECTIONS_KEY, null));
  writeJson(PLANNER_SECTIONS_KEY, sections);
  return sections;
}

export async function getLocalPlannerSections() {
  return getStoredPlannerSections();
}

export async function saveLocalPlannerSections(sections: unknown) {
  const normalized = normalizePlannerSections(sections);
  writeJson(PLANNER_SECTIONS_KEY, normalized);

  const weeks = getStoredWeeks();
  const nextWeeks = Object.fromEntries(
    Object.entries(weeks).map(([startDate, week]) => [
      startDate,
      {
        ...week,
        planner_sections: normalized,
        totals: calculateSectionTotals(
          week.days,
          normalized.filter((section) => section.active).map((section) => section.id),
        ),
      },
    ]),
  ) as StoredWeeks;
  writeJson(WEEKS_KEY, nextWeeks);

  return normalized;
}

function getStoredFinance(): StoredFinance {
  return readJson<StoredFinance>(FINANCE_KEY, {
    goal_amount: 0,
    entries: [],
  });
}

function writeStoredFinance(finance: StoredFinance): FinancePayload {
  writeJson(FINANCE_KEY, finance);
  return formatFinance(finance);
}

function formatFinance(finance: StoredFinance): FinancePayload {
  const entries = [...finance.entries].sort((a, b) => b.id - a.id);
  const totalIncome = entries.reduce((total, entry) => total + entry.amount, 0);
  const goalAmount = finance.goal_amount;
  const remainingAmount = Math.max(0, goalAmount - totalIncome);
  const progressPercent = goalAmount > 0 ? (totalIncome / goalAmount) * 100 : 0;
  return {
    goal_amount: goalAmount,
    total_income: totalIncome,
    remaining_amount: remainingAmount,
    progress_percent: progressPercent,
    unlock_ttl_seconds: FINANCE_UNLOCK_TTL_SECONDS,
    entries,
  };
}

function getFinancePin(): string {
  return process.env.NEXT_PUBLIC_FINANCE_PIN ?? "1234";
}

function forbiddenResponse(): Response {
  return new Response(null, { status: 403 });
}

function isFinanceUnlocked(): boolean {
  const raw = requireBrowserStorage().getItem(FINANCE_UNLOCK_KEY);
  const unlockedUntil = raw ? Number(raw) : 0;
  return Number.isFinite(unlockedUntil) && unlockedUntil > Date.now();
}

function assertFinanceUnlocked(): void {
  if (!isFinanceUnlocked()) {
    throw forbiddenResponse();
  }
}

export async function checkLocalFinanceSession(): Promise<Response> {
  return isFinanceUnlocked() ? new Response(null, { status: 200 }) : forbiddenResponse();
}

export async function unlockLocalFinanceSession(pin: string): Promise<void> {
  if (pin !== getFinancePin()) {
    throw forbiddenResponse();
  }
  requireBrowserStorage().setItem(
    FINANCE_UNLOCK_KEY,
    String(Date.now() + FINANCE_UNLOCK_TTL_SECONDS * 1000),
  );
}

export async function getLocalFinance(): Promise<FinancePayload> {
  assertFinanceUnlocked();
  return formatFinance(getStoredFinance());
}

export async function saveLocalFinanceGoal(goalAmount: number): Promise<FinancePayload> {
  assertFinanceUnlocked();
  const finance = getStoredFinance();
  return writeStoredFinance({
    ...finance,
    goal_amount: goalAmount,
  });
}

export async function addLocalIncome(
  amount: number,
  note: string,
): Promise<FinancePayload> {
  assertFinanceUnlocked();
  const finance = getStoredFinance();
  return writeStoredFinance({
    ...finance,
    entries: [
      ...finance.entries,
      {
        id: Date.now(),
        amount,
        note,
        received_on: todayIso(),
      },
    ],
  });
}

export async function deleteLocalIncome(entryId: number): Promise<FinancePayload> {
  assertFinanceUnlocked();
  const finance = getStoredFinance();
  return writeStoredFinance({
    ...finance,
    entries: finance.entries.filter((entry) => entry.id !== entryId),
  });
}

export async function editLocalIncome(
  entryId: number,
  amount: number,
  note: string,
  date: string,
): Promise<FinancePayload> {
  assertFinanceUnlocked();
  const finance = getStoredFinance();
  return writeStoredFinance({
    ...finance,
    entries: finance.entries.map((entry) =>
      entry.id === entryId
        ? {
            ...entry,
            amount,
            note,
            received_on: date,
          }
        : entry,
    ),
  });
}

export async function getLocalExportPayload(): Promise<ExportPayload> {
  assertFinanceUnlocked();
  const plannerSections = getStoredPlannerSections();
  const weeks = Object.values(getStoredWeeks()).sort((a, b) =>
    a.start_date < b.start_date ? -1 : 1,
  );
  return {
    schema_version: 3,
    exported_at: new Date().toISOString(),
    planner_sections: plannerSections,
    weeks,
    finance: formatFinance(getStoredFinance()),
  };
}

export async function importLocalExportPayload(
  payload: ExportPayload,
  mode: ImportMode,
): Promise<ImportResult> {
  assertFinanceUnlocked();
  if (!Array.isArray(payload.weeks) || !payload.finance) {
    throw new Error("Import file must be a Smart Paper JSON backup.");
  }

  if (mode === "replace") {
    clearStoredData();
  }

  if (Array.isArray(payload.planner_sections)) {
    await saveLocalPlannerSections(payload.planner_sections);
  }

  let weeksImported = 0;
  for (const importedWeek of payload.weeks) {
    if (!importedWeek?.start_date || !Array.isArray(importedWeek.days)) {
      continue;
    }
    const existing = getOrCreateWeek(importedWeek.start_date);
    saveStoredWeek({
      ...existing,
      ...importedWeek,
      totals: calculateTotals(importedWeek.days),
    });
    weeksImported += 1;
  }

  const currentFinance = getStoredFinance();
  const importedEntries = Array.isArray(payload.finance.entries)
    ? payload.finance.entries
    : [];
  const entriesById = new Map<number, IncomeEntry>();
  for (const entry of currentFinance.entries) {
    entriesById.set(entry.id, entry);
  }
  importedEntries.forEach((entry, index) => {
    if (!entry || entry.amount <= 0 || !entry.received_on) {
      return;
    }
    const id =
      Number.isInteger(entry.id) && entry.id > 0 ? entry.id : Date.now() + index;
    entriesById.set(id, {
      id,
      amount: entry.amount,
      note: entry.note ?? "",
      received_on: entry.received_on,
    });
  });

  const financeGoalUpdated = Number.isInteger(payload.finance.goal_amount);
  writeStoredFinance({
    goal_amount: financeGoalUpdated
      ? payload.finance.goal_amount
      : currentFinance.goal_amount,
    entries: [...entriesById.values()],
  });

  return {
    mode,
    weeks_imported: weeksImported,
    income_entries_imported: importedEntries.length,
    finance_goal_updated: financeGoalUpdated,
    payload: await getLocalExportPayload(),
  };
}

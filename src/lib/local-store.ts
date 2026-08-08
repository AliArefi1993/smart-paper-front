import type {
  DayData,
  FinancePayload,
  IncomeEntry,
  SectionName,
  WeekDetail,
  WeekListPayload,
  WeekSummariesResponse,
  WeekTotals,
} from "@/lib/smart-paper-types";

const SECTIONS: SectionName[] = ["main", "second", "learning", "exercise"];
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

function emptySection() {
  return {
    duration_minutes: 0,
    goal: "",
    note: "",
  };
}

function createWeek(startDate: string): WeekDetail {
  const start = parseIsoDate(startDate);
  const days: DayData[] = WEEKDAY_NAMES.map((weekdayName, index) => {
    const date = formatIsoDate(addDays(start, index));
    return {
      date,
      weekday_index: index,
      weekday_name: weekdayName,
      sections: {
        main: emptySection(),
        second: emptySection(),
        learning: emptySection(),
        exercise: emptySection(),
      },
    };
  });
  const endDate = formatIsoDate(addDays(start, 6));
  return {
    start_date: startDate,
    end_date: endDate,
    label: `${startDate} to ${endDate}`,
    weekly_goal: "",
    weekly_note: "",
    days,
    totals: calculateTotals(days),
  };
}

function getStoredWeeks(): StoredWeeks {
  return readJson<StoredWeeks>(WEEKS_KEY, {});
}

function saveStoredWeek(week: WeekDetail): WeekDetail {
  const weeks = getStoredWeeks();
  const normalized = {
    ...week,
    totals: calculateTotals(week.days),
  };
  writeJson(WEEKS_KEY, {
    ...weeks,
    [week.start_date]: normalized,
  });
  return normalized;
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
  return getOrCreateWeek(startDate);
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
      totals: week.totals,
      notes_by_section: collectNotesBySection(week.days),
      is_current: week.start_date === currentWeekStart,
    };
  });
  return { summaries };
}

function collectNotesBySection(days: DayData[]): Record<SectionName, string[]> {
  const notes = {
    main: [],
    second: [],
    learning: [],
    exercise: [],
  } as Record<SectionName, string[]>;

  for (const day of days) {
    for (const section of SECTIONS) {
      const note = day.sections[section].note.trim();
      if (note) notes[section].push(note);
    }
  }
  return notes;
}

function calculateTotals(days: DayData[]): WeekTotals {
  const bySection = {
    main: 0,
    second: 0,
    learning: 0,
    exercise: 0,
  };

  for (const day of days) {
    for (const section of SECTIONS) {
      bySection[section] += day.sections[section].duration_minutes;
    }
  }

  return {
    by_section_minutes: bySection,
    week_total_minutes: Object.values(bySection).reduce((total, value) => total + value, 0),
  };
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

export type SectionName = "main" | "second" | "learning" | "exercise";

export type SectionData = {
  duration_minutes: number;
  goal: string;
  note: string;
};

export type DayData = {
  date: string;
  weekday_index: number;
  weekday_name: string;
  sections: Record<SectionName, SectionData>;
};

export type WeekTotals = {
  by_section_minutes: Record<SectionName, number>;
  week_total_minutes: number;
};

export type WeekDetail = {
  start_date: string;
  end_date: string;
  label: string;
  weekly_goal: string;
  weekly_note: string;
  days: DayData[];
  totals: WeekTotals;
};

export type WeekItem = {
  start_date: string;
  end_date: string;
  label: string;
  is_current: boolean;
};

export type WeekListPayload = {
  current_week_start: string;
  weeks: WeekItem[];
};

export type WeekSummary = {
  start_date: string;
  end_date: string;
  weekly_goal: string;
  weekly_note: string;
  totals: WeekTotals;
  notes_by_section: Record<SectionName, string[]>;
  details_by_section?: Record<
    SectionName,
    {
      date: string;
      weekday_name: string;
      duration_minutes: number;
      goal: string;
      note: string;
    }[]
  >;
  is_current: boolean;
};

export type WeekSummariesResponse = {
  summaries?: WeekSummary[];
};

export type IncomeEntry = {
  id: number;
  amount: number;
  note: string;
  received_on: string;
};

export type FinancePayload = {
  goal_amount: number;
  total_income: number;
  remaining_amount: number;
  progress_percent: number;
  unlock_ttl_seconds?: number;
  entries: IncomeEntry[];
};

export type ExportPayload = {
  exported_at: string;
  weeks: WeekDetail[];
  finance: FinancePayload;
};

export type ImportMode = "merge" | "replace";

export type ImportResult = {
  mode: ImportMode;
  weeks_imported: number;
  income_entries_imported: number;
  finance_goal_updated: boolean;
  payload: ExportPayload;
};

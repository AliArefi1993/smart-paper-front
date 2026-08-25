export type LegacySectionName = "main" | "second" | "learning" | "exercise";

export type SectionName =
  | "slot_1"
  | "slot_2"
  | "slot_3"
  | "slot_4"
  | "slot_5"
  | "slot_6"
  | "slot_7"
  | "slot_8"
  | "slot_9"
  | "slot_10";

export type PlannerSection = {
  id: SectionName;
  label: string;
  active: boolean;
  order: number;
};

export type PlannerSectionsResponse = {
  planner_sections: PlannerSection[];
};

export type SectionData = {
  duration_minutes: number;
  goal: string;
  note: string;
};

export type ScheduleEntry = {
  id: string;
  start_time: string;
  end_time: string;
  title: string;
  note: string;
  section_id: SectionName | null;
  order: number;
};

export type MorningNotificationSettings = {
  enabled: boolean;
  time: string;
};

export type DayData = {
  date: string;
  weekday_index: number;
  weekday_name: string;
  sections: Record<SectionName, SectionData>;
  schedule_entries: ScheduleEntry[];
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
  planner_sections: PlannerSection[];
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
  planner_sections: PlannerSection[];
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
  schema_version?: number;
  exported_at: string;
  planner_sections?: PlannerSection[];
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

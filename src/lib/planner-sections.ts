import type {
  LegacySectionName,
  PlannerSection,
  ScheduleEntry,
  SectionData,
  SectionName,
  WeekDetail,
  WeekSummary,
} from "@/lib/smart-paper-types";

export const SECTION_IDS: SectionName[] = [
  "slot_1",
  "slot_2",
  "slot_3",
  "slot_4",
  "slot_5",
  "slot_6",
  "slot_7",
  "slot_8",
  "slot_9",
  "slot_10",
];

const LEGACY_TO_SLOT: Record<LegacySectionName, SectionName> = {
  main: "slot_1",
  second: "slot_2",
  learning: "slot_3",
  exercise: "slot_4",
};

const LEGACY_LABELS: Record<LegacySectionName, string> = {
  main: "Main",
  second: "Second",
  learning: "Learning",
  exercise: "Exercise",
};

export const DEFAULT_PLANNER_SECTIONS: PlannerSection[] = SECTION_IDS.map(
  (id, index) => ({
    id,
    label:
      index === 0
        ? LEGACY_LABELS.main
        : index === 1
          ? LEGACY_LABELS.second
          : index === 2
            ? LEGACY_LABELS.learning
            : index === 3
              ? LEGACY_LABELS.exercise
              : `Section ${index + 1}`,
    active: index < 4,
    order: index + 1,
  }),
);

export function emptySectionData(): SectionData {
  return {
    duration_minutes: 0,
    goal: "",
    note: "",
  };
}

function isSectionName(value: string): value is SectionName {
  return (SECTION_IDS as string[]).includes(value);
}

function normalizeLabel(label: unknown, fallback: string): string {
  return typeof label === "string" && label.trim() ? label.trim() : fallback;
}

export function normalizePlannerSections(
  sections: unknown,
): PlannerSection[] {
  const incoming = Array.isArray(sections) ? sections : [];
  const byId = new Map<string, Partial<PlannerSection>>();

  for (const section of incoming) {
    if (!section || typeof section !== "object") continue;
    const candidate = section as Partial<PlannerSection> & {
      slot_id?: unknown;
      position?: unknown;
    };
    const rawId = candidate.id ?? candidate.slot_id;
    if (typeof rawId !== "string" || !isSectionName(rawId)) continue;
    byId.set(rawId, {
      ...candidate,
      id: rawId,
      order:
        typeof candidate.order === "number"
          ? candidate.order
          : typeof candidate.position === "number"
            ? candidate.position
            : undefined,
    });
  }

  const normalized = DEFAULT_PLANNER_SECTIONS.map((fallback) => {
    const incomingSection = byId.get(fallback.id);
    const order =
      typeof incomingSection?.order === "number" &&
      Number.isFinite(incomingSection.order)
        ? incomingSection.order
        : fallback.order;
    return {
      id: fallback.id,
      label: normalizeLabel(incomingSection?.label, fallback.label),
      active:
        typeof incomingSection?.active === "boolean"
          ? incomingSection.active
          : fallback.active,
      order,
    };
  }).sort((a, b) => a.order - b.order);

  if (!normalized.some((section) => section.active)) {
    normalized[0] = {
      ...normalized[0],
      active: true,
    };
  }

  return normalized.map((section, index) => ({
    ...section,
    order: index + 1,
  }));
}

export function activePlannerSections(
  sections: PlannerSection[] | undefined,
): PlannerSection[] {
  return normalizePlannerSections(sections).filter((section) => section.active);
}

export function sectionLabel(
  sections: PlannerSection[] | undefined,
  sectionId: SectionName,
): string {
  return (
    normalizePlannerSections(sections).find((section) => section.id === sectionId)?.label ??
    sectionId
  );
}

export function normalizeSectionData(value: unknown): SectionData {
  if (!value || typeof value !== "object") return emptySectionData();
  const candidate = value as Partial<SectionData>;
  return {
    duration_minutes:
      typeof candidate.duration_minutes === "number" &&
      Number.isFinite(candidate.duration_minutes) &&
      candidate.duration_minutes >= 0
        ? candidate.duration_minutes
        : 0,
    goal: typeof candidate.goal === "string" ? candidate.goal : "",
    note: typeof candidate.note === "string" ? candidate.note : "",
  };
}

function isScheduleTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function createScheduleEntryId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `schedule-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeScheduleEntries(entries: unknown): ScheduleEntry[] {
  const incoming = Array.isArray(entries) ? entries : [];
  return incoming
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as Partial<ScheduleEntry>;
      const startTime = isScheduleTime(candidate.start_time)
        ? candidate.start_time
        : "";
      const endTime = isScheduleTime(candidate.end_time)
        ? candidate.end_time
        : "";
      const title =
        typeof candidate.title === "string" ? candidate.title.trim() : "";
      if (!startTime || !endTime || timeToMinutes(startTime) >= timeToMinutes(endTime) || !title) {
        return null;
      }
      const sectionId =
        typeof candidate.section_id === "string" &&
        (SECTION_IDS as string[]).includes(candidate.section_id)
          ? candidate.section_id
          : null;
      return {
        id:
          typeof candidate.id === "string" && candidate.id.trim()
            ? candidate.id
            : createScheduleEntryId(),
        start_time: startTime,
        end_time: endTime,
        title,
        note: typeof candidate.note === "string" ? candidate.note : "",
        section_id: sectionId,
        order:
          typeof candidate.order === "number" &&
          Number.isFinite(candidate.order) &&
          candidate.order >= 0
            ? candidate.order
            : index,
      } satisfies ScheduleEntry;
    })
    .filter((entry): entry is ScheduleEntry => entry !== null)
    .sort((a, b) =>
      a.start_time.localeCompare(b.start_time) ||
      a.end_time.localeCompare(b.end_time) ||
      a.order - b.order ||
      a.title.localeCompare(b.title),
    )
    .map((entry, index) => ({ ...entry, order: index }));
}

export function normalizeSectionsRecord(
  sections: unknown,
): Record<SectionName, SectionData> {
  const source = sections && typeof sections === "object" ? sections as Record<string, unknown> : {};
  const normalized = Object.fromEntries(
    SECTION_IDS.map((sectionId) => [
      sectionId,
      normalizeSectionData(source[sectionId]),
    ]),
  ) as Record<SectionName, SectionData>;

  for (const [legacyId, slotId] of Object.entries(LEGACY_TO_SLOT) as Array<
    [LegacySectionName, SectionName]
  >) {
    if (source[slotId]) continue;
    normalized[slotId] = normalizeSectionData(source[legacyId]);
  }

  return normalized;
}

export function normalizeWeekDetail(week: WeekDetail): WeekDetail {
  const plannerSections = normalizePlannerSections(week.planner_sections);
  const days = week.days.map((day) => ({
    ...day,
    sections: normalizeSectionsRecord(day.sections),
    schedule_entries: normalizeScheduleEntries(day.schedule_entries),
  }));
  const activeSectionIds = plannerSections
    .filter((section) => section.active)
    .map((section) => section.id);
  const fallbackTotals = calculateSectionTotals(days, activeSectionIds);
  const bySection = Object.fromEntries(
    SECTION_IDS.map((sectionId) => [
      sectionId,
      typeof week.totals?.by_section_minutes?.[sectionId] === "number"
        ? week.totals.by_section_minutes[sectionId]
        : activeSectionIds.includes(sectionId)
          ? fallbackTotals.by_section_minutes[sectionId]
          : 0,
    ]),
  ) as Record<SectionName, number>;
  return {
    ...week,
    planner_sections: plannerSections,
    days,
    totals: {
      by_section_minutes: bySection,
      week_total_minutes:
        typeof week.totals?.week_total_minutes === "number"
          ? week.totals.week_total_minutes
          : fallbackTotals.week_total_minutes,
    },
  };
}

export function toPlannerSectionPayload(sections: PlannerSection[]) {
  return normalizePlannerSections(sections).map((section) => ({
    slot_id: section.id,
    label: section.label,
    active: section.active,
    position: section.order,
  }));
}

export function normalizeWeekSummary(week: WeekSummary): WeekSummary {
  const plannerSections = normalizePlannerSections(week.planner_sections);
  const bySection = Object.fromEntries(
    SECTION_IDS.map((sectionId) => [
      sectionId,
      typeof week.totals?.by_section_minutes?.[sectionId] === "number"
        ? week.totals.by_section_minutes[sectionId]
        : 0,
    ]),
  ) as Record<SectionName, number>;
  const notesBySection = Object.fromEntries(
    SECTION_IDS.map((sectionId) => [
      sectionId,
      Array.isArray(week.notes_by_section?.[sectionId])
        ? week.notes_by_section[sectionId]
        : [],
    ]),
  ) as Record<SectionName, string[]>;
  const detailsBySection = Object.fromEntries(
    SECTION_IDS.map((sectionId) => [
      sectionId,
      week.details_by_section?.[sectionId] ?? [],
    ]),
  ) as NonNullable<WeekSummary["details_by_section"]>;

  return {
    ...week,
    planner_sections: plannerSections,
    totals: {
      by_section_minutes: bySection,
      week_total_minutes:
        typeof week.totals?.week_total_minutes === "number"
          ? week.totals.week_total_minutes
          : Object.values(bySection).reduce((total, value) => total + value, 0),
    },
    notes_by_section: notesBySection,
    details_by_section: detailsBySection,
  };
}

export function calculateSectionTotals(
  days: Array<{ sections: Record<SectionName, SectionData> }>,
  sectionIds: SectionName[] = SECTION_IDS,
) {
  const bySection = Object.fromEntries(
    SECTION_IDS.map((sectionId) => [sectionId, 0]),
  ) as Record<SectionName, number>;

  for (const day of days) {
    for (const sectionId of sectionIds) {
      bySection[sectionId] += day.sections[sectionId]?.duration_minutes ?? 0;
    }
  }

  return {
    by_section_minutes: bySection,
    week_total_minutes: Object.values(bySection).reduce((total, value) => total + value, 0),
  };
}

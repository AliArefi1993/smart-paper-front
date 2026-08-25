import { requestJson } from "@/lib/api-client";
import {
  getLocalPlannerSections,
  getLocalWeek,
  getLocalWeekSummaries,
  getLocalWeeks,
  saveLocalPlannerSections,
  saveLocalWeek,
} from "@/lib/local-store";
import {
  normalizePlannerSections,
  normalizeWeekDetail,
  normalizeWeekSummary,
  toPlannerSectionPayload,
} from "@/lib/planner-sections";
import type {
  DayData,
  PlannerSection,
  PlannerSectionsResponse,
  WeekDetail,
  WeekListPayload,
  WeekSummariesResponse,
} from "@/lib/smart-paper-types";

function isLocalStorageMode(): boolean {
  return process.env.NEXT_PUBLIC_DATA_MODE === "local";
}

export async function getWeeks(span = 8): Promise<WeekListPayload> {
  if (isLocalStorageMode()) {
    return getLocalWeeks(span);
  }
  return requestJson<WeekListPayload>(`/weeks/?span=${span}`);
}

export async function getWeek(startDate: string): Promise<WeekDetail> {
  if (isLocalStorageMode()) {
    return getLocalWeek(startDate);
  }
  return normalizeWeekDetail(await requestJson<WeekDetail>(`/weeks/${startDate}/`));
}

export async function saveWeek(
  week: Pick<WeekDetail, "start_date" | "weekly_goal" | "weekly_note"> & {
    days: DayData[];
  },
): Promise<WeekDetail> {
  if (isLocalStorageMode()) {
    return saveLocalWeek(week);
  }
  return normalizeWeekDetail(await requestJson<WeekDetail>(`/weeks/${week.start_date}/`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      weekly_goal: week.weekly_goal,
      weekly_note: week.weekly_note,
      days: week.days.map((day) => ({
        date: day.date,
        sections: day.sections,
        schedule_entries: day.schedule_entries,
      })),
    }),
  }));
}

export async function getWeekSummaries(
  span = 8,
): Promise<WeekSummariesResponse> {
  if (isLocalStorageMode()) {
    return getLocalWeekSummaries(span);
  }
  const payload = await requestJson<WeekSummariesResponse>(`/week-summaries/?span=${span}`);
  return {
    summaries: (payload.summaries ?? []).map(normalizeWeekSummary),
  };
}

export async function getPlannerSections(): Promise<PlannerSection[]> {
  if (isLocalStorageMode()) {
    return getLocalPlannerSections();
  }
  return normalizePlannerSections(
    (await requestJson<PlannerSectionsResponse>("/planner-sections/")).planner_sections,
  );
}

export async function savePlannerSections(
  sections: PlannerSection[],
): Promise<PlannerSection[]> {
  const normalized = normalizePlannerSections(sections);
  if (isLocalStorageMode()) {
    return saveLocalPlannerSections(normalized);
  }
  return normalizePlannerSections(
    (await requestJson<PlannerSectionsResponse>("/planner-sections/", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planner_sections: toPlannerSectionPayload(normalized) }),
    })).planner_sections,
  );
}

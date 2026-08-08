import { requestJson } from "@/lib/api-client";
import {
  getLocalWeek,
  getLocalWeekSummaries,
  getLocalWeeks,
  saveLocalWeek,
} from "@/lib/local-store";
import type {
  DayData,
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
  return requestJson<WeekDetail>(`/weeks/${startDate}/`);
}

export async function saveWeek(
  week: Pick<WeekDetail, "start_date" | "weekly_goal" | "weekly_note"> & {
    days: DayData[];
  },
): Promise<WeekDetail> {
  if (isLocalStorageMode()) {
    return saveLocalWeek(week);
  }
  return requestJson<WeekDetail>(`/weeks/${week.start_date}/`, {
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
      })),
    }),
  });
}

export async function getWeekSummaries(
  span = 8,
): Promise<WeekSummariesResponse> {
  if (isLocalStorageMode()) {
    return getLocalWeekSummaries(span);
  }
  return requestJson<WeekSummariesResponse>(`/week-summaries/?span=${span}`);
}

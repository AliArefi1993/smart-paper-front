"use client";

import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";

type SectionName = "main" | "second" | "learning" | "exercise";

type SectionData = {
  duration_minutes: number;
  goal: string;
  note: string;
};

type DayData = {
  date: string;
  weekday_index: number;
  weekday_name: string;
  sections: Record<SectionName, SectionData>;
};

type WeekTotals = {
  by_section_minutes: Record<SectionName, number>;
  week_total_minutes: number;
};

type WeekDetail = {
  start_date: string;
  end_date: string;
  label: string;
  weekly_goal: string;
  weekly_note: string;
  days: DayData[];
  totals: WeekTotals;
};

type WeekItem = {
  start_date: string;
  end_date: string;
  label: string;
  is_current: boolean;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8010/api";

const SECTIONS: SectionName[] = ["main", "second", "learning", "exercise"];

const SECTION_LABELS: Record<SectionName, string> = {
  main: "Main",
  second: "Second",
  learning: "Learning",
  exercise: "Exercise",
};

const WEEKDAY_SHORT: Record<string, string> = {
  Saturday: "Sat",
  Sunday: "Sun",
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
};

const SHAMSI_DATE_FORMATTER = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatShamsiDate(isoDate: string): string {
  const parts = SHAMSI_DATE_FORMATTER.formatToParts(parseIsoDate(isoDate));
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}/${month}/${day}`;
}

function formatShamsiWeekRange(startIso: string, endIso: string): string {
  return `${formatShamsiDate(startIso)} to ${formatShamsiDate(endIso)}`;
}

function formatMinutes(value: number): string {
  if (!value) return "";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

type OrderedNoteItem = {
  dayName: string;
  dayDate: string;
  note: string;
};

export function WeeklyPlanner() {
  const [weeks, setWeeks] = useState<WeekItem[]>([]);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>("");
  const [weekDetail, setWeekDetail] = useState<WeekDetail | null>(null);
  const [isLoadingWeeks, setIsLoadingWeeks] = useState(true);
  const [isLoadingWeek, setIsLoadingWeek] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function fetchWeek(startDate: string) {
    setMessage("");
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/weeks/${startDate}/`);
      if (!response.ok) {
        throw new Error("Could not load selected week");
      }
      const payload = (await response.json()) as WeekDetail;
      setWeekDetail(payload);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unknown error loading week",
      );
    } finally {
      setIsLoadingWeek(false);
    }
  }

  async function saveWeek() {
    if (!weekDetail) return;

    setIsSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/weeks/${weekDetail.start_date}/`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          weekly_goal: weekDetail.weekly_goal,
          weekly_note: weekDetail.weekly_note,
          days: weekDetail.days.map((day) => ({
            date: day.date,
            sections: day.sections,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("Could not save week data");
      }

      const payload = (await response.json()) as WeekDetail;
      setWeekDetail(payload);
      setMessage("Saved successfully.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unknown save error");
    } finally {
      setIsSaving(false);
    }
  }

  function handleEnterToSave(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (isSaving) return;
    void saveWeek();
  }

  function handleTextareaEnterToSave(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void {
    if (event.key !== "Enter") return;
    if (event.shiftKey) return;
    event.preventDefault();
    if (isSaving) return;
    void saveWeek();
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      try {
        const weeksResponse = await fetch(`${API_BASE_URL}/weeks/?span=8`);
        if (!weeksResponse.ok) {
          throw new Error("Could not load weeks");
        }
        const weeksPayload = (await weeksResponse.json()) as {
          current_week_start: string;
          weeks: WeekItem[];
        };

        if (cancelled) return;

        setWeeks(weeksPayload.weeks);
        setSelectedWeekStart(weeksPayload.current_week_start);
        setIsLoadingWeeks(false);
        setIsLoadingWeek(true);

        const weekResponse = await fetch(
          `${API_BASE_URL}/weeks/${weeksPayload.current_week_start}/`,
        );
        if (!weekResponse.ok) {
          throw new Error("Could not load selected week");
        }

        const weekPayload = (await weekResponse.json()) as WeekDetail;
        if (cancelled) return;

        setWeekDetail(weekPayload);
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error ? loadError.message : "Unknown error loading weeks",
        );
      } finally {
        if (cancelled) return;
        setIsLoadingWeeks(false);
        setIsLoadingWeek(false);
      }
    }

    void loadInitialData();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    if (!weekDetail) return null;
    return weekDetail.totals;
  }, [weekDetail]);

  const notesBySection = useMemo(() => {
    const empty: Record<SectionName, OrderedNoteItem[]> = {
      main: [],
      second: [],
      learning: [],
      exercise: [],
    };
    if (!weekDetail) return empty;

    for (const day of weekDetail.days) {
      for (const section of SECTIONS) {
        const note = day.sections[section].note.trim();
        if (!note) continue;
        empty[section].push({
          dayName: day.weekday_name,
          dayDate: day.date,
          note,
        });
      }
    }

    return empty;
  }, [weekDetail]);

  function updateDuration(dayDate: string, section: SectionName, value: number): void {
    setWeekDetail((previous) => {
      if (!previous) return previous;

      const nextDays = previous.days.map((day) => {
        if (day.date !== dayDate) return day;
        return {
          ...day,
          sections: {
            ...day.sections,
            [section]: {
              ...day.sections[section],
              duration_minutes: Math.max(0, value),
            },
          },
        };
      });

      return {
        ...previous,
        days: nextDays,
        totals: calculateTotals(nextDays),
      };
    });
  }

  function updateNote(dayDate: string, section: SectionName, note: string): void {
    setWeekDetail((previous) => {
      if (!previous) return previous;

      const nextDays = previous.days.map((day) => {
        if (day.date !== dayDate) return day;
        return {
          ...day,
          sections: {
            ...day.sections,
            [section]: {
              ...day.sections[section],
              note,
            },
          },
        };
      });

      return {
        ...previous,
        days: nextDays,
      };
    });
  }

  function updateSectionGoal(dayDate: string, section: SectionName, goal: string): void {
    setWeekDetail((previous) => {
      if (!previous) return previous;

      const nextDays = previous.days.map((day) => {
        if (day.date !== dayDate) return day;
        return {
          ...day,
          sections: {
            ...day.sections,
            [section]: {
              ...day.sections[section],
              goal,
            },
          },
        };
      });

      return {
        ...previous,
        days: nextDays,
      };
    });
  }

  function updateWeeklyGoal(goal: string): void {
    setWeekDetail((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        weekly_goal: goal,
      };
    });
  }

  function updateWeeklyNote(note: string): void {
    setWeekDetail((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        weekly_note: note,
      };
    });
  }

  function handleWeekSelect(startDate: string): void {
    setSelectedWeekStart(startDate);
    setIsLoadingWeek(true);
    void fetchWeek(startDate);
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8">
      <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
        <h1 className="text-3xl font-bold text-slate-900">Weekly Smart Paper</h1>
        <p className="mt-2 text-sm text-slate-600">
          Pick a week, fill your plan from Saturday to Friday, then save.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Dates are shown in Shamsi (Persian calendar) with English labels.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Weeks
        </h2>
        {isLoadingWeeks ? (
          <p className="text-slate-600">Loading weeks...</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {weeks.map((week) => {
              const isSelected = week.start_date === selectedWeekStart;
              return (
                <button
                  type="button"
                  key={week.start_date}
                  onClick={() => handleWeekSelect(week.start_date)}
                  className={`rounded-full border px-4 py-2 text-xs transition ${
                    isSelected
                      ? "border-teal-600 bg-teal-600 text-white"
                      : week.is_current
                        ? "border-amber-500 bg-amber-50 text-amber-900"
                        : "border-slate-300 bg-white text-slate-700 hover:border-teal-400 hover:text-teal-700"
                  }`}
                >
                  {formatShamsiWeekRange(week.start_date, week.end_date)}
                  {week.is_current ? " (Current)" : ""}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              {weekDetail
                ? formatShamsiWeekRange(weekDetail.start_date, weekDetail.end_date)
                : "Week Details"}
            </h2>
            <p className="text-sm text-slate-600">
              Duration input is in minutes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void saveWeek()}
            disabled={!weekDetail || isSaving}
            className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSaving ? "Saving..." : "Save Week"}
          </button>
        </div>

        {message ? <p className="mb-3 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mb-3 text-sm text-rose-700">{error}</p> : null}

        {isLoadingWeek ? (
          <p className="text-slate-600">Loading selected week...</p>
        ) : null}

        {weekDetail ? (
          <div className="space-y-4">
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 text-base font-semibold text-slate-900">Week Goal</h3>
              <div className="grid gap-2">
                <textarea
                  value={weekDetail.weekly_goal}
                  onChange={(event) => updateWeeklyGoal(event.target.value)}
                  onKeyDown={handleTextareaEnterToSave}
                  placeholder="Write the main goal for this week"
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none ring-teal-500 focus:ring"
                />
                <textarea
                  value={weekDetail.weekly_note}
                  onChange={(event) => updateWeeklyNote(event.target.value)}
                  onKeyDown={handleTextareaEnterToSave}
                  placeholder="Write any extra weekly note"
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none ring-teal-500 focus:ring"
                />
              </div>
            </article>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {weekDetail.days.map((day) => (
                <article
                  key={day.date}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <header className="mb-3">
                    <h3 className="text-base font-semibold text-slate-900">
                      {day.weekday_name}
                    </h3>
                    <p className="text-xs text-slate-500">{formatShamsiDate(day.date)}</p>
                  </header>

                  <div className="space-y-3">
                    {SECTIONS.map((section) => (
                      <div key={section} className="rounded-xl bg-white p-3 shadow-sm">
                        <p className="mb-2 text-sm font-semibold text-slate-800">
                          {SECTION_LABELS[section]}
                        </p>
                        <div className="grid gap-2">
                          <input
                            value={
                              day.sections[section].duration_minutes
                                ? String(day.sections[section].duration_minutes)
                                : ""
                            }
                          onChange={(event) =>
                            updateDuration(
                              day.date,
                              section,
                              Number.parseInt(event.target.value || "0", 10),
                            )
                          }
                          onKeyDown={handleEnterToSave}
                          type="number"
                          min={0}
                          placeholder="Minutes"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none ring-teal-500 focus:ring"
                        />
                        <input
                          value={day.sections[section].goal}
                          onChange={(event) =>
                            updateSectionGoal(day.date, section, event.target.value)
                          }
                          onKeyDown={handleEnterToSave}
                          placeholder="Goal for this section"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none ring-teal-500 focus:ring"
                        />
                        <input
                          value={day.sections[section].note}
                          onChange={(event) =>
                            updateNote(day.date, section, event.target.value)
                          }
                          onKeyDown={handleEnterToSave}
                          placeholder="Write a short note"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none ring-teal-500 focus:ring"
                        />
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {totals ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Week Totals</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {SECTIONS.map((section) => (
              <div key={section} className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {SECTION_LABELS[section]}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {formatMinutes(totals.by_section_minutes[section]) || "00:00"}
                </p>
                <div className="mt-3 border-t border-slate-200 pt-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">
                    Notes
                  </p>
                  {notesBySection[section].length === 0 ? (
                    <p className="mt-1 text-xs text-slate-500">No notes.</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {notesBySection[section].map((item, index) => (
                        <li
                          key={`${section}-${item.dayDate}-${index}`}
                          className="text-xs text-slate-700"
                        >
                          {WEEKDAY_SHORT[item.dayName] ?? item.dayName}: {item.note}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
            <div className="rounded-xl bg-teal-600 p-3 text-white">
              <p className="text-xs uppercase tracking-wide text-teal-100">Total</p>
              <p className="mt-1 text-lg font-semibold">
                {formatMinutes(totals.week_total_minutes) || "00:00"}
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function calculateTotals(days: DayData[]): WeekTotals {
  const bySection: Record<SectionName, number> = {
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
    week_total_minutes: Object.values(bySection).reduce((acc, value) => acc + value, 0),
  };
}

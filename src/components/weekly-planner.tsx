"use client";

import Link from "next/link";
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

type ThemeMode = "setup" | "dark";

type ThemeClasses = {
  container: string;
  badge: string;
  title: string;
  line: string;
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

const SECTION_THEME_SETUP: Record<SectionName, ThemeClasses> = {
  main: {
    container: "border-red-200 bg-red-50",
    badge: "bg-red-600 text-white",
    title: "text-red-800",
    line: "border-red-200",
  },
  second: {
    container: "border-blue-200 bg-blue-50",
    badge: "bg-blue-600 text-white",
    title: "text-blue-800",
    line: "border-blue-200",
  },
  learning: {
    container: "border-amber-200 bg-amber-50",
    badge: "bg-amber-500 text-amber-950",
    title: "text-amber-900",
    line: "border-amber-200",
  },
  exercise: {
    container: "border-green-200 bg-green-50",
    badge: "bg-green-600 text-white",
    title: "text-green-800",
    line: "border-green-200",
  },
};

const SECTION_THEME_DARK: Record<SectionName, ThemeClasses> = {
  main: {
    container: "border-fuchsia-800 bg-fuchsia-950/35",
    badge: "bg-fuchsia-500/25 text-fuchsia-100",
    title: "text-fuchsia-100",
    line: "border-fuchsia-800/70",
  },
  second: {
    container: "border-cyan-800 bg-cyan-950/35",
    badge: "bg-cyan-500/25 text-cyan-100",
    title: "text-cyan-100",
    line: "border-cyan-800/70",
  },
  learning: {
    container: "border-amber-800 bg-amber-950/35",
    badge: "bg-amber-500/25 text-amber-100",
    title: "text-amber-100",
    line: "border-amber-800/70",
  },
  exercise: {
    container: "border-emerald-800 bg-emerald-950/35",
    badge: "bg-emerald-500/25 text-emerald-100",
    title: "text-emerald-100",
    line: "border-emerald-800/70",
  },
};

const DAY_THEME_SETUP: Record<number, ThemeClasses> = {
  0: {
    container: "border-stone-300 bg-stone-100/80",
    badge: "bg-stone-700 text-stone-100",
    title: "text-stone-900",
    line: "border-stone-300",
  },
  1: {
    container: "border-slate-300 bg-slate-100/80",
    badge: "bg-slate-700 text-slate-100",
    title: "text-slate-900",
    line: "border-slate-300",
  },
  2: {
    container: "border-cyan-200 bg-cyan-100/70",
    badge: "bg-cyan-700 text-cyan-100",
    title: "text-cyan-900",
    line: "border-cyan-200",
  },
  3: {
    container: "border-sky-200 bg-sky-100/70",
    badge: "bg-sky-700 text-sky-100",
    title: "text-sky-900",
    line: "border-sky-200",
  },
  4: {
    container: "border-violet-200 bg-violet-100/70",
    badge: "bg-violet-700 text-violet-100",
    title: "text-violet-900",
    line: "border-violet-200",
  },
  5: {
    container: "border-pink-200 bg-pink-100/70",
    badge: "bg-pink-700 text-pink-100",
    title: "text-pink-900",
    line: "border-pink-200",
  },
  6: {
    container: "border-emerald-200 bg-emerald-100/70",
    badge: "bg-emerald-700 text-emerald-100",
    title: "text-emerald-900",
    line: "border-emerald-200",
  },
};

const DAY_THEME_DARK: Record<number, ThemeClasses> = {
  0: {
    container: "border-slate-700 bg-slate-900/75",
    badge: "bg-slate-700 text-slate-100",
    title: "text-slate-100",
    line: "border-slate-700",
  },
  1: {
    container: "border-zinc-700 bg-zinc-900/75",
    badge: "bg-zinc-700 text-zinc-100",
    title: "text-zinc-100",
    line: "border-zinc-700",
  },
  2: {
    container: "border-blue-800 bg-blue-950/35",
    badge: "bg-blue-500/25 text-blue-100",
    title: "text-blue-100",
    line: "border-blue-800/70",
  },
  3: {
    container: "border-violet-800 bg-violet-950/35",
    badge: "bg-violet-500/25 text-violet-100",
    title: "text-violet-100",
    line: "border-violet-800/70",
  },
  4: {
    container: "border-rose-800 bg-rose-950/35",
    badge: "bg-rose-500/25 text-rose-100",
    title: "text-rose-100",
    line: "border-rose-800/70",
  },
  5: {
    container: "border-amber-800 bg-amber-950/35",
    badge: "bg-amber-500/25 text-amber-100",
    title: "text-amber-100",
    line: "border-amber-800/70",
  },
  6: {
    container: "border-emerald-800 bg-emerald-950/35",
    badge: "bg-emerald-500/25 text-emerald-100",
    title: "text-emerald-100",
    line: "border-emerald-800/70",
  },
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
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [weeks, setWeeks] = useState<WeekItem[]>([]);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>("");
  const [weekDetail, setWeekDetail] = useState<WeekDetail | null>(null);
  const [isLoadingWeeks, setIsLoadingWeeks] = useState(true);
  const [isLoadingWeek, setIsLoadingWeek] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const isDark = themeMode === "dark";
  const dayTheme = isDark ? DAY_THEME_DARK : DAY_THEME_SETUP;
  const sectionTheme = isDark ? SECTION_THEME_DARK : SECTION_THEME_SETUP;
  const panelClass = isDark
    ? "border-slate-700 bg-slate-900/85 text-slate-100"
    : "border-slate-200 bg-white text-slate-900";
  const mutedPanelClass = isDark
    ? "border-slate-700 bg-slate-800/70"
    : "border-slate-200 bg-slate-50";
  const inputClass = isDark
    ? "w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-teal-400 placeholder:text-slate-400 focus:ring"
    : "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none ring-teal-500 focus:ring";

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
    <main
      className={`mx-auto flex min-h-screen w-full max-w-none flex-col gap-6 px-4 py-6 md:px-6 xl:px-8 ${
        isDark ? "text-slate-100" : "text-slate-900"
      }`}
    >
      <section
        className={`mx-auto w-full max-w-[1700px] rounded-3xl border p-5 shadow-sm backdrop-blur ${panelClass}`}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">Weekly Smart Paper</h1>
          <div className="flex items-center gap-2">
            <Link
              href="/summaries"
              className={`rounded-xl border px-3 py-1 text-xs font-semibold transition ${
                isDark
                  ? "border-slate-600 bg-slate-800 text-slate-100 hover:border-teal-400 hover:text-teal-300"
                  : "border-slate-300 bg-white text-slate-700 hover:border-teal-500 hover:text-teal-700"
              }`}
            >
              Summaries
            </Link>
            <Link
              href="/finance"
              className={`rounded-xl border px-3 py-1 text-xs font-semibold transition ${
                isDark
                  ? "border-slate-600 bg-slate-800 text-slate-100 hover:border-teal-400 hover:text-teal-300"
                  : "border-slate-300 bg-white text-slate-700 hover:border-teal-500 hover:text-teal-700"
              }`}
            >
              Finance
            </Link>
            <div className="flex items-center gap-2 rounded-full border border-slate-400/40 bg-white/10 p-1">
            <button
              type="button"
              onClick={() => setThemeMode("setup")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                themeMode === "setup"
                  ? "bg-teal-600 text-white"
                  : isDark
                    ? "text-slate-200 hover:bg-slate-700"
                    : "text-slate-700 hover:bg-slate-200"
              }`}
            >
              Setup 1
            </button>
            <button
              type="button"
              onClick={() => setThemeMode("dark")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                themeMode === "dark"
                  ? "bg-slate-100 text-slate-900"
                  : isDark
                    ? "text-slate-200 hover:bg-slate-700"
                    : "text-slate-700 hover:bg-slate-200"
              }`}
            >
              Dark Mode
            </button>
            </div>
          </div>
        </div>
        <p className={`mt-2 text-sm ${isDark ? "text-slate-300" : "text-slate-600"}`}>
          Pick a week, fill Saturday to Friday, then press Enter to save.
        </p>
        <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          Dates are shown in Shamsi (Persian calendar) with English labels.
        </p>
      </section>

      <section
        className={`mx-auto w-full max-w-[1700px] rounded-3xl border p-4 shadow-sm ${panelClass}`}
      >
        <h2
          className={`mb-3 text-sm font-semibold uppercase tracking-wide ${
            isDark ? "text-slate-400" : "text-slate-500"
          }`}
        >
          Weeks
        </h2>
        {isLoadingWeeks ? (
          <p className={isDark ? "text-slate-300" : "text-slate-600"}>Loading weeks...</p>
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
                      ? isDark
                        ? "border-teal-500 bg-teal-500 text-slate-950"
                        : "border-teal-600 bg-teal-600 text-white"
                      : week.is_current
                        ? isDark
                          ? "border-amber-600 bg-amber-900/35 text-amber-100"
                          : "border-amber-500 bg-amber-50 text-amber-900"
                        : isDark
                          ? "border-slate-600 bg-slate-800 text-slate-200 hover:border-teal-400 hover:text-teal-300"
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

      <section className={`rounded-3xl border p-4 shadow-sm ${panelClass}`}>
        <div className="mb-4 flex flex-col items-center justify-center gap-3 text-center">
          <div className="flex flex-col items-center">
            <h2 className="text-xl font-semibold">
              {weekDetail
                ? formatShamsiWeekRange(weekDetail.start_date, weekDetail.end_date)
                : "Week Details"}
            </h2>
            <p className={`text-sm ${isDark ? "text-slate-300" : "text-slate-600"}`}>
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

        {message ? <p className="mb-3 text-center text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mb-3 text-center text-sm text-rose-700">{error}</p> : null}

        {isLoadingWeek ? (
          <p className={isDark ? "text-slate-300" : "text-slate-600"}>
            Loading selected week...
          </p>
        ) : null}

        {weekDetail ? (
          <div className="space-y-4">
            <article
              className={`mx-auto w-full max-w-[1500px] rounded-2xl border p-4 ${mutedPanelClass}`}
            >
              <h3 className="mb-3 text-base font-semibold">Week Goal</h3>
              <div className="grid gap-2">
                <textarea
                  value={weekDetail.weekly_goal}
                  onChange={(event) => updateWeeklyGoal(event.target.value)}
                  onKeyDown={handleTextareaEnterToSave}
                  placeholder="Write the main goal for this week"
                  rows={2}
                  className={inputClass}
                />
                <textarea
                  value={weekDetail.weekly_note}
                  onChange={(event) => updateWeeklyNote(event.target.value)}
                  onKeyDown={handleTextareaEnterToSave}
                  placeholder="Write any extra weekly note"
                  rows={3}
                  className={inputClass}
                />
              </div>
            </article>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-7">
              {weekDetail.days.map((day) => (
                <article
                  key={day.date}
                  className={`rounded-2xl border p-4 ${dayTheme[day.weekday_index].container}`}
                >
                  <header
                    className={`mb-3 flex items-center justify-between border-b pb-2 ${dayTheme[day.weekday_index].line}`}
                  >
                    <h3
                      className={`text-base font-semibold ${dayTheme[day.weekday_index].title}`}
                    >
                      {day.weekday_name}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-semibold ${dayTheme[day.weekday_index].badge}`}
                    >
                      Day {day.weekday_index + 1}
                    </span>
                  </header>
                  <div className="mb-3">
                    <p className={`text-xs ${isDark ? "text-slate-300" : "text-slate-500"}`}>
                      {formatShamsiDate(day.date)}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {SECTIONS.map((section) => (
                      <div
                        key={section}
                        className={`rounded-xl border p-3 shadow-sm ${sectionTheme[section].container}`}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${sectionTheme[section].badge}`}
                          >
                            {SECTION_LABELS[section]}
                          </span>
                        </div>
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
                          className={inputClass}
                        />
                        <input
                          value={day.sections[section].goal}
                          onChange={(event) =>
                            updateSectionGoal(day.date, section, event.target.value)
                          }
                          onKeyDown={handleEnterToSave}
                          placeholder="Goal for this section"
                          className={inputClass}
                        />
                        <input
                          value={day.sections[section].note}
                          onChange={(event) =>
                            updateNote(day.date, section, event.target.value)
                          }
                          onKeyDown={handleEnterToSave}
                          placeholder="Write a short note"
                          className={inputClass}
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
        <section
          className={`mx-auto w-full max-w-[1600px] rounded-3xl border p-4 shadow-sm ${panelClass}`}
        >
          <h2 className="mb-3 text-lg font-semibold">Week Totals</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {SECTIONS.map((section) => (
              <div
                key={section}
                className={`rounded-xl border p-3 ${sectionTheme[section].container}`}
              >
                <p
                  className={`text-xs uppercase tracking-wide font-semibold ${sectionTheme[section].title}`}
                >
                  {SECTION_LABELS[section]}
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {formatMinutes(totals.by_section_minutes[section]) || "00:00"}
                </p>
                <div className={`mt-3 border-t pt-2 ${sectionTheme[section].line}`}>
                  <p
                    className={`text-xs uppercase tracking-wide font-semibold ${
                      isDark ? "text-slate-300" : "text-slate-500"
                    }`}
                  >
                    Notes
                  </p>
                  {notesBySection[section].length === 0 ? (
                    <p
                      className={`mt-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                        isDark
                          ? "border-slate-600 bg-slate-800/60 text-slate-200"
                          : "border-slate-200 bg-white/80 text-slate-600"
                      }`}
                    >
                      No notes.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {notesBySection[section].map((item, index) => (
                        <li
                          key={`${section}-${item.dayDate}-${index}`}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium leading-6 ${
                            isDark
                              ? "border-slate-600 bg-slate-800/60 text-slate-100"
                              : "border-slate-200 bg-white/80 text-slate-800"
                          }`}
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

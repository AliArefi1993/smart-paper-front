"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SectionName = "main" | "second" | "learning" | "exercise";

type WeekSummary = {
  start_date: string;
  end_date: string;
  weekly_goal: string;
  weekly_note: string;
  totals: {
    by_section_minutes: Record<SectionName, number>;
    week_total_minutes: number;
  };
  notes_by_section: Record<SectionName, string[]>;
  is_current: boolean;
};

type WeekSummariesResponse = {
  summaries?: WeekSummary[];
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
  if (!Number.isFinite(value) || value < 0) {
    return "00:00";
  }
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function toSafeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizeWeekSummary(week: WeekSummary): WeekSummary {
  const bySection = Object.fromEntries(
    SECTIONS.map((section) => [
      section,
      toSafeNumber(week.totals?.by_section_minutes?.[section]),
    ]),
  ) as Record<SectionName, number>;

  return {
    ...week,
    totals: {
      by_section_minutes: bySection,
      week_total_minutes: toSafeNumber(week.totals?.week_total_minutes),
    },
  };
}

export function WeekSummariesView() {
  const [summaries, setSummaries] = useState<WeekSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showEmptyWeeks, setShowEmptyWeeks] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadSummaries() {
      try {
        const response = await fetch(`${API_BASE_URL}/week-summaries/?span=8`);
        if (!response.ok) {
          throw new Error("Could not load week summaries");
        }
        const payload = (await response.json()) as WeekSummariesResponse;
        if (cancelled) return;
        setSummaries((payload.summaries ?? []).map(normalizeWeekSummary));
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unknown error loading summaries",
        );
      } finally {
        if (cancelled) return;
        setIsLoading(false);
      }
    }

    void loadSummaries();
    return () => {
      cancelled = true;
    };
  }, []);

  const ordered = useMemo(
    () => [...summaries].sort((a, b) => (a.start_date < b.start_date ? 1 : -1)),
    [summaries],
  );
  const visibleSummaries = useMemo(() => {
    if (showEmptyWeeks) {
      return ordered;
    }
    return ordered.filter((week) => week.totals.week_total_minutes > 0 || week.is_current);
  }, [ordered, showEmptyWeeks]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-none flex-col gap-6 px-4 py-6 text-slate-100 md:px-6 xl:px-8">
      <section className="mx-auto flex w-full max-w-[1700px] items-center justify-between rounded-3xl border border-slate-700 bg-slate-900/85 p-5 shadow-sm">
        <div>
          <h1 className="text-3xl font-bold">Weekly Summaries</h1>
          <p className="mt-2 text-sm text-slate-300">
            Overview of multiple weeks in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/finance"
            className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-teal-400 hover:text-teal-200"
          >
            Finance
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-teal-400 hover:text-teal-200"
          >
            Back To Planner
          </Link>
        </div>
      </section>

      {isLoading ? (
        <p className="mx-auto w-full max-w-[1700px] text-slate-300">Loading summaries...</p>
      ) : null}
      {error ? <p className="mx-auto w-full max-w-[1700px] text-rose-400">{error}</p> : null}
      <section className="mx-auto flex w-full max-w-[1700px] items-center justify-end">
        <button
          type="button"
          onClick={() => setShowEmptyWeeks((prev) => !prev)}
          className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-teal-400 hover:text-teal-200"
        >
          {showEmptyWeeks ? "Hide Empty Weeks" : "Show Empty Weeks"}
        </button>
      </section>

      <section className="mx-auto grid w-full max-w-[1700px] gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {visibleSummaries.map((week) => (
          <article
            key={week.start_date}
            className={`rounded-2xl border p-4 shadow-sm ${
              week.is_current
                ? "border-teal-500 bg-teal-950/30"
                : "border-slate-700 bg-slate-900/80"
            }`}
          >
            <h2 className="text-lg font-semibold">
              {formatShamsiWeekRange(week.start_date, week.end_date)}
              {week.is_current ? " (Current)" : ""}
            </h2>
            <p className="mt-2 text-xs text-slate-300">
              Weekly Goal: {week.weekly_goal || "No goal"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Weekly Note: {week.weekly_note || "No note"}
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {SECTIONS.map((section) => (
                <div key={section} className="rounded-xl border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    {SECTION_LABELS[section]}
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-100">
                    {formatMinutes(week.totals.by_section_minutes[section])}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-xl bg-teal-600 p-3 text-white">
              <p className="text-xs uppercase tracking-wide text-teal-100">Total</p>
              <p className="mt-1 text-base font-semibold">
                {formatMinutes(week.totals.week_total_minutes)}
              </p>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

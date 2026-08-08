"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LanguageToggle } from "@/components/language-toggle";
import {
  formatDuration,
  formatNumber,
  formatReadableShamsiDate,
  formatReadableShamsiWeekRange,
} from "@/lib/formatters";
import type { TranslationKey } from "@/lib/i18n";
import { getWeekSummaries } from "@/lib/planner-store";
import { useLanguage } from "@/lib/use-language";
import type { SectionName, WeekSummary } from "@/lib/smart-paper-types";

const SECTIONS: SectionName[] = ["main", "second", "learning", "exercise"];

const SECTION_TRANSLATION_KEYS: Record<SectionName, TranslationKey> = {
  main: "main",
  second: "second",
  learning: "learning",
  exercise: "exercise",
};
const WEEKDAY_TRANSLATION_KEYS: Record<string, TranslationKey> = {
  Saturday: "saturday",
  Sunday: "sunday",
  Monday: "monday",
  Tuesday: "tuesday",
  Wednesday: "wednesday",
  Thursday: "thursday",
  Friday: "friday",
};
const MONTH_OPTIONS = [1, 3, 6, 12];
const DEFAULT_SUMMARY_MONTHS = 6;

function toSafeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function weeksForMonths(months: number): number {
  return Math.ceil((months * 31) / 7);
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
    details_by_section: Object.fromEntries(
      SECTIONS.map((section) => [section, week.details_by_section?.[section] ?? []]),
    ) as WeekSummary["details_by_section"],
  };
}

function hasSummaryContent(week: WeekSummary): boolean {
  if (week.is_current || week.weekly_goal || week.weekly_note) {
    return true;
  }
  if (week.totals.week_total_minutes > 0) {
    return true;
  }
  return SECTIONS.some((section) => (week.details_by_section?.[section] ?? []).length > 0);
}

export function WeekSummariesView() {
  const { language, isPersian, t } = useLanguage();
  const [summaries, setSummaries] = useState<WeekSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showEmptyWeeks, setShowEmptyWeeks] = useState(false);
  const [summaryMonths, setSummaryMonths] = useState(DEFAULT_SUMMARY_MONTHS);

  useEffect(() => {
    let cancelled = false;
    async function loadSummaries() {
      setIsLoading(true);
      setError("");
      try {
        const payload = await getWeekSummaries(weeksForMonths(summaryMonths));
        if (cancelled) return;
        setSummaries((payload.summaries ?? []).map(normalizeWeekSummary));
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("loadingSummaries"),
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
  }, [summaryMonths, t]);

  const ordered = useMemo(
    () => [...summaries].sort((a, b) => (a.start_date < b.start_date ? 1 : -1)),
    [summaries],
  );
  const visibleSummaries = useMemo(() => {
    if (showEmptyWeeks) {
      return ordered;
    }
    return ordered.filter(hasSummaryContent);
  }, [ordered, showEmptyWeeks]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-none flex-col gap-6 px-4 py-6 text-slate-100 md:px-6 xl:px-8">
      <div dir={isPersian ? "rtl" : "ltr"} className="contents">
      <section className="mx-auto flex w-full max-w-[1700px] items-center justify-between rounded-3xl border border-slate-700 bg-slate-900/85 p-5 shadow-sm">
        <div>
          <h1 className="text-3xl font-bold">{t("summaries")}</h1>
          <p className="mt-2 text-sm text-slate-300">
            {t("summaryDescription")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageToggle />
          <Link
            href="/finance"
            className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-teal-400 hover:text-teal-200"
          >
            {t("finance")}
          </Link>
          <Link
            href="/export"
            className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-teal-400 hover:text-teal-200"
          >
            {t("export")}
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-teal-400 hover:text-teal-200"
          >
            {t("backToPlanner")}
          </Link>
        </div>
      </section>

      {isLoading ? (
        <p className="mx-auto w-full max-w-[1700px] text-slate-300">{t("loadingSummaries")}</p>
      ) : null}
      {error ? <p className="mx-auto w-full max-w-[1700px] text-rose-400">{error}</p> : null}
      <section className="mx-auto flex w-full max-w-[1700px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
        <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
          {t("monthsInSummary")}
          <select
            value={summaryMonths}
            onChange={(event) => setSummaryMonths(Number(event.target.value))}
            className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-400"
          >
            {MONTH_OPTIONS.map((months) => (
              <option key={months} value={months}>
                {formatNumber(months, language)}
              </option>
            ))}
          </select>
        </label>

        <p className="text-sm text-slate-400">
          {t("showingLoadedWeeks", {
            visible: formatNumber(visibleSummaries.length, language),
            total: formatNumber(summaries.length, language),
          })}
        </p>

        <button
          type="button"
          onClick={() => setShowEmptyWeeks((prev) => !prev)}
          className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-teal-400 hover:text-teal-200"
        >
          {showEmptyWeeks ? t("hideEmptyWeeks") : t("showEmptyWeeks")}
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
              {formatReadableShamsiWeekRange(week.start_date, week.end_date, language)}
              {week.is_current ? ` (${t("current")})` : ""}
            </h2>
            <p className="mt-2 text-xs text-slate-300">
              {t("weeklyGoal")}: {week.weekly_goal || t("noGoal")}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {t("weeklyNote")}: {week.weekly_note || t("noNote")}
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {SECTIONS.map((section) => (
                <div key={section} className="rounded-xl border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    {t(SECTION_TRANSLATION_KEYS[section])}
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-100">
                    {formatDuration(week.totals.by_section_minutes[section], language)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-xl bg-teal-600 p-3 text-white">
              <p className="text-xs uppercase tracking-wide text-teal-100">{t("total")}</p>
              <p className="mt-1 text-base font-semibold">
                {formatDuration(week.totals.week_total_minutes, language)}
              </p>
            </div>

            {SECTIONS.some((section) => (week.details_by_section?.[section] ?? []).length > 0) ? (
              <div className="mt-4 space-y-3">
                {SECTIONS.map((section) => {
                  const details = week.details_by_section?.[section] ?? [];
                  if (details.length === 0) return null;
                  return (
                    <div key={section} className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        {t(SECTION_TRANSLATION_KEYS[section])} {t("sectionDetails")}
                      </p>
                      <div className="mt-2 space-y-2">
                        {details.map((detail) => (
                          <div
                            key={`${detail.date}-${section}`}
                            className="border-t border-slate-800 pt-2 first:border-t-0 first:pt-0"
                          >
                            <p className="text-xs font-semibold text-slate-200">
                              {isPersian
                                ? t(WEEKDAY_TRANSLATION_KEYS[detail.weekday_name] ?? "saturday")
                                : detail.weekday_name}{" "}
                              {formatReadableShamsiDate(detail.date, language)} -{" "}
                              {formatDuration(detail.duration_minutes, language)}
                            </p>
                            {detail.goal ? (
                              <p className="mt-1 text-xs text-slate-300">
                                {t("goal")}: {detail.goal}
                              </p>
                            ) : null}
                            {detail.note ? (
                              <p className="mt-1 text-xs text-slate-400">
                                {t("note")}: {detail.note}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </article>
        ))}
      </section>
      </div>
    </main>
  );
}

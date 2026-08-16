"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { LanguageToggle } from "@/components/language-toggle";
import {
  formatCompactShamsiWeekRange,
  formatDuration,
  formatNumber,
  formatReadableShamsiDate,
  formatReadableShamsiWeekRange,
} from "@/lib/formatters";
import { activePlannerSections, calculateSectionTotals, SECTION_IDS } from "@/lib/planner-sections";
import {
  getPlannerSections,
  getWeek,
  getWeeks,
  saveWeek as saveWeekData,
} from "@/lib/planner-store";
import type { TranslationKey } from "@/lib/i18n";
import { useLanguage } from "@/lib/use-language";
import type {
  DayData,
  PlannerSection,
  SectionName,
  WeekDetail,
  WeekItem,
  WeekTotals,
} from "@/lib/smart-paper-types";

type ThemeMode = "setup" | "dark";

type ThemeClasses = {
  container: string;
  badge: string;
  title: string;
  line: string;
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

const SECTION_THEME_SETUP: Record<SectionName, ThemeClasses> = {
  slot_1: {
    container: "border-red-200 bg-red-50",
    badge: "bg-red-600 text-white",
    title: "text-red-800",
    line: "border-red-200",
  },
  slot_2: {
    container: "border-blue-200 bg-blue-50",
    badge: "bg-blue-600 text-white",
    title: "text-blue-800",
    line: "border-blue-200",
  },
  slot_3: {
    container: "border-amber-200 bg-amber-50",
    badge: "bg-amber-500 text-amber-950",
    title: "text-amber-900",
    line: "border-amber-200",
  },
  slot_4: {
    container: "border-green-200 bg-green-50",
    badge: "bg-green-600 text-white",
    title: "text-green-800",
    line: "border-green-200",
  },
  slot_5: {
    container: "border-violet-200 bg-violet-50",
    badge: "bg-violet-600 text-white",
    title: "text-violet-800",
    line: "border-violet-200",
  },
  slot_6: {
    container: "border-cyan-200 bg-cyan-50",
    badge: "bg-cyan-600 text-white",
    title: "text-cyan-800",
    line: "border-cyan-200",
  },
  slot_7: {
    container: "border-rose-200 bg-rose-50",
    badge: "bg-rose-600 text-white",
    title: "text-rose-800",
    line: "border-rose-200",
  },
  slot_8: {
    container: "border-lime-200 bg-lime-50",
    badge: "bg-lime-600 text-white",
    title: "text-lime-800",
    line: "border-lime-200",
  },
  slot_9: {
    container: "border-orange-200 bg-orange-50",
    badge: "bg-orange-500 text-orange-950",
    title: "text-orange-900",
    line: "border-orange-200",
  },
  slot_10: {
    container: "border-sky-200 bg-sky-50",
    badge: "bg-sky-600 text-white",
    title: "text-sky-800",
    line: "border-sky-200",
  },
};

const SECTION_THEME_DARK: Record<SectionName, ThemeClasses> = {
  slot_1: {
    container: "border-fuchsia-700/70 bg-slate-900/85",
    badge: "bg-fuchsia-500 text-slate-950",
    title: "text-fuchsia-200",
    line: "border-fuchsia-700/60",
  },
  slot_2: {
    container: "border-cyan-700/70 bg-slate-900/85",
    badge: "bg-cyan-400 text-slate-950",
    title: "text-cyan-200",
    line: "border-cyan-700/60",
  },
  slot_3: {
    container: "border-amber-700/70 bg-slate-900/85",
    badge: "bg-amber-400 text-slate-950",
    title: "text-amber-200",
    line: "border-amber-700/60",
  },
  slot_4: {
    container: "border-emerald-700/70 bg-slate-900/85",
    badge: "bg-emerald-400 text-slate-950",
    title: "text-emerald-200",
    line: "border-emerald-700/60",
  },
  slot_5: {
    container: "border-violet-700/70 bg-slate-900/85",
    badge: "bg-violet-400 text-slate-950",
    title: "text-violet-200",
    line: "border-violet-700/60",
  },
  slot_6: {
    container: "border-sky-700/70 bg-slate-900/85",
    badge: "bg-sky-400 text-slate-950",
    title: "text-sky-200",
    line: "border-sky-700/60",
  },
  slot_7: {
    container: "border-rose-700/70 bg-slate-900/85",
    badge: "bg-rose-400 text-slate-950",
    title: "text-rose-200",
    line: "border-rose-700/60",
  },
  slot_8: {
    container: "border-lime-700/70 bg-slate-900/85",
    badge: "bg-lime-400 text-slate-950",
    title: "text-lime-200",
    line: "border-lime-700/60",
  },
  slot_9: {
    container: "border-orange-700/70 bg-slate-900/85",
    badge: "bg-orange-400 text-slate-950",
    title: "text-orange-200",
    line: "border-orange-700/60",
  },
  slot_10: {
    container: "border-indigo-700/70 bg-slate-900/85",
    badge: "bg-indigo-400 text-slate-950",
    title: "text-indigo-200",
    line: "border-indigo-700/60",
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

type OrderedNoteItem = {
  dayName: string;
  dayDate: string;
  note: string;
};

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function weekOffsetFromCurrent(week: WeekItem): number {
  const start = parseIsoDate(week.start_date);
  const today = new Date();
  const daysSinceSaturday = (today.getDay() + 1) % 7;
  today.setDate(today.getDate() - daysSinceSaturday);
  today.setHours(0, 0, 0, 0);
  return Math.round((start.getTime() - today.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export function WeeklyPlanner() {
  const { language, isPersian, t } = useLanguage();
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [weeks, setWeeks] = useState<WeekItem[]>([]);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>("");
  const [activeDayDate, setActiveDayDate] = useState<string>("");
  const [pendingWeekStart, setPendingWeekStart] = useState<string | null>(null);
  const [weekDetail, setWeekDetail] = useState<WeekDetail | null>(null);
  const [plannerSections, setPlannerSections] = useState<PlannerSection[]>([]);
  const [isLoadingWeeks, setIsLoadingWeeks] = useState(true);
  const [isLoadingWeek, setIsLoadingWeek] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const isDark = themeMode === "dark";
  const sectionTheme = isDark ? SECTION_THEME_DARK : SECTION_THEME_SETUP;
  const activeSections = useMemo(
    () => activePlannerSections(weekDetail?.planner_sections ?? plannerSections),
    [plannerSections, weekDetail],
  );
  const panelClass = isDark
    ? "border-slate-700 bg-slate-900/92 text-slate-100 shadow-slate-950/30"
    : "border-slate-200 bg-white/95 text-slate-900 shadow-cyan-900/5";
  const mutedPanelClass = isDark
    ? "border-slate-700 bg-slate-800/78 text-slate-100"
    : "border-slate-200 bg-slate-50 text-slate-900";
  const inputClass = isDark
    ? "w-full min-h-10 rounded-lg border border-slate-500 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-2 ring-transparent placeholder:text-slate-400 focus:border-teal-300 focus:ring-teal-400/60"
    : "w-full min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-2 ring-transparent placeholder:text-slate-500 focus:border-teal-600 focus:ring-teal-500/35";
  const pageClass = isDark
    ? "bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100"
    : "bg-gradient-to-b from-cyan-50 via-slate-50 to-emerald-50 text-slate-900";
  const navigationLinkClass = isDark
    ? "border-slate-600 bg-slate-800 text-slate-100 hover:border-teal-400 hover:bg-slate-700 hover:text-teal-200 active:bg-slate-700"
    : "border-slate-300 bg-white text-slate-800 hover:border-teal-500 hover:text-teal-700 active:bg-slate-100";
  const segmentShellClass = isDark
    ? "border-slate-600 bg-slate-950/80"
    : "border-slate-300 bg-slate-100";

  function formatWeekChoiceLabel(week: WeekItem): string {
    const offset = weekOffsetFromCurrent(week);
    if (offset === 0) return t("currentWeek");
    if (offset === -1) return t("previousWeek");
    if (offset === 1) return t("nextWeek");
    if (offset < 0) {
      return t("weeksAgo", { count: formatNumber(Math.abs(offset), language) });
    }
    return t("weeksAhead", { count: formatNumber(offset, language) });
  }

  async function fetchWeek(startDate: string) {
    setMessage("");
    setError("");
    try {
      const payload = await getWeek(startDate);
      setPlannerSections(payload.planner_sections);
      setWeekDetail(payload);
      setHasUnsavedChanges(false);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : t("loadingSelectedWeek"),
      );
    } finally {
      setIsLoadingWeek(false);
    }
  }

  function loadWeek(startDate: string): void {
    setSelectedWeekStart(startDate);
    setActiveDayDate("");
    setPendingWeekStart(null);
    setIsLoadingWeek(true);
    void fetchWeek(startDate);
  }

  async function saveWeek(): Promise<boolean> {
    if (!weekDetail) return false;

    setIsSaving(true);
    setMessage("");
    setError("");
    try {
      const payload = await saveWeekData(weekDetail);
      setWeekDetail(payload);
      setHasUnsavedChanges(false);
      setMessage(t("savedSuccessfully"));
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("saveWeek"));
      return false;
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
        const [weeksPayload, sectionsPayload] = await Promise.all([
          getWeeks(8),
          getPlannerSections(),
        ]);

        if (cancelled) return;

        setWeeks(weeksPayload.weeks);
        setPlannerSections(sectionsPayload);
        setSelectedWeekStart(weeksPayload.current_week_start);
        setIsLoadingWeeks(false);
        setIsLoadingWeek(true);

        const weekPayload = await getWeek(weeksPayload.current_week_start);
        if (cancelled) return;

        setWeekDetail(weekPayload);
        setHasUnsavedChanges(false);
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

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const totals = useMemo(() => {
    if (!weekDetail) return null;
    return weekDetail.totals;
  }, [weekDetail]);

  const notesBySection = useMemo(() => {
    const empty = SECTION_IDS.reduce(
      (acc, section) => ({
        ...acc,
        [section]: [],
      }),
      {} as Record<SectionName, OrderedNoteItem[]>,
    );
    if (!weekDetail) return empty;

    for (const day of weekDetail.days) {
      for (const { id: section } of activeSections) {
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
  }, [activeSections, weekDetail]);

  function updateDuration(dayDate: string, section: SectionName, value: number): void {
    const nextDuration = Number.isFinite(value) ? Math.max(0, value) : 0;
    setHasUnsavedChanges(true);
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
              duration_minutes: nextDuration,
            },
          },
        };
      });

      return {
        ...previous,
        days: nextDays,
        totals: calculateTotals(nextDays, activeSections),
      };
    });
  }

  function updateDurationInput(dayDate: string, section: SectionName, value: string): void {
    const parsedValue = Number.parseInt(value, 10);
    updateDuration(dayDate, section, Number.isFinite(parsedValue) ? parsedValue : 0);
  }

  function adjustDuration(dayDate: string, section: SectionName, delta: number): void {
    const currentDay = weekDetail?.days.find((day) => day.date === dayDate);
    const currentMinutes = currentDay?.sections[section].duration_minutes ?? 0;
    updateDuration(dayDate, section, currentMinutes + delta);
  }

  function updateNote(dayDate: string, section: SectionName, note: string): void {
    setHasUnsavedChanges(true);
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
    setHasUnsavedChanges(true);
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
    setHasUnsavedChanges(true);
    setWeekDetail((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        weekly_goal: goal,
      };
    });
  }

  function updateWeeklyNote(note: string): void {
    setHasUnsavedChanges(true);
    setWeekDetail((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        weekly_note: note,
      };
    });
  }

  function handleWeekSelect(startDate: string): void {
    if (startDate === selectedWeekStart || isSaving || isLoadingWeek) return;
    if (hasUnsavedChanges) {
      setPendingWeekStart(startDate);
      return;
    }

    loadWeek(startDate);
  }

  async function saveAndSwitchWeek(): Promise<void> {
    const nextWeekStart = pendingWeekStart;
    if (!nextWeekStart) return;

    const saved = await saveWeek();
    if (!saved) return;
    loadWeek(nextWeekStart);
  }

  function discardAndSwitchWeek(): void {
    const nextWeekStart = pendingWeekStart;
    if (!nextWeekStart) return;
    setHasUnsavedChanges(false);
    loadWeek(nextWeekStart);
  }

  function cancelWeekSwitch(): void {
    setPendingWeekStart(null);
  }

  function resolvedActiveDayDate(): string {
    if (!weekDetail) return "";
    if (weekDetail.days.some((day) => day.date === activeDayDate)) return activeDayDate;

    const todayIso = new Date().toISOString().slice(0, 10);
    const todayInWeek = weekDetail.days.find((day) => day.date === todayIso);
    return todayInWeek?.date ?? weekDetail.days[0]?.date ?? "";
  }

  function dayTotalMinutes(day: DayData): number {
    return activeSections.reduce(
      (total, section) => total + day.sections[section.id].duration_minutes,
      0,
    );
  }

  function dayHasDetails(day: DayData): boolean {
    return activeSections.some((section) => {
      const data = day.sections[section.id];
      return Boolean(data.duration_minutes || data.goal.trim() || data.note.trim());
    });
  }

  function saveStatusText(): string {
    if (error) return error;
    if (isSaving) return t("saving");
    if (hasUnsavedChanges) return t("unsavedChanges");
    return message || t("allChangesSaved");
  }

  function saveStatusClass(): string {
    if (error) return isDark ? "text-rose-300" : "text-rose-700";
    if (hasUnsavedChanges) return isDark ? "text-amber-200" : "text-amber-700";
    return isDark ? "text-emerald-300" : "text-emerald-700";
  }

  async function saveAndGoToNextDay(): Promise<void> {
    if (!weekDetail) return;

    const saved = await saveWeek();
    if (!saved) return;

    const currentIndex = weekDetail.days.findIndex((day) => day.date === activeDate);
    const nextDay = weekDetail.days[Math.min(currentIndex + 1, weekDetail.days.length - 1)];
    if (nextDay) setActiveDayDate(nextDay.date);
  }

  function handlePlannerNavigation(event: MouseEvent<HTMLAnchorElement>): void {
    if (!hasUnsavedChanges) return;
    if (window.confirm(t("leaveWithUnsavedChanges"))) return;
    event.preventDefault();
  }

  function renderSaveWeekButton(className = "", compact = false) {
    return (
      <button
        type="button"
        onClick={() => void saveWeek()}
        disabled={!weekDetail || isSaving}
        className={`rounded-xl bg-teal-600 font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400 ${
          compact ? "px-3 py-2 text-xs" : "px-4 py-2 text-sm"
        } ${className}`}
      >
        {isSaving ? t("saving") : t("saveWeek")}
      </button>
    );
  }

  function renderFieldLabel(label: string, helper?: string) {
    return (
      <span className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase text-current opacity-75">
        <span>{label}</span>
        {helper ? <span className="font-medium normal-case opacity-75">{helper}</span> : null}
      </span>
    );
  }

  const activeDate = resolvedActiveDayDate();

  return (
    <main
      dir={isPersian ? "rtl" : "ltr"}
      className={`mx-auto flex min-h-screen w-full max-w-none flex-col gap-6 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 transition-colors md:px-6 md:pb-6 xl:px-8 ${pageClass}`}
    >
      <section
        className={`mx-auto w-full max-w-[1700px] rounded-3xl border p-5 shadow-sm backdrop-blur ${panelClass}`}
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold">{t("weeklySmartPaper")}</h1>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <LanguageToggle tone={isDark ? "dark" : "light"} />
            <Link
              href="/summaries"
              onClick={handlePlannerNavigation}
              className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-semibold transition ${navigationLinkClass}`}
            >
              {t("summaries")}
            </Link>
            <Link
              href="/finance"
              onClick={handlePlannerNavigation}
              className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-semibold transition ${navigationLinkClass}`}
            >
              {t("finance")}
            </Link>
            <Link
              href="/export"
              onClick={handlePlannerNavigation}
              className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-semibold transition ${navigationLinkClass}`}
            >
              {t("export")}
            </Link>
            <Link
              href="/settings"
              onClick={handlePlannerNavigation}
              className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-semibold transition ${navigationLinkClass}`}
            >
              {t("settings")}
            </Link>
            <div className={`col-span-2 flex min-h-10 items-center gap-1 rounded-full border p-1 sm:col-span-1 ${segmentShellClass}`}>
            <button
              type="button"
              onClick={() => setThemeMode("setup")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                themeMode === "setup"
                  ? "bg-teal-600 text-white shadow-sm"
                  : isDark
                    ? "text-slate-200 hover:bg-slate-700"
                    : "text-slate-700 hover:bg-white"
              }`}
            >
              {t("focusMode")}
            </button>
            <button
              type="button"
              onClick={() => setThemeMode("dark")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                themeMode === "dark"
                  ? "bg-slate-100 text-slate-950 shadow-sm"
                  : isDark
                    ? "text-slate-200 hover:bg-slate-700"
                    : "text-slate-700 hover:bg-white"
              }`}
            >
              {t("darkMode")}
            </button>
            </div>
          </div>
        </div>
        <p className={`mt-2 text-sm ${isDark ? "text-slate-300" : "text-slate-600"}`}>
          {t("summaryDescription")}
        </p>
        <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          {t("durationInputMinutes")}
        </p>
      </section>

      <section
        className={`mx-auto w-full max-w-[1700px] rounded-3xl border p-4 shadow-sm ${panelClass}`}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2
            className={`text-sm font-semibold uppercase ${
              isDark ? "text-slate-400" : "text-slate-500"
            }`}
          >
            {t("weeks")}
          </h2>
          {totals ? (
            <span className={`text-xs font-semibold ${isDark ? "text-teal-200" : "text-teal-700"}`}>
              {formatDuration(totals.week_total_minutes, language)}
            </span>
          ) : null}
        </div>
        {isLoadingWeeks ? (
          <p className={isDark ? "text-slate-300" : "text-slate-600"}>{t("loadingWeeks")}</p>
        ) : (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:px-0 xl:grid-cols-5">
            {weeks.map((week) => {
              const isSelected = week.start_date === selectedWeekStart;
              return (
                <button
                  type="button"
                  key={week.start_date}
                  onClick={() => handleWeekSelect(week.start_date)}
                  className={`min-h-16 min-w-40 rounded-xl border px-4 py-3 text-start text-xs transition md:min-w-0 ${
                    isSelected
                      ? isDark
                        ? "border-teal-500 bg-teal-500 text-slate-950 shadow-lg shadow-teal-950/40"
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
                  <span className="block text-sm font-bold">
                    {formatWeekChoiceLabel(week)}
                  </span>
                  <span className="mt-1 block text-[11px] leading-5 opacity-85">
                    {formatCompactShamsiWeekRange(week.start_date, week.end_date, language)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className={`rounded-3xl border p-4 shadow-sm ${panelClass}`}>
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              {weekDetail
                ? formatReadableShamsiWeekRange(
                    weekDetail.start_date,
                    weekDetail.end_date,
                    language,
                  )
                : t("weekDetails")}
            </h2>
            <p className={`mt-1 text-sm font-medium ${saveStatusClass()}`}>
              {saveStatusText()}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {totals ? (
              <>
                {activeSections.map((section) => (
                  <span
                    key={section.id}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${sectionTheme[section.id].container}`}
                  >
                    {section.label}:{" "}
                    {formatDuration(totals.by_section_minutes[section.id], language)}
                  </span>
                ))}
                <span className="rounded-full bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white">
                  {t("total")}: {formatDuration(totals.week_total_minutes, language)}
                </span>
              </>
            ) : null}
            {renderSaveWeekButton("hidden md:inline-flex")}
          </div>
        </div>

        {isLoadingWeek ? (
          <div className="grid gap-3 md:grid-cols-2">
            {activeSections.map((section) => (
              <div
                key={section.id}
                className={`h-24 animate-pulse rounded-2xl border ${
                  isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-100"
                }`}
              />
            ))}
          </div>
        ) : null}

        {weekDetail ? (
          <div className="space-y-4">
            <article
              className={`mx-auto w-full max-w-[1500px] rounded-2xl border p-4 ${mutedPanelClass}`}
            >
              <h3 className="mb-3 text-base font-semibold">{t("weekGoal")}</h3>
              <div className="grid gap-3 lg:grid-cols-2">
                <label className="block">
                  {renderFieldLabel(t("weeklyGoal"))}
                  <textarea
                    value={weekDetail.weekly_goal}
                    onChange={(event) => updateWeeklyGoal(event.target.value)}
                    onKeyDown={handleTextareaEnterToSave}
                    placeholder={t("writeMainGoalForWeek")}
                    rows={3}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  {renderFieldLabel(t("weeklyNote"))}
                  <textarea
                    value={weekDetail.weekly_note}
                    onChange={(event) => updateWeeklyNote(event.target.value)}
                    onKeyDown={handleTextareaEnterToSave}
                    placeholder={t("writeExtraWeeklyNote")}
                    rows={3}
                    className={inputClass}
                  />
                </label>
              </div>
            </article>

            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              <div
                className={`-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden ${
                  isPersian ? "flex-row-reverse" : ""
                }`}
              >
                {weekDetail.days.map((day) => {
                  const isActiveDay = day.date === activeDate;
                  const dayHasContent = dayHasDetails(day);
                  return (
                    <button
                      key={`mobile-day-${day.date}`}
                      type="button"
                      onClick={() => setActiveDayDate(day.date)}
                      className={`min-w-28 rounded-xl border px-3 py-2 text-start transition ${
                        isActiveDay
                          ? isDark
                            ? "border-teal-400 bg-teal-500 text-slate-950"
                            : "border-teal-600 bg-teal-600 text-white"
                          : isDark
                            ? "border-slate-700 bg-slate-900 text-slate-200"
                            : "border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      <span className="block text-xs font-bold">
                        {t(WEEKDAY_TRANSLATION_KEYS[day.weekday_name] ?? "saturday")}
                      </span>
                      <span className="mt-1 block text-[11px] opacity-80">
                        {formatDuration(dayTotalMinutes(day), language)}
                      </span>
                      <span
                        className={`mt-1 block h-1.5 w-1.5 rounded-full ${
                          dayHasContent
                            ? isActiveDay
                              ? "bg-white"
                              : "bg-emerald-500"
                            : isDark
                              ? "bg-slate-600"
                              : "bg-slate-300"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
              {weekDetail.days.map((day) => {
                const dayTotal = dayTotalMinutes(day);
                const isActiveDay = day.date === activeDate;
                const dayHasContent = dayHasDetails(day);
                return (
                  <article
                    key={day.date}
                    className={`rounded-2xl border p-4 ${
                      isActiveDay
                        ? isDark
                          ? "border-teal-500 bg-slate-900 text-slate-100"
                          : "border-teal-500 bg-white text-slate-900"
                        : mutedPanelClass
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveDayDate(day.date)}
                      className={`flex w-full items-center justify-between gap-3 border-b pb-3 text-start ${
                        isDark ? "border-slate-700" : "border-slate-200"
                      }`}
                      aria-expanded={isActiveDay}
                    >
                      <span>
                        <span className="block text-base font-semibold">
                          {t(WEEKDAY_TRANSLATION_KEYS[day.weekday_name] ?? "saturday")}
                        </span>
                        <span className={`mt-1 block text-xs ${isDark ? "text-slate-300" : "text-slate-500"}`}>
                          {formatReadableShamsiDate(day.date, language)}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="rounded-full bg-teal-600 px-3 py-1 text-xs font-semibold text-white">
                          {formatDuration(dayTotal, language)}
                        </span>
                        <span className={`text-[11px] font-medium ${dayHasContent ? "text-emerald-500" : isDark ? "text-slate-400" : "text-slate-500"}`}>
                          {dayHasContent ? t("sectionDetails") : t("noNotesYet")}
                        </span>
                      </span>
                    </button>

                    <div className={`mt-3 space-y-3 ${isActiveDay ? "block" : "hidden lg:block"}`}>
                      {activeSections.map((section) => {
                        const sectionData = day.sections[section.id];
                        return (
                          <div
                            key={section.id}
                            className={`rounded-xl border p-3 shadow-sm ${sectionTheme[section.id].container}`}
                          >
                            <div className="mb-3 flex items-center justify-between gap-2">
                              <span
                                className={`rounded-full px-2 py-1 text-[11px] font-semibold ${sectionTheme[section.id].badge}`}
                              >
                                {section.label}
                              </span>
                              <span className={`text-xs font-semibold ${sectionTheme[section.id].title}`}>
                                {formatDuration(sectionData.duration_minutes, language)}
                              </span>
                            </div>
                            <div className="grid gap-3">
                              <label className="block">
                                {renderFieldLabel(t("minutes"))}
                                <input
                                  value={
                                    sectionData.duration_minutes
                                      ? String(sectionData.duration_minutes)
                                      : ""
                                  }
                                  onChange={(event) =>
                                    updateDurationInput(day.date, section.id, event.target.value)
                                  }
                                  onKeyDown={handleEnterToSave}
                                  type="number"
                                  min={0}
                                  inputMode="numeric"
                                  placeholder={t("minutes")}
                                  className={`${inputClass} text-base font-semibold`}
                                />
                              </label>
                              <div className="grid grid-cols-4 gap-2">
                                {[15, 30, 60].map((minutes) => (
                                  <button
                                    key={minutes}
                                    type="button"
                                    onClick={() => adjustDuration(day.date, section.id, minutes)}
                                    className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                                      isDark
                                        ? "border-slate-600 bg-slate-950/70 text-slate-100 hover:border-teal-400"
                                        : "border-slate-300 bg-white text-slate-700 hover:border-teal-500"
                                    }`}
                                  >
                                    +{formatNumber(minutes, language)}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => updateDuration(day.date, section.id, 0)}
                                  className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                                    isDark
                                      ? "border-slate-600 bg-slate-950/70 text-slate-100 hover:border-rose-400"
                                      : "border-slate-300 bg-white text-slate-700 hover:border-rose-400"
                                  }`}
                                >
                                  {formatNumber(0, language)}
                                </button>
                              </div>
                              <label className="block">
                                {renderFieldLabel(t("goal"))}
                                <input
                                  value={sectionData.goal}
                                  onChange={(event) =>
                                    updateSectionGoal(day.date, section.id, event.target.value)
                                  }
                                  onKeyDown={handleEnterToSave}
                                  placeholder={t("goalForSection")}
                                  className={inputClass}
                                />
                              </label>
                              <label className="block">
                                {renderFieldLabel(t("note"))}
                                <textarea
                                  value={sectionData.note}
                                  onChange={(event) =>
                                    updateNote(day.date, section.id, event.target.value)
                                  }
                                  onKeyDown={handleTextareaEnterToSave}
                                  placeholder={t("writeShortNote")}
                                  rows={2}
                                  className={inputClass}
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      {totals ? (
        <section
          className={`mx-auto w-full max-w-[1600px] rounded-3xl border p-4 shadow-sm ${panelClass}`}
        >
          <h2 className="mb-3 text-lg font-semibold">{t("weekTotals")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {activeSections.map((section) => (
              <div
                key={section.id}
                className={`rounded-xl border p-3 ${sectionTheme[section.id].container}`}
              >
                <p
                  className={`text-xs uppercase tracking-wide font-semibold ${sectionTheme[section.id].title}`}
                >
                  {section.label}
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {formatDuration(totals.by_section_minutes[section.id], language)}
                </p>
                <div className={`mt-3 border-t pt-2 ${sectionTheme[section.id].line}`}>
                  <p
                    className={`text-xs uppercase tracking-wide font-semibold ${
                      isDark ? "text-slate-300" : "text-slate-500"
                    }`}
                  >
                    {t("notes")}
                  </p>
                  {notesBySection[section.id].length === 0 ? (
                    <p
                      className={`mt-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                        isDark
                          ? "border-slate-600 bg-slate-800/60 text-slate-200"
                          : "border-slate-200 bg-white/80 text-slate-600"
                      }`}
                    >
                      {t("noNotesYet")}
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {notesBySection[section.id].map((item, index) => (
                        <li
                          key={`${section.id}-${item.dayDate}-${index}`}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium leading-6 ${
                            isDark
                              ? "border-slate-600 bg-slate-800/60 text-slate-100"
                              : "border-slate-200 bg-white/80 text-slate-800"
                          }`}
                        >
                          {isPersian
                            ? t(WEEKDAY_TRANSLATION_KEYS[item.dayName] ?? "saturday")
                            : WEEKDAY_SHORT[item.dayName] ?? item.dayName}
                          : {item.note}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
            <div className="rounded-xl bg-teal-600 p-3 text-white">
              <p className="text-xs uppercase tracking-wide text-teal-100">{t("total")}</p>
              <p className="mt-1 text-lg font-semibold">
                {formatDuration(totals.week_total_minutes, language)}
              </p>
            </div>
          </div>
        </section>
      ) : null}
      {weekDetail ? (
        <div
          className={`fixed inset-x-0 bottom-0 z-30 border-t px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl md:hidden ${
            isDark
              ? "border-slate-700 bg-slate-950/95"
              : "border-slate-200 bg-white/95"
          }`}
        >
          <div className="mx-auto grid max-w-md gap-2">
            <p
              className={`min-w-0 text-xs font-medium ${saveStatusClass()}`}
            >
              {saveStatusText()}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void saveAndGoToNextDay()}
                disabled={!weekDetail || isSaving}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  isDark
                    ? "border-slate-600 bg-slate-900 text-slate-100 hover:border-teal-400"
                    : "border-slate-300 bg-white text-slate-700 hover:border-teal-500"
                }`}
              >
                {t("saveAndNextDay")}
              </button>
              {renderSaveWeekButton("w-full px-4", true)}
            </div>
          </div>
        </div>
      ) : null}
      {pendingWeekStart ? (
        <div className="fixed inset-0 z-40 flex items-end bg-slate-950/60 px-4 py-4 sm:items-center sm:justify-center">
          <div className={`w-full max-w-md rounded-2xl border p-4 shadow-2xl ${panelClass}`}>
            <h2 className="text-lg font-semibold">{t("unsavedWeekTitle")}</h2>
            <p className={`mt-2 text-sm leading-6 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              {t("unsavedWeekDescription")}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => void saveAndSwitchWeek()}
                disabled={isSaving}
                className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSaving ? t("saving") : t("saveAndSwitch")}
              </button>
              <button
                type="button"
                onClick={discardAndSwitchWeek}
                disabled={isSaving}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  isDark
                    ? "border-rose-500/70 bg-slate-900 text-rose-200 hover:bg-rose-950/40"
                    : "border-rose-300 bg-white text-rose-700 hover:bg-rose-50"
                }`}
              >
                {t("discardChanges")}
              </button>
              <button
                type="button"
                onClick={cancelWeekSwitch}
                disabled={isSaving}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  isDark
                    ? "border-slate-600 bg-slate-900 text-slate-100 hover:border-teal-400"
                    : "border-slate-300 bg-white text-slate-700 hover:border-teal-500"
                }`}
              >
                {t("keepEditing")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function calculateTotals(days: DayData[], sections: PlannerSection[]): WeekTotals {
  return calculateSectionTotals(
    days,
    sections.filter((section) => section.active).map((section) => section.id),
  );
}

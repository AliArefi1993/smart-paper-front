"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { GrowingTextarea } from "@/components/growing-textarea";
import { AppearanceToggle } from "@/components/appearance-toggle";
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
  getWeekTemplates,
  getWeek,
  getWeeks,
  deleteWeekTemplate,
  saveWeekTemplate,
  saveWeek as saveWeekData,
} from "@/lib/planner-store";
import { syncMorningPlanNotification } from "@/lib/notifications";
import type { TranslationKey } from "@/lib/i18n";
import { useLanguage } from "@/lib/use-language";
import { useTheme } from "@/lib/use-theme";
import type {
  DayData,
  PlannerSection,
  ScheduleEntry,
  SectionName,
  WeekDetail,
  WeekItem,
  WeekTemplate,
  WeekTotals,
} from "@/lib/smart-paper-types";

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
    container: "border-teal-200 bg-teal-50",
    badge: "bg-teal-700 text-white",
    title: "text-teal-900",
    line: "border-teal-200",
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

type ScheduleDraft = {
  dayDate: string;
  id?: string;
  start_time: string;
  end_time: string;
  title: string;
  note: string;
  section_id: SectionName | "";
};

type WritingView = {
  dayDate: string;
  sectionId: SectionName;
  field: "goal" | "note";
};

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function createScheduleEntryId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `schedule-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  const themeMode = useTheme();
  const [weeks, setWeeks] = useState<WeekItem[]>([]);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>("");
  const [activeDayDate, setActiveDayDate] = useState<string>("");
  const [pendingWeekStart, setPendingWeekStart] = useState<string | null>(null);
  const [weekDetail, setWeekDetail] = useState<WeekDetail | null>(null);
  const [plannerSections, setPlannerSections] = useState<PlannerSection[]>([]);
  const [weekTemplates, setWeekTemplates] = useState<WeekTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [isTemplateSheetOpen, setIsTemplateSheetOpen] = useState(false);
  const [isLoadingWeeks, setIsLoadingWeeks] = useState(true);
  const [isLoadingWeek, setIsLoadingWeek] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [openSection, setOpenSection] = useState<{ dayDate: string; sectionId: SectionName } | null>(null);
  const [writingView, setWritingView] = useState<WritingView | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);
  const [scheduleError, setScheduleError] = useState("");
  const weekRailRef = useRef<HTMLDivElement>(null);
  const sectionButtonsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const writingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const writingDoneRef = useRef<HTMLButtonElement | null>(null);
  const writingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editRevisionRef = useRef(0);
  const isDark = themeMode === "dark";
  const sectionTheme = isDark ? SECTION_THEME_DARK : SECTION_THEME_SETUP;
  const activeSections = useMemo(
    () => activePlannerSections(weekDetail?.planner_sections ?? plannerSections),
    [plannerSections, weekDetail],
  );
  const panelClass = isDark
    ? "border-slate-700 bg-slate-900/92 text-slate-100 shadow-slate-950/30"
    : "border-[#d9e4de] bg-white text-[#172b29] shadow-slate-900/5";
  const mutedPanelClass = isDark
    ? "border-slate-700 bg-slate-800/78 text-slate-100"
    : "border-[#d9e4de] bg-[#f1f5f2] text-[#172b29]";
  const inputClass = isDark
    ? "w-full min-h-10 rounded-lg border border-slate-500 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-2 ring-transparent placeholder:text-slate-400 focus:border-teal-300 focus:ring-teal-400/60"
    : "w-full min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-2 ring-transparent placeholder:text-slate-500 focus:border-teal-600 focus:ring-teal-500/35";
  const pageClass = isDark
    ? "bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100"
    : "bg-[#f7f8f5] text-[#172b29]";
  const navigationLinkClass = isDark
    ? "border-slate-600 bg-slate-800 text-slate-100 hover:border-teal-400 hover:bg-slate-700 hover:text-teal-200 active:bg-slate-700"
    : "border-[#d9e4de] bg-white text-[#172b29] hover:border-teal-700 hover:text-teal-800 active:bg-[#f1f5f2]";

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
    setSaveFailed(false);
    try {
      const payload = await getWeek(startDate);
      setPlannerSections(payload.planner_sections);
      setWeekDetail(payload);
      void syncMorningPlanNotification(payload, {
        title: t("todayPlan"),
        fallbackBody: t("notificationDescription"),
      });
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
    setOpenSection(null);
    setWritingView(null);
    setPendingWeekStart(null);
    setIsLoadingWeek(true);
    void fetchWeek(startDate);
  }

  async function saveWeek(): Promise<boolean> {
    if (!weekDetail || isSaving) return false;

    const savingRevision = editRevisionRef.current;
    setIsSaving(true);
    setSaveFailed(false);
    setMessage("");
    setError("");
    try {
      const payload = await saveWeekData(weekDetail);
      const noNewEdits = editRevisionRef.current === savingRevision;
      if (noNewEdits) setWeekDetail(payload);
      void syncMorningPlanNotification(payload, {
        title: t("todayPlan"),
        fallbackBody: t("notificationDescription"),
      });
      setHasUnsavedChanges(!noNewEdits);
      setMessage(noNewEdits ? t("savedSuccessfully") : "");
      return noNewEdits;
    } catch (saveError) {
      setSaveFailed(true);
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
    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    if (isSaving) return;
    void saveWeek();
  }

  function markChanged(): void {
    editRevisionRef.current += 1;
    setHasUnsavedChanges(true);
    setSaveFailed(false);
    setError("");
  }

  function toggleSection(dayDate: string, sectionId: SectionName): void {
    const wasOpen = openSection?.dayDate === dayDate && openSection.sectionId === sectionId;
    setOpenSection(wasOpen ? null : { dayDate, sectionId });
    if (wasOpen) return;
    requestAnimationFrame(() => {
      const button = sectionButtonsRef.current[`${dayDate}-${sectionId}`];
      button?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      });
      button?.focus({ preventScroll: true });
    });
  }

  function openWritingView(view: WritingView, trigger: HTMLButtonElement): void {
    writingTriggerRef.current = trigger;
    setWritingView(view);
  }

  function closeWritingView(): void {
    setWritingView(null);
    requestAnimationFrame(() => writingTriggerRef.current?.focus({ preventScroll: true }));
  }

  function handleWritingKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeWritingView();
    } else if (event.key === "Tab") {
      const atDone = document.activeElement === writingDoneRef.current;
      const atText = document.activeElement === writingTextareaRef.current;
      if ((event.shiftKey && atDone) || (!event.shiftKey && atText)) {
        event.preventDefault();
        (atDone ? writingTextareaRef : writingDoneRef).current?.focus();
      }
    }
  }

  useEffect(() => {
    if (writingView) writingTextareaRef.current?.focus();
  }, [writingView]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      try {
        const [weeksPayload, sectionsPayload, templatesPayload] = await Promise.all([
          getWeeks(8),
          getPlannerSections(),
          getWeekTemplates(),
        ]);

        if (cancelled) return;

        setWeeks(weeksPayload.weeks);
        setPlannerSections(sectionsPayload);
        setWeekTemplates(templatesPayload);
        setSelectedWeekStart(weeksPayload.current_week_start);
        setIsLoadingWeeks(false);
        setIsLoadingWeek(true);

        const weekPayload = await getWeek(weeksPayload.current_week_start);
        if (cancelled) return;

        setWeekDetail(weekPayload);
        void syncMorningPlanNotification(weekPayload, {
          title: t("todayPlan"),
          fallbackBody: t("notificationDescription"),
        });
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
  }, [t]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    function keepPageAtHorizontalOrigin() {
      if (Math.abs(window.scrollX) > 1 || Math.abs(document.documentElement.scrollLeft) > 1) {
        window.scrollTo(0, window.scrollY);
      }
    }

    keepPageAtHorizontalOrigin();
    window.addEventListener("pageshow", keepPageAtHorizontalOrigin);
    window.addEventListener("scroll", keepPageAtHorizontalOrigin, { passive: true });
    return () => {
      window.removeEventListener("pageshow", keepPageAtHorizontalOrigin);
      window.removeEventListener("scroll", keepPageAtHorizontalOrigin);
    };
  }, []);

  useEffect(() => {
    if (!selectedWeekStart || !weekRailRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      const rail = weekRailRef.current;
      const selectedButton = rail?.querySelector<HTMLButtonElement>(
        '[data-selected-week="true"]',
      );
      if (!rail || !selectedButton) return;

      const railRect = rail.getBoundingClientRect();
      const buttonRect = selectedButton.getBoundingClientRect();
      rail.scrollLeft += buttonRect.left - railRect.left - (railRect.width - buttonRect.width) / 2;
      if (Math.abs(window.scrollX) > 1) window.scrollTo(0, window.scrollY);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedWeekStart, weeks, isPersian]);

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
    markChanged();
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
    markChanged();
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

  function updateDayNote(dayDate: string, dayNote: string): void {
    markChanged();
    setWeekDetail((previous) => {
      if (!previous) return previous;

      return {
        ...previous,
        days: previous.days.map((day) =>
          day.date === dayDate ? { ...day, day_note: dayNote } : day,
        ),
      };
    });
  }

  function updateSectionGoal(dayDate: string, section: SectionName, goal: string): void {
    markChanged();
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
    markChanged();
    setWeekDetail((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        weekly_goal: goal,
      };
    });
  }

  function updateWeeklyNote(note: string): void {
    markChanged();
    setWeekDetail((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        weekly_note: note,
      };
    });
  }

  function applyWeekTemplate(template: WeekTemplate): void {
    if (!window.confirm(t("templateApplyConfirm"))) return;
    markChanged();
    setWeekDetail((previous) =>
      previous
        ? {
            ...previous,
            weekly_goal: template.weekly_goal,
            weekly_note: template.weekly_note,
            days: previous.days.map((day) => {
              const templateDay = template.days.find(
                (item) => item.weekday_index === day.weekday_index,
              );
              if (!templateDay) return day;
              return {
                ...day,
                day_note: templateDay.day_note,
                sections: Object.fromEntries(
                  SECTION_IDS.map((sectionId) => [
                    sectionId,
                    templateDay.sections[sectionId] ?? day.sections[sectionId],
                  ]),
                ) as DayData["sections"],
                schedule_entries: templateDay.schedule_entries.map((entry, index) => ({
                  ...entry,
                  id: createScheduleEntryId(),
                  order: index,
                })),
              };
            }),
          }
        : previous,
    );
    setIsTemplateSheetOpen(false);
  }

  async function saveCurrentWeekAsTemplate(): Promise<void> {
    if (!weekDetail) return;
    if (!templateName.trim()) {
      setError(t("templateNameRequired"));
      return;
    }

    try {
      const templates = await saveWeekTemplate({
        name: templateName,
        weekly_goal: weekDetail.weekly_goal,
        weekly_note: weekDetail.weekly_note,
        days: weekDetail.days.map((day) => ({
          weekday_index: day.weekday_index,
          day_note: day.day_note,
          sections: Object.fromEntries(
            SECTION_IDS.map((sectionId) => [sectionId, day.sections[sectionId]]),
          ),
          schedule_entries: day.schedule_entries.map((entry) => ({
            start_time: entry.start_time,
            end_time: entry.end_time,
            title: entry.title,
            note: entry.note,
            section_id: entry.section_id,
          })),
        })),
      });
      setWeekTemplates(templates);
      setTemplateName("");
      setError("");
      setMessage(t("savedSuccessfully"));
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : t("saveAsTemplate"));
    }
  }

  async function removeWeekTemplate(template: WeekTemplate): Promise<void> {
    if (!window.confirm(`${t("deleteTemplate")}: ${template.name}?`)) return;
    try {
      setWeekTemplates(await deleteWeekTemplate(template.id));
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : t("deleteTemplate"));
    }
  }

  function openNewScheduleEntry(day: DayData): void {
    setScheduleError("");
    setActiveDayDate(day.date);
    setScheduleDraft({
      dayDate: day.date,
      start_time: "08:00",
      end_time: "09:00",
      title: "",
      note: "",
      section_id: "",
    });
  }

  function openEditScheduleEntry(dayDate: string, entry: ScheduleEntry): void {
    setScheduleError("");
    setActiveDayDate(dayDate);
    setScheduleDraft({
      dayDate,
      id: entry.id,
      start_time: entry.start_time,
      end_time: entry.end_time,
      title: entry.title,
      note: entry.note,
      section_id: entry.section_id ?? "",
    });
  }

  function closeScheduleDraft(): void {
    setScheduleDraft(null);
    setScheduleError("");
  }

  function saveScheduleDraft(): void {
    if (!scheduleDraft) return;
    const title = scheduleDraft.title.trim();
    if (!title) {
      setScheduleError(t("scheduleTitleRequired"));
      return;
    }
    if (scheduleDraft.start_time >= scheduleDraft.end_time) {
      setScheduleError(t("scheduleTimeInvalid"));
      return;
    }

    const nextEntry: ScheduleEntry = {
      id: scheduleDraft.id ?? createScheduleEntryId(),
      start_time: scheduleDraft.start_time,
      end_time: scheduleDraft.end_time,
      title,
      note: scheduleDraft.note.trim(),
      section_id: scheduleDraft.section_id || null,
      order: 0,
    };

    markChanged();
    setWeekDetail((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        days: previous.days.map((day) => {
          if (day.date !== scheduleDraft.dayDate) return day;
          const scheduleEntries = [
            ...day.schedule_entries.filter((entry) => entry.id !== nextEntry.id),
            nextEntry,
          ]
            .sort((a, b) =>
              a.start_time.localeCompare(b.start_time) ||
              a.end_time.localeCompare(b.end_time) ||
              a.title.localeCompare(b.title),
            )
            .map((entry, index) => ({ ...entry, order: index }));
          return {
            ...day,
            schedule_entries: scheduleEntries,
          };
        }),
      };
    });
    closeScheduleDraft();
  }

  function deleteScheduleEntry(): void {
    if (!scheduleDraft?.id) return;
    markChanged();
    setWeekDetail((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        days: previous.days.map((day) =>
          day.date === scheduleDraft.dayDate
            ? {
                ...day,
                schedule_entries: day.schedule_entries.filter(
                  (entry) => entry.id !== scheduleDraft.id,
                ),
              }
            : day,
        ),
      };
    });
    closeScheduleDraft();
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
    return Boolean(day.day_note.trim()) || day.schedule_entries.length > 0 || activeSections.some((section) => {
      const data = day.sections[section.id];
      return Boolean(data.duration_minutes || data.goal.trim() || data.note.trim());
    });
  }

  function saveStatusText(): string {
    if (saveFailed) return t("saveFailedRetry");
    if (error) return error;
    if (isSaving) return t("saving");
    if (hasUnsavedChanges) return t("unsavedChanges");
    return message || t("allChangesSaved");
  }

  function saveStatusClass(): string {
    if (error || saveFailed) return isDark ? "text-rose-300" : "text-rose-700";
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
        className={`min-h-11 min-w-0 rounded-xl bg-teal-700 font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-400 ${
          compact ? "px-3 py-2 text-xs" : "px-4 py-2 text-sm"
        } ${className}`}
      >
        {isSaving ? t("saving") : saveFailed ? t("trySavingAgain") : t("saveWeek")}
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
  const writingDay = writingView ? weekDetail?.days.find((day) => day.date === writingView.dayDate) : undefined;
  const writingSectionData = writingView ? writingDay?.sections[writingView.sectionId] : undefined;
  const writingSectionLabel = writingView ? activeSections.find((section) => section.id === writingView.sectionId)?.label : undefined;

  return (
    <main
      dir={isPersian ? "rtl" : "ltr"}
      className={`mx-auto flex min-h-screen w-full min-w-0 max-w-none flex-col gap-6 overflow-x-hidden px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 transition-colors md:px-6 md:pb-6 xl:px-8 ${isDark ? "sp-dark" : "sp-light"} ${pageClass}`}
    >
      <section
        className={`mx-auto w-full max-w-[1700px] rounded-3xl border p-5 shadow-sm backdrop-blur ${panelClass}`}
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold">{t("weeklySmartPaper")}</h1>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <LanguageToggle tone={isDark ? "dark" : "light"} />
            </div>
            <Link
              href="/ideas"
              onClick={handlePlannerNavigation}
              className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition ${navigationLinkClass}`}
            >
              {t("ideasTitle")}
            </Link>
            <Link
              href="/timer"
              onClick={handlePlannerNavigation}
              className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition ${navigationLinkClass}`}
            >
              {t("timerTitle")}
            </Link>
            <Link
              href="/summaries"
              onClick={handlePlannerNavigation}
              className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition ${navigationLinkClass}`}
            >
              {t("summaries")}
            </Link>
            <Link
              href="/finance"
              onClick={handlePlannerNavigation}
              className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition ${navigationLinkClass}`}
            >
              {t("finance")}
            </Link>
            <Link
              href="/export"
              onClick={handlePlannerNavigation}
              className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition ${navigationLinkClass}`}
            >
              {t("export")}
            </Link>
            <Link
              href="/settings"
              onClick={handlePlannerNavigation}
              className={`col-span-2 min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition sm:col-span-1 ${navigationLinkClass}`}
            >
              {t("settings")}
            </Link>
            <AppearanceToggle />
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
          <div
            ref={weekRailRef}
            className="flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-1 md:grid md:grid-cols-3 xl:grid-cols-5"
          >
            {weeks.map((week) => {
              const isSelected = week.start_date === selectedWeekStart;
              return (
                <button
                  type="button"
                  key={week.start_date}
                  data-selected-week={isSelected}
                  aria-pressed={isSelected}
                  aria-current={week.is_current ? "date" : undefined}
                  onClick={() => handleWeekSelect(week.start_date)}
                  className={`min-h-16 min-w-40 rounded-xl border px-4 py-3 text-start text-sm transition md:min-w-0 ${
                    isSelected
                      ? isDark
                        ? "border-teal-500 bg-teal-500 text-slate-950 shadow-lg shadow-teal-950/40"
                        : "border-teal-600 bg-teal-700 text-white"
                      : week.is_current
                        ? isDark
                          ? "border-amber-600 bg-amber-900/35 text-amber-100"
                          : "border-amber-500 bg-amber-50 text-amber-900"
                        : isDark
                          ? "border-slate-600 bg-slate-800 text-slate-200 hover:border-teal-400 hover:text-teal-300"
                          : "border-slate-300 bg-white text-slate-700 hover:border-teal-400 hover:text-teal-700"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-bold">
                    <span>{formatWeekChoiceLabel(week)}</span>
                    {isSelected ? <span aria-hidden="true">✓</span> : null}
                  </span>
                  <span className="mt-1 block text-xs leading-5 opacity-85">
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
                <span className="rounded-full bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white">
                  {t("total")}: {formatDuration(totals.week_total_minutes, language)}
                </span>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => setIsTemplateSheetOpen(true)}
              className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                isDark
                  ? "border-slate-600 bg-slate-800 text-slate-200 hover:border-teal-400 hover:text-teal-200"
                  : "border-slate-300 bg-white text-slate-700 hover:border-teal-500 hover:text-teal-700"
              }`}
            >
              {t("templates")}
            </button>
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
              className={`mx-auto w-full min-w-0 max-w-[1500px] rounded-2xl border p-4 ${mutedPanelClass}`}
            >
              <h3 className="mb-3 text-base font-semibold">{t("weekGoal")}</h3>
              <div className="grid gap-3 lg:grid-cols-2">
                <label className="block">
                  {renderFieldLabel(t("weeklyGoal"))}
                  <GrowingTextarea
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
                  <GrowingTextarea
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

            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              <div className="flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-1 lg:hidden">
                {weekDetail.days.map((day) => {
                  const isActiveDay = day.date === activeDate;
                  const dayHasContent = dayHasDetails(day);
                  return (
                    <button
                      key={`mobile-day-${day.date}`}
                      type="button"
                      onClick={() => setActiveDayDate(day.date)}
                      aria-pressed={isActiveDay}
                      className={`min-h-14 min-w-28 rounded-xl border px-3 py-2 text-start transition ${
                        isActiveDay
                          ? isDark
                            ? "border-teal-400 bg-teal-500 text-slate-950"
                            : "border-teal-600 bg-teal-700 text-white"
                          : isDark
                            ? "border-slate-700 bg-slate-900 text-slate-200"
                            : "border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2 text-sm font-bold">
                        <span>{t(WEEKDAY_TRANSLATION_KEYS[day.weekday_name] ?? "saturday")}</span>
                        {isActiveDay ? <span aria-hidden="true">✓</span> : null}
                      </span>
                      <span className="mt-1 block text-xs opacity-80">
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
                      <span className="sr-only">
                        {dayHasContent ? t("sectionDetails") : t("noNotesYet")}
                      </span>
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
                    className={`min-w-0 rounded-2xl border p-4 ${
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
                        <span className="rounded-full bg-teal-700 px-3 py-1 text-xs font-semibold text-white">
                          {formatDuration(dayTotal, language)}
                        </span>
                        <span className={`text-[11px] font-medium ${dayHasContent ? "text-emerald-500" : isDark ? "text-slate-400" : "text-slate-500"}`}>
                          {dayHasContent ? t("sectionDetails") : t("noNotesYet")}
                        </span>
                      </span>
                    </button>

                    <div className={`mt-3 space-y-3 ${isActiveDay ? "block" : "hidden lg:block"}`}>
                      <div
                        className={`rounded-xl border p-3 ${
                          isDark
                            ? "border-slate-700 bg-slate-950/70"
                            : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <label className="block">
                          {renderFieldLabel(t("dayNote"))}
                          <GrowingTextarea
                            value={day.day_note}
                            onChange={(event) => updateDayNote(day.date, event.target.value)}
                            onKeyDown={handleTextareaEnterToSave}
                            placeholder={t("writeDayNote")}
                            rows={2}
                            className={inputClass}
                          />
                        </label>
                      </div>
                      <div
                        className={`rounded-xl border p-3 ${
                          isDark
                            ? "border-slate-700 bg-slate-950/70"
                            : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <h4 className="text-sm font-semibold">{t("daySchedule")}</h4>
                          <button
                            type="button"
                            onClick={() => openNewScheduleEntry(day)}
                            className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-800"
                          >
                            + {t("addScheduleEntry")}
                          </button>
                        </div>
                        {day.schedule_entries.length === 0 ? (
                          <p
                            className={`rounded-lg border px-3 py-2 text-sm ${
                              isDark
                                ? "border-slate-700 text-slate-300"
                                : "border-slate-200 text-slate-600"
                            }`}
                          >
                            {t("noScheduleEntries")}
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {day.schedule_entries.map((entry) => {
                              const linkedSection = activeSections.find(
                                (section) => section.id === entry.section_id,
                              );
                              return (
                                <button
                                  key={entry.id}
                                  type="button"
                                  onClick={() => openEditScheduleEntry(day.date, entry)}
                                  className={`grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg border px-3 py-2 text-start transition ${
                                    isDark
                                      ? "border-slate-700 bg-slate-900 text-slate-100 hover:border-teal-400"
                                      : "border-slate-200 bg-white text-slate-800 hover:border-teal-500"
                                  }`}
                                  aria-label={`${t("editScheduleEntry")}, ${entry.start_time} ${entry.end_time}, ${entry.title}`}
                                >
                                  <span className="rounded-md bg-teal-700 px-2 py-1 text-xs font-bold text-white">
                                    {entry.start_time}-{entry.end_time}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold">
                                      {entry.title}
                                    </span>
                                    {linkedSection || entry.note ? (
                                      <span
                                        className={`mt-1 block truncate text-xs ${
                                          isDark ? "text-slate-300" : "text-slate-500"
                                        }`}
                                      >
                                        {linkedSection ? linkedSection.label : ""}
                                        {linkedSection && entry.note ? " · " : ""}
                                        {entry.note}
                                      </span>
                                    ) : null}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {activeSections.map((section) => {
                        const sectionData = day.sections[section.id];
                        const isOpen = openSection?.dayDate === day.date && openSection.sectionId === section.id;
                        const sectionBodyId = `planner-section-${day.date}-${section.id}`;
                        return (
                          <section
                            key={section.id}
                            aria-label={section.label}
                            className={`min-w-0 rounded-2xl border shadow-sm ${isDark ? "border-slate-700 bg-slate-950/70" : "border-[#d9e4de] bg-white"}`}
                          >
                            <button
                              ref={(element) => { sectionButtonsRef.current[`${day.date}-${section.id}`] = element; }}
                              type="button"
                              aria-expanded={isOpen}
                              aria-controls={isOpen ? sectionBodyId : undefined}
                              onClick={() => toggleSection(day.date, section.id)}
                              className="flex min-h-20 w-full scroll-mt-24 items-center justify-between gap-3 rounded-2xl px-3 py-3 text-start outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                            >
                              <span className="min-w-0">
                                <span className={`block text-sm font-bold ${isDark ? "text-teal-200" : "text-teal-900"}`}>
                                  {section.label}
                                </span>
                                <span className="mt-1 block truncate text-xs opacity-75">
                                  {sectionData.goal || t("sectionGoalHint")}
                                </span>
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                <span className={`text-xs font-semibold ${isDark ? "text-teal-200" : "text-teal-800"}`}>
                                  {formatDuration(sectionData.duration_minutes, language)}
                                </span>
                                <span aria-hidden="true" className="text-xl leading-none">{isOpen ? "−" : "+"}</span>
                              </span>
                            </button>
                            {isOpen ? <div id={sectionBodyId} className={`grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-t p-3 ${isDark ? "border-slate-700" : "border-[#d9e4de]"}`}>
                              <h5 className="text-sm font-semibold">{t("timeForSection")}</h5>
                              <label className="block min-w-0">
                                {renderFieldLabel(t("minutes"))}
                                <input
                                  value={String(sectionData.duration_minutes)}
                                  onChange={(event) =>
                                    updateDurationInput(day.date, section.id, event.target.value)
                                  }
                                  onKeyDown={handleEnterToSave}
                                  type="number"
                                  min={0}
                                  inputMode="numeric"
                                  aria-label={`${section.label} ${t("minutes")}`}
                                  className={`${inputClass} text-base font-semibold`}
                                />
                              </label>
                              <div className="grid grid-cols-4 gap-2">
                                {[15, 30, 60].map((minutes) => (
                                  <button
                                    key={minutes}
                                    type="button"
                                    onClick={() => adjustDuration(day.date, section.id, minutes)}
                                    className={`min-h-11 rounded-lg border px-2 py-2 text-xs font-semibold transition ${
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
                                  className={`min-h-11 rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                                    isDark
                                      ? "border-slate-600 bg-slate-950/70 text-slate-100 hover:border-rose-400"
                                      : "border-slate-300 bg-white text-slate-700 hover:border-rose-400"
                                  }`}
                                >
                                  {t("resetMinutes")}
                                </button>
                              </div>
                              <label className="block min-w-0">
                                {renderFieldLabel(t("goal"))}
                                <GrowingTextarea
                                  value={sectionData.goal}
                                  onChange={(event) =>
                                    updateSectionGoal(day.date, section.id, event.target.value)
                                  }
                                  onKeyDown={handleTextareaEnterToSave}
                                  placeholder={t("goalForSection")}
                                  rows={2}
                                  className={inputClass}
                                />
                              </label>
                              <button type="button" onClick={(event) => openWritingView({ dayDate: day.date, sectionId: section.id, field: "goal" }, event.currentTarget)} className={`min-h-11 justify-self-start text-xs font-semibold underline underline-offset-4 ${isDark ? "text-teal-300" : "text-teal-700"}`}>
                                {t("openWritingView")}
                              </button>
                              <label className="block min-w-0">
                                {renderFieldLabel(t("note"))}
                                <GrowingTextarea
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
                              <button type="button" onClick={(event) => openWritingView({ dayDate: day.date, sectionId: section.id, field: "note" }, event.currentTarget)} className={`min-h-11 justify-self-start text-xs font-semibold underline underline-offset-4 ${isDark ? "text-teal-300" : "text-teal-700"}`}>
                                {t("openWritingView")}
                              </button>
                            </div> : null}
                          </section>
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
            <div className="rounded-xl bg-teal-700 p-3 text-white">
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
          className={`fixed inset-x-0 bottom-0 z-30 w-screen max-w-full border-t px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl md:hidden ${
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
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void saveAndGoToNextDay()}
                disabled={!weekDetail || isSaving}
                className={`min-w-0 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
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
      {isTemplateSheetOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-end bg-slate-950/60 px-4 py-4 sm:items-center sm:justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={t("templates")}
        >
          <div className={`max-h-[75vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-4 shadow-2xl ${panelClass}`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{t("templates")}</h2>
              <button
                type="button"
                onClick={() => setIsTemplateSheetOpen(false)}
                className={`min-h-10 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  isDark
                    ? "border-slate-600 text-slate-200 hover:border-teal-400"
                    : "border-slate-300 text-slate-700 hover:border-teal-500"
                }`}
              >
                {t("cancel")}
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                maxLength={80}
                placeholder={t("templateName")}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => void saveCurrentWeekAsTemplate()}
                disabled={!templateName.trim()}
                className="min-h-10 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {t("saveAsTemplate")}
              </button>
            </div>
            {weekTemplates.length > 0 ? (
              <div className="mt-4 space-y-2">
                {weekTemplates.map((template) => (
                  <div
                    key={template.id}
                    className={`flex items-center gap-2 rounded-lg border p-3 ${
                      isDark ? "border-slate-700 bg-slate-950/60" : "border-slate-200 bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => applyWeekTemplate(template)}
                      className="min-h-10 min-w-0 flex-1 text-start"
                    >
                      <span className="block truncate text-sm font-semibold">{template.name}</span>
                      <span className={`mt-1 block text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                        {template.days.length} {t("day").toLowerCase()} · {template.weekly_goal || template.weekly_note || t("noNote")}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeWeekTemplate(template)}
                      className={`min-h-10 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                        isDark
                          ? "border-slate-600 text-slate-200 hover:border-rose-400"
                          : "border-slate-300 text-slate-700 hover:border-rose-500"
                      }`}
                    >
                      {t("deleteTemplate")}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {scheduleDraft ? (
        <div className="fixed inset-0 z-40 flex items-end bg-slate-950/60 px-4 py-4 sm:items-center sm:justify-center">
          <div className={`w-full max-w-lg rounded-2xl border p-4 shadow-2xl ${panelClass}`}>
            <h2 className="text-lg font-semibold">
              {scheduleDraft.id ? t("editScheduleEntry") : t("addScheduleEntry")}
            </h2>
            {scheduleError ? (
              <p className="mt-2 text-sm font-semibold text-rose-300">{scheduleError}</p>
            ) : null}
            <div className="mt-4 grid gap-3">
              <label className="block">
                {renderFieldLabel(t("scheduleEntryTitle"))}
                <input
                  value={scheduleDraft.title}
                  onChange={(event) =>
                    setScheduleDraft((previous) =>
                      previous ? { ...previous, title: event.target.value } : previous,
                    )
                  }
                  className={inputClass}
                  autoFocus
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  {renderFieldLabel(t("scheduleStartTime"))}
                  <input
                    value={scheduleDraft.start_time}
                    onChange={(event) =>
                      setScheduleDraft((previous) =>
                        previous
                          ? { ...previous, start_time: event.target.value }
                          : previous,
                      )
                    }
                    type="time"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  {renderFieldLabel(t("scheduleEndTime"))}
                  <input
                    value={scheduleDraft.end_time}
                    onChange={(event) =>
                      setScheduleDraft((previous) =>
                        previous ? { ...previous, end_time: event.target.value } : previous,
                      )
                    }
                    type="time"
                    className={inputClass}
                  />
                </label>
              </div>
              <label className="block">
                {renderFieldLabel(t("sectionLabel"))}
                <select
                  value={scheduleDraft.section_id}
                  onChange={(event) =>
                    setScheduleDraft((previous) =>
                      previous
                        ? {
                            ...previous,
                            section_id: event.target.value as SectionName | "",
                          }
                        : previous,
                    )
                  }
                  className={inputClass}
                >
                  <option value="">{t("notSet")}</option>
                  {activeSections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                {renderFieldLabel(t("noteOptional"))}
                <GrowingTextarea
                  value={scheduleDraft.note}
                  onChange={(event) =>
                    setScheduleDraft((previous) =>
                      previous ? { ...previous, note: event.target.value } : previous,
                    )
                  }
                  rows={3}
                  className={inputClass}
                />
              </label>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={saveScheduleDraft}
                className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
              >
                {t("save")}
              </button>
              {scheduleDraft.id ? (
                <button
                  type="button"
                  onClick={deleteScheduleEntry}
                  className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                    isDark
                      ? "border-rose-500/70 bg-slate-900 text-rose-200 hover:bg-rose-950/40"
                      : "border-rose-300 bg-white text-rose-700 hover:bg-rose-50"
                  }`}
                >
                  {t("delete")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={closeScheduleDraft}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                  isDark
                    ? "border-slate-600 bg-slate-900 text-slate-100 hover:border-teal-400"
                    : "border-slate-300 bg-white text-slate-700 hover:border-teal-500"
                }`}
              >
                {t("cancel")}
              </button>
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
                className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-400"
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
      {writingView && writingSectionData ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${writingSectionLabel ?? ""} · ${t(writingView.field)}`}
          onKeyDown={handleWritingKeyDown}
          className={`fixed inset-0 z-50 flex flex-col gap-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] ${
            isDark ? "bg-slate-950 text-slate-100" : "bg-[#f7f8f5] text-[#172b29]"
          }`}
        >
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4">
            <div className="min-w-0">
              <p className={`truncate text-xs font-semibold ${isDark ? "text-teal-300" : "text-teal-700"}`}>{writingSectionLabel}</p>
              <h2 className="text-xl font-bold">{t(writingView.field)}</h2>
            </div>
            <button
              ref={writingDoneRef}
              type="button"
              onClick={closeWritingView}
              className="min-h-11 shrink-0 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
            >
              {t("doneWriting")}
            </button>
          </div>
          <p className="mx-auto w-full max-w-3xl text-sm opacity-75">{t("writingViewHint")}</p>
          <textarea
            ref={writingTextareaRef}
            value={writingView.field === "goal" ? writingSectionData.goal : writingSectionData.note}
            onChange={(event) => writingView.field === "goal"
              ? updateSectionGoal(writingView.dayDate, writingView.sectionId, event.target.value)
              : updateNote(writingView.dayDate, writingView.sectionId, event.target.value)}
            onKeyDown={handleTextareaEnterToSave}
            className={`${inputClass} mx-auto min-h-0 w-full max-w-3xl flex-1 resize-none rounded-2xl p-4 text-base leading-relaxed`}
          />
          <p role="status" className={`mx-auto w-full max-w-3xl text-xs ${saveStatusClass()}`}>
            {saveStatusText()}
          </p>
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

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { LanguageToggle } from "@/components/language-toggle";
import {
  getMorningNotificationSettings,
  saveMorningNotificationSettings,
  syncMorningPlanNotification,
} from "@/lib/notifications";
import { normalizePlannerSections } from "@/lib/planner-sections";
import {
  getPlannerSections,
  savePlannerSections,
} from "@/lib/planner-store";
import { useLanguage } from "@/lib/use-language";
import type {
  MorningNotificationSettings,
  PlannerSection,
  SectionName,
} from "@/lib/smart-paper-types";

export function SettingsView() {
  const { isPersian, t } = useLanguage();
  const [sections, setSections] = useState<PlannerSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [notificationSettings, setNotificationSettings] =
    useState<MorningNotificationSettings>({
      enabled: false,
      time: "08:00",
    });

  const activeCount = useMemo(
    () => sections.filter((section) => section.active).length,
    [sections],
  );
  const hasBlankLabel = sections.some((section) => !section.label.trim());
  const canSave = sections.length > 0 && activeCount >= 1 && !hasBlankLabel && !isSaving;

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setIsLoading(true);
      setError("");
      try {
        const payload = await getPlannerSections();
        const savedNotificationSettings = getMorningNotificationSettings();
        if (cancelled) return;
        setSections(payload);
        setNotificationSettings(savedNotificationSettings);
        setHasUnsavedChanges(false);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : t("loadingSettings"));
      } finally {
        if (cancelled) return;
        setIsLoading(false);
      }
    }

    void loadSettings();
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

  function updateLabel(sectionId: SectionName, label: string): void {
    setMessage("");
    setHasUnsavedChanges(true);
    setSections((previous) =>
      previous.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              label,
            }
          : section,
      ),
    );
  }

  function toggleActive(sectionId: SectionName): void {
    setMessage("");
    setError("");
    setSections((previous) => {
      const section = previous.find((item) => item.id === sectionId);
      if (!section) return previous;
      if (section.active && activeCount <= 1) {
        setError(t("atLeastOneSectionActive"));
        return previous;
      }
      setHasUnsavedChanges(true);
      return previous.map((item) =>
        item.id === sectionId
          ? {
              ...item,
              active: !item.active,
            }
          : item,
      );
    });
  }

  async function handleSave(): Promise<void> {
    setMessage("");
    setError("");
    if (activeCount < 1) {
      setError(t("atLeastOneSectionActive"));
      return;
    }
    if (hasBlankLabel) {
      setError(t("sectionLabelsRequired"));
      return;
    }

    setIsSaving(true);
    try {
      const normalized = normalizePlannerSections(
        sections.map((section) => ({
          ...section,
          label: section.label.trim(),
        })),
      );
      const savedSections = await savePlannerSections(normalized);
      const savedNotificationSettings =
        saveMorningNotificationSettings(notificationSettings);
      const notificationResult = await syncMorningPlanNotification(null, {
        title: t("todayPlan"),
        fallbackBody: t("notificationDescription"),
      });
      setSections(savedSections);
      setNotificationSettings(savedNotificationSettings);
      setHasUnsavedChanges(false);
      setMessage(
        notificationResult === "denied"
          ? t("notificationDenied")
          : `${t("settingsSaved")} ${t("notificationSaved")}`,
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("saveSettings"));
    } finally {
      setIsSaving(false);
    }
  }

  function updateNotificationSettings(
    nextSettings: MorningNotificationSettings,
  ): void {
    setMessage("");
    setError("");
    setHasUnsavedChanges(true);
    setNotificationSettings(nextSettings);
  }

  function handleSettingsNavigation(event: MouseEvent<HTMLAnchorElement>): void {
    if (!hasUnsavedChanges) return;
    if (window.confirm(t("leaveWithUnsavedChanges"))) return;
    event.preventDefault();
  }

  return (
    <main
      dir={isPersian ? "rtl" : "ltr"}
      className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 md:px-6"
    >
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("settings")}</h1>
          <p className="mt-2 text-sm text-slate-300">{t("plannerSectionsDescription")}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <LanguageToggle />
          <Link
            href="/"
            onClick={handleSettingsNavigation}
            className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold hover:border-teal-400 hover:text-teal-200"
          >
            {t("planner")}
          </Link>
          <Link
            href="/summaries"
            onClick={handleSettingsNavigation}
            className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold hover:border-teal-400 hover:text-teal-200"
          >
            {t("summaries")}
          </Link>
        </div>
      </section>

      <section className="mx-auto mt-6 w-full max-w-5xl rounded-2xl border border-slate-700 bg-slate-900/85 p-5">
        {isLoading ? <p className="text-slate-300">{t("loadingSettings")}</p> : null}
        {error ? <p className="text-sm font-semibold text-rose-300">{error}</p> : null}
        {message ? <p className="text-sm font-semibold text-emerald-300">{message}</p> : null}

        {!isLoading ? (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-300">
                {t("activeSectionsCount", { count: activeCount })}
              </p>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!canSave}
                className="rounded-xl bg-teal-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
              >
                {isSaving ? t("saving") : t("saveSettings")}
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              {sections.map((section) => (
                <div
                  key={section.id}
                  className="grid gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4 md:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-400">
                      {t("sectionLabel")} {section.order}
                    </span>
                    <input
                      value={section.label}
                      onChange={(event) => updateLabel(section.id, event.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none focus:border-teal-400"
                      aria-invalid={!section.label.trim()}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 md:min-w-48">
                    <span className="text-sm font-semibold text-slate-200">
                      {section.active ? t("active") : t("inactive")}
                    </span>
                    <input
                      type="checkbox"
                      checked={section.active}
                      onChange={() => toggleActive(section.id)}
                      className="h-5 w-5 accent-teal-500"
                    />
                  </label>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950 p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div>
                  <h2 className="text-lg font-semibold">
                    {t("morningNotification")}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    {t("notificationDescription")}
                  </p>
                </div>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 md:min-w-48">
                  <span className="text-sm font-semibold text-slate-200">
                    {notificationSettings.enabled ? t("active") : t("inactive")}
                  </span>
                  <input
                    type="checkbox"
                    checked={notificationSettings.enabled}
                    onChange={(event) =>
                      updateNotificationSettings({
                        ...notificationSettings,
                        enabled: event.target.checked,
                      })
                    }
                    className="h-5 w-5 accent-teal-500"
                  />
                </label>
              </div>
              <label className="mt-4 block max-w-xs">
                <span className="text-xs font-semibold uppercase text-slate-400">
                  {t("notificationTime")}
                </span>
                <input
                  value={notificationSettings.time}
                  onChange={(event) =>
                    updateNotificationSettings({
                      ...notificationSettings,
                      time: event.target.value,
                    })
                  }
                  type="time"
                  className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none focus:border-teal-400"
                />
              </label>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

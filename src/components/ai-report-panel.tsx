"use client";

import { useEffect, useState } from "react";
import { formatAiReport, summarizeAiReport, type AiReportOptions } from "@/lib/ai-report";
import { getAiReportSource } from "@/lib/export-store";
import { shareOrDownloadFile } from "@/lib/file-share";
import { formatNumber } from "@/lib/formatters";
import type { TranslationKey } from "@/lib/i18n";
import type { ExportPayload } from "@/lib/smart-paper-types";
import { useLanguage } from "@/lib/use-language";

const fieldLabels: Array<[keyof AiReportOptions["include"], TranslationKey]> = [
  ["weeklyGoals", "aiWeeklyGoals"],
  ["weeklyNotes", "aiWeeklyNotes"],
  ["sectionActivity", "aiSectionActivity"],
  ["dayNotes", "aiDayNotes"],
  ["scheduledEvents", "aiScheduledEvents"],
  ["financeGoal", "aiFinanceGoal"],
  ["incomeEntries", "aiIncomeEntries"],
  ["incomeNotes", "aiIncomeNotes"],
];

const initialIncluded: AiReportOptions["include"] = {
  weeklyGoals: true,
  weeklyNotes: false,
  sectionActivity: true,
  dayNotes: false,
  scheduledEvents: false,
  financeGoal: false,
  incomeEntries: false,
  incomeNotes: false,
};

function isShareCancellation(error: unknown): boolean {
  return error instanceof Error &&
    (error.name === "AbortError" || /share cancel/i.test(error.message));
}

function reportFilename(startDate: string, endDate: string): string {
  return `smart-paper-ai-${startDate || "all"}-${endDate || "all"}-${Date.now()}.md`;
}

export function AiReportPanel({
  financeSource,
  onFinanceExpired,
}: {
  financeSource: ExportPayload | null;
  onFinanceExpired: () => void;
}) {
  const { language, t } = useLanguage();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [include, setInclude] = useState(initialIncluded);
  const [plannerSource, setPlannerSource] = useState<ExportPayload | null>(null);
  const [plannerLoading, setPlannerLoading] = useState(true);
  const [plannerNeedsUnlock, setPlannerNeedsUnlock] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const includesFinance = include.financeGoal || include.incomeEntries;
  const source = includesFinance ? financeSource : plannerSource;
  const isLoading = !includesFinance && plannerLoading;
  const needsUnlock = includesFinance ? !financeSource : plannerNeedsUnlock;

  useEffect(() => {
    let cancelled = false;
    void getAiReportSource(false).then((nextSource) => {
      if (cancelled) return;
      setPlannerSource(nextSource);
      setPlannerNeedsUnlock(false);
      setError("");
    }).catch((loadError) => {
      if (cancelled) return;
      setPlannerSource(null);
      if (loadError instanceof Response && loadError.status === 403) setPlannerNeedsUnlock(true);
      else setError(loadError instanceof Error ? loadError.message : t("preparingExport"));
    }).finally(() => {
      if (!cancelled) setPlannerLoading(false);
    });
    return () => { cancelled = true; };
  }, [financeSource, t]);

  const options: AiReportOptions = {
    ...(startDate || endDate ? { startDate, endDate } : {}),
    include,
  };
  let summary: ReturnType<typeof summarizeAiReport> | null = null;
  let selectionError = "";
  if (source) {
    try {
      summary = summarizeAiReport(source, options);
    } catch {
      selectionError = t("aiInvalidRange");
    }
  }
  const reportPreview = source && summary?.hasSelection && !selectionError
    ? formatAiReport(source, options)
    : "";

  async function handleShare() {
    if (!source || !summary?.hasSelection || selectionError) return;
    setIsSharing(true);
    setError("");
    setMessage("");
    try {
      const freshSource = await getAiReportSource(includesFinance);
      const freshSummary = summarizeAiReport(freshSource, options);
      if (!freshSummary.hasSelection ||
          (freshSummary.weeks === 0 && freshSummary.incomeEntries === 0 && !include.financeGoal)) {
        throw new Error(t("aiNoData"));
      }
      const content = formatAiReport(freshSource, options);
      const filename = reportFilename(startDate, endDate);
      await shareOrDownloadFile(filename, "text/markdown", content);
      setMessage(t("aiReportReady"));
    } catch (shareError) {
      setMessage("");
      if (shareError instanceof Response && shareError.status === 403) {
        onFinanceExpired();
        setError(t("aiUnlockFinance"));
      } else {
        setError(isShareCancellation(shareError)
          ? t("aiShareCancelled")
          : shareError instanceof Error ? shareError.message : t("exportData"));
      }
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <section className="mx-auto mt-6 w-full max-w-4xl rounded-2xl border border-teal-200 bg-white p-5">
      <h2 className="text-xl font-bold">{t("aiShareTitle")}</h2>
      <p className="mt-2 text-sm text-[#536660]">{t("aiShareDescription")}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-sm font-semibold">
          {t("aiDateFrom")}
          <input aria-invalid={!!selectionError} type="date" dir="ltr" value={startDate} onChange={(event) => setStartDate(event.target.value)}
            className="mt-1 block w-full rounded-xl border border-[#b6c9bf] bg-white px-3 py-3 text-[#172b29] focus:border-teal-700" />
        </label>
        <label className="text-sm font-semibold">
          {t("aiDateTo")}
          <input aria-invalid={!!selectionError} type="date" dir="ltr" value={endDate} onChange={(event) => setEndDate(event.target.value)}
            className="mt-1 block w-full rounded-xl border border-[#b6c9bf] bg-white px-3 py-3 text-[#172b29] focus:border-teal-700" />
        </label>
        <button type="button" onClick={() => { setStartDate(""); setEndDate(""); }}
          className="rounded-xl border border-[#b6c9bf] px-4 py-3 text-sm font-semibold hover:border-teal-700">
          {t("aiAllDates")}
        </button>
      </div>
      <p className="mt-2 text-xs text-[#536660]">{t("aiDateHint")}</p>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold">{t("aiFields")}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {fieldLabels.map(([key, label]) => (
            <label key={key} className="flex min-h-11 items-center gap-3 rounded-xl border border-[#d9e4de] px-3 py-2 text-sm">
              <input type="checkbox" checked={include[key]} disabled={key === "incomeNotes" && !include.incomeEntries}
                onChange={(event) => setInclude((current) => ({
                  ...current,
                  [key]: event.target.checked,
                  ...(key === "incomeEntries" && !event.target.checked ? { incomeNotes: false } : {}),
                }))} />
              {t(label)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 rounded-xl bg-[#f1f5f2] p-4" role="status" aria-live="polite">
        <p className="text-sm font-semibold">{t("aiPreview")}</p>
        {isLoading ? <p className="mt-1 text-sm">{t("loading")}</p> : null}
        {needsUnlock ? <p className="mt-1 text-sm text-amber-900"><a href="#export-finance-unlock" className="underline">{t("aiUnlockFinance")}</a></p> : null}
        {selectionError ? <p className="mt-1 text-sm text-rose-700">{selectionError}</p> : null}
        {summary ? <p className="mt-1 text-sm">{t("aiPreviewCounts", {
          weeks: formatNumber(summary.weeks, language),
          days: formatNumber(summary.days, language),
          entries: formatNumber(summary.incomeEntries, language),
        })}</p> : null}
        {summary && !summary.hasSelection ? <p className="mt-1 text-sm text-amber-900">{t("aiSelectField")}</p> : null}
        {summary && summary.weeks === 0 && summary.incomeEntries === 0 && !include.financeGoal
          ? <p className="mt-1 text-sm text-amber-900">{t("aiNoData")}</p> : null}
      </div>

      {reportPreview ? <details className="mt-3 rounded-xl border border-[#d9e4de] p-3 text-sm">
        <summary className="cursor-pointer font-semibold">{t("aiReviewReport")}</summary>
        <pre dir="ltr" className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">{reportPreview}</pre>
      </details> : null}

      <p className="mt-4 text-sm text-[#536660]">{t("aiShareHint")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void handleShare()}
          disabled={isLoading || isSharing || !source || !summary?.hasSelection || !!selectionError ||
            (summary.weeks === 0 && summary.incomeEntries === 0 && !include.financeGoal)}
          className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
          {isSharing ? t("loading") : t("aiShare")}
        </button>
        <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer"
          className="rounded-xl border border-[#b6c9bf] px-5 py-3 text-sm font-semibold hover:border-teal-700">
          {t("aiOpenChatgpt")}
        </a>
      </div>
      {message ? <p role="status" className="mt-3 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}

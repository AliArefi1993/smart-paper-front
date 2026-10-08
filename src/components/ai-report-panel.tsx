"use client";

import { useEffect, useRef, useState } from "react";
import { formatAiReport, summarizeAiReport, type AiReportOptions } from "@/lib/ai-report";
import { prepareAiReportTransfer, copyAiReportText } from "@/lib/ai-report-transfer";
import { getAiReportSource } from "@/lib/export-store";
import { shareOrDownloadFile } from "@/lib/file-share";
import { formatNumber } from "@/lib/formatters";
import type { TranslationKey } from "@/lib/i18n";
import type { ExportPayload } from "@/lib/smart-paper-types";
import { useLanguage } from "@/lib/use-language";

const fieldLabels: Array<[keyof AiReportOptions["include"], TranslationKey]> = [
  ["weeklyGoals", "aiWeeklyGoals"], ["weeklyNotes", "aiWeeklyNotes"],
  ["sectionActivity", "aiSectionActivity"], ["dayNotes", "aiDayNotes"],
  ["scheduledEvents", "aiScheduledEvents"], ["financeGoal", "aiFinanceGoal"],
  ["incomeEntries", "aiIncomeEntries"], ["incomeNotes", "aiIncomeNotes"],
];

const initialIncluded: AiReportOptions["include"] = {
  weeklyGoals: true, weeklyNotes: false, sectionActivity: true, dayNotes: false,
  scheduledEvents: false, financeGoal: false, incomeEntries: false, incomeNotes: false,
};

function reportFilename(startDate: string, endDate: string): string {
  return `smart-paper-ai-${startDate || "all"}-${endDate || "all"}-${Date.now()}.md`;
}

function isShareCancellation(error: unknown): boolean {
  return error instanceof Error &&
    (error.name === "AbortError" || /share cancel/i.test(error.message));
}

export function AiReportPanel({
  financeSource,
  onFinanceExpired,
  onFinanceRefreshed,
}: {
  financeSource: ExportPayload | null;
  onFinanceExpired: () => void;
  onFinanceRefreshed: (source: ExportPayload) => void;
}) {
  const { language, t } = useLanguage();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [include, setInclude] = useState(initialIncluded);
  const [plannerSource, setPlannerSource] = useState<ExportPayload | null>(null);
  const [plannerLoading, setPlannerLoading] = useState(true);
  const [plannerNeedsUnlock, setPlannerNeedsUnlock] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const busyRef = useRef(false);
  const previousPreviewRef = useRef("");
  const changedPreviewMessageRef = useRef("");
  const disclosureRef = useRef<HTMLDetailsElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      else setError(t("aiSourceError"));
    }).finally(() => {
      if (!cancelled) setPlannerLoading(false);
    });
    return () => { cancelled = true; };
  }, [financeSource, t]);

  const options: AiReportOptions = { ...(startDate || endDate ? { startDate, endDate } : {}), include };
  let summary: ReturnType<typeof summarizeAiReport> | null = null;
  let selectionError = "";
  if (source) {
    try { summary = summarizeAiReport(source, options); }
    catch { selectionError = t("aiInvalidRange"); }
  }
  const reportPreview = source && summary?.hasSelection && !selectionError
    ? formatAiReport(source, options)
    : "";
  const noData = !!summary && !summary.weeks && !summary.incomeEntries && !include.financeGoal;
  const actionsDisabled = isLoading || isBusy || !source || needsUnlock || !summary?.hasSelection ||
    !!selectionError || noData;

  useEffect(() => {
    if (previousPreviewRef.current === reportPreview) return;
    previousPreviewRef.current = reportPreview;
    setError("");
    if (changedPreviewMessageRef.current === reportPreview) {
      changedPreviewMessageRef.current = "";
    } else {
      setMessage("");
    }
  }, [reportPreview]);

  function clearFeedback() {
    setError("");
    setMessage("");
  }

  function openFallback(content: string, select: boolean) {
    setReviewOpen(true);
    if (select) {
      window.setTimeout(() => {
        disclosureRef.current?.setAttribute("open", "");
        textareaRef.current?.focus();
        textareaRef.current?.select();
      }, 0);
    } else {
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }

  function refreshChangedSource(next: ExportPayload) {
    if (includesFinance) onFinanceRefreshed(next);
    else setPlannerSource(next);
  }

  async function transfer(action: "copy" | "share" | "select") {
    if (busyRef.current || actionsDisabled) return;
    busyRef.current = true;
    setIsBusy(true);
    clearFeedback();
    const capturedOptions = { ...options, include: { ...options.include } };
    const capturedPreview = reportPreview;
    let stage: "prepare" | "share" = "prepare";
    try {
      const prepared = await prepareAiReportTransfer({
        options: capturedOptions,
        reviewedContent: capturedPreview,
        readSource: getAiReportSource,
      });
      if (prepared.status === "empty") {
        if (includesFinance) onFinanceRefreshed(prepared.source);
        else setPlannerSource(prepared.source);
        setError(t("aiNoData"));
        return;
      }
      if (prepared.status === "no-selection") {
        setError(t("aiSelectField"));
        return;
      }
      if (prepared.status === "changed") {
        changedPreviewMessageRef.current = prepared.content;
        refreshChangedSource(prepared.source);
        openFallback(prepared.content, false);
        setReviewOpen(true);
        setMessage(t("aiChanged"));
        return;
      }

      if (action === "select") {
        openFallback(prepared.content, true);
        setMessage(t("aiManualHint"));
      } else if (action === "copy") {
        const copied = await copyAiReportText(prepared.content);
        if (copied) setMessage(t("aiCopied"));
        else {
          openFallback(prepared.content, false);
          setError(t("aiClipboardError"));
        }
      } else {
        stage = "share";
        const outcome = await shareOrDownloadFile(
          reportFilename(startDate, endDate), "text/markdown", prepared.content,
        );
        setMessage(outcome === "downloaded" ? t("aiDownloadStarted") : t("aiChooserReturned"));
      }
    } catch (operationError) {
      setMessage("");
      if (operationError instanceof Response && operationError.status === 403) {
        onFinanceExpired();
        setPlannerNeedsUnlock(true);
        setReviewOpen(false);
        setError(t("aiUnlockFinance"));
      } else if (isShareCancellation(operationError)) {
        setMessage(t("aiShareCancelled"));
      } else {
        setError(stage === "share" ? t("aiShareError") : t("aiSourceError"));
      }
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }

  const lockControls = isBusy;
  return (
    <section className="mx-auto mt-6 w-full max-w-4xl rounded-2xl border border-teal-200 bg-white p-5">
      <h2 className="text-xl font-bold">{t("aiShareTitle")}</h2>
      <p className="mt-2 text-sm text-[#536660]">{t("aiShareDescription")}</p>

      <fieldset disabled={lockControls} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-sm font-semibold">{t("aiDateFrom")}
          <input aria-invalid={!!selectionError} type="date" dir="ltr" value={startDate}
            onChange={(event) => { setStartDate(event.target.value); clearFeedback(); }}
            className="mt-1 block w-full rounded-xl border border-[#b6c9bf] bg-white px-3 py-3 text-[#172b29] focus:border-teal-700" />
        </label>
        <label className="text-sm font-semibold">{t("aiDateTo")}
          <input aria-invalid={!!selectionError} type="date" dir="ltr" value={endDate}
            onChange={(event) => { setEndDate(event.target.value); clearFeedback(); }}
            className="mt-1 block w-full rounded-xl border border-[#b6c9bf] bg-white px-3 py-3 text-[#172b29] focus:border-teal-700" />
        </label>
        <button type="button" onClick={() => { setStartDate(""); setEndDate(""); clearFeedback(); }}
          className="min-h-11 rounded-xl border border-[#b6c9bf] px-4 py-3 text-sm font-semibold hover:border-teal-700">{t("aiAllDates")}</button>
      </fieldset>
      <p className="mt-2 text-xs text-[#536660]">{t("aiDateHint")}</p>

      <fieldset disabled={lockControls} className="mt-5">
        <legend className="text-sm font-semibold">{t("aiFields")}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {fieldLabels.map(([key, label]) => (
            <label key={key} className="flex min-h-11 items-center gap-3 rounded-xl border border-[#d9e4de] px-3 py-2 text-sm">
              <input type="checkbox" checked={include[key]} disabled={key === "incomeNotes" && !include.incomeEntries}
                onChange={(event) => {
                  setInclude((current) => ({ ...current, [key]: event.target.checked,
                    ...(key === "incomeEntries" && !event.target.checked ? { incomeNotes: false } : {}) }));
                  clearFeedback();
                }} />
              {t(label)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 rounded-xl bg-[#f1f5f2] p-4">
        <p className="text-sm font-semibold">{t("aiPreview")}</p>
        {isLoading ? <p className="mt-1 text-sm">{t("loading")}</p> : null}
        {needsUnlock ? <p className="mt-1 text-sm text-amber-900"><a href="#export-finance-unlock" className="underline">{t("aiUnlockFinance")}</a></p> : null}
        {selectionError ? <p className="mt-1 text-sm text-rose-700">{selectionError}</p> : null}
        {summary ? <p className="mt-1 text-sm">{t("aiPreviewCounts", { weeks: formatNumber(summary.weeks, language), days: formatNumber(summary.days, language), entries: formatNumber(summary.incomeEntries, language) })}</p> : null}
        {summary && !summary.hasSelection ? <p className="mt-1 text-sm text-amber-900">{t("aiSelectField")}</p> : null}
        {noData ? <p className="mt-1 text-sm text-amber-900">{t("aiNoData")}</p> : null}
      </div>

      {reportPreview ? <details ref={disclosureRef} open={reviewOpen} onToggle={(event) => setReviewOpen(event.currentTarget.open)}
        className="mt-3 rounded-xl border border-[#d9e4de] p-3 text-sm">
        <summary className="cursor-pointer font-semibold">{t("aiReviewReport")}</summary>
        <label className="mt-3 block text-sm font-semibold" htmlFor="ai-report-text">{t("aiReportText")}</label>
        <textarea id="ai-report-text" ref={textareaRef} readOnly dir="auto" value={reportPreview}
          className="mt-2 max-h-72 min-h-48 w-full resize-y overflow-auto rounded-lg border border-[#b6c9bf] bg-white p-3 text-xs leading-5 text-[#172b29] focus-visible:outline-2 focus-visible:outline-teal-700" />
        <button type="button" disabled={actionsDisabled} onClick={() => void transfer("select")}
          className="mt-2 min-h-11 rounded-xl border border-[#b6c9bf] px-4 py-2 font-semibold hover:border-teal-700 disabled:opacity-60">{t("aiSelectReport")}</button>
      </details> : null}

      <p className="mt-4 text-sm text-[#536660]">{t("aiShareHint")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void transfer("copy")} disabled={actionsDisabled}
          className="min-h-11 rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">
          {isBusy ? t("aiBusy") : t("aiCopy")}
        </button>
        <button type="button" onClick={() => void transfer("share")} disabled={actionsDisabled}
          className="min-h-11 rounded-xl border border-[#b6c9bf] px-5 py-3 text-sm font-semibold hover:border-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">{t("aiShare")}</button>
        <button type="button" onClick={() => void transfer("select")} disabled={actionsDisabled}
          className="min-h-11 rounded-xl border border-[#b6c9bf] px-4 py-2 text-sm font-semibold hover:border-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">{t("aiSelectManually")}</button>
      </div>
      {isBusy ? <p role="status" aria-live="polite" className="mt-2 text-sm text-[#536660]">{t("aiBusy")}</p> : null}
      {message ? <p role="status" aria-live="polite" className="mt-3 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}

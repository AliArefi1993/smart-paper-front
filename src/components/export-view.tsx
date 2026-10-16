"use client";

import Link from "next/link";
import { ReportProblemButton } from "@/components/report-problem-button";
import { recordLocalError, recordFlowOutcome } from "@/lib/local-diagnostics";
import { assertLocalFinanceUnlocked } from "@/lib/local-store";
import { flushSync } from "react-dom";
import { subscribeFinanceCredential, financeCredentialRevision } from "@/lib/finance-credential";
import { useFinanceCredential } from "@/lib/use-finance-credential";
import { useSearchParams } from "next/navigation";
import { readReportWeekContext } from "@/lib/report-week-context";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { AiReportPanel } from "@/components/ai-report-panel";
import { LanguageToggle } from "@/components/language-toggle";
import { AppearanceToggle } from "@/components/appearance-toggle";
import { formatCompactShamsiWeekRange, formatMoney, formatNumber } from "@/lib/formatters";
import {
  getExportFile,
  getExportPayload,
  importExportPayload,
  type ExportFormat,
} from "@/lib/export-store";
import { checkFinanceSession, unlockFinanceSession } from "@/lib/finance-store";
import { shareOrDownloadFile } from "@/lib/file-share";
import { validateLocalBackup } from "@/lib/local-import-safety";
import { useLanguage } from "@/lib/use-language";
import { useFinanceVisibility } from "@/lib/use-finance-visibility";
import type { ExportPayload, ImportMode, MergeConflicts } from "@/lib/smart-paper-types";
import type { TranslationKey } from "@/lib/i18n";

const isLocalDataMode = process.env.NEXT_PUBLIC_DATA_MODE === "local";
type ExportMessage = string | { kind: "financeUnlocked" };
type ImportAttempt = { filename: string; mode: ImportMode };
type ImportFeedback = ImportAttempt & (
  | { status: "importing" | "cancelled" }
  | { status: "error"; detail: string; invalidJson: boolean }
  | { status: "success"; weeks: number; incomeEntries: number; ideas: number; templates: number; range: [string, string] | null; conflicts?: MergeConflicts; hiddenSections?: boolean }
);

const conflictLabels: Record<MergeConflicts["categories"][number], TranslationKey> = {
  planner: "planner", schedule: "safeMergeSchedule", templates: "templates", ideas: "ideasTitle",
  income: "incomeEntries", financeGoal: "safeMergeFinanceGoal", plannerSections: "safeMergeSections",
};

function isForbidden(errorValue: unknown): boolean {
  return errorValue instanceof Response && errorValue.status === 403;
}

export function ExportView() {
  const searchParams = useSearchParams();
  const reportContext = readReportWeekContext(new URLSearchParams(searchParams.toString()));
  const { language, isPersian, t } = useLanguage();
  const financeVisibility = useFinanceVisibility();
  const credential = useFinanceCredential();
  const usesDefaultLocalPin = isLocalDataMode && credential.defaultPin;
  const [payload, setPayload] = useState<ExportPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFormat, setActiveFormat] = useState<ExportFormat | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [isImporting, setIsImporting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState<ExportMessage>("");
  const [importFeedback, setImportFeedback] = useState<ImportFeedback | null>(null);
  const importFeedbackRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!importFeedback || importFeedback.status === "importing") return;
    importFeedbackRef.current?.focus({ preventScroll: true });
    importFeedbackRef.current?.scrollIntoView({ block: "nearest" });
  }, [importFeedback]);

  useEffect(() => {
    if (!isLocked || !error) return;
    errorRef.current?.focus({ preventScroll: true });
    errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [isLocked, error]);

  const generation = useRef(0);
  function isCurrent(epoch: number) { return epoch === generation.current; }
  useEffect(() => {
    if (!isLocalDataMode) return;
    return subscribeFinanceCredential(() => {
      generation.current++;
      flushSync(() => { setPayload(null); setIsLocked(true); setPinInput(""); setMessage(""); setError(""); setImportFeedback(null); setIsUnlocking(false); setActiveFormat(null); setIsImporting(false); setIsLoading(false); });
    });
  }, []);
  useEffect(() => () => { generation.current++; }, []);

  async function loadExportPreview() {
    const epoch = generation.current;
    const nextPayload = await getExportPayload();
    if (!isCurrent(epoch)) return;
    setPayload(nextPayload);
    setIsLocked(false);
  }

  useEffect(() => {
    let cancelled = false;
    const epoch = generation.current;

    async function bootstrap() {
      try {
        const nextPayload = await getExportPayload();
        if (cancelled || !isCurrent(epoch)) return;
        setPayload(nextPayload);
        setIsLocked(false);
      } catch (loadError) {
        if (cancelled || !isCurrent(epoch)) return;
        if (isForbidden(loadError)) {
          setIsLocked(true);
          setError("");
          return;
        }
        setError(
          loadError instanceof Error ? loadError.message : t("preparingExport"),
        );
      } finally {
        if (cancelled || !isCurrent(epoch)) return;
        setIsLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    if (!payload) return;
    let active = true;
    async function checkUnlock() {
      try {
        const response = await checkFinanceSession();
        if (active && response.status === 403) {
          setPayload(null);
          setIsLocked(true);
          setImportFeedback(null);
        }
      } catch {
        // A temporary network failure should not erase the current preview.
      }
    }
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkUnlock();
    };
    const interval = window.setInterval(() => void checkUnlock(), 30_000);
    window.addEventListener("focus", checkUnlock);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", checkUnlock);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [payload]);

  async function handleUnlock() {
    const epoch = generation.current;
    const credentialEpoch = financeCredentialRevision();
    const guard = () => { if (isLocalDataMode) assertLocalFinanceUnlocked(); if (!isCurrent(epoch) || credentialEpoch !== financeCredentialRevision()) throw new Response(null, { status: 403 }); };
    if (!pinInput) {
      setError(t("enterPin"));
      return;
    }

    setIsUnlocking(true);
    setError("");
    setMessage("");
    try {
      await unlockFinanceSession(pinInput);
      guard();
      await loadExportPreview();
      guard();
      setPinInput("");
      setMessage({ kind: "financeUnlocked" });
    } catch (unlockError) {
      if (!isCurrent(epoch)) return;
      setError(
        isForbidden(unlockError)
          ? t("wrongPin")
          : unlockError instanceof Error
            ? unlockError.message
            : t("unlockExport"),
      );
    } finally {
      if (!isCurrent(epoch)) return;
      setIsUnlocking(false);
    }
  }

  async function handleExport(format: ExportFormat) {
    let transferStarted = false;
    const epoch = generation.current;
    const credentialEpoch = financeCredentialRevision();
    const guard = () => { if (isLocalDataMode) assertLocalFinanceUnlocked(); if (!isCurrent(epoch) || credentialEpoch !== financeCredentialRevision()) throw new Response(null, { status: 403 }); };
    setActiveFormat(format);
    setError("");
    setMessage("");
    try {
      const file = await getExportFile(format);
      guard();
      transferStarted = true;
      const transfer = await shareOrDownloadFile(file.filename, file.mimeType, file.content, guard);
      guard();
      recordFlowOutcome("export", "completed");
      if (transfer === "shared") recordFlowOutcome("share", "chooser-returned");
      setMessage(`${file.filename} ${t("exportReady")}`);
    } catch (exportError) {
      if (!isCurrent(epoch)) return;
      if (isForbidden(exportError)) {
        setIsLocked(true);
        setPayload(null);
        setImportFeedback(null);
        setError(`${t("financeIsLocked")}. ${t("enterPin")}.`);
        return;
      }
      if (exportError instanceof Error && exportError.name === "AbortError") {
        recordFlowOutcome("share", "cancelled");
      } else {
        recordLocalError({ route: "export", action: transferStarted ? "share" : "export", code: transferStarted ? "SHARE_FAILED" : "EXPORT_FAILED" });
        recordFlowOutcome("export", "failed");
        if (transferStarted) recordFlowOutcome("share", "failed");
      }
      setError(
        exportError instanceof Error
          ? exportError.message
          : t("exportData"),
      );
    } finally {
      if (!isCurrent(epoch)) return;
      setActiveFormat(null);
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const epoch = generation.current;
    const credentialEpoch = financeCredentialRevision();
    const guard = () => { if (isLocalDataMode) assertLocalFinanceUnlocked(); if (!isCurrent(epoch) || credentialEpoch !== financeCredentialRevision()) throw new Response(null, { status: 403 }); };
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const attempt: ImportAttempt = { filename: file.name, mode: importMode };
    setIsImporting(true);
    setError("");
    setMessage("");
    setImportFeedback({ ...attempt, status: "importing" });
    try {
      const raw = await file.text();
      guard();
      const importedPayload = JSON.parse(raw) as ExportPayload;
      if (isLocalDataMode) validateLocalBackup(importedPayload);
      let importDetails = file.name;
      if (Array.isArray(importedPayload?.weeks) && Array.isArray(importedPayload.finance?.entries)) {
        importDetails += `\n${formatNumber(importedPayload.weeks.length, language)} ${t("weeks")}, ` +
          `${formatNumber(importedPayload.finance.entries.length, language)} ${t("incomeEntries")}, ` +
          `${formatNumber(importedPayload.idea_notes?.length ?? 0, language)} ${t("ideasTitle")}`;
        if (isLocalDataMode) importDetails += `, ${formatNumber(importedPayload.week_templates?.length ?? 0, language)} ${t("templates")}`;
      }
      if (attempt.mode === "replace" && !window.confirm(`${importDetails}\n\n${t("replaceImportConfirm")}`)) {
        recordFlowOutcome("import", "cancelled");
        setImportFeedback({ ...attempt, status: "cancelled" });
        return;
      }
      guard();
      const result = await importExportPayload(importedPayload, attempt.mode);
      guard();
      recordFlowOutcome("import", "completed");
      setPayload(result.payload);
      let range: [string, string] | null = null;
      if (isLocalDataMode) {
        const starts = importedPayload.weeks.map((week) => week.start_date).sort();
        if (starts.length) {
          const end = new Date(`${starts[starts.length - 1]}T12:00:00Z`);
          end.setUTCDate(end.getUTCDate() + 6);
          range = [starts[0], end.toISOString().slice(0, 10)];
        }
      }
      setImportFeedback({
        ...attempt, status: "success", range,
        weeks: result.weeks_imported, incomeEntries: result.income_entries_imported,
        ideas: isLocalDataMode ? importedPayload.idea_notes?.length ?? 0 : 0,
        templates: isLocalDataMode ? importedPayload.week_templates?.length ?? 0 : 0,
        conflicts: isLocalDataMode ? result.merge_conflicts : undefined,
        hiddenSections: isLocalDataMode ? result.hidden_sections_imported : undefined,
      });
    } catch (importError) {
      if (!isCurrent(epoch)) return;
      if (isForbidden(importError)) {
        setIsLocked(true);
        setPayload(null);
        setImportFeedback(null);
        setError(`${t("importIncomplete")}. ${t("financeIsLocked")}. ${t("enterPin")}.`);
        return;
      }
      recordLocalError({ route: "export", action: "import", code: "IMPORT_FAILED" });
      recordFlowOutcome("import", "failed");
      setImportFeedback({ ...attempt, status: "error", invalidJson: importError instanceof SyntaxError, detail:
        importError instanceof Error && !(importError instanceof SyntaxError)
            ? importError.message
            : "",
      });
    } finally {
      if (!isCurrent(epoch)) return;
      setIsImporting(false);
    }
  }

  return (
    <main dir={isPersian ? "rtl" : "ltr"} className="sp-page min-h-screen px-4 py-6 md:px-6">
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-4 rounded-2xl border border-[#d9e4de] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("exportData")}</h1>
          <p className="mt-2 text-sm text-[#536660]">
            {t("saveBackupReadable")}
          </p>
          {isLocalDataMode ? <p className="mt-2 text-sm leading-6 text-[#536660]">{t("financeVisibilityBackupNotice")}</p> : null}
          {isLocalDataMode ? <p className="mt-2 text-sm text-amber-900">{t("backupNotice")}</p> : null}
          {isLocalDataMode ? <p className="mt-2 text-sm leading-6 text-amber-900">{t("androidBackupPolicyNotice")}</p> : null}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <LanguageToggle />
          <AppearanceToggle />
          {financeVisibility.initialized && financeVisibility.visible ? (
            <Link href="/finance" className="min-h-12 rounded-xl border border-[#b6c9bf] bg-[#f1f5f2] px-4 py-2 text-sm font-semibold hover:border-teal-700 hover:text-teal-800">
              {t("finance")}
            </Link>
          ) : null}
          <Link
            href="/"
            className="rounded-xl border border-[#b6c9bf] bg-[#f1f5f2] px-4 py-2 text-sm font-semibold hover:border-teal-700 hover:text-teal-800"
          >
            {t("planner")}
          </Link>
        </div>
      </section>

      {isLocalDataMode ? <AiReportPanel key={JSON.stringify(searchParams.getAll("reportWeek"))} initialContext={reportContext} financeSource={payload} onFinanceRefreshed={setPayload} onFinanceExpired={() => {
        setPayload(null);
        setIsLocked(true);
        setImportFeedback(null);
      }} /> : null}

      <section className="mx-auto mt-6 w-full max-w-4xl rounded-2xl border border-[#d9e4de] bg-white p-5">
        {isLoading ? <p className="text-[#536660]">{t("preparingExport")}</p> : null}
        {error ? <div ref={errorRef} tabIndex={-1} className="text-rose-700"><p role="alert">{error}</p><ReportProblemButton /></div> : null}
        {message ? <p role="status" className="text-emerald-800">{typeof message === "string" ? message : t("financeUnlocked")}</p> : null}

        {isLocked ? (
          <form
            id="export-finance-unlock"
            className="max-w-sm"
            onSubmit={(event) => {
              event.preventDefault();
              void handleUnlock();
            }}
          >
            <label className="block text-sm font-semibold text-[#172b29]" htmlFor="export-pin">
              {t("financePin")}
            </label>
            {isLocalDataMode && (credential.state === "invalid" || credential.state === "unreadable") ? <p role="alert" className="mt-2 text-sm text-rose-700">{t(credential.state === "invalid" ? "pinInvalid" : "pinUnreadable")}</p> : null}
          {isLocalDataMode ? <Link href="/settings#finance-pin" className="mt-2 inline-flex min-h-12 items-center text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-700">{t("pinSettings")}</Link> : null}
          {usesDefaultLocalPin ? <p className="mt-2 text-sm text-amber-900">{t("defaultLocalPinHint")}</p> : null}
            <input
              id="export-pin"
              type="password"
              value={pinInput}
              onChange={(event) => setPinInput(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#b6c9bf] bg-white px-4 py-3 text-[#172b29] outline-none focus:border-teal-700"
              autoComplete="current-password"
            />
            <button
              type="submit"
              disabled={isUnlocking}
              className="mt-3 rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {isUnlocking ? t("unlocking") : t("unlockExport")}
            </button>
          </form>
        ) : null}

        {payload ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[#d9e4de] bg-white p-4">
                <p className="text-xs uppercase text-[#536660]">{t("weeks")}</p>
                <p className="mt-2 text-2xl font-bold">{formatNumber(payload.weeks.length, language)}</p>
              </div>
              <div className="rounded-xl border border-[#d9e4de] bg-white p-4">
                <p className="text-xs uppercase text-[#536660]">{t("incomeEntries")}</p>
                <p className="mt-2 text-2xl font-bold">{formatNumber(payload.finance.entries.length, language)}</p>
              </div>
              <div className="rounded-xl border border-[#d9e4de] bg-white p-4">
                <p className="text-xs uppercase text-[#536660]">{t("totalIncome")}</p>
                <p className="mt-2 text-2xl font-bold">{formatMoney(payload.finance.total_income, language)}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleExport("xlsx")}
                disabled={activeFormat !== null || isImporting}
                className="rounded-xl border border-[#b6c9bf] bg-white px-5 py-3 text-sm font-semibold text-[#172b29] hover:border-teal-700 hover:text-teal-800 disabled:opacity-60"
              >
                {activeFormat === "xlsx" ? t("loading") : t("exportExcel")}
              </button>
              {!isLocalDataMode ? <button
                type="button"
                onClick={() => void handleExport("markdown")}
                disabled={activeFormat !== null || isImporting}
                className="rounded-xl border border-[#b6c9bf] bg-white px-5 py-3 text-sm font-semibold text-[#172b29] hover:border-teal-700 hover:text-teal-800 disabled:opacity-60"
              >
                {activeFormat === "markdown" ? t("loading") : t("exportForAi")}
              </button> : null}
              <button
                type="button"
                onClick={() => void handleExport("json")}
                disabled={activeFormat !== null || isImporting}
                className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {activeFormat === "json" ? t("loading") : t("exportJsonBackup")}
              </button>
              <button
                type="button"
                onClick={() => void handleExport("csv")}
                disabled={activeFormat !== null || isImporting}
                className="rounded-xl border border-slate-500 px-5 py-3 text-sm font-semibold text-[#172b29] hover:border-teal-700 hover:text-teal-800 disabled:opacity-60"
              >
                {activeFormat === "csv" ? t("loading") : t("exportCsv")}
              </button>
            </div>

            <div className="mt-8 border-t border-[#d9e4de] pt-5">
              <h2 className="text-xl font-bold">{t("importData")}</h2>
              <p className="mt-2 text-sm text-[#536660]">
                {t(isLocalDataMode ? "safeImportDescription" : "importDescription")}
              </p>
              {isLocalDataMode ? <p className="mt-2 text-sm text-[#536660]">{t("safeMergeDeletions")}</p> : null}

              <div className="mt-4 flex flex-wrap gap-3">
                <label className="flex min-h-12 items-center gap-2 rounded-xl border border-[#b6c9bf] px-4 py-3 text-sm">
                  <input
                    type="radio"
                    name="import-mode"
                    value="merge"
                    checked={importMode === "merge"}
                    disabled={isImporting}
                    onChange={() => setImportMode("merge")}
                  />
                  {t(isLocalDataMode ? "safeMergeLabel" : "mergeUpsert")}
                </label>
                <label className="flex min-h-12 items-center gap-2 rounded-xl border border-[#b6c9bf] px-4 py-3 text-sm">
                  <input
                    type="radio"
                    name="import-mode"
                    value="replace"
                    checked={importMode === "replace"}
                    disabled={isImporting}
                    onChange={() => setImportMode("replace")}
                  />
                  {t("deleteOldDataFirst")}
                </label>
              </div>

              <label htmlFor="json-backup-file" className="mt-4 block text-sm font-semibold text-[#172b29]">
                {isImporting ? t("importingBackup") : t("chooseJsonBackup")}
              </label>
              <input
                id="json-backup-file"
                type="file"
                accept="application/json,.json"
                className="mt-2 block w-full rounded-xl border border-[#b6c9bf] bg-white text-sm text-[#172b29] file:me-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-amber-400 file:px-5 file:py-3 file:font-semibold file:text-slate-950 hover:file:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                disabled={isImporting || activeFormat !== null}
                onChange={(event) => void handleImport(event)}
              />
              {importFeedback ? (
                <div ref={importFeedbackRef} tabIndex={-1} role="region" aria-labelledby="import-feedback-title" className="mt-4 rounded-xl border border-[#d9e4de] bg-[#f1f5f2] p-4 [overflow-wrap:anywhere]">
                  <div role={importFeedback.status === "error" ? "alert" : "status"}>
                    <h3 id="import-feedback-title" className={`text-lg font-bold ${importFeedback.status === "error" ? "text-rose-700" : importFeedback.status === "success" ? "text-emerald-800" : "text-[#172b29]"}`}>
                      {t(importFeedback.status === "success" ? "importComplete" : importFeedback.status === "error" ? "importIncomplete" : importFeedback.status === "cancelled" ? "importCancelled" : "importingBackup")}
                    </h3>
                    <p className="mt-2 text-sm"><span className="font-semibold">{t("importFile")}: </span><bdi>{importFeedback.filename}</bdi></p>
                    <p className="mt-2 text-sm"><span className="font-semibold">{t("importModeLabel")}: </span>{t(importFeedback.mode === "merge" ? isLocalDataMode ? "safeMergeLabel" : "mergeUpsert" : "deleteOldDataFirst")}</p>
                    {importFeedback.status === "importing" ? <p className="mt-2 text-sm">{t("importKeepOpen")}</p> : null}
                    {importFeedback.status === "cancelled" ? <p className="mt-2 text-sm">{t("importNoChanges")}</p> : null}
                    {importFeedback.status === "error" ? <><p className="mt-2 text-sm text-rose-700">{importFeedback.invalidJson ? t("importFileMustBeJson") : importFeedback.detail}</p><p className="mt-2 text-sm">{t("importRetry")}</p></> : null}
                    {importFeedback.status === "success" ? <>
                      {isLocalDataMode ? <p className="mt-2 font-semibold">{t("importSavedOnDevice")}</p> : null}
                      {isLocalDataMode && !!importFeedback.conflicts?.categories.length ? <div className="mt-3 rounded-xl border border-[#e4d8ba] bg-[#fffaf0] p-3 text-sm text-amber-900">
                        <h4 className="font-bold">{t("safeMergeKept")}</h4>
                        <p className="mt-2">{t("safeMergeUnapplied")}</p>
                        <p className="mt-2">{t("safeMergeAffected")}: {importFeedback.conflicts.categories.map((category) => t(conflictLabels[category])).join(isPersian ? "، " : ", ")}</p>
                        <p className="mt-2">{t("safeMergeKeepBackup")}</p>
                      </div> : null}
                      {isLocalDataMode && importFeedback.hiddenSections ? <p className="mt-3 text-sm text-[#536660]">{t("safeMergeHiddenSections")}</p> : null}
                      <h4 className="mt-4 font-semibold">{t("importBackupRecords")}</h4>
                      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                        {([
                          ["weeks", importFeedback.weeks], ["incomeEntries", importFeedback.incomeEntries],
                          ...(isLocalDataMode ? [["ideasTitle", importFeedback.ideas], ["templates", importFeedback.templates]] as const : []),
                        ] as const).map(([label, count]) => <div key={label} className="flex justify-between gap-4 text-sm"><dt>{t(label)}</dt><dd className="font-bold">{formatNumber(count, language)}</dd></div>)}
                      </dl>
                      <p className="mt-3 text-sm text-[#536660]">{t(isLocalDataMode ? "safeImportCountsHint" : "importCountsHint")}</p>
                      {importFeedback.range ? <><p className="mt-3 text-sm"><span className="font-semibold">{t("importWeekRange")}: </span>{formatCompactShamsiWeekRange(...importFeedback.range, language)}</p><p className="mt-2 text-sm text-[#536660]">{t("importFindWeeks")}</p></> : null}
                    </> : null}
                  </div>
                  {importFeedback.status === "error" ? <ReportProblemButton /> : null}
                  {importFeedback.status === "success" ? <>
                    <nav aria-label={t("importReviewData")} className="mt-3 flex flex-wrap gap-3">
                      {importFeedback.weeks > 0 || importFeedback.templates > 0 ? <Link href="/" className="inline-flex min-h-12 items-center font-semibold text-teal-800 underline">{t("importOpenPlanner")}</Link> : null}
                      {isLocalDataMode && importFeedback.ideas > 0 ? <Link href="/ideas" className="inline-flex min-h-12 items-center font-semibold text-teal-800 underline">{t("importOpenIdeas")}</Link> : null}
                      {isLocalDataMode && importFeedback.hiddenSections ? <Link href="/settings" className="inline-flex min-h-12 items-center font-semibold text-teal-800 underline">{t("settings")}</Link> : null}
                    </nav>
                    {isLocalDataMode && financeVisibility.initialized && !financeVisibility.visible ? <p className="mt-3 text-sm">{t("restoredFinanceAccess")} <Link className="inline-flex min-h-12 items-center font-semibold text-teal-800 underline" href="/settings#finance-visibility">{t("financeVisibilitySettingsLink")}</Link></p> : null}
                  </> : null}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

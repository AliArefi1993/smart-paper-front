"use client";

import Link from "next/link";
import { type ChangeEvent, useEffect, useState } from "react";
import { LanguageToggle } from "@/components/language-toggle";
import { formatMoney, formatNumber } from "@/lib/formatters";
import {
  getExportFile,
  getExportPayload,
  importExportPayload,
  type ExportFormat,
} from "@/lib/export-store";
import { unlockFinanceSession } from "@/lib/finance-store";
import { useLanguage } from "@/lib/use-language";
import type { ExportPayload, ImportMode } from "@/lib/smart-paper-types";

function isForbidden(errorValue: unknown): boolean {
  return errorValue instanceof Response && errorValue.status === 403;
}

async function saveFile(filename: string, mimeType: string, content: BlobPart) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const file = new File([blob], filename, { type: mimeType });
  const shareData = { files: [file], title: filename };

  if (navigator.canShare?.(shareData)) {
    await navigator.share(shareData);
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ExportView() {
  const { language, isPersian, t } = useLanguage();
  const [payload, setPayload] = useState<ExportPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFormat, setActiveFormat] = useState<ExportFormat | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [isImporting, setIsImporting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadExportPreview() {
    const nextPayload = await getExportPayload();
    setPayload(nextPayload);
    setIsLocked(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const nextPayload = await getExportPayload();
        if (cancelled) return;
        setPayload(nextPayload);
        setIsLocked(false);
      } catch (loadError) {
        if (cancelled) return;
        if (isForbidden(loadError)) {
          setIsLocked(true);
          setError("");
          return;
        }
        setError(
          loadError instanceof Error ? loadError.message : t("preparingExport"),
        );
      } finally {
        if (cancelled) return;
        setIsLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function handleUnlock() {
    if (!pinInput.trim()) {
      setError(t("enterPin"));
      return;
    }

    setIsUnlocking(true);
    setError("");
    setMessage("");
    try {
      await unlockFinanceSession(pinInput);
      await loadExportPreview();
      setPinInput("");
      setMessage(t("financeUnlocked"));
    } catch (unlockError) {
      setError(
        isForbidden(unlockError)
          ? t("wrongPin")
          : unlockError instanceof Error
            ? unlockError.message
            : t("unlockExport"),
      );
    } finally {
      setIsUnlocking(false);
    }
  }

  async function handleExport(format: ExportFormat) {
    setActiveFormat(format);
    setError("");
    setMessage("");
    try {
      const file = await getExportFile(format);
      await saveFile(file.filename, file.mimeType, file.content);
      setMessage(`${file.filename} ${t("exportReady")}`);
    } catch (exportError) {
      if (isForbidden(exportError)) {
        setIsLocked(true);
        setPayload(null);
        setError(`${t("financeIsLocked")}. ${t("enterPin")}.`);
        return;
      }
      setError(
        exportError instanceof Error
          ? exportError.message
          : t("exportData"),
      );
    } finally {
      setActiveFormat(null);
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsImporting(true);
    setError("");
    setMessage("");
    try {
      const raw = await file.text();
      const importedPayload = JSON.parse(raw) as ExportPayload;
      const result = await importExportPayload(importedPayload, importMode);
      setPayload(result.payload);
      setMessage(
        `${t("importData")}: ${formatNumber(result.weeks_imported, language)} ${t("weeks")}, ${formatNumber(result.income_entries_imported, language)} ${t("incomeEntries")}.`,
      );
    } catch (importError) {
      if (isForbidden(importError)) {
        setIsLocked(true);
        setPayload(null);
        setError(`${t("financeIsLocked")}. ${t("enterPin")}.`);
        return;
      }
      setError(
        importError instanceof SyntaxError
          ? t("importFileMustBeJson")
          : importError instanceof Error
            ? importError.message
            : t("importData"),
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <main dir={isPersian ? "rtl" : "ltr"} className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 md:px-6">
      <section className="mx-auto flex w-full max-w-4xl items-center justify-between rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <div>
          <h1 className="text-3xl font-bold">{t("exportData")}</h1>
          <p className="mt-2 text-sm text-slate-300">
            {t("saveBackupReadable")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LanguageToggle />
          <Link
            href="/finance"
            className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold hover:border-teal-400 hover:text-teal-200"
          >
            {t("finance")}
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold hover:border-teal-400 hover:text-teal-200"
          >
            {t("planner")}
          </Link>
        </div>
      </section>

      <section className="mx-auto mt-6 w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900/85 p-5">
        {isLoading ? <p className="text-slate-300">{t("preparingExport")}</p> : null}
        {error ? <p className="text-rose-300">{error}</p> : null}
        {message ? <p className="text-emerald-300">{message}</p> : null}

        {isLocked ? (
          <form
            className="max-w-sm"
            onSubmit={(event) => {
              event.preventDefault();
              void handleUnlock();
            }}
          >
            <label className="block text-sm font-semibold text-slate-200" htmlFor="export-pin">
              {t("financePin")}
            </label>
            <input
              id="export-pin"
              type="password"
              value={pinInput}
              onChange={(event) => setPinInput(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-slate-100 outline-none focus:border-teal-400"
              autoComplete="current-password"
            />
            <button
              type="submit"
              disabled={isUnlocking}
              className="mt-3 rounded-xl bg-teal-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-60"
            >
              {isUnlocking ? t("unlocking") : t("unlockExport")}
            </button>
          </form>
        ) : null}

        {payload ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                <p className="text-xs uppercase text-slate-400">{t("weeks")}</p>
                <p className="mt-2 text-2xl font-bold">{formatNumber(payload.weeks.length, language)}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                <p className="text-xs uppercase text-slate-400">{t("incomeEntries")}</p>
                <p className="mt-2 text-2xl font-bold">{formatNumber(payload.finance.entries.length, language)}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                <p className="text-xs uppercase text-slate-400">{t("totalIncome")}</p>
                <p className="mt-2 text-2xl font-bold">{formatMoney(payload.finance.total_income, language)}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleExport("xlsx")}
                disabled={activeFormat !== null}
                className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {activeFormat === "xlsx" ? t("loading") : t("exportExcel")}
              </button>
              <button
                type="button"
                onClick={() => void handleExport("markdown")}
                disabled={activeFormat !== null}
                className="rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-60"
              >
                {activeFormat === "markdown" ? t("loading") : t("exportForAi")}
              </button>
              <button
                type="button"
                onClick={() => void handleExport("json")}
                disabled={activeFormat !== null}
                className="rounded-xl bg-teal-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-60"
              >
                {activeFormat === "json" ? t("loading") : t("exportJsonBackup")}
              </button>
              <button
                type="button"
                onClick={() => void handleExport("csv")}
                disabled={activeFormat !== null}
                className="rounded-xl border border-slate-500 px-5 py-3 text-sm font-semibold text-slate-100 hover:border-teal-400 hover:text-teal-200 disabled:opacity-60"
              >
                {activeFormat === "csv" ? t("loading") : t("exportCsv")}
              </button>
            </div>

            <div className="mt-8 border-t border-slate-700 pt-5">
              <h2 className="text-xl font-bold">{t("importData")}</h2>
              <p className="mt-2 text-sm text-slate-300">
                {t("importDescription")}
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <label className="flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-3 text-sm">
                  <input
                    type="radio"
                    name="import-mode"
                    value="merge"
                    checked={importMode === "merge"}
                    onChange={() => setImportMode("merge")}
                  />
                  {t("mergeUpsert")}
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-3 text-sm">
                  <input
                    type="radio"
                    name="import-mode"
                    value="replace"
                    checked={importMode === "replace"}
                    onChange={() => setImportMode("replace")}
                  />
                  {t("deleteOldDataFirst")}
                </label>
              </div>

              <label className="mt-4 inline-flex cursor-pointer rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300">
                {isImporting ? t("loading") : t("chooseJsonBackup")}
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  disabled={isImporting}
                  onChange={(event) => void handleImport(event)}
                />
              </label>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

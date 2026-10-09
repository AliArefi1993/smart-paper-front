"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LanguageToggle } from "@/components/language-toggle";
import { AppearanceToggle } from "@/components/appearance-toggle";
import {
  formatDecimal,
  formatMoney,
  formatReadableShamsiDate,
} from "@/lib/formatters";
import {
  addIncome as addIncomeData,
  checkFinanceSession,
  deleteIncome as deleteIncomeData,
  editIncome,
  getFinance,
  saveFinanceGoal,
  unlockFinanceSession,
} from "@/lib/finance-store";
import { FinanceSessionLifecycle, watchFinanceSession } from "@/lib/finance-session";
import { useLanguage } from "@/lib/use-language";
import type { FinancePayload, IncomeEntry } from "@/lib/smart-paper-types";

const isLocalDataMode = process.env.NEXT_PUBLIC_DATA_MODE === "local";
const usesDefaultLocalPin = isLocalDataMode && !process.env.NEXT_PUBLIC_FINANCE_PIN;

export function FinanceView() {
  const { language, isPersian, t } = useLanguage();
  const [data, setData] = useState<FinancePayload | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [isLocked, setIsLocked] = useState(true);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [incomeInput, setIncomeInput] = useState("");
  const [incomeNote, setIncomeNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [showGoalSettings, setShowGoalSettings] = useState(false);
  const [isAddingIncome, setIsAddingIncome] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editAmountInput, setEditAmountInput] = useState("");
  const [editNoteInput, setEditNoteInput] = useState("");
  const [editDateInput, setEditDateInput] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [session] = useState(() => new FinanceSessionLifecycle());
  const translation = useRef(t);
  const sensitiveContent = useRef<HTMLDivElement>(null);
  const lockHeading = useRef<HTMLHeadingElement>(null);
  const restoreLockFocus = useRef(false);

  useEffect(() => { translation.current = t; }, [t]);

  function isForbidden(errorValue: unknown): boolean {
    return errorValue instanceof Response && errorValue.status === 403;
  }

  const forceLock = useCallback((messageText = "") => {
    restoreLockFocus.current = !!sensitiveContent.current?.contains(document.activeElement);
    session.begin();
    setIsLocked(true);
    setData(null);
    setGoalInput("");
    setIncomeInput("");
    setIncomeNote("");
    setEditingEntryId(null);
    setEditAmountInput("");
    setEditNoteInput("");
    setEditDateInput("");
    setPinInput("");
    setShowGoalSettings(false);
    setIsUnlocking(false);
    setIsSavingGoal(false);
    setIsAddingIncome(false);
    setDeletingEntryId(null);
    setIsSavingEdit(false);
    setIsLoading(false);
    setMessage("");
    setError(messageText);
  }, [session]);

  useEffect(() => {
    if (isLocked && !isLoading && restoreLockFocus.current) {
      restoreLockFocus.current = false;
      lockHeading.current?.focus({ preventScroll: true });
      lockHeading.current?.scrollIntoView({ block: "nearest" });
    }
  }, [isLocked, isLoading]);

  useEffect(() => {
    const generation = session.begin();
    async function bootstrap() {
      try {
        const payload = await getFinance();
        if (!await session.validate(generation, checkFinanceSession, () => forceLock())) return;
        if (!session.isCurrent(generation)) return;
        setIsLocked(false);
        setData(payload);
        setGoalInput(payload.goal_amount ? String(payload.goal_amount) : "");
      } catch (loadError) {
        if (!session.isCurrent(generation)) return;
        if (isForbidden(loadError)) {
          forceLock();
          return;
        }
        setError(loadError instanceof Error ? loadError.message : translation.current("loading"));
      } finally {
        if (session.isCurrent(generation)) setIsLoading(false);
      }
    }
    void bootstrap();
    return () => { session.begin(); };
  }, [session, forceLock]);

  useEffect(() => {
    if (isLocked) return;
    const generation = session.current();
    let active = true;
    const cleanup = watchFinanceSession(window, document, async () => {
      try {
        await session.validate(generation, checkFinanceSession, () => {
          if (active) forceLock(`${t("financeIsLocked")}. ${t("enterPin")}.`);
        });
      } catch {
        // Ignore transient network errors during background checks.
      }
    });
    return () => {
      active = false;
      cleanup();
    };
  }, [isLocked, session, forceLock, t]);

  async function canPublish(generation: number): Promise<boolean> {
    return session.validate(generation, checkFinanceSession, () =>
      forceLock(`${t("financeIsLocked")}. ${t("enterPin")}.`));
  }

  const progressWidth = useMemo(() => {
    if (!data) return "0%";
    const clamped = Math.max(0, Math.min(100, data.progress_percent));
    return `${clamped}%`;
  }, [data]);

  async function unlockFinance() {
    if (!pinInput.trim()) {
      setError(t("enterPin"));
      return;
    }

    const generation = session.begin();
    setIsUnlocking(true);
    setError("");
    setMessage("");
    try {
      await unlockFinanceSession(pinInput);
      if (!session.isCurrent(generation)) return;
      const payload = await getFinance();
      if (!await canPublish(generation)) return;
      if (!session.isCurrent(generation)) return;
      setData(payload);
      setGoalInput(payload.goal_amount ? String(payload.goal_amount) : "");
      setPinInput("");
      setIsLocked(false);
      setMessage(t("financeUnlocked"));
    } catch (unlockError) {
      if (!session.isCurrent(generation)) return;
      setError(
        isForbidden(unlockError)
          ? t("wrongPin")
          : unlockError instanceof Error
            ? unlockError.message
            : t("finance"),
      );
    } finally {
      if (session.isCurrent(generation)) setIsUnlocking(false);
    }
  }

  async function saveGoal() {
    if (isLocked) return;
    const goalValue = Number(goalInput);
    if (!Number.isInteger(goalValue) || goalValue < 0) {
      setError(t("goalMustBePositive"));
      return;
    }

    const generation = session.current();
    setIsSavingGoal(true);
    setError("");
    setMessage("");
    try {
      const payload = await saveFinanceGoal(goalValue);
      if (!await canPublish(generation)) return;
      if (!session.isCurrent(generation)) return;
      setData(payload);
      setMessage(`${t("goal")} ${t("savedSuccessfully")}`);
    } catch (saveError) {
      if (!session.isCurrent(generation)) return;
      if (isForbidden(saveError)) {
        forceLock(`${t("financeIsLocked")}. ${t("enterPin")}.`);
        return;
      }
      setError(saveError instanceof Error ? saveError.message : t("saveGoal"));
    } finally {
      if (session.isCurrent(generation)) setIsSavingGoal(false);
    }
  }

  async function addIncome() {
    if (isLocked) return;
    const incomeValue = Number(incomeInput);
    if (!Number.isInteger(incomeValue) || incomeValue <= 0) {
      setError(t("incomeMustBePositive"));
      return;
    }

    const generation = session.current();
    setIsAddingIncome(true);
    setError("");
    setMessage("");
    try {
      const payload = await addIncomeData(incomeValue, incomeNote);
      if (!await canPublish(generation)) return;
      if (!session.isCurrent(generation)) return;
      setData(payload);
      setIncomeInput("");
      setIncomeNote("");
      setMessage(t("incomeAdded"));
    } catch (saveError) {
      if (!session.isCurrent(generation)) return;
      if (isForbidden(saveError)) {
        forceLock(`${t("financeIsLocked")}. ${t("enterPin")}.`);
        return;
      }
      setError(saveError instanceof Error ? saveError.message : t("addIncome"));
    } finally {
      if (session.isCurrent(generation)) setIsAddingIncome(false);
    }
  }

  async function deleteIncome(entryId: number) {
    if (isLocked) return;
    if (deletingEntryId !== null || !window.confirm(isPersian
      ? "این درآمد حذف شود؟ این درآمد حذف می‌شود. این کار قابل بازگشت نیست."
      : "Delete this income entry? This entry will be removed. This cannot be undone.")) return;
    const generation = session.current();
    setDeletingEntryId(entryId);
    setError("");
    setMessage("");
    try {
      const payload = await deleteIncomeData(entryId);
      if (!await canPublish(generation)) return;
      if (!session.isCurrent(generation)) return;
      setData(payload);
      setMessage(t("incomeDeleted"));
    } catch (deleteError) {
      if (!session.isCurrent(generation)) return;
      if (isForbidden(deleteError)) {
        forceLock(`${t("financeIsLocked")}. ${t("enterPin")}.`);
        return;
      }
      setError(deleteError instanceof Error ? deleteError.message : t("delete"));
    } finally {
      if (session.isCurrent(generation)) setDeletingEntryId(null);
    }
  }

  function startEdit(entry: IncomeEntry) {
    if (isLocked) return;
    setEditingEntryId(entry.id);
    setEditAmountInput(String(entry.amount));
    setEditNoteInput(entry.note);
    setEditDateInput(entry.received_on);
    setError("");
    setMessage("");
  }

  function cancelEdit() {
    setEditingEntryId(null);
    setEditAmountInput("");
    setEditNoteInput("");
    setEditDateInput("");
  }

  async function saveEdit(entryId: number) {
    if (isLocked) return;
    const amountValue = Number(editAmountInput);
    if (!Number.isInteger(amountValue) || amountValue <= 0) {
      setError(t("editedIncomePositive"));
      return;
    }
    if (!editDateInput) {
      setError(t("dateRequired"));
      return;
    }

    const generation = session.current();
    setIsSavingEdit(true);
    setError("");
    setMessage("");
    try {
      const payload = await editIncome(
        entryId,
        amountValue,
        editNoteInput,
        editDateInput,
      );
      if (!await canPublish(generation)) return;
      if (!session.isCurrent(generation)) return;
      setData(payload);
      setMessage(t("incomeUpdated"));
      cancelEdit();
    } catch (saveError) {
      if (!session.isCurrent(generation)) return;
      if (isForbidden(saveError)) {
        forceLock(`${t("financeIsLocked")}. ${t("enterPin")}.`);
        return;
      }
      setError(saveError instanceof Error ? saveError.message : t("incomeUpdated"));
    } finally {
      if (session.isCurrent(generation)) setIsSavingEdit(false);
    }
  }

  return (
    <main dir={isPersian ? "rtl" : "ltr"} className="sp-page min-h-screen px-4 py-6 md:px-6 xl:px-8">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 rounded-3xl border border-[#badbd0] bg-[#e7f4ef] p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("finance")}</h1>
          <p className="mt-2 text-sm text-[#536660]">
            {t("pathToGoal")}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <LanguageToggle />
          <AppearanceToggle />
          <Link
            href="/"
            className="rounded-xl border border-[#b6c9bf] bg-[#f1f5f2] px-4 py-2 text-sm font-semibold text-[#172b29] hover:border-teal-700 hover:text-teal-800"
          >
            {t("planner")}
          </Link>
          <Link
            href="/summaries"
            className="rounded-xl border border-[#b6c9bf] bg-[#f1f5f2] px-4 py-2 text-sm font-semibold text-[#172b29] hover:border-teal-700 hover:text-teal-800"
          >
            {t("summaries")}
          </Link>
          <Link
            href="/export"
            className="rounded-xl border border-[#b6c9bf] bg-[#f1f5f2] px-4 py-2 text-sm font-semibold text-[#172b29] hover:border-teal-700 hover:text-teal-800"
          >
            {t("export")}
          </Link>
        </div>
      </section>

      {isLoading ? <p className="mx-auto mt-6 w-full max-w-5xl text-[#536660]">{t("loading")}</p> : null}
      {error ? <p role="alert" className="mx-auto mt-3 w-full max-w-5xl text-rose-700">{error}</p> : null}
      {message ? <p role="status" className="mx-auto mt-3 w-full max-w-5xl text-emerald-800">{message}</p> : null}

      {!isLoading && isLocked ? (
        <section className="mx-auto mt-6 w-full max-w-md rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <h2 ref={lockHeading} tabIndex={-1} className="text-lg font-semibold text-amber-900">{t("financeIsLocked")}</h2>
          <p className="mt-2 text-sm text-amber-900">
            {t("enterPin")}
          </p>
          {isLocalDataMode ? <p className="mt-2 text-sm text-amber-900">{t("localPinNotice")}</p> : null}
          {usesDefaultLocalPin ? <p className="mt-2 text-sm text-amber-900">{t("defaultLocalPinHint")}</p> : null}
          <input
            aria-label={t("financePin")}
            type="password"
            value={pinInput}
            onChange={(event) => setPinInput(event.target.value)}
            className="mt-4 min-h-11 w-full rounded-lg border border-amber-500/60 bg-white px-3 py-2 text-sm outline-none ring-amber-400 focus:ring"
            placeholder={t("enterPin")}
          />
          <button
            type="button"
            onClick={() => void unlockFinance()}
            disabled={isUnlocking}
            className="mt-3 min-h-11 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {isUnlocking ? t("unlocking") : t("unlock")}
          </button>
        </section>
      ) : null}

      {data && !isLocked ? (
        <div ref={sensitiveContent}>
          <section className="mx-auto mt-3 flex w-full max-w-5xl justify-end">
            <button
              type="button"
              onClick={() => setShowGoalSettings((prev) => !prev)}
              className="rounded-md border border-[#b6c9bf] px-3 py-1 text-xs font-semibold text-[#172b29] hover:bg-[#e7f4ef]"
            >
              {showGoalSettings ? t("closeGoalSettings") : t("goalSettings")}
            </button>
          </section>

          {showGoalSettings ? (
            <section className="mx-auto mt-3 w-full max-w-5xl rounded-2xl border border-[#d9e4de] bg-white p-4">
              <h2 className="text-sm font-semibold text-[#172b29]">{t("yearGoalSettings")}</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  type="number"
                  min={0}
                  value={goalInput}
                  onChange={(event) => setGoalInput(event.target.value)}
                  className="w-full max-w-sm rounded-lg border border-[#b6c9bf] bg-white px-3 py-2 text-sm outline-none ring-teal-700 focus:ring"
                  placeholder="10000"
                />
                <button
                  type="button"
                  onClick={() => void saveGoal()}
                  disabled={isSavingGoal}
                  className="min-h-12 rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  {isSavingGoal ? t("saving") : t("saveGoal")}
                </button>
              </div>
            </section>
          ) : null}

          <section className="mx-auto mt-6 grid w-full max-w-5xl gap-4 md:grid-cols-3">
            <article className="rounded-2xl border border-[#d9e4de] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[#536660]">{t("yearTotalIncome")}</p>
              <p className="mt-2 text-2xl font-bold text-teal-800">
                {formatMoney(data.total_income, language)}
              </p>
            </article>
            <article className="rounded-2xl border border-[#d9e4de] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[#536660]">{t("yearGoal")}</p>
              <p className="mt-2 text-2xl font-bold">
                {data.goal_amount > 0 ? formatMoney(data.goal_amount, language) : t("notSet")}
              </p>
            </article>
            <article className="rounded-2xl border border-[#d9e4de] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[#536660]">{t("remainingToGoal")}</p>
              <p className="mt-2 text-2xl font-bold text-amber-900">
                {formatMoney(data.remaining_amount, language)}
              </p>
            </article>
          </section>

          <section className="mx-auto mt-4 w-full max-w-5xl rounded-2xl border border-[#badbd0] bg-[#e7f4ef] p-4">
            <div className="flex items-end justify-between gap-3">
              <p className="text-sm font-semibold">{t("pathToGoal")}</p>
              <p className="text-lg font-bold text-teal-800">
                {formatDecimal(data.progress_percent, language)}%
              </p>
            </div>
            <div className="mt-3 h-4 overflow-hidden rounded-full bg-[#f1f5f2]">
              <div
                className="h-full rounded-full bg-teal-700 transition-all duration-700"
                style={{ width: progressWidth }}
              />
            </div>
          </section>

          <section className="mx-auto mt-6 w-full max-w-5xl">
            <article className="rounded-2xl border border-[#badbd0] bg-[#e7f4ef] p-6 shadow-sm">
              <h2 className="text-lg font-semibold">{t("addIncome")}</h2>
              <input
                type="number"
                min={1}
                value={incomeInput}
                onChange={(event) => setIncomeInput(event.target.value)}
                className="mt-4 w-full rounded-lg border border-[#badbd0] bg-white px-4 py-3 text-base outline-none ring-teal-700 focus:ring"
                placeholder={t("incomeAmount")}
              />
              <input
                type="text"
                value={incomeNote}
                onChange={(event) => setIncomeNote(event.target.value)}
                className="mt-3 w-full rounded-lg border border-[#badbd0] bg-white px-4 py-3 text-base outline-none ring-teal-700 focus:ring"
                placeholder={t("noteOptional")}
              />
              <button
                type="button"
                onClick={() => void addIncome()}
                disabled={isAddingIncome}
                className="mt-4 min-h-12 rounded-xl bg-teal-700 px-5 py-3 text-base font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {isAddingIncome ? t("adding") : t("addIncome")}
              </button>
            </article>
          </section>

          <section className="mx-auto mt-6 w-full max-w-5xl rounded-2xl border border-[#badbd0] bg-[#f1f5f2] p-5 shadow-sm">
            <h2 className="text-xl font-bold text-[#172b29]">{t("incomeHistory")}</h2>
            {data.entries.length === 0 ? (
              <p className="mt-3 text-sm text-[#536660]">{t("noIncomeAdded")}</p>
            ) : (
              <div className="mt-4 space-y-3">
                {data.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-xl border border-[#d9e4de] bg-white px-4 py-3"
                  >
                    {editingEntryId === entry.id ? (
                      <div className="flex-1">
                        <div className="grid gap-2 sm:grid-cols-3">
                          <input
                            type="number"
                            min={1}
                            value={editAmountInput}
                            onChange={(event) => setEditAmountInput(event.target.value)}
                            className="w-full rounded-md border border-[#b6c9bf] bg-white px-2 py-1 text-xs outline-none ring-teal-700 focus:ring"
                          />
                          <input
                            type="text"
                            value={editNoteInput}
                            onChange={(event) => setEditNoteInput(event.target.value)}
                            className="w-full rounded-md border border-[#b6c9bf] bg-white px-2 py-1 text-xs outline-none ring-teal-700 focus:ring"
                          />
                          <input
                            type="date"
                            value={editDateInput}
                            onChange={(event) => setEditDateInput(event.target.value)}
                            className="w-full rounded-md border border-[#b6c9bf] bg-white px-2 py-1 text-xs outline-none ring-teal-700 focus:ring"
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-semibold text-teal-800">
                          +{formatMoney(entry.amount, language)}
                        </p>
                        <p className="text-xs text-[#536660]">{entry.note || t("noNote")}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      {editingEntryId === entry.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void saveEdit(entry.id)}
                            disabled={isSavingEdit}
                            className="min-h-12 rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                          >
                            {isSavingEdit ? t("saving") : t("save")}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-md border border-[#b6c9bf] px-2 py-1 text-xs font-semibold text-[#536660] hover:bg-slate-500/15"
                          >
                            {t("cancel")}
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-[#536660]">
                            {formatReadableShamsiDate(entry.received_on, language)}
                          </p>
                          <button
                            type="button"
                            onClick={() => startEdit(entry)}
                            className="rounded-md border border-cyan-500/60 px-2 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-700/15"
                          >
                            {t("edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteIncome(entry.id)}
                            disabled={deletingEntryId === entry.id}
                            className="rounded-md border border-rose-500/60 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-500/15 disabled:opacity-60"
                          >
                            {deletingEntryId === entry.id ? t("deleting") : t("delete")}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}

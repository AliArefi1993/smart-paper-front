"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LanguageToggle } from "@/components/language-toggle";
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
import { useLanguage } from "@/lib/use-language";
import type { FinancePayload, IncomeEntry } from "@/lib/smart-paper-types";

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
  const [sessionCheckIntervalMs, setSessionCheckIntervalMs] = useState(30000);

  function isForbidden(errorValue: unknown): boolean {
    return errorValue instanceof Response && errorValue.status === 403;
  }

  function forceLock(messageText?: string) {
    setIsLocked(true);
    setData(null);
    setGoalInput("");
    setIncomeInput("");
    setIncomeNote("");
    setEditingEntryId(null);
    setEditAmountInput("");
    setEditNoteInput("");
    setEditDateInput("");
    if (messageText) {
      setError(messageText);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const payload = await getFinance();
        if (cancelled) return;
        setIsLocked(false);
        setData(payload);
        if (payload.unlock_ttl_seconds && payload.unlock_ttl_seconds > 0) {
          setSessionCheckIntervalMs(payload.unlock_ttl_seconds * 1000);
        }
        setGoalInput(payload.goal_amount ? String(payload.goal_amount) : "");
      } catch (loadError) {
        if (cancelled) return;
        if (isForbidden(loadError)) {
          forceLock(`${t("financeIsLocked")}. ${t("enterPin")}.`);
          return;
        }
        setError(loadError instanceof Error ? loadError.message : t("loading"));
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

  useEffect(() => {
    if (isLocked) return;
    const intervalId = window.setInterval(async () => {
      try {
        const response = await checkFinanceSession();
        if (response.status === 403) {
          forceLock(`${t("financeIsLocked")}. ${t("enterPin")}.`);
        }
      } catch {
        // Ignore transient network errors during background checks.
      }
    }, sessionCheckIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isLocked, sessionCheckIntervalMs, t]);

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

    setIsUnlocking(true);
    setError("");
    setMessage("");
    try {
      await unlockFinanceSession(pinInput);
      const payload = await getFinance();
      if (payload.unlock_ttl_seconds && payload.unlock_ttl_seconds > 0) {
        setSessionCheckIntervalMs(payload.unlock_ttl_seconds * 1000);
      }
      setData(payload);
      setGoalInput(payload.goal_amount ? String(payload.goal_amount) : "");
      setPinInput("");
      setIsLocked(false);
      setMessage(t("financeUnlocked"));
    } catch (unlockError) {
      setError(
        isForbidden(unlockError)
          ? t("wrongPin")
          : unlockError instanceof Error
            ? unlockError.message
            : t("finance"),
      );
    } finally {
      setIsUnlocking(false);
    }
  }

  async function saveGoal() {
    const goalValue = Number(goalInput);
    if (!Number.isInteger(goalValue) || goalValue < 0) {
      setError(t("goalMustBePositive"));
      return;
    }

    setIsSavingGoal(true);
    setError("");
    setMessage("");
    try {
      const payload = await saveFinanceGoal(goalValue);
      setData(payload);
      setMessage(`${t("goal")} ${t("savedSuccessfully")}`);
    } catch (saveError) {
      if (isForbidden(saveError)) {
        forceLock(`${t("financeIsLocked")}. ${t("enterPin")}.`);
        return;
      }
      setError(saveError instanceof Error ? saveError.message : t("saveGoal"));
    } finally {
      setIsSavingGoal(false);
    }
  }

  async function addIncome() {
    const incomeValue = Number(incomeInput);
    if (!Number.isInteger(incomeValue) || incomeValue <= 0) {
      setError(t("incomeMustBePositive"));
      return;
    }

    setIsAddingIncome(true);
    setError("");
    setMessage("");
    try {
      const payload = await addIncomeData(incomeValue, incomeNote);
      setData(payload);
      setIncomeInput("");
      setIncomeNote("");
      setMessage(t("incomeAdded"));
    } catch (saveError) {
      if (isForbidden(saveError)) {
        forceLock(`${t("financeIsLocked")}. ${t("enterPin")}.`);
        return;
      }
      setError(saveError instanceof Error ? saveError.message : t("addIncome"));
    } finally {
      setIsAddingIncome(false);
    }
  }

  async function deleteIncome(entryId: number) {
    setDeletingEntryId(entryId);
    setError("");
    setMessage("");
    try {
      const payload = await deleteIncomeData(entryId);
      setData(payload);
      setMessage(t("incomeDeleted"));
    } catch (deleteError) {
      if (isForbidden(deleteError)) {
        forceLock(`${t("financeIsLocked")}. ${t("enterPin")}.`);
        return;
      }
      setError(deleteError instanceof Error ? deleteError.message : t("delete"));
    } finally {
      setDeletingEntryId(null);
    }
  }

  function startEdit(entry: IncomeEntry) {
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
    const amountValue = Number(editAmountInput);
    if (!Number.isInteger(amountValue) || amountValue <= 0) {
      setError(t("editedIncomePositive"));
      return;
    }
    if (!editDateInput) {
      setError(t("dateRequired"));
      return;
    }

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
      setData(payload);
      setMessage(t("incomeUpdated"));
      cancelEdit();
    } catch (saveError) {
      if (isForbidden(saveError)) {
        forceLock(`${t("financeIsLocked")}. ${t("enterPin")}.`);
        return;
      }
      setError(saveError instanceof Error ? saveError.message : t("incomeUpdated"));
    } finally {
      setIsSavingEdit(false);
    }
  }

  return (
    <main dir={isPersian ? "rtl" : "ltr"} className="min-h-screen bg-gradient-to-b from-emerald-950 via-slate-950 to-slate-900 px-4 py-6 text-slate-100 md:px-6 xl:px-8">
      <section className="mx-auto flex w-full max-w-5xl items-center justify-between rounded-3xl border border-emerald-700/70 bg-emerald-900/20 p-5 shadow-lg">
        <div>
          <h1 className="text-3xl font-bold">{t("finance")}</h1>
          <p className="mt-2 text-sm text-emerald-100/80">
            {t("pathToGoal")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LanguageToggle />
          <Link
            href="/"
            className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-emerald-400 hover:text-emerald-200"
          >
            {t("planner")}
          </Link>
          <Link
            href="/summaries"
            className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-emerald-400 hover:text-emerald-200"
          >
            {t("summaries")}
          </Link>
          <Link
            href="/export"
            className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-emerald-400 hover:text-emerald-200"
          >
            {t("export")}
          </Link>
        </div>
      </section>

      {isLoading ? <p className="mx-auto mt-6 w-full max-w-5xl text-slate-300">{t("loading")}</p> : null}
      {error ? <p className="mx-auto mt-3 w-full max-w-5xl text-rose-400">{error}</p> : null}
      {message ? <p className="mx-auto mt-3 w-full max-w-5xl text-emerald-300">{message}</p> : null}

      {!isLoading && isLocked ? (
        <section className="mx-auto mt-6 w-full max-w-md rounded-2xl border border-amber-600/70 bg-amber-900/20 p-5">
          <h2 className="text-lg font-semibold text-amber-100">{t("financeIsLocked")}</h2>
          <p className="mt-2 text-sm text-amber-100/80">
            {t("enterPin")}
          </p>
          <input
            type="password"
            value={pinInput}
            onChange={(event) => setPinInput(event.target.value)}
            className="mt-4 w-full rounded-lg border border-amber-500/60 bg-slate-950 px-3 py-2 text-sm outline-none ring-amber-400 focus:ring"
            placeholder={t("enterPin")}
          />
          <button
            type="button"
            onClick={() => void unlockFinance()}
            disabled={isUnlocking}
            className="mt-3 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
          >
            {isUnlocking ? t("unlocking") : t("unlock")}
          </button>
        </section>
      ) : null}

      {data && !isLocked ? (
        <>
          <section className="mx-auto mt-3 flex w-full max-w-5xl justify-end">
            <button
              type="button"
              onClick={() => setShowGoalSettings((prev) => !prev)}
              className="rounded-md border border-slate-500/60 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700/40"
            >
              {showGoalSettings ? t("closeGoalSettings") : t("goalSettings")}
            </button>
          </section>

          {showGoalSettings ? (
            <section className="mx-auto mt-3 w-full max-w-5xl rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
              <h2 className="text-sm font-semibold text-slate-200">{t("yearGoalSettings")}</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  type="number"
                  min={0}
                  value={goalInput}
                  onChange={(event) => setGoalInput(event.target.value)}
                  className="w-full max-w-sm rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm outline-none ring-emerald-400 focus:ring"
                  placeholder="10000"
                />
                <button
                  type="button"
                  onClick={() => void saveGoal()}
                  disabled={isSavingGoal}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  {isSavingGoal ? t("saving") : t("saveGoal")}
                </button>
              </div>
            </section>
          ) : null}

          <section className="mx-auto mt-6 grid w-full max-w-5xl gap-4 md:grid-cols-3">
            <article className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t("yearTotalIncome")}</p>
              <p className="mt-2 text-2xl font-bold text-emerald-300">
                {formatMoney(data.total_income, language)}
              </p>
            </article>
            <article className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t("yearGoal")}</p>
              <p className="mt-2 text-2xl font-bold">
                {data.goal_amount > 0 ? formatMoney(data.goal_amount, language) : t("notSet")}
              </p>
            </article>
            <article className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t("remainingToGoal")}</p>
              <p className="mt-2 text-2xl font-bold text-amber-300">
                {formatMoney(data.remaining_amount, language)}
              </p>
            </article>
          </section>

          <section className="mx-auto mt-4 w-full max-w-5xl rounded-2xl border border-emerald-700/70 bg-emerald-900/20 p-4">
            <div className="flex items-end justify-between gap-3">
              <p className="text-sm font-semibold">{t("pathToGoal")}</p>
              <p className="text-lg font-bold text-emerald-200">
                {formatDecimal(data.progress_percent, language)}%
              </p>
            </div>
            <div className="mt-3 h-4 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-lime-300 to-amber-300 transition-all duration-700"
                style={{ width: progressWidth }}
              />
            </div>
          </section>

          <section className="mx-auto mt-6 w-full max-w-5xl">
            <article className="rounded-2xl border border-cyan-700/60 bg-cyan-950/20 p-6 shadow-[0_0_0_1px_rgba(6,182,212,0.15)]">
              <h2 className="text-lg font-semibold">{t("addIncome")}</h2>
              <input
                type="number"
                min={1}
                value={incomeInput}
                onChange={(event) => setIncomeInput(event.target.value)}
                className="mt-4 w-full rounded-lg border border-cyan-700/60 bg-slate-950 px-4 py-3 text-base outline-none ring-cyan-400 focus:ring"
                placeholder={t("incomeAmount")}
              />
              <input
                type="text"
                value={incomeNote}
                onChange={(event) => setIncomeNote(event.target.value)}
                className="mt-3 w-full rounded-lg border border-cyan-700/60 bg-slate-950 px-4 py-3 text-base outline-none ring-cyan-400 focus:ring"
                placeholder={t("noteOptional")}
              />
              <button
                type="button"
                onClick={() => void addIncome()}
                disabled={isAddingIncome}
                className="mt-4 rounded-lg bg-cyan-500 px-5 py-3 text-base font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
              >
                {isAddingIncome ? t("adding") : t("addIncome")}
              </button>
            </article>
          </section>

          <section className="mx-auto mt-6 w-full max-w-5xl rounded-2xl border border-emerald-700/50 bg-emerald-950/15 p-5 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]">
            <h2 className="text-xl font-bold text-emerald-100">{t("incomeHistory")}</h2>
            {data.entries.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">{t("noIncomeAdded")}</p>
            ) : (
              <div className="mt-4 space-y-3">
                {data.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-xl border border-emerald-700/40 bg-slate-950/85 px-4 py-3"
                  >
                    {editingEntryId === entry.id ? (
                      <div className="flex-1">
                        <div className="grid gap-2 sm:grid-cols-3">
                          <input
                            type="number"
                            min={1}
                            value={editAmountInput}
                            onChange={(event) => setEditAmountInput(event.target.value)}
                            className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs outline-none ring-emerald-400 focus:ring"
                          />
                          <input
                            type="text"
                            value={editNoteInput}
                            onChange={(event) => setEditNoteInput(event.target.value)}
                            className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs outline-none ring-emerald-400 focus:ring"
                          />
                          <input
                            type="date"
                            value={editDateInput}
                            onChange={(event) => setEditDateInput(event.target.value)}
                            className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs outline-none ring-emerald-400 focus:ring"
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-semibold text-emerald-300">
                          +{formatMoney(entry.amount, language)}
                        </p>
                        <p className="text-xs text-slate-400">{entry.note || t("noNote")}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      {editingEntryId === entry.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void saveEdit(entry.id)}
                            disabled={isSavingEdit}
                            className="rounded-md border border-emerald-500/60 px-2 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-60"
                          >
                            {isSavingEdit ? t("saving") : t("save")}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-md border border-slate-500/60 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-500/15"
                          >
                            {t("cancel")}
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-slate-400">
                            {formatReadableShamsiDate(entry.received_on, language)}
                          </p>
                          <button
                            type="button"
                            onClick={() => startEdit(entry)}
                            className="rounded-md border border-cyan-500/60 px-2 py-1 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/15"
                          >
                            {t("edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteIncome(entry.id)}
                            disabled={deletingEntryId === entry.id}
                            className="rounded-md border border-rose-500/60 px-2 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/15 disabled:opacity-60"
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
        </>
      ) : null}
    </main>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LanguageToggle } from "@/components/language-toggle";
import { AppearanceToggle } from "@/components/appearance-toggle";
import {
  TIMER_STORAGE_KEY,
  advanceTimerPhase,
  createTimerState,
  getTimerDurationMs,
  getTimerRemainingMs,
  normalizeTimerState,
  pauseTimer,
  resetTimer,
  restoreTimerState,
  selectTimerPhase,
  startTimer,
  validateTimerMinutes,
  type TimerState,
} from "@/lib/focus-timer";
import { useLanguage } from "@/lib/use-language";

function formatCountdown(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function currentTimeMs(): number {
  return Date.now();
}

export function FocusTimer() {
  const { isPersian, t } = useLanguage();
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [focusDraft, setFocusDraft] = useState("25");
  const [restDraft, setRestDraft] = useState("5");
  const [settingsError, setSettingsError] = useState("");
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const now = currentTimeMs();
      let restored = createTimerState();
      try {
        const saved = window.localStorage.getItem(TIMER_STORAGE_KEY);
        if (saved) restored = restoreTimerState(JSON.parse(saved), now);
      } catch {
        setStorageError(true);
      }
      setTimer(restored);
      setFocusDraft(String(restored.focusMinutes));
      setRestDraft(String(restored.restMinutes));
      setNowMs(now);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!timer) return;
    try {
      window.localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timer));
    } catch {
      window.setTimeout(() => setStorageError(true), 0);
    }
  }, [timer]);

  useEffect(() => {
    if (timer?.status !== "running") return;
    const tick = () => {
      const now = currentTimeMs();
      setNowMs(now);
      setTimer((current) => current ? normalizeTimerState(current, now) : current);
    };
    const interval = window.setInterval(tick, 250);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [timer?.status]);

  function updateTimer(change: (state: TimerState, now: number) => TimerState) {
    const now = currentTimeMs();
    setNowMs(now);
    setTimer((current) => current ? change(normalizeTimerState(current, now), now) : current);
  }

  function saveDurations(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const focusMinutes = validateTimerMinutes(focusDraft);
    const restMinutes = validateTimerMinutes(restDraft);
    if (focusMinutes === null || restMinutes === null) {
      setSettingsError(t("timerDurationError"));
      return;
    }
    setSettingsError("");
    setTimer(createTimerState(focusMinutes, restMinutes));
  }

  const remainingMs = timer ? getTimerRemainingMs(timer, nowMs) : 0;
  const durationMs = timer ? getTimerDurationMs(timer) : 1;
  const progress = timer ? Math.min(100, Math.max(0, (1 - remainingMs / durationMs) * 100)) : 0;
  const isRunning = timer?.status === "running";
  const isCompleted = timer?.status === "completed";
  const nextPhase = timer?.phase === "focus" ? "rest" : "focus";

  return (
    <main dir={isPersian ? "rtl" : "ltr"} className="sp-page min-h-screen px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-6 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-[#d9e4de] bg-white p-4 shadow-sm sm:p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Smart Paper</p>
            <h1 className="mt-1 text-3xl font-bold">{t("timerTitle")}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LanguageToggle />
            <AppearanceToggle />
            <Link href="/" className="inline-flex min-h-11 items-center rounded-xl border border-[#b6c9bf] bg-[#f1f5f2] px-4 py-2 text-sm font-semibold hover:border-teal-700 hover:text-teal-800">
              {t("backToPlanner")}
            </Link>
          </div>
        </header>

        <section aria-labelledby="timer-phase-heading" className="overflow-hidden rounded-[2rem] border border-[#c9ded6] bg-gradient-to-b from-[#ecf8f1] via-white to-white px-5 py-8 text-center shadow-sm sm:px-10 sm:py-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">{t("timerEyebrow")}</p>
          <h2 id="timer-phase-heading" className="mt-2 text-2xl font-bold sm:text-3xl">
            {timer?.phase === "rest" ? t("timerRest") : t("timerFocus")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#536660]">
            {timer?.phase === "rest" ? t("timerRestDescription") : t("timerFocusDescription")}
          </p>
          <div className="mt-5 inline-flex gap-1 rounded-full border border-[#b6c9bf] bg-white p-1" role="group" aria-label={t("timerChoosePhase")}>
            {(["focus", "rest"] as const).map((phase) => (
              <button
                key={phase}
                type="button"
                disabled={!timer || isRunning}
                aria-pressed={timer?.phase === phase}
                onClick={() => updateTimer((state) => selectTimerPhase(state, phase))}
                className={`min-h-10 rounded-full px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${timer?.phase === phase ? "bg-teal-700 text-white" : "text-[#16443e] hover:bg-[#e7f4ef]"}`}
              >
                {phase === "focus" ? t("timerFocus") : t("timerRest")}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-[#536660]">{t("timerChoosePhaseHint")}</p>

          <div aria-hidden="true" className="relative mx-auto mt-5 h-48 w-40 sm:h-56 sm:w-48">
            <svg viewBox="0 0 160 190" className="h-full w-full drop-shadow-[0_12px_15px_rgba(15,118,110,0.12)]">
              <defs>
                <clipPath id="timer-sand-top"><path d="M24 20 H136 Q130 63 85 94 H75 Q30 63 24 20 Z" /></clipPath>
                <clipPath id="timer-sand-bottom"><path d="M75 96 H85 Q130 127 136 170 H24 Q30 127 75 96 Z" /></clipPath>
              </defs>
              <path d="M24 20 H136 Q130 63 85 94 H75 Q30 63 24 20 Z M75 96 H85 Q130 127 136 170 H24 Q30 127 75 96 Z" fill="#e7f4ef" stroke="#0f766e" strokeWidth="5" strokeLinejoin="round" />
              <rect x="20" y={20 + progress * 0.75} width="120" height={Math.max(0, 75 - progress * 0.75)} fill="#d69a54" clipPath="url(#timer-sand-top)" />
              <rect x="20" y={170 - progress * 0.75} width="120" height={progress * 0.75} fill="#d69a54" clipPath="url(#timer-sand-bottom)" />
              <path d="M15 18 H145 M15 172 H145" stroke="#125b53" strokeWidth="8" strokeLinecap="round" />
            </svg>
          </div>

          <div className="mt-1 font-mono text-[clamp(3.7rem,15vw,6.5rem)] font-semibold leading-none tabular-nums tracking-tight text-[#16443e]" dir="ltr" aria-hidden="true">
            {timer ? formatCountdown(remainingMs) : "--:--"}
          </div>
          <div className="sr-only" role="timer" aria-live="off">
            {timer ? t("timerTimeRemaining", { time: formatCountdown(remainingMs) }) : t("loading")}
          </div>
          <p className="mt-3 text-sm font-medium text-[#536660]" role="status" aria-live="polite">
            {timer?.status === "completed" ? t("timerComplete") : timer?.status === "paused" ? t("timerPaused") : isRunning ? t("timerRunning") : t("timerReady")}
          </p>
          <div className="mx-auto mt-6 max-w-sm">
            <div className="h-2 overflow-hidden rounded-full bg-[#d9e4de]" role="progressbar" aria-label={t("timerProgress")} aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-teal-700" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {isCompleted ? (
              <button type="button" onClick={() => updateTimer((state) => advanceTimerPhase(state))} className="min-h-12 rounded-xl bg-teal-700 px-6 py-3 font-semibold text-white hover:bg-teal-800">
                {nextPhase === "rest" ? t("timerPrepareRest") : t("timerPrepareFocus")}
              </button>
            ) : isRunning ? (
              <button type="button" onClick={() => updateTimer(pauseTimer)} className="min-h-12 rounded-xl bg-teal-700 px-6 py-3 font-semibold text-white hover:bg-teal-800">
                {t("timerPause")}
              </button>
            ) : (
              <button type="button" disabled={!timer} onClick={() => updateTimer(startTimer)} className="min-h-12 rounded-xl bg-teal-700 px-6 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
                {timer?.status === "paused" ? t("timerResume") : t("timerStart")}
              </button>
            )}
            <button type="button" disabled={!timer} onClick={() => updateTimer((state) => resetTimer(state))} className="min-h-12 rounded-xl border border-[#b6c9bf] bg-white px-6 py-3 font-semibold text-[#172b29] hover:border-teal-700 disabled:opacity-50">
              {t("timerReset")}
            </button>
          </div>
          {isCompleted ? <p className="mt-4 text-sm text-[#536660]">{t("timerNextDoesNotStart")}</p> : null}
        </section>

        <section className="rounded-3xl border border-[#d9e4de] bg-white p-5 shadow-sm sm:p-6" aria-labelledby="timer-settings-heading">
          <h2 id="timer-settings-heading" className="text-xl font-bold">{t("timerSettings")}</h2>
          <p className="mt-1 text-sm text-[#536660]">{t("timerSettingsHint")}</p>
          <form onSubmit={saveDurations} className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm font-semibold">
              {t("timerFocusMinutes")}
              <input type="number" min="1" max="999" step="1" inputMode="numeric" required value={focusDraft} onChange={(event) => setFocusDraft(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[#b6c9bf] bg-white px-4 text-base" />
            </label>
            <label className="flex-1 text-sm font-semibold">
              {t("timerRestMinutes")}
              <input type="number" min="1" max="999" step="1" inputMode="numeric" required value={restDraft} onChange={(event) => setRestDraft(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[#b6c9bf] bg-white px-4 text-base" />
            </label>
            <button type="submit" disabled={!timer} className="min-h-12 rounded-xl border border-teal-700 px-5 font-semibold text-teal-800 hover:bg-[#e7f4ef] disabled:opacity-50">
              {t("timerApplyDurations")}
            </button>
          </form>
          {settingsError ? <p role="alert" className="mt-3 text-sm text-red-700">{settingsError}</p> : null}
          {storageError ? <p role="alert" className="mt-3 text-sm text-red-700">{t("timerStorageError")}</p> : null}
        </section>
      </div>
    </main>
  );
}

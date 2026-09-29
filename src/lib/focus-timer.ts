export type TimerPhase = "focus" | "rest";
export type TimerStatus = "idle" | "running" | "paused" | "completed";

export type TimerState = {
  focusMinutes: number;
  restMinutes: number;
  phase: TimerPhase;
  status: TimerStatus;
  remainingMs: number;
  deadlineMs: number | null;
};

export const TIMER_STORAGE_KEY = "smart-paper.focus-timer.v1";

export function validateTimerMinutes(value: string): number | null {
  if (!/^[1-9]\d{0,2}$/.test(value)) return null;
  const minutes = Number(value);
  return minutes <= 999 ? minutes : null;
}

export function createTimerState(focusMinutes = 25, restMinutes = 5): TimerState {
  return {
    focusMinutes,
    restMinutes,
    phase: "focus",
    status: "idle",
    remainingMs: focusMinutes * 60_000,
    deadlineMs: null,
  };
}

export function getTimerDurationMs(state: TimerState): number {
  return (state.phase === "focus" ? state.focusMinutes : state.restMinutes) * 60_000;
}

export function getTimerRemainingMs(state: TimerState, nowMs: number): number {
  return state.status === "running" && state.deadlineMs !== null
    ? Math.max(0, state.deadlineMs - nowMs)
    : state.remainingMs;
}

export function normalizeTimerState(state: TimerState, nowMs: number): TimerState {
  if (state.status !== "running" || getTimerRemainingMs(state, nowMs) > 0) return state;
  return { ...state, status: "completed", remainingMs: 0, deadlineMs: null };
}

export function startTimer(state: TimerState, nowMs: number): TimerState {
  if (state.status !== "idle" && state.status !== "paused") return state;
  const remainingMs = Math.max(1, state.remainingMs);
  return { ...state, status: "running", remainingMs, deadlineMs: nowMs + remainingMs };
}

export function pauseTimer(state: TimerState, nowMs: number): TimerState {
  const current = normalizeTimerState(state, nowMs);
  if (current.status !== "running") return current;
  return {
    ...current,
    status: "paused",
    remainingMs: getTimerRemainingMs(current, nowMs),
    deadlineMs: null,
  };
}

export function resetTimer(state: TimerState): TimerState {
  return {
    ...state,
    status: "idle",
    remainingMs: getTimerDurationMs(state),
    deadlineMs: null,
  };
}

export function selectTimerPhase(state: TimerState, phase: TimerPhase): TimerState {
  if (state.status === "running") return state;
  return {
    ...state,
    phase,
    status: "idle",
    remainingMs: (phase === "focus" ? state.focusMinutes : state.restMinutes) * 60_000,
    deadlineMs: null,
  };
}

export function advanceTimerPhase(state: TimerState): TimerState {
  if (state.status !== "completed") return state;
  const phase = state.phase === "focus" ? "rest" : "focus";
  return {
    ...state,
    phase,
    status: "idle",
    remainingMs: (phase === "focus" ? state.focusMinutes : state.restMinutes) * 60_000,
    deadlineMs: null,
  };
}

export function restoreTimerState(value: unknown, nowMs: number): TimerState {
  if (!value || typeof value !== "object") return createTimerState();
  const data = value as Partial<TimerState>;
  if (
    validateTimerMinutes(String(data.focusMinutes)) === null ||
    validateTimerMinutes(String(data.restMinutes)) === null ||
    (data.phase !== "focus" && data.phase !== "rest") ||
    !["idle", "running", "paused", "completed"].includes(data.status ?? "") ||
    typeof data.remainingMs !== "number" ||
    !Number.isFinite(data.remainingMs) ||
    data.remainingMs < 0 ||
    data.remainingMs > 999 * 60_000 ||
    (data.deadlineMs !== null &&
      (typeof data.deadlineMs !== "number" || !Number.isFinite(data.deadlineMs)))
  ) return createTimerState();

  const restored = data as TimerState;
  if (restored.status === "running" && restored.deadlineMs === null) return createTimerState(restored.focusMinutes, restored.restMinutes);
  return normalizeTimerState(restored, nowMs);
}

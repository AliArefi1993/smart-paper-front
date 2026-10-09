// A lock, fresh unlock, or unmount invalidates all work from the previous session.
export class FinanceSessionLifecycle {
  private generation = 0;

  begin(): number {
    return ++this.generation;
  }

  current(): number {
    return this.generation;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  async validate(
    generation: number,
    check: () => Promise<Response>,
    onExpired: () => void,
  ): Promise<boolean> {
    if (!this.isCurrent(generation)) return false;
    const response = await check();
    if (!this.isCurrent(generation)) return false;
    if (response.status === 403) {
      onExpired();
      return false;
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}${response.statusText ? `: ${response.statusText}` : ""}`);
    }
    return this.isCurrent(generation);
  }
}

export const FINANCE_SESSION_CHECK_MS = 30_000;

export function watchFinanceSession(
  windowTarget: Pick<Window, "setInterval" | "clearInterval" | "addEventListener" | "removeEventListener">,
  documentTarget: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">,
  recheck: () => Promise<unknown>,
): () => void {
  const check = () => { void recheck(); };
  const visible = () => {
    if (documentTarget.visibilityState === "visible") check();
  };
  const interval = windowTarget.setInterval(check, FINANCE_SESSION_CHECK_MS);
  windowTarget.addEventListener("focus", check);
  documentTarget.addEventListener("visibilitychange", visible);
  check();
  return () => {
    windowTarget.clearInterval(interval);
    windowTarget.removeEventListener("focus", check);
    documentTarget.removeEventListener("visibilitychange", visible);
  };
}

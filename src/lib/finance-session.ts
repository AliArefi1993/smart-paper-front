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

type FinanceVisibilitySnapshot = { initialized: boolean; visible: boolean };

export function watchFinanceVisibility(
  getSnapshot: () => FinanceVisibilitySnapshot,
  subscribe: (listener: () => void) => () => void,
  onHidden: () => void,
): () => void {
  let lastVisible: boolean | null = getSnapshot().initialized
    ? getSnapshot().visible
    : null;
  return subscribe(() => {
    const next = getSnapshot();
    if (!next.initialized) return;
    const wasVisible = lastVisible;
    lastVisible = next.visible;
    if (!next.visible && wasVisible !== false) onHidden();
  });
}

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

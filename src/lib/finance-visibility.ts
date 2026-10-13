export const FINANCE_VISIBILITY_KEY = "smart-paper.local.finance-visibility";

export type FinanceVisibilitySnapshot = {
  initialized: boolean;
  visible: boolean;
  error: "unavailable" | "save" | "malformed" | "missing" | null;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type Listener = () => void;

const initialSnapshot: FinanceVisibilitySnapshot = {
  initialized: false,
  visible: true,
  error: null,
};

export function createFinanceVisibilityStore(getStorage: () => StorageLike) {
  let snapshot = initialSnapshot;
  let listeners = new Set<Listener>();
  let pendingChoice: boolean | null = null;

  function publish(next: FinanceVisibilitySnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function getSnapshot() {
    return snapshot;
  }

  function subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function initialize() {
    if (snapshot.initialized) return snapshot;

    try {
      const storage = getStorage();
      const saved = storage.getItem(FINANCE_VISIBILITY_KEY);
      if (saved === "visible" || saved === "hidden") {
        publish({ initialized: true, visible: saved === "visible", error: null });
        return snapshot;
      }

      const malformed = saved !== null;
      const visible = true;
      let error: FinanceVisibilitySnapshot["error"] = malformed ? "malformed" : null;
      if (!malformed) {
        try {
          storage.setItem(FINANCE_VISIBILITY_KEY, visible ? "visible" : "hidden");
        } catch {
          error = "save";
        }
      }
      publish({ initialized: true, visible, error });
    } catch {
      publish({ initialized: true, visible: true, error: "unavailable" });
    }
    return snapshot;
  }

  function setVisible(visible: boolean) {
    initialize();
    try {
      getStorage().setItem(FINANCE_VISIBILITY_KEY, visible ? "visible" : "hidden");
      pendingChoice = null;
      publish({ initialized: true, visible, error: null });
      return true;
    } catch {
      pendingChoice = visible;
      publish({ ...snapshot, error: "save" });
      return false;
    }
  }

  function retry() {
    initialize();
    let storage: StorageLike;
    let saved: string | null;
    try {
      storage = getStorage();
      saved = storage.getItem(FINANCE_VISIBILITY_KEY);
    } catch {
      publish({ ...snapshot, error: "unavailable" });
      return false;
    }
    if (pendingChoice === null && (saved === "visible" || saved === "hidden")) {
      publish({ initialized: true, visible: saved === "visible", error: null });
      return true;
    }
    const desiredVisible = pendingChoice ?? snapshot.visible;
    try {
      storage.setItem(FINANCE_VISIBILITY_KEY, desiredVisible ? "visible" : "hidden");
      pendingChoice = null;
      publish({ initialized: true, visible: desiredVisible, error: null });
      return true;
    } catch {
      publish({ ...snapshot, error: "save" });
      return false;
    }
  }

  function syncFromStorage() {
    let value: string | null;
    try {
      value = getStorage().getItem(FINANCE_VISIBILITY_KEY);
    } catch {
      publish({ ...snapshot, error: "unavailable" });
      return;
    }
    if (value === "visible" || value === "hidden") {
      const visible = value === "visible";
      if (pendingChoice === visible) pendingChoice = null;
      publish({ initialized: true, visible, error: pendingChoice === null ? null : "save" });
    } else {
      publish({ ...snapshot, error: value === null ? "missing" : "malformed" });
    }
  }

  function resetForTests() {
    snapshot = initialSnapshot;
    pendingChoice = null;
    listeners = new Set();
  }

  return { getSnapshot, subscribe, initialize, setVisible, retry, syncFromStorage, resetForTests };
}

const financeVisibilityStore = createFinanceVisibilityStore(() => window.localStorage);

export const getFinanceVisibilitySnapshot = financeVisibilityStore.getSnapshot;
export const subscribeFinanceVisibility = financeVisibilityStore.subscribe;
export const initializeFinanceVisibility = financeVisibilityStore.initialize;
export const setFinanceVisible = financeVisibilityStore.setVisible;
export const retryFinanceVisibility = financeVisibilityStore.retry;

export function listenForFinanceVisibilityChanges() {
  function onStorage(event: StorageEvent) {
    if (event.key === FINANCE_VISIBILITY_KEY) {
      financeVisibilityStore.syncFromStorage();
    }
  }
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

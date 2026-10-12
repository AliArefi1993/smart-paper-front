"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getFinanceVisibilitySnapshot,
  initializeFinanceVisibility,
  listenForFinanceVisibilityChanges,
  subscribeFinanceVisibility,
} from "@/lib/finance-visibility";

const isLocalDataMode = process.env.NEXT_PUBLIC_DATA_MODE === "local";
const backendSnapshot = { initialized: true, visible: true, error: null } as const;
const localServerSnapshot = { initialized: false, visible: true, error: null } as const;

export function useFinanceVisibility() {
  const snapshot = useSyncExternalStore(
    subscribeFinanceVisibility,
    getFinanceVisibilitySnapshot,
    () => isLocalDataMode ? localServerSnapshot : backendSnapshot,
  );

  useEffect(() => {
    if (!isLocalDataMode) return;
    const stopListening = listenForFinanceVisibilityChanges();
    initializeFinanceVisibility();
    return stopListening;
  }, []);

  return isLocalDataMode ? snapshot : backendSnapshot;
}

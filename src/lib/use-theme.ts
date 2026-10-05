"use client";

import { useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "smart-paper-theme";
const CHANGE_EVENT = "smart-paper-theme-change";

function readTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return document.documentElement.classList.contains("sp-dark") ? "dark" : "light";
  }
}

function subscribe(onChange: () => void): () => void {
  function syncStoredTheme(event: StorageEvent) {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    document.documentElement.classList.toggle("sp-dark", readTheme() === "dark");
    onChange();
  }

  window.addEventListener("storage", syncStoredTheme);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", syncStoredTheme);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function setTheme(theme: ThemeMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The current page still changes if storage is unavailable.
  }
  document.documentElement.classList.toggle("sp-dark", theme === "dark");
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useTheme(): ThemeMode {
  return useSyncExternalStore(subscribe, readTheme, () => "light");
}

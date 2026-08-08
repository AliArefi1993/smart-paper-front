"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type AppLanguage,
  type TranslationKey,
  getStoredLanguage,
  interpolate,
  setStoredLanguage,
  translate,
} from "@/lib/i18n";

export function useLanguage() {
  const [language, setLanguageState] = useState<AppLanguage>("en");

  useEffect(() => {
    function syncLanguage() {
      setLanguageState(getStoredLanguage());
    }

    syncLanguage();
    window.addEventListener("storage", syncLanguage);
    window.addEventListener("smart-paper-language-change", syncLanguage);
    return () => {
      window.removeEventListener("storage", syncLanguage);
      window.removeEventListener("smart-paper-language-change", syncLanguage);
    };
  }, []);

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    setStoredLanguage(nextLanguage);
    setLanguageState(nextLanguage);
  }, []);

  const t = useCallback((key: TranslationKey, values?: Record<string, string | number>): string => {
    const translated = translate(language, key);
    return values ? interpolate(translated, values) : translated;
  }, [language]);

  return {
    language,
    isPersian: language === "fa",
    setLanguage,
    t,
  };
}

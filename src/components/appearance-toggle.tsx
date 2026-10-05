"use client";

import { setTheme, useTheme } from "@/lib/use-theme";
import { useLanguage } from "@/lib/use-language";

export function AppearanceToggle() {
  const theme = useTheme();
  const { t } = useLanguage();

  return (
    <div className="sp-appearance-toggle col-span-2 flex min-h-11 items-center gap-1 rounded-full border p-1 sm:col-span-1" role="group" aria-label={t("appearance")}>
      <button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")} className="min-h-9 rounded-full px-3 py-1.5 text-sm font-semibold transition">
        {t("lightMode")}
      </button>
      <button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")} className="min-h-9 rounded-full px-3 py-1.5 text-sm font-semibold transition">
        {t("darkMode")}
      </button>
    </div>
  );
}

"use client";

import { useLanguage } from "@/lib/use-language";
import { useTheme } from "@/lib/use-theme";

type LanguageToggleProps = {
  tone?: "dark" | "light";
};

export function LanguageToggle({ tone = "light" }: LanguageToggleProps) {
  const { language, setLanguage, t } = useLanguage();
  const theme = useTheme();
  const isDark = tone === "dark" || theme === "dark";

  return (
    <label
      className={`flex min-h-11 min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm ${
        isDark
          ? "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--foreground)]"
          : "border-slate-300 bg-white text-slate-800"
      }`}
    >
      {t("language")}
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value === "fa" ? "fa" : "en")}
        className={`min-h-9 min-w-0 rounded-lg border px-2 py-1 text-sm outline-none ${
          isDark
            ? "border-[color-mix(in_srgb,var(--muted-foreground)_60%,var(--surface))] bg-[var(--surface)] text-[var(--foreground)] focus:border-[var(--primary)]"
            : "border-slate-300 bg-slate-50 text-slate-900 focus:border-teal-700"
        }`}
      >
        <option value="en">{t("english")}</option>
        <option value="fa">{t("persian")}</option>
      </select>
    </label>
  );
}

"use client";

import { useLanguage } from "@/lib/use-language";

type LanguageToggleProps = {
  tone?: "dark" | "light";
};

export function LanguageToggle({ tone = "light" }: LanguageToggleProps) {
  const { language, setLanguage, t } = useLanguage();
  const isDark = tone === "dark";

  return (
    <label
      className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm ${
        isDark
          ? "border-slate-600 bg-slate-800 text-slate-100"
          : "border-slate-300 bg-white text-slate-800"
      }`}
    >
      {t("language")}
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value === "fa" ? "fa" : "en")}
        className={`min-h-9 rounded-lg border px-2 py-1 text-sm outline-none focus:border-teal-700 ${
          isDark
            ? "border-slate-600 bg-slate-950 text-slate-100"
            : "border-slate-300 bg-slate-50 text-slate-900"
        }`}
      >
        <option value="en">{t("english")}</option>
        <option value="fa">{t("persian")}</option>
      </select>
    </label>
  );
}

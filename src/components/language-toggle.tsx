"use client";

import { useLanguage } from "@/lib/use-language";

export function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <label className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100">
      {t("language")}
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value === "fa" ? "fa" : "en")}
        className="rounded-lg border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-teal-400"
      >
        <option value="en">{t("english")}</option>
        <option value="fa">{t("persian")}</option>
      </select>
    </label>
  );
}

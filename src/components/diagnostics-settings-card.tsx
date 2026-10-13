"use client";

import { useState } from "react";
import { diagnosticButtonClass, useDiagnostics, useDiagnosticsCopy, useDiagnosticsLimits } from "@/components/diagnostics-root";
import { ReportProblemButton } from "@/components/report-problem-button";
import type { DiagnosticCategory } from "@/lib/local-diagnostics";

export function DiagnosticsSettingsCard() {
  const diagnostics = useDiagnostics();
  const c = useDiagnosticsCopy();
  const limits = useDiagnosticsLimits();
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempted, setAttempted] = useState<{ category: DiagnosticCategory; enabled: boolean } | null>(null);
  if (!diagnostics || process.env.NEXT_PUBLIC_DATA_MODE !== "local") return null;
  function change(category: DiagnosticCategory, enabled: boolean) {
    if (!diagnostics) return;
    setAttempted({ category, enabled });
    const success = diagnostics.changePreference(category, enabled);
    setSaved(success); setFailed(!success);
  }
  return <section id="local-diagnostics" className="mx-auto mt-6 w-full max-w-5xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--foreground)]">
    <h2 className="text-lg font-semibold">{c("Local diagnostics", "عیب‌یابی روی دستگاه")}</h2>
    <p className="mt-2 text-sm leading-6">{c("Errors and feature counts stay on this device. Nothing is uploaded automatically. You decide what to include when emailing a report.", "خطاها و شمارش استفاده روی همین دستگاه می‌مانند. هیچ داده‌ای خودکار ارسال نمی‌شود. هنگام ایمیل گزارش، خودتان داده‌های افزوده را انتخاب می‌کنید.")}</p>
    <p className="mt-2 text-sm leading-6">{c("Changes save immediately. Turning off stops new recording and keeps existing records.", "تغییرات بلافاصله ذخیره می‌شوند. خاموش کردن، ثبت تازه را متوقف می‌کند و داده‌های قبلی را نگه می‌دارد.")}</p>
    {(["errors", "usage"] as const).map(category => <div key={category} className="mt-3">
      <label className="flex min-h-12 items-center gap-3"><input type="checkbox" className="h-6 w-6 accent-teal-700" checked={diagnostics.preferences[category]} disabled={!diagnostics.initialized} aria-describedby={`diagnostic-${category}-help`}
        onChange={event => change(category, event.target.checked)} /><span className="font-semibold">{category === "errors" ? c("Record local errors", "ثبت خطاهای محلی") : c("Count feature use", "شمارش استفاده از بخش‌ها")}</span></label>
      <p id={`diagnostic-${category}-help`} className="text-sm leading-6">{category === "errors" ? c("Records coarse route, action and static error codes.", "بخش، عملیات و کد ثابت خطا را ثبت می‌کند.") : c("Counts daily feature visits and observed operation outcomes. No tap or writing history.", "بازدید روزانه از بخش‌ها و نتیجهٔ عملیات قابل مشاهده را می‌شمارد. سابقهٔ لمس یا نوشتن ثبت نمی‌شود.")}</p>
    </div>)}
    {!diagnostics.initialized && <p role="status" className="mt-3">{c("Loading local diagnostics…", "در حال خواندن داده‌های عیب‌یابی…")}</p>}
    {(failed || (diagnostics.initialized && diagnostics.preferences.unavailable)) && <div className="mt-3 rounded-xl bg-[var(--surface-muted)] p-3">
      <p role="alert" className="text-sm leading-6">{c("Recording preferences could not be read or saved fully. Affected categories stay off until their choices can be saved. Retry saves the indicated category only; you can also use its checkbox.", "تنظیمات ثبت کامل خوانده یا ذخیره نشد. دسته‌های مشکل‌دار تا ذخیره شدن انتخابشان خاموش می‌مانند. تلاش دوباره فقط دستهٔ مشخص را ذخیره می‌کند؛ می‌توانید از گزینهٔ آن نیز استفاده کنید.")}</p>
      <div className="mt-2 flex flex-wrap gap-2">{attempted ? <button type="button" className={diagnosticButtonClass} onClick={() => change(attempted.category, attempted.enabled)}>{c("Retry last choice", "تلاش دوباره برای انتخاب قبلی")}</button> : (["errors", "usage"] as const).map(category => <button key={category} type="button" className={diagnosticButtonClass} onClick={() => change(category, false)}>{category === "errors" ? c("Retry errors: keep off", "تلاش دوباره برای خطاها: خاموش بماند") : c("Retry counts: keep off", "تلاش دوباره برای شمارش: خاموش بماند")}</button>)}</div>
    </div>}
    {saved && !failed && <p role="status" className="mt-3 text-sm">{c("Recording choice saved.", "انتخاب ثبت ذخیره شد.")}</p>}
    <p className="mt-3 text-sm leading-6">{c("Your writing, Finance records and PIN are excluded from automatic evidence.", "نوشته‌ها، اطلاعات مالی و رمز شما در داده‌های خودکار ثبت نمی‌شوند.")}</p>
    <p className="mt-2 text-sm leading-6">{limits}</p>
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={diagnosticButtonClass} disabled={!diagnostics.initialized} onClick={event => diagnostics.openInspection(event.currentTarget)}>{c("Inspect recorded data", "دیدن داده‌های ثبت‌شده")}</button><ReportProblemButton /></div>
  </section>;
}

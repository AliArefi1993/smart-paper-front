"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLanguage } from "@/lib/use-language";
import { copyDiagnosticReport, openDiagnosticEmail, SUPPORT_EMAIL } from "@/lib/diagnostic-email";
import {
  activateLocalDiagnosticsAfterDisclosure, deleteLocalDiagnostics, formatLocalDiagnosticReport,
  DIAGNOSTIC_PREFERENCES_KEY,
  inspectLocalDiagnostics, prepareLocalDiagnosticReport, readDiagnosticPreferences,
  recordLocalError, recordRouteUse, setDiagnosticPreference,
  type DiagnosticCategory, type DiagnosticData, type DiagnosticPreferences, type DiagnosticRoute,
} from "@/lib/local-diagnostics";

const LOCAL = process.env.NEXT_PUBLIC_DATA_MODE === "local";
const ACK_KEY = "smart-paper.diagnostics.disclosure.v1";
export const diagnosticButtonClass = "min-h-12 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-muted)] disabled:opacity-50";
const primaryClass = "min-h-12 rounded-xl border border-teal-700 bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50";
export function useDiagnosticsCopy() {
  const { isPersian } = useLanguage();
  return (en: string, fa: string) => isPersian ? fa : en;
}
export function useDiagnosticsLimits() {
  const c = useDiagnosticsCopy();
  return c("Only recent data is kept: up to 14 days, 200 errors and 128 KiB combined. Sudden app crashes may not be recorded.", "فقط داده‌های اخیر نگه داشته می‌شوند: حداکثر ۱۴ روز، ۲۰۰ خطا و مجموع ۱۲۸ کیبی‌بایت. بسته شدن ناگهانی برنامه ممکن است ثبت نشود.");
}
type Context = {
  initialized: boolean; preferences: DiagnosticPreferences;
  changePreference: (category: DiagnosticCategory, enabled: boolean) => boolean;
  openReport: (origin: HTMLElement) => void; openInspection: (origin: HTMLElement) => void;
};
const DiagnosticsContext = createContext<Context | null>(null);
export const useDiagnostics = () => useContext(DiagnosticsContext);
const routes: Record<string, DiagnosticRoute> = { "/": "planner", "/ideas": "ideas", "/timer": "timer", "/finance": "finance", "/summaries": "summaries", "/export": "export", "/settings": "settings" };
type Stage = "compose" | "preview" | "inspection" | "delete" | "discard";

export function DiagnosticsRoot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { language, isPersian } = useLanguage();
  const c = useDiagnosticsCopy();
  const limits = useDiagnosticsLimits();
  const [disclosureRendered, setDisclosureRendered] = useState(false);
  const [notice, setNotice] = useState(false);
  const [noticeError, setNoticeError] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [preferences, setPreferences] = useState<DiagnosticPreferences>({ errors: false, usage: false, unavailable: true });
  const [opened, setOpened] = useState(false);
  const [stage, setStage] = useState<Stage>("compose");
  const [returnStage, setReturnStage] = useState<Stage>("compose");
  const [inspectionReturn, setInspectionReturn] = useState<"compose" | "preview" | "close">("close");
  const [description, setDescription] = useState("");
  const [includeErrors, setIncludeErrors] = useState(false);
  const [includeUsage, setIncludeUsage] = useState(false);
  const [data, setData] = useState<DiagnosticData | null>(null);
  const [dataFailed, setDataFailed] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const closingApproved = useRef(false);
  const [feedback, setFeedback] = useState("");
  const [failure, setFailure] = useState("");
  const [deleteCategory, setDeleteCategory] = useState<DiagnosticCategory | "all">("all");
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  const lastVisit = useRef<string | null>(null);

  useEffect(() => {
    if (!LOCAL) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      let acknowledged = false;
    try {
      acknowledged = window.localStorage.getItem(ACK_KEY) === "1"
        && window.localStorage.getItem(DIAGNOSTIC_PREFERENCES_KEY) !== null;
    } catch { /* Keep disclosure visible when unreadable. */ }
      setNotice(!acknowledged);
      setDisclosureRendered(true);
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!LOCAL || !disclosureRendered) return;
    // A separate committed render shows disclosure before defaults can collect anything.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      activateLocalDiagnosticsAfterDisclosure();
      setPreferences(readDiagnosticPreferences());
      setInitialized(true);
    });
    return () => { cancelled = true; };
  }, [disclosureRendered]);
  const normalizedPath = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  const route = routes[normalizedPath] ?? "unknown";
  useEffect(() => {
    if (!LOCAL || !initialized) return;
    const runtimeError = () => recordLocalError({ route, action: "runtime", code: "JS_RUNTIME_ERROR" });
    const rejection = () => recordLocalError({ route, action: "runtime", code: "JS_UNHANDLED_REJECTION" });
    window.addEventListener("error", runtimeError);
    window.addEventListener("unhandledrejection", rejection);
    return () => { window.removeEventListener("error", runtimeError); window.removeEventListener("unhandledrejection", rejection); };
  }, [initialized, route]);
  useEffect(() => {
    if (!LOCAL || !initialized || !preferences.usage || route === "unknown") return;
    const today = new Date();
    const key = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}:${route}`;
    if (lastVisit.current === key) return;
    lastVisit.current = key;
    recordRouteUse(route);
  }, [initialized, preferences.usage, route]);
  useEffect(() => {
    if (!opened) return;
    if (!dialog.current?.open) dialog.current?.showModal();
    heading.current?.focus();
  }, [opened, stage]);

  function refreshData() {
    try {
      const nextData = inspectLocalDiagnostics();
      if (snapshot !== null && data !== null && JSON.stringify(data) !== JSON.stringify(nextData)) {
        setSnapshot(null);
        setInspectionReturn("compose");
      }
      setData(nextData); setDataFailed(false);
    }
    catch { setData(null); setDataFailed(true); }
  }
  function changePreference(category: DiagnosticCategory, enabled: boolean) {
    if (!initialized) return false;
    let saved = true;
    try { setDiagnosticPreference(category, enabled); } catch { saved = false; }
    setPreferences(readDiagnosticPreferences());
    return saved;
  }
  function openReport(element: HTMLElement) {
    closingApproved.current = false;
    origin.current = element;
    setDescription(""); setIncludeErrors(false); setIncludeUsage(false); setSnapshot(null);
    setFeedback(""); setFailure(""); setStage("compose"); setInspectionReturn("close");
    refreshData(); setOpened(true);
  }
  function openInspection(element: HTMLElement) {
    closingApproved.current = false;
    origin.current = element; setDescription(""); setSnapshot(null); setFeedback(""); setFailure("");
    setInspectionReturn("close"); refreshData(); setStage("inspection"); setOpened(true);
  }
  function close() {
    if (busyRef.current) return;
    closingApproved.current = true;
    dialog.current?.close(); setOpened(false); setDescription(""); setSnapshot(null); setFailure("");
    origin.current?.focus();
  }
  function requestClose() {
    if (busyRef.current || stage === "discard") return;
    if (description.length > 0) { setReturnStage(stage); setStage("discard"); }
    else close();
  }
  function review() {
    setFailure(""); setFeedback("");
    try {
      const report = prepareLocalDiagnosticReport({ appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
        platform: Capacitor.isNativePlatform() ? "android" : "web", language,
        description, includeErrors, includeUsage });
      setSnapshot(formatLocalDiagnosticReport(report)); setStage("preview");
    } catch { setFailure(c("Could not prepare the selected evidence. Your writing is kept. Retry or uncheck the evidence.", "داده‌های انتخاب‌شده آماده نشد. نوشتهٔ شما حفظ شده است. دوباره تلاش کنید یا انتخاب داده‌ها را بردارید.")); }
  }
  async function transfer(kind: "email" | "copy") {
    if (!snapshot || busyRef.current) return;
    busyRef.current = true; setBusy(true); setFailure(""); setFeedback("");
    try {
      if (kind === "email") {
        const result = await openDiagnosticEmail(snapshot);
        setFeedback(result === "draft-opened"
          ? c("Email app requested. Review there and send when ready. Smart Paper cannot confirm that a draft opened or was sent.", "درخواست باز کردن برنامهٔ ایمیل انجام شد. آنجا بررسی و در زمان مناسب ارسال کنید. باز شدن پیش‌نویس یا ارسال آن قابل تأیید نیست.")
          : c("Email handoff requested. This browser cannot confirm an email app opened or that the report was sent. If email did not open, copy the report.", "درخواست باز کردن ایمیل انجام شد. مرورگر نمی‌تواند باز شدن برنامه یا ارسال گزارش را تأیید کند. اگر ایمیل باز نشد، گزارش را کپی کنید."));
      } else {
        if (!await copyDiagnosticReport(snapshot)) throw new Error();
        setFeedback(c("Report copied to your clipboard. Paste it into your email, review it, then send.", "گزارش در کلیپ‌بورد کپی شد. آن را در ایمیل بچسبانید، بررسی و سپس ارسال کنید."));
      }
    } catch {
      setFailure(kind === "email"
        ? c("Could not open email. Your report is still here. Try again or copy it into an email.", "ایمیل باز نشد. گزارش شما اینجا باقی است. دوباره تلاش کنید یا آن را در ایمیل کپی کنید.")
        : c("Could not copy. Select the report text below and copy it manually.", "کپی انجام نشد. متن گزارش را در پایین انتخاب کنید و دستی کپی کنید."));
    } finally { busyRef.current = false; setBusy(false); }
  }
  function removeData() {
    setFailure("");
    try {
      deleteLocalDiagnostics(deleteCategory); refreshData();
      setSnapshot(null); setIncludeErrors(false); setIncludeUsage(false);
      setInspectionReturn(previous => previous === "preview" ? "compose" : previous);
      setFeedback(c("Selected recorded data deleted. Recording settings stay unchanged.", "داده‌های ثبت‌شدهٔ انتخابی حذف شدند. تنظیمات ثبت تغییر نکردند."));
      setStage("inspection");
    } catch { setFailure(c("Deletion failed. No success was confirmed. Retry or cancel.", "حذف انجام نشد. موفقیت تأیید نشد. دوباره تلاش کنید یا لغو کنید.")); }
  }
  function dismissDisclosure() {
    try {
      window.localStorage.setItem(ACK_KEY, "1");
      if (window.localStorage.getItem(ACK_KEY) !== "1") throw new Error();
      setNotice(false); setNoticeError(false);
    } catch { setNoticeError(true); }
  }
  const categoryName = (category: DiagnosticCategory | "all") => category === "errors" ? c("local errors", "خطاهای محلی") : category === "usage" ? c("feature counts", "شمارش استفاده") : c("errors and feature counts", "خطاها و شمارش استفاده");
  function evidenceSummary(category: DiagnosticCategory) {
    if (!initialized) return c("Loading local diagnostics…", "در حال خواندن داده‌های عیب‌یابی…");
    if (dataFailed) return c("Evidence unavailable. Retry inspection.", "داده‌ها در دسترس نیستند. مشاهده را دوباره امتحان کنید.");
    const rows = data?.[category] ?? [];
    if (!rows.length) return c("No recorded data. This does not mean no errors occurred.", "داده‌ای ثبت نشده است. این به معنی رخ ندادن خطا نیست.");
    const days = rows.map(row => row.day).sort();
    return `${rows.length} ${c(category === "errors" ? "records" : "daily buckets", category === "errors" ? "رکورد" : "گروه روزانه")} · ${days[0]} — ${days[days.length - 1]}`;
  }
  if (!LOCAL) return children;
  return <DiagnosticsContext.Provider value={{ initialized, preferences, changePreference, openReport, openInspection }}>
    {notice && <aside dir={isPersian ? "rtl" : "ltr"} className="m-4 mx-auto w-[calc(100%-2rem)] max-w-5xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--foreground)]">
      <h2 className="font-semibold">{c("New local recording settings", "تنظیمات تازهٔ ثبت روی دستگاه")}</h2>
      <p className="mt-2 text-sm leading-6">{c("Local errors and feature counts are recorded on this device by default. They exclude your writing, Finance records and PIN. You can turn either off in Settings. Nothing uploads automatically; only your deliberate email or copy action transfers a report.", "خطاهای محلی و شمارش استفاده به‌طور پیش‌فرض روی همین دستگاه ثبت می‌شوند. نوشته‌ها، اطلاعات مالی و رمز ثبت نمی‌شوند. می‌توانید هرکدام را در تنظیمات خاموش کنید. هیچ داده‌ای خودکار ارسال نمی‌شود؛ فقط با انتخاب ایمیل یا کپی، گزارش منتقل می‌شود.")}</p>
      {initialized && preferences.unavailable && <p role="alert" className="mt-2">{c("Recording preferences could not be initialized fully. Affected categories stay off. Retry in Settings.", "تنظیمات ثبت کامل آماده نشد. دسته‌های مشکل‌دار خاموش می‌مانند. در تنظیمات دوباره تلاش کنید.")}</p>}
      <div className="mt-3 flex flex-wrap gap-2"><Link className={diagnosticButtonClass} href="/settings#local-diagnostics">{c("Open diagnostics settings", "باز کردن تنظیمات عیب‌یابی")}</Link><button className={diagnosticButtonClass} onClick={dismissDisclosure}>{c("Got it", "متوجه شدم")}</button></div>
      {noticeError && <p role="alert">{c("Could not save dismissal. This notice remains visible; try again.", "بستن پیام ذخیره نشد. پیام باقی می‌ماند؛ دوباره تلاش کنید.")}</p>}
    </aside>}
    {children}
    <dialog ref={dialog} aria-labelledby="diagnostic-heading" dir={isPersian ? "rtl" : "ltr"}
      onKeyDownCapture={event => {
        if (event.key === "Escape") {
          event.preventDefault(); event.stopPropagation(); requestClose();
        }
      }}
      onCancel={event => { event.preventDefault(); requestClose(); }}
      onClose={() => {
        if (!opened || closingApproved.current) return;
        // Some platform close requests cannot be cancelled. Keep an unfinished
        // report visible until its description is deliberately discarded.
        if (description.length > 0 || busyRef.current) {
          if (!dialog.current?.open) dialog.current?.showModal();
          requestClose(); heading.current?.focus();
        } else close();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-[720px] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--foreground)] backdrop:bg-black/50 sm:p-6">
      <h2 id="diagnostic-heading" ref={heading} tabIndex={-1} className="text-2xl font-bold outline-none">{stage === "discard" ? c("Discard this description?", "این توضیح کنار گذاشته شود؟") : stage === "inspection" || stage === "delete" ? c("Inspect recorded data", "دیدن داده‌های ثبت‌شده") : stage === "preview" ? c("Review report", "بررسی گزارش") : c("Report a problem", "گزارش مشکل")}</h2>
      {stage === "compose" && <div className="mt-4 grid gap-3">
        <label htmlFor="diagnostic-description" className="font-semibold">{c("What happened?", "چه اتفاقی افتاد؟")}</label>
        <textarea id="diagnostic-description" dir="auto" maxLength={4000} rows={6} value={description}
          onChange={event => { setDescription(event.target.value); setSnapshot(null); }} aria-describedby="diagnostic-description-help"
          className="min-h-40 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 font-[inherit] leading-7" />
        <p id="diagnostic-description-help" className="text-sm leading-6">{c("Optional. Describe what you expected and what happened. Anything you type will be visible to the email recipient. This description is not saved on this device.", "اختیاری است. بنویسید چه انتظاری داشتید و چه اتفاقی افتاد. متن شما برای گیرندهٔ ایمیل قابل مشاهده است. این توضیح روی دستگاه ذخیره نمی‌شود.")}</p>
        <p><bdi dir="ltr">{description.length} / 4000</bdi></p>
        {(["errors", "usage"] as const).map(category => <div key={category}>
          <label className="flex min-h-12 items-center gap-3"><input type="checkbox" className="h-6 w-6 accent-teal-700" checked={category === "errors" ? includeErrors : includeUsage}
            disabled={!initialized || !data?.[category].length || dataFailed} aria-describedby={`diagnostic-${category}-summary`}
            onChange={event => { if (category === "errors") setIncludeErrors(event.target.checked); else setIncludeUsage(event.target.checked); setSnapshot(null); }} />
            {category === "errors" ? c("Include local errors", "افزودن خطاهای محلی") : c("Include feature counts", "افزودن شمارش استفاده")}</label>
          <p id={`diagnostic-${category}-summary`} className="text-sm"><bdi>{evidenceSummary(category)}</bdi></p>
        </div>)}
        <p className="text-sm leading-6">{limits}</p>
        <div className="flex flex-wrap gap-2"><button className={primaryClass} onClick={review} disabled={!initialized}>{c("Review report", "بررسی گزارش")}</button>
          <button className={diagnosticButtonClass} disabled={!initialized} onClick={() => { setInspectionReturn("compose"); refreshData(); setStage("inspection"); }}>{c("Inspect recorded data", "دیدن داده‌های ثبت‌شده")}</button>
          <button className={diagnosticButtonClass} onClick={requestClose}>{c("Close report", "بستن گزارش")}</button></div>
      </div>}
      {stage === "preview" && snapshot !== null && <div className="mt-4 grid gap-3">
        <p>{c("To", "گیرنده")}: <bdi dir="ltr">{SUPPORT_EMAIL}</bdi></p>
        <p>{c("Subject", "موضوع")}: <bdi dir="ltr">Smart Paper problem report</bdi></p>
        <textarea aria-label={c("Exact report body", "متن دقیق گزارش")} readOnly value={snapshot} dir="ltr" rows={14} className="min-h-56 w-full resize-y whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 font-[inherit] text-sm leading-6 [overflow-wrap:anywhere]" />
        <p className="text-sm leading-6">{c("Opens your email app. Review there and send when ready. Internet is only needed for email delivery.", "برنامهٔ ایمیل باز می‌شود. آنجا بررسی کنید و وقتی آماده بودید ارسال کنید. اینترنت فقط برای تحویل ایمیل لازم است.")}</p>
        <p className="text-sm leading-6">{c("Copying puts this exact report on your clipboard. Clipboard copies and email drafts are outside Smart Paper deletion control.", "کپی، همین گزارش دقیق را در کلیپ‌بورد قرار می‌دهد. نسخهٔ کلیپ‌بورد و پیش‌نویس ایمیل با حذف در اسمارت پیپر پاک نمی‌شوند.")}</p>
        <div className="flex flex-wrap gap-2"><button className={primaryClass} disabled={busy} onClick={() => void transfer("email")}>{c("Email Smart Paper", "ایمیل به اسمارت پیپر")}</button><button className={diagnosticButtonClass} disabled={busy} onClick={() => void transfer("copy")}>{c("Copy report", "کپی گزارش")}</button><button className={diagnosticButtonClass} disabled={busy} onClick={() => { setSnapshot(null); setFeedback(""); setFailure(""); setStage("compose"); }}>{c("Edit report", "ویرایش گزارش")}</button><button className={diagnosticButtonClass} disabled={busy} onClick={() => { setInspectionReturn("preview"); refreshData(); setStage("inspection"); }}>{c("Inspect recorded data", "دیدن داده‌های ثبت‌شده")}</button><button className={diagnosticButtonClass} disabled={busy} onClick={requestClose}>{c("Close report", "بستن گزارش")}</button></div>
      </div>}
      {(stage === "inspection" || stage === "delete") && <div className="mt-4 grid gap-3">
        <p className="text-sm leading-6">{limits}</p>
        {(["errors", "usage"] as const).map(category => <section key={category} className="min-w-0"><h3 className="font-semibold">{categoryName(category)}</h3><p className="text-sm"><bdi>{evidenceSummary(category)}</bdi></p>{data?.[category].length ? <pre dir="ltr" className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-[var(--surface-muted)] p-3 text-sm leading-6 [overflow-wrap:anywhere]">{JSON.stringify(data[category], null, 2)}</pre> : null}</section>)}
        {dataFailed && <button className={diagnosticButtonClass} onClick={refreshData}>{c("Retry inspection", "تلاش دوباره برای مشاهده")}</button>}
        {stage === "delete" ? <><p>{c("Delete", "حذف")}: {categoryName(deleteCategory)}?</p><p className="text-sm leading-6">{c("Your Planner, Ideas and Finance records are kept. Recording settings stay unchanged. Other categories are kept.", "اطلاعات برنامه‌ریزی، ایده‌ها و مالی حفظ می‌شوند. تنظیمات ثبت تغییر نمی‌کنند. دسته‌های دیگر حفظ می‌شوند.")}</p><div className="flex flex-wrap gap-2"><button className={primaryClass} onClick={() => { setFailure(""); setStage("inspection"); }}>{c("Cancel", "لغو")}</button><button className={diagnosticButtonClass} onClick={removeData}>{c("Delete selected data", "حذف داده‌های انتخابی")}</button></div></>
          : <div className="flex flex-wrap gap-2">{(["errors", "usage", "all"] as const).map(category => <button key={category} disabled={!initialized} className={diagnosticButtonClass} onClick={() => { setDeleteCategory(category); setFeedback(""); setFailure(""); setStage("delete"); }}>{c("Delete", "حذف")} {categoryName(category)}</button>)}<button className={primaryClass} onClick={() => { setFailure(""); if (inspectionReturn === "close") close(); else setStage(inspectionReturn); }}>{c("Back", "بازگشت")}</button></div>}
      </div>}
      {stage === "discard" && <div className="mt-4 flex flex-wrap gap-2"><button className={primaryClass} onClick={() => setStage(returnStage)}>{c("Keep writing", "ادامهٔ نوشتن")}</button><button className={diagnosticButtonClass} onClick={close}>{c("Discard description", "کنار گذاشتن توضیح")}</button></div>}
      {busy && <p role="status" className="mt-3">{c("Preparing handoff…", "در حال آماده‌سازی انتقال…")}</p>}
      {failure && <p role="alert" className="mt-3 rounded-xl bg-[var(--surface-muted)] p-3">{failure}</p>}
      {feedback && <p role="status" className="mt-3">{feedback}</p>}
    </dialog>
  </DiagnosticsContext.Provider>;
}

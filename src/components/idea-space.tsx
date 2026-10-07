"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LanguageToggle } from "@/components/language-toggle";
import { AppearanceToggle } from "@/components/appearance-toggle";
import { dailyIdeaNote, readIdeaNotes, writeIdeaNotes, type IdeaNote } from "@/lib/idea-notes";
import { commitIdeaDraft, IdeaDraftCommitError, ideaDraftIssue, isIdeaDraftDirty, newIdeaDraft, readIdeaDraft, writeIdeaDraft, IDEA_DRAFT_KEY, type IdeaDraft } from "@/lib/idea-draft";
import { useLanguage } from "@/lib/use-language";

// Failed device writes survive SPA navigation in this process only.
let failedDraft: IdeaDraft | null = null;

const SPARKS = ["ideasSpark1", "ideasSpark2", "ideasSpark3", "ideasSpark4"] as const;


function dayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function scatterScore(id: string, day: string): number {
  let score = 0;
  for (const character of `${id}${day}`) score = (score * 31 + character.charCodeAt(0)) | 0;
  return score;
}

export function IdeaSpace() {
  const { isPersian, language, t } = useLanguage();
  const [notes, setNotes] = useState<IdeaNote[]>([]);
  const [draft, setDraft] = useState<IdeaDraft>(newIdeaDraft);
  const [draftError, setDraftError] = useState<"load" | "write" | "cleanup" | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const body = draft.body;
  const editingId = draft.mode === "edit" ? draft.source?.id : null;
  const parentId = draft.mode === "branch" ? draft.source?.id : null;
  const [sparkIndex, setSparkIndex] = useState<number | null>(null);
  const [sparksOpen, setSparksOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const localMode = process.env.NEXT_PUBLIC_DATA_MODE === "local";

  const c = (en: string, fa: string) => isPersian ? fa : en;

  function loadWriting() {
    try {
      const saved = readIdeaNotes(window.localStorage);
      const retainedInSession = failedDraft !== null;
      const restored = failedDraft ?? readIdeaDraft(window.localStorage);
      setNotes(saved);
      setDraft(restored);
      setLoaded(true);
      setDraftError(retainedInSession ? "write" : null);
      if (ideaDraftIssue(restored, saved) === "committed") {
        try { window.localStorage.removeItem(IDEA_DRAFT_KEY); setDraft(newIdeaDraft()); failedDraft = null; setMessage(t("ideasSaved")); }
        catch { setDraftError("cleanup"); }
      } else if (retainedInSession) {
        setMessage(c("Unfinished writing kept in this session. It is not a saved thought yet.", "نوشته ناتمام در این نشست حفظ شد. هنوز فکر ذخیره‌شده نیست."));
      } else if (restored.body || restored.mode !== "new") {
        setMessage(restored.mode === "edit"
          ? c("Edit draft restored. Changes are not saved to the note yet.", "پیش‌نویس ویرایش بازیابی شد. تغییرات هنوز در یادداشت ذخیره نشده‌اند.")
          : restored.mode === "branch"
            ? c("Branch draft restored. It is not a saved thought yet.", "پیش‌نویس شاخه بازیابی شد. هنوز فکر ذخیره‌شده نیست.")
            : c("New draft restored. It is not a saved thought yet.", "پیش‌نویس تازه بازیابی شد. هنوز فکر ذخیره‌شده نیست."));
      }
    } catch { setDraftError("load"); }
  }

  useEffect(() => {
    if (!localMode) return;
    const timeout = window.setTimeout(loadWriting, 0);
    return () => window.clearTimeout(timeout);
    // Loading runs only on mount; changing language must not replace writing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localMode]);

  function updateDraft(next: IdeaDraft) {
    setDraft(next);
    setMessage("");
    setSaveFailed(false);
    try { writeIdeaDraft(window.localStorage, next); failedDraft = null; setDraftError(null); }
    catch { failedDraft = next; setDraftError("write"); }
  }

  const today = dayKey();
  const featured = useMemo(() => dailyIdeaNote(notes, today), [notes, today]);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return notes.filter((note) => !needle || note.body.toLocaleLowerCase().includes(needle))
      .sort((a, b) => scatterScore(a.id, today) - scatterScore(b.id, today));
  }, [notes, query, today]);
  const parent = draft.mode === "branch" ? draft.source : null;
  const issue = ideaDraftIssue(draft, notes);
  const committed = issue === "committed";
  const needsDecision = issue === "missing" || issue === "conflict";
  const latest = notes.find((note) => note.id === (draft.source?.id ?? draft.receipt?.id));

  function resetComposer() {
    if (isIdeaDraftDirty(draft) && !committed && !window.confirm(c(
      "Discard unsaved writing? Continuing discards current writing. Keep editing to save it first.",
      "نوشته ذخیره‌نشده کنار گذاشته شود؟ ادامه دادن نوشته فعلی را کنار می‌گذارد. برای ذخیره، ابتدا ویرایش را ادامه دهید."))) return;
    try { window.localStorage.removeItem(IDEA_DRAFT_KEY); }
    catch { setDraftError(committed ? "cleanup" : "write"); return; }
    setDraft(newIdeaDraft());
    failedDraft = null;
    setDraftError(null);
    setSaveFailed(false);
    setMessage("");
    setSparkIndex(null);
    setSparksOpen(false);
  }

  function saveWriting(activeDraft = draft) {
    if (!activeDraft.body.trim() && !committed) { setError(t("ideasEmptyError")); inputRef.current?.focus(); return; }
    try {
      const current = readIdeaNotes(window.localStorage);
      setNotes(current);
      const currentIssue = ideaDraftIssue(activeDraft, current);
      if (currentIssue === "missing" || currentIssue === "conflict") return;
      const result = commitIdeaDraft(window.localStorage, activeDraft,
        window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`, new Date().toISOString());
      setNotes(result.notes);
      setDraft(result.draft);
      failedDraft = null;
      setDraftError(result.cleanupFailed ? "cleanup" : null);
      setError("");
      setSaveFailed(false);
      setMessage(result.cleanupFailed ? "" : t("ideasSaved"));
    } catch (cause) {
      if (cause instanceof IdeaDraftCommitError) {
        setDraft(cause.draft);
        failedDraft = cause.recoveryFailed ? cause.draft : null;
        setDraftError(cause.recoveryFailed ? "write" : null);
      }
      setSaveFailed(true);
      setError(t("ideasSaveError"));
      setMessage("");
    }
  }

  function selectNote(note: IdeaNote, mode: "edit" | "branch") {
    if (committed) { setDraftError("cleanup"); return; }
    if (isIdeaDraftDirty(draft) && !window.confirm(c(
      "Discard unsaved writing? Continuing discards current writing. Keep editing to save it first.",
      "نوشته ذخیره‌نشده کنار گذاشته شود؟ ادامه دادن نوشته فعلی را کنار می‌گذارد. برای ذخیره، ابتدا ویرایش را ادامه دهید."))) return;
    updateDraft({ version: 1, mode, body: mode === "edit" ? note.body : "", source: note, receipt: null });
    setError("");
    setSparkIndex(null);
    setSparksOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function editNote(note: IdeaNote) { selectNote(note, "edit"); }
  function branchFrom(note: IdeaNote) { selectNote(note, "branch"); }

  function deleteNote(note: IdeaNote) {
    if (committed) { setDraftError("cleanup"); return; }
    if (!window.confirm(t("ideasDeleteConfirm"))) return;
    try {
      const next = readIdeaNotes(window.localStorage).filter((item) => item.id !== note.id);
      writeIdeaNotes(window.localStorage, next);
      setNotes(next);
      setError("");
      setMessage(t("ideasDeleted"));
      // Keep the active draft; a missing origin/target requires an explicit
      // independent-save decision instead of silently discarding writing.
    } catch { setError(t("ideasSaveError")); setMessage(""); }
  }

  const cardClass = "rounded-[1.25rem] border border-[#d9e4de] bg-white p-5";
  const smallButton = "min-h-11 rounded-full border border-[#bfd3c7] bg-white px-4 py-2 text-sm font-semibold text-[#125b53] hover:bg-[#e7f4ef]";

  return (
    <main dir={isPersian ? "rtl" : "ltr"} className="sp-page min-h-screen px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1.5rem+env(safe-area-inset-top))] md:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">Smart Paper</p>
            <h1 className="mt-1 text-3xl font-bold text-[#163c36]">{t("ideasTitle")}</h1>
          </div>
          <div className="flex flex-wrap gap-2"><LanguageToggle /><AppearanceToggle /><Link href="/" className={smallButton}>{t("backToPlanner")}</Link></div>
        </header>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#536660]">{t("ideasIntro")}</p>

        {!localMode ? <p role="alert" className="mt-6 rounded-xl bg-amber-50 p-4 text-amber-900">{t("ideasLocalOnly")}</p> : null}
        {error ? <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
        {message ? <p role="status" className="mt-5 text-sm font-semibold text-emerald-800">{message}</p> : null}

        {draftError ? <div role="alert" className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <p>{draftError === "load" ? c("Could not read the stored draft or thoughts. Existing draft was left untouched. Retry loading before writing.", "خواندن پیش‌نویس یا فکرهای ذخیره‌شده ممکن نشد. پیش‌نویس قبلی دست‌نخورده است. پیش از نوشتن دوباره بارگذاری کنید.")
            : draftError === "cleanup" ? c("Thought saved. Old draft cleanup failed; retry cleanup before leaving. Do not save again.", "فکر ذخیره شد. پاک‌کردن پیش‌نویس قبلی انجام نشد؛ پیش از خروج دوباره تلاش کنید. دوباره ذخیره نکنید.")
            : c("Draft recovery could not be saved. Your writing is here, but may be lost after closing. Retry before leaving.", "پیش‌نویس برای بازیابی ذخیره نشد. نوشته اینجاست، اما ممکن است پس از بستن از دست برود. پیش از خروج دوباره تلاش کنید.")}</p>
          {draftError === "load" ? <button type="button" onClick={loadWriting} className={`mt-3 ${smallButton}`}>{c("Retry loading", "بارگذاری دوباره")}</button>
            : draftError === "write" ? <button type="button" onClick={() => updateDraft(draft)} className={`mt-3 ${smallButton}`}>{c("Retry draft recovery", "تلاش دوباره برای بازیابی پیش‌نویس")}</button> : null}
        </div> : null}
        {localMode && loaded ? <>
          <section className="mt-7 rounded-[1.5rem] border border-[#d9e4de] bg-[#e7f4ef] p-4 sm:p-6" aria-labelledby="ideas-write-heading">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-800">{t("ideasEyebrow")}</p>
            <h2 id="ideas-write-heading" className="mt-2 text-2xl font-bold leading-snug text-[#172b29]">{editingId ? t("ideasEditHeading") : t("ideasWriteHeading")}</h2>
            {parent ? <p className="mt-3 rounded-xl border-s-4 border-teal-600 bg-white/80 p-3 text-sm text-[#38534b]">{t("ideasBranching")}: {parent.body.slice(0, 120)}</p> : null}
            {needsDecision ? <div role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              <p>{issue === "missing" ? c("The original thought is missing. Your writing is retained.", "فکر اصلی موجود نیست. نوشته حفظ شده است.") : c("The saved thought changed. Review both versions before choosing how to keep your writing.", "فکر ذخیره‌شده تغییر کرده است. پیش از انتخاب روش نگه‌داشتن نوشته، هر دو نسخه را بررسی کنید.")}</p>
              {latest ? <details className="mt-3"><summary className="cursor-pointer font-semibold">{c("Latest saved thought", "آخرین فکر ذخیره‌شده")}</summary><p className="mt-2 whitespace-pre-wrap break-words">{latest.body}</p></details> : null}
              <button type="button" onClick={() => { const independent = newIdeaDraft(body); updateDraft(independent); saveWriting(independent); inputRef.current?.focus(); }} className="mt-3 min-h-12 rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white hover:bg-teal-800">{c("Keep as new thought", "نگه‌داشتن به‌عنوان فکر تازه")}</button>
            </div> : null}
            <form onSubmit={(event) => { event.preventDefault(); saveWriting(); }} className="mt-5">
              <label htmlFor="idea-body" className="sr-only">{t("ideasBodyLabel")}</label>
              <textarea id="idea-body" ref={inputRef} value={body} readOnly={committed} dir="auto" onChange={(event) => updateDraft({ ...draft, body: event.target.value, receipt: null })} rows={5} placeholder={t("ideasPlaceholder")} className="w-full resize-y rounded-[1.25rem] border border-[#b6cfc0] bg-white p-4 text-lg leading-relaxed text-[#173c36] placeholder:text-[#6a8178]" />
              <div className="mt-4">
                <button type="button" aria-expanded={sparksOpen} aria-controls="idea-sparks" onClick={() => setSparksOpen((open) => !open)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-2 text-start text-sm font-semibold text-[#125b53] hover:bg-white/70">
                  <span>{t("ideasSparksLabel")}</span><span aria-hidden="true">{sparksOpen ? "−" : "+"}</span>
                </button>
                <div id="idea-sparks" className={sparksOpen ? "mt-2 flex flex-wrap gap-2" : "hidden"} role="group" aria-label={t("ideasSparksLabel")}>
                  {SPARKS.map((key, index) => <button key={key} type="button" aria-pressed={sparkIndex === index} onClick={() => { setSparkIndex(index); setSparksOpen(false); inputRef.current?.focus(); }} className={sparkIndex === index ? "min-h-11 rounded-full border border-teal-700 bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800" : smallButton}>{t(key)}</button>)}
                </div>
              </div>
              {sparkIndex !== null ? <div className="mt-2 flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-[#38534b]">{t(SPARKS[sparkIndex])}…</p><button type="button" onClick={() => setSparkIndex(null)} className="min-h-11 rounded-full px-3 text-sm font-semibold text-[#125b53] hover:bg-white/70">{t("ideasClearSpark")}</button></div> : null}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="submit" disabled={needsDecision} className="disabled:opacity-60 min-h-12 w-full rounded-xl bg-teal-700 px-6 py-3 font-semibold text-white hover:bg-teal-800 sm:w-auto">{committed ? c("Retry cleanup", "تلاش دوباره برای پاک‌کردن") : saveFailed ? c("Retry saving", "تلاش دوباره برای ذخیره") : editingId ? t("ideasSaveChanges") : t("ideasKeepThought")}</button>
                {(editingId || parentId || body) ? <button type="button" onClick={resetComposer} className={smallButton}>{t("cancel")}</button> : null}
              </div>
            </form>
          </section>
          <p className="mt-3 px-2 text-xs text-[#536660]">{t("ideasPrivateHint")}</p>

          {featured ? <section className="mt-6 rounded-[1.25rem] border border-[#e4d8ba] bg-[#fffaf0] p-5 sm:p-6" aria-labelledby="ideas-return-heading">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#825e25]">{t("ideasReturnEyebrow")}</p>
            <h2 id="ideas-return-heading" className="mt-1 text-xl font-bold">{t("ideasReturnHeading")}</h2>
            <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed">{featured.body}</p>
            <button type="button" onClick={() => branchFrom(featured)} className={`mt-4 ${smallButton}`}>{t("ideasBranchButton")}</button>
          </section> : null}

          <section className="mt-9" aria-labelledby="ideas-collection-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-800">{t("ideasCollectionEyebrow")}</p><h2 id="ideas-collection-heading" className="mt-1 text-2xl font-bold">{t("ideasCollectionHeading")}</h2></div>
              {notes.length > 0 ? <><label htmlFor="ideas-search" className="sr-only">{t("ideasSearch")}</label><input id="ideas-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("ideasSearch")} className="min-h-11 w-full rounded-xl border border-[#b6cfc0] bg-white px-4 sm:max-w-xs" /></> : null}
            </div>
            {notes.length === 0 ? <p className="mt-5 rounded-2xl border border-dashed border-[#b6cfc0] p-8 text-center text-[#536660]">{t("ideasEmpty")}</p> : visible.length === 0 ? <p className="mt-5 text-[#536660]">{t("ideasNoMatches")}</p> :
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {visible.map((note) => {
                  const origin = notes.find((item) => item.id === note.parent_id);
                  return <article key={note.id} className={cardClass}>
                    {origin ? <p className="mb-3 border-s-2 border-teal-500 ps-3 text-xs text-[#536660]">{t("ideasFromThought")}: {origin.body.slice(0, 70)}{origin.body.length > 70 ? "…" : ""}</p> : null}
                    <p className="whitespace-pre-wrap break-words leading-relaxed text-[#173c36]">{note.body}</p>
                    <p className="mt-4 text-xs text-[#536660]">{new Intl.DateTimeFormat(language === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium" }).format(new Date(note.created_at))}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => branchFrom(note)} className={smallButton}>{t("ideasBranchButton")}</button>
                      <button type="button" onClick={() => editNote(note)} className={smallButton}>{t("edit")}</button>
                      <button type="button" onClick={() => deleteNote(note)} className="min-h-10 rounded-full px-3 text-sm font-semibold text-rose-800 hover:bg-rose-50">{t("delete")}</button>
                    </div>
                  </article>;
                })}
              </div>}
          </section>
        </> : null}
      </div>
    </main>
  );
}

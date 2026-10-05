"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LanguageToggle } from "@/components/language-toggle";
import { AppearanceToggle } from "@/components/appearance-toggle";
import { dailyIdeaNote, readIdeaNotes, writeIdeaNotes, type IdeaNote } from "@/lib/idea-notes";
import { useLanguage } from "@/lib/use-language";

const SPARKS = ["ideasSpark1", "ideasSpark2", "ideasSpark3", "ideasSpark4"] as const;
const DRAFT_KEY = "smart-paper.local.idea-draft";

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
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [sparkIndex, setSparkIndex] = useState<number | null>(null);
  const [sparksOpen, setSparksOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const localMode = process.env.NEXT_PUBLIC_DATA_MODE === "local";

  useEffect(() => {
    if (!localMode) return;
    const timeout = window.setTimeout(() => {
      try {
        setNotes(readIdeaNotes(window.localStorage));
        setBody(window.localStorage.getItem(DRAFT_KEY) ?? "");
        setLoaded(true);
      }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Idea notes could not be loaded."); }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [localMode]);

  useEffect(() => {
    if (!loaded || !localMode || editingId) return;
    try {
      if (body) window.localStorage.setItem(DRAFT_KEY, body);
      else window.localStorage.removeItem(DRAFT_KEY);
    } catch { /* Saving the note will show a storage error if the device is full. */ }
  }, [body, editingId, loaded, localMode]);

  const today = dayKey();
  const featured = useMemo(() => dailyIdeaNote(notes, today), [notes, today]);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return notes.filter((note) => !needle || note.body.toLocaleLowerCase().includes(needle))
      .sort((a, b) => scatterScore(a.id, today) - scatterScore(b.id, today));
  }, [notes, query, today]);
  const parent = notes.find((note) => note.id === parentId);

  function persist(next: IdeaNote[], success: string): boolean {
    try {
      writeIdeaNotes(window.localStorage, next);
      setNotes(next);
      setError("");
      setMessage(success);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("ideasSaveError"));
      setMessage("");
      return false;
    }
  }

  function resetComposer() {
    setBody("");
    setEditingId(null);
    setParentId(null);
    setSparkIndex(null);
    setSparksOpen(false);
  }

  function saveNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = body.trim();
    if (!value) { setError(t("ideasEmptyError")); inputRef.current?.focus(); return; }
    const now = new Date().toISOString();
    const next = editingId
      ? notes.map((note) => note.id === editingId ? { ...note, body: value, updated_at: now } : note)
      : [{ id: window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`, body: value, created_at: now, updated_at: now, parent_id: parentId }, ...notes];
    if (persist(next, t("ideasSaved"))) resetComposer();
  }

  function editNote(note: IdeaNote) {
    setEditingId(note.id);
    setParentId(null);
    setBody(note.body);
    setSparkIndex(null);
    setSparksOpen(false);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function branchFrom(note: IdeaNote) {
    setEditingId(null);
    setParentId(note.id);
    setBody("");
    setSparkIndex(null);
    setSparksOpen(false);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function deleteNote(note: IdeaNote) {
    if (!window.confirm(t("ideasDeleteConfirm"))) return;
    if (persist(notes.filter((item) => item.id !== note.id), t("ideasDeleted")) && editingId === note.id) resetComposer();
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

        {localMode && loaded ? <>
          <section className="mt-7 rounded-[1.5rem] border border-[#d9e4de] bg-[#e7f4ef] p-4 sm:p-6" aria-labelledby="ideas-write-heading">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-800">{t("ideasEyebrow")}</p>
            <h2 id="ideas-write-heading" className="mt-2 text-2xl font-bold leading-snug text-[#172b29]">{editingId ? t("ideasEditHeading") : t("ideasWriteHeading")}</h2>
            {parent ? <p className="mt-3 rounded-xl border-s-4 border-teal-600 bg-white/80 p-3 text-sm text-[#38534b]">{t("ideasBranching")}: {parent.body.slice(0, 120)}</p> : null}
            <form onSubmit={saveNote} className="mt-5">
              <label htmlFor="idea-body" className="sr-only">{t("ideasBodyLabel")}</label>
              <textarea id="idea-body" ref={inputRef} value={body} onChange={(event) => setBody(event.target.value)} rows={5} placeholder={t("ideasPlaceholder")} className="w-full resize-y rounded-[1.25rem] border border-[#b6cfc0] bg-white p-4 text-lg leading-relaxed text-[#173c36] placeholder:text-[#6a8178]" />
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
                <button type="submit" className="min-h-12 w-full rounded-xl bg-teal-700 px-6 py-3 font-semibold text-white hover:bg-teal-800 sm:w-auto">{editingId ? t("ideasSaveChanges") : t("ideasKeepThought")}</button>
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

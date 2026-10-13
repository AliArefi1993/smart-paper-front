"use client";

import { useEffect, useRef } from "react";
import type { IdeaNote } from "@/lib/idea-notes";
import { ideaPreview, ideaRelationships } from "@/lib/idea-reader";

type Props = {
  notes: IdeaNote[];
  path: string[];
  entry: "collection" | "daily";
  isPersian: boolean;
  hasDraft: boolean;
  readFailed: boolean;
  onHop: (id: string) => void;
  onBack: () => void;
  onExit: () => void;
  onSelect: (id: string, mode: "edit" | "branch") => void;
};

export function IdeaReader({ notes, path, entry, isPersian, hasDraft, readFailed, onHop, onBack, onExit, onSelect }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const c = (en: string, fa: string) => isPersian ? fa : en;
  const { note, origin, children } = ideaRelationships(readFailed ? [] : notes, path[path.length - 1]);
  const date = (item: IdeaNote) => new Intl.DateTimeFormat(isPersian ? "fa-IR" : "en-US", { dateStyle: "medium" }).format(new Date(item.created_at));
  const button = "min-h-12 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-start font-semibold text-[var(--foreground)] hover:bg-[var(--hover-surface)]";

  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [path, note?.id, readFailed]);

  return <dialog ref={dialog} role="dialog" aria-modal="true" aria-labelledby="idea-reader-heading" aria-describedby={note ? "idea-reader-identity" : undefined}
    dir={isPersian ? "rtl" : "ltr"} onCancel={(event) => { event.preventDefault(); onBack(); }}
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const targets = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')];
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }}
    className="sp-page fixed inset-0 m-0 h-[100dvh] max-h-none w-full max-w-none border-0 bg-[var(--background)] p-0 text-[var(--foreground)]">
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-[var(--border)] px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-5xl flex-wrap gap-2">
          <button type="button" className={button} onClick={onExit}>{entry === "daily" ? c("Return to daily thought", "بازگشت به فکر روز") : c("Return to collection", "بازگشت به مجموعه")}</button>
          {path.length > 1 ? <button type="button" className={button} onClick={onBack}>{c("Back to previous thought", "بازگشت به فکر قبلی")}</button> : null}
        </div>
      </header>
      <div ref={body} tabIndex={0} role="region" aria-label={c("Saved thought and relationships", "فکر ذخیره‌شده و ارتباط‌ها")} className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
        <div className="mx-auto max-w-5xl">
          <h2 id="idea-reader-heading" ref={heading} tabIndex={-1} aria-describedby={note ? "idea-reader-identity" : undefined} className="text-2xl font-bold focus:outline-3 focus:outline-offset-4 focus:outline-[var(--primary)]">{note ? c("Saved thought", "فکر ذخیره‌شده") : c("Saved thought unavailable", "فکر ذخیره‌شده در دسترس نیست")}</h2>
          {note ? <>
            <p id="idea-reader-identity" className="sr-only">{ideaPreview(note)} · {date(note)}</p>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]"><bdi>{date(note)}</bdi></p>
            <p dir="auto" className="mt-5 whitespace-pre-wrap break-words text-lg leading-relaxed [overflow-wrap:anywhere]">{note.body}</p>
            {hasDraft ? <p className="mt-5 rounded-xl bg-[var(--surface-muted)] p-3 text-sm">{c("Your unfinished writing is unchanged.", "نوشتهٔ ناتمام شما تغییر نکرده است.")}</p> : null}
            <section className="mt-7" aria-labelledby="idea-reader-origin">
              <h3 id="idea-reader-origin" className="text-lg font-bold">{c("Original thought", "فکر اصلی")}</h3>
              {origin ? <button type="button" onClick={() => onHop(origin.id)} className={`mt-3 w-full ${button}`} aria-label={c(`Open original thought: ${ideaPreview(origin)} · ${date(origin)}`, `باز کردن فکر اصلی: ${ideaPreview(origin)} · ${date(origin)}`)}>
                <span dir="auto" className="block whitespace-pre-wrap break-words">{ideaPreview(origin)}</span><bdi className="mt-2 block text-sm font-normal text-[var(--muted-foreground)]">{date(origin)}</bdi>
              </button> : <p className="mt-3 text-[var(--muted-foreground)]">{note.parent_id === null ? c("Independent thought · no original thought", "فکر مستقل · فکر اصلی ندارد") : c("Original thought unavailable", "فکر اصلی در دسترس نیست")}</p>}
            </section>
            <section className="mt-7" aria-labelledby="idea-reader-children">
              <h3 id="idea-reader-children" className="text-lg font-bold">{c("Thoughts grown from this", "فکرهایی که از این فکر رشد کرده‌اند")}</h3>
              {children.length ? <div className="mt-3 grid gap-3">{children.map((child, index) => <button key={child.id} type="button" className={`w-full ${button}`} onClick={() => onHop(child.id)} aria-label={c(`Open grown thought ${index + 1} of ${children.length}: ${ideaPreview(child)} · ${date(child)}`, `باز کردن فکر رشدکردهٔ ${index + 1} از ${children.length}: ${ideaPreview(child)} · ${date(child)}`)}>
                <span dir="auto" className="block whitespace-pre-wrap break-words">{ideaPreview(child)}</span><bdi className="mt-2 block text-sm font-normal text-[var(--muted-foreground)]">{date(child)}</bdi>
              </button>)}</div> : <p className="mt-3 text-[var(--muted-foreground)]">{c("No thoughts have grown from this yet.", "هنوز فکری از این فکر رشد نکرده است.")}</p>}
            </section>
            <div className="mt-7 flex flex-wrap gap-3">
              <button type="button" className="min-h-12 rounded-xl bg-[var(--primary)] px-5 py-3 font-semibold text-[var(--primary-foreground)]" onClick={() => onSelect(note.id, "branch")}>{c("Grow this idea", "پرورش این ایده")}</button>
              <button type="button" className={button} onClick={() => onSelect(note.id, "edit")}>{c("Edit saved thought", "ویرایش فکر ذخیره‌شده")}</button>
            </div>
          </> : <p className="mt-5">{readFailed ? c("Saved thoughts could not be read. Return and retry loading. Your writing is unchanged.", "خواندن فکرهای ذخیره‌شده ممکن نشد. بازگردید و دوباره بارگذاری کنید. نوشتهٔ شما تغییر نکرده است.") : c("This saved thought is no longer available. Your writing is unchanged.", "این فکر ذخیره‌شده دیگر در دسترس نیست. نوشتهٔ شما تغییر نکرده است.")}</p>}
        </div>
      </div>
    </div>
  </dialog>;
}

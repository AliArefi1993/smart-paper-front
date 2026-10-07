import { isIdeaNote, readIdeaNotes, writeIdeaNotes, type IdeaNote } from "./idea-notes.ts";

export const IDEA_DRAFT_KEY = "smart-paper.local.idea-draft";
export const IDEA_DRAFT_PREFIX = "smart-paper.idea-draft.v1\n";
export type IdeaDraft = {
  version: 1;
  mode: "new" | "edit" | "branch";
  body: string;
  source: IdeaNote | null;
  // Written before the note, then reconciled against saved notes on retry/reload.
  receipt: IdeaNote | null;
};

export function newIdeaDraft(body = ""): IdeaDraft {
  return { version: 1, mode: "new", body, source: null, receipt: null };
}

export function readIdeaDraft(storage: Storage): IdeaDraft {
  const raw = storage.getItem(IDEA_DRAFT_KEY);
  if (raw === null) return newIdeaDraft();
  // A marker distinguishes contextual drafts from every kind of legacy prose,
  // including writing that starts with JSON or a checklist.
  if (!raw.startsWith(IDEA_DRAFT_PREFIX)) return newIdeaDraft(raw);
  const value: unknown = JSON.parse(raw.slice(IDEA_DRAFT_PREFIX.length));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid draft");
  const draft = value as IdeaDraft;
  if (draft.version !== 1 || !["new", "edit", "branch"].includes(draft.mode) ||
      typeof draft.body !== "string" ||
      !(draft.source === null || isIdeaNote(draft.source)) ||
      !(draft.receipt === null || isIdeaNote(draft.receipt)) ||
      (draft.mode !== "new" && draft.source === null) ||
      (draft.mode === "new" && draft.source !== null)) throw new Error("Invalid draft");
  if (draft.receipt && (draft.receipt.body !== draft.body.trim() ||
      (draft.mode === "edit" && (draft.receipt.id !== draft.source!.id || draft.receipt.created_at !== draft.source!.created_at || draft.receipt.parent_id !== draft.source!.parent_id)) ||
      (draft.mode === "branch" && draft.receipt.parent_id !== draft.source!.id) ||
      (draft.mode === "new" && draft.receipt.parent_id !== null))) throw new Error("Invalid draft receipt");
  return draft;
}

export function writeIdeaDraft(storage: Storage, draft: IdeaDraft): void {
  if (draft.mode === "new" && !draft.body && !draft.receipt) storage.removeItem(IDEA_DRAFT_KEY);
  else storage.setItem(IDEA_DRAFT_KEY, IDEA_DRAFT_PREFIX + JSON.stringify(draft));
}

export function isIdeaDraftDirty(draft: IdeaDraft): boolean {
  return draft.mode === "edit" ? draft.body !== draft.source?.body : draft.body.length > 0;
}

export class IdeaDraftCommitError extends Error {
  draft: IdeaDraft;
  recoveryFailed: boolean;
  constructor(draft: IdeaDraft, recoveryFailed: boolean) {
    super("Note could not be saved");
    this.draft = draft;
    this.recoveryFailed = recoveryFailed;
  }
}

function sameNote(a: IdeaNote, b: IdeaNote): boolean {
  return a.id === b.id && a.body === b.body && a.created_at === b.created_at &&
    a.updated_at === b.updated_at && a.parent_id === b.parent_id;
}

export function ideaDraftIssue(draft: IdeaDraft, notes: IdeaNote[]): "missing" | "conflict" | "committed" | null {
  if (draft.receipt) {
    const saved = notes.find((note) => note.id === draft.receipt!.id);
    if (saved && sameNote(saved, draft.receipt)) return "committed";
    if (saved && draft.mode !== "edit") return "conflict";
  }
  if (draft.mode === "new") return null;
  const original = notes.find((note) => note.id === draft.source!.id);
  if (!original) return "missing";
  if (draft.mode === "edit" && !sameNote(original, draft.source!)) return "conflict";
  return null;
}

export function commitIdeaDraft(storage: Storage, draft: IdeaDraft, id: string, now: string): {
  notes: IdeaNote[]; draft: IdeaDraft; cleanupFailed: boolean;
} {
  const notes = readIdeaNotes(storage);
  const issue = ideaDraftIssue(draft, notes);
  if (issue && issue !== "committed") throw new Error(issue);
  let prepared = draft;
  let saved = notes;
  if (issue !== "committed") {
    if (!draft.body.trim()) throw new Error("empty");
    const note: IdeaNote = draft.mode === "edit"
      ? { ...notes.find((item) => item.id === draft.source!.id)!, body: draft.body.trim(), updated_at: now }
      : { id: draft.receipt?.id ?? id, body: draft.body.trim(), created_at: draft.receipt?.created_at ?? now, updated_at: now, parent_id: draft.mode === "branch" ? draft.source!.id : null };
    prepared = { ...draft, receipt: note };
    // If this fails, do not publish a note whose successful commit cannot be
    // recognized after a later cleanup failure.
    const next = draft.mode === "edit" ? notes.map((item) => item.id === note.id ? note : item) : [note, ...notes];
    try { writeIdeaDraft(storage, prepared); }
    catch { throw new IdeaDraftCommitError(prepared, true); }
    try { writeIdeaNotes(storage, next); }
    catch { throw new IdeaDraftCommitError(prepared, false); }
    saved = next;
  }
  try {
    storage.removeItem(IDEA_DRAFT_KEY);
    return { notes: saved, draft: newIdeaDraft(), cleanupFailed: false };
  } catch {
    return { notes: saved, draft: prepared, cleanupFailed: true };
  }
}

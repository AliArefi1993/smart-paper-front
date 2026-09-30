export const IDEA_NOTES_KEY = "smart-paper.local.idea-notes";

export type IdeaNote = {
  id: string;
  body: string;
  created_at: string;
  updated_at: string;
  parent_id: string | null;
};

export function isIdeaNote(value: unknown): value is IdeaNote {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const note = value as Record<string, unknown>;
  return typeof note.id === "string" && note.id.length > 0 &&
    typeof note.body === "string" && note.body.trim().length > 0 &&
    typeof note.created_at === "string" && !Number.isNaN(Date.parse(note.created_at)) &&
    typeof note.updated_at === "string" && !Number.isNaN(Date.parse(note.updated_at)) &&
    (note.parent_id === null || typeof note.parent_id === "string");
}

export function validateIdeaNotes(value: unknown): asserts value is IdeaNote[] {
  if (!Array.isArray(value) || !value.every(isIdeaNote) ||
      new Set(value.map((note: IdeaNote) => note.id)).size !== value.length) {
    throw new Error("Saved idea notes are damaged. Restore from a JSON backup.");
  }
}

export function readIdeaNotes(storage: Storage): IdeaNote[] {
  const raw = storage.getItem(IDEA_NOTES_KEY);
  let notes: unknown = [];
  try {
    if (raw !== null) notes = JSON.parse(raw);
  } catch {
    throw new Error("Saved idea notes are damaged. Restore from a JSON backup.");
  }
  validateIdeaNotes(notes);
  return notes;
}

export function writeIdeaNotes(storage: Storage, notes: IdeaNote[]): void {
  validateIdeaNotes(notes);
  storage.setItem(IDEA_NOTES_KEY, JSON.stringify(notes));
}

export function mergeIdeaNotes(existing: IdeaNote[], incoming: IdeaNote[]): IdeaNote[] {
  const merged = new Map(existing.map((note) => [note.id, note]));
  for (const note of incoming) merged.set(note.id, note);
  return [...merged.values()];
}

export function restoreIdeaNotes(existing: IdeaNote[], incoming: IdeaNote[] | undefined, mode: "merge" | "replace"): IdeaNote[] {
  if (incoming === undefined) return mode === "merge" ? existing : [];
  return mode === "merge" ? mergeIdeaNotes(existing, incoming) : incoming;
}

export function dailyIdeaNote(notes: IdeaNote[], date: string): IdeaNote | null {
  const olderNotes = notes.filter((note) => {
    const created = new Date(note.created_at);
    const localDate = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")}`;
    return localDate < date;
  });
  if (olderNotes.length === 0) return null;
  const dayNumber = Math.floor(Date.parse(`${date}T12:00:00Z`) / 86400000);
  return olderNotes[((dayNumber % olderNotes.length) + olderNotes.length) % olderNotes.length];
}

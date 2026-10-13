import type { IdeaNote } from "./idea-notes.ts";

// Direct saved references only: imported loops never trigger traversal or repair.
export function ideaRelationships(notes: IdeaNote[], id: string) {
  const note = notes.find((item) => item.id === id) ?? null;
  const origin = note && note.parent_id !== note.id
    ? notes.find((item) => item.id === note.parent_id) ?? null : null;
  const children = note ? notes.filter((item) => item.id !== id && item.parent_id === id)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) : [];
  return { note, origin, children };
}

export function hopIdeaReader(path: string[], id: string): string[] {
  return [...path, id];
}

export function backIdeaReader(path: string[]): string[] {
  return path.slice(0, -1);
}

export function ideaPreview(note: IdeaNote): string {
  const text = note.body.replace(/\s+/g, " ").trim();
  return text.length > 95 ? `${text.slice(0, 95)}…` : text;
}

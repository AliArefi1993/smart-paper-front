import { registerPlugin } from "@capacitor/core";

export const SUPPORT_EMAIL = "arefi.ali90@gmail.com";
const EMAIL_SUBJECT = "Smart Paper problem report";
const MAX_EMAIL_BODY_CHARS = 131_072;

type DiagnosticEmailPlugin = {
  openDraft(options: { body: string }): Promise<void>;
};

const DiagnosticEmail = registerPlugin<DiagnosticEmailPlugin>("DiagnosticEmailPlugin");

export type DiagnosticEmailHandoff = "draft-opened" | "handoff-unconfirmed";

function encodeMailtoComponent(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function buildDiagnosticMailtoUri(content: string): string {
  assertEmailBodySize(content);
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeMailtoComponent(EMAIL_SUBJECT)}&body=${encodeMailtoComponent(content)}`;
}

function assertEmailBodySize(content: string): void {
  if (content.length > MAX_EMAIL_BODY_CHARS) {
    throw new Error("The report is too long to prepare for email.");
  }
}

export async function openDiagnosticEmail(content: string): Promise<DiagnosticEmailHandoff> {
  assertEmailBodySize(content);
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    await DiagnosticEmail.openDraft({ body: content });
    return "draft-opened";
  }

  window.location.href = buildDiagnosticMailtoUri(content);
  return "handoff-unconfirmed";
}

export async function copyDiagnosticReport(content: string): Promise<boolean> {
  assertEmailBodySize(content);
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    return false;
  }
}

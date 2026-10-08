import { formatAiReport, summarizeAiReport, type AiReportOptions } from "./ai-report.ts";
import type { ExportPayload } from "./smart-paper-types.ts";

export type AiReportPreparation =
  | { status: "ready"; source: ExportPayload; content: string }
  | { status: "changed"; source: ExportPayload; content: string }
  | { status: "empty"; source: ExportPayload }
  | { status: "no-selection"; source: ExportPayload };

export async function prepareAiReportTransfer({
  options,
  reviewedContent,
  readSource,
}: {
  options: AiReportOptions;
  reviewedContent: string;
  readSource: (includeFinance: boolean) => Promise<ExportPayload>;
}): Promise<AiReportPreparation> {
  const includeFinance = options.include.financeGoal || options.include.incomeEntries;
  const source = await readSource(includeFinance);
  const summary = summarizeAiReport(source, options);
  if (!summary.hasSelection) return { status: "no-selection", source };
  if (!summary.weeks && !summary.incomeEntries && !options.include.financeGoal) {
    return { status: "empty", source };
  }
  const content = formatAiReport(source, options);
  return content === reviewedContent
    ? { status: "ready", source, content }
    : { status: "changed", source, content };
}

export async function copyAiReportText(
  content: string,
  writeText: ((value: string) => Promise<void>) | undefined =
    typeof navigator !== "undefined" && navigator.clipboard
      ? navigator.clipboard.writeText.bind(navigator.clipboard)
      : undefined,
): Promise<boolean> {
  if (!writeText) return false;
  try {
    await writeText(content);
    return true;
  } catch {
    return false;
  }
}

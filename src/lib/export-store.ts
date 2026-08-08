import { request, requestJson } from "@/lib/api-client";
import {
  formatExportCsv,
  formatExportMarkdown,
  formatExportXlsx,
} from "@/lib/export-format";
import {
  getLocalExportPayload,
  importLocalExportPayload,
} from "@/lib/local-store";
import type { ExportPayload, ImportMode, ImportResult } from "@/lib/smart-paper-types";

export type ExportFormat = "json" | "csv" | "xlsx" | "markdown";

export type ExportFile = {
  filename: string;
  mimeType: string;
  content: BlobPart;
};

function isLocalStorageMode(): boolean {
  return process.env.NEXT_PUBLIC_DATA_MODE === "local";
}

export async function getExportPayload(): Promise<ExportPayload> {
  if (isLocalStorageMode()) {
    return getLocalExportPayload();
  }
  return requestJson<ExportPayload>("/export/", {
    credentials: "include",
  });
}

export async function getExportFile(format: ExportFormat): Promise<ExportFile> {
  if (isLocalStorageMode()) {
    const payload = await getLocalExportPayload();
    if (format === "json") {
      return {
        filename: "smart-paper-export.json",
        mimeType: "application/json",
        content: JSON.stringify(payload, null, 2),
      };
    }
    if (format === "xlsx") {
      return {
        filename: "smart-paper-export.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        content: formatExportXlsx(payload),
      };
    }
    if (format === "markdown") {
      return {
        filename: "smart-paper-ai-review.md",
        mimeType: "text/markdown",
        content: formatExportMarkdown(payload),
      };
    }
    return {
      filename: "smart-paper-export.csv",
      mimeType: "text/csv",
      content: formatExportCsv(payload),
    };
  }

  const response = await request(`/export/?format=${format}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw response;
  }
  return {
    filename:
      format === "json"
        ? "smart-paper-export.json"
        : format === "xlsx"
          ? "smart-paper-export.xlsx"
          : format === "markdown"
            ? "smart-paper-ai-review.md"
            : "smart-paper-export.csv",
    mimeType:
      format === "json"
        ? "application/json"
        : format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : format === "markdown"
            ? "text/markdown"
            : "text/csv",
    content: await response.blob(),
  };
}

export async function importExportPayload(
  payload: ExportPayload,
  mode: ImportMode,
): Promise<ImportResult> {
  if (isLocalStorageMode()) {
    return importLocalExportPayload(payload, mode);
  }

  return requestJson<ImportResult>(`/import/?mode=${mode}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

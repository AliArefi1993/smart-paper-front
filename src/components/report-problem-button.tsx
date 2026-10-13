"use client";

import { diagnosticButtonClass, useDiagnostics, useDiagnosticsCopy } from "@/components/diagnostics-root";

export function ReportProblemButton({ className }: { className?: string }) {
  const diagnostics = useDiagnostics();
  const c = useDiagnosticsCopy();
  if (process.env.NEXT_PUBLIC_DATA_MODE !== "local" || !diagnostics) return null;
  return <button type="button" className={className ?? diagnosticButtonClass}
    onClick={event => diagnostics.openReport(event.currentTarget)}>
    {c("Report a problem", "گزارش مشکل")}
  </button>;
}
